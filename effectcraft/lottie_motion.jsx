// Small Lottie motion graphics (shapes + transforms only; Lottie drops raster effects). Run with:
//   effectcraft-cli script effectcraft/lottie_motion.jsx
var ROOT = "C:/Users/maxwe/lang-digital-experience/";
function rgb(hex) { return [parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255, parseInt(hex.substr(5, 2), 16) / 255]; }
function log(s) { writeLn("[lottie_motion] " + s); }

// a shape layer with one ellipse/rect/star; tries AE match names, then display names
function shape(comp, name, kind, size, fill, stroke, strokeW) {
  var layer = comp.layers.addShape();
  layer.name = name;
  try {
    var grp = layer.property("Contents").addProperty("ADBE Vector Group");
    var c = grp.property("Contents");
    var shp = kind === "rect" ? c.addProperty("ADBE Vector Shape - Rect")
      : kind === "star" ? c.addProperty("ADBE Vector Shape - Star") : c.addProperty("ADBE Vector Shape - Ellipse");
    if (kind === "star") {
      shp.property("Points").setValue(5);
      shp.property("Outer Radius").setValue(size[0] / 2);
      shp.property("Inner Radius").setValue(size[0] / 4.5);
    } else {
      shp.property("Size").setValue(size);
      if (kind === "rect") shp.property("Roundness").setValue(size[1] / 2);
    }
    if (fill) c.addProperty("ADBE Vector Graphic - Fill").property("Color").setValue(rgb(fill));
    if (stroke) {
      var st = c.addProperty("ADBE Vector Graphic - Stroke");
      st.property("Color").setValue(rgb(stroke));
      st.property("Stroke Width").setValue(strokeW || 8);
    }
  } catch (e) {
    log("shape API differs (" + e + ") for " + name);
  }
  return layer;
}
function k(prop, pairs, fps) { for (var i = 0; i < pairs.length; i++) prop.setValueAtTime(pairs[i][0] / fps, pairs[i][1]); }

// BADGE_POP: medal ring overshoots in, 8 rays burst, 3 sparkle stars twinkle (the badge icon sits underneath in the DOM)
var fps = 30;
var b = app.project.items.addComp("BADGE_POP", 400, 400, 1, 36 / fps, fps);
for (var r = 0; r < 8; r++) {
  var ray = shape(b, "ray" + r, "rect", [14, 60], "#F6A623");
  var tr = ray.property("Transform");
  tr.property("Rotation").setValue(r * 45);
  var a = r * Math.PI / 4;
  k(tr.property("Position"), [[4, [200, 200]], [16, [200 + Math.sin(a) * 150, 200 - Math.cos(a) * 150]]], fps);
  k(tr.property("Opacity"), [[4, 0], [8, 100], [20, 0]], fps);
}
var ring = shape(b, "ring", "ellipse", [250, 250], null, "#E0A93B", 18);
k(ring.property("Transform").property("Scale"), [[0, [0, 0]], [10, [115, 115]], [16, [100, 100]]], fps);
var stars = [[90, 110], [320, 90], [300, 320]];
for (var s = 0; s < stars.length; s++) {
  var st = shape(b, "star" + s, "star", [44, 44], "#FFF3C4");
  st.property("Transform").property("Position").setValue(stars[s]);
  k(st.property("Transform").property("Scale"), [[8 + s * 4, [0, 0]], [14 + s * 4, [120, 120]], [24 + s * 4, [0, 0]]], fps);
}

// SPARKLE: six dots pop outward (used for small celebrations)
var sp = app.project.items.addComp("SPARKLE", 256, 256, 1, 24 / fps, fps);
var cols = ["#E0457B", "#F6A623", "#7FBF5E", "#E0A93B", "#7EC8E3", "#C4623D"];
for (var d = 0; d < 6; d++) {
  var dot = shape(sp, "dot" + d, "ellipse", [22, 22], cols[d]);
  var ang = d * Math.PI / 3;
  k(dot.property("Transform").property("Position"), [[0, [128, 128]], [14, [128 + Math.cos(ang) * 96, 128 + Math.sin(ang) * 96]]], fps);
  k(dot.property("Transform").property("Scale"), [[0, [40, 40]], [8, [110, 110]], [24, [0, 0]]], fps);
}

// TAP_RIPPLE: two expanding rings (paired with the hand hint on tap steps)
var tp = app.project.items.addComp("TAP_RIPPLE", 256, 256, 1, 40 / fps, fps);
for (var q = 0; q < 2; q++) {
  var rp = shape(tp, "ripple" + q, "ellipse", [80, 80], null, "#F6A623", 10);
  k(rp.property("Transform").property("Scale"), [[q * 12, [40, 40]], [q * 12 + 24, [260, 260]]], fps);
  k(rp.property("Transform").property("Opacity"), [[q * 12, 100], [q * 12 + 24, 0]], fps);
}

app.project.save(new File(ROOT + "raw-assets/video-edited/projects/lottie_motion.ecproj"));
log("comps: BADGE_POP, SPARKLE, TAP_RIPPLE");
"ok";
