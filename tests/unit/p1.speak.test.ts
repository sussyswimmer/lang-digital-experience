import { describe, expect, it } from 'vitest';
import { speak, type Speaker } from '../../src/phases/phase1/speak';

/** a fake Narration: lines end when the test says so; say() interrupts the current line */
class FakeNarration implements Speaker {
  current: { id: string; resolve: (r: 'ended' | 'stopped') => void } | null = null;
  said: string[] = [];
  say(id: string): Promise<'ended' | 'stopped'> {
    this.current?.resolve('stopped');
    this.said.push(id);
    return new Promise((resolve) => {
      const me = {
        id,
        resolve: (r: 'ended' | 'stopped') => {
          if (this.current === me) this.current = null;
          resolve(r);
        },
      };
      this.current = me;
    });
  }
  currentId(): string | null {
    return this.current?.id ?? null;
  }
  end(): void {
    this.current?.resolve('ended');
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('speak()', () => {
  it('plays every line in order', async () => {
    const n = new FakeNarration();
    const p = speak(n, ['a', 'b', 'c'], () => true);
    for (let i = 0; i < 3; i++) {
      await tick();
      n.end();
    }
    expect(await p).toEqual({ result: 'ended', index: 3 });
    expect(n.said).toEqual(['a', 'b', 'c']);
  });

  it('carries on when the same line is restarted (language toggle / replay)', async () => {
    const n = new FakeNarration();
    const p = speak(n, ['a', 'b'], () => true);
    await tick();
    void n.say('a'); // the language toggle restarts 'a'
    await tick(10);
    n.end(); // the restarted 'a' finishes
    await tick(200);
    expect(n.currentId()).toBe('b');
    n.end();
    expect(await p).toEqual({ result: 'ended', index: 2 });
  });

  it('stops when a different line takes over, reporting where it stopped', async () => {
    const n = new FakeNarration();
    const p = speak(n, ['a', 'b', 'c'], () => true);
    await tick();
    n.end();
    await tick();
    void n.say('tile');
    expect(await p).toEqual({ result: 'stopped', index: 1 });
  });

  it('stops when the screen goes away', async () => {
    const n = new FakeNarration();
    let alive = true;
    const p = speak(n, ['a', 'b'], () => alive);
    await tick();
    alive = false;
    n.end();
    expect((await p).result).toBe('stopped');
    expect(n.said).toEqual(['a']);
  });
});
