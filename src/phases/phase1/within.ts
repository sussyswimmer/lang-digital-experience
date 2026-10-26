/**
 * Wait for a promise, but never longer than `ms`: rejects on time-out (and when `p` rejects).
 * Phase 1 and Phase 3 use it for the 3D hat's hand-offs, so a model that fails or never arrives
 * falls back to the drawn hat instead of leaving the child on a blank screen.
 */
export function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
