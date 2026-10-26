/**
 * Quiz rules as pure functions (unit-tested in tests/unit/p4-quiz.scoring.test.ts).
 * One tap per question: a correct first try earns that question's badge; a wrong tap shows the
 * right answer and the child carries on. Every child reaches the certificate.
 */
import content from '../../../../content/quiz.json';
import type { Progress } from '../../../app/types';

export interface QuizAnswer {
  id: string;
  labelId: string;
  imageId: string;
  imageReady: boolean;
  art: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  source: 'brief' | 'draft';
  promptId: string;
  scene?: { image: string; altId: string };
  answers: QuizAnswer[];
  explanationId: string;
  badge: string;
}

export const QUESTIONS = content.questions as QuizQuestion[];
export const BADGE_IDS = QUESTIONS.map((q) => q.badge);

export interface QuizRun {
  /** index of the current question; QUESTIONS.length once finished */
  index: number;
  /** the answer index chosen for each question (null = not answered yet) */
  chosen: (number | null)[];
  badges: string[];
}

export function startRun(n = QUESTIONS.length): QuizRun {
  return { index: 0, chosen: Array.from({ length: n }, () => null), badges: [] };
}

export function correctIndex(q: QuizQuestion): number {
  return q.answers.findIndex((a) => a.correct);
}

export interface AnswerOutcome {
  run: QuizRun;
  correct: boolean;
  /** the badge earned by this answer, if any */
  badge: string | null;
  correctIndex: number;
}

/** Record the child's (only) tap on the current question. Taps after the first are ignored. */
export function answer(run: QuizRun, questions: QuizQuestion[], choice: number): AnswerOutcome {
  const q = questions[run.index];
  const right = q ? correctIndex(q) : -1;
  if (!q || run.chosen[run.index] !== null || choice < 0 || choice >= q.answers.length) {
    return { run, correct: false, badge: null, correctIndex: right };
  }
  const correct = choice === right;
  const chosen = run.chosen.slice();
  chosen[run.index] = choice;
  const badge = correct && !run.badges.includes(q.badge) ? q.badge : null;
  return { run: { ...run, chosen, badges: badge ? [...run.badges, badge] : run.badges }, correct, badge, correctIndex: right };
}

export function answered(run: QuizRun): boolean {
  return run.chosen[run.index] !== null && run.chosen[run.index] !== undefined;
}

export function advance(run: QuizRun): QuizRun {
  if (!answered(run)) return run;
  return { ...run, index: Math.min(run.index + 1, run.chosen.length) };
}

export function finished(run: QuizRun): boolean {
  return run.index >= run.chosen.length;
}

export function score(run: QuizRun): number {
  return run.badges.length;
}

/** badges in quiz order, without duplicates or unknown ids */
export function canonicalBadges(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return BADGE_IDS.filter((b) => set.has(b));
}

/**
 * Fold a finished run into saved progress: best score, every badge ever collected (so a replay
 * can fill the gaps), and the date the certificate was (last) earned.
 */
export function recordRun(quiz: Progress['games']['quiz'], run: QuizRun, now: Date): Progress['games']['quiz'] {
  if (!finished(run)) return quiz;
  return {
    best: Math.max(quiz.best, score(run)),
    badges: canonicalBadges([...quiz.badges, ...run.badges]),
    certificateAt: now.toISOString(),
  };
}
