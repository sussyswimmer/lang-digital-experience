/**
 * Chapter 2 "hold it up to the light" (pure, unit-tested). From the poem-hat photo we keep only
 * the bright, backlit leaf inside the hat outline (so the title lettering and the photographer's
 * mark disappear with the background), warm it up, and fade everything darker to transparent.
 * Drawn over a blacked-out photo, the hidden pictures and poem lines stand out against glowing leaf.
 */
import { inPolygon, type Pt } from './geometry';

export interface KeyOptions {
  /** luminance (0..255) where the key starts / is fully on */
  lo: number;
  hi: number;
}

export function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** 1 inside the polygon (normalised 0..1 coords), 0 outside, sampled at pixel centres */
export function polygonMask(poly: Pt[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const pts = poly.map((p) => ({ x: p.x * w, y: p.y * h }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (inPolygon({ x: x + 0.5, y: y + 0.5 }, pts)) mask[y * w + x] = 1;
  }
  return mask;
}

/** RGBA in → RGBA out: warm glow where bright and inside the mask, transparent elsewhere */
export function keyGlow(src: Uint8ClampedArray, mask: Uint8Array, opts: KeyOptions = { lo: 70, hi: 150 }): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    if (!mask[p]) continue;
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = smoothstep(opts.lo, opts.hi, lum);
    if (k <= 0) continue;
    out[i] = Math.min(255, r * 1.16 + 30);
    out[i + 1] = Math.min(255, g * 1.04 + 14);
    out[i + 2] = Math.min(255, b * 0.62);
    out[i + 3] = Math.round(k * 255);
  }
  return out;
}
