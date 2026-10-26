import { describe, expect, it } from 'vitest';
import { Rope, gust, type V3 } from '../../src/three/rope';

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
