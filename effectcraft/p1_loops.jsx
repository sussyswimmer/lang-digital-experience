// P1 loops: warm grade + light vignette on the Higgsfield image-to-video clips. Run with:
//   effectcraft-cli script effectcraft/p1_loops.jsx
var ROOT = "C:/Users/maxwe/lang-digital-experience/";
var CLIPS = [["P1_RICE", "p1-rice"], ["P1_MARKET", "p1-market"], ["P1_RAIN", "p1-rain"], ["P1_CRAFT", "p1-craft"]];

function log(s) { writeLn("[p1_loops] " + s); }
function setParam(fx, names, value) {
  for (var i = 0; i < names.length; i++) {
    try { var p = fx.property(names[i]); if (p) { p.setValue(value); return true; } } catch (e) {}
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

for (var c = 0; c < CLIPS.length; c++) {
  var foot = app.project.importFile(new ImportOptions(new File(ROOT + "raw-assets/video-src/higgsfield/" + CLIPS[c][1] + ".mp4")));
  var dur = foot.duration || 5.04;
  var fps = foot.frameRate || 24;
  var comp = app.project.items.addComp(CLIPS[c][0], 1920, 1080, 1, dur, fps);
  var clip = comp.layers.add(foot);
  var pf = addFx(clip, ["Photo Filter"]);
  if (pf) { setParam(pf, ["Filter"], 1); setParam(pf, ["Density"], 14); }
  var vib = addFx(clip, ["Vibrance"]);
  if (vib) setParam(vib, ["Vibrance"], 10);
  var vig = addFx(clip, ["CC Vignette", "Vignette"]);
  if (vig) setParam(vig, ["Amount"], 18);
  log(CLIPS[c][0] + " " + dur + "s @" + fps);
}
app.project.save(new File(ROOT + "raw-assets/video-edited/projects/p1_loops.ecproj"));
"ok";
