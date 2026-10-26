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
  sky: { x: 0.5, y: 0.6, w: 0.17, rot: -7, z: 1 },
  jars: { x: 0.065, y: 0.56, w: 0.115, rot: 8, z: 1 },
  farmers: { x: 0.18, y: 0.27, w: 0.255, rot: -5, z: 3 },
  market: { x: 0.5, y: 0.24, w: 0.25, rot: 3, z: 4 },
  aodai: { x: 0.82, y: 0.27, w: 0.255, rot: -3, z: 3 },
  rain: { x: 0.28, y: 0.72, w: 0.245, rot: 4, z: 5 },
  craft: { x: 0.73, y: 0.72, w: 0.255, rot: -4, z: 5 },
};

export const PORTRAIT: Record<string, Slot> = {
  sky: { x: 0.77, y: 0.09, w: 0.36, rot: 6, z: 1 },
  jars: { x: 0.2, y: 0.66, w: 0.26, rot: -7, z: 1 },
  farmers: { x: 0.31, y: 0.15, w: 0.56, rot: -5, z: 3 },
  market: { x: 0.69, y: 0.33, w: 0.56, rot: 4, z: 4 },
  aodai: { x: 0.31, y: 0.5, w: 0.56, rot: -3, z: 3 },
  rain: { x: 0.69, y: 0.67, w: 0.55, rot: 4, z: 4 },
  craft: { x: 0.33, y: 0.83, w: 0.56, rot: -4, z: 5 },
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
