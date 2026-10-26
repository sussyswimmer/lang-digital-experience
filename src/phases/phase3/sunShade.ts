/**
 * Chapter 1 maths (pure, unit-tested): the sun travels along an arc across the sky and the shade
 * under the brim slides the opposite way, but is clamped so the farmer's face is ALWAYS inside it
 * ("the shadow under the brim moves with it, always shading the farmer's face").
 * All values are in photo pixels.
 */
import type { Pt } from './geometry';

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** the sky arc: an upper half-ellipse; t = 0 is sunrise on the left, t = 1 sunset on the right */
export interface Arc {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const THETA0 = (168 * Math.PI) / 180;
const THETA1 = (12 * Math.PI) / 180;

export function sunAngle(t: number): number {
  return THETA0 + (THETA1 - THETA0) * clamp01(t);
}

export function arcPoint(arc: Arc, t: number): Pt {
  const a = sunAngle(t);
  return { x: arc.cx + Math.cos(a) * arc.rx, y: arc.cy - Math.sin(a) * arc.ry };
}

/** nearest arc parameter for a pointer position (drags past the ends stick to the ends) */
export function arcT(arc: Arc, p: Pt): number {
  const u = (p.x - arc.cx) / arc.rx;
  const v = Math.max(0, (arc.cy - p.y) / arc.ry);
  const a = Math.atan2(v, u);
  return clamp01((a - THETA0) / (THETA1 - THETA0));
}

/** brim ellipse from its chord tips and depth (as annotated in content/phase3.json) */
export function brimEllipse(l: Pt, r: Pt, depth: number): Ellipse & { rot: number } {
  return {
    cx: (l.x + r.x) / 2,
    cy: (l.y + r.y) / 2,
    rx: Math.hypot(r.x - l.x, r.y - l.y) / 2,
    ry: depth,
    rot: Math.atan2(r.y - l.y, r.x - l.x),
  };
}

/** The shade ellipse for sun position t. */
export function shadowFor(t: number, brim: Ellipse, face: Rect): Ellipse {
  const theta = sunAngle(t);
  const fx = face.x + face.w / 2;
  const fy = face.y + face.h / 2;
  // the pool of shade is a little wider than the face and roughly brim-sized
  const rx = Math.max(brim.rx * 0.62, face.w * 1.25);
  const ry = Math.max(brim.ry * 1.9, face.h * 1.6);
  // opposite the sun, and lower/longer when the sun is low; noon puts it right on the face
  let nx = -Math.cos(theta) * 0.5;
  let ny = (1 - Math.sin(theta)) * 0.35;
  // in ellipse-normalised space, a centre within (1 − d) of the face centre keeps all four
  // face corners inside (d = distance from the face centre to a corner)
  const d = Math.hypot(face.w / 2 / rx, face.h / 2 / ry);
  const maxR = Math.max(0, (1 - d) * 0.96);
  const len = Math.hypot(nx, ny);
  if (len > maxR) {
    nx *= maxR / len;
    ny *= maxR / len;
  }
  return { cx: fx + nx * rx, cy: fy + ny * ry, rx, ry };
}

export function inEllipse(p: Pt, e: Ellipse): boolean {
  const u = (p.x - e.cx) / e.rx;
  const v = (p.y - e.cy) / e.ry;
  return u * u + v * v <= 1 + 1e-9;
}

export function rectInEllipse(r: Rect, e: Ellipse): boolean {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ].every((p) => inEllipse(p, e));
}

/** sky colour for the band above the photo: dawn peach → noon blue → dusk orange */
export function skyColours(t: number): [string, string] {
  const s = Math.sin(sunAngle(t));
  const dusk = t > 0.5;
  const lowTop = dusk ? [240, 160, 110] : [244, 182, 160];
  const lowBottom = dusk ? [252, 214, 150] : [253, 226, 196];
  const highTop = [126, 196, 232];
  const highBottom = [214, 236, 244];
  const k = Math.min(1, Math.max(0, (s - 0.2) / 0.75));
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  return [mix(lowTop, highTop), mix(lowBottom, highBottom)];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
