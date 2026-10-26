/**
 * Stitch tracing (pure, screen space). The trace row's stitches are projected every frame; the
 * ones facing the camera form a contiguous front arc. A finger lights every visible stitch within
 * `radius` px of its path. The row counts as traced at ≥ 80 % of the visible arc with no long
 * untouched stretch, so a child can wobble, start anywhere and go either way.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface StitchOnScreen extends Pt {
  visible: boolean;
}

/** Forgiving finger radius: 4.5 % of the short side, between 28 and 56 px. */
export function traceRadius(viewportW: number, viewportH: number): number {
  return Math.min(56, Math.max(28, 0.045 * Math.min(viewportW, viewportH)));
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t - p.x;
  const y = a.y + dy * t - p.y;
  return Math.sqrt(x * x + y * y);
}

/** Indices of visible stitches within `radius` of the finger's segment a → b. */
export function stitchesNearSegment(stitches: StitchOnScreen[], a: Pt, b: Pt, radius: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i];
    if (s.visible && distToSegment(s, a, b) <= radius) out.push(i);
  }
  return out;
}

/**
 * Visible stitch indices in order along the ring, starting just after the largest hidden gap,
 * so the list runs from one end of the front arc to the other.
 */
export function visibleArc(visible: boolean[]): number[] {
  const n = visible.length;
  if (n === 0) return [];
  if (visible.every(Boolean)) return visible.map((_, i) => i);
  // find the start of the longest hidden run, then start after it
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < n; i++) {
    if (visible[i] || !visible[(i - 1 + n) % n]) continue;
    let len = 0;
    while (len < n && !visible[(i + len) % n]) len++;
    if (len > bestLen) {
      bestLen = len;
      bestStart = i;
    }
  }
  if (bestStart < 0) return [];
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (bestStart + bestLen + k) % n;
    if (visible[i]) out.push(i);
  }
  return out;
}

export interface Coverage {
  /** covered visible stitches / visible stitches */
  ratio: number;
  /** longest run of untouched stitches along the arc / visible stitches */
  longestGap: number;
  visibleCount: number;
}

export function coverage(covered: boolean[], visible: boolean[]): Coverage {
  const arc = visibleArc(visible);
  if (arc.length === 0) return { ratio: 0, longestGap: 1, visibleCount: 0 };
  let hit = 0;
  let run = 0;
  let longest = 0;
  for (const i of arc) {
    if (covered[i]) {
      hit++;
      run = 0;
    } else {
      run++;
      longest = Math.max(longest, run);
    }
  }
  return { ratio: hit / arc.length, longestGap: longest / arc.length, visibleCount: arc.length };
}

export function isTraceComplete(covered: boolean[], visible: boolean[], minCoverage = 0.8, maxGap = 0.15): boolean {
  const c = coverage(covered, visible);
  return c.visibleCount >= 8 && c.ratio >= minCoverage && c.longestGap <= maxGap;
}

/** Is the pointer close enough to the visible arc to start tracing? */
export function nearArc(stitches: StitchOnScreen[], p: Pt, radius: number): boolean {
  for (const s of stitches) {
    if (s.visible && Math.hypot(s.x - p.x, s.y - p.y) <= radius) return true;
  }
  return false;
}

/** Thin a polyline down to about `count` evenly spaced points (for the hand hint). */
export function samplePath(points: Pt[], count: number): Pt[] {
  if (points.length <= count) return points.slice();
  const out: Pt[] = [];
  for (let k = 0; k < count; k++) out.push(points[Math.round((k / (count - 1)) * (points.length - 1))]);
  return out;
}
