/**
 * Chapter 2 · Handcraft Heritage. Tap the Tây Hồ poem hat: over 1.5 s everything goes dark
 * (the book, the black backdrop, even the photo's title lettering), and only the backlit leaf with
 * its hidden pictures and lines of poetry keeps glowing. Tap again to turn the lights back on.
 */
import { el, svg } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { picture } from '../../../assets/manifest';
import { speak } from '../../phase1/speak';
import { ANN } from '../annotations';
import { P3_ICONS } from '../art';
import { keyGlow, polygonMask } from '../poemKey';
import type { Chapter, ChapterHost } from './types';

const A = ANN.heritage;
const KEY_SIZE = 900;
const FADE_MS = 1500;

export class PoemHatChapter implements Chapter {
  readonly id = 'heritage' as const;
  readonly icon = P3_ICONS.ch2;
  readonly story = ['p3.ch2.title', 'p3.ch2.story'];
  readonly firstPrompt = 'p3.ch2.prompt';
  readonly pic: HTMLDivElement;
  readonly actions: HTMLDivElement;
  complete = false;
  lit = false;

  private glow: HTMLCanvasElement;
  private photo: HTMLImageElement;
  private tap: HTMLButtonElement;
  private keyed: Promise<void> | null = null;
  private storyTold = false;
  private timer = 0;
  private offLang: () => void;

  constructor(private host: ChapterHost) {
    this.glow = el('canvas.p3-poem__glow', { width: KEY_SIZE, height: KEY_SIZE, 'aria-hidden': 'true' });
    this.tap = el('button.p3-poem__tap', {
      type: 'button',
      'data-touch': '',
      'data-test': 'poem-hat',
      'aria-pressed': 'false',
      'aria-label': i18n.t('p3.ch2.prompt'),
      onclick: () => this.toggle(),
    });
    const base = picture({ stem: A.photo, alt: i18n.t('p3.ch2.alt') }, { sizes: '(max-width: 700px) 90vw, 50vw', className: 'p3-poem__base' });
    this.photo = base.querySelector('img')!;
    // the backlight glow stays inside the hat, so the backdrop really is pitch dark
    const light = el('div.p3-poem__light', { style: `clip-path:polygon(${A.hatRegion.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(',')})` });
    this.pic = el('div.p3-pic.p3-poem', { style: '--ar:1' }, base, light, this.glow, this.tap);
    const lights = el(
      'button.btn.btn--straw.p3-act',
      { type: 'button', 'data-touch': '', 'data-test': 'poem-toggle', onclick: () => this.toggle() },
      svg(P3_ICONS.lantern),
      i18n.bind(el('span'), 'p3.ch2.light'),
    );
    this.actions = el('div.p3-actions', {}, lights);
    this.offLang = i18n.onChange(() => {
      this.tap.setAttribute('aria-label', i18n.t(this.lit ? 'p3.ch2.again' : 'p3.ch2.prompt'));
      const img = base.querySelector('img');
      if (img) img.alt = i18n.t('p3.ch2.alt');
    });
  }

  start(): void {
    this.host.prompt(this.complete ? 'p3.ch2.done' : this.firstPrompt);
    void this.prepare();
    void this.tell();
    this.hint();
  }

  stop(): void {
    if (this.lit) this.setLit(false, true);
    window.clearTimeout(this.timer);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.offLang();
  }

  resize(): void {}

  private async tell(): Promise<void> {
    const ctx = this.host.ctx;
    const alive = () => this.host.isCurrent(this.id);
    const r = await speak(ctx.narration, this.story, alive);
    this.storyTold = true;
    if (r.result === 'ended' && alive() && !this.complete && !this.lit) void ctx.narration.say(this.firstPrompt);
  }

  /** build the glowing "backlit" layer once, from the pixels of the photo on screen (no second download) */
  private prepare(): Promise<void> {
    if (this.keyed) return this.keyed;
    const img = this.photo;
    this.keyed = (async () => {
      if (!img.complete) {
        await new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        });
      }
      await img.decode().catch(() => {});
      if (!img.naturalWidth) return;
      const off = document.createElement('canvas');
      off.width = off.height = KEY_SIZE;
      const oc = off.getContext('2d', { willReadFrequently: true });
      const gc = this.glow.getContext('2d');
      if (!oc || !gc) return;
      oc.drawImage(img, 0, 0, KEY_SIZE, KEY_SIZE);
      const src = oc.getImageData(0, 0, KEY_SIZE, KEY_SIZE);
      const mask = polygonMask(A.hatRegion.map(([x, y]) => ({ x, y })), KEY_SIZE, KEY_SIZE);
      const out = new ImageData(keyGlow(src.data, mask), KEY_SIZE, KEY_SIZE);
      gc.putImageData(out, 0, 0);
    })();
    return this.keyed;
  }

  private toggle(): void {
    this.setLit(!this.lit);
  }

  private setLit(on: boolean, quiet = false): void {
    this.lit = on;
    const ctx = this.host.ctx;
    this.pic.classList.toggle('is-lit', on);
    this.host.setDark(on);
    this.tap.setAttribute('aria-pressed', String(on));
    this.tap.setAttribute('aria-label', i18n.t(on ? 'p3.ch2.again' : 'p3.ch2.prompt'));
    const label = this.actions.querySelector('span');
    if (label) i18n.bind(label, on ? 'p3.ch2.lights-on' : 'p3.ch2.light');
    window.clearTimeout(this.timer);
    if (quiet) return;
    ctx.audio.sfx.play(on ? 'sparkle' : 'tap');
    if (on) {
      void this.prepare();
      this.timer = window.setTimeout(() => this.revealed(), motion.reduced ? 300 : FADE_MS);
    } else {
      this.host.prompt(this.complete ? 'p3.ch2.done' : this.firstPrompt);
      this.hint();
    }
  }

  private revealed(): void {
    if (!this.lit || !this.host.isCurrent(this.id)) return;
    const ctx = this.host.ctx;
    this.host.prompt('p3.ch2.again');
    if (!this.complete) {
      this.complete = true;
      ctx.audio.sfx.play('chime');
      this.host.done(this.id);
    }
    if (this.storyTold) void ctx.narration.say('p3.ch2.done');
    this.hint();
  }

  hint(): void {
    const ctx = this.host.ctx;
    if (this.complete && !this.lit) return this.host.hintNext();
    ctx.idle.watch({
      stepId: this.lit ? 'p3.ch2.restore' : 'p3.ch2.tap',
      gesture: 'tap',
      target: () => {
        const b = this.pic.getBoundingClientRect();
        return { x: b.left + b.width * 0.42, y: b.top + b.height * 0.55 };
      },
    });
  }
}
