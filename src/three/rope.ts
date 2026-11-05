/**
 * A small Verlet rope (pure maths, no three.js) for the chin strap: 25 particles pinned at both
 * knots, gravity, damping, distance + bend constraints, and a gentle wind gust that dies away, so a
 * tap makes the strap sway side to side "as if in the wind" and settle.
 */
export type V3 = [number, number, number];

export interface RopeOptions {
  damping?: number;
  iterations?: number;
  bend?: number;
}

export class Rope {
  readonly n: number;
  readonly pos: Float32Array;
  private prev: Float32Array;
  private rest: Float32Array;
  private restBend: Float32Array;
  private pinned = new Map<number, V3>();
  damping: number;
  iterations: number;
  bend: number;

  constructor(points: V3[], opts: RopeOptions = {}) {
    this.n = points.length;
    this.pos = new Float32Array(this.n * 3);
    points.forEach((p, i) => this.pos.set(p, i * 3));
    this.prev = this.pos.slice();
    this.rest = new Float32Array(Math.max(this.n - 1, 0));
    this.restBend = new Float32Array(Math.max(this.n - 2, 0));
    for (let i = 0; i < this.n - 1; i++) this.rest[i] = this.dist(i, i + 1);
    for (let i = 0; i < this.n - 2; i++) this.restBend[i] = this.dist(i, i + 2);
    this.damping = opts.damping ?? 0.985;
    this.iterations = opts.iterations ?? 12;
    this.bend = opts.bend ?? 0.3;
  }

  get length(): number {
    let l = 0;
    for (let i = 0; i < this.n - 1; i++) l += this.rest[i];
    return l;
  }

  pin(i: number, p: V3): void {
    this.pinned.set(i, p);
    this.pos.set(p, i * 3);
    this.prev.set(p, i * 3);
  }

  /** move every particle (and its history) to these points, e.g. to drop the strap from the brim */
  reset(points: V3[]): void {
    points.forEach((p, i) => {
      this.pos.set(p, i * 3);
      this.prev.set(p, i * 3);
    });
    for (const [i, p] of this.pinned) this.pin(i, p);
  }

  point(i: number): V3 {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  /** one fixed step; `acc` is gravity + wind in the rope's space (m/s²) */
  step(dt: number, acc: V3): void {
    const { pos, prev } = this;
    const dt2 = dt * dt;
    for (let i = 0; i < this.n; i++) {
      if (this.pinned.has(i)) continue;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        const v = (pos[j] - prev[j]) * this.damping;
        prev[j] = pos[j];
        pos[j] += v + acc[k] * dt2;
      }
    }
    for (let it = 0; it < this.iterations; it++) {
      for (let i = 0; i < this.n - 1; i++) this.solve(i, i + 1, this.rest[i], 1);
      if (this.bend > 0) for (let i = 0; i < this.n - 2; i++) this.solveBend(i);
      for (const [i, p] of this.pinned) pos.set(p, i * 3);
    }
  }

  /** run `steps` steps of `dt` (used to settle the rest shape) */
  settle(steps: number, dt: number, acc: V3): void {
    for (let s = 0; s < steps; s++) this.step(dt, acc);
  }

  /** kinetic-ish energy: how much the rope is still moving */
  motion(): number {
    let e = 0;
    for (let j = 0; j < this.pos.length; j++) e += Math.abs(this.pos[j] - this.prev[j]);
    return e;
  }

  /**
   * Swing of the middle of the rope around the line through particles a and b (radians, signed),
   * compared with `restDir` (a vector from the a–b midpoint to the rope's middle at rest).
   */
  swingAngle(a: number, b: number, restDir: V3): number {
    const pa = this.point(a);
    const pb = this.point(b);
    const axis = norm(sub(pb, pa));
    const mid: V3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
    const m = this.point(Math.floor(this.n / 2));
    const d = flatten(sub(m, mid), axis);
    const r = flatten(restDir, axis);
    if (len(d) < 1e-6 || len(r) < 1e-6) return 0;
    const cos = dot(norm(d), norm(r));
    const sign = Math.sign(dot(cross(r, d), axis)) || 1;
    return sign * Math.acos(Math.max(-1, Math.min(1, cos)));
  }

