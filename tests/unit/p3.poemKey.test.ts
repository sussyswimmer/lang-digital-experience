import { describe, expect, it } from 'vitest';
import ann from '../../content/phase3.json';
import { keyGlow, polygonMask, smoothstep } from '../../src/phases/phase3/poemKey';
import { inPolygon } from '../../src/phases/phase3/geometry';

const region = ann.heritage.hatRegion.map(([x, y]) => ({ x, y }));

describe('Chapter 2 poem hat light key', () => {
  it('the hat outline excludes the title lettering and the photographer’s mark', () => {
    // "TÂY HỒ / Poem Conical Hat" sits top right, the handle bottom right
    expect(inPolygon({ x: 0.78, y: 0.12 }, region)).toBe(false);
    expect(inPolygon({ x: 0.78, y: 0.19 }, region)).toBe(false);
    expect(inPolygon({ x: 0.93, y: 0.985 }, region)).toBe(false);
    // the poem lines and the silhouettes are inside
    expect(inPolygon({ x: 0.45, y: 0.52 }, region)).toBe(true);
    expect(inPolygon({ x: 0.5, y: 0.65 }, region)).toBe(true);
    expect(inPolygon({ x: 0.2, y: 0.7 }, region)).toBe(true);
  });

  it('keeps bright leaf inside the hat, drops dark pixels and anything outside', () => {
    const w = 4;
    const h = 1;
    // bright in, dark in, bright out, mid-grey in
    const src = new Uint8ClampedArray([230, 220, 190, 255, 20, 18, 15, 255, 240, 235, 220, 255, 110, 110, 110, 255]);
    const mask = new Uint8Array([1, 1, 0, 1]);
    const out = keyGlow(src, mask, { lo: 70, hi: 150 });
    expect(out[3]).toBe(255);
    expect(out[0]).toBeGreaterThan(out[2]); // warmed: more red than blue
    expect(out[7]).toBe(0);
    expect(out[11]).toBe(0);
    expect(out[15]).toBeGreaterThan(0);
    expect(out[15]).toBeLessThan(255);
    expect(out.length).toBe(w * h * 4);
  });

  it('rasterises the outline mask', () => {
    const m = polygonMask([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 10, 10);
    expect(m[0]).toBe(1);
    expect(m[99]).toBe(0);
  });

  it('smoothstep is clamped and monotonic', () => {
    expect(smoothstep(10, 20, 0)).toBe(0);
    expect(smoothstep(10, 20, 30)).toBe(1);
    expect(smoothstep(10, 20, 15)).toBeCloseTo(0.5);
  });
});
