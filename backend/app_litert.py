"""FruGrade inference API using LiteRT and the converted TFLite model.

This deployment version preserves the existing Flask API contract:
- GET /health
- POST /predict with multipart/form-data field `file`

Input preprocessing mirrors the Keras version that was verified locally:
RGB, bilinear resize to 224x224, float32 pixel values in [0, 255].
The converted model includes the original Rescaling(1./255) layer, so this
API must not normalize the image a second time.
"""
# === BAGIAN 1: Memanggil Library ===
from __future__ import annotations

import io
import os
import threading
import time
from pathlib import Path

import numpy as np
from ai_edge_litert.interpreter import Interpreter
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge

# === BAGIAN 2: Pengaturan Lokasi Model, Batas Upload, & Daftar 12 Kelas ===
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "frugrade_final_aug_ringan.tflite"
MODEL_PATH = Path(
    os.getenv("FRUGRADE_TFLITE_PATH", str(DEFAULT_MODEL_PATH))
).expanduser()

IMAGE_SIZE = (224, 224)
MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# Urutan kelas ini HARUS sama persis dengan urutan saat training CNN di Colab
CLASS_NAMES = [
    "FreshApple",
    "FreshBanana",
    "FreshMango",
    "FreshOrange",
    "FreshStrawberry",
    "FreshTomato",
    "RottenApple",
    "RottenBanana",
    "RottenMango",
    "RottenOrange",
    "RottenStrawberry",
    "RottenTomato",
]

# Kamus untuk mengubah nama buah di label model menjadi kunci huruf kecil untuk frontend
FRUIT_NAMES = {
    "Apple": "apple",
    "Banana": "banana",
    "Mango": "mango",
    "Orange": "orange",
    "Strawberry": "strawberry",
    "Tomato": "tomato",
}

# === BAGIAN 3: Setup Flask, CORS, & Pengaman Akses Model ===
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRUGRADE_CORS_ORIGINS",
        "http://127.0.0.1:4321,http://localhost:4321,http://127.0.0.1:5500,http://localhost:5500",
    ).split(",")
    if origin.strip()
]
CORS(
    app,
    resources={
        r"/predict": {"origins": allowed_origins},
        r"/health": {"origins": allowed_origins},
    },
)

# Variabel penyimpanan model di memori (awalnya masih kosong / None
_interpreter = None
_input_detail = None
_output_detail = None
_model_lock = threading.Lock()      # Kunci agar proses load model tidak dobel jika ada 2 request barengan
_inference_lock = threading.Lock()  # Kunci agar prediksi jalan antre satu per satu (LiteRT tidak boleh tabrakan)


# Error khusus saat file model tidak ada atau gagal dimuat
class ModelUnavailable(RuntimeError):
    """Raised when the TFLite checkpoint cannot be found or loaded safely."""


# === BAGIAN 4: Fungsi Memuat Model .tflite Sekali Saja (Lazy Loading) ===
def _load_model_once():
    """Create and validate one LiteRT interpreter per worker process."""
    global _interpreter, _input_detail, _output_detail

 # [Cek cepat] Kalau model sudah pernah dimuat sebelumnya, langsung pakai yang sudah ada
    if _interpreter is not None:
        return _interpreter

    with _model_lock:
        if _interpreter is not None:
            return _interpreter

        if not MODEL_PATH.is_file():
            raise ModelUnavailable(
                f"Model TFLite tidak ditemukan: {MODEL_PATH}. "
                "Letakkan frugrade_final_aug_ringan.tflite di backend/models/."
            )

        try:
            thread_count = max(1, int(os.getenv("FRUGRADE_LITERT_THREADS", "1")))
            interpreter = Interpreter(
                model_path=str(MODEL_PATH),
                num_threads=thread_count,
            )
            interpreter.allocate_tensors()

            input_details = interpreter.get_input_details()
            output_details = interpreter.get_output_details()
            if len(input_details) != 1:
                raise ValueError(
                    f"Model harus memiliki satu input, ditemukan {len(input_details)}."
                )
            if len(output_details) != 1:
                raise ValueError(
                    f"Model harus memiliki satu output, ditemukan {len(output_details)}."
                )

            input_detail = input_details[0]
            output_detail = output_details[0]
            input_shape = tuple(int(value) for value in input_detail["shape"])
            output_shape = tuple(int(value) for value in output_detail["shape"])

            if len(input_shape) != 4 or input_shape[1:] != (224, 224, 3):
                raise ValueError(
                    "Input TFLite harus berbentuk (1, 224, 224, 3), "
                    f"ditemukan {input_shape}."
                )
            if input_shape[0] != 1:
                raise ValueError(
                    f"Batch input TFLite harus 1, ditemukan {input_shape[0]}."
                )
            if np.dtype(input_detail["dtype"]) != np.dtype(np.float32):
                raise ValueError(
                    "Model TFLite harus menerima float32, "
                    f"ditemukan {input_detail['dtype']}."
                )
            if len(output_shape) != 2 or output_shape[-1] != len(CLASS_NAMES):
                raise ValueError(
                    "Output TFLite harus memiliki bentuk (1, 12), "
                    f"ditemukan {output_shape}."
                )

            _interpreter = interpreter
            _input_detail = input_detail
            _output_detail = output_detail
            print(
                "[FruGrade] LiteRT model loaded:", MODEL_PATH.name,
                "| input:", input_shape,
                "| output:", output_shape,
                "| threads:", thread_count,
            )
            return _interpreter

        except Exception as exc:
            raise ModelUnavailable(
                f"Model TFLite gagal dimuat atau tidak sesuai: {exc}"
            ) from exc


