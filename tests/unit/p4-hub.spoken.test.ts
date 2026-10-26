/**
 * Everything Phase 4 says aloud must be a voiced kind (narration or label): tools/audio/tts-plan.mjs
 * records only those, so a 'ui' id handed to the narration stays a silent caption for ever.
 */
import { describe, expect, it } from 'vitest';
import build from '../../content/build.json';
import { ALL_BADGES } from '../../src/phases/phase4/hub/badges';
import { QUESTIONS } from '../../src/phases/phase4/quiz/scoring';
import { PALETTE } from '../../src/phases/phase4/colour/palette';
import { PAGES } from '../../src/phases/phase4/colour/pages';

type Entry = { kind: string };
const STRINGS = Object.assign({}, ...Object.values(import.meta.glob('../../content/strings/*.json', { eager: true, import: 'default' }))) as Record<string, Entry>;
const SOURCES = import.meta.glob('../../src/phases/phase4/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const VOICED = new Set(['narration', 'label']);

/** the argument text of every say(…) / speak(…) call */
function spokenArgs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:say|speak)\(/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) depth += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
    out.push(src.slice(start, i - 1));
  }
  return out;
}

/** string ids written out in those calls; a `${…}` template becomes a pattern */
function literalIds(): RegExp[] {
  const found: RegExp[] = [];
  for (const src of Object.values(SOURCES)) {
    for (const args of spokenArgs(src)) {
      for (const m of args.matchAll(/(['`])([a-z0-9]+\.[a-z0-9.\-${}\w]*?)\1/g)) {
        const pattern = m[2].split(/\$\{[^}]*\}/).map((s) => s.replace(/[.\-]/g, '\\$&')).join('[a-z0-9\\-]+');
        found.push(new RegExp(`^${pattern}$`));
      }
    }
  }
  return found;
}

/** ids said through data: badge names, pieces and hints, quiz lines, colour and page names */
function dataIds(): string[] {
  const hints = build.hints;
  return [
    ...ALL_BADGES.map((b) => b.nameId),
    ...Object.values(build.pieces).flatMap((p) => [p.labelId, p.placedId]),
    ...hints.special.map((h) => h.hintId),
    ...Object.values(hints.missing),
    hints.already,
    ...QUESTIONS.flatMap((q) => [q.promptId, q.explanationId, ...q.answers.map((a) => a.labelId)]),
    ...PALETTE.map((s) => s.nameId),
    ...PAGES.map((p) => p.nameId),
  ];
}

describe('Phase 4 narration', () => {
  it('finds the spoken ids', () => {
    expect(literalIds().length).toBeGreaterThan(20);
  });

  it('only speaks ids that get recorded (kind narration or label)', () => {
    const silent: string[] = [];
    for (const id of dataIds()) if (!VOICED.has(STRINGS[id]?.kind)) silent.push(`${id} (${STRINGS[id]?.kind ?? 'missing'})`);
    for (const re of literalIds()) {
      const ids = Object.keys(STRINGS).filter((id) => re.test(id));
      if (!ids.length) silent.push(`${re} (missing)`);
      for (const id of ids) if (!VOICED.has(STRINGS[id].kind)) silent.push(`${id} (${STRINGS[id].kind})`);
    }
    expect(silent).toEqual([]);
  });
});
