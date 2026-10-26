// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

vi.mock('howler', () => ({ Howl: class {} }));

import { Narration } from '../../src/audio/Narration';

const captions = { show: () => {}, hide: () => {}, progress: () => {}, progressTimed: () => {} };
const audio = { duck: () => {} };

function make(): Narration {
  const n = new Narration(audio as never, captions as never);
  n.enabled = false; // no clips: lines run on the reading-speed timer
  n.setSpeed(10); // an aside (≈10 chars) takes ~0.1 s, an insight line (≈150 chars) ~1 s
  return n;
}

describe('Narration.interject', () => {
  it('pauses the current line, plays the aside, then finishes the line', async () => {
    vi.useFakeTimers();
    const n = make();
    const line = n.say('p2.l4.insight.1');
    let settled: string | null = null;
    void line.then((r) => (settled = r));
    n.interject('p2.colour.peach');
    expect(n.currentId()).toBe('p2.colour.peach');
    await vi.advanceTimersByTimeAsync(300);
    expect(n.currentId()).toBe('p2.l4.insight.1');
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe('ended');
    expect(n.isAside('p2.colour.peach')).toBe(true);
    vi.useRealTimers();
  });

  it('keeps the original line through two quick asides', async () => {
    vi.useFakeTimers();
    const n = make();
    let settled: string | null = null;
    void n.say('p2.l4.insight.2').then((r) => (settled = r));
    n.interject('p2.colour.peach');
    n.interject('p2.colour.green');
    expect(n.currentId()).toBe('p2.colour.green');
    await vi.advanceTimersByTimeAsync(300);
    expect(n.currentId()).toBe('p2.l4.insight.2');
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe('ended');
    vi.useRealTimers();
  });

  it('settles the line as stopped when something else takes over during the aside', async () => {
    vi.useFakeTimers();
    const n = make();
    let settled: string | null = null;
    void n.say('p2.l4.insight.3').then((r) => (settled = r));
    n.interject('p2.colour.purple');
    void n.say('p2.loadError');
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe('stopped');
    vi.useRealTimers();
  });

  it('a replay hands the waiting promise on instead of stopping it', async () => {
    vi.useFakeTimers();
    const n = make();
    let settled: string | null = null;
    void n.say('p2.l1.insight.1').then((r) => (settled = r));
    n.replay();
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBeNull();
    expect(n.currentId()).toBe('p2.l1.insight.1');
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe('ended');
    vi.useRealTimers();
  });
});
