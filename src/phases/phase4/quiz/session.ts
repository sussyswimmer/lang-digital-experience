/** Hand-over from the quiz to the certificate screen within this visit (not persisted). */
export interface FinishedRun {
  badges: string[];
  score: number;
  at: number;
}

let last: FinishedRun | null = null;

export function setFinishedRun(run: FinishedRun): void {
  last = run;
}

/** the run that just finished, once (so a later revisit of the certificate doesn't re-celebrate) */
export function takeFinishedRun(): FinishedRun | null {
  const r = last;
  last = null;
  return r;
}
