/** Captions for narration: up to two lines on a cream panel; the current sentence is highlighted. */
import type { Howl } from 'howler';
import { el } from './el';

export class CaptionBar {
  private box: HTMLDivElement;
  private raf = 0;
  private sentences: HTMLSpanElement[] = [];
  enabled = true;

  constructor(host: HTMLElement) {
    this.box = el('div.caption');
    host.appendChild(this.box);
  }

  show(text: string): void {
    cancelAnimationFrame(this.raf);
    this.box.textContent = '';
    const parts = text.match(/[^.!?…]+[.!?…]*["”]?\s*/g) ?? [text];
    this.sentences = parts.map((p) => el('span', {}, p));
    this.sentences.forEach((s) => this.box.appendChild(s));
    this.box.classList.toggle('is-on', this.enabled);
  }

  hide(): void {
    cancelAnimationFrame(this.raf);
    this.box.classList.remove('is-on');
  }

  /** Highlight sentences in proportion to the clip's playback position. */
  progress(howl: Howl): void {
    const total = this.sentences.reduce((n, s) => n + (s.textContent?.length ?? 0), 0) || 1;
    const tick = () => {
      const dur = howl.duration() || 1;
      const pos = (howl.seek() as number) / dur;
      this.mark(pos, total);
      if (howl.playing()) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  progressTimed(ms: number): void {
    const total = this.sentences.reduce((n, s) => n + (s.textContent?.length ?? 0), 0) || 1;
    const start = performance.now();
    const tick = () => {
      const pos = (performance.now() - start) / ms;
      this.mark(pos, total);
      if (pos < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private mark(pos: number, total: number): void {
    let acc = 0;
    for (const s of this.sentences) {
      const len = s.textContent?.length ?? 0;
      const on = pos * total >= acc && pos * total < acc + len;
      if (on && !s.querySelector('mark')) {
        const m = el('mark', {}, s.textContent ?? '');
        s.textContent = '';
        s.appendChild(m);
      } else if (!on && s.querySelector('mark')) {
        s.textContent = s.textContent ?? '';
      }
      acc += len;
    }
  }
}
