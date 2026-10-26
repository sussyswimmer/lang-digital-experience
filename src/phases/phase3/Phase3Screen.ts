/**
 * Phase 3: Cultural Storytelling Showcase.
 * Arriving from Phase 2, the finished hat celebrates and shrinks into a storybook cover; tapping
 * it swings the book open onto a one-chapter-per-swipe carousel. Each chapter is a picture,
 * narration and one small interaction. The route param :chapter selects the page, and a chapter
 * is only marked done (ctx.completeChapter) when the child moves on with Next, so on the first
 * run the pages unlock in order. "Finish the story" celebrates and opens the Activity Hub.
 */
import './phase3.css';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { TopBar } from '../../ui/TopBar';
import { i18n } from '../../i18n/i18n';
import { motion } from '../../a11y/motion';
import { isOpen } from '../../app/flow';
import { CHAPTERS, type ChapterId } from '../../app/types';
import type { AppContext, Screen } from '../../app/context';
import { hatArt } from '../phase1/art';
import { speak } from '../phase1/speak';
import { Cover } from './Cover';
import { P3_ICONS } from './art';
import { confetti } from './confetti';
import type { Chapter, ChapterHost } from './chapters/types';
import { SunShadeChapter } from './chapters/SunShadeChapter';
import { PoemHatChapter } from './chapters/PoemHatChapter';
import { RainMarketChapter } from './chapters/RainMarketChapter';

gsap.registerPlugin(Observer);

function pick(c: string | undefined): ChapterId {
  return (CHAPTERS as readonly string[]).includes(c ?? '') ? (c as ChapterId) : 'protection';
}

interface Page {
  el: HTMLElement;
  prompt: HTMLSpanElement;
}