# === BAGIAN 5: Fungsi Menjalankan Prediksi (Inference) ke Model .tflite ===
def _run_inference(batch: np.ndarray) -> np.ndarray:
    """Run one prediction safely and return a detached output array."""
    interpreter = _load_model_once()
    if _input_detail is None or _output_detail is None:
        raise ModelUnavailable("Detail tensor model belum tersedia.")

# Kunci agar hanya 1 prediksi berjalan pada satu waktu
    with _inference_lock:
        interpreter.set_tensor(      # 1. Masukkan array gambar (1, 224, 224, 3) ke slot input model
            _input_detail["index"],
            np.asarray(batch, dtype=np.float32),
        )
        interpreter.invoke()        # 2. Jalankan perhitungan CNN di dalam model TFLite
        raw_output = interpreter.get_tensor(_output_detail["index"])    # 3. Ambil hasil 12 skor probabilitas dari slot output model

    return np.asarray(raw_output, dtype=np.float64).reshape(-1)   # Ubah bentuk dari (1, 12) menjadi daftar datar berisi 12 angka (12,)


# === BAGIAN 6: Helper Pesan Error & Preprocessing Gambar ===
def _json_error(code: str, message: str, status: int):
    return jsonify({"ok": False, "code": code, "message": message}), status


# Mendekode berkas gambar, cek dimensi minimal, dan resize ke 224x224 float32
def _decode_and_preprocess(file_bytes: bytes) -> np.ndarray:
    """Decode RGB image and resize exactly like the verified Keras pipeline."""
    try:
        # Buka ke-1: cek apakah struktur file gambar utuh atau rusak/korup
        with Image.open(io.BytesIO(file_bytes)) as source:
            source.verify()
        # Buka ke-2: wajib dibuka ulang setelah verify(), lalu cek ukuran & resize
        with Image.open(io.BytesIO(file_bytes)) as source:
            width, height = source.size
            if width < 64 or height < 64:
                raise ValueError("Dimensi gambar minimal 64 × 64 piksel.")
            image = source.convert("RGB")    # Pastikan 3 channel warna
            resampling = getattr(Image, "Resampling", Image).BILINEAR   # Resize ke 224 x 224 pakai metode Bilinear
            image = image.resize(IMAGE_SIZE, resample=resampling)
            image_array = np.asarray(image, dtype=np.float32)   # Ubah gambar jadi matriks angka 0..255
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValueError(
            "Gambar tidak dapat dibaca. Pilih file JPG, JPEG, atau PNG yang valid."
        ) from exc

    if image_array.shape != (224, 224, 3):
        raise ValueError(
            f"Ukuran hasil preprocessing tidak sesuai: {image_array.shape}"
        )

    # Keep raw 0..255 pixel values. Rescaling(1./255) is inside the TFLite model.
    return np.expand_dims(image_array, axis=0)


# === BAGIAN 7: Memecah Label Kelas Menjadi Jenis Buah & Status Kesegaran ===
def _class_details(class_name: str) -> tuple[str, str]:
    if class_name.startswith("Fresh"):
        freshness = "fresh"
        fruit_name = class_name[len("Fresh"):]  # Misal "FreshApple" -> "Apple"
    elif class_name.startswith("Rotten"):
        freshness = "rotten"
        fruit_name = class_name[len("Rotten"):] # Misal "RottenMango" -> "Mango"
    else:
        raise ValueError(f"Label kelas tidak dikenal: {class_name}")

    fruit_key = FRUIT_NAMES.get(fruit_name) # "Apple" -> "apple"
    if not fruit_key:
        raise ValueError(f"Jenis buah tidak dikenal pada label: {class_name}")
    return fruit_key, freshness


# === BAGIAN 8: Endpoint Cek Kesehatan Server (/health) ===
@app.get("/health")
def health():
    try:
        loaded = _load_model_once()
        return jsonify({
            "ok": True,
            "status": "ready",
            "model_loaded": loaded is not None,
            "model_file": MODEL_PATH.name,
            "runtime": "LiteRT",
            "input_shape": [1, 224, 224, 3],
            "classes_count": len(CLASS_NAMES),
        }), 200
    except ModelUnavailable as exc:
        return jsonify({
            "ok": False,
            "status": "not_ready",
            "model_loaded": False,
            "model_file": MODEL_PATH.name,
            "runtime": "LiteRT",
            "code": "MODEL_NOT_READY",
            "message": str(exc),
        }), 503

