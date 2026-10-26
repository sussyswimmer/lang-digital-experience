"""Bakes the nón bài thơ silhouettes onto the poem-art shell's UV layout → blender/textures/poem_art.png.

The poem shell (nonla_build.build_shell "poem_art") wraps the whole cone between rings 12 and 3 with
u = azimuth / 2π (front of the hat at u = 0.75) and v = 0 at ring 3 → 1 at ring 12. A flat picture
pasted straight into that rectangle would be squeezed towards the tip, so each texel is mapped back
through the unrolled cone (a flat sector: radius = slant distance, angle = azimuth · sin(half-apex))
and the artwork is sampled there, upright and undistorted, centred on the front.

    python3 blender/poem_texture.py [raw-assets/higgsfield/art/poem-silhouettes.png]

Plain numpy + Pillow (no bpy), so it runs anywhere. The geometry constants must match nonla_build.P.
"""

import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "raw-assets", "higgsfield", "art", "poem-silhouettes.png")
OUT = os.path.join(HERE, "textures", "poem_art.png")

# nonla_build.P: 48 cm brim, 21 cm tall, rings 2 cm apart along the slant, poem shell from ring 12 to ring 3
R, H, PITCH = 0.48 / 2, 0.21, 0.020
L = math.hypot(R, H)
SIN_A = R / L
S_BRIM_SIDE, S_TIP_SIDE = L - 2 * PITCH, L - 11 * PITCH  # ring 3, ring 12 (slant distance from the tip)
U_FRONT = 0.75

TEX_W, TEX_H = 4096, 1024
INK = (0x2B, 0x1B, 0x10)  # dark paper-cut brown, as in the placeholder
ART_HEIGHT = 0.80  # fraction of the shell's slant span the artwork fills


def artwork_alpha(path):
    """Ink coverage (0..1) of the artwork, cropped to its content."""
    g = np.asarray(Image.open(path).convert("L"), dtype=np.float32) / 255.0
    ink = np.clip((0.88 - g) / 0.6, 0.0, 1.0)  # white paper → 0, dark brown → 1
    ys, xs = np.nonzero(ink > 0.05)
    return ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def bilinear(img, x, y):
    h, w = img.shape
    inside = (x >= 0) & (x <= w - 1) & (y >= 0) & (y <= h - 1)
    x, y = np.clip(x, 0, w - 1), np.clip(y, 0, h - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = x - x0, y - y0
    top = img[y0, x0] * (1 - fx) + img[y0, x1] * fx
    bot = img[y1, x0] * (1 - fx) + img[y1, x1] * fx
    return np.where(inside, top * (1 - fy) + bot * fy, 0.0)


def main():
    art = artwork_alpha(SRC)
    ah, aw = art.shape
    span = S_BRIM_SIDE - S_TIP_SIDE
    art_h = span * ART_HEIGHT  # metres along the slant
    art_w = art_h * aw / ah
    s_mid = (S_BRIM_SIDE + S_TIP_SIDE) / 2

    # texel centres → (s, azimuth) → unrolled-cone coordinates (x across, y down the slant)
    u = (np.arange(TEX_W) + 0.5) / TEX_W
    v = 1.0 - (np.arange(TEX_H) + 0.5) / TEX_H  # PNG row 0 is v = 1 (ring 12, towards the tip)
    uu, vv = np.meshgrid(u, v)
    s = S_BRIM_SIDE + vv * (S_TIP_SIDE - S_BRIM_SIDE)
    phi = (uu - U_FRONT) * math.tau * SIN_A
    x = s * np.sin(phi)
    y = s * np.cos(phi)

    ax = (x / art_w + 0.5) * (aw - 1)
    ay = ((y - (s_mid - art_h / 2)) / art_h) * (ah - 1)  # artwork top towards the tip
    alpha = bilinear(art, ax, ay)

    rgba = np.zeros((TEX_H, TEX_W, 4), dtype=np.uint8)
    rgba[..., :3] = INK
    rgba[..., 3] = np.round(np.clip(alpha, 0, 1) * 0.95 * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(OUT, optimize=True)
    print(f"{OUT}: {TEX_W}x{TEX_H}, artwork {art_w * 100:.1f} x {art_h * 100:.1f} cm on the front of the hat")


if __name__ == "__main__":
    main()
