import { describe, expect, it } from 'vitest';
import content from '../../content/build.json';
import strings from '../../content/strings/build.json';
import { ORDER, RULES, evaluateDrop, isComplete, nextPiece, shuffledTray, type PieceId } from '../../src/phases/phase4/build/order';

const S = strings as Record<string, { en: string; vi: string }>;

describe('Build Your Nón Lá: the order', () => {
  it('goes inside → out, as in the brief', () => {
    expect(ORDER).toEqual(['frame', 'leaf-inner', 'poem-art', 'leaf-outer', 'stitches', 'strap']);
    expect(content.order).toEqual([...ORDER]);
  });

  it('accepts exactly the next piece at every step', () => {
    const placed: PieceId[] = [];
    for (const piece of ORDER) {
      for (const other of ORDER.filter((p) => !placed.includes(p) && p !== piece)) {
        expect(evaluateDrop(placed, other).ok).toBe(false);
      }
      expect(evaluateDrop(placed, piece)).toEqual({ ok: true });
      placed.push(piece);
    }
    expect(isComplete(placed)).toBe(true);
    expect(nextPiece(placed)).toBeNull();
  });
});

describe('Build Your Nón Lá: friendly hints keyed to what is missing', () => {
  const hint = (placed: PieceId[], dropped: PieceId) => {
    const r = evaluateDrop(placed, dropped);
    return r.ok ? null : r.hintId;
  };

  it('uses the brief’s line when leaves come before the frame', () => {
    expect(hint([], 'leaf-outer')).toBe('build.hint.leaves-first');
    expect(hint([], 'leaf-inner')).toBe('build.hint.leaves-first');
    expect(S['build.hint.leaves-first'].en).toBe('The leaves need something to sit on first!');
  });

  it('asks for the frame first otherwise', () => {
    expect(hint([], 'poem-art')).toBe('build.hint.need-frame');
  });

  it('the strap always waits until the hat is finished', () => {
    for (let n = 0; n < ORDER.length - 1; n++) {
      expect(hint(ORDER.slice(0, n) as PieceId[], 'strap')).toBe('build.hint.strap-last');
    }
  });

  it('stitches need leaves to hold', () => {
    expect(hint([], 'stitches')).toBe('build.hint.stitches-need-leaves');
    expect(hint(['frame'], 'stitches')).toBe('build.hint.stitches-need-leaves');
    // once the inner leaves are on, the missing piece decides the hint
    expect(hint(['frame', 'leaf-inner'], 'stitches')).toBe('build.hint.need-poem-art');
    expect(hint(['frame', 'leaf-inner', 'poem-art'], 'stitches')).toBe('build.hint.need-leaf-outer');
  });

  it('the secret pictures hide between the leaves', () => {
    expect(hint(['frame'], 'poem-art')).toBe('build.hint.poem-between');
    expect(hint(['frame'], 'leaf-outer')).toBe('build.hint.need-leaf-inner');
    expect(hint(['frame', 'leaf-inner'], 'leaf-outer')).toBe('build.hint.need-poem-art');
  });

  it('asks for the stitches before the strap', () => {
    expect(hint(['frame', 'leaf-inner', 'poem-art', 'leaf-outer'], 'strap')).toBe('build.hint.strap-last');
  });

  it('never accepts a piece twice', () => {
    expect(hint(['frame'], 'frame')).toBe('build.hint.already');
    expect(hint([...ORDER], 'strap')).toBe('build.hint.already');
  });

  it('every reachable hint has English and Vietnamese text, one per missing piece', () => {
    const ids = new Set<string>();
    for (let n = 0; n < ORDER.length; n++) {
      const placed = ORDER.slice(0, n) as PieceId[];
      for (const d of ORDER.slice(n + 1)) ids.add(hint(placed, d)!);
    }
    for (const p of ORDER) ids.add(RULES.missing[p]);
    for (const id of ids) {
      expect(S[id]?.en, id).toBeTruthy();
      expect(S[id]?.vi, id).toBeTruthy();
    }
    expect(Object.keys(RULES.missing).sort()).toEqual([...ORDER].sort());
  });
});

describe('Build Your Nón Lá: the tray', () => {
  it('is shuffled, never in the answer order and never with the frame first', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const tray = shuffledTray(random);
      expect([...tray].sort()).toEqual([...ORDER].sort());
      expect(tray[0]).not.toBe('frame');
      expect(tray).not.toEqual([...ORDER]);
    }
  });

  it('falls back to a fixed mixed order if the random source is stuck', () => {
    const tray = shuffledTray(() => 0.999999);
    expect([...tray].sort()).toEqual([...ORDER].sort());
    expect(tray[0]).not.toBe('frame');
  });

  it('every piece has a label, a praise line and a layer image path', () => {
    for (const p of ORDER) {
      const piece = (content.pieces as Record<string, { labelId: string; placedId: string; layer: string }>)[p];
      expect(S[piece.labelId]?.vi).toBeTruthy();
      expect(S[piece.placedId]?.vi).toBeTruthy();
      expect(piece.layer).toMatch(new RegExp(`^img/layers/build-0${ORDER.indexOf(p) + 1}-${p}\\.webp$`));
    }
  });
});
