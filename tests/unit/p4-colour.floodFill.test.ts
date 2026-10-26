import { describe, expect, it } from 'vitest';
import { floodFill, hexToRGBA, packRGBA, type PixelBuffer } from '../../src/phases/phase4/colour/floodFill';
import { dilate } from '../../src/phases/phase4/colour/lineart';

const RED = [215, 38, 61, 255] as const;
const BLUE = [58, 111, 176, 255] as const;

function buffer(w: number, h: number): PixelBuffer {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

function px(b: PixelBuffer, x: number, y: number): number[] {
  const o = (y * b.width + x) * 4;
  return Array.from(b.data.subarray(o, o + 4));
}

/** a 1 px rectangle outline, optionally with a gap of `gap` px in its top edge */
function boxBarrier(w: number, h: number, x0: number, y0: number, x1: number, y1: number, gap = 0): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let x = x0; x <= x1; x++) {
    m[y0 * w + x] = 1;
    m[y1 * w + x] = 1;
  }
  for (let y = y0; y <= y1; y++) {
    m[y * w + x0] = 1;
    m[y * w + x1] = 1;
  }
  const mid = Math.floor((x0 + x1) / 2);
  for (let k = 0; k < gap; k++) m[y0 * w + mid + k] = 0;
  return m;
}

function countColour(b: PixelBuffer, rgba: readonly number[]): number {
  const want = packRGBA(rgba as [number, number, number, number]);
  const v = new Uint32Array(b.data.buffer);
  let n = 0;
  for (const c of v) if (c === want) n++;
  return n;
}

