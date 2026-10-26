/**
 * Line-art preparation (pure; unit-tested in tests/unit/p4-colour.lineart.test.ts).
 *
 * Pages arrive as black ink on transparent (Blender/Higgsfield PNGs) or as SVGs with white
 * fills for occlusion. Both become one "ink" alpha channel: dark = ink, white or clear = paper.
 * Thin renders are thickened so a child can see the shapes, and the fill barrier is the ink
 * mask dilated by `gapClose` px, which seals the 1–2 px gaps that renders tend to leave.
 */

export interface PreparedLines {
  width: number;
  height: number;
  /** ink coverage 0–255 per pixel (drawn as the line layer) */
  ink: Uint8Array;
  /** 1 where the fill may not go */
  barrier: Uint8Array;
  /** estimated stroke width before thickening, px */
  strokeWidth: number;
  /** px added on each side of every stroke */
  thickenedBy: number;
}

export interface PrepareOptions {
  /** ink coverage that counts as a line, 0–255 (default 80) */
  threshold?: number;
  /** barrier dilation radius, px (default 2) */
  gapClose?: number;
  /** strokes thinner than this (px) are thickened (default 3) */
  minStroke?: number;
}

/** ink coverage from straight RGBA: alpha scaled by darkness, so white and clear both read as paper */
export function inkAlpha(rgba: Uint8ClampedArray): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const a = rgba[o + 3];
    if (a === 0) continue;
    const lum = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
    // a little contrast so mid-grey antialiasing and dark-brown ink both read as solid lines
    const dark = Math.min(1, Math.max(0, (235 - lum) / 175));
    out[i] = Math.round(a * dark);
  }
  return out;
}

export function threshold(ink: Uint8Array, t: number): Uint8Array {
  const out = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) out[i] = ink[i] > t ? 1 : 0;
  return out;
}

/**
 * Typical stroke width of a binary mask: every ink pixel's local width is the shorter of its
 * horizontal and vertical ink runs; the median of those ignores dense hatching (a render's
 * stitched brim) that would inflate an average.
 */
export function estimateStrokeWidth(mask: Uint8Array, w: number, h: number): number {
  const hrun = new Uint16Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let x = 0;
    while (x < w) {
      if (!mask[row + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && mask[row + e]) e++;
      hrun.fill(Math.min(e - x, 65535), row + x, row + e);
      x = e;
    }
  }
  const hist = new Uint32Array(65);
  let total = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!mask[y * w + x]) {
        y++;
        continue;
      }
      let e = y;
      while (e < h && mask[e * w + x]) e++;
      for (let k = y; k < e; k++) {
        const local = Math.min(hrun[k * w + x], e - y, 64);
        hist[local]++;
        total++;
      }
      y = e;
    }
  }
  if (total === 0) return 0;
  let acc = 0;
  for (let v = 1; v <= 64; v++) {
    acc += hist[v];
    if (acc * 2 >= total) return v;
  }
  return 64;
}

/** binary dilation with a (2r+1)² square, separable, O(n) per pass */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let x = 0; x < Math.min(r, w); x++) count += mask[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += mask[row + x + r];
      if (x - r - 1 >= 0) count -= mask[row + x - r - 1];
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/** grey-level dilation (max filter) with a (2r+1)² square: thickens antialiased strokes */
export function maxFilter(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) if (src[row + k] > m) m = src[row + k];
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(src.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) {
        const v = tmp[k * w + x];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

export function prepareLines(rgba: Uint8ClampedArray, w: number, h: number, opts: PrepareOptions = {}): PreparedLines {
  const t = opts.threshold ?? 80;
  const gap = opts.gapClose ?? 2;
  const minStroke = opts.minStroke ?? 3;
  let ink = inkAlpha(rgba);
  let mask = threshold(ink, t);
  const strokeWidth = estimateStrokeWidth(mask, w, h);
  let thickenedBy = 0;
  if (strokeWidth > 0 && strokeWidth < minStroke) {
    thickenedBy = Math.max(1, Math.round((minStroke - strokeWidth) / 2));
    ink = maxFilter(ink, w, h, thickenedBy);
    mask = threshold(ink, t);
  }
  return { width: w, height: h, ink, barrier: dilate(mask, w, h, gap), strokeWidth, thickenedBy };
}

/** the visible line layer: warm dark ink with the computed coverage */
export function inkToRGBA(ink: Uint8Array, rgb: readonly [number, number, number], out?: Uint8ClampedArray): Uint8ClampedArray {
  const data = out ?? new Uint8ClampedArray(ink.length * 4);
  for (let i = 0, o = 0; i < ink.length; i++, o += 4) {
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = ink[i];
  }
  return data;
}
