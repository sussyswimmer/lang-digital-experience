"""Renders for the web experience, built from the same procedural hat as the GLB (nonla_build.py).

Final quality runs on Max's PC (RTX 3070, OptiX); the cloud runs tiny CPU previews of the same jobs.

    blender -b --factory-startup -P blender/render_jobs.py -- --out D:/nonla-work/T3 --jobs intro,cover,stills,quiz,lineart --device OPTIX
    python3 blender/render_jobs.py --out /tmp/preview --jobs intro --preview --step 30

Jobs
  intro    270 frames @ 30 fps, 1920×1080 RGBA: assembled → exploded view → reassembled inside-out → hero view
           (EffectCraft adds the background, glow, dust and light sweeps; no text is baked in)
  cover    storybook cover, 2048×2048 RGBA
  stills   build-game layers from one locked camera (they stack in register), full hat, underside × 3 strap
           colours, brim close-up
  quiz     answer pictures: ring counts 8/16/30, squashed hat (no rings), extra-shiny hat, tight strap,
           leaf gap, tiny rings, recoloured strap
  lineart  colouring pages 1–2 (plain hat, hat with strap) as black Freestyle lines on white, 3000×2250

Every frame prints "PROGRESS <job> <done>/<total>" so the PC session can report progress.
"""

import math
import os
import sys
import time

import bpy  # noqa: E402  (must precede mathutils when running as the bpy module)
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nonla_build as nb  # noqa: E402

ARGV = nb.ARGV
OUT = os.path.abspath(nb.arg("--out", os.path.join(HERE, "renders")))
JOBS = [j for j in nb.arg("--jobs", "intro,cover,stills,quiz,lineart").split(",") if j]
PREVIEW = "--preview" in ARGV
DEVICE = nb.arg("--device", "OPTIX")
SAMPLES = int(nb.arg("--samples", "16" if PREVIEW else "160"))
SCALE = float(nb.arg("--scale", "0.33" if PREVIEW else "1.0"))
STEP = int(nb.arg("--step", "1"))
FRAMES = nb.arg("--frames", "")  # e.g. 1-270

INTRO_LEN = 270
REST_FRAME = 300


def log(*a):
    print("[render_jobs]", *a, flush=True)


# --------------------------------------------------------------------------- scene setup

