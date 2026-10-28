/**
 * "Simple visual hand animations to cue swipe/tap gestures if no activity is detected after
 * 5 seconds" (brief). Each interactive step registers what to hint; any pointer or key input
 * resets the timer. The hint repeats every 8 s; on the 2nd repeat an optional nudge line plays.
 */
import { gsap } from 'gsap';
import { el, svg } from '../ui/el';
import { burst, isReady, preload } from '../ui/lottie';
import { motion } from './motion';

export type Gesture = 'tap' | 'swipe' | 'drag' | 'trace';
export interface Point {
  x: number;
  y: number;
}

export interface IdleStep {
  stepId: string;
  gesture: Gesture;
  /** where to show the hand (viewport px); for swipe/drag/trace this is the start */
  target: () => Point | DOMRect | null;
  /** swipe/drag: end point; trace: a path of points */
  path?: () => Point[];
  delayMs?: number;
  repeatMs?: number;
  nudge?: () => void;
}

const HAND_SVG = `<svg viewBox="0 0 64 64"><path d="M24 30V12a5 5 0 0 1 10 0v14l2-1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 3v12c0 9-7 16-16 16h-4c-6 0-11-3-14-8l-8-13a4.5 4.5 0 0 1 7-5z" fill="#FFF9EC" stroke="#6B4A2B" stroke-width="3" stroke-linejoin="round"/></svg>`;

function centre(t: Point | DOMRect): Point {
  return 'width' in t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : t;
}

export class IdleHint {
  private step: IdleStep | null = null;
  private timer = 0;
  private repeats = 0;
  private hand: HTMLDivElement;
  private tl: gsap.core.Timeline | null = null;
  private stopRipple: (() => void) | null = null;
  /** test mode shortens the 5 s wait */
  scale = 1;
  /** while narration is speaking the child is listening, not idle */
  private busy = false;

  constructor(host: HTMLElement) {
    this.hand = el('div.hand-hint', { style: 'display:none' }, el('div.hand-hint__ripple'), svg(HAND_SVG, 'hand-hint__svg'));
    host.appendChild(this.hand);
    const reset = () => this.reset();
    for (const ev of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, reset, { capture: true, passive: true });
    // a long trace or drag is activity too, not just its first touch
    window.addEventListener('pointermove', (e) => e.buttons && reset(), { capture: true, passive: true });
  }

  watch(step: IdleStep): void {
    // the EffectCraft ripple is fetched while the 5 s wait runs; until then the CSS ring stands in
    if (step.gesture === 'tap' && !motion.reduced) void preload('tap-ripple');
    this.step = step;
    this.repeats = 0;
    this.reset();
  }

  clear(stepId?: string): void {
    if (stepId && this.step?.stepId !== stepId) return;
    this.step = null;
    window.clearTimeout(this.timer);
    this.hideHand();
  }

  /** narration start/end: the 5 s idle timer only runs once the voice has finished */
  setBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    this.reset();
  }

  /** show the hint now (used by tests and by a "help" button) */
  showNow(): void {
    window.clearTimeout(this.timer);
    this.fire();
  }

  private reset(): void {
    window.clearTimeout(this.timer);
    this.hideHand();
    if (!this.step || this.busy) return;
    this.timer = window.setTimeout(() => this.fire(), (this.step.delayMs ?? 5000) * this.scale);
  }

  private fire(): void {
    const step = this.step;
    if (!step) return;
    const target = step.target();
    if (target) this.animate(step, centre(target));
    this.repeats++;
    if (this.repeats === 2) step.nudge?.();
    this.timer = window.setTimeout(() => this.fire(), (step.repeatMs ?? 8000) * this.scale);
  }

  private animate(step: IdleStep, at: Point): void {
    this.tl?.kill();
    const hand = this.hand;
    const ripple = hand.querySelector('.hand-hint__ripple') as HTMLElement;
    hand.style.display = 'block';
    gsap.set(hand, { x: at.x, y: at.y, opacity: 0, scale: 1 });
    const tl = gsap.timeline();
    this.tl = tl;
    tl.to(hand, { opacity: 1, duration: 0.25 });
    if (motion.reduced) {
      tl.to(hand, { opacity: 0.4, yoyo: true, repeat: 3, duration: 0.4 });
    } else if (step.gesture === 'tap') {
      tl.to(hand, { scale: 0.88, duration: 0.18, yoyo: true, repeat: 3 });
      if (isReady('tap-ripple')) {
        // centred on the fingertip (the CSS ring's box)
        tl.call(() => {
          const r = ripple.getBoundingClientRect();
          this.stopRipple = burst(hand, 'tap-ripple', { x: r.left + r.width / 2, y: r.top + r.height / 2 }, { size: 128 });
        }, undefined, '<');
      } else {
        tl.fromTo(ripple, { scale: 0.4, opacity: 0.9 }, { scale: 2.2, opacity: 0, duration: 0.6 }, '<');
      }
    } else {
      const pts = step.path?.() ?? [];
      if (pts.length) {
        tl.to(hand, { scale: 0.9, duration: 0.15 });
        const seg = (step.gesture === 'trace' ? 1.8 : 0.9) / pts.length;
        for (const p of pts) tl.to(hand, { x: p.x, y: p.y, duration: seg, ease: 'none' });
        tl.to(hand, { scale: 1, duration: 0.15 });
      }
    }
    tl.to(hand, { opacity: 0, duration: 0.3, delay: 0.2 });
  }

  private hideHand(): void {
    this.tl?.kill();
    this.tl = null;
    this.stopRipple?.();
    this.stopRipple = null;
    this.hand.style.display = 'none';
  }
}
