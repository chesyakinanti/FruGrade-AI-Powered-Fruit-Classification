
from pathlib import Path
import tensorflow as tf

# Lokasi model asli
MODEL_PATH = Path("models/frugrade_final_aug_ringan.keras")

# Lokasi model hasil konversi
OUTPUT_PATH = Path("models/frugrade_final_aug_ringan.tflite")

if not MODEL_PATH.is_file():
    raise FileNotFoundError(f"Model tidak ditemukan: {MODEL_PATH}")

print("TensorFlow:", tf.__version__)
print("Memuat model FruGrade...")

model = tf.keras.models.load_model(
    str(MODEL_PATH),
    compile=False
)

print("Input shape:", model.input_shape)
print("Output shape:", model.output_shape)

print("\nMemulai konversi TFLite...")

converter = tf.lite.TFLiteConverter.from_keras_model(model)

# Pertahankan representasi float32, tanpa quantization.
tflite_model = converter.convert()

OUTPUT_PATH.write_bytes(tflite_model)

print("\n=== KONVERSI BERHASIL ===")
print("File:", OUTPUT_PATH)
print("Ukuran:", round(OUTPUT_PATH.stat().st_size / (1024**2), 2), "MB")
