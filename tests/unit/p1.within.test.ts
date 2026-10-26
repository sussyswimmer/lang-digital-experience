import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '../../src/phases/phase1/within';

describe('within (time limit for the 3D hat hand-offs)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes a value through when the promise settles in time', async () => {
    const p = within(new Promise<number>((r) => setTimeout(() => r(7), 100)), 1000);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a rejection through', async () => {
    const p = within(Promise.reject(new Error('Failed to fetch')), 1000);
    await expect(p).rejects.toThrow('Failed to fetch');
  });

  it('rejects when the promise never settles', async () => {
    const p = within(new Promise(() => {}), 500);
    const seen = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(500);
    await seen;
  });
});
