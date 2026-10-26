import { describe, expect, it } from 'vitest';
import { exploreReady, inBox, placeTiles, spiralPath, type Placed } from '../../src/phases/phase1/layout';

const IDS = ['sky', 'lotus', 'farmers', 'market', 'aodai', 'rain', 'craft'];
const SCENES = ['farmers', 'market', 'aodai', 'rain', 'craft'];

// collage area = viewport minus the top bar (84 px) and caption strip (112 px), 16 px gutters
const AREAS = {
  tablet: { width: 1180 - 32, height: 820 - 196 },
  desktop: { width: 1440 - 32, height: 900 - 196 },
  phone: { width: 390 - 32, height: 844 - 196 },
};

describe('Phase 1 collage layout', () => {
  for (const [name, area] of Object.entries(AREAS)) {
    it(`keeps every polaroid inside the area (${name})`, () => {
      const placed = placeTiles(area, IDS);
      for (const id of SCENES) expect(placed[id]).toBeDefined();
      for (const p of Object.values(placed)) {
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.top).toBeGreaterThanOrEqual(0);
        expect(p.left + p.width).toBeLessThanOrEqual(area.width);
        expect(p.top + p.height).toBeLessThanOrEqual(area.height);
      }
    });

    it(`leaves the centre of every scene uncovered and big enough to tap (${name})`, () => {
      const placed = placeTiles(area, IDS);
      for (const id of SCENES) {
        const me = placed[id];
        expect(me.width).toBeGreaterThanOrEqual(150);
        const cx = me.left + me.width / 2;
        const cy = me.top + me.height * 0.45;
        const covering = Object.entries(placed).filter(([other, p]: [string, Placed]) => other !== id && p.z > me.z && inBox(p, cx, cy));
        expect(covering.map(([o]) => o)).toEqual([]);
      }
    });
  }
});

describe('convergence spiral', () => {
  it('starts at the tile, ends at the centre and keeps closing in', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 420, y: -180 };
    const pts = spiralPath(from, to, 0.8, 6);
    expect(pts[0]).toEqual(from);
    expect(pts[pts.length - 1]).toEqual(to);
    const d = pts.map((p) => Math.hypot(p.x - to.x, p.y - to.y));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]);
  });
});

describe('"Let\'s explore" gate', () => {
  it('opens after the intro narration, or after two scenes, or on a revisit', () => {
    expect(exploreReady(false, 0, false)).toBe(false);
    expect(exploreReady(false, 1, false)).toBe(false);
    expect(exploreReady(false, 2, false)).toBe(true);
    expect(exploreReady(true, 0, false)).toBe(true);
    expect(exploreReady(false, 0, true)).toBe(true);
  });
});
