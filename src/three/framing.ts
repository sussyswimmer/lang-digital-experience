/**
 * Camera framing maths (pure): how far the camera must be for the hat to fit a screen rect, and
 * the projection offset that moves it into that rect. The hat never zooms or pans for the child;
 * these only change when a screen asks for a new frame (panel opens, Phase 3 cover).
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Extent {
  /** half width / half height of the subject in metres, as seen by the camera */
  halfW: number;
  halfH: number;
}

/** Camera distance so a subject with these half extents fits inside `rect` (px) of a viewport `viewportH` px tall. */
export function fitDistance(subject: Extent, rect: Rect, viewportH: number, vfovRad: number, margin = 1): number {
  const t = Math.tan(vfovRad / 2);
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  return (margin * viewportH * Math.max(subject.halfH / h, subject.halfW / w)) / t;
}

/** Offset for camera.setViewOffset so the point the camera looks at lands on the centre of `rect`. */
export function viewOffset(rect: Rect, viewportW: number, viewportH: number): { x: number; y: number } {
  return { x: viewportW / 2 - (rect.x + rect.width / 2), y: viewportH / 2 - (rect.y + rect.height / 2) };
}

/** The default stage area: the whole viewport minus the top bar and the caption strip. */
export function defaultFrame(viewportW: number, viewportH: number): Rect {
  const top = viewportH < 600 ? 96 : 110;
  const bottom = viewportH < 600 ? 110 : 140;
  return { x: 16, y: top, width: Math.max(viewportW - 32, 1), height: Math.max(viewportH - top - bottom, 1) };
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/** the equivalent of `target` (mod 2π) closest to `from`, so turns take the short way round */
export function nearestAngle(from: number, target: number): number {
  const tau = Math.PI * 2;
  let t = target + Math.round((from - target) / tau) * tau;
  if (t - from > Math.PI) t -= tau;
  if (from - t > Math.PI) t += tau;
  return t;
}
