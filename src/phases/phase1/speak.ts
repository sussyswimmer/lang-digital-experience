/**
 * Play narration lines in order (used by Phase 1 and Phase 3).
 *
 * Why not `narration.queue()`: an interrupted line's promise does not settle (Narration.stop()
 * clears `current` before calling resolve, so `finish` returns early), and the language toggle /
 * replay button restart the current line with `say(sameId)`. So instead of trusting the promise
 * alone, this also watches `narration.log` and `currentId()`:
 *   - the same id said again → a restart: keep waiting for it to finish, then carry on;
 *   - a different id said → the child did something that talks: stop the sequence;
 *   - nothing playing any more without our line ending → stopped.
 */
export interface Speaker {
  say(id: string): Promise<'ended' | 'stopped'>;
  currentId(): string | null;
  readonly log: string[];
}

export type SpeakResult = { result: 'ended' | 'stopped'; index: number };

const POLL_MS = 80;

export async function speak(
  narration: Speaker,
  ids: string[],
  alive: () => boolean,
  onLine?: (id: string, index: number) => void,
): Promise<SpeakResult> {
  for (let i = 0; i < ids.length; i++) {
    if (!alive()) return { result: 'stopped', index: i };
    onLine?.(ids[i], i);
    if (!(await speakLine(narration, ids[i], alive))) return { result: 'stopped', index: i };
  }
  return { result: alive() ? 'ended' : 'stopped', index: ids.length };
}

/** resolves true when the line finished (possibly after restarts), false when interrupted */
export function speakLine(n: Speaker, id: string, alive: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let restarted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(ok);
    };
    void n.say(id).then((r) => {
      if (r === 'ended' && !restarted) done(true);
    });
    let seen = n.log.length;
    const poll = () => {
      if (settled) return;
      if (!alive()) return done(false);
      if (n.log.length > seen) {
        const fresh = n.log.slice(seen);
        seen = n.log.length;
        if (fresh.some((x) => x !== id)) return done(false);
        restarted = true;
      }
      if (n.currentId() === null) return done(restarted);
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
  });
}
