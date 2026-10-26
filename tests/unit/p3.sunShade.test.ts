import { describe, expect, it } from 'vitest';
import ann from '../../content/phase3.json';
import { arcPoint, arcT, brimEllipse, rectInEllipse, shadowFor, sunAngle } from '../../src/phases/phase3/sunShade';

const P = ann.protection;

/** the Chapter 1 photo at several on-screen sizes (phone → desktop) */
const SIZES = [
  { w: 340, h: 340 * (P.height / P.width) },
  { w: 640, h: 640 * (P.height / P.width) },
  { w: 1100, h: 1100 * (P.height / P.width) },
];

function setup(w: number, h: number) {
  const brim = brimEllipse({ x: P.brim.l[0] * w, y: P.brim.l[1] * h }, { x: P.brim.r[0] * w, y: P.brim.r[1] * h }, P.brim.d * h);
  const face = { x: P.face.x * w, y: P.face.y * h, w: P.face.w * w, h: P.face.h * h };
  return { brim, face };
}

describe('Chapter 1: the shade always covers the farmer’s face', () => {
  for (const { w, h } of SIZES) {
    it(`face stays inside the shadow for every sun position (${Math.round(w)} px wide)`, () => {
      const { brim, face } = setup(w, h);
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const s = shadowFor(t, brim, face);
        expect(rectInEllipse(face, s), `t=${t}`).toBe(true);
      }
    });
  }

  it('moves opposite the sun: morning sun on the left pushes the shade right, evening the other way', () => {
    const { brim, face } = setup(640, 640 * (P.height / P.width));
    const morning = shadowFor(0, brim, face);
    const noon = shadowFor(0.5, brim, face);
    const evening = shadowFor(1, brim, face);
    expect(morning.cx).toBeGreaterThan(noon.cx + 10);
    expect(evening.cx).toBeLessThan(noon.cx - 10);
    // a low sun makes a longer (lower) shadow than the noon sun
    expect(morning.cy).toBeGreaterThan(noon.cy);
  });

  it('moves smoothly (no jumps) as the sun is dragged', () => {
    const { brim, face } = setup(640, 640 * (P.height / P.width));
    let prev = shadowFor(0, brim, face);
    for (let i = 1; i <= 100; i++) {
      const s = shadowFor(i / 100, brim, face);
      expect(Math.hypot(s.cx - prev.cx, s.cy - prev.cy)).toBeLessThan(6);
      prev = s;
    }
  });
});

describe('sun arc', () => {
  const arc = { cx: 300, cy: 140, rx: 240, ry: 90 };
  it('maps a pointer back to the same arc position', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      expect(arcT(arc, arcPoint(arc, t))).toBeCloseTo(t, 5);
    }
  });
  it('clamps drags past the ends and below the horizon', () => {
    expect(arcT(arc, { x: -500, y: 400 })).toBe(0);
    expect(arcT(arc, { x: 1200, y: 400 })).toBe(1);
    expect(sunAngle(0)).toBeGreaterThan(sunAngle(1));
  });
});