class Phase3 implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private g = gsap.context(() => {});
  private alive = false;
  private cover!: Cover;
  private story!: HTMLDivElement;
  private viewport!: HTMLDivElement;
  private track!: HTMLDivElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private nextLabel!: HTMLSpanElement;
  private nextIcon!: HTMLSpanElement;
  private dots: HTMLButtonElement[] = [];
  private chapters!: Record<ChapterId, Chapter>;
  private pages = {} as Record<ChapterId, Page>;
  private current: ChapterId = 'protection';
  private started: ChapterId | null = null;
  private coverOpen = false;
  private opening = false;
  private finishing = false;
  private cleanups: (() => void)[] = [];

  mount(root: HTMLElement, ctx: AppContext, params: Record<string, string>): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p3');
    const id = pick(params.chapter);
    this.current = id;

    const host: ChapterHost = {
      ctx,
      g: this.g,
      isCurrent: (c) => this.alive && this.coverOpen && this.started === c,
      prompt: (sid) => this.setPrompt(sid),
      done: () => this.refreshNav(),
      setDark: (on) => root.classList.toggle('p3--dark', on),
    };
    this.chapters = {
      protection: new SunShadeChapter(host),
      heritage: new PoemHatChapter(host),
      identity: new RainMarketChapter(host),
    };
    this.cover = new Cover(() => void this.openBook(true));
    this.buildStory();
    root.append(TopBar(ctx, { titleId: 'p3.title' }), this.cover.wrap, this.story);

    const ro = new ResizeObserver(() => {
      if (this.coverOpen) this.chapters[this.current].resize();
    });
    ro.observe(this.viewport);
    this.cleanups.push(() => ro.disconnect());
    this.wireSwipe();
    this.exposeTestHooks();
    const offLang = i18n.onChange(() => {
      this.dots.forEach((d, i) => d.setAttribute('aria-label', i18n.t('p3.chapter', { n: i + 1 })));
    });
    this.cleanups.push(offLang);

    if (id === 'protection') void this.showCover();
    else {
      void this.openBook(false);
    }
  }

  update(params: Record<string, string>): boolean {
    const id = pick(params.chapter);
    if (!this.coverOpen) {
      this.current = id;
      void this.openBook(false);
    } else void this.goTo(id, true);
    return true;
  }

  unmount(): void {
    this.alive = false;
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    for (const c of Object.values(this.chapters)) {
      c.stop();
      c.dispose();
    }
    this.cover.dispose();
    this.root.replaceChildren();
  }

  // ---------- building ----------

  private buildStory(): void {
    this.track = el('div.p3-track');
    CHAPTERS.forEach((id, i) => {
      const page = this.buildPage(this.chapters[id], i + 1);
      this.pages[id] = page;
      this.track.appendChild(page.el);
    });
    this.viewport = el('div.p3-viewport', {}, this.track);
    this.prevBtn = el(
      'button.p3-nav.p3-nav--prev',
      { type: 'button', 'data-touch': '', 'data-test': 'prev', onclick: () => this.onPrev() },
      el('span.p3-nav__disc', {}, svg(ICONS.prev)),
      i18n.bind(el('span.p3-nav__label'), 'p3.prev'),
    );
    this.nextIcon = el('span.p3-nav__disc', {}, svg(ICONS.next));
    this.nextLabel = i18n.bind(el('span.p3-nav__label'), 'p3.next');
    this.nextBtn = el('button.p3-nav.p3-nav--next', { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => this.onNext() }, this.nextIcon, this.nextLabel);
    const dotsBox = el('div.p3-dots', { role: 'group', 'aria-label': i18n.t('p3.title') });
    this.dots = CHAPTERS.map((id, i) =>
      el(
        'button.p3-dot',
        { type: 'button', 'data-touch': '', 'data-test': `dot-${id}`, 'aria-label': i18n.t('p3.chapter', { n: i + 1 }), onclick: () => this.onDot(id) },
        el('span.p3-dot__mark'),
      ),
    );
    dotsBox.append(...this.dots);
    this.story = el('div.p3-story', { hidden: true }, this.prevBtn, this.viewport, this.nextBtn, dotsBox);
  }

  private buildPage(ch: Chapter, n: number): Page {
    const promptText = i18n.bind(el('span.p3-prompt__text'), ch.firstPrompt);
    const listen = el(
      'button.btn.btn--ghost.p3-listen',
      { type: 'button', 'data-touch': '', 'data-test': 'listen', onclick: () => this.retell(ch) },
      svg(ICONS.speaker),
      i18n.bind(el('span'), 'p3.listen'),
    );
    const side = el(
      'div.p3-page__side',
      {},
      el('div.p3-chip', {}, svg(ch.icon), i18n.bind(el('span'), 'p3.chapter', { n })),
      i18n.bind(el('h2.p3-page__title'), `p3.ch${n}.title`),
      el('div.p3-prompt', {}, svg(P3_ICONS.hand, 'p3-prompt__hand'), promptText),
      ch.actions,
      el('div.p3-page__grow'),
      listen,
    );
    const page = el('article.p3-page', { dataset: { chapter: ch.id } }, el('div.p3-page__pic', {}, ch.pic), side);
    return { el: page, prompt: promptText };
  }

  private setPrompt(id: string): void {
    i18n.bind(this.pages[this.current].prompt, id);
  }

  // ---------- cover ----------

  /** first arrival from Phase 2 (not a revisit): the 3D hat celebrates and becomes the cover */
  private fromPhase2(): boolean {
    const p = this.ctx.progress.get();
    return p.p2.layers.strap === 'done' && p.p3.chapters.protection !== 'done' && !p.firstRunComplete;
  }

  private async showCover(): Promise<void> {
    const ctx = this.ctx;
    gsap.set([this.cover.book, this.cover.cta], { opacity: 0 });
    // not tappable until it has arrived
    this.cover.wrap.inert = true;
    if (this.fromPhase2()) {
      const told = speak(ctx.narration, ['p3.transition'], () => this.alive && !this.coverOpen);
      let handedOff = false;
      if (ctx.layers.stage.childElementCount > 0) {
        const viewer = await ctx.viewer();
        if (!this.alive) return;
        viewer.sound = (id, o) => ctx.audio.sfx.play(id, o);
        const r = this.cover.hatRect();
        const t0 = performance.now();
        await viewer.celebrateAndShrinkTo({ x: r.left, y: r.top, width: r.width, height: r.height });
        handedOff = performance.now() - t0 > 120;
        if (handedOff && this.alive) {
          await this.cover.reveal(this.g);
          viewer.hide({ fade: 0.4 });
        }
      }
      if (!this.alive) return;
      if (!handedOff) {
        await this.domCelebrate();
        if (!this.alive) return;
        await this.cover.reveal(this.g);
      }
      await told;
    } else {
      await this.cover.reveal(this.g);
    }
    if (!this.alive || this.coverOpen) return;
    this.cover.wrap.inert = false;
    if (!ctx.narration.currentId()) void ctx.narration.say('p3.cover.open');
    if (!motion.reduced) this.cover.cta.classList.add('p3-pulse');
    ctx.idle.watch({ stepId: 'p3.cover', gesture: 'tap', target: () => this.cover.book.getBoundingClientRect() });
  }

  /** the WebGL hand-off is still a stub: a drawn hat glows, turns once and shrinks onto the cover */
  private async domCelebrate(): Promise<void> {
    const hat = el('div.p3-celebrate');
    hat.innerHTML = hatArt('celebrate');
    this.root.appendChild(hat);
    this.ctx.audio.sfx.play('chime');
    const from = hat.getBoundingClientRect();
    const to = this.cover.hatRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    await this.g.add(() => {
      const tl = gsap.timeline();
      tl.fromTo(hat, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: motion.dur(0.6), ease: 'back.out(1.6)' });
      tl.call(() => hat.classList.add('is-glowing'));
      if (!motion.reduced) tl.to(hat, { rotationY: 360, transformPerspective: 900, duration: 2, ease: 'power2.inOut' });
      tl.to(hat, { x: dx, y: dy, scale: to.width / from.width, duration: motion.dur(1.05), ease: 'power3.inOut' }, '+=0.15');
      tl.to(hat, { opacity: 0, duration: 0.3 }, '-=0.1');
      return tl;
    });
    hat.remove();
  }

  private async openBook(animated: boolean): Promise<void> {
    if (this.coverOpen || this.opening) return;
    this.opening = true;
    const ctx = this.ctx;
    ctx.idle.clear();
    ctx.narration.stop();
    this.cover.cta.classList.remove('p3-pulse');
    if (animated) {
      ctx.audio.sfx.play('bookOpen');
      await this.cover.open(this.g);
      if (!this.alive) return;
    }
    this.cover.wrap.hidden = true;
    this.story.hidden = false;
    this.coverOpen = true;
    this.opening = false;
    gsap.set(this.track, { xPercent: -100 * CHAPTERS.indexOf(this.current) });
    if (animated) this.g.add(() => gsap.fromTo(this.story, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: motion.dur(0.5), ease: 'power2.out' }));
    await this.goTo(this.current, false);
  }

  // ---------- pages ----------

  private async goTo(id: ChapterId, animate: boolean): Promise<void> {
    const ctx = this.ctx;
    if (this.started === id) return;
    if (this.started) this.chapters[this.started].stop();
    this.started = null;
    this.current = id;
    this.root.classList.remove('p3--dark');
    ctx.narration.stop();
    ctx.idle.clear();
    this.refreshNav();
    const x = -100 * CHAPTERS.indexOf(id);
    if (animate) {
      ctx.audio.sfx.play('pageTurn');
      await this.g.add(() => gsap.to(this.track, { xPercent: x, x: 0, duration: motion.dur(0.75), ease: 'power2.inOut', overwrite: 'auto' }));
    } else gsap.set(this.track, { xPercent: x, x: 0 });
    if (!this.alive || this.current !== id) return;
    this.started = id;
    this.chapters[id].start();
    this.refreshNav();
  }

  private retell(ch: Chapter): void {
    if (this.started !== ch.id) return;
    void speak(this.ctx.narration, ch.story, () => this.alive && this.started === ch.id);
  }

  private chapterDone(id: ChapterId): boolean {
    return this.chapters[id].complete || this.ctx.progress.get().p3.chapters[id] === 'done';
  }

  private canNext(): boolean {
    return this.chapterDone(this.current) || isOpen(this.ctx.progress.get(), this.ctx.flags);
  }

  private reachable(id: ChapterId): boolean {
    const p = this.ctx.progress.get();
    return isOpen(p, this.ctx.flags) || p.p3.chapters[id] !== 'locked';
  }

  private refreshNav(): void {
    const i = CHAPTERS.indexOf(this.current);
    const last = i === CHAPTERS.length - 1;
    this.prevBtn.disabled = i === 0;
    this.nextBtn.classList.toggle('p3-nav--finish', last);
    this.nextIcon.replaceChildren(svg(last ? P3_ICONS.star : ICONS.next));
    i18n.bind(this.nextLabel, last ? 'p3.finish' : 'p3.next');
    this.nextBtn.dataset.test = last ? 'finish' : 'next';
    const can = this.canNext();
    this.nextBtn.classList.toggle('is-locked', !can);
    this.nextBtn.setAttribute('aria-disabled', String(!can));
    this.nextBtn.classList.toggle('is-ready', can && this.chapters[this.current].complete && !motion.reduced);
    CHAPTERS.forEach((id, k) => {
      const d = this.dots[k];
      d.classList.toggle('is-current', id === this.current);
      d.classList.toggle('is-done', this.chapterDone(id));
      const locked = !this.reachable(id) && !(k === i + 1 && this.chapters[this.current].complete);
      d.classList.toggle('is-locked', locked);
      d.setAttribute('aria-current', String(id === this.current));
    });
    if (this.started && this.chapters[this.current].complete) {
      this.ctx.idle.watch({ stepId: `p3.next.${this.current}`, gesture: 'tap', target: () => this.nextBtn.getBoundingClientRect() });
    }
  }

  private onPrev(): void {
    const i = CHAPTERS.indexOf(this.current);
    if (i <= 0 || this.finishing) return;
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state: 'p3', params: { chapter: CHAPTERS[i - 1] } });
  }

  private onNext(): void {
    if (this.finishing || !this.coverOpen) return;
    const ctx = this.ctx;
    const id = this.current;
    const i = CHAPTERS.indexOf(id);
    if (!this.canNext()) return this.nudge();
    ctx.audio.sfx.play('tap');
    if (i === CHAPTERS.length - 1) return void this.finish();
    if (this.chapterDone(id)) ctx.completeChapter(id);
    else ctx.go({ state: 'p3', params: { chapter: CHAPTERS[i + 1] } });
  }

  private onDot(id: ChapterId): void {
    if (id === this.current || this.finishing) return;
    const i = CHAPTERS.indexOf(id);
    if (i === CHAPTERS.indexOf(this.current) + 1) return this.onNext();
    if (!this.reachable(id)) return this.nudge();
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state: 'p3', params: { chapter: id } });
  }

  /** Next while the page isn't done yet: a gentle shake, a word, and the hand shows what to do */
  private nudge(): void {
    const ctx = this.ctx;
    ctx.audio.sfx.play('floatBack');
    if (!motion.reduced) this.g.add(() => gsap.fromTo(this.nextBtn, { x: 0 }, { keyframes: { x: [-8, 8, -5, 5, 0] }, duration: 0.4 }));
    void ctx.narration.say('p3.locked');
    this.chapters[this.current].hint();
  }

  private async finish(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    const ctx = this.ctx;
    ctx.idle.clear();
    this.chapters[this.current].stop();
    ctx.audio.sfx.play('fanfare');
    const burst = confetti(this.root);
    this.cleanups.push(burst.stop);
    const cheer = speak(ctx.narration, ['p3.finish.cheer'], () => this.alive);
    const enough = new Promise((r) => window.setTimeout(r, 6000));
    await Promise.all([burst.done, Promise.race([cheer, enough])]);
    if (!this.alive) return;
    if (this.chapterDone('identity')) ctx.completeChapter('identity');
    else ctx.go({ state: 'hub', params: {} });
  }

  // ---------- swipe ----------

  private wireSwipe(): void {
    let suppressClick = false;
    const obs = Observer.create({
      target: this.viewport,
      type: 'touch,pointer',
      dragMinimum: 10,
      ignoreCheck: (e: Event) => Boolean((e.target as Element | null)?.closest?.('[data-no-swipe]')),
      onDrag: (self) => {
        if (!this.coverOpen || this.finishing) return;
        const dx = (self.x ?? 0) - (self.startX ?? 0);
        gsap.set(this.track, { x: dx * 0.3 });
      },
      onRelease: (self) => {
        const dx = (self.x ?? 0) - (self.startX ?? 0);
        const dy = (self.y ?? 0) - (self.startY ?? 0);
        gsap.to(this.track, { x: 0, duration: 0.3, ease: 'power2.out' });
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          suppressClick = true;
          window.setTimeout(() => (suppressClick = false), 400);
          if (dx < 0) this.onNext();
          else this.onPrev();
        }
      },
    });
    const swallow = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    this.viewport.addEventListener('click', swallow, true);
    this.cleanups.push(() => obs.kill(), () => this.viewport.removeEventListener('click', swallow, true));
  }

  // ---------- tests ----------

  private exposeTestHooks(): void {
    if (!this.ctx.flags.test || !window.__nonla) return;
    const ch = this.chapters;
    window.__nonla.p3 = {
      hatCenters: () => (ch.identity as RainMarketChapter).hatCenters(),
      shadowCoversFace: () => (ch.protection as SunShadeChapter).shadowCoversFace(),
      raining: () => (ch.identity as RainMarketChapter).raining,
      count: () => (ch.identity as RainMarketChapter).count,
      sunT: () => (ch.protection as SunShadeChapter).sunT,
      lit: () => (ch.heritage as PoemHatChapter).lit,
      chapter: () => (this.coverOpen ? this.current : 'cover'),
    };
    this.cleanups.push(() => delete window.__nonla?.p3);
  }
}

export default function Phase3Screen(): Screen {
  return new Phase3();
}
