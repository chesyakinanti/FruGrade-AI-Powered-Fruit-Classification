"""FruGrade inference API (Flask + TensorFlow/Keras).

The model is loaded once, on the first /health or /predict request.
Input contract: one JPG/JPEG/PNG image, decoded as RGB, resized to 224x224.
Pixel values are intentionally kept in [0, 255] because the model itself
contains Rescaling(1./255). Do not normalize a second time here.
"""
# === BAGIAN 1: Import Library ===
from __future__ import annotations

import io
import os
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge

# Lokasi file model Keras dan batas validasi berkas gambar
# === BAGIAN 2: Pengaturan Lokasi Model, Batas Upload, & Daftar 12 Kelas ===
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "frugrade_final_aug_ringan.keras"
MODEL_PATH = Path(os.getenv("FRUGRADE_MODEL_PATH", str(DEFAULT_MODEL_PATH))).expanduser()

IMAGE_SIZE = (224, 224)
MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# This exact order follows train_ds.class_names from Muti's training notebook.
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

# Pemetaan nama buah Inggris (dari label kelas) ke kunci buah frontend
FRUIT_NAMES = {
    "Apple": "apple",
    "Banana": "banana",
    "Mango": "mango",
    "Orange": "orange",
    "Strawberry": "strawberry",
    "Tomato": "tomato",
}

# Inisialisasi server Flask dan konfigurasi CORS untuk origin yang diizinkan
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
CORS(app, resources={r"/predict": {"origins": allowed_origins}, r"/health": {"origins": allowed_origins}})

# Variabel global model Keras dan lock agar pemuatan aman dari banyak request
_model: Any | None = None
_model_lock = threading.Lock()
_model_error: str | None = None


# Error khusus saat file checkpoint Keras tidak ditemukan atau gagal dimuat
class ModelUnavailable(RuntimeError):
    """Raised when the checkpoint cannot be found or loaded safely."""


# Memuat serta memvalidasi bentuk input/output dan layer Rescaling model Keras
# === BAGIAN 4: Memuat Model .keras Sekali Saja (Lazy Loading) ===
def _load_model_once():
    """Load and validate the Keras model once per backend process."""
    global _model, _model_error
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model
        if not MODEL_PATH.is_file():
            raise ModelUnavailable(
                f"Checkpoint tidak ditemukan: {MODEL_PATH}. "
                "Letakkan frugrade_final_aug_ringan.keras di backend/models/."
            )

        try:
            import tensorflow as tf

            loaded = tf.keras.models.load_model(str(MODEL_PATH), compile=False)
            input_shape = loaded.input_shape
            output_shape = loaded.output_shape

            if isinstance(input_shape, list) or len(input_shape) != 4:
                raise ValueError(f"Bentuk input model tidak didukung: {input_shape}")
            if tuple(input_shape[1:]) != (224, 224, 3):
                raise ValueError(
                    f"Input model harus (None, 224, 224, 3), ditemukan {input_shape}"
                )
            if isinstance(output_shape, list) or output_shape[-1] != len(CLASS_NAMES):
                raise ValueError(
                    f"Output model harus memiliki 12 kelas, ditemukan {output_shape}"
                )

            # Check the known normalization layer. Its presence means the API
            # must pass raw 0..255 pixels and must NOT divide by 255 again.
            rescaling_layers = [
                layer for layer in loaded.layers
                if isinstance(layer, tf.keras.layers.Rescaling)
            ]
            if not any(abs(float(layer.scale) - (1.0 / 255.0)) < 1e-8 for layer in rescaling_layers):
                raise ValueError(
                    "Layer Rescaling(1./255) tidak ditemukan. Periksa pipeline model "
                    "sebelum mengaktifkan prediksi live."
                )

            _model = loaded
            _model_error = None
            print(
                "[FruGrade] Model loaded:", MODEL_PATH.name,
                "| input:", input_shape,
                "| output:", output_shape,
            )
            return _model
        except Exception as exc:  # keep the server alive and return a useful API error
            _model_error = str(exc)
            raise ModelUnavailable(f"Model gagal dimuat atau tidak sesuai: {exc}") from exc


# Membentuk respons JSON standar ketika permintaan gagal
# === BAGIAN 5: Helper Pesan Error & Preprocessing Gambar 224x224 ===
def _json_error(code: str, message: str, status: int):
    return jsonify({"ok": False, "code": code, "message": message}), status


# Mendekode gambar, mengecek dimensi minimal, dan resize menjadi 224x224 float32
def _decode_and_preprocess(file_bytes: bytes) -> np.ndarray:
    """Decode to RGB and resize exactly like the training image pipeline.

    Muti's image_dataset_from_directory used 224x224 with bilinear resize.
    The model has an internal Rescaling(1./255) layer, so this function returns
    float32 pixels in the 0..255 range without additional normalization.
    """
    try:
        with Image.open(io.BytesIO(file_bytes)) as source:
            source.verify()
        with Image.open(io.BytesIO(file_bytes)) as source:
            width, height = source.size
            if width < 64 or height < 64:
                raise ValueError("Dimensi gambar minimal 64 × 64 piksel.")
            image = source.convert("RGB")
            resampling = getattr(Image, "Resampling", Image).BILINEAR
            image = image.resize(IMAGE_SIZE, resample=resampling)
            image_array = np.asarray(image, dtype=np.float32)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValueError("Gambar tidak dapat dibaca. Pilih file JPG, JPEG, atau PNG yang valid.") from exc

    if image_array.shape != (224, 224, 3):
        raise ValueError(f"Ukuran hasil preprocessing tidak sesuai: {image_array.shape}")

    # Add batch dimension. Do not divide by 255; model's Rescaling layer handles it.
    return np.expand_dims(image_array, axis=0)


