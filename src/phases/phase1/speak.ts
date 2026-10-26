/**
 * Play narration lines in order (used by Phase 1 and Phase 3).
 *
 * The language toggle and the replay button restart the current line with Narration.say(sameId),
 * which resolves the original promise as 'stopped'. A plain `narration.queue()` would give up
 * there; this waits for the restarted line and carries on, and only stops when a *different* line
 * takes over (e.g. the child tapped something that talks) or the screen is gone (`alive()`).
 */
export interface Speaker {
  say(id: string): Promise<'ended' | 'stopped'>;
  currentId(): string | null;
}

export type SpeakResult = { result: 'ended' | 'stopped'; index: number };

export async function speak(
  narration: Speaker,
  ids: string[],
  alive: () => boolean,
  onLine?: (id: string, index: number) => void,
): Promise<SpeakResult> {
  for (let i = 0; i < ids.length; i++) {
    if (!alive()) return { result: 'stopped', index: i };
    onLine?.(ids[i], i);
    const r = await narration.say(ids[i]);
    if (r === 'ended') continue;
    if (!alive() || narration.currentId() !== ids[i]) return { result: 'stopped', index: i };
    const finished = await waitWhile(() => narration.currentId() === ids[i], alive);
    if (!finished || narration.currentId() !== null) return { result: 'stopped', index: i };
  }
  return { result: alive() ? 'ended' : 'stopped', index: ids.length };
}

function waitWhile(cond: () => boolean, alive: () => boolean, everyMs = 120): Promise<boolean> {
  return new Promise((resolve) => {
    const tick = () => {
      if (!alive()) return resolve(false);
      if (!cond()) return resolve(true);
      setTimeout(tick, everyMs);
    };
    tick();
  });
}
