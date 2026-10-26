import { describe, expect, it } from 'vitest';
import { canEnter, completeChapter, completeLayer, completeP1, initialProgress, migrate, nextAfter, resumeRoute } from '../../src/app/flow';
import { CHAPTERS, LAYERS } from '../../src/app/types';

const closed = { review: false };

describe('first-run journey', () => {
  it('starts at Phase 1 and only lets the child go forward in order', () => {
    let p = initialProgress();
    expect(resumeRoute(p)).toEqual({ state: 'p1', params: {} });
    expect(canEnter({ state: 'p2', params: { layer: 'stitches' } }, p, closed)).toBe(false);
    expect(canEnter({ state: 'hub', params: {} }, p, closed)).toBe(false);
    p = completeP1(p);
    expect(resumeRoute(p)).toEqual({ state: 'p2', params: { layer: 'stitches' } });
    expect(canEnter({ state: 'p2', params: { layer: 'leaves' } }, p, closed)).toBe(false);
  });

  it('walks Phase 2 layers stitches → leaves → frame → strap, then Phase 3 chapters, then the hub', () => {
    let p = completeP1(initialProgress());
    for (const layer of LAYERS) {
      expect(resumeRoute(p)).toEqual({ state: 'p2', params: { layer } });
      p = completeLayer(p, layer);
    }
    for (const chapter of CHAPTERS) {
      expect(resumeRoute(p)).toEqual({ state: 'p3', params: { chapter } });
      expect(p.firstRunComplete).toBe(false);
      p = completeChapter(p, chapter);
    }
    expect(p.firstRunComplete).toBe(true);
    expect(resumeRoute(p)).toEqual({ state: 'hub', params: {} });
    expect(canEnter({ state: 'p2', params: { layer: 'frame' } }, p, closed)).toBe(true);
    expect(canEnter({ state: 'quiz', params: {} }, p, closed)).toBe(true);
  });

  it('nextAfter moves to the following step', () => {
    const p = initialProgress();
    expect(nextAfter('p1', {}, p)).toEqual({ state: 'p2', params: { layer: 'stitches' } });
    expect(nextAfter('p2', { layer: 'strap' }, p)).toEqual({ state: 'p3', params: { chapter: 'protection' } });
    expect(nextAfter('p3', { chapter: 'identity' }, p)).toEqual({ state: 'hub', params: {} });
  });

  it('review mode opens everything', () => {
    expect(canEnter({ state: 'quiz', params: {} }, initialProgress(), { review: true })).toBe(true);
  });

  it('allows revisiting Phase 1 during the first run', () => {
    const p = completeLayer(completeP1(initialProgress()), 'stitches');
    expect(canEnter({ state: 'p1', params: {} }, p, closed)).toBe(true);
  });
});

describe('migrate', () => {
  it('resets unreadable data', () => {
    expect(migrate(null)).toEqual(initialProgress());
    expect(migrate({ v: 99 })).toEqual(initialProgress());
    expect(migrate('garbage')).toEqual(initialProgress());
  });
  it('keeps valid progress and fills gaps', () => {
    const m = migrate({ v: 1, firstRunComplete: true, p1: { seenTiles: ['rain', 3], done: true } });
    expect(m.firstRunComplete).toBe(true);
    expect(m.p1.seenTiles).toEqual(['rain']);
    expect(m.p2.layers.stitches).toBe('active');
  });
});
