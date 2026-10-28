/**
 * Where the polaroids sit (pure, unit-tested). Slots are tuned by eye for tablet landscape and
 * phone portrait: a loose, hand-scattered look, with the bottom centre kept free for
 * "Let's explore", and every scene tile's centre left uncovered so it is easy to tap.
 */
export interface Slot {
  /** centre, as a fraction of the collage area */
  x: number;
  y: number;
  /** width, as a fraction of the area's reference size */
  w: number;
  rot: number;
  z: number;
}

export interface Placed {
  left: number;
  top: number;
  width: number;
  height: number;
  rot: number;
  z: number;
}

export const LANDSCAPE: Record<string, Slot> = {
  sky: { x: 0.5, y: 0.555, w: 0.165, rot: -7, z: 1 },
  lotus: { x: 0.075, y: 0.53, w: 0.14, rot: 8, z: 1 },
  farmers: { x: 0.18, y: 0.25, w: 0.245, rot: -5, z: 3 },
  market: { x: 0.5, y: 0.225, w: 0.24, rot: 3, z: 4 },
  aodai: { x: 0.82, y: 0.25, w: 0.245, rot: -3, z: 3 },
  // the bottom pair sits in from the edges so their stamps stay clear of the explore sheet
  rain: { x: 0.25, y: 0.655, w: 0.24, rot: 4, z: 5 },
  craft: { x: 0.75, y: 0.655, w: 0.245, rot: -4, z: 5 },
};

/** phones: the five scenes zig-zag down the screen (no room for the decorative extras) */
export const PORTRAIT: Record<string, Slot> = {
  farmers: { x: 0.28, y: 0.12, w: 0.5, rot: -5, z: 3 },
  market: { x: 0.72, y: 0.28, w: 0.5, rot: 4, z: 4 },
  aodai: { x: 0.28, y: 0.44, w: 0.5, rot: -3, z: 3 },
  rain: { x: 0.72, y: 0.6, w: 0.5, rot: 4, z: 4 },
  craft: { x: 0.3, y: 0.69, w: 0.5, rot: -4, z: 5 },
};

/** polaroid proportions: photo is 4:3, white border all round and a deeper strip at the bottom */
export function tileHeight(width: number): number {
  const pad = Math.round(width * 0.045);
  const strip = Math.round(width * 0.15);
  return pad + Math.round((width - pad * 2) * 0.75) + strip;
}

export function isPortrait(area: { width: number; height: number }): boolean {
  return area.height > area.width * 1.05;
}

/** Pixel boxes for each id inside an area of the given size (tiles clamped inside the area). */
export function placeTiles(area: { width: number; height: number }, ids: string[]): Record<string, Placed> {
  const portrait = isPortrait(area);
  const slots = portrait ? PORTRAIT : LANDSCAPE;
  // the reference size keeps polaroids a sensible size on very wide or very tall screens
  const ref = portrait ? Math.min(area.width, area.height * 0.62) : Math.min(area.width, area.height * 1.8);
  const out: Record<string, Placed> = {};
  for (const id of ids) {
    const s = slots[id];
    if (!s) continue;
    const width = Math.round(s.w * ref);
    const height = tileHeight(width);
    const left = clamp(s.x * area.width - width / 2, 4, area.width - width - 4);
    const top = clamp(s.y * area.height - height / 2, 4, area.height - height - 4);
    out[id] = { left, top, width, height, rot: s.rot, z: s.z };
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

/** Is point (x, y) inside the (unrotated) box? */
export function inBox(b: Placed, x: number, y: number): boolean {
  return x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
}

/** Points along a gentle inward spiral from `from` to `to` (for the convergence MotionPath). */
export function spiralPath(from: { x: number; y: number }, to: { x: number; y: number }, turn = 0.9, steps = 4): { x: number; y: number }[] {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const r0 = Math.hypot(dx, dy);
  const a0 = Math.atan2(dy, dx);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const r = r0 * (1 - f) * (1 - 0.15 * Math.sin(f * Math.PI));
    const a = a0 + turn * Math.PI * f;
    pts.push({ x: to.x + Math.cos(a) * r, y: to.y + Math.sin(a) * r });
  }
  pts[0] = { ...from };
  pts[steps] = { ...to };
  return pts;
}

/** "Let's explore" shows once the intro narration has ended or two scenes have been opened. */
export function exploreReady(introDone: boolean, seenCount: number, alreadyDone: boolean): boolean {
  return introDone || seenCount >= 2 || alreadyDone;
}
