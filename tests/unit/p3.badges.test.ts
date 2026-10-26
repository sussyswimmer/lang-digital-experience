import { describe, expect, it } from 'vitest';
import ann from '../../content/phase3.json';
import { dist, rng, type Pt } from '../../src/phases/phase3/geometry';
import { badgeSpot, buildHats, type HatAnnotation } from '../../src/phases/phase3/hats';

// the market photo as laid out on a 1180×820 tablet, with its 40 px counting badges
const I = ann.identity;
const W = 660;
const H = (W * I.height) / I.width;
const SIZE = 40;
const hats = buildHats(I.hats as HatAnnotation[], W, H);

function countAll(order: number[]): Pt[] {
  const spots: Pt[] = [];
  for (const i of order) spots[i] = badgeSpot(hats[i], order.slice(0, order.indexOf(i)).map((k) => spots[k]), SIZE, W, H);
  return spots;
}

function hiddenPairs(pts: Pt[]): number {
  let n = 0;
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if (dist(pts[a], pts[b]) < SIZE * 0.6) n++;
  return n;
}

describe('Chapter 3 counting badges', () => {
  it('some hats overlap so much that badges on their centres would hide each other’s numbers', () => {
    expect(hiddenPairs(hats.map((h) => h.centre))).toBeGreaterThan(0);
  });

  it('keeps every number readable, whatever order the hats are counted in', () => {
    const inOrder = hats.map((_, i) => i);
    const r = rng(3);
    for (const order of [inOrder, [...inOrder].reverse(), ...[1, 2, 3, 4, 5].map(() => [...inOrder].sort(() => r() - 0.5))]) {
      const spots = countAll(order);
      expect(hiddenPairs(spots)).toBe(0);
      spots.forEach((p, i) => {
        expect(p.x).toBeGreaterThanOrEqual(SIZE / 2);
        expect(p.x).toBeLessThanOrEqual(W - SIZE / 2);
        expect(p.y).toBeGreaterThanOrEqual(SIZE / 2);
        expect(p.y).toBeLessThanOrEqual(H - SIZE / 2);
        // still next to its own hat
        expect(dist(p, hats[i].centre)).toBeLessThanOrEqual(SIZE * 2);
      });
    }
  });

  it('a badge with room to spare sits on its hat’s centre', () => {
    expect(badgeSpot(hats[0], [], SIZE, W, H)).toEqual(hats[0].centre);
  });
});
