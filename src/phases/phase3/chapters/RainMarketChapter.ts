/**
 * Chapter 3 · Cultural Identity. "Make it rain": drops run off the market's hats and drip from the
 * brims while the shoppers underneath stay dry. Then "Let's count the hats together!": every hat
 * has an invisible hotspot; each tap places the next number and says it out loud.
 */
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { picture } from '../../../assets/manifest';
import { speak } from '../../phase1/speak';
import { ANN } from '../annotations';
import { P3_ICONS } from '../art';
import type { Pt } from '../geometry';
import { badgeSpot, buildHats, hatAt, type Hat } from '../hats';
import { RainSim } from '../rain/RainSim';
import type { Chapter, ChapterHost } from './types';

const A = ANN.identity;
const AR = A.width / A.height;
const RAIN_SECONDS = 10;
/** count words and narration exist up to here (content/strings/phase3.json num.N) */
const MAX_SAY = 60;

export class RainMarketChapter implements Chapter {
  readonly id = 'identity' as const;
  readonly icon = P3_ICONS.ch3;
  readonly story = ['p3.ch3.title', 'p3.ch3.story.1', 'p3.ch3.story.2'];
  readonly firstPrompt = 'p3.ch3.rain-prompt';
  readonly pic: HTMLDivElement;
  readonly actions: HTMLDivElement;
  complete = false;

  private canvas: HTMLCanvasElement;
  private countLayer: HTMLDivElement;
  private rainBtn: HTMLButtonElement;
  private doneBtn: HTMLButtonElement;
  private againBtn: HTMLButtonElement;
  private result: HTMLDivElement;
  private hats: Hat[] = [];
  private size = { w: 0, h: 0 };
  private sim: RainSim | null = null;
  private raf = 0;
  private last = 0;
  private rained = false;
  private counting = false;
  private counted = new Map<number, number>();
  private badges = new Map<number, HTMLElement>();
  /** where each badge sits, as fractions of the photo (nudged off its neighbours' numbers) */
  private spots = new Map<number, Pt>();
  private hatButtons: HTMLButtonElement[] = [];
  private showingResult = false;
  private timers: number[] = [];
  private offLang: () => void;

  constructor(private host: ChapterHost) {
    this.canvas = el('canvas.p3-rain__canvas', { 'aria-hidden': 'true' });
    this.countLayer = el('div.p3-rain__count', { 'data-no-swipe': '', 'data-test': 'count-layer' });
    const photo = picture({ stem: A.photo, alt: i18n.t('p3.ch3.alt'), widths: [640, 1280, 1920, 2560] }, { sizes: '(max-width: 700px) 92vw, 62vw', className: 'p3-rain__img' });
    this.pic = el('div.p3-pic.p3-rain', { style: `--ar:${AR.toFixed(4)}` }, photo, el('div.p3-rain__grade'), this.canvas, this.countLayer);

    this.rainBtn = el(
      'button.btn.btn--straw.p3-act',
      { type: 'button', 'data-touch': '', 'data-test': 'rain', onclick: () => this.makeRain() },
      svg(P3_ICONS.rain),
      i18n.bind(el('span'), 'p3.ch3.rain'),
    );
    this.doneBtn = el(
      'button.btn.p3-act',
      { type: 'button', 'data-touch': '', 'data-test': 'count-done', hidden: true, onclick: () => this.showResult() },
      svg(P3_ICONS.check),
      i18n.bind(el('span'), 'p3.ch3.count-done'),
    );
    this.againBtn = el(
      'button.btn.btn--ghost.p3-act',
      { type: 'button', 'data-touch': '', 'data-test': 'count-again', hidden: true, onclick: () => this.countAgain() },
      svg(P3_ICONS.again),
      i18n.bind(el('span'), 'p3.ch3.count-again'),
    );
    this.result = el('div.p3-result', { hidden: true, role: 'status', 'data-test': 'count-result' });
    this.actions = el('div.p3-actions', {}, this.rainBtn, this.result, this.doneBtn, this.againBtn);
    this.wireCounting();
    this.offLang = i18n.onChange(() => {
      const img = photo.querySelector('img');
      if (img) img.alt = i18n.t('p3.ch3.alt');
      for (const b of this.hatButtons) b.setAttribute('aria-label', i18n.t('p3.ch3.hat-label'));
    });
  }

  start(): void {
    this.host.prompt(this.counting ? 'p3.ch3.count' : this.firstPrompt);
    this.resize();
    void this.tell();
    this.hint();
  }

  stop(): void {
    this.sim?.stop();
    this.sim = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pic.classList.remove('is-raining');
    this.clearCanvas();
    this.host.ctx.audio.stopAmbient('rainMarket');
    for (const t of this.timers.splice(0)) window.clearTimeout(t);
  }

  dispose(): void {
    this.stop();
    this.offLang();
  }

