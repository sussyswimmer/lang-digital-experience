/**
 * Pure maths for the scroll-scrubbed image sequence (no DOM): which width to fetch, in what order,
 * which frames to keep decoded, which decoded frame to show, and where to draw it.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 1600w only when the canvas really needs it (canvas px > ~1100): phones and 1× tablets get 960w. */
export function chooseWidth(cssWidth: number, dpr: number, widths: number[]): number {
  const sorted = [...widths].sort((a, b) => a - b);
  const want = cssWidth * Math.min(Math.max(dpr, 1), 2);
  return sorted.find((w) => w * 1.15 >= want) ?? sorted[sorted.length - 1];
}

/**
 * Coarse-to-fine fetch order so scrubbing works after the first few frames arrive:
 * the first and last frame, then every 8th, every 4th, every 2nd, then the rest.
 */
export function loadOrder(count: number): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  const add = (i: number) => {
    if (i >= 0 && i < count && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  };
  add(0);
  add(count - 1);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) add(i);
  return order;
}

/**
 * Frames to keep decoded around `center` (±radius), nearest first. The window leans `lean` frames
 * further in the scroll direction so the next frames are ready before they are needed.
 */
export function decodeWindow(center: number, count: number, radius = 6, dir: -1 | 0 | 1 = 0, lean = 6): number[] {
  const c = Math.round(center);
  const lo = Math.max(0, c - radius - (dir < 0 ? lean : 0));
  const hi = Math.min(count - 1, c + radius + (dir > 0 ? lean : 0));
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  // ahead-of-scroll frames win ties
  return out.sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || (dir >= 0 ? b - a : a - b));
}

/** The decoded frame closest to `index` (ties go to the earlier frame); -1 when none is decoded. */
export function nearestAvailable(index: number, count: number, has: (i: number) => boolean): number {
  const c = Math.min(count - 1, Math.max(0, Math.round(index)));
  for (let d = 0; d < count; d++) {
    if (c - d >= 0 && has(c - d)) return c - d;
    if (c + d < count && has(c + d)) return c + d;
  }
  return -1;
}

/**
 * Cover-fit a source frame into the canvas, but never crop away more than `minVisible` of the
 * source width: on a portrait phone the whole hat stays in view and the gap above and below is
 * filled with the frame's own background colours.
 */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number, minVisible = 0.42): Rect {
  const cover = Math.max(dstW / srcW, dstH / srcH);
  const scale = Math.min(cover, dstW / (srcW * minVisible));
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}
