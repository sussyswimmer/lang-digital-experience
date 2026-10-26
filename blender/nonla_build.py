"""Procedural nón lá (Vietnamese conical hat) for the "Explore the Nón Lá" experience.

Every physical layer is its own named object, so the web app can peel, light up and
re-assemble them, and the Blender renders show exactly the same hat:

    nonla_root
    └── hat_assembly                     whole-hat pivot (rotate / tilt / turn / shrink)
        ├── frame
        │   ├── rings   ring_01..ring_16 (01 = wide brim), each with child ring_joint_NN
        │   └── ribs    rib_00..rib_11
        ├── leaf_inner
        ├── mo_bark                      middle layer of bark ("mo")
        ├── poem_art                     hidden paper art (nón bài thơ)
        ├── leaf_outer
        │   ├── leaf_outer_panel_NN_hinge → leaf_outer_panel_NN   (12 panels × 2 leaves)
        │   └── leaf_outer_cap
        ├── stitches_white               stitch_white_row_02..16 (row 03 = where sewing starts)
        ├── brim                         brim_wire_inner, brim_wire_outer, brim_bark, brim_thread_red
        ├── strap_rig                    strap, strap_knot_L/R, strap_yarn_L/R (rings 3–5)
        ├── apex_cap
        └── anchors                      anchor_strap_L/R, anchor_hint_trace_start, anchor_label_brim

Run headless with Blender or with the `bpy` module:

    blender -b --factory-startup -P blender/nonla_build.py -- --out <dir> [--render] [--samples=N] [--res=WxH]
    python3 blender/nonla_build.py --out <dir> [--render]

Writes <dir>/nonla.glb, <dir>/nonla.blend, <dir>/nonla.meta.json (+ preview.png with --render).
Textures are written to blender/textures/ (kept external so the .blend stays small).
"""

import json
import math
import os
import sys

import bpy  # must be imported before bmesh/mathutils when running as the bpy module
import bmesh
import numpy as np
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- arguments

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


def arg(name, default=None):
    for i, a in enumerate(ARGV):
        if a == name and i + 1 < len(ARGV):
            return ARGV[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(arg("--out", os.path.join(HERE, "out")))
TEX_DIR = os.path.abspath(arg("--tex", os.path.join(HERE, "textures")))
DO_RENDER = "--render" in ARGV
SAMPLES = int(arg("--samples", "48"))
RES = arg("--res", "1280x720")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(TEX_DIR, exist_ok=True)

# --------------------------------------------------------------------------- parameters (metres)

P = dict(
    BRIM_D=0.48,          # brief: 40–50 cm across
    HEIGHT=0.21,
    N_RINGS=16,           # brief: 16 circular rings …
    RING_PITCH=0.020,     # … about 2 cm apart (along the slant)
    RIBS=12,
    OUTER_LEAVES=24,
    PANELS=12,            # 2 leaves per peelable panel
    HINGE_RING=15,        # panels hinge just below the cap
    STITCH_PITCH=0.008,
    STITCH_LEN=0.004,
    STITCH_R=0.00035,     # nylon is thinner; ×1.4 so children can see it
    RED_WRAPS=188,
    RED_R=0.00045,
    SEW_START_RING=3,     # "the sewing begins at the third rim from the wide brim"
    STRAP_RINGS=(3, 4, 5),
    STRAP_W=0.014,
    STRAP_SAG=0.27,
)
R = P["BRIM_D"] / 2
H = P["HEIGHT"]
L = math.hypot(R, H)
A = math.atan2(R, H)               # half-apex angle
SIN_A, COS_A = math.sin(A), math.cos(A)
WHITE_ROWS = list(range(2, P["N_RINGS"] + 1))  # ring 01 carries the red brim binding instead

# radial offsets from the ring surface along the outward normal
OFF = dict(rib=-0.0040, ring=-0.0012, leaf_inner=0.0006, mo=0.0011, poem=0.0014,
           outer=0.0018, outer_alt=0.0021, stitch=0.0024)

COLOURS = {
    "leaf_outer": "#D9B56A", "leaf_outer_hi": "#EBD08F", "leaf_inner": "#E6D2A0",
    "mo_bark": "#9C6B3F", "bamboo": "#C79A55", "bamboo_mark": "#8C6431",
    "thread_white": "#F5F3EE", "thread_red": "#C0261C", "brim_bark": "#7A4E2D",
    "strap_purple": "#8E5BA8", "strap_peach": "#F4A79A", "strap_green": "#A9D8A0",
    "yarn": "#6E4A86",
}


def hex_rgb(h, linear=True):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    if linear:
        c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return tuple(c)


# --------------------------------------------------------------------------- cone maths

def ring_frame(i):
    """(slant from tip, radius, height above brim) of ring i (1 = brim … 16 = top)."""
    s = L - (i - 1) * P["RING_PITCH"]
    return s, s * SIN_A, H - s * COS_A


def normal(az):
    return Vector((math.cos(az) * COS_A, math.sin(az) * COS_A, SIN_A))


def slant_dir(az):
    """Unit tangent running down the slant (tip → brim)."""
    return Vector((SIN_A * math.cos(az), SIN_A * math.sin(az), -COS_A))


def tangent(az):
    return Vector((-math.sin(az), math.cos(az), 0.0))


def cone_point(s, az, off=0.0):
    p = Vector((s * SIN_A * math.cos(az), s * SIN_A * math.sin(az), H - s * COS_A))
    return p + normal(az) * off


def to_gltf(v):
    """Blender Z-up → glTF Y-up."""
    return [round(v[0], 6), round(v[2], 6), round(-v[1], 6)]


# --------------------------------------------------------------------------- scene helpers

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def link(obj, col, parent=None):
    col.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, col, parent=None, matrix=None, size=0.03):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = size
    link(obj, col, parent)
    if matrix is not None:
        obj.matrix_world = matrix
    return obj