describe('floodFill', () => {
  it('fills a closed shape exactly, and nothing outside it', () => {
    const b = buffer(40, 30);
    const bar = boxBarrier(40, 30, 5, 5, 20, 15);
    const rect = floodFill(b, bar, 10, 10, RED);
    expect(rect).toEqual({ x: 6, y: 6, w: 14, h: 9 });
    expect(countColour(b, RED)).toBe(14 * 9);
    expect(px(b, 10, 10)).toEqual([...RED]);
    expect(px(b, 5, 5)).toEqual([0, 0, 0, 0]); // the line itself
    expect(px(b, 30, 25)).toEqual([0, 0, 0, 0]); // outside
  });

  it('never crosses a barrier, even diagonally thin ones', () => {
    const w = 30;
    const h = 30;
    const bar = new Uint8Array(w * h);
    // a 1 px 4-connected diagonal staircase from top-left to bottom-right
    for (let i = 0; i < w; i++) {
      bar[i * w + i] = 1;
      if (i + 1 < w) bar[i * w + i + 1] = 1;
    }
    const b = buffer(w, h);
    floodFill(b, bar, 2, 20, BLUE);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > y + 1) expect(px(b, x, y)[3]).toBe(0);
      }
    }
    expect(px(b, 2, 20)).toEqual([...BLUE]);
  });

  it('a 2 px gap in the line is closed by dilating the barrier (gapClose = 2)', () => {
    const w = 60;
    const h = 40;
    const raw = boxBarrier(w, h, 10, 10, 40, 30, 2);
    // without gap closing the fill leaks out
    const leaky = buffer(w, h);
    floodFill(leaky, raw, 25, 20, RED);
    expect(px(leaky, 2, 2)).toEqual([...RED]);
    // with it, the outside stays clean
    const b = buffer(w, h);
    const rect = floodFill(b, dilate(raw, w, h, 2), 25, 20, RED, { edgeBleed: 3 });
    expect(rect).not.toBeNull();
    expect(px(b, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(px(b, 25, 3)).toEqual([0, 0, 0, 0]);
    expect(px(b, 25, 20)).toEqual([...RED]);
  });

  it('edge bleed paints up to the real line, under the dilated margin, but not past it', () => {
    const w = 60;
    const h = 40;
    const raw = boxBarrier(w, h, 10, 10, 40, 30);
    const b = buffer(w, h);
    floodFill(b, dilate(raw, w, h, 2), 25, 20, RED, { edgeBleed: 3 });
    // margin pixels between the line (x = 10) and the dilated edge are painted
    expect(px(b, 11, 20)).toEqual([...RED]);
    expect(px(b, 12, 20)).toEqual([...RED]);
    // the line pixel itself is covered too (it sits under the line layer)
    expect(px(b, 10, 20)).toEqual([...RED]);
    // outside the line is untouched
    expect(px(b, 9, 20)).toEqual([0, 0, 0, 0]);
    expect(px(b, 8, 20)).toEqual([0, 0, 0, 0]);
  });

  it('a seed on a barrier returns null and changes nothing', () => {
    const b = buffer(40, 30);
    const bar = boxBarrier(40, 30, 5, 5, 20, 15);
    expect(floodFill(b, bar, 5, 10, RED)).toBeNull();
    expect(countColour(b, RED)).toBe(0);
  });

  it('filling with the colour already there is a no-op', () => {
    const b = buffer(40, 30);
    const bar = boxBarrier(40, 30, 5, 5, 20, 15);
    floodFill(b, bar, 10, 10, RED);
    let called = false;
    expect(floodFill(b, bar, 10, 10, RED, { beforeWrite: () => (called = true) })).toBeNull();
    expect(called).toBe(false);
  });

  it('colour mode keeps brushed paint; region mode fills the whole shape', () => {
    const w = 40;
    const h = 30;
    const bar = boxBarrier(w, h, 5, 5, 30, 25);
    const paintStripe = (b: PixelBuffer) => {
      for (let y = 6; y < 25; y++) b.data.set(BLUE, (y * w + 15) * 4);
    };
    const c = buffer(w, h);
    paintStripe(c);
    floodFill(c, bar, 8, 10, RED);
    expect(px(c, 15, 10)).toEqual([...BLUE]); // the brushed stripe survives
    expect(px(c, 8, 10)).toEqual([...RED]);
    expect(px(c, 20, 10)).toEqual([0, 0, 0, 0]); // the stripe walls off the right half

    const r = buffer(w, h);
    paintStripe(r);
    floodFill(r, bar, 8, 10, RED, { mode: 'region' });
    expect(px(r, 15, 10)).toEqual([...RED]);
    expect(px(r, 20, 10)).toEqual([...RED]);
  });

  it('tolerance: a soft gradient fills within the tolerance, not beyond', () => {
    const w = 64;
    const h = 4;
    const b = buffer(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data.set([x * 2, 100, 100, 255], (y * w + x) * 4);
    const bar = new Uint8Array(w * h);
    floodFill(b, bar, 0, 0, RED, { tolerance: 20 });
    expect(px(b, 10, 2)).toEqual([...RED]); // red channel 20, within 20 of the seed's 0
    expect(px(b, 11, 2)).toEqual([22, 100, 100, 255]); // 22 is beyond
  });

  it('reports the dirty rect to beforeWrite before touching any pixel', () => {
    const b = buffer(40, 30);
    const bar = boxBarrier(40, 30, 5, 5, 20, 15);
    let seen: number[] | null = null;
    floodFill(b, bar, 10, 10, RED, {
      beforeWrite: () => {
        seen = px(b, 10, 10);
      },
    });
    expect(seen).toEqual([0, 0, 0, 0]);
  });

  it('out-of-range seeds are ignored', () => {
    const b = buffer(10, 10);
    const bar = new Uint8Array(100);
    expect(floodFill(b, bar, -1, 3, RED)).toBeNull();
    expect(floodFill(b, bar, 3, 10, RED)).toBeNull();
  });

  it('hexToRGBA reads #rgb, #rrggbb and #rrggbbaa', () => {
    expect(hexToRGBA('#8E5BA8')).toEqual([142, 91, 168, 255]);
    expect(hexToRGBA('#fff')).toEqual([255, 255, 255, 255]);
    expect(hexToRGBA('#00000080')).toEqual([0, 0, 0, 128]);
  });

  it('fills 1600×1200 in under 60 ms', () => {
    const w = 1600;
    const h = 1200;
    // a page-like barrier: a frame of nested shapes, a few hundred lines, then dilated
    const raw = new Uint8Array(w * h);
    for (let k = 0; k < 12; k++) {
      const x0 = 100 + k * 50;
      const y0 = 80 + k * 40;
      const x1 = w - 100 - k * 50;
      const y1 = h - 80 - k * 40;
      for (let x = x0; x <= x1; x++) {
        raw[y0 * w + x] = 1;
        raw[y1 * w + x] = 1;
      }
      for (let y = y0; y <= y1; y++) {
        raw[y * w + x0] = 1;
        raw[y * w + x1] = 1;
      }
    }
    const bar = dilate(raw, w, h, 2);
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const b = buffer(w, h);
      const t0 = performance.now();
      // the outer region: the largest area, wrapped around every shape
      const rect = floodFill(b, bar, 5, 5, run % 2 ? RED : BLUE, { edgeBleed: 3 });
      best = Math.min(best, performance.now() - t0);
      expect(rect).not.toBeNull();
    }
    expect(best).toBeLessThan(60);
  });
});
