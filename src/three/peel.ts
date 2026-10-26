/**
 * Leaf peeling (pure): how far a swipe has peeled a panel, and whether letting go finishes the
 * peel or springs the leaf back. Any direction counts a little (small fingers rarely swipe straight);
 * swiping the way the leaf lifts counts fully.
 */
import type { Pt } from './trace';

/** p ∈ [0, 1] from the drag vector and the panel's on-screen "lift" direction (unit vector). */
export function peelProgress(drag: Pt, dir: Pt, viewportW: number, viewportH: number): number {
  const along = drag.x * dir.x + drag.y * dir.y;
  const any = 0.6 * Math.hypot(drag.x, drag.y);
  const span = 0.3 * Math.min(viewportW, viewportH);
  return Math.max(0, Math.min(1, Math.max(along, any) / span));
}

/** On release: finish the peel if it got far enough or was flicked (px/ms), else spring back. */
export function peelRelease(p: number, speedPxPerMs: number): 'peel' | 'back' {
  return p > 0.35 || speedPxPerMs > 0.5 ? 'peel' : 'back';
}

/** After this many leaves by hand, the rest peel themselves ("Whoosh!"). */
export const MANUAL_PEELS = 3;