# Memisahkan label kelas (mis. FreshApple) menjadi nama buah dan kondisi kesegaran
# === BAGIAN 6: Memecah Label Kelas Menjadi Jenis Buah & Kesegaran ===
def _class_details(class_name: str) -> tuple[str, str]:
    if class_name.startswith("Fresh"):
        freshness = "fresh"
        fruit_name = class_name[len("Fresh"):]
    elif class_name.startswith("Rotten"):
        freshness = "rotten"
        fruit_name = class_name[len("Rotten"):]
    else:
        raise ValueError(f"Label kelas tidak dikenal: {class_name}")

    fruit_key = FRUIT_NAMES.get(fruit_name)
    if not fruit_key:
        raise ValueError(f"Jenis buah tidak dikenal pada label: {class_name}")
    return fruit_key, freshness


# Endpoint GET /health untuk memeriksa status server dan kesiapan model Keras
# === BAGIAN 7: Endpoint Cek Kesehatan Server (/health) ===
@app.get("/health")
def health():
    try:
        loaded = _load_model_once()
        return jsonify({
            "ok": True,
            "status": "ready",
            "model_loaded": loaded is not None,
            "model_file": MODEL_PATH.name,
            "input_shape": [None, 224, 224, 3],
            "classes_count": len(CLASS_NAMES),
        }), 200
    except ModelUnavailable as exc:
        return jsonify({
            "ok": False,
            "status": "not_ready",
            "model_loaded": False,
            "model_file": MODEL_PATH.name,
            "code": "MODEL_NOT_READY",
            "message": str(exc),
        }), 503


# Endpoint POST /predict untuk menerima unggahan gambar dan memprediksi lewat Keras
# === BAGIAN 8: Endpoint Utama Prediksi Buah (POST /predict) ===
@app.post("/predict")
def predict():
    uploaded = request.files.get("file")
    if uploaded is None:
        return _json_error("NO_FILE", "File gambar belum dikirim (field: file).", 400)

    filename = uploaded.filename or ""
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return _json_error("INVALID_FORMAT", "Gunakan gambar JPG, JPEG, atau PNG.", 415)

    file_bytes = uploaded.read(MAX_FILE_BYTES + 1)
    if not file_bytes:
        return _json_error("EMPTY_FILE", "File gambar kosong.", 400)
    if len(file_bytes) > MAX_FILE_BYTES:
        return _json_error("FILE_TOO_LARGE", "Ukuran gambar maksimal 10 MB.", 413)

    try:
        batch = _decode_and_preprocess(file_bytes)
    except ValueError as exc:
        return _json_error("UNREADABLE_IMAGE", str(exc), 422)

    try:
        model = _load_model_once()
    except ModelUnavailable as exc:
        return _json_error("MODEL_NOT_READY", str(exc), 503)

    started = time.perf_counter()
    try:
        raw_output = model.predict(batch, verbose=0)
        scores = np.asarray(raw_output, dtype=np.float64).reshape(-1)
        if scores.shape != (len(CLASS_NAMES),):
            return _json_error(
                "BAD_MODEL_OUTPUT",
                f"Model mengembalikan {scores.size} skor; seharusnya 12.",
                500,
            )
        if not np.all(np.isfinite(scores)):
            return _json_error("BAD_MODEL_OUTPUT", "Output model mengandung nilai tidak valid.", 500)
        if np.any(scores < 0.0) or np.any(scores > 1.0) or not np.isclose(scores.sum(), 1.0, atol=1e-3):
            return _json_error(
                "BAD_MODEL_OUTPUT",
                "Output model bukan probabilitas softmax yang valid. Periksa layer output model.",
                500,
            )
    except Exception as exc:
        app.logger.exception("Inference failed")
        return _json_error("PREDICTION_FAILED", f"Model gagal memproses gambar: {exc}", 500)

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    top_indices = np.argsort(scores)[::-1][:5]
    predicted_index = int(top_indices[0])
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

    return jsonify({
        "ok": True,
        "fruit": fruit,
        "freshness": freshness,
        "label": predicted_label,
        "confidence": float(scores[predicted_index]),  # 0..1, frontend formats as percent
        "probabilities": probabilities,
        "latency_ms": latency_ms,
        "model": "Custom CNN (TensorFlow / Keras) — Final Augmentation",
        "mock": False,
    }), 200


# Handler error jika ukuran berkas unggahan melebihi batas maksimal 10 MB
# === BAGIAN 9: Handler File Kebesaran (413) & Server Lokal Port 5000 ===
@app.errorhandler(RequestEntityTooLarge)
def handle_too_large(_error):
    return _json_error("FILE_TOO_LARGE", "Ukuran gambar maksimal 10 MB.", 413)


# Titik masuk utama untuk menjalankan server Flask Keras lokal pada port 5000
if __name__ == "__main__":
    print("FruGrade API starting at http://127.0.0.1:5000")
    print("Model checkpoint:", MODEL_PATH)
    app.run(host="127.0.0.1", port=5000, debug=False)