  private async tell(): Promise<void> {
    const ctx = this.host.ctx;
    const alive = () => this.host.isCurrent(this.id);
    const r = await speak(ctx.narration, this.story, alive);
    if (r.result !== 'ended' || !alive()) return;
    if (!this.rained && !this.sim) void ctx.narration.say(this.firstPrompt);
    else if (this.counting && this.counted.size === 0) void ctx.narration.say('p3.ch3.count');
  }

  // ---------- layout ----------

  resize(): void {
    const b = this.pic.getBoundingClientRect();
    if (!b.width) return;
    this.size = { w: b.width, h: b.height };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(b.width * dpr);
    this.canvas.height = Math.round(b.height * dpr);
    this.hats = buildHats(A.hats, b.width, b.height);
    if (this.sim?.running) this.startSim(Math.max(2, RAIN_SECONDS * this.sim.intensity));
    this.buildHatButtons();
  }

  // ---------- rain ----------

  private makeRain(): void {
    const ctx = this.host.ctx;
    if (this.sim?.running) return;
    ctx.audio.sfx.play('swish');
    ctx.audio.playAmbient('rainMarket');
    this.pic.classList.add('is-raining');
    this.startSim(RAIN_SECONDS);
    ctx.idle.clear('p3.ch3.rain');
    if (!this.rained) {
      this.timers.push(
        window.setTimeout(() => {
          if (this.host.isCurrent(this.id)) void ctx.narration.say('p3.ch3.dry');
        }, motion.reduced ? 800 : 2600),
      );
    }
    this.rained = true;
  }

  private startSim(seconds: number): void {
    this.sim = new RainSim(this.size.w, this.size.h, this.hats, { seed: (Date.now() & 0xffff) + 1, reduced: motion.reduced });
    this.sim.start(seconds);
    this.last = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    this.raf = 0;
    const sim = this.sim;
    if (!sim) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    sim.step(dt);
    this.draw(sim);
    if (sim.busy || sim.wetness > 0.01) {
      this.raf = requestAnimationFrame((t) => this.frame(t));
    } else {
      this.clearCanvas();
    }
    if (!sim.running && this.pic.classList.contains('is-raining')) this.rainStopped();
  }

  private rainStopped(): void {
    this.pic.classList.remove('is-raining');
    this.host.ctx.audio.stopAmbient('rainMarket');
    if (!this.counting) this.startCounting();
  }

  private clearCanvas(): void {
    const c = this.canvas.getContext('2d');
    c?.setTransform(1, 0, 0, 1, 0, 0);
    c?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw(sim: RainSim): void {
    const c = this.canvas.getContext('2d');
    if (!c) return;
    const dpr = this.canvas.width / (this.size.w || 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.size.w, this.size.h);
    // wet sheen on the hats
    if (sim.wetness > 0.01) {
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(200, 225, 255, ${0.22 * sim.wetness})`;
      for (const h of this.hats) {
        c.beginPath();
        c.moveTo(h.apex.x, h.apex.y);
        c.lineTo(h.l.x, h.l.y);
        c.lineTo(h.r.x, h.r.y);
        c.closePath();
        c.fill();
      }
    }
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(220, 236, 255, 0.7)';
    c.lineWidth = 1.6;
    c.beginPath();
    for (const d of sim.drops) {
      if (d.state === 'fall' || d.state === 'drip') {
        const k = d.state === 'drip' ? 0.01 : 0.014;
        const fade = Math.min(1, d.age / 0.06);
        if (fade < 1) continue;
        c.moveTo(d.x - d.vx * k, d.y - d.vy * k);
        c.lineTo(d.x, d.y);
      }
    }
    c.stroke();
    c.fillStyle = 'rgba(235, 245, 255, 0.9)';
    for (const d of sim.drops) {
      if (d.state !== 'slide') continue;
      c.beginPath();
      c.arc(d.x, d.y, 1.8, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(220, 236, 255, 0.5)';
    c.lineWidth = 1;
    for (const d of sim.drops) {
      if (d.state !== 'splash') continue;
      const r = 2 + d.age * 16;
      c.globalAlpha = Math.max(0, 1 - d.age / 0.3);
      c.beginPath();
      c.ellipse(d.x, d.y, r, r * 0.35, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // ---------- counting ----------

  private startCounting(): void {
    this.counting = true;
    this.countLayer.classList.add('is-on');
    this.doneBtn.hidden = false;
    this.revealActions();
    this.host.prompt('p3.ch3.count');
    const ctx = this.host.ctx;
    if (this.host.isCurrent(this.id)) {
      ctx.audio.sfx.play('invite');
      void ctx.narration.say('p3.ch3.count');
    }
    this.hint();
  }

  private wireCounting(): void {
    let down: { x: number; y: number } | null = null;
    this.countLayer.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    this.countLayer.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 20) return;
      down = null;
      const b = this.pic.getBoundingClientRect();
      const i = hatAt(this.hats, { x: e.clientX - b.left, y: e.clientY - b.top });
      if (i >= 0) this.countHat(i);
    });
  }

  private buildHatButtons(): void {
    for (const b of this.hatButtons) b.remove();
    this.hatButtons = this.hats.map((h, i) =>
      el('button.p3-hatbtn', {
        type: 'button',
        tabindex: '0',
        'aria-label': i18n.t('p3.ch3.hat-label'),
        style: `left:${(h.centre.x / this.size.w) * 100}%;top:${(h.centre.y / this.size.h) * 100}%`,
        onclick: (e: MouseEvent) => {
          // pointer taps are handled by the layer (nearest hat); this is for keyboards
          if (e.detail === 0) this.countHat(i);
        },
      }),
    );
    this.countLayer.prepend(...this.hatButtons);
  }

  private countHat(i: number): void {
    if (!this.counting) return;
    const ctx = this.host.ctx;
    const existing = this.badges.get(i);
    if (existing) {
      ctx.audio.sfx.play('tap');
      if (!motion.reduced) this.host.g.add(() => gsap.fromTo(existing, { rotation: -14 }, { rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' }));
      return;
    }
    if (this.showingResult) this.hideResult();
    const n = this.counted.size + 1;
    this.counted.set(i, n);
    const badge = el('span.p3-badge', { 'aria-hidden': 'true', dataset: { n: String(n) } }, String(n));
    this.badges.set(i, badge);
    this.countLayer.appendChild(badge);
    // neighbouring hats can sit closer than a badge is wide: keep every number readable
    const { w, h } = this.size;
    const taken = [...this.spots.values()].map((s) => ({ x: s.x * w, y: s.y * h }));
    const p = badgeSpot(this.hats[i], taken, badge.offsetWidth || 40, w, h);
    const spot = { x: p.x / w, y: p.y / h };
    this.spots.set(i, spot);
    Object.assign(badge.style, { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` });
    this.host.g.add(() => gsap.from(badge, { scale: 0, duration: motion.dur(0.45), ease: 'back.out(2.2)' }));
    ctx.audio.sfx.play('badge');
    void ctx.narration.say(`num.${Math.min(n, MAX_SAY)}`);
    if (!this.complete && this.rained && n >= 3) {
      this.complete = true;
      this.host.done(this.id);
    }
    if (n === this.hats.length) this.timers.push(window.setTimeout(() => this.showResult(), 900));
    this.hint();
  }

