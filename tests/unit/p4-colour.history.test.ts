import { describe, expect, it } from 'vitest';
import { History, applyPatch, clampRect, crop, type Patch } from '../../src/phases/phase4/colour/history';
import { floodFill, type PixelBuffer } from '../../src/phases/phase4/colour/floodFill';
import { smoothPath, StrokeSmoother } from '../../src/phases/phase4/colour/brush';

const buf = (w: number, h: number): PixelBuffer => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const snapshot = (b: PixelBuffer) => Array.from(b.data);

/** do an operation the way the studio does: fill, recording before/after patches */
function fillWithHistory(b: PixelBuffer, hist: History, x: number, y: number, rgba: [number, number, number, number]): void {
  let before: Patch | null = null;
  const rect = floodFill(b, new Uint8Array(b.width * b.height), x, y, rgba, { beforeWrite: (r) => (before = crop(b, r)) });
  if (rect && before) hist.push({ before, after: crop(b, rect) });
}

function clearWithHistory(b: PixelBuffer, hist: History): void {
  const all = { x: 0, y: 0, w: b.width, h: b.height };
  const before = crop(b, all);
  b.data.fill(0);
  hist.push({ before, after: crop(b, all) });
}

describe('history', () => {
  it('undo and redo round-trip', () => {
    const b = buf(20, 10);
    const h = new History();
    const empty = snapshot(b);
    fillWithHistory(b, h, 1, 1, [255, 0, 0, 255]);
    const red = snapshot(b);
    fillWithHistory(b, h, 1, 1, [0, 0, 255, 255]);
    const blue = snapshot(b);
    applyPatch(b, h.undo()!);
    expect(snapshot(b)).toEqual(red);
    applyPatch(b, h.undo()!);
    expect(snapshot(b)).toEqual(empty);
    expect(h.undo()).toBeNull();
    applyPatch(b, h.redo()!);
    applyPatch(b, h.redo()!);
    expect(snapshot(b)).toEqual(blue);
    expect(h.redo()).toBeNull();
  });

  it('a new step clears the redo stack', () => {
    const b = buf(10, 10);
    const h = new History();
    fillWithHistory(b, h, 0, 0, [255, 0, 0, 255]);
    applyPatch(b, h.undo()!);
    expect(h.canRedo).toBe(true);
    fillWithHistory(b, h, 0, 0, [0, 255, 0, 255]);
    expect(h.canRedo).toBe(false);
    expect(h.bytes).toBe(2 * 10 * 10 * 4);
  });

  it('drops the oldest steps once over the memory cap', () => {
    const b = buf(10, 10); // each full fill costs 2 × 400 bytes
    const h = new History(2000);
    const colours: [number, number, number, number][] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ];
    for (const c of colours) fillWithHistory(b, h, 0, 0, c);
    expect(h.bytes).toBeLessThanOrEqual(2000);
    expect(h.length).toBe(2);
    applyPatch(b, h.undo()!);
    applyPatch(b, h.undo()!);
    // back to the third-newest state (green), not to the empty page
    expect(Array.from(b.data.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(h.canUndo).toBe(false);
  });

  it('clear is undoable', () => {
    const b = buf(16, 8);
    const h = new History();
    fillWithHistory(b, h, 3, 3, [10, 20, 30, 255]);
    const painted = snapshot(b);
    clearWithHistory(b, h);
    expect(b.data.every((v) => v === 0)).toBe(true);
    applyPatch(b, h.undo()!);
    expect(snapshot(b)).toEqual(painted);
  });

  it('crop and applyPatch copy just the rect', () => {
    const b = buf(6, 5);
    for (let i = 0; i < b.data.length; i++) b.data[i] = i % 251;
    const p = crop(b, { x: 2, y: 1, w: 3, h: 2 });
    const c = buf(6, 5);
    applyPatch(c, p);
    expect(Array.from(c.data.subarray((1 * 6 + 2) * 4, (1 * 6 + 5) * 4))).toEqual(Array.from(b.data.subarray((1 * 6 + 2) * 4, (1 * 6 + 5) * 4)));
    expect(c.data[0]).toBe(0);
  });

  it('clampRect keeps rects on the page', () => {
    expect(clampRect({ x: -5, y: -5, w: 10, h: 10 }, 8, 8)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
    expect(clampRect({ x: 20, y: 0, w: 4, h: 4 }, 8, 8)).toBeNull();
  });
});

describe('brush smoothing', () => {
  it('starts with a dot, then a line to the first midpoint, then quadratic curves', () => {
    const segs = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ]);
    expect(segs.map((s) => s.kind)).toEqual(['dot', 'line', 'quad', 'quad', 'line']);
    const q = segs[2];
    expect(q.kind === 'quad' && q.ctrl).toEqual({ x: 10, y: 0 });
    expect(q.kind === 'quad' && q.from).toEqual({ x: 5, y: 0 });
    expect(q.kind === 'quad' && q.to).toEqual({ x: 15, y: 5 });
    const last = segs[segs.length - 1];
    expect(last.kind === 'line' && last.to).toEqual({ x: 30, y: 10 });
  });

  it('skips jitter closer than the minimum step and tracks the bounds', () => {
    const s = new StrokeSmoother(2);
    s.add({ x: 5, y: 5 });
    expect(s.add({ x: 5.5, y: 5.5 })).toEqual([]);
    s.add({ x: 25, y: 15 });
    expect(s.count).toBe(2);
    expect(s.rect(4)).toEqual({ x: 1, y: 1, w: 28, h: 18 });
  });
});
