/**
 * Chapter 3 hat shapes (pure, unit-tested). Each annotated hat is a cone (triangle from the apex
 * to the brim tips) plus the near half of its brim ellipse; under it is a "dry zone" (the person
 * wearing it) that rain never enters.
 */
import { dist, inPolygon, inTriangle, px, type Pt } from './geometry';

export interface HatAnnotation {
  apex: [number, number];
  l: [number, number];
  r: [number, number];
  /** brim half-depth, in photo heights */
  d: number;
}

export interface Hat {
  apex: Pt;
  l: Pt;
  r: Pt;
  /** chord midpoint, unit chord direction (l → r), unit normal pointing away from the apex */
  c: Pt;
  dir: Pt;
  nrm: Pt;
  /** half chord length and brim depth, px */
  a: number;
  b: number;
  /** where a counting badge goes, and how far from it a tap still counts */
  centre: Pt;
  reach: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  dry: Pt[];
}

export function buildHat(h: HatAnnotation, w: number, hgt: number): Hat {
  const apex = px(h.apex, w, hgt);
  const l = px(h.l, w, hgt);
  const r = px(h.r, w, hgt);
  const c = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  const len = Math.max(1e-6, dist(l, r));
  const dir = { x: (r.x - l.x) / len, y: (r.y - l.y) / len };
  let nrm = { x: -dir.y, y: dir.x };
  if ((apex.x - c.x) * nrm.x + (apex.y - c.y) * nrm.y > 0) nrm = { x: -nrm.x, y: -nrm.y };
  const a = len / 2;
  const b = Math.max(1, h.d * hgt);
  // badge sits in the middle of the cone, a little above the brim
  const centre = { x: c.x + (apex.x - c.x) * 0.38, y: c.y + (apex.y - c.y) * 0.38 };
  const reach = Math.max(32, Math.max(a, dist(apex, c)) * 0.55);
  const bulge = [0.5, 1].map((k) => ({ x: c.x + nrm.x * b * k, y: c.y + nrm.y * b * k }));
  const pts = [apex, l, r, ...bulge];
  const box = {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
  // the person under the brim: the chord, inset a little, extruded straight down
  const inset = 0.12 * len;
  const top = Math.max(l.y, r.y, apex.y > c.y ? apex.y : -Infinity);
  const dl = { x: l.x + dir.x * inset, y: l.y + dir.y * inset };
  const dr = { x: r.x - dir.x * inset, y: r.y - dir.y * inset };
  const depth = Math.max(len * 1.6, 40) + (top - Math.min(l.y, r.y));
  const dry = [dl, dr, { x: dr.x, y: dr.y + depth }, { x: dl.x, y: dl.y + depth }];
  return { apex, l, r, c, dir, nrm, a, b, centre, reach, box, dry };
}

export function buildHats(list: HatAnnotation[], w: number, h: number): Hat[] {
  return list.map((x) => buildHat(x, w, h));
}

/** inside the cone or the near half of the brim */
export function insideHat(hat: Hat, p: Pt): boolean {
  if (p.x < hat.box.x0 || p.x > hat.box.x1 || p.y < hat.box.y0 || p.y > hat.box.y1) return false;
  if (inTriangle(p, hat.apex, hat.l, hat.r)) return true;
  const dx = p.x - hat.c.x;
  const dy = p.y - hat.c.y;
  const u = dx * hat.dir.x + dy * hat.dir.y;
  const v = dx * hat.nrm.x + dy * hat.nrm.y;
  return v >= 0 && (u / hat.a) ** 2 + (v / hat.b) ** 2 <= 1;
}

export function insideDry(hat: Hat, p: Pt): boolean {
  return inPolygon(p, hat.dry);
}

/**
 * Where water on this hat runs to: the brim tip on the side it landed; or the apex, for a hat
 * hanging upside-down on someone's back (its tip is the lowest point).
 */
export function runoffTarget(hat: Hat, p: Pt): Pt {
  const u = (p.x - hat.c.x) * hat.dir.x + (p.y - hat.c.y) * hat.dir.y;
  const tip = u < 0 ? hat.l : hat.r;
  return hat.apex.y > tip.y ? hat.apex : tip;
}

/** badge offsets to try, in badge sizes: [up the cone, along the brim] */
const NUDGES: [number, number][] = [
  [0, 0],
  [0.8, 0],
  [0, -0.8],
  [0, 0.8],
  [0.8, -0.8],
  [0.8, 0.8],
  [-0.8, 0],
  [1.6, 0],
  [0, -1.6],
  [0, 1.6],
  [-0.8, -0.8],
  [-0.8, 0.8],
  [1.6, -0.8],
  [1.6, 0.8],
];

/**
 * Where a counting badge goes (px): the hat's centre, unless that would cover a number already
 * placed (some hats overlap, with centres closer than a badge is wide). Then a step up the cone or
 * along the brim; the first spot clear of every other badge wins, else the one with the most room.
 * Always inside the w × h photo.
 */
export function badgeSpot(hat: Hat, taken: Pt[], size: number, w: number, h: number): Pt {
  const r = size / 2;
  let best = hat.centre;
  let room = -1;
  for (const [up, along] of NUDGES) {
    const p = {
      x: Math.min(w - r, Math.max(r, hat.centre.x + (-hat.nrm.x * up + hat.dir.x * along) * size)),
      y: Math.min(h - r, Math.max(r, hat.centre.y + (-hat.nrm.y * up + hat.dir.y * along) * size)),
    };
    const near = Math.min(Infinity, ...taken.map((t) => dist(t, p)));
    if (near >= size) return p;
    if (near > room) {
      room = near;
      best = p;
    }
  }
  return best;
}

/** The hat a tap at p means: inside a hat's shape or within its reach; the nearest centre wins. */
export function hatAt(hats: Hat[], p: Pt, skip?: (i: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  hats.forEach((h, i) => {
    if (skip?.(i)) return;
    const d = dist(p, h.centre);
    if ((d <= h.reach || insideHat(h, p)) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