  private showResult(): void {
    const n = this.counted.size;
    if (n === 0 || this.showingResult) return;
    this.showingResult = true;
    const id = `p3.ch3.counted.${Math.min(n, MAX_SAY)}`;
    i18n.bind(this.result, id);
    this.result.hidden = false;
    this.doneBtn.hidden = true;
    this.againBtn.hidden = false;
    this.revealActions();
    const ctx = this.host.ctx;
    ctx.audio.sfx.play('fanfare');
    void ctx.narration.say(id);
    this.host.g.add(() => gsap.from(this.result, { scale: 0.6, opacity: 0, duration: motion.dur(0.5), ease: 'back.out(1.8)' }));
    if (!this.complete) {
      this.complete = true;
      this.host.done(this.id);
    }
    this.hint();
  }

  /** on a phone the text column scrolls: bring the buttons that just appeared into view */
  private revealActions(): void {
    const side = this.actions.closest<HTMLElement>('.p3-page__side');
    if (!side || side.scrollHeight <= side.clientHeight) return;
    const below = this.actions.getBoundingClientRect().bottom - side.getBoundingClientRect().bottom;
    if (below > 0) side.scrollTo({ top: side.scrollTop + below + 8, behavior: motion.reduced ? 'auto' : 'smooth' });
  }

  private hideResult(): void {
    this.showingResult = false;
    this.result.hidden = true;
    this.againBtn.hidden = true;
    this.doneBtn.hidden = false;
  }

  private countAgain(): void {
    for (const b of this.badges.values()) b.remove();
    this.badges.clear();
    this.spots.clear();
    this.counted.clear();
    this.hideResult();
    this.host.ctx.audio.sfx.play('swish');
    void this.host.ctx.narration.say('p3.ch3.count');
    this.hint();
  }

  // ---------- hints / tests ----------

  hint(): void {
    const ctx = this.host.ctx;
    if (!this.counting) {
      ctx.idle.watch({ stepId: 'p3.ch3.rain', gesture: 'tap', target: () => this.rainBtn.getBoundingClientRect() });
      return;
    }
    // counted (or every hat counted): the only thing left is to turn the page
    if (this.showingResult || this.counted.size >= this.hats.length) return this.host.hintNext();
    ctx.idle.watch({
      stepId: 'p3.ch3.count',
      gesture: 'tap',
      target: () => {
        const i = this.hats.findIndex((_, k) => !this.counted.has(k));
        if (i < 0) return null;
        const b = this.pic.getBoundingClientRect();
        return { x: b.left + this.hats[i].centre.x, y: b.top + this.hats[i].centre.y };
      },
    });
  }

  hatCenters(): { x: number; y: number }[] {
    const b = this.pic.getBoundingClientRect();
    return this.hats.map((h) => ({ x: b.left + h.centre.x, y: b.top + h.centre.y }));
  }

  get raining(): boolean {
    return Boolean(this.sim?.running);
  }

  get count(): number {
    return this.counted.size;
  }
}
