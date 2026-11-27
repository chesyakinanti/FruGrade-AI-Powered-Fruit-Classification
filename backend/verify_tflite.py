# Mengimpor library LiteRT, TensorFlow, NumPy, dan Pillow untuk pengujian paritas model
# === BAGIAN 1: Import Library ===
from ai_edge_litert.interpreter import Interpreter

from pathlib import Path
import json
import sys

import numpy as np
import tensorflow as tf
from PIL import Image

# === BAGIAN 2: Lokasi Model, Gambar Uji, & Daftar 12 Kelas ===
# Lokasi model
KERAS_PATH = Path("models/frugrade_final_aug_ringan.keras")
TFLITE_PATH = Path("models/frugrade_final_aug_ringan.tflite")
CLASS_PATH = Path("models/class_names.json")

# Gambar pengujian
if len(sys.argv) > 1:
    IMAGE_PATH = Path(sys.argv[1])
else:
    IMAGE_PATH = Path.home() / "Downloads" / "FruGrade_Test_Apel.jpg"

# Periksa semua file
for path in [KERAS_PATH, TFLITE_PATH, CLASS_PATH, IMAGE_PATH]:
    if not path.is_file():
        raise FileNotFoundError(f"File tidak ditemukan: {path}")

# Baca urutan kelas
with open(CLASS_PATH, "r", encoding="utf-8") as f:
    class_names = json.load(f)

# === BAGIAN 3: Preprocessing Gambar Uji (Sama seperti app.py) ===
# Preprocessing harus sama seperti backend app.py
image = Image.open(IMAGE_PATH).convert("RGB")
image = image.resize((224, 224), Image.Resampling.BILINEAR)

# Jangan dibagi 255 karena model memiliki Rescaling internal
batch = np.expand_dims(
    np.asarray(image, dtype=np.float32),
    axis=0
)

print("=== PENGUJIAN MODEL FRUGRADE ===")
print("Gambar:", IMAGE_PATH.name)
print("Input:", batch.shape)

# === BAGIAN 4: Prediksi Menggunakan Model Keras Asli ===
# 1. Prediksi menggunakan Keras
keras_model = tf.keras.models.load_model(
    str(KERAS_PATH),
    compile=False
)

keras_output = keras_model.predict(batch, verbose=0).reshape(-1)

# === BAGIAN 5: Prediksi Menggunakan Model TFLite Hasil Konversi ===
# 2. Prediksi menggunakan TFLite
interpreter = Interpreter(
    model_path=str(TFLITE_PATH),
    num_threads=2
)

interpreter.allocate_tensors()

input_detail = interpreter.get_input_details()[0]
output_detail = interpreter.get_output_details()[0]

if input_detail["dtype"] != np.float32:
    raise TypeError(
        f"Input TFLite bukan float32: {input_detail['dtype']}"
    )

interpreter.set_tensor(input_detail["index"], batch)
interpreter.invoke()

tflite_output = interpreter.get_tensor(
    output_detail["index"]
).reshape(-1)

# === BAGIAN 6: Bandingkan Hasil & Cek Kesetaraan Output ===
# 3. Bandingkan hasil
if len(keras_output) != 12 or len(tflite_output) != 12:
    raise ValueError("Output model harus memiliki 12 kelas.")

keras_index = int(np.argmax(keras_output))
tflite_index = int(np.argmax(tflite_output))

max_difference = float(
    np.max(np.abs(keras_output - tflite_output))
)

mean_difference = float(
    np.mean(np.abs(keras_output - tflite_output))
)

# Menampilkan label prediksi teratas dan mengecek kesesuaian toleransi probabilitas
print("\n=== HASIL KERAS ===")
print("Label:", class_names[keras_index])
print("Confidence:", round(float(keras_output[keras_index]) * 100, 4), "%")

print("\n=== HASIL TFLITE ===")
print("Label:", class_names[tflite_index])
print("Confidence:", round(float(tflite_output[tflite_index]) * 100, 4), "%")

print("\n=== PERBANDINGAN ===")
print("Max absolute difference:", max_difference)
print("Mean absolute difference:", mean_difference)

if keras_index == tflite_index:
    print("\nPASS: Label prediksi kedua model sama.")
else:
    print("\nWARNING: Label prediksi berbeda.")

if np.allclose(keras_output, tflite_output, rtol=1e-3, atol=1e-4):
    print("PASS: Distribusi probabilitas sesuai toleransi.")
else:
    print("WARNING: Terdapat perbedaan probabilitas yang perlu diperiksa.")