  private dist(i: number, j: number): number {
    const p = this.pos;
    return Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]);
  }

  private solve(i: number, j: number, rest: number, stiffness: number): void {
    const p = this.pos;
    const dx = p[j * 3] - p[i * 3];
    const dy = p[j * 3 + 1] - p[i * 3 + 1];
    const dz = p[j * 3 + 2] - p[i * 3 + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const pi = this.pinned.has(i);
    const pj = this.pinned.has(j);
    if (pi && pj) return;
    const diff = ((d - rest) / d) * stiffness;
    const wi = pi ? 0 : pj ? 1 : 0.5;
    const wj = pj ? 0 : pi ? 1 : 0.5;
    p[i * 3] += dx * diff * wi;
    p[i * 3 + 1] += dy * diff * wi;
    p[i * 3 + 2] += dz * diff * wi;
    p[j * 3] -= dx * diff * wj;
    p[j * 3 + 1] -= dy * diff * wj;
    p[j * 3 + 2] -= dz * diff * wj;
  }

  private solveBend(i: number): void {
    // only resist folding (pull i and i+2 apart when closer than at rest), so the strap can still swing
    const d = this.dist(i, i + 2);
    if (d < this.restBend[i]) this.solve(i, i + 2, this.restBend[i], this.bend);
  }
}

/** A gentle gust: A·sin(2π·f·t)·e^(−t/τ) (m/s²). */
export function gust(t: number, amplitude = 1.6, freq = 0.7, tau = 2.5): number {
  if (t < 0) return 0;
  return amplitude * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / tau);
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: V3): V3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function flatten(v: V3, axis: V3): V3 {
  const k = dot(v, axis);
  return [v[0] - axis[0] * k, v[1] - axis[1] * k, v[2] - axis[2] * k];
}

/**
 * A strap hanging between its two knots: a catenary whose lowest point is at `lowY` (hat space),
 * resampled into `n` points evenly spaced along its length (the rope's segment rest lengths).
 */
export function hangingLoop(a: V3, b: V3, lowY: number, n: number): V3[] {
  const half = Math.hypot(b[0] - a[0], b[2] - a[2]) / 2;
  const top = (a[1] + b[1]) / 2;
  const sag = Math.max(0.005, top - lowY);
  // solve c·(cosh(half/c) − 1) = sag for c by bisection (the function falls as c grows)
  let lo = 1e-4;
  let hi = 10;
  for (let i = 0; i < 80; i++) {
    const c = (lo + hi) / 2;
    if (c * (Math.cosh(half / c) - 1) > sag) lo = c;
    else hi = c;
  }
  const c = (lo + hi) / 2;
  // dense samples along x, then pick points at equal arc length
  const dense: V3[] = [];
  const m = 400;
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const x = -half + 2 * half * t;
    const y = lowY + c * (Math.cosh(x / c) - 1);
    dense.push([a[0] + (b[0] - a[0]) * t, y + (a[1] - top) * (1 - t) + (b[1] - top) * t, a[2] + (b[2] - a[2]) * t]);
  }
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dist3(dense[i - 1], dense[i]));
  const total = cum[cum.length - 1];
  const out: V3[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < dense.length - 1 && cum[j] < target) j++;
    const f = (target - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    const p = dense[j - 1];
    const q = dense[j];
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]);
  }
  out[0] = [...a];
  out[n - 1] = [...b];
  return out;
}

function dist3(p: V3, q: V3): number {
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}

export function polylineLength(pts: V3[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist3(pts[i - 1], pts[i]);
  return l;
}
