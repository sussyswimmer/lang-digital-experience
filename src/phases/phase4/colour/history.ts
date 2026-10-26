/**
 * Undo/redo for the paint layer (pure; tests/unit/p4-colour.history.test.ts).
 * Every operation (fill, brush stroke, clear) is stored as the before and after pixels of its
 * dirty rect, so a fill in one shape costs that shape, not the page. The oldest steps are
 * dropped once the history holds more than `capBytes`.
 */
import type { DirtyRect, PixelBuffer } from './floodFill';

export interface Patch extends DirtyRect {
  data: Uint8ClampedArray;
}

export interface HistoryEntry {
  before: Patch;
  after: Patch;
}

export const DEFAULT_CAP_BYTES = 64 * 1024 * 1024;

export function clampRect(r: DirtyRect, w: number, h: number): DirtyRect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** copy a rect out of a buffer */
export function crop(buf: PixelBuffer, r: DirtyRect): Patch {
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * buf.width + r.x) * 4;
    data.set(buf.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { x: r.x, y: r.y, w: r.w, h: r.h, data };
}

/** write a patch back into a buffer */
export function applyPatch(buf: PixelBuffer, p: Patch): void {
  for (let y = 0; y < p.h; y++) {
    const to = ((p.y + y) * buf.width + p.x) * 4;
    buf.data.set(p.data.subarray(y * p.w * 4, (y + 1) * p.w * 4), to);
  }
}

const sizeOf = (e: HistoryEntry) => e.before.data.byteLength + e.after.data.byteLength;

export class History {
  private done: HistoryEntry[] = [];
  private undone: HistoryEntry[] = [];
  private used = 0;

  constructor(readonly capBytes = DEFAULT_CAP_BYTES) {}

  push(entry: HistoryEntry): void {
    for (const e of this.undone) this.used -= sizeOf(e);
    this.undone = [];
    this.done.push(entry);
    this.used += sizeOf(entry);
    // always keep the newest step, even if it alone is over the cap
    while (this.used > this.capBytes && this.done.length > 1) this.used -= sizeOf(this.done.shift()!);
  }

  /** the patch to apply to step back, or null */
  undo(): Patch | null {
    const e = this.done.pop();
    if (!e) return null;
    this.undone.push(e);
    return e.before;
  }

  /** the patch to apply to step forward again, or null */
  redo(): Patch | null {
    const e = this.undone.pop();
    if (!e) return null;
    this.done.push(e);
    return e.after;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get bytes(): number {
    return this.used;
  }

  get length(): number {
    return this.done.length;
  }

  reset(): void {
    this.done = [];
    this.undone = [];
    this.used = 0;
  }
}
