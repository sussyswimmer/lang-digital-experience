// INTRO_SCROLL: effects over the Blender intro (explode → reassemble). Run with:
//   effectcraft-cli script effectcraft/intro_scroll.jsx
// then render (see the T4 packet). Paths are absolute for Max's PC.
var ROOT = "C:/Users/maxwe/lang-digital-experience/";
var FRAMES = "D:/nonla-work/T6/intro/frame_0001.png"; // first PNG of the 270-frame RGBA sequence (1440p master)
var W = 2560, H = 1440, FPS = 30, N = 270, DUR = N / FPS;
var S = W / 1920; // effect sizes were tuned at 1080p; scale them with the frame
var SNAPS = [160, 172, 180, 186, 205, 215, 218, 230]; // frames where a layer snaps home

function t(f) { return (f - 1) / FPS; }
function rgb(hex) { return [parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255, parseInt(hex.substr(5, 2), 16) / 255]; }
function log(s) { writeLn("[intro_scroll] " + s); }
function setParam(fx, names, value, time) {
  for (var i = 0; i < names.length; i++) {
    try {
      var p = fx.property(names[i]);
      if (p) { if (time === undefined) p.setValue(value); else p.setValueAtTime(time, value); return true; }
    } catch (e) {}
  }
  log("param not found on " + fx.name + ": " + names.join(" | "));
  return false;
}
function addFx(layer, names) {
  for (var i = 0; i < names.length; i++) {
    try { var fx = layer.property("Effects").addProperty(names[i]); if (fx) return fx; } catch (e) {}
  }
  log("effect not available: " + names.join(" | "));
  return null;
}
function blend(layer, mode) { try { layer.blendingMode = mode; } catch (e) { log("blend mode not set on " + layer.name); } }
function keys(prop, pairs) { for (var i = 0; i < pairs.length; i++) prop.setValueAtTime(t(pairs[i][0]), pairs[i][1]); }

var comp = app.project.items.addComp("INTRO_SCROLL", W, H, 1, DUR, FPS);

// 1. warm paper-gold gradient background
var bg = comp.layers.addSolid(rgb("#E9C88A"), "bg", W, H, 1, DUR);
var ramp = addFx(bg, ["Gradient Ramp", "Ramp"]);
if (ramp) {
  setParam(ramp, ["Start of Ramp"], [W / 2, 0]);
  setParam(ramp, ["Start Color"], rgb("#F6E7C4"));
  setParam(ramp, ["End of Ramp"], [W / 2, H]);
  setParam(ramp, ["End Color"], rgb("#D9A35F"));
}

// 2. soft warm light leak (fractal noise, screen), at the start and the end
var leak = comp.layers.addSolid(rgb("#F2A93B"), "light_leak", W, H, 1, DUR);
var fn = addFx(leak, ["Fractal Noise"]);
if (fn) {
  setParam(fn, ["Contrast"], 160);
  setParam(fn, ["Brightness"], -20);
  setParam(fn, ["Scale"], 900 * S);
  setParam(fn, ["Evolution"], 0, 0);
  setParam(fn, ["Evolution"], 220, DUR);
}
var tint = addFx(leak, ["Tint"]);
if (tint) { setParam(tint, ["Map White To"], rgb("#FFD27A")); setParam(tint, ["Map Black To"], rgb("#C46A3E")); }
blend(leak, BlendingMode.SCREEN);
keys(leak.property("Transform").property("Opacity"), [[1, 0], [20, 32], [60, 0], [220, 0], [245, 26], [270, 0]]);

// 3. the hat (Blender RGBA sequence)
var io = new ImportOptions(new File(FRAMES));
io.sequence = true;
var seq = app.project.importFile(io);
try { seq.mainSource.conformFrameRate = FPS; } catch (e) {}
var hat = comp.layers.add(seq);
hat.name = "hat";
var glow = addFx(hat, ["Glow"]);
if (glow) {
  setParam(glow, ["Glow Threshold", "Threshold"], 68);
  setParam(glow, ["Glow Radius", "Radius"], 36 * S);
  var gi = ["Glow Intensity", "Intensity"];
  setParam(glow, gi, 0.25, 0);
  for (var s = 0; s < SNAPS.length; s++) {
    setParam(glow, gi, 0.25, t(SNAPS[s] - 3));
    setParam(glow, gi, 1.1, t(SNAPS[s]));
    setParam(glow, gi, 0.25, t(SNAPS[s] + 6));
  }
}
var sweep = addFx(hat, ["CC Light Sweep"]);
if (sweep) {
  setParam(sweep, ["Center"], [-200 * S, H * 0.45], t(212));
  setParam(sweep, ["Center"], [W + 200 * S, H * 0.45], t(262));
  setParam(sweep, ["Width"], 90 * S);
  setParam(sweep, ["Sweep Intensity", "Intensity"], 60);
  setParam(sweep, ["Light Color"], rgb("#FFE7A3"));
}

// 4. sparse straw-dust particles (≤ 80 on screen keeps the WebP frames small)
var dust = comp.layers.addSolid(rgb("#000000"), "dust", W, H, 1, DUR);
var pw = addFx(dust, ["CC Particle World"]);
if (pw) {
  setParam(pw, ["Birth Rate"], 0.15);
  setParam(pw, ["Longevity (sec)", "Longevity"], 6);
  setParam(pw, ["Gravity"], -0.01);
  setParam(pw, ["Radius X"], 1.4);
  setParam(pw, ["Radius Y"], 0.8);
  setParam(pw, ["Birth Size"], 0.03);
  setParam(pw, ["Death Size"], 0.02);
  setParam(pw, ["Birth Color"], rgb("#FFF3D2"));
  setParam(pw, ["Death Color"], rgb("#F2C77A"));
}
blend(dust, BlendingMode.ADD);
dust.property("Transform").property("Opacity").setValue(40);

// 5. soft flash at the exploded peak
var flash = comp.layers.addSolid(rgb("#FFF6DA"), "flash", W, H, 1, DUR);
blend(flash, BlendingMode.ADD);
keys(flash.property("Transform").property("Opacity"), [[1, 0], [94, 0], [100, 38], [112, 0]]);

// 6. gentle vignette
var adj = comp.layers.addSolid(rgb("#FFFFFF"), "vignette", W, H, 1, DUR);
try { adj.adjustmentLayer = true; } catch (e) { log("adjustment layer flag not supported"); }
var vig = addFx(adj, ["CC Vignette", "Vignette"]);
if (vig) setParam(vig, ["Amount"], 28);

// 7. fade into the page colour so the web page continues seamlessly
var fade = comp.layers.addSolid(rgb("#F3DFAE"), "end_fade", W, H, 1, DUR);
keys(fade.property("Transform").property("Opacity"), [[1, 0], [255, 0], [270, 100]]);

app.project.save(new File(ROOT + "raw-assets/video-edited/projects/intro_scroll.ecproj"));
log("layers=" + comp.numLayers + " duration=" + DUR + "s");
"ok";
