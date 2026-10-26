"""Builds the hat's leaf textures from photographic palm-leaf scans (Higgsfield, upscaled to 4K).

    python3 blender/leaf_textures.py

Inputs  raw-assets/higgsfield/textures/leaf-outer-4k.jpg  fine parallel veins (outer leaf panels)
        raw-assets/higgsfield/textures/leaf-inner-4k.jpg  overlapping leaves (inner shell)
Outputs blender/textures/leaf_atlas.png         4096×2048: 8 leaves side by side, veins running down (v)
        blender/textures/leaf_atlas_normal.png  2048×1024 tangent-space normal map from the vein relief
        blender/textures/leaf_inner.png         2048×1024, the inner shell (u = around the hat)
        blender/textures/leaf_inner_normal.png  1024×512

nonla_build.py uses these when they exist (its procedural textures are the fallback). Plain numpy + Pillow.
"""

import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "raw-assets", "higgsfield", "textures")
OUT = os.path.join(HERE, "textures")


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB"), dtype=np.float32) / 255.0


def resize(arr, w, h):
    return np.asarray(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS),
                      dtype=np.float32) / 255.0


def save(arr, name):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), optimize=True)


def normal_map(rgb, w, h, strength):
    """Tangent-space normals from the fine relief: luminance minus its blur, so only veins and fibres count."""
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    img = Image.fromarray((lum * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    hi = np.asarray(img, dtype=np.float32) - np.asarray(img.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)
    hi /= 255.0
    dx = np.roll(hi, -1, 1) - np.roll(hi, 1, 1)
    dy = np.roll(hi, -1, 0) - np.roll(hi, 1, 0)
    n = np.dstack([-dx * strength, dy * strength, np.ones_like(hi)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def leaf_atlas():
    src = load("leaf-outer-4k.jpg")  # portrait, veins vertical
    sh, sw = src.shape[:2]
    rng = np.random.default_rng(7)
    W, H, N = 4096, 2048, 8
    cw = W // N
    out = np.zeros((H, W, 3), dtype=np.float32)
    crop_w = int(sh / 5)  # one leaf is about 1:5 (6 cm wide at the brim, 30 cm long)
    for k in range(N):
        x0 = int(rng.uniform(0, sw - crop_w))
        strip = resize(src[:, x0:x0 + crop_w], cw, H)
        if k % 2:
            strip = strip[::-1]  # neighbouring leaves run tip-to-base differently, like the real hat
        x = np.linspace(0, 1, cw, dtype=np.float32)[None, :]
        y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
        tint = 1 + rng.uniform(-0.035, 0.035, 3).astype(np.float32)          # leaf-to-leaf colour variation
        edge = 1 - 0.06 * np.exp(-np.minimum(x, 1 - x) / 0.025)               # overlap shading at the leaf edges
        brim = 0.97 + 0.03 * (1 - y)                                          # slightly darker towards the brim
        out[:, k * cw:(k + 1) * cw] = strip * tint * (edge * brim)[..., None]
    # the scan is near-white; graded towards sun-dried straw so lit faces don't blow out
    out *= np.array([0.94, 0.87, 0.72], dtype=np.float32)
    save(out, "leaf_atlas.png")
    save(normal_map(out, 2048, 1024, 6.0), "leaf_atlas_normal.png")


def leaf_inner():
    src = load("leaf-inner-4k.jpg")
    # paler and calmer than the outside: the inner shell is seen through the frame and in the peel
    grey = src.mean(axis=2, keepdims=True)
    src = np.clip((src * 0.75 + grey * 0.25) * np.array([0.95, 0.9, 0.78], dtype=np.float32), 0, 1)
    tile = resize(src, 512, 1024)
    tiles = [tile if i % 2 == 0 else tile[:, ::-1] for i in range(4)]  # mirrored so the seams match
    out = np.concatenate(tiles, axis=1)
    save(out, "leaf_inner.png")
    save(normal_map(out, 1024, 512, 4.0), "leaf_inner_normal.png")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    leaf_atlas()
    leaf_inner()
    print("leaf textures →", OUT)
