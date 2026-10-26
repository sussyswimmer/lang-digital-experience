import { describe, expect, it } from 'vitest';
import strings from '../../content/strings/quiz.json';
import { QUIZ_BADGES } from '../../src/phases/phase4/hub/badges';
import { ART_KEYS } from '../../src/phases/phase4/quiz/pictures';
import {
  BADGE_IDS,
  QUESTIONS,
  advance,
  answer,
  answered,
  canonicalBadges,
  correctIndex,
  finished,
  recordRun,
  score,
  startRun,
} from '../../src/phases/phase4/quiz/scoring';

const S = strings as Record<string, { en: string; vi: string }>;
const right = (i: number) => correctIndex(QUESTIONS[i]);
const wrong = (i: number) => (right(i) + 1) % 3;

function play(choices: (i: number) => number) {
  let run = startRun();
  for (let i = 0; i < QUESTIONS.length; i++) {
    run = answer(run, QUESTIONS, choices(i)).run;
    run = advance(run);
  }
  return run;
}

describe('Memory Quiz content', () => {
  it('has 5 questions, 3 picture answers each, exactly one correct', () => {
    expect(QUESTIONS).toHaveLength(5);
    for (const q of QUESTIONS) {
      expect(q.answers).toHaveLength(3);
      expect(q.answers.filter((a) => a.correct)).toHaveLength(1);
      for (const a of q.answers) {
        expect(ART_KEYS, `${q.id}/${a.id} has a drawn picture`).toContain(a.art);
        expect(a.imageId).toMatch(new RegExp(`^${q.id}-`));
      }
    }
  });

  it('Q1–Q3 are the brief’s, word for word; Q4–Q5 are drafts for review', () => {
    expect(QUESTIONS.map((q) => q.source)).toEqual(['brief', 'brief', 'brief', 'draft', 'draft']);
    expect(S['quiz.q1.prompt'].en).toBe(
      'A strong wind blows while you are wearing a nón lá. Which part is specially designed to help keep the hat on your head?',
    );
    expect(QUESTIONS[0].answers.map((a) => S[a.labelId].en)).toEqual(['The sewing thread', 'The outer leaves', 'The chin strap']);
    expect(S[QUESTIONS[0].answers[right(0)].labelId].en).toBe('The chin strap');
    expect(S[QUESTIONS[1].answers[right(1)].labelId].en).toBe('It might lose its cone shape');
    expect(S[QUESTIONS[2].answers[right(2)].labelId].en).toBe('It may break and leave gaps in the covering');
    expect(S[QUESTIONS[3].answers[right(3)].labelId].en).toBe('16 rings');
    expect(S[QUESTIONS[4].answers[right(4)].labelId].en).toBe('Tiny pictures and poems');
  });

  it('every prompt, label, explanation and badge line exists in both languages', () => {
    for (const q of QUESTIONS) {
      const ids = [q.promptId, q.explanationId, `quiz.badge.${q.badge}`, `quiz.badge.${q.badge}.earned`, ...q.answers.map((a) => a.labelId)];
      for (const id of ids) {
        expect(S[id]?.en, id).toBeTruthy();
        expect(S[id]?.vi, id).toBeTruthy();
      }
    }
  });

  it('one badge per question, matching the badge art', () => {
    expect(BADGE_IDS).toEqual(QUIZ_BADGES.map((b) => b.id));
    expect(new Set(BADGE_IDS).size).toBe(5);
  });
});

describe('Memory Quiz scoring: a badge for each correct first try', () => {
  it('all right → 5 badges', () => {
    const run = play(right);
    expect(finished(run)).toBe(true);
    expect(run.badges).toEqual(BADGE_IDS);
    expect(score(run)).toBe(5);
  });

  it('a wrong tap earns no badge, and the question cannot be re-answered', () => {
    let run = startRun();
    const first = answer(run, QUESTIONS, wrong(0));
    expect(first.correct).toBe(false);
    expect(first.badge).toBeNull();
    expect(first.correctIndex).toBe(right(0));
    run = first.run;
    expect(answered(run)).toBe(true);
    const retry = answer(run, QUESTIONS, right(0));
    expect(retry.run).toBe(run);
    expect(retry.badge).toBeNull();
    expect(run.badges).toEqual([]);
  });

  it('cannot move on before answering', () => {
    const run = startRun();
    expect(advance(run)).toBe(run);
  });

  it('every child reaches the end, whatever they answer', () => {
    const run = play(wrong);
    expect(finished(run)).toBe(true);
    expect(score(run)).toBe(0);
  });

  it('ignores answers out of range', () => {
    const run = startRun();
    expect(answer(run, QUESTIONS, 7).run).toBe(run);
    expect(answer(run, QUESTIONS, -1).run).toBe(run);
  });
});

describe('Memory Quiz progress', () => {
  const now = new Date('2026-10-30T09:00:00Z');

  it('keeps the best score and every badge ever collected, in quiz order', () => {
    const first = recordRun({ best: 0, badges: [] }, play((i) => (i % 2 ? right(i) : wrong(i))), now);
    expect(first).toEqual({ best: 2, badges: ['q2', 'q4'], certificateAt: now.toISOString() });
    const second = recordRun(first, play((i) => (i === 0 ? right(i) : wrong(i))), now);
    expect(second.best).toBe(2);
    expect(second.badges).toEqual(['q1', 'q2', 'q4']);
  });

  it('does nothing until the run is finished', () => {
    const q = { best: 1, badges: ['q3'] };
    expect(recordRun(q, startRun(), now)).toBe(q);
  });

  it('canonicalBadges drops unknown ids and duplicates', () => {
    expect(canonicalBadges(['q5', 'maker', 'q1', 'q5', 'nope'])).toEqual(['q1', 'q5']);
  });
});