def bm_to_object(name, bm, mat, col, parent=None, origin=None, attrs=None):
    """bmesh → object with exactly one material. `origin` (world) becomes the pivot."""
    if origin is not None:
        bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    if attrs:
        for aname, values in attrs.items():
            at = me.attributes.new(aname, "FLOAT", "POINT")
            at.data.foreach_set("value", values)
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    link(obj, col)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    if origin is not None:
        obj.matrix_world = Matrix.Translation(Vector(origin))
    return obj


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


def add_tube(bm, pts, radius, sides=8, closed=False, radii=None, profile=None):
    """Sweep a circle (or an (x, y) profile) along pts with parallel-transport frames. Returns new verts."""
    n = len(pts)
    pts = [Vector(p) for p in pts]
    tans = []
    for i in range(n):
        a = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        b = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        tans.append((b - a).normalized())
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    shape = profile or [(math.cos(2 * math.pi * j / sides), math.sin(2 * math.pi * j / sides)) for j in range(sides)]
    m = len(shape)
    rings, made = [], []
    for i in range(n):
        if i:
            axis = tans[i - 1].cross(tans[i])
            if axis.length > 1e-9:
                nrm = (Matrix.Rotation(tans[i - 1].angle(tans[i]), 3, axis.normalized()) @ nrm).normalized()
        bin_ = tans[i].cross(nrm).normalized()
        r = radii[i] if radii else radius
        ring = [bm.verts.new(pts[i] + (nrm * x + bin_ * y) * r) for x, y in shape]
        rings.append(ring)
        made.extend(ring)
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(m):
            bm.faces.new((r0[j], r0[(j + 1) % m], r1[(j + 1) % m], r1[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return made


def cone_patch(bm, s0, s1, az0, az1, off, ns, naz, uv=None, uv_rect=(0, 0, 1, 1), bulge=0.0):
    """Quad grid on the cone; UV u runs around, v runs from brim (0) to tip (1)."""
    grid = []
    for i in range(ns + 1):
        s = s0 + (s1 - s0) * i / ns
        row = []
        for j in range(naz + 1):
            az = az0 + (az1 - az0) * j / naz
            o = off + bulge * math.sin(math.pi * j / naz)
            row.append(bm.verts.new(cone_point(max(s, 1e-5), az, o)))
        grid.append(row)
    u0, v0, u1, v1 = uv_rect
    for i in range(ns):
        for j in range(naz):
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            if uv is not None:
                for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                    loop[uv].uv = (u0 + (u1 - u0) * jj / naz, v0 + (v1 - v0) * (1 - ii / ns))
    return grid


# --------------------------------------------------------------------------- procedural textures → PNG

def value_noise(h, w, cy, cx, seed):
    g = np.random.default_rng(seed).random((cy + 2, cx + 2))
    y = np.linspace(0, cy, h, endpoint=False)
    x = np.linspace(0, cx, w, endpoint=False)
    y0, x0 = y.astype(int), x.astype(int)
    fy, fx = (y - y0)[:, None], (x - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a, b = g[y0][:, x0], g[y0][:, x0 + 1]
    c, d = g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, cy, cx, octaves, seed):
    out, amp, tot = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(h, w, cy * 2 ** o, cx * 2 ** o, seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def save_png(path, rgb, alpha=None):
    from PIL import Image
    arr = np.clip(rgb, 0, 1)
    mode = "RGB"
    if alpha is not None:
        arr = np.dstack([arr, np.clip(alpha, 0, 1)])
        mode = "RGBA"
    Image.fromarray((arr * 255 + 0.5).astype(np.uint8), mode).save(path, optimize=True)


def srgb(hexcol):
    return np.array(hex_rgb(hexcol, linear=False))


def gen_leaf_atlas(path, w=2048, h=1024, variants=8):
    """8 leaf variants side by side (each column = one leaf, v runs down the leaf)."""
    col_w = w // variants
    out = np.zeros((h, w, 3))
    lo, hi = srgb(COLOURS["leaf_outer"]), srgb(COLOURS["leaf_outer_hi"])
    for k in range(variants):
        x = np.linspace(0, 1, col_w)[None, :]
        y = np.linspace(0, 1, h)[:, None]
        wob = (fbm(h, col_w, 3, 1, 3, 100 + k) - 0.5) * 0.03
        veins = 0.5 + 0.5 * np.cos((x + wob) * math.tau * (14 + k % 3))
        fine = 0.5 + 0.5 * np.cos((x + wob * 2) * math.tau * 70)
        midrib = np.exp(-((x - 0.5 - wob) / 0.012) ** 2)
        mott = fbm(h, col_w, 24, 4, 4, 200 + k)
        streak = fbm(h, col_w, 2, 24, 3, 300 + k)
        t = np.clip(0.55 + 0.35 * (mott - 0.5) + 0.25 * (streak - 0.5) + 0.12 * (k / variants - 0.5), 0, 1)
        base = lo[None, None, :] * (1 - t[..., None]) + hi[None, None, :] * t[..., None]
        shade = 0.90 + 0.06 * veins + 0.03 * fine + 0.05 * midrib - 0.05 * (np.minimum(x, 1 - x) < 0.03)
        green = 0.02 * (fbm(h, col_w, 6, 2, 2, 400 + k) - 0.3)  # a faint green cast on some leaves
        leaf = base * shade[..., None]
        leaf[..., 1] += green
        leaf *= (0.96 + 0.04 * y)[..., None]  # a little darker towards the brim
        out[:, k * col_w:(k + 1) * col_w] = leaf
    save_png(path, out)


def gen_leaf_inner(path, w=1024, h=512):
    x = np.linspace(0, 1, w)[None, :]
    base = srgb(COLOURS["leaf_inner"])
    veins = 0.5 + 0.5 * np.cos(x * math.tau * 24 * 8)
    mott = fbm(h, w, 8, 24, 3, 500)
    save_png(path, base[None, None, :] * (0.9 + 0.05 * veins + 0.1 * (mott - 0.5))[..., None])


def gen_bamboo(path, w=1024, h=128):
    base, mark = srgb(COLOURS["bamboo"]), srgb(COLOURS["bamboo_mark"])
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    fib = 0.5 + 0.5 * np.sin(y * math.tau * 18 + (fbm(h, w, 2, 12, 2, 600) - 0.5) * 4)
    blot = fbm(h, w, 2, 48, 3, 601)
    rgb = base[None, None, :] * (0.88 + 0.08 * fib + 0.12 * (blot - 0.5))[..., None]
    nodes = np.exp(-((np.mod(x * 9.0, 1.0) - 0.5) / 0.012) ** 2)  # node marks along the strip
    rgb = rgb * (1 - 0.6 * nodes[..., None]) + mark[None, None, :] * 0.6 * nodes[..., None]
    save_png(path, rgb)


def gen_bark(path, hexcol, seed, w=512, h=1024):
    base = srgb(hexcol)
    x = np.linspace(0, 1, w)[None, :]
    stretch = fbm(h, w, 48, 4, 4, seed)
    strands = 0.5 + 0.5 * np.sin((x * 70 + stretch * 5) * math.tau)
    spots = fbm(h, w, 16, 8, 3, seed + 1)
    save_png(path, base[None, None, :] * (0.78 + 0.16 * strands + 0.25 * (spots - 0.5))[..., None])


def gen_strap(path, w=256, h=256):
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    weave = 0.5 + 0.25 * np.sin(x * math.tau * 64) * np.sin(y * math.tau * 64) + 0.25 * np.sin(y * math.tau * 128)
    g = 0.86 + 0.14 * weave
    save_png(path, np.dstack([g, g, g]) * np.ones((h, w, 1)))


def gen_poem_placeholder(path, w=2048, h=1024):
    """Placeholder until blender/textures/poem_art.png is rendered from the SVG artwork."""
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    a = np.zeros((h, w))
    cx, cy = 0.75, 0.5  # front of the hat faces −Y → azimuth 270° → u = 0.75
    for k in range(5):
        ang = math.pi * (0.15 + 0.175 * k)
        px, py = cx + 0.02 * math.cos(ang), cy + 0.12 * math.sin(ang) - 0.06
        a = np.maximum(a, (((xx - px) / 0.008) ** 2 + ((yy - py) / 0.07) ** 2 < 1).astype(float))
    boat = (((xx - 0.79) / 0.03) ** 2 + ((yy - 0.25) / 0.03) ** 2 < 1) & (yy < 0.25)
    a = np.maximum(a, boat.astype(float))
    for i in range(5):
        line = (np.abs(xx - (0.70 + i * 0.012)) < 0.002) & (yy > 0.45) & (yy < 0.75 - 0.03 * (i % 2))
        a = np.maximum(a, line.astype(float))
    save_png(path, np.ones((h, w, 3)) * srgb("#2B1B10"), a * 0.95)


def ensure_textures():
    t = {}
    specs = {
        "leaf_atlas.png": lambda p: gen_leaf_atlas(p),
        "leaf_inner.png": lambda p: gen_leaf_inner(p),
        "bamboo.png": lambda p: gen_bamboo(p),
        "mo_bark.png": lambda p: gen_bark(p, COLOURS["mo_bark"], 700),
        "brim_bark.png": lambda p: gen_bark(p, COLOURS["brim_bark"], 710),
        "strap_weave.png": lambda p: gen_strap(p),
        "poem_art.png": lambda p: gen_poem_placeholder(p),
    }
    for name, fn in specs.items():
        path = os.path.join(TEX_DIR, name)
        if not os.path.exists(path):
            fn(path)
        t[name.rsplit(".", 1)[0]] = path
    return t


# --------------------------------------------------------------------------- materials (Principled only → exports cleanly)

def material(name, hexcol, rough=0.6, tex=None, alpha=None, alpha_from_tex=False, coat=0.0, sheen=0.0,
             transmission=0.0, tint_tex=False):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree if mat.node_tree else None
    if nt is None:
        mat.use_nodes = True
        nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*hex_rgb(hexcol), 1)
    bsdf.inputs["Roughness"].default_value = rough
    for sock, val in (("Coat Weight", coat), ("Sheen Weight", sheen), ("Transmission Weight", transmission)):
        if sock in bsdf.inputs:
            bsdf.inputs[sock].default_value = val
    if tex:
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(tex, check_existing=True)
        node.location = (-500, 250)
        if tint_tex:  # greyscale weave × colour (the strap recolours in the app)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs["B"].default_value = (*hex_rgb(hexcol), 1)
            nt.links.new(node.outputs["Color"], mix.inputs["A"])
            nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_from_tex:
            nt.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha is not None or alpha_from_tex:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
    return mat


def build_materials(t):
    return {
        "leaf_outer": material("mat_leaf_outer", "#FFFFFF", rough=0.45, tex=t["leaf_atlas"], coat=0.3),
        "leaf_cap": material("mat_leaf_cap", "#FFFFFF", rough=0.45, tex=t["leaf_atlas"], coat=0.3),
        "leaf_inner": material("mat_leaf_inner", "#FFFFFF", rough=0.75, tex=t["leaf_inner"]),
        "mo_bark": material("mat_mo_bark", "#FFFFFF", rough=0.85, tex=t["mo_bark"]),
        "poem_art": material("mat_poem_art", "#FFFFFF", rough=0.9, tex=t["poem_art"], alpha_from_tex=True),
        "bamboo": material("mat_bamboo", "#FFFFFF", rough=0.55, tex=t["bamboo"]),
        "joint": material("mat_bamboo_joint", COLOURS["bamboo_mark"], rough=0.7),
        "thread_white": material("mat_thread_white", COLOURS["thread_white"], rough=0.25, alpha=0.92),
        "thread_red": material("mat_thread_red", COLOURS["thread_red"], rough=0.35),
        "brim_bark": material("mat_brim_bark", "#FFFFFF", rough=0.85, tex=t["brim_bark"]),
        "strap": material("mat_strap", COLOURS["strap_purple"], rough=0.35, tex=t["strap_weave"], sheen=0.6,
                          tint_tex=True),
        "yarn": material("mat_knot_yarn", COLOURS["yarn"], rough=0.8),
    }


# --------------------------------------------------------------------------- parts

def build_frame(col, hat, M, meta):
    frame = empty("frame", col, hat)
    rings_e = empty("rings", col, frame)
    ribs_e = empty("ribs", col, frame)
    rings_meta = []
    for i in range(1, P["N_RINGS"] + 1):
        s, r, z = ring_frame(i)
        segs = max(24, min(160, round(160 * r / R)))
        # bamboo strip: rounded-rectangle profile (wider than thick); the brim ring is chunkier
        w, th = (0.0045, 0.0030) if i == 1 else (0.0024, 0.0010)
        prof = [(math.cos(a) * th / 2 / 0.001, math.sin(a) * w / 2 / 0.001) for a in np.linspace(0, math.tau, 6, endpoint=False)]
        pts = [cone_point(s, math.tau * k / segs, OFF["ring"]) for k in range(segs)]
        bm = bmesh.new()
        add_tube(bm, pts, 0.001, closed=True, profile=prof)
        ring = bm_to_object(f"ring_{i:02d}", bm, M["bamboo"], col, rings_e, origin=(0, 0, z))
        joint_az = math.radians(((i - 1) * 157.5) % 360)  # gcd(7,16)=1 → every ring gets its own slot
        span = 0.011 / max(r, 0.01)
        jpts = [cone_point(s, joint_az + d, OFF["ring"]) for d in np.linspace(-span, span, 6)]
        bm = bmesh.new()
        add_tube(bm, jpts, 0.0013, closed=False, profile=[(x * 1.3, y * 1.3) for x, y in prof])
        for d in (-span * 0.6, span * 0.6):  # two tiny tie wraps
            c = cone_point(s, joint_az + d, OFF["ring"])
            loop = [c + (normal(joint_az) * math.cos(a) + slant_dir(joint_az) * math.sin(a)) * 0.0022
                    for a in np.linspace(0, math.tau, 10, endpoint=False)]
            add_tube(bm, loop, 0.00035, sides=4, closed=True)
        joint = bm_to_object(f"ring_joint_{i:02d}", bm, M["joint"], col, None, origin=cone_point(s, joint_az, OFF["ring"]))
        parent_keep(joint, ring)
        for o in (ring, joint):
            o["layer"] = "frame"
            o["ring_index"] = i
        ring["radius_m"], ring["height_m"], ring["slant_m"] = round(r, 5), round(z, 5), round(s, 5)
        ring["joint_az_deg"] = round(math.degrees(joint_az), 2)
        rings_meta.append({"name": f"ring_{i:02d}", "index": i, "s": round(s, 5), "r": round(r, 5), "y": round(z, 5),
                           "joint_az_deg": round(math.degrees(joint_az), 2),
                           "joint_point": to_gltf(cone_point(s, joint_az, OFF["ring"]))})
    for k in range(P["RIBS"]):
        az = math.tau * (k + 0.5) / P["RIBS"]
        s_top = ring_frame(16)[0]
        pts = [cone_point(s, az, OFF["rib"]) for s in np.linspace(s_top, L - 0.003, 32)]
        bm = bmesh.new()
        add_tube(bm, pts, 0.001, profile=[(x * 0.4, y * 0.8) for x, y in
                                           ((1, 0), (0.5, 0.87), (-0.5, 0.87), (-1, 0), (-0.5, -0.87), (0.5, -0.87))])
        rib = bm_to_object(f"rib_{k:02d}", bm, M["bamboo"], col, ribs_e)
        rib["layer"] = "frame"
    meta["rings"] = rings_meta


def build_shell(name, col, hat, mat, off, s0, s1, ns, naz, layer, thickness=0.0):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    cone_patch(bm, s0, s1, 0, math.tau, off, ns, naz, uv=uv)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    if thickness:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thickness)
    obj = bm_to_object(name, bm, mat, col, hat)
    obj["layer"] = layer
    return obj


def build_outer_leaves(col, hat, M, meta):
    group = empty("leaf_outer", col, hat)
    per = P["OUTER_LEAVES"] // P["PANELS"]
    leaf_w = math.tau / P["OUTER_LEAVES"]
    ov = math.radians(1.5)
    s_hinge = ring_frame(P["HINGE_RING"])[0]
    panels = []
    for j in range(P["PANELS"]):
        az_c = (j + 0.5) * math.tau / P["PANELS"]
        hp = cone_point(s_hinge, az_c, OFF["outer"])
        Mh = Matrix((tangent(az_c), slant_dir(az_c), normal(az_c))).transposed().to_4x4()
        Mh.translation = hp
        hinge = empty(f"leaf_outer_panel_{j:02d}_hinge", col, group, matrix=Mh, size=0.01)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new("UVMap")
        for k in range(per):
            leaf = j * per + k
            az0 = leaf * leaf_w - ov
            az1 = (leaf + 1) * leaf_w + ov
            col_idx = (leaf * 5) % 8
            off = OFF["outer"] if leaf % 2 == 0 else OFF["outer_alt"]
            cone_patch(bm, s_hinge, L + 0.004, az0, az1, off, ns=28, naz=3, uv=uv,
                       uv_rect=(col_idx / 8 + 0.004, 0.0, (col_idx + 1) / 8 - 0.004, 0.86), bulge=0.0003)
        bmesh.ops.transform(bm, matrix=Mh.inverted(), verts=bm.verts)
        me = bpy.data.meshes.new(f"leaf_outer_panel_{j:02d}")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(M["leaf_outer"])
        panel = bpy.data.objects.new(f"leaf_outer_panel_{j:02d}", me)
        link(panel, col)
        panel.parent = hinge
        panel.matrix_parent_inverse = Matrix.Identity(4)
        panel.matrix_basis = Matrix.Identity(4)
        panel["layer"] = "leaf_outer"
        panel["panel_index"] = j
        panel["az_deg"] = round(math.degrees(az_c), 2)
        panels.append({"name": panel.name, "hinge": hinge.name, "az_deg": round(math.degrees(az_c), 2),
                       "len": round(L + 0.004 - s_hinge, 5), "hinge_point": to_gltf(hp)})
    # cap over rings 15–16 and the tip, removed last
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    cone_patch(bm, 0.0, s_hinge + 0.003, 0, math.tau, OFF["outer_alt"] + 0.0002, ns=6, naz=48, uv=uv,
               uv_rect=(0.0, 0.86, 1.0, 1.0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    cap = bm_to_object("leaf_outer_cap", bm, M["leaf_cap"], col, group)
    cap["layer"] = "leaf_outer"
    meta["panels"] = panels
    meta["panel_axes_gltf"] = {"tangent": "+X", "slant_to_brim": "-Z", "outward": "+Y"}


def build_white_stitches(col, hat, M, meta):
    group = empty("stitches_white", col, hat)
    rows = []
    order = [3, 2] + list(range(4, P["N_RINGS"] + 1))  # sewing starts at ring 3, down to the edge, then the rest
    for i in WHITE_ROWS:
        s, r, z = ring_frame(i)
        n = max(10, int(math.tau * r / P["STITCH_PITCH"]))
        bm = bmesh.new()
        ts, pts_meta, nrm_meta = [], [], []
        tilt = math.radians(12)
        for k in range(n):
            az = math.tau * (k + 0.5 * (i % 2)) / n
            d = (slant_dir(az) * math.cos(tilt) + tangent(az) * math.sin(tilt)).normalized()
            c = cone_point(s, az, OFF["stitch"])
            nn = normal(az)
            hl = P["STITCH_LEN"] / 2
            made = add_tube(bm, [c - d * hl - nn * 0.0003, c + nn * 0.0003, c + d * hl - nn * 0.0003],
                            P["STITCH_R"], sides=4)
            t = k / (n - 1)
            ts.extend([t] * len(made))
            pts_meta.append(to_gltf(c))
            nrm_meta.append(to_gltf(nn))
        # caps add no new verts in add_tube; ts length == vertex count
        obj = bm_to_object(f"stitch_white_row_{i:02d}", bm, M["thread_white"], col, group, origin=(0, 0, z),
                           attrs={"_stitch_t": ts})
        obj["layer"] = "stitches_white"
        obj["ring"] = i
        obj["count"] = n
        obj["sew_order"] = order.index(i) + 1
        obj["thread"] = "white_nylon"
        rows.append({"name": obj.name, "ring": i, "count": n, "sew_order": order.index(i) + 1,
                     "points": pts_meta, "normals": nrm_meta})
    meta["stitch_rows"] = rows
    meta["trace_rows"] = [f"stitch_white_row_{P['SEW_START_RING']:02d}"]
    meta["cascade_order"] = ["03", "02", "RED_BRIM"] + [f"{i:02d}" for i in range(4, P["N_RINGS"] + 1)]


def build_brim(col, hat, M, meta):
    group = empty("brim", col, hat)
    s1, r1, _ = ring_frame(1)
    segs = 192
    for name, dr in (("brim_wire_inner", -0.0022), ("brim_wire_outer", 0.0026)):
        pts = [Vector(((r1 + dr) * math.cos(a), (r1 + dr) * math.sin(a), 0.0015)) for a in
               np.linspace(0, math.tau, segs, endpoint=False)]
        bm = bmesh.new()
        add_tube(bm, pts, 0.0014, sides=8, closed=True)
        o = bm_to_object(name, bm, M["bamboo"], col, group)
        o["layer"] = "brim"
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rows = []
    for zz in (-0.002, 0.007):
        rows.append([bm.verts.new(Vector(((r1 + 0.0004) * math.cos(a), (r1 + 0.0004) * math.sin(a), zz)))
                     for a in np.linspace(0, math.tau, segs, endpoint=False)])
    for k in range(segs):
        f = bm.faces.new((rows[0][k], rows[0][(k + 1) % segs], rows[1][(k + 1) % segs], rows[1][k]))
        for loop, uvv in zip(f.loops, ((k / segs, 0), ((k + 1) / segs, 0), ((k + 1) / segs, 1), (k / segs, 1))):
            loop[uv].uv = uvv
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0016)
    o = bm_to_object("brim_bark", bm, M["brim_bark"], col, group)
    o["layer"] = "brim"
    wraps, per = P["RED_WRAPS"], 6
    pts = []
    for k in range(wraps * per):
        t = k / (wraps * per)
        az = math.tau * t
        a = math.tau * wraps * t
        centre = Vector(((r1 + 0.0002) * math.cos(az), (r1 + 0.0002) * math.sin(az), 0.0025))
        radial = Vector((math.cos(az), math.sin(az), 0))
        pts.append(centre + radial * 0.0040 * math.cos(a) + Vector((0, 0, 1)) * 0.0058 * math.sin(a))
    bm = bmesh.new()
    add_tube(bm, pts, P["RED_R"], sides=4, closed=True)
    o = bm_to_object("brim_thread_red", bm, M["thread_red"], col, group)
    o["layer"] = "brim"
    o["thread"] = "red_nylon"
    meta["brim"] = {"wraps": wraps, "radius": round(r1, 5)}


def catenary_points(a_l, a_r, sag, n):
    """Points of a catenary hanging `sag` below two anchors at equal height."""
    half = (a_r.x - a_l.x) / 2
    lo, hi = 0.01, 10.0
    for _ in range(80):
        c = (lo + hi) / 2
        if c * (math.cosh(half / c) - 1) > sag:
            lo = c
        else:
            hi = c
    c = (lo + hi) / 2
    length = 2 * c * math.sinh(half / c)
    # resample by arc length
    out = []
    for k in range(n):
        sl = -length / 2 + length * k / (n - 1)
        x = c * math.asinh(sl / c)
        z = c * (math.cosh(x / c) - 1) - sag
        out.append(Vector((x, a_l.y, a_l.z + z)))
    return out, length


def build_strap(col, hat, M, meta):
    rig = empty("strap_rig", col, hat)
    s4 = ring_frame(4)[0]
    anchors = {}
    for side, az in (("L", math.pi), ("R", 0.0)):
        anchors[side] = cone_point(s4, az, OFF["ring"] - 0.003)
    pts, length = catenary_points(anchors["L"], anchors["R"], P["STRAP_SAG"], 25)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rows = []
    th = 0.0009
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        wv = Vector((0, 1, 0))  # ribbon width runs front–back
        nv = t.cross(wv).normalized()
        rows.append([bm.verts.new(p + wv * ww + nv * tt) for ww, tt in
                     ((-P["STRAP_W"] / 2, -th), (P["STRAP_W"] / 2, -th), (P["STRAP_W"] / 2, th), (-P["STRAP_W"] / 2, th))])
    for k in range(len(rows) - 1):
        for j in range(4):
            f = bm.faces.new((rows[k][j], rows[k][(j + 1) % 4], rows[k + 1][(j + 1) % 4], rows[k + 1][j]))
            for loop, uvv in zip(f.loops, ((k / 24 * 6, j / 4), ((k) / 24 * 6, (j + 1) / 4),
                                            ((k + 1) / 24 * 6, (j + 1) / 4), ((k + 1) / 24 * 6, j / 4))):
                loop[uv].uv = uvv
    pivot = (anchors["L"] + anchors["R"]) / 2
    strap = bm_to_object("strap", bm, M["strap"], col, rig, origin=pivot)
    strap["layer"] = "strap"
    for side, az in (("L", math.pi), ("R", 0.0)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.0052, matrix=Matrix.Translation(anchors[side]))
        for v in bm.verts:  # lumpy knot
            v.co += (v.co - anchors[side]) * 0.25 * math.sin(v.co.x * 900 + v.co.z * 700)
        knot = bm_to_object(f"strap_knot_{side}", bm, M["yarn"], col, rig, origin=anchors[side])
        knot["layer"] = "strap"
        bm = bmesh.new()
        for i in P["STRAP_RINGS"]:
            c = cone_point(ring_frame(i)[0], az, OFF["ring"])
            loop = [c + (normal(az) * math.cos(a) + slant_dir(az) * math.sin(a)) * 0.0034
                    for a in np.linspace(0, math.tau, 12, endpoint=False)]
            add_tube(bm, loop, 0.0007, sides=5, closed=True)
        yarn = bm_to_object(f"strap_yarn_{side}", bm, M["yarn"], col, rig)
        yarn["layer"] = "strap"
    meta["strap"] = {
        "anchor_L": to_gltf(anchors["L"]), "anchor_R": to_gltf(anchors["R"]),
        "rest_points": [to_gltf(p) for p in pts], "width": P["STRAP_W"], "length": round(length, 4),
        "colors": {"purple": COLOURS["strap_purple"], "peach": COLOURS["strap_peach"], "green": COLOURS["strap_green"]},
        "attach_rings": list(P["STRAP_RINGS"]),
    }
    return anchors


def build_apex(col, hat, M):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.006, radius2=0.0005, depth=0.008,
                          matrix=Matrix.Translation((0, 0, H + 0.001)))
    o = bm_to_object("apex_cap", bm, M["leaf_cap"], col, hat, origin=(0, 0, H))
    o["layer"] = "leaf_outer"


def build_anchors(col, hat, strap_anchors, meta):
    group = empty("anchors", col, hat)
    s3 = ring_frame(3)[0]
    front = math.radians(270)  # front of the hat faces −Y (towards the camera)
    pts = {
        "anchor_strap_L": strap_anchors["L"], "anchor_strap_R": strap_anchors["R"],
        "anchor_hint_trace_start": cone_point(s3, front - 0.6, OFF["stitch"]),
        "anchor_label_brim": cone_point(L, front + 0.35, 0.006),
    }
    for name, p in pts.items():
        empty(name, col, group, matrix=Matrix.Translation(p), size=0.01)
    meta["anchors"] = {k: to_gltf(v) for k, v in pts.items()}


# --------------------------------------------------------------------------- render rig (never exported)

def build_render_rig(scene):
    rig = bpy.data.collections.new("RENDER_RIG")
    scene.collection.children.link(rig)
    world = bpy.data.worlds.new("golden_hour")
    scene.world = world
    nt = world.node_tree if world.node_tree else None
    if nt is None:
        world.use_nodes = True
        nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*hex_rgb("#E8C890"), 1)
    bg.inputs["Strength"].default_value = 0.5

    def light(name, kind, energy, colour, loc, rot, size=None, angle=None):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = colour
        if size is not None:
            d.size = size
        if angle is not None:
            d.angle = math.radians(angle)
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = [math.radians(v) for v in rot]
        rig.objects.link(o)
        return o

    light("KEY_SUN", "SUN", 3.5, (1.0, 0.80, 0.55), (0, 0, 2), (58, 0, 135), angle=2.5)
    light("FILL_AREA", "AREA", 60, (1.0, 0.86, 0.72), (1.0, -1.1, 0.6), (65, 0, 42), size=1.2)
    light("BOUNCE_AREA", "AREA", 25, (0.78, 0.42, 0.25), (0.2, -0.7, -0.45), (-60, 0, 10), size=1.0)

    floor_bm = bmesh.new()
    bmesh.ops.create_circle(floor_bm, cap_ends=True, segments=64, radius=1.5)
    me = bpy.data.meshes.new("shadow_catcher")
    floor_bm.to_mesh(me)
    floor_bm.free()
    floor = bpy.data.objects.new("shadow_catcher", me)
    floor.location = (0, 0, -0.30)
    floor.is_shadow_catcher = True
    rig.objects.link(floor)

    cam_d = bpy.data.cameras.new("CAM_HERO")
    cam_d.sensor_fit = "VERTICAL"
    cam_d.angle_y = math.radians(32.2)
    cam = bpy.data.objects.new("CAM_HERO", cam_d)
    # hero view: yaw 30°, elevation 24°, 1.35 m (matches the three.js start view)
    yaw, elev, dist = math.radians(-90 + 30), math.radians(24), float(arg("--dist", "1.35"))
    target = Vector((0, 0, 0.06))
    cam.location = target + Vector((math.cos(elev) * math.cos(yaw), math.cos(elev) * math.sin(yaw), math.sin(elev))) * dist
    rig.objects.link(cam)
    tgt = bpy.data.objects.new("CAM_HERO_target", None)
    tgt.location = target
    rig.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    scene.camera = cam

    w, h = (int(v) for v in RES.split("x"))
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = False
    # "Standard" keeps the golden straw and strap colours saturated for children; the web viewer
    # uses NeutralToneMapping so both read the same.
    scene.view_settings.view_transform = arg("--view", "Standard")
    scene.view_settings.exposure = float(arg("--exposure", "-0.35"))
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        cp = prefs.preferences
        for dev in ("OPTIX", "CUDA"):
            try:
                cp.compute_device_type = dev
                cp.get_devices()
            except TypeError:
                continue
            if any(d.type == dev for d in cp.devices):
                for d in cp.devices:
                    d.use = d.type == dev
                scene.cycles.device = "GPU"
                break
    return rig


# --------------------------------------------------------------------------- main

def main():
    scene = reset_scene()
    tex = ensure_textures()
    M = build_materials(tex)
    col = bpy.data.collections.new("NONLA")
    scene.collection.children.link(col)
    root = empty("nonla_root", col)
    hat = empty("hat_assembly", col, root)
    meta = {
        "version": 1, "units": "m", "up": "Y", "front": "-Z (glTF) / -Y (Blender)",
        "params": {"brim_d": P["BRIM_D"], "height": H, "slant": round(L, 5), "half_apex_deg": round(math.degrees(A), 3),
                   "ring_pitch": P["RING_PITCH"], "rib_count": P["RIBS"], "outer_leaves": P["OUTER_LEAVES"],
                   "panels": P["PANELS"], "sew_start_ring": P["SEW_START_RING"]},
        "inside_out": ["frame", "leaf_inner", "mo_bark", "poem_art", "leaf_outer", "stitches_white"],
        "build_order": ["frame", "leaf_inner", "poem_art", "leaf_outer", "stitches_white", "strap_rig"],
    }
    build_frame(col, hat, M, meta)
    s16 = ring_frame(16)[0]
    build_shell("leaf_inner", col, hat, M["leaf_inner"], OFF["leaf_inner"], 0.0, L + 0.002, 24, 96, "leaf_inner",
                thickness=0.0004)
    build_shell("mo_bark", col, hat, M["mo_bark"], OFF["mo"], s16 + 0.01, L - 0.004, 12, 64, "mo_bark")
    s3, s12 = ring_frame(3)[0], ring_frame(12)[0]
    build_shell("poem_art", col, hat, M["poem_art"], OFF["poem"], s12, s3, 10, 96, "poem_art")
    build_outer_leaves(col, hat, M, meta)
    build_white_stitches(col, hat, M, meta)
    build_brim(col, hat, M, meta)
    strap_anchors = build_strap(col, hat, M, meta)
    build_apex(col, hat, M)
    build_anchors(col, hat, strap_anchors, meta)

    tris = 0
    for o in col.all_objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    meta["triangles"] = tris

    build_render_rig(scene)

    # export only the NONLA collection
    layer_col = bpy.context.view_layer.layer_collection.children["NONLA"]
    bpy.context.view_layer.active_layer_collection = layer_col
    glb = os.path.join(OUT_DIR, "nonla.glb")
    want = dict(filepath=glb, export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
                export_attributes=True, export_cameras=False, export_lights=False, export_animations=False,
                export_materials="EXPORT", export_image_format="AUTO", export_texcoords=True, export_normals=True,
                export_tangents=False, use_active_collection=True, use_active_collection_with_nested=True)
    ok = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    dropped = [k for k in want if k not in ok]
    if dropped:
        print("[nonla] exporter ignored:", dropped)
    bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in ok})

    with open(os.path.join(OUT_DIR, "nonla.meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(",", ":"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "nonla.blend"), compress=True, relative_remap=True)

    if DO_RENDER:
        scene.render.filepath = os.path.join(OUT_DIR, "preview.png")
        bpy.ops.render.render(write_still=True)
    print(f"[nonla] {tris} triangles → {glb}")


if __name__ == "__main__":
    main()
