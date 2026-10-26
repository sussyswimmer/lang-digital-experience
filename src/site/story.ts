/**
 * The scroll story: a 400vh section with a sticky full-viewport canvas scrubbed by ScrollTrigger
 * (scrub 0.4) through the Blender/EffectCraft intro frames, and four DOM caption beats synced to
 * progress. Under reduced motion there is no scroll-scrubbing: four stills crossfade instead.
 * GSAP and the frames load lazily (init), after the hero has painted.
 */
import type { gsap as GsapApi } from 'gsap';
import { el, svg } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { assetUrl } from '../assets/manifest';
import { BEATS, activeBeat, beatTarget, stillFrame } from './storyBeats';
import { ScrollFrames, frameUrl, loadManifest, type FramesManifest } from './ScrollFrames';
import { chooseWidth } from './frameMath';
import { SITE_ICONS, type SiteIcon } from './siteIcons';
import type { ReadAloud } from './readAloud';

const BEAT_ICONS: SiteIcon[] = ['leaf', 'rings', 'needle', 'star'];
const STILL_MS = 6000;

export interface StoryOptions {
  reduced: boolean;
  readAloud: ReadAloud;
  /** the 88 px Start button shown with the last beat */
  startButton: HTMLElement;
}

export class Story {
  readonly el: HTMLElement;
  readonly mode: 'scroll' | 'stills';
  private sticky: HTMLElement;
  private canvas: HTMLCanvasElement;
  private stillsBox: HTMLElement;
  private loading: HTMLElement;
  private rail: HTMLElement;
  private dots: HTMLButtonElement[] = [];
  private beats: HTMLElement[] = [];
  private current = -2;
  private past = -1;
  private progress = 0;
  private manifest: FramesManifest | null = null;
  private frames: ScrollFrames | null = null;
  private tween: gsap.core.Tween | null = null;
  private gsap: typeof GsapApi | null = null;
  private initPromise: Promise<void> | null = null;
  private paused = false;
  private ready = false;
  // stills mode
  private stills: HTMLImageElement[] = [];
  private stillIndex = 0;
  private stillTimer = 0;
  private inView = false;
  private io: IntersectionObserver | null = null;

  constructor(private opts: StoryOptions) {
    this.mode = opts.reduced ? 'stills' : 'scroll';
    this.canvas = el('canvas.story__canvas', { role: 'img' });
    const setAlt = () => this.canvas.setAttribute('aria-label', i18n.t('site.story.alt'));
    setAlt();
    i18n.onChange(setAlt);
    this.stillsBox = el('div.story__stills');
    this.loading = el('div.story__loading', { role: 'status' }, el('span.story__spinner', { 'aria-hidden': 'true' }), i18n.bind(el('span'), 'site.loading'));
    this.rail = el('nav.story__rail', {});
    const railLabel = () => this.rail.setAttribute('aria-label', i18n.t('site.story.label'));
    railLabel();
    i18n.onChange(railLabel);

    BEATS.forEach((b, i) => {
      const dot = el(
        'button.story__dot',
        { type: 'button', 'data-touch': '', 'data-beat': String(i), onclick: () => this.goToBeat(i) },
        el('span.story__dot-face', {}, svg(SITE_ICONS[BEAT_ICONS[i]])),
        i18n.bind(el('span.visually-hidden'), b.id),
      ) as HTMLButtonElement;
      this.dots.push(dot);
      this.rail.append(dot);

      const card = el(
        'div.story-beat__card',
        {},
        el('span.story-beat__icon', { 'aria-hidden': 'true' }, svg(SITE_ICONS[BEAT_ICONS[i]])),
        i18n.bind(el('p.story-beat__text'), b.id),
        opts.readAloud.button(b.id),
      );
      const beat = el('div.story-beat', { 'data-beat': String(i), 'aria-hidden': 'true' }, card);
      if (i === BEATS.length - 1) beat.append(el('div.story-beat__cta', {}, opts.startButton));
      this.beats.push(beat);
    });

    this.sticky = el(
      'div.story__sticky',
      {},
      this.canvas,
      this.stillsBox,
      el('div.story__grain', { 'aria-hidden': 'true' }),
      el('div.story__beats', { 'aria-live': 'polite' }, ...this.beats),
      this.rail,
      this.loading,
    );
    this.el = el(
      'section#story.story',
      { 'aria-labelledby': 'story-title', dataset: { mode: this.mode } },
      i18n.bind(el('h2#story-title.visually-hidden'), 'site.story.label'),
      this.sticky,
    );
    this.setBeat(0);
    this.markPast();
  }

