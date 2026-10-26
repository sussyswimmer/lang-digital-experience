/**
 * The journey rules, as pure functions (unit-tested in tests/unit/flow.test.ts).
 *
 * First run: Phase 1 → Phase 2 (stitches → leaves → frame → strap) → Phase 3 (3 chapters) → hub.
 * After the first run (or with ?review=1) every phase, layer, chapter and game is open.
 */
import { CHAPTERS, LAYERS, type ChapterId, type FlowState, type LayerId, type Progress, type Route } from './types';

export function initialProgress(): Progress {
  return {
    v: 1,
    firstRunComplete: false,
    p1: { seenTiles: [], done: false },
    p2: { layers: { stitches: 'active', leaves: 'locked', frame: 'locked', strap: 'locked' } },
    p3: { chapters: { protection: 'active', heritage: 'locked', identity: 'locked' } },
    games: { build: { completed: 0 }, colour: { saved: 0 }, quiz: { best: 0, badges: [] } },
  };
}

export interface Flags {
  review: boolean;
}

export function isOpen(p: Progress, f: Flags): boolean {
  return p.firstRunComplete || f.review;
}

/** Where "continue" should take the child. */
export function resumeRoute(p: Progress): Route {
  if (p.firstRunComplete) return { state: 'hub', params: {} };
  if (!p.p1.done) return { state: 'p1', params: {} };
  const layer = LAYERS.find((l) => p.p2.layers[l] !== 'done');
  if (layer) return { state: 'p2', params: { layer } };
  const chapter = CHAPTERS.find((c) => p.p3.chapters[c] !== 'done');
  return { state: 'p3', params: { chapter: chapter ?? 'protection' } };
}

/** Can the child go to `target` right now? */
export function canEnter(target: Route, p: Progress, f: Flags): boolean {
  if (target.state === 'landing') return true;
  if (isOpen(p, f)) return true;
  const resume = resumeRoute(p);
  if (target.state !== resume.state) {
    // during the first run you may revisit what you've already finished
    if (target.state === 'p1') return true;
    if (target.state === 'p2') return p.p1.done;
    return false;
  }
  if (target.state === 'p2' && target.params.layer) {
    return p.p2.layers[target.params.layer as LayerId] !== 'locked';
  }
  if (target.state === 'p3' && target.params.chapter) {
    return p.p3.chapters[target.params.chapter as ChapterId] !== 'locked';
  }
  return true;
}

export function completeP1(p: Progress): Progress {
  return { ...p, p1: { ...p.p1, done: true } };
}

export function seeTile(p: Progress, tile: string): Progress {
  if (p.p1.seenTiles.includes(tile)) return p;
  return { ...p, p1: { ...p.p1, seenTiles: [...p.p1.seenTiles, tile] } };
}

export function completeLayer(p: Progress, layer: LayerId): Progress {
  const layers = { ...p.p2.layers, [layer]: 'done' as const };
  const next = LAYERS[LAYERS.indexOf(layer) + 1];
  if (next && layers[next] === 'locked') layers[next] = 'active';
  return { ...p, p2: { layers } };
}

export function completeChapter(p: Progress, chapter: ChapterId): Progress {
  const chapters = { ...p.p3.chapters, [chapter]: 'done' as const };
  const next = CHAPTERS[CHAPTERS.indexOf(chapter) + 1];
  if (next && chapters[next] === 'locked') chapters[next] = 'active';
  const all = CHAPTERS.every((c) => chapters[c] === 'done');
  return { ...p, p3: { chapters }, firstRunComplete: p.firstRunComplete || all };
}

/** The route that follows a finished step during the first run. */
export function nextAfter(state: FlowState, params: Record<string, string>, p: Progress): Route {
  if (state === 'p1') return { state: 'p2', params: { layer: 'stitches' } };
  if (state === 'p2') {
    const next = LAYERS[LAYERS.indexOf(params.layer as LayerId) + 1];
    return next ? { state: 'p2', params: { layer: next } } : { state: 'p3', params: { chapter: 'protection' } };
  }
  if (state === 'p3') {
    const next = CHAPTERS[CHAPTERS.indexOf(params.chapter as ChapterId) + 1];
    return next ? { state: 'p3', params: { chapter: next } } : { state: 'hub', params: {} };
  }
  return p.firstRunComplete ? { state: 'hub', params: {} } : resumeRoute(p);
}

/** Bring older saved progress up to date; anything unreadable starts fresh. */
export function migrate(raw: unknown): Progress {
  const fresh = initialProgress();
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return fresh;
  const r = raw as Partial<Progress>;
  return {
    v: 1,
    firstRunComplete: Boolean(r.firstRunComplete),
    p1: { seenTiles: Array.isArray(r.p1?.seenTiles) ? r.p1!.seenTiles.filter((s) => typeof s === 'string') : [], done: Boolean(r.p1?.done) },
    p2: { layers: { ...fresh.p2.layers, ...(r.p2?.layers ?? {}) } },
    p3: { chapters: { ...fresh.p3.chapters, ...(r.p3?.chapters ?? {}) } },
    games: {
      build: { completed: Number(r.games?.build?.completed ?? 0) || 0 },
      colour: { saved: Number(r.games?.colour?.saved ?? 0) || 0 },
      quiz: {
        best: Number(r.games?.quiz?.best ?? 0) || 0,
        badges: Array.isArray(r.games?.quiz?.badges) ? r.games!.quiz!.badges : [],
        certificateAt: r.games?.quiz?.certificateAt,
      },
    },
  };
}
