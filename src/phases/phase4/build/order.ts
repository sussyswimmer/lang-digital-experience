/**
 * The rules of "Build Your Nón Lá" as pure functions (unit-tested in tests/unit/p4-build.order.test.ts).
 * Pieces go on from the inside out; a wrong piece gets a friendly hint keyed to what is missing.
 */
import content from '../../../../content/build.json';

export const ORDER = ['frame', 'leaf-inner', 'poem-art', 'leaf-outer', 'stitches', 'strap'] as const;
export type PieceId = (typeof ORDER)[number];

export type DropResult = { ok: true } | { ok: false; hintId: string };

export interface HintRules {
  special: { dropped: string[]; missing: string[]; hintId: string }[];
  missing: Record<string, string>;
  already: string;
}

export const RULES: HintRules = content.hints;

export function isPiece(id: string): id is PieceId {
  return (ORDER as readonly string[]).includes(id);
}

/** the piece that has to go on next, or null when the hat is finished */
export function nextPiece(placed: readonly PieceId[]): PieceId | null {
  return ORDER[placed.length] ?? null;
}

export function isComplete(placed: readonly PieceId[]): boolean {
  return placed.length === ORDER.length;
}

/**
 * Can `dropped` go onto the hat now? `placed` is always a correct prefix of ORDER (wrong pieces
 * never stick), so the missing piece is simply the next one in the order.
 */
export function evaluateDrop(placed: readonly PieceId[], dropped: PieceId, rules: HintRules = RULES): DropResult {
  if (placed.includes(dropped)) return { ok: false, hintId: rules.already };
  const missing = nextPiece(placed);
  if (missing === null) return { ok: false, hintId: rules.already };
  if (dropped === missing) return { ok: true };
  const special = rules.special.find((s) => s.dropped.includes(dropped) && s.missing.includes(missing));
  return { ok: false, hintId: special?.hintId ?? rules.missing[missing] };
}

/** shuffle the tray so it never starts in the answer order (or with the frame first) */
export function shuffledTray(random: () => number = Math.random): PieceId[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = [...ORDER] as PieceId[];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a[0] !== 'frame' && a.some((p, i) => p !== ORDER[i])) return a;
  }
  return ['leaf-outer', 'strap', 'frame', 'stitches', 'poem-art', 'leaf-inner'];
}
