import { describe, expect, it } from 'vitest';
import { defaultFrame, fitDistance, lerpRect, nearestAngle, viewOffset } from '../../src/three/framing';
import { peelProgress, peelRelease, MANUAL_PEELS } from '../../src/three/peel';

const vfov = (30 * Math.PI) / 180;

describe('camera framing', () => {
  it('fits the subject by its tighter side', () => {
    const subject = { halfW: 0.27, halfH: 0.2 };
    const wide = fitDistance(subject, { x: 0, y: 0, width: 1000, height: 500 }, 800, vfov);
    const tall = fitDistance(subject, { x: 0, y: 0, width: 300, height: 500 }, 800, vfov);
    expect(tall).toBeGreaterThan(wide);
    // the projected half height at that distance equals the rect's half height
    const d = fitDistance(subject, { x: 0, y: 0, width: 5000, height: 400 }, 800, vfov);
    const projectedHalfH = (subject.halfH / (d * Math.tan(vfov / 2))) * 400;
    expect(projectedHalfH).toBeCloseTo(200, 3);
  });

  it('offsets the view so the subject lands in the middle of the rect', () => {
    expect(viewOffset({ x: 0, y: 0, width: 1180, height: 820 }, 1180, 820)).toEqual({ x: 0, y: 0 });
    // a panel on the right: the hat moves left
    expect(viewOffset({ x: 16, y: 100, width: 700, height: 600 }, 1180, 820).x).toBeGreaterThan(0);
  });

  it('leaves room for the top bar and captions', () => {
    const f = defaultFrame(1180, 820);
    expect(f.y).toBeGreaterThanOrEqual(96);
    expect(f.y + f.height).toBeLessThanOrEqual(820 - 110);
    expect(lerpRect(f, { ...f, x: f.x + 100 }, 0.5).x).toBeCloseTo(f.x + 50);
  });

  it('turns the short way round', () => {
    expect(nearestAngle(0.1, Math.PI * 2)).toBeCloseTo(0);
    expect(nearestAngle(7, 0.5)).toBeCloseTo(0.5 + Math.PI * 2);
    expect(Math.abs(nearestAngle(-3, 3) - -3)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('leaf peeling', () => {
  it('peels most when swiping the way the leaf lifts, but any swipe counts a little', () => {
    const dir = { x: 0, y: -1 };
    const along = peelProgress({ x: 0, y: -100 }, dir, 1180, 820);
    const across = peelProgress({ x: 100, y: 0 }, dir, 1180, 820);
    expect(along).toBeGreaterThan(across);
    expect(across).toBeGreaterThan(0);
    expect(peelProgress({ x: 0, y: -2000 }, dir, 1180, 820)).toBe(1);
  });

  it('finishes far or fast peels and springs back small ones', () => {
    expect(peelRelease(0.5, 0)).toBe('peel');
    expect(peelRelease(0.1, 0.8)).toBe('peel');
    expect(peelRelease(0.2, 0.1)).toBe('back');
    expect(MANUAL_PEELS).toBe(3);
  });
});
