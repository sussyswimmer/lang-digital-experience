"""Placeholder frames for the landing page's scroll-scrubbed intro (public/assets/scroll/).

The final frames come from the full INTRO render on the PC (Blender, OptiX) plus EffectCraft's
INTRO_SCROLL effects. Until then this renders the same keyed INTRO timeline (blender/render_jobs.py)
as a short, low-sample CPU sequence, lays it over a warm background with a few light effects, and
encodes WebP frames with sharp, so the landing works end to end today.

    python3 tools/assets/make-scroll-placeholder.py                     # 48 frames, 960×540, 10 spp
    python3 tools/assets/make-scroll-placeholder.py --frames 32 --samples 8
    python3 tools/assets/make-scroll-placeholder.py --skip-render       # re-composite + re-encode only

Writes public/assets/scroll/{960,1600}/f_0001.webp … and public/assets/scroll/manifest.json.
The final frames replace these by filename; update manifest.json's "count" (and drop "placeholder").
"""

import argparse
import json
import math
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ap = argparse.ArgumentParser()
ap.add_argument("--frames", type=int, default=48)
ap.add_argument("--samples", type=int, default=10)
ap.add_argument("--work", default=os.path.join(ROOT, "renders-scratch", "scroll-placeholder"))
ap.add_argument("--out", default=os.path.join(ROOT, "public", "assets", "scroll"))
ap.add_argument("--skip-render", action="store_true")
ap.add_argument("--skip-existing", action="store_true")
ap.add_argument("--threads", type=int, default=0, help="Cycles CPU threads (0 = auto)")
OPT = ap.parse_args()

INTRO_LEN = 270          # render_jobs.INTRO_LEN; frames are sampled evenly across it
W, H = 960, 540          # INTRO is keyed at 1920×1080; render_jobs scales it by --scale
WIDTHS = (960, 1600)
# background edges: the web canvas fills any letterbox with the same vertical gradient
BG_TOP, BG_BOTTOM = "#F7E6BD", "#D4914F"

RAW = os.path.join(OPT.work, "raw")
COMP = os.path.join(OPT.work, "comp")
FRAMES = [round(1 + i * (INTRO_LEN - 1) / (OPT.frames - 1)) for i in range(OPT.frames)]


def log(*a):
    print("[scroll-placeholder]", *a, flush=True)


# --------------------------------------------------------------------------- render (bpy)

def render():
    # render_jobs/nonla_build read their options from argv at import time
    sys.argv = [sys.argv[0], "--", "--out", OPT.work, "--jobs", "intro", "--preview", "--samples", str(OPT.samples),
                "--scale", str(W / 1920), "--device", "CPU"]
    sys.path.insert(0, os.path.join(ROOT, "blender"))
    import render_jobs as rj  # noqa: E402

    scene, _col, _meta = rj.nb.build_scene()
    rj.setup(scene)
    if OPT.threads:
        scene.render.threads_mode = "FIXED"
        scene.render.threads = OPT.threads
    scene.cycles.use_denoising = True
    cam, tgt = rj.look_at_camera("CAM_INTRO", (0, 0, 0.06), rj.orbit((0, 0, 0.06), 0, 24, 1.35), fov_y=32.2)
    scene.camera = cam
    rj.build_intro(scene, cam, tgt)
    rj.res(scene, 1920, 1080)
    os.makedirs(RAW, exist_ok=True)
    t0 = time.time()
    for n, f in enumerate(FRAMES, 1):
        path = os.path.join(RAW, f"f_{n:04d}.png")
        if OPT.skip_existing and os.path.exists(path):
            continue
        scene.frame_set(f)
        scene.render.filepath = path
        t = time.time()
        rj.bpy.ops.render.render(write_still=True)
        log(f"PROGRESS {n}/{len(FRAMES)} (intro frame {f}) {time.time() - t:.1f}s, total {time.time() - t0:.0f}s")


# --------------------------------------------------------------------------- composite (numpy + PIL)