# === BAGIAN 9: Endpoint Utama Prediksi Buah (POST /predict) untuk menerima unggahan gambar dan mengembalikan hasil prediksi ===
@app.post("/predict")
def predict():
    # --- [9.1] Cek apakah ada file yang dikirim di field 'file' ---
    uploaded = request.files.get("file")
    if uploaded is None:
        return _json_error(
            "NO_FILE", "File gambar belum dikirim (field: file).", 400
        )

    # --- [9.2] Cek ekstensi file harus .jpg, .jpeg, atau .png ---
    filename = uploaded.filename or ""
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return _json_error(
            "INVALID_FORMAT", "Gunakan gambar JPG, JPEG, atau PNG.", 415
        )
    # --- [9.3] Baca isi byte file & cek agar tidak kosong atau > 10 MB ---
    file_bytes = uploaded.read(MAX_FILE_BYTES + 1)
    if not file_bytes:
        return _json_error("EMPTY_FILE", "File gambar kosong.", 400)
    if len(file_bytes) > MAX_FILE_BYTES:
        return _json_error(
            "FILE_TOO_LARGE", "Ukuran gambar maksimal 10 MB.", 413
        )

    # --- [9.4] Validasi gambar asli & ubah ukuran jadi (1, 224, 224, 3) ---
    try:
        batch = _decode_and_preprocess(file_bytes)
    except ValueError as exc:
        return _json_error("UNREADABLE_IMAGE", str(exc), 422)

    # --- [9.5] Pastikan model .tflite sudah siap di memori ---
    try:
        _load_model_once()
    except ModelUnavailable as exc:
        return _json_error("MODEL_NOT_READY", str(exc), 503)

    # --- [9.6] Jalankan prediksi & catat waktunya (latency) ---
    started = time.perf_counter()
    try:
        scores = _run_inference(batch)
    # Pastikan keluaran benar-benar 12 angka probabilitas softmax yang jumlahnya ≈ 1.0
        if scores.shape != (len(CLASS_NAMES),):
            return _json_error(
                "BAD_MODEL_OUTPUT",
                f"Model mengembalikan {scores.size} skor; seharusnya 12.",
                500,
            )
        if not np.all(np.isfinite(scores)):
            return _json_error(
                "BAD_MODEL_OUTPUT",
                "Output model mengandung nilai tidak valid.",
                500,
            )
        if (
            np.any(scores < 0.0)
            or np.any(scores > 1.0)
            or not np.isclose(scores.sum(), 1.0, atol=1e-3)
        ):
            return _json_error(
                "BAD_MODEL_OUTPUT",
                "Output model bukan probabilitas softmax yang valid. "
                "Periksa model TFLite hasil konversi.",
                500,
            )
    except ModelUnavailable as exc:
        return _json_error("MODEL_NOT_READY", str(exc), 503)
    except Exception as exc:
        app.logger.exception("LiteRT inference failed")
        return _json_error(
            "PREDICTION_FAILED",
            f"Model gagal memproses gambar: {exc}",
            500,
        )

    # --- [9.7] Urutkan 5 kelas dengan skor tertinggi & ambil pemenangnya --
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    top_indices = np.argsort(scores)[::-1][:5]  # Urutkan indeks dari terbesar ke terkecil, ambil 5 teratas
    predicted_index = int(top_indices[0])       # Urutkan indeks dari terbesar ke terkecil, ambil 5 teratas
    predicted_label = CLASS_NAMES[predicted_index]

    try:
        fruit, freshness = _class_details(predicted_label)
    except ValueError as exc:
        app.logger.exception("Class mapping failed")
        return _json_error("CLASS_MAPPING_FAILED", str(exc), 500)

    probabilities = [
        {"label": CLASS_NAMES[int(index)], "p": float(scores[int(index)])}
        for index in top_indices
    ]

    # --- [9.8] Kirim balasan JSON sukses ke frontend ---
    return jsonify({
        "ok": True,
        "fruit": fruit,
        "freshness": freshness,
        "label": predicted_label,
        "confidence": float(scores[predicted_index]),
        "probabilities": probabilities,
        "latency_ms": latency_ms,
        "model": "Custom CNN (TensorFlow / Keras) — Final Augmentation",
        "runtime": "LiteRT",
        "mock": False,
    }), 200


# === BAGIAN 10: Handler File Terlalu Besar & Entry Point Server Lokal ===
@app.errorhandler(RequestEntityTooLarge)
def handle_too_large(_error):
    return _json_error(
        "FILE_TOO_LARGE", "Ukuran gambar maksimal 10 MB.", 413
    )


# Titik masuk utama untuk menjalankan server Flask LiteRT lokal pada port 5001
if __name__ == "__main__":
    print("FruGrade LiteRT API starting at http://127.0.0.1:5001")
    print("Model checkpoint:", MODEL_PATH)
    app.run(host="127.0.0.1", port=5001, debug=False, threaded=True)
