/** Reduced motion: the OS setting, overridable in Settings. */
let override: 'system' | 'reduced' | 'full' = 'system';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const motion = {
  set(mode: 'system' | 'reduced' | 'full'): void {
    override = mode;
    document.documentElement.classList.toggle('reduced-motion', this.reduced);
  },
  get reduced(): boolean {
    if (override === 'reduced') return true;
    if (override === 'full') return false;
    return Boolean(mq?.matches);
  },
  /** scale a tween duration: shorter (not zero) under reduced motion */
  dur(seconds: number): number {
    return this.reduced ? Math.min(seconds * 0.3, 0.25) : seconds;
  },
};
