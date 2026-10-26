import { describe, expect, it } from 'vitest';
import { speak, type Speaker } from '../../src/phases/phase1/speak';

/**
 * A fake Narration with the real one's behaviour: say() interrupts the current line, and
 * (like Narration.stop() today) an interrupted line's promise never settles unless `settleOnStop`.
 */
class FakeNarration implements Speaker {
  current: { id: string; resolve: (r: 'ended' | 'stopped') => void } | null = null;
  log: string[] = [];
  constructor(private settleOnStop = false) {}
  say(id: string): Promise<'ended' | 'stopped'> {
    this.stop();
    this.log.push(id);
    return new Promise((resolve) => {
      this.current = { id, resolve };
    });
  }
  stop(): void {
    const c = this.current;
    this.current = null;
    if (c && this.settleOnStop) c.resolve('stopped');
  }
  currentId(): string | null {
    return this.current?.id ?? null;
  }
  /** the current line finishes normally */
  end(): void {
    const c = this.current;
    this.current = null;
    c?.resolve('ended');
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

for (const settleOnStop of [false, true]) {
  describe(`speak() (interrupted promises ${settleOnStop ? 'settle' : 'never settle'})`, () => {
    it('plays every line in order', async () => {
      const n = new FakeNarration(settleOnStop);
      const p = speak(n, ['a', 'b', 'c'], () => true);
      for (let i = 0; i < 3; i++) {
        await tick();
        n.end();
      }
      expect(await p).toEqual({ result: 'ended', index: 3 });
      expect(n.log).toEqual(['a', 'b', 'c']);
    });

    it('carries on when the same line is restarted (language toggle / replay)', async () => {
      const n = new FakeNarration(settleOnStop);
      const p = speak(n, ['a', 'b'], () => true);
      await tick();
      void n.say('a'); // the language toggle restarts 'a'
      await tick(200);
      expect(n.currentId()).toBe('a');
      n.end(); // the restarted 'a' finishes
      await tick(200);
      expect(n.currentId()).toBe('b');
      n.end();
      expect(await p).toEqual({ result: 'ended', index: 2 });
    });

    it('stops when a different line takes over, reporting where it stopped', async () => {
      const n = new FakeNarration(settleOnStop);
      const p = speak(n, ['a', 'b', 'c'], () => true);
      await tick();
      n.end();
      await tick();
      void n.say('tile');
      expect(await p).toEqual({ result: 'stopped', index: 1 });
    });

    it('stops when the narration is stopped', async () => {
      const n = new FakeNarration(settleOnStop);
      const p = speak(n, ['a', 'b'], () => true);
      await tick();
      n.stop();
      expect(await p).toEqual({ result: 'stopped', index: 0 });
    });

    it('stops when the screen goes away', async () => {
      const n = new FakeNarration(settleOnStop);
      let alive = true;
      const p = speak(n, ['a', 'b'], () => alive);
      await tick();
      alive = false;
      expect((await p).result).toBe('stopped');
      expect(n.log).toEqual(['a']);
    });
  });
}