def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def smoothstep(a, b, x):
    import numpy as np
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def background(np):
    """Stand-in for EffectCraft layer 1: straw-to-terracotta gradient with a soft glow behind the hat.
    Top and bottom rows stay flat so a portrait crop can letterbox seamlessly."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = x / (W - 1), y / (H - 1)
    top, bot = np.array(hex_rgb(BG_TOP)), np.array(hex_rgb(BG_BOTTOM))
    bg = top * (1 - v[..., None] ** 1.3) + bot * (v[..., None] ** 1.3)
    d = np.hypot((u - 0.5) * W / H, (v - 0.47) * 1.15)
    glow = (1 - smoothstep(0.0, 0.42, d)) * 0.55
    bg = bg + (np.array(hex_rgb("#FFF6DE")) - bg) * glow[..., None]
    side = smoothstep(0.28, 0.5, np.abs(u - 0.5)) * 0.28
    bg = bg + (np.array(hex_rgb("#B5653A")) - bg) * side[..., None]
    return bg


def effects(np, bg, t):
    """Light leaks and drifting straw dust (EffectCraft adds the real ones; no grain: that is a CSS overlay)."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    out = bg.copy()
    # warm leak from the left at the start, fading out by 25 %
    k = max(0.0, 1 - t / 0.25)
    if k > 0:
        d = np.hypot((x - W * 0.02) / (W * 0.45), (y - H * 0.25) / (H * 0.9))
        leak = np.exp(-d * d * 2.2) * 0.32 * k
        out = 1 - (1 - out) * (1 - leak[..., None] * np.array(hex_rgb("#FFB25C")))
    # golden sweep across the frame for the last 18 %
    if t > 0.82:
        p = (t - 0.82) / 0.18
        band = np.exp(-(((x + y * 0.6) / W - (p * 1.8 - 0.3)) / 0.16) ** 2) * 0.28 * math.sin(math.pi * p)
        out = 1 - (1 - out) * (1 - band[..., None] * np.array(hex_rgb("#FFD27A")))
    return out


def dust(np, img, t):
    rng = np.random.default_rng(7)
    n = 36
    px, py = rng.random(n) * W, rng.random(n) * H
    vx, vy = rng.normal(0, 30, n), -rng.random(n) * 70 - 20
    r = rng.random(n) * 2.2 + 1.2
    a = rng.random(n) * 0.35 + 0.25
    col = np.array(hex_rgb("#FFF3D6"))
    for i in range(n):
        cx, cy = (px[i] + vx[i] * t * 3) % W, (py[i] + vy[i] * t * 3) % H
        x0, x1 = int(max(0, cx - 8)), int(min(W, cx + 9))
        y0, y1 = int(max(0, cy - 8)), int(min(H, cy + 9))
        if x0 >= x1 or y0 >= y1:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        m = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r[i] ** 2)) * a[i]
        img[y0:y1, x0:x1] = img[y0:y1, x0:x1] + (col - img[y0:y1, x0:x1]) * m[..., None]
    return img


def composite():
    import numpy as np
    from PIL import Image

    os.makedirs(COMP, exist_ok=True)
    bg = background(np)
    for n in range(1, len(FRAMES) + 1):
        src = os.path.join(RAW, f"f_{n:04d}.png")
        t = (n - 1) / (len(FRAMES) - 1)
        base = effects(np, bg, t)
        im = Image.open(src).convert("RGBA")
        if im.size != (W, H):
            im = im.resize((W, H), Image.LANCZOS)
        fg = np.asarray(im).astype(np.float32) / 255
        a = fg[..., 3:4]
        out = fg[..., :3] * a + base * (1 - a)
        out = dust(np, out, t)
        Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(COMP, f"f_{n:04d}.png"))
    log(f"composited {len(FRAMES)} frames → {COMP}")


# --------------------------------------------------------------------------- encode (sharp) + manifest

ENCODE_JS = r"""
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [comp, out, count, widths] = [process.argv[1], process.argv[2], +process.argv[3], JSON.parse(process.argv[4])];
let bytes = {};
for (const w of widths) {
  const dir = path.join(out, String(w));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^f_\d{4}\.webp$/.test(f)) fs.unlinkSync(path.join(dir, f));
  bytes[w] = 0;
  for (let n = 1; n <= count; n++) {
    const name = `f_${String(n).padStart(4, '0')}`;
    let img = sharp(path.join(comp, name + '.png'));
    if (w !== 960) img = img.resize(w, Math.round(w * 9 / 16), { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 });
    const info = await img.webp({ quality: w === 960 ? 72 : 68, effort: 5 }).toFile(path.join(dir, name + '.webp'));
    bytes[w] += info.size;
  }
}
console.log(JSON.stringify(bytes));
"""


def encode():
    res = subprocess.run(["node", "--input-type=module", "-e", ENCODE_JS, COMP, OPT.out, str(len(FRAMES)), json.dumps(list(WIDTHS))],
                         cwd=ROOT, check=True, capture_output=True, text=True)
    sizes = json.loads(res.stdout.strip().splitlines()[-1])
    manifest = {
        "count": len(FRAMES),
        "widths": list(WIDTHS),
        "aspect": [16, 9],
        "bg": {"top": BG_TOP, "bottom": BG_BOTTOM},
        "placeholder": True,
        "source": f"tools/assets/make-scroll-placeholder.py: INTRO frames {FRAMES[0]}..{FRAMES[-1]} sampled {len(FRAMES)}x, "
                  f"{W}x{H}, Cycles CPU {OPT.samples} spp",
        "bytes": {str(k): v for k, v in sizes.items()},
    }
    with open(os.path.join(OPT.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    log("encoded", {k: f"{v / 1e6:.2f} MB" for k, v in sizes.items()}, "→", OPT.out)


if __name__ == "__main__":
    if not OPT.skip_render:
        render()
    composite()
    encode()
