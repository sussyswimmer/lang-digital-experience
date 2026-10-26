/**
 * The landing page's 5-second hand hint (the brief's idle cue). The app's IdleHint lives inside the
 * app shell; this one belongs to the scrolling page and cleans up after itself on pause.
 * `pick()` decides what to cue right now: a swipe up to keep scrolling, or a tap on a button.
 */
import { el, svg } from '../ui/el';

export type Cue = { gesture: 'swipe'; at: () => DOMRect } | { gesture: 'tap'; at: () => DOMRect } | null;

const HAND = `<svg viewBox="0 0 64 64"><path d="M24 30V12a5 5 0 0 1 10 0v14l2-1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 3v12c0 9-7 16-16 16h-4c-6 0-11-3-14-8l-8-13a4.5 4.5 0 0 1 7-5z" fill="#FFF9EC" stroke="#6B4A2B" stroke-width="3" stroke-linejoin="round"/></svg>`;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export class IdleCue {
  private hand: HTMLDivElement;
  private timer = 0;
  private anims: Animation[] = [];
  private on = false;
  private readonly reset = () => this.restart();

  constructor(
    private host: HTMLElement,
    private pick: () => Cue,
    private opts: { delayMs: number; repeatMs: number; reduced: () => boolean },
  ) {
    this.hand = el('div.site-hand', { 'aria-hidden': 'true' }, el('div.site-hand__ripple'), svg(HAND, 'site-hand__svg'));
  }

  start(): void {
    if (this.on) return;
    this.on = true;
    this.host.appendChild(this.hand);
    for (const ev of EVENTS) window.addEventListener(ev, this.reset, { capture: true, passive: true });
    this.restart();
  }

  stop(): void {
    this.on = false;
    window.clearTimeout(this.timer);
    for (const ev of EVENTS) window.removeEventListener(ev, this.reset, { capture: true });
    this.hide();
    this.hand.remove();
  }

  /** test hook: show the cue now */
  showNow(): void {
    this.show();
  }

  private restart(): void {
    window.clearTimeout(this.timer);
    this.hide();
    if (this.on) this.timer = window.setTimeout(() => this.show(), this.opts.delayMs);
  }

  private hide(): void {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.hand.classList.remove('is-on');
  }

  private show(): void {
    this.hide();
    const cue = this.pick();
    if (cue) {
      const r = cue.at();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (r.width > 0 && y > 0 && y < window.innerHeight) {
        this.hand.style.left = `${x}px`;
        this.hand.style.top = `${y}px`;
        this.hand.classList.add('is-on');
        this.animate(cue.gesture);
      }
    }
    if (this.on) this.timer = window.setTimeout(() => this.show(), this.opts.repeatMs);
  }

  private animate(gesture: 'swipe' | 'tap'): void {
    const ripple = this.hand.firstElementChild as HTMLElement;
    if (this.opts.reduced()) {
      // no travel under reduced motion: the hand simply fades in and out where to act
      this.anims.push(this.hand.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2600 }));
      return;
    }
    if (gesture === 'tap') {
      this.anims.push(
        this.hand.animate(
          [
            { opacity: 0, transform: 'translate(10px, 18px) scale(1)' },
            { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: 0.25 },
            { opacity: 1, transform: 'translate(0, 0) scale(0.88)', offset: 0.4 },
            { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: 0.55 },
            { opacity: 0, transform: 'translate(0, 0) scale(1)' },
          ],
          { duration: 1800, iterations: 2, easing: 'ease-in-out' },
        ),
        ripple.animate(
          [
            { opacity: 0, transform: 'scale(0.4)', offset: 0.38 },
            { opacity: 1, transform: 'scale(0.6)', offset: 0.42 },
            { opacity: 0, transform: 'scale(1.8)', offset: 0.8 },
          ],
          { duration: 1800, iterations: 2 },
        ),
      );
    } else {
      this.anims.push(
        this.hand.animate(
          [
            { opacity: 0, transform: 'translate(0, 40px)' },
            { opacity: 1, transform: 'translate(0, 30px)', offset: 0.2 },
            { opacity: 1, transform: 'translate(0, -90px)', offset: 0.75 },
            { opacity: 0, transform: 'translate(0, -110px)' },
          ],
          { duration: 1700, iterations: 2, easing: 'cubic-bezier(.45,0,.3,1)' },
        ),
      );
    }
  }
}
