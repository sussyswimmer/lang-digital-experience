import { describe, expect, it } from 'vitest';
import { chooseWidth, decodeWindow, fitRect, loadOrder, nearestAvailable } from '../../src/site/frameMath';

describe('chooseWidth', () => {
  const widths = [1600, 960];
  it('gives phones and 1× tablets the 960w frames', () => {
    expect(chooseWidth(390, 3, widths)).toBe(960);
    expect(chooseWidth(1024, 1, widths)).toBe(960);
  });
  it('gives big or dense canvases the 1600w frames (canvas px > ~1100)', () => {
    expect(chooseWidth(1180, 1, widths)).toBe(1600);
    expect(chooseWidth(1180, 2, widths)).toBe(1600);
    expect(chooseWidth(1440, 1, widths)).toBe(1600);
  });
  it('caps DPR at 2 and falls back to the largest width', () => {
    expect(chooseWidth(4000, 3, widths)).toBe(1600);
    expect(chooseWidth(500, 0, [960])).toBe(960);
  });
});

describe('loadOrder', () => {
  it('lists every frame exactly once', () => {
    for (const n of [1, 2, 9, 48, 135]) {
      const order = loadOrder(n);
      expect(order).toHaveLength(n);
      expect(new Set(order).size).toBe(n);
      expect(Math.min(...order)).toBe(0);
      expect(Math.max(...order)).toBe(n - 1);
    }
  });
  it('goes coarse to fine: first, last, every 8th, every 4th, every 2nd, the rest', () => {
    const order = loadOrder(48);
    expect(order.slice(0, 2)).toEqual([0, 47]);
    expect(order.slice(2, 8)).toEqual([8, 16, 24, 32, 40, 4]);
    const firstOdd = order.findIndex((i) => i % 2 === 1 && i !== 47);
    // every even frame arrives before any odd one (apart from the last frame)
    expect(order.slice(0, firstOdd).filter((i) => i !== 47).every((i) => i % 2 === 0)).toBe(true);
    expect(firstOdd).toBe(25);
  });
  it('keeps the first coarse pass small: about 1/8 of the frames', () => {
    const order = loadOrder(135);
    const coarse = order.slice(0, order.indexOf(4));
    expect(coarse.length).toBeLessThanOrEqual(Math.ceil(135 / 8) + 2);
  });
});

describe('decodeWindow', () => {
  it('keeps ±radius frames, nearest first, clamped to the sequence', () => {
    const w = decodeWindow(20, 48, 12, 0);
    expect(w).toHaveLength(25);
    expect(w[0]).toBe(20);
    expect(Math.min(...w)).toBe(8);
    expect(Math.max(...w)).toBe(32);
    expect(decodeWindow(2, 48, 12, 0).every((i) => i >= 0 && i <= 14)).toBe(true);
    expect(Math.max(...decodeWindow(46.6, 48, 12, 0))).toBe(47);
  });
  it('leans ahead in the scroll direction', () => {
    const down = decodeWindow(20, 135, 12, 1);
    expect(Math.max(...down)).toBe(36);
    expect(Math.min(...down)).toBe(8);
    expect(down[1]).toBe(21); // the next frame wins the tie
    const up = decodeWindow(20, 135, 12, -1);
    expect(Math.min(...up)).toBe(4);
    expect(up[1]).toBe(19);
  });
});

describe('nearestAvailable', () => {
  const has = (set: number[]) => (i: number) => set.includes(i);
  it('returns the frame itself when decoded', () => {
    expect(nearestAvailable(10, 48, has([10, 11]))).toBe(10);
  });
  it('finds the closest decoded frame, preferring the earlier one on ties', () => {
    expect(nearestAvailable(10, 48, has([0, 8, 12, 40]))).toBe(8);
    expect(nearestAvailable(10, 48, has([0, 13, 40]))).toBe(13);
    expect(nearestAvailable(10.6, 48, has([9, 13]))).toBe(9);
  });
  it('returns -1 when nothing is decoded', () => {
    expect(nearestAvailable(5, 48, () => false)).toBe(-1);
  });
});

describe('fitRect', () => {
  it('covers a landscape canvas (tablet 1180×820)', () => {
    const r = fitRect(1600, 900, 1180, 820);
    expect(r.h).toBeCloseTo(820);
    expect(r.w).toBeGreaterThan(1180);
    expect(r.x).toBeCloseTo((1180 - r.w) / 2);
    expect(r.y).toBeCloseTo(0);
  });
  it('covers an exact 16:9 canvas exactly', () => {
    expect(fitRect(960, 540, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
  it('never crops away more than the minimum visible width on a portrait phone', () => {
    const r = fitRect(960, 540, 390, 844, 0.42);
    expect(390 / r.w).toBeCloseTo(0.42, 5);
    expect(r.h).toBeLessThan(844);
    expect(r.y).toBeGreaterThan(0); // letterboxed above and below
  });
});
