"""Verify the temporary FruGrade Keras checkpoint before starting the API."""
from pathlib import Path
import os

import tensorflow as tf

# Menentukan path file model Keras yang akan dicek serta daftar 12 kelas target
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "frugrade_final_aug_ringan.keras"
if not DEFAULT_MODEL_PATH.is_file():
    DEFAULT_MODEL_PATH = BASE_DIR / "models" / "frugrade_aug.keras"

MODEL_PATH = Path(os.getenv("FRUGRADE_MODEL_PATH", str(DEFAULT_MODEL_PATH))).expanduser()

CLASS_NAMES = [
    "FreshApple", "FreshBanana", "FreshMango", "FreshOrange", "FreshStrawberry", "FreshTomato",
    "RottenApple", "RottenBanana", "RottenMango", "RottenOrange", "RottenStrawberry", "RottenTomato",
]

if not MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Model tidak ditemukan: {MODEL_PATH}\n"
        "Simpan frugrade_aug.keras ke backend/models/ terlebih dahulu."
    )

# Memuat file .keras dan memvalidasi bentuk input (224x224x3) serta output (12 kelas)
print("TensorFlow version:", tf.__version__)
print("Loading:", MODEL_PATH)
model = tf.keras.models.load_model(str(MODEL_PATH), compile=False)

print("Input shape:", model.input_shape)
print("Output shape:", model.output_shape)

assert model.input_shape == (None, 224, 224, 3), model.input_shape
assert model.output_shape == (None, 12), model.output_shape
assert len(CLASS_NAMES) == model.output_shape[-1]

# Memastikan layer Rescaling(1./255) sudah terpasang di dalam model
rescaling = [
    layer for layer in model.layers
    if isinstance(layer, tf.keras.layers.Rescaling)
]
assert any(abs(float(layer.scale) - 1 / 255) < 1e-8 for layer in rescaling), (
    "Layer Rescaling(1./255) tidak ditemukan; tinjau pipeline preprocessing."
)

print("Rescaling(1./255): ditemukan")
print("Jumlah kelas:", len(CLASS_NAMES))
print("Urutan kelas:")
for i, name in enumerate(CLASS_NAMES):
    print(f"{i}: {name}")
print("\nMODEL CHECK: PASS")