  /** Load the frames manifest and GSAP, then bind to scrolling. Safe to call more than once. */
  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.manifest = await loadManifest();
    const m = this.manifest;
    if (m?.bg) {
      this.el.style.setProperty('--story-top', m.bg.top);
      this.el.style.setProperty('--story-bottom', m.bg.bottom);
    }
    if (this.mode === 'stills') {
      this.buildStills();
    } else {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      gsap.registerPlugin(ScrollTrigger);
      this.gsap = gsap;
      if (m) {
        this.frames = new ScrollFrames(this.canvas, m);
        this.frames.onFirstFrame = () => this.loading.classList.add('is-done');
      } else {
        this.showFallback();
      }
    }
    this.ready = true;
    if (!this.paused) this.bind();
  }

  pause(): void {
    this.paused = true;
    this.opts.readAloud.stop();
    this.unbind();
  }

  resume(): void {
    this.paused = false;
    if (this.ready) this.bind();
  }

  frameIndex(): number {
    if (this.mode === 'stills') return this.manifest ? stillFrame(this.stillIndex, this.manifest.count) : -1;
    return this.frames?.frameIndex ?? -1;
  }

  beat(): number {
    return this.current;
  }

  progressValue(): number {
    return this.progress;
  }

  // ---------------------------------------------------------------- scroll mode

  private bind(): void {
    if (this.mode === 'stills') {
      this.observeStills();
      return;
    }
    if (this.tween || !this.gsap) return;
    this.frames?.start();
    const count = this.manifest?.count ?? 101;
    const state = { f: 0 };
    // fromTo: the scrubbed range must always be the whole sequence, whatever frame we resume on
    const tween = this.gsap.fromTo(
      state,
      { f: 0 },
      {
        f: count - 1,
        ease: 'none',
        scrollTrigger: { trigger: this.el, start: 'top top', end: 'bottom bottom', scrub: 0.4, invalidateOnRefresh: true },
        onUpdate: () => this.onFrame(state.f, count),
      },
    );
    // start where the page already is (e.g. after a reload mid-story), not with a sweep from frame 0
    if (tween.scrollTrigger) tween.progress(tween.scrollTrigger.progress);
    this.tween = tween;
    this.onFrame(state.f, count);
  }

  private unbind(): void {
    this.tween?.scrollTrigger?.kill();
    this.tween?.kill();
    this.tween = null;
    this.frames?.pause();
    this.io?.disconnect();
    this.io = null;
    window.clearTimeout(this.stillTimer);
  }

  private onFrame(f: number, count: number): void {
    this.progress = f / (count - 1);
    this.frames?.seek(f);
    this.rail.style.setProperty('--p', this.progress.toFixed(3));
    this.setBeat(activeBeat(this.progress));
    this.markPast();
  }

  private markPast(): void {
    const past = BEATS.filter((b) => this.progress >= b.from).length;
    if (past === this.past) return;
    this.past = past;
    this.dots.forEach((d, k) => d.classList.toggle('is-past', k < past));
  }

  private goToBeat(i: number): void {
    if (this.mode === 'stills') {
      this.showStill(i);
      this.armStillTimer();
      return;
    }
    const top = this.el.getBoundingClientRect().top + window.scrollY;
    const span = this.el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * beatTarget(i), behavior: 'smooth' });
  }

  private showFallback(): void {
    const img = el('img.story__fallback', { src: assetUrl('img/renders/hat-full.webp'), alt: '', decoding: 'async' });
    this.stillsBox.append(img);
    this.loading.classList.add('is-done');
  }

  // ---------------------------------------------------------------- reduced motion: crossfading stills

  private buildStills(): void {
    const m = this.manifest;
    if (!m) {
      this.showFallback();
      return;
    }
    const width = chooseWidth(this.sticky.getBoundingClientRect().width || window.innerWidth, window.devicePixelRatio || 1, m.widths);
    this.stills = BEATS.map((_, i) =>
      el('img.story__still', { src: frameUrl(width, stillFrame(i, m.count)), alt: '', decoding: 'async', loading: i ? 'lazy' : 'eager' }),
    );
    this.stillsBox.append(...this.stills);
    this.stills[0].addEventListener('load', () => this.loading.classList.add('is-done'), { once: true });
    this.stills[0].addEventListener('error', () => this.loading.classList.add('is-done'), { once: true });
    this.showStill(0, true);
  }

  private observeStills(): void {
    if (this.io || !this.stills.length) return;
    this.io = new IntersectionObserver(
      ([e]) => {
        this.inView = e.isIntersecting;
        this.armStillTimer();
      },
      { threshold: 0.5 },
    );
    this.io.observe(this.sticky);
  }

  private armStillTimer(): void {
    window.clearTimeout(this.stillTimer);
    if (!this.inView || this.paused) return;
    this.stillTimer = window.setTimeout(() => {
      this.showStill((this.stillIndex + 1) % BEATS.length);
      this.armStillTimer();
    }, STILL_MS);
  }

  private showStill(i: number, instant = false): void {
    const prev = this.stills[this.stillIndex];
    const next = this.stills[i];
    if (!next) return;
    this.stillIndex = i;
    for (const s of this.stills) s.classList.toggle('is-on', s === next);
    // an opacity-only crossfade (WAAPI, so it runs even where the CSS disables transitions)
    if (!instant && prev !== next) {
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-in-out' });
      prev?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-in-out' });
    }
    this.progress = BEATS[i].still;
    this.rail.style.setProperty('--p', this.progress.toFixed(3));
    this.setBeat(i);
    this.markPast();
  }

  // ---------------------------------------------------------------- beats

  private setBeat(i: number): void {
    if (i === this.current) return;
    this.current = i;
    this.beats.forEach((b, k) => {
      const on = k === i;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-hidden', String(!on));
      b.inert = !on;
    });
    this.dots.forEach((d, k) => {
      d.classList.toggle('is-on', k === i);
      d.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
  }
}