def setup(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015 if not PREVIEW else 0.05
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.use_motion_blur = False
    scene.render.fps = 30
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.35
    if hasattr(scene.render, "use_persistent_data"):
        scene.render.use_persistent_data = True
    prefs = bpy.context.preferences.addons.get("cycles")
    scene.cycles.device = "CPU"
    if prefs and DEVICE.upper() != "CPU":
        cp = prefs.preferences
        for dev in (DEVICE.upper(), "CUDA"):
            try:
                cp.compute_device_type = dev
                cp.get_devices()
            except TypeError:
                continue
            if any(d.type == dev for d in cp.devices):
                for d in cp.devices:
                    d.use = d.type == dev
                scene.cycles.device = "GPU"
                log("device", dev)
                break
    if scene.cycles.device == "CPU":
        scene.render.threads_mode = "AUTO"
        log("device CPU")


def res(scene, w, h):
    scene.render.resolution_x = max(16, int(w * SCALE))
    scene.render.resolution_y = max(16, int(h * SCALE))
    scene.render.resolution_percentage = 100


def ob(name):
    return bpy.data.objects[name]


def look_at_camera(name, target, location, lens=None, fov_y=None):
    cam_d = bpy.data.cameras.new(name)
    cam_d.sensor_fit = "VERTICAL"
    if fov_y:
        cam_d.angle_y = math.radians(fov_y)
    if lens:
        cam_d.lens = lens
    cam = bpy.data.objects.new(name, cam_d)
    cam.location = location
    bpy.context.scene.collection.objects.link(cam)
    tgt = bpy.data.objects.new(name + "_target", None)
    tgt.location = target
    bpy.context.scene.collection.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    return cam, tgt


def orbit(target, yaw_deg, elev_deg, dist):
    yaw, elev = math.radians(yaw_deg), math.radians(elev_deg)
    # yaw 0 = looking at the front of the hat (front faces −Y in Blender)
    return Vector(target) + Vector((math.sin(yaw) * math.cos(elev), -math.cos(yaw) * math.cos(elev), math.sin(elev))) * dist


def render_still(scene, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"wrote {path} in {time.time() - t:.1f}s")


def studio_light(scene):
    """Stills light: a higher, softer sun so the cast shadow lands under the hat inside the frame, and a floor
    wide enough that its far edge never shows. The intro keeps the low golden-hour sun."""
    sun = ob("KEY_SUN")
    sun.rotation_euler = Euler((math.radians(25), 0, math.radians(135)))
    sun.data.angle = math.radians(9)
    ob("shadow_catcher").scale = (6, 6, 1)


def shadow_only(scene, parts, path):
    """Render just the shadow that `parts` cast on the floor (the parts themselves are invisible to the camera)."""
    set_visible(parts)
    casters = [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render and o.name != "shadow_catcher"]
    for o in casters:
        o.visible_camera = False
    render_still(scene, path)
    for o in casters:
        o.visible_camera = True


def set_visible(names, visible=True):
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name != "shadow_catcher":
            o.hide_render = True
    for n in names:
        for o in [ob(n)] + list(ob(n).children_recursive):
            if o.type == "MESH":
                o.hide_render = not visible


ALL_PARTS = ["frame", "leaf_inner", "mo_bark", "poem_art", "leaf_outer", "stitches_white", "brim", "strap_rig", "apex_cap"]


# --------------------------------------------------------------------------- intro animation

def key_loc(obj, frame, loc):
    obj.location = loc
    obj.keyframe_insert("location", frame=frame)


def key_scale(obj, frame, s):
    obj.scale = s
    obj.keyframe_insert("scale", frame=frame)


def key_quat(obj, frame, q):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = q
    obj.keyframe_insert("rotation_quaternion", frame=frame)


def hold_then_move(obj, prop, home, away, f_out, f_back):
    """home until f_out[0], away by f_out[1], hold, back home between f_back."""
    setter = {"loc": key_loc, "scale": key_scale, "quat": key_quat}[prop]
    setter(obj, 1, home)
    setter(obj, f_out[0], home)
    setter(obj, f_out[1], away)
    setter(obj, f_back[0], away)
    setter(obj, f_back[1], home)


def build_intro(scene, cam, tgt):
    hat = ob("hat_assembly")
    hat.rotation_mode = "XYZ"
    for f, yaw in ((1, 0), (30, 20), (100, 32), (140, 50), (230, 70), (270, 30)):
        hat.rotation_euler = Euler((0, 0, math.radians(yaw)))
        hat.keyframe_insert("rotation_euler", frame=f)

    up = Vector((0, 0, 1))
    hold_then_move(ob("strap_rig"), "loc", Vector(), Vector((0, 0, -0.20)), (31, 50), (212, 230))
    # nested cones stack upward far enough apart that each layer's skirt reads on its own
    hold_then_move(ob("stitches_white"), "loc", Vector(), up * 0.56, (35, 62), (200, 215))
    hold_then_move(ob("poem_art"), "loc", Vector(), up * 0.33, (55, 80), (172, 186))
    hold_then_move(ob("mo_bark"), "loc", Vector(), up * 0.23, (60, 85), (165, 180))
    hold_then_move(ob("leaf_inner"), "loc", Vector(), up * 0.12, (65, 90), (155, 172))
    hold_then_move(ob("leaf_outer_cap"), "loc", Vector(), up * 0.47, (78, 96), (198, 207))
    hold_then_move(ob("apex_cap"), "loc", ob("apex_cap").location.copy(), ob("apex_cap").location + up * 0.47, (78, 96), (198, 207))
    for name in ("brim_wire_inner", "brim_wire_outer", "brim_bark", "brim_thread_red"):
        o = ob(name)
        hold_then_move(o, "scale", Vector((1, 1, 1)), Vector((1.22, 1.22, 1)), (60, 90), (205, 218))
        hold_then_move(o, "loc", Vector(), Vector((0, 0, -0.05)), (60, 90), (205, 218))
    for i in range(1, nb.P["N_RINGS"] + 1):
        o = ob(f"ring_{i:02d}")
        home = o.location.copy()
        hold_then_move(o, "loc", home, home + up * 0.012 * (i - 1), (70 + i, 100), (141 + i // 2, 160))
    # outer leaves open like petals, then lift; close again 180–205
    for j in range(nb.P["PANELS"]):
        h = ob(f"leaf_outer_panel_{j:02d}_hinge")
        q_home = h.matrix_basis.to_quaternion()
        loc_home = h.location.copy()
        q_open = (h.matrix_basis @ Matrix.Rotation(math.radians(22), 4, "X")).to_quaternion()
        outward = (h.matrix_basis.to_3x3() @ Vector((0, 0, 1))).normalized()
        loc_open = loc_home + up * 0.42 + Vector((outward.x, outward.y, 0)).normalized() * 0.07
        a, b = 40 + 2 * j, 72 + 2 * j
        key_quat(h, 1, q_home)
        key_quat(h, a, q_home)
        key_quat(h, b, q_open)
        key_quat(h, 180 + j, q_open)
        key_quat(h, 196 + j, q_home)
        hold_then_move(h, "loc", loc_home, loc_open, (a, b), (180 + j, 196 + j))

    # camera: hero → pulled back for the exploded view → hero
    hero_t = Vector((0, 0, 0.06))
    for f, (yaw, elev, dist, tz) in ((1, (0, 24, 1.35, 0.06)), (30, (0, 24, 1.25, 0.06)), (95, (0, 14, 2.45, 0.24)),
                                     (140, (0, 14, 2.5, 0.24)), (225, (0, 24, 1.45, 0.07)), (270, (0, 24, 1.35, 0.06))):
        cam.location = orbit(Vector((0, 0, tz)), yaw, elev, dist)
        cam.keyframe_insert("location", frame=f)
        tgt.location = Vector((0, 0, tz))
        tgt.keyframe_insert("location", frame=f)
    scene.frame_start, scene.frame_end = 1, INTRO_LEN
    _ = hero_t


def job_intro(scene):
    cam, tgt = look_at_camera("CAM_INTRO", (0, 0, 0.06), orbit((0, 0, 0.06), 0, 24, 1.35), fov_y=32.2)
    scene.camera = cam
    build_intro(scene, cam, tgt)
    res(scene, 1920, 1080)
    if not PREVIEW:
        scene.render.image_settings.color_depth = "16"  # headroom for EffectCraft's grade
    lo, hi = 1, INTRO_LEN
    if FRAMES:
        lo, hi = (int(x) for x in FRAMES.split("-"))
    frames = list(range(lo, hi + 1, STEP))
    for n, f in enumerate(frames, 1):
        scene.frame_set(f)
        path = os.path.join(OUT, "intro", f"frame_{f:04d}.png")
        if os.path.exists(path) and "--skip-existing" in ARGV:
            continue
        render_still(scene, path)
        print(f"PROGRESS intro {n}/{len(frames)}", flush=True)
    scene.frame_set(REST_FRAME)
    scene.render.image_settings.color_depth = "8"


# --------------------------------------------------------------------------- stills

def freeze_at_rest(scene):
    """After the intro is keyed, park everything at rest and drop the keys so stills can tweak transforms."""
    scene.frame_set(REST_FRAME)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data_clear()


def job_cover(scene):
    freeze_at_rest(scene)
    studio_light(scene)
    cam, _ = look_at_camera("CAM_COVER", (0, 0, -0.03), orbit((0, 0, -0.03), 25, 38, 1.25), fov_y=30)
    scene.camera = cam
    set_visible(ALL_PARTS)
    res(scene, 2048, 2048)
    render_still(scene, os.path.join(OUT, "cover", "cover.png"))
    print("PROGRESS cover 1/1", flush=True)


def job_coverhat(scene):
    """The cover's hat alone with no floor shadow, for the storybook cover (the 3D hat shrinks onto it)."""
    freeze_at_rest(scene)
    studio_light(scene)
    cam, _ = look_at_camera("CAM_COVER", (0, 0, -0.03), orbit((0, 0, -0.03), 25, 38, 1.25), fov_y=30)
    scene.camera = cam
    set_visible(ALL_PARTS)
    ob("shadow_catcher").hide_render = True
    res(scene, 1200, 1200)
    render_still(scene, os.path.join(OUT, "cover", "cover-hat.png"))
    ob("shadow_catcher").hide_render = False
    print("PROGRESS coverhat 1/1", flush=True)


# aimed a little below the brim so the floor shadow under the hat stays inside the frame
STILLS_CAM = dict(target=(0, 0, -0.04), yaw=18, elev=20, dist=1.32, fov=30)


def stills_camera(scene):
    c = STILLS_CAM
    cam, _ = look_at_camera("CAM_STILLS", c["target"], orbit(c["target"], c["yaw"], c["elev"], c["dist"]), fov_y=c["fov"])
    scene.camera = cam
    return cam


def recolour_strap(hexcol):
    mat = bpy.data.materials["mat_strap"]
    mix = next((n for n in mat.node_tree.nodes if n.type == "MIX"), None)
    if mix:
        mix.inputs["B"].default_value = (*nb.hex_rgb(hexcol), 1)


# the build game's order (brief 4a): frame → inner leaves → paper art → outer leaves → stitching → strap
GAME_LAYERS = [
    ("01-frame", ["frame"]),
    ("02-leaf-inner", ["leaf_inner"]),
    ("03-poem-art", ["poem_art"]),
    ("04-leaf-outer", ["leaf_outer", "apex_cap"]),
    ("05-stitches", ["stitches_white", "brim"]),
    ("06-strap", ["strap_rig"]),
]


def set_holdout(names, on):
    for n in names:
        for o in [ob(n)] + list(ob(n).children_recursive):
            if o.type == "MESH":
                o.is_holdout = on


def job_stills(scene):
    freeze_at_rest(scene)
    studio_light(scene)
    stills_camera(scene)
    res(scene, 1600, 1200)
    floor = ob("shadow_catcher")
    total = 2 * len(GAME_LAYERS) + 7
    n = 0
    # Build-game layers stack in register with no floor shadow of their own (the game puts the whole hat's
    # shadow, build-00-shadow, underneath once). Each build-0N is rendered with the layers already placed as
    # holdouts, so parts they hide (the back of the brim behind the cone, the strap ends inside the hat)
    # are cut out and the stack reads like the real hat; piece-0N is the whole piece for the tray.
    floor.hide_render = True
    placed = []
    for name, parts in GAME_LAYERS:
        set_visible(placed + parts)
        set_holdout(placed, True)
        render_still(scene, os.path.join(OUT, "stills", f"build-{name}.png"))
        set_holdout(placed, False)
        set_visible(parts)
        render_still(scene, os.path.join(OUT, "stills", f"piece-{name}.png"))
        placed += parts
        n += 2
        print(f"PROGRESS stills {n}/{total}", flush=True)
    set_visible(["mo_bark"])
    render_still(scene, os.path.join(OUT, "stills", "piece-mo-bark.png"))
    floor.hide_render = False
    set_visible(ALL_PARTS)
    render_still(scene, os.path.join(OUT, "stills", "hat-full.png"))
    n += 2
    print(f"PROGRESS stills {n}/{total}", flush=True)
    shadow_only(scene, ALL_PARTS, os.path.join(OUT, "stills", "build-00-shadow.png"))
    n += 1
    print(f"PROGRESS stills {n}/{total}", flush=True)
    # underside, three strap colours: the camera sits low, looking up under the brim (level with the floor,
    # which would show as a line, so it is hidden)
    set_visible(ALL_PARTS)
    floor.hide_render = True
    cam, _ = look_at_camera("CAM_UNDER", (0, 0, -0.04), orbit((0, 0, -0.04), 35, -12, 1.2), fov_y=34)
    scene.camera = cam
    for colour, hexcol in (("purple", nb.COLOURS["strap_purple"]), ("peach", nb.COLOURS["strap_peach"]),
                           ("green", nb.COLOURS["strap_green"])):
        recolour_strap(hexcol)
        render_still(scene, os.path.join(OUT, "stills", f"underside-{colour}.png"))
        n += 1
        print(f"PROGRESS stills {n}/{total}", flush=True)
    recolour_strap(nb.COLOURS["strap_purple"])
    # brim close-up: wire | bark | wire with the red wrap
    cam, _ = look_at_camera("CAM_BRIM", nb.cone_point(nb.L, math.radians(270), 0.0), Vector((0.05, -0.42, 0.06)), fov_y=14)
    scene.camera = cam
    render_still(scene, os.path.join(OUT, "stills", "brim-closeup.png"))
    floor.hide_render = False
    n += 1
    print(f"PROGRESS stills {n}/{total}", flush=True)


def frame_with_rings(n_rings):
    """A second frame (rings + ribs) with n rings spread over the same cone, for the ring-count quiz."""
    keep = dict(nb.P)
    nb.P["N_RINGS"] = n_rings
    nb.P["RING_PITCH"] = (nb.L - 0.0189) / (n_rings - 1)  # same top-ring position as the real 16-ring frame
    col = bpy.data.collections.new(f"QUIZ_RINGS_{n_rings}")
    bpy.context.scene.collection.children.link(col)
    holder = nb.empty(f"quiz_rings_{n_rings}", col)
    M = {"bamboo": bpy.data.materials["mat_bamboo"], "joint": bpy.data.materials["mat_bamboo_joint"]}
    # build_frame names objects ring_NN — rename the existing ones out of the way first
    renamed = {}
    for o in list(bpy.data.objects):
        if o.name.startswith(("ring_", "rib_", "frame", "rings", "ribs")) and o.name not in renamed:
            renamed[o.name] = o
            o.name = "orig__" + o.name
    nb.build_frame(col, holder, M, {})
    made = [o for o in col.all_objects]
    for o in made:
        o.name = f"q{n_rings}__" + o.name
    for old, o in renamed.items():
        o.name = old
    nb.P.clear()
    nb.P.update(keep)
    return holder, made


def job_quiz(scene):
    freeze_at_rest(scene)
    studio_light(scene)
    stills_cam = stills_camera(scene)
    res(scene, 1200, 900)
    jobs = []

    def shot(name, parts, before=None, after=None):
        jobs.append((name, parts, before, after))

    # Q4: how many rings? (each render shows only that frame)
    extra = {}
    for n in (8, 30):
        holder, made = frame_with_rings(n)
        extra[n] = made
        for o in made:
            o.hide_render = True

    def show_ring_set(n):
        def f():
            set_visible([])
            objs = extra[n] if n != 16 else [o for o in ob("frame").children_recursive]
            for o in objs:
                if o.type == "MESH":
                    o.hide_render = False
        return f

    for n in (8, 16, 30):
        shot(f"q4-rings-{n:02d}", [], before=show_ring_set(n))

    hat = ob("hat_assembly")

    hinges = [ob(f"leaf_outer_panel_{j:02d}_hinge") for j in range(nb.P["PANELS"])]
    saved = [h.matrix_basis.copy() for h in hinges]

    def squash():
        hat.scale = (1.15, 1.15, 0.38)
        for j, h in enumerate(hinges):
            h.matrix_basis = saved[j] @ Matrix.Rotation(math.radians(8 * math.sin(j * 1.7)), 4, "X")

    def unsquash():
        hat.scale = (1, 1, 1)
        for j, h in enumerate(hinges):
            h.matrix_basis = saved[j]

    shot("q2-no-rings-floppy", [p for p in ALL_PARTS if p != "frame"], before=squash, after=unsquash)

    def shiny():
        m = bpy.data.materials["mat_leaf_outer"]
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Roughness"].default_value = 0.08
        if "Coat Weight" in b.inputs:
            b.inputs["Coat Weight"].default_value = 1.0

    def unshiny():
        m = bpy.data.materials["mat_leaf_outer"]
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Roughness"].default_value = 0.45
        if "Coat Weight" in b.inputs:
            b.inputs["Coat Weight"].default_value = 0.3

    shot("q2-shinier", ALL_PARTS, before=shiny, after=unshiny)

    strap = ob("strap")
    # seen from under the brim like the underside stills, so the short, pulled-up strap is clearly in view
    low_cam, _ = look_at_camera("CAM_Q2_TIGHT", (0, 0, -0.04), orbit((0, 0, -0.04), 30, -10, 1.2), fov_y=32)
    floor = ob("shadow_catcher")

    def tight():
        strap.scale = (1, 1, 0.45)
        scene.camera = low_cam
        floor.hide_render = True

    def loose():
        strap.scale = (1, 1, 1)
        scene.camera = stills_cam
        floor.hide_render = False

    shot("q2-tight-strap", ALL_PARTS, before=tight, after=loose)

    def gap():
        ob("leaf_outer_panel_09").hide_render = True
        ob("leaf_inner").hide_render = True  # a real gap: you can see through to the frame

    shot("q3-leaf-gap", ALL_PARTS, before=gap)

    def tiny():
        for i in range(1, nb.P["N_RINGS"] + 1):
            ob(f"ring_{i:02d}").scale = (0.45, 0.45, 1)

    def untiny():
        for i in range(1, nb.P["N_RINGS"] + 1):
            ob(f"ring_{i:02d}").scale = (1, 1, 1)

    shot("q3-tiny-rings", ["frame"], before=tiny, after=untiny)
    shot("q3-strap-new-colour", ALL_PARTS, before=lambda: recolour_strap(nb.COLOURS["strap_green"]),
         after=lambda: recolour_strap(nb.COLOURS["strap_purple"]))

    for n, (name, parts, before, after) in enumerate(jobs, 1):
        if parts:
            set_visible(parts)
        if before:
            before()
        render_still(scene, os.path.join(OUT, "quiz", f"{name}.png"))
        if after:
            after()
        print(f"PROGRESS quiz {n}/{len(jobs)}", flush=True)


# --------------------------------------------------------------------------- line art (colouring pages 1–2)

def job_lineart(scene):
    freeze_at_rest(scene)
    stills_camera(scene)
    res(scene, 3000, 2250)
    scene.render.film_transparent = False
    world = scene.world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    old_bg = tuple(bg.inputs["Color"].default_value), bg.inputs["Strength"].default_value
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 1.0
    # flat white everything (emission), black Freestyle outlines
    white = bpy.data.materials.new("lineart_white")
    nt = white.node_tree if white.node_tree else None
    if nt is None:
        white.use_nodes = True
        nt = white.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1, 1, 1, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    vl = scene.view_layers[0]
    vl.material_override = white
    old_exposure = scene.view_settings.exposure
    scene.view_settings.exposure = 0.0
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 2.6 * SCALE / 0.33 if PREVIEW else 2.6
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("lines")
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle.color = (0, 0, 0)
    ls.linestyle.thickness = 2.6
    floor = bpy.data.objects.get("shadow_catcher")
    if floor:
        floor.hide_render = True
    pages = [("page-1-plain", [p for p in ALL_PARTS if p not in ("strap_rig", "stitches_white")]),
             ("page-2-strap", [p for p in ALL_PARTS if p != "stitches_white"])]
    for n, (name, parts) in enumerate(pages, 1):
        set_visible(parts)
        render_still(scene, os.path.join(OUT, "lineart", f"{name}.png"))
        print(f"PROGRESS lineart {n}/{len(pages)}", flush=True)
    vl.material_override = None
    scene.view_settings.exposure = old_exposure
    scene.render.use_freestyle = False
    bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (*old_bg[0][:3], 1), old_bg[1]
    scene.render.film_transparent = True
    if floor:
        floor.hide_render = False


# --------------------------------------------------------------------------- main

def main():
    t0 = time.time()
    scene, _col, _meta = nb.build_scene()
    setup(scene)
    os.makedirs(OUT, exist_ok=True)
    for job in JOBS:
        log("job", job)
        {"intro": job_intro, "cover": job_cover, "coverhat": job_coverhat, "stills": job_stills, "quiz": job_quiz,
         "lineart": job_lineart}[job](scene)
    log(f"all done in {time.time() - t0:.0f}s → {OUT}")


if __name__ == "__main__":
    main()
