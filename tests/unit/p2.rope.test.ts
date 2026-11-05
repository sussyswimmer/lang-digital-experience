import { describe, expect, it } from 'vitest';
import { Rope, gust, hangingLoop, polylineLength, type V3 } from '../../src/three/rope';

function hanging(n = 25): V3[] {
  // a U between two anchors 0.38 m apart, like the strap's rest curve
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([-0.19 + 0.38 * t, 0.036 - Math.sin(Math.PI * t) * 0.27, 0]);
  }
  return pts;
}

describe('strap rope', () => {
  it('stays pinned at both knots and keeps its length', () => {
    const pts = hanging();
    const rope = new Rope(pts);
    rope.pin(0, pts[0]);
    rope.pin(24, pts[24]);
    const len = rope.length;
    rope.settle(300, 1 / 120, [0, -4.9, 0]);
    expect(rope.point(0)).toEqual(pts[0].map(Math.fround));
    expect(rope.point(24)).toEqual(pts[24].map(Math.fround));
    let l = 0;
    for (let i = 0; i < 24; i++) {
      const a = rope.point(i);
      const b = rope.point(i + 1);
      l += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    expect(Math.abs(l - len) / len).toBeLessThan(0.03);
  });

  it('swings when the wind gusts, then settles back', () => {
    const pts = hanging();
    const rope = new Rope(pts, { damping: 0.992 });
    rope.pin(0, pts[0]);
    rope.pin(24, pts[24]);
    rope.settle(240, 1 / 120, [0, -4.9, 0]);
    const restDir: V3 = [0, -1, 0];
    expect(Math.abs(rope.swingAngle(0, 24, restDir))).toBeLessThan(0.02);
    let maxSwing = 0;
    for (let s = 0; s < 120 * 3; s++) {
      rope.step(1 / 120, [0, -4.9, gust(s / 120, 1.8)]);
      maxSwing = Math.max(maxSwing, Math.abs(rope.swingAngle(0, 24, restDir)));
    }
    expect(maxSwing).toBeGreaterThan(0.12); // a visible sway (> 7°)
    for (let s = 0; s < 120 * 12; s++) rope.step(1 / 120, [0, -4.9, gust(3 + s / 120, 1.8)]);
    expect(Math.abs(rope.swingAngle(0, 24, restDir))).toBeLessThan(0.05);
  });

  it('signs the swing angle by side', () => {
    const pts = hanging();
    const rope = new Rope(pts);
    rope.pin(0, pts[0]);
    rope.pin(24, pts[24]);
    rope.settle(200, 1 / 120, [0, -4.9, 2]);
    const a = rope.swingAngle(0, 24, [0, -1, 0]);
    rope.settle(400, 1 / 120, [0, -4.9, -2]);
    const b = rope.swingAngle(0, 24, [0, -1, 0]);
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });

  it('gusts fade away', () => {
    expect(gust(-1)).toBe(0);
    expect(Math.abs(gust(10))).toBeLessThan(0.05);
  });
});

describe('the short chin strap loop', () => {
  const A: V3 = [-0.19208, 0.036349, 0];
  const B: V3 = [0.19208, 0.036349, 0];
  const low = -0.21 / 3;
  const pts = hangingLoop(A, B, low, 25);

  it('starts and ends at the knots', () => {
    expect(pts).toHaveLength(25);
    expect(pts[0]).toEqual(A);
    expect(pts[24]).toEqual(B);
  });

  it('hangs about a third of the hat height below the brim, no lower', () => {
    const lowest = Math.min(...pts.map((p) => p[1]));
    expect(lowest).toBeCloseTo(low, 2);
    expect(lowest).toBeGreaterThan(-0.08);
  });

  it('spaces its points evenly, so the rope keeps its shape when it settles', () => {
    const seg = polylineLength(pts) / 24;
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeCloseTo(seg, 3);
    const rope = new Rope(pts, { damping: 0.992, iterations: 24, bend: 0.5 });
    rope.pin(0, A);
    rope.pin(24, B);
    rope.settle(240, 1 / 120, [0, -4.9, 0]);
    expect(rope.point(12)[1]).toBeCloseTo(low, 2);
  });
});
