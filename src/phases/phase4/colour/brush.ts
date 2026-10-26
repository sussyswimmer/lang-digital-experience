/**
 * Brush strokes: round, smoothed with midpoint quadratic curves (each input point becomes the
 * control point between the midpoints of its neighbouring segments), so a wobbly finger still
 * draws a soft line. Pure geometry here; Studio.ts paints the segments.
 */
export interface Pt {
  x: number;
  y: number;
}

export type Segment = { kind: 'dot'; at: Pt } | { kind: 'line'; from: Pt; to: Pt } | { kind: 'quad'; from: Pt; ctrl: Pt; to: Pt };

export const BRUSH_SIZES = { s: 14, m: 32, l: 64 } as const;
export type BrushSize = keyof typeof BRUSH_SIZES;

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Feeds points one at a time and returns what to draw so far, so the stroke follows the finger. */
export class StrokeSmoother {
  private pts: Pt[] = [];
  private lastMid: Pt | null = null;
  private bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  /** points closer than this to the previous one are skipped (jitter) */
  constructor(private minStep = 1.5) {}

  add(p: Pt): Segment[] {
    const prev = this.pts[this.pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < this.minStep) return [];
    this.grow(p);
    this.pts.push(p);
    const n = this.pts.length;
    if (n === 1) return [{ kind: 'dot', at: p }];
    const m = mid(this.pts[n - 2], p);
    if (n === 2) {
      this.lastMid = m;
      return [{ kind: 'line', from: this.pts[0], to: m }];
    }
    const seg: Segment = { kind: 'quad', from: this.lastMid!, ctrl: this.pts[n - 2], to: m };
    this.lastMid = m;
    return [seg];
  }

  /** the last half-segment, from the final midpoint to the final point */
  end(): Segment[] {
    const n = this.pts.length;
    if (n < 2 || !this.lastMid) return [];
    return [{ kind: 'line', from: this.lastMid, to: this.pts[n - 1] }];
  }

  /** bounding box of every point, padded by `pad` */
  rect(pad: number): { x: number; y: number; w: number; h: number } | null {
    if (!this.pts.length) return null;
    const b = this.bounds;
    return { x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
  }

  get count(): number {
    return this.pts.length;
  }

  private grow(p: Pt): void {
    const b = this.bounds;
    b.x0 = Math.min(b.x0, p.x);
    b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x);
    b.y1 = Math.max(b.y1, p.y);
  }
}

/** the whole smoothed path for a list of points (tests and replays) */
export function smoothPath(points: Pt[], minStep = 1.5): Segment[] {
  const s = new StrokeSmoother(minStep);
  return [...points.flatMap((p) => s.add(p)), ...s.end()];
}

export function drawSegments(g: CanvasRenderingContext2D, segs: Segment[], width: number): void {
  for (const s of segs) {
    if (s.kind === 'dot') {
      g.beginPath();
      g.arc(s.at.x, s.at.y, width / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(s.from.x, s.from.y);
    if (s.kind === 'line') g.lineTo(s.to.x, s.to.y);
    else g.quadraticCurveTo(s.ctrl.x, s.ctrl.y, s.to.x, s.to.y);
    g.stroke();
  }
}
