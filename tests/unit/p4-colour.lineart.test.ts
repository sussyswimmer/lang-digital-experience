import { describe, expect, it } from 'vitest';
import { dilate, estimateStrokeWidth, inkAlpha, maxFilter, prepareLines } from '../../src/phases/phase4/colour/lineart';

/** RGBA image with a vertical stroke `sw` px wide at x = 10 and a horizontal one at y = 10 */
function cross(w: number, h: number, sw: number, ink: [number, number, number, number], paper: [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = (x >= 10 && x < 10 + sw) || (y >= 10 && y < 10 + sw);
      d.set(on ? ink : paper, (y * w + x) * 4);
    }
  return d;
}

describe('line art preparation', () => {
  it('reads black-on-transparent and black-on-white the same way', () => {
    const clear = inkAlpha(cross(30, 30, 4, [0, 0, 0, 255], [0, 0, 0, 0]));
    const white = inkAlpha(cross(30, 30, 4, [0, 0, 0, 255], [255, 255, 255, 255]));
    expect(clear[10 * 30 + 11]).toBe(255);
    expect(white[10 * 30 + 11]).toBe(255);
    expect(clear[0]).toBe(0);
    expect(white[0]).toBe(0);
  });

  it('antialiased grey edges read as partial ink', () => {
    const a = inkAlpha(new Uint8ClampedArray([128, 128, 128, 255]));
    expect(a[0]).toBeGreaterThan(80);
    expect(a[0]).toBeLessThan(255);
  });

  it('estimates the stroke width of a mask', () => {
    const w = 200;
    const h = 200;
    for (const sw of [3, 5, 8]) {
      const m = new Uint8Array(w * h);
      for (let y = 20; y < 180; y++) for (let x = 50; x < 50 + sw; x++) m[y * w + x] = 1;
      expect(estimateStrokeWidth(m, w, h)).toBeGreaterThan(sw - 1);
      expect(estimateStrokeWidth(m, w, h)).toBeLessThan(sw + 1);
    }
  });

  it('dilate grows a pixel into a (2r+1)² square', () => {
    const w = 9;
    const m = new Uint8Array(w * w);
    m[4 * w + 4] = 1;
    const d = dilate(m, w, w, 2);
    let n = 0;
    for (const v of d) n += v;
    expect(n).toBe(25);
    expect(d[2 * w + 2]).toBe(1);
    expect(d[1 * w + 4]).toBe(0);
  });

  it('maxFilter thickens grey strokes', () => {
    const w = 5;
    const src = new Uint8Array(w * w);
    src[2 * w + 2] = 200;
    const out = maxFilter(src, w, w, 1);
    expect(out[1 * w + 1]).toBe(200);
    expect(out[0]).toBe(0);
  });

  it('thin hairline renders are thickened, bold ones are left alone', () => {
    const thin = prepareLines(cross(60, 60, 1, [0, 0, 0, 255], [0, 0, 0, 0]), 60, 60);
    expect(thin.thickenedBy).toBeGreaterThan(0);
    expect(thin.ink[30 * 60 + 9]).toBe(255); // grown by a pixel
    const bold = prepareLines(cross(60, 60, 5, [0, 0, 0, 255], [0, 0, 0, 0]), 60, 60);
    expect(bold.thickenedBy).toBe(0);
    expect(bold.ink[30 * 60 + 9]).toBe(0);
  });

  it('the barrier is the ink dilated by gapClose', () => {
    const p = prepareLines(cross(60, 60, 4, [0, 0, 0, 255], [255, 255, 255, 255]), 60, 60, { gapClose: 2 });
    expect(p.barrier[30 * 60 + 8]).toBe(1); // 2 px left of the vertical stroke
    expect(p.barrier[30 * 60 + 7]).toBe(0);
    expect(p.barrier[30 * 60 + 15]).toBe(1); // 2 px right of it (stroke ends at x = 13)
    expect(p.barrier[30 * 60 + 16]).toBe(0);
  });
});
