import { describe, expect, it } from 'vitest';
import { coverage, distToSegment, isTraceComplete, nearArc, samplePath, stitchesNearSegment, traceRadius, visibleArc, type StitchOnScreen } from '../../src/three/trace';

/** a ring of n stitches; the front half (indices from..to, wrapping) is visible, laid out left → right */
function ring(n: number, visibleFrom: number, visibleCount: number): StitchOnScreen[] {
  const out: StitchOnScreen[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i - visibleFrom + n) % n;
    out.push({ x: 100 + k * 10, y: 400 + Math.sin((k / visibleCount) * Math.PI) * 40, visible: k < visibleCount });
  }
  return out;
}

describe('stitch tracing', () => {
  it('uses a forgiving finger radius between 28 and 56 px', () => {
    expect(traceRadius(390, 844)).toBeCloseTo(28, 0);
    expect(traceRadius(1180, 820)).toBeCloseTo(36.9, 1);
    expect(traceRadius(3000, 2000)).toBe(56);
  });

  it('measures distance to a segment, including its ends', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(Math.SQRT2);
  });

  it('orders the visible arc from one end to the other, even when it wraps past index 0', () => {
    const vis = ring(20, 15, 10).map((s) => s.visible);
    expect(visibleArc(vis)).toEqual([15, 16, 17, 18, 19, 0, 1, 2, 3, 4]);
    expect(visibleArc(new Array(6).fill(true))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visibleArc(new Array(6).fill(false))).toEqual([]);
  });

  it('only lights visible stitches near the finger', () => {
    const r = ring(40, 0, 20);
    const lit = stitchesNearSegment(r, { x: 95, y: 400 }, { x: 145, y: 400 }, 30);
    expect(lit.length).toBeGreaterThan(3);
    expect(lit.every((i) => r[i].visible)).toBe(true);
  });

  it('completes at 80 % of the visible arc with no long untouched stretch', () => {
    const vis = ring(40, 0, 20).map((s) => s.visible);
    const covered = new Array(40).fill(false);
    for (let i = 0; i < 15; i++) covered[i] = true; // 75 %
    expect(isTraceComplete(covered, vis)).toBe(false);
    covered[15] = true; // 80 %, gap = the last 4 = 20 %
    expect(coverage(covered, vis).ratio).toBeCloseTo(0.8);
    expect(isTraceComplete(covered, vis)).toBe(false);
    covered[18] = true; // gap now 2 (10 %)
    expect(isTraceComplete(covered, vis)).toBe(true);
  });

  it('ignores stitches on the back of the hat when judging coverage', () => {
    const vis = ring(40, 0, 20).map((s) => s.visible);
    const covered = new Array(40).fill(false);
    for (let i = 20; i < 40; i++) covered[i] = true; // only hidden ones
    expect(coverage(covered, vis).ratio).toBe(0);
  });

  it('accepts a start anywhere close to the arc', () => {
    const r = ring(40, 0, 20);
    expect(nearArc(r, { x: 130, y: 410 }, 30)).toBe(true);
    expect(nearArc(r, { x: 130, y: 600 }, 30)).toBe(false);
  });

  it('thins a long path for the hand hint, keeping both ends', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const s = samplePath(pts, 9);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual(pts[0]);
    expect(s[8]).toEqual(pts[49]);
  });
});
