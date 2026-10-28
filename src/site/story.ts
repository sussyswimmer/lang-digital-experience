/**
 * The scroll story: a 400vh section with a sticky full-viewport stage scrubbed by ScrollTrigger
 * (scrub 0.4) along the intro timeline, and four DOM caption beats synced to progress. Where WebGL
 * works the hat is drawn live (StoryHat: the experience's own model and lights); otherwise the
 * Blender/EffectCraft image sequence is scrubbed instead (ScrollFrames). Under reduced motion there
 * is no scroll-scrubbing: four stills crossfade (rendered from the live hat when it can be).
 * GSAP, three.js and the model load lazily (init), after the hero has painted.
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
import type { StoryHat } from './StoryHat';

const BEAT_ICONS: SiteIcon[] = ['leaf', 'rings', 'needle', 'star'];
const STILL_MS = 6000;
/** the model must arrive within this, or the image sequence takes over */
const HAT_TIMEOUT_MS = 45_000;
/** must match INTRO_FRAMES in StoryHat.ts (kept here so the model's chunk isn't needed to know it) */
const HAT_FRAMES = 270;

function webglAvailable(): boolean {
  if (new URLSearchParams(location.search).has('no3d')) return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

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
  /** where the live hat draws (StoryHat's own canvas goes in here) */
  private hatHost: HTMLElement;
  private poster: HTMLImageElement;
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
  private hat: StoryHat | null = null;
  /** frames in the scrubbed range: the live hat's timeline, or the image sequence's length */
  private count = 101;
  private tween: gsap.core.Tween | null = null;
  private gsap: typeof GsapApi | null = null;
  private initPromise: Promise<void> | null = null;
  private paused = false;
  private ready = false;
  /** the story is within reach of the viewport: only then are frames decoded */
  private near = false;
  // stills mode
  private stills: HTMLImageElement[] = [];
  private stillIndex = 0;
  private stillTimer = 0;
  private inView = false;
  private io: IntersectionObserver | null = null;

  constructor(private opts: StoryOptions) {
    this.mode = opts.reduced ? 'stills' : 'scroll';
    this.canvas = el('canvas.story__canvas', { role: 'img' });
    this.hatHost = el('div.story__hat', { hidden: true });
    this.poster = el('img.story__poster', { alt: '', decoding: 'async', hidden: true });
    const setAlt = () => {
      this.canvas.setAttribute('aria-label', i18n.t('site.story.alt'));
      this.hatHost.setAttribute('aria-label', i18n.t('site.story.alt'));
    };
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
      this.poster,
      this.hatHost,
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
      if (webglAvailable()) void this.stillsFromHat();
    } else {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      gsap.registerPlugin(ScrollTrigger);
      this.gsap = gsap;
      if (webglAvailable()) await this.useHat();
      else this.useFrames();
    }
    this.ready = true;
    if (!this.paused) this.bind();
  }

  /** The live hat; if WebGL fails here, or the model doesn't arrive in time, the image sequence takes over. */
  private async useHat(): Promise<void> {
    let hat: StoryHat;
    try {
      const { StoryHat } = await import('./StoryHat');
      hat = new StoryHat(this.hatHost);
    } catch {
      this.useFrames();
      return;
    }
    this.hat = hat;
    this.count = HAT_FRAMES;
    this.el.dataset.render = '3d';
    this.canvas.hidden = true;
    this.canvas.removeAttribute('role');
    this.hatHost.hidden = false;
    this.hatHost.setAttribute('role', 'img');
    // the finished hat as a picture until the model has drawn its first frame
    this.poster.src = assetUrl('img/renders/hat-full.webp');
    this.poster.hidden = false;
    hat.onFirstFrame = () => {
      this.loading.classList.add('is-done');
      this.poster.hidden = true;
    };
    hat.setDecoding(this.near);
    let timer = 0;
    const late = new Promise<never>((_, reject) => (timer = window.setTimeout(() => reject(new Error('model load timed out')), HAT_TIMEOUT_MS)));
    Promise.race([hat.ready, late])
      .catch(() => {
        if (this.hat !== hat) return;
        hat.destroy();
        this.hat = null;
        delete this.el.dataset.render;
        this.hatHost.hidden = true;
        this.hatHost.removeAttribute('role');
        this.poster.hidden = true;
        this.canvas.hidden = false;
        this.canvas.setAttribute('role', 'img');
        // the scrubbed range changes length: rebind so it spans the whole image sequence
        const bound = !!this.tween;
        this.unbind();
        this.useFrames();
        if (bound && !this.paused) this.bind();
      })
      .finally(() => window.clearTimeout(timer));
  }

  private useFrames(): void {
    const m = this.manifest;
    if (!m) {
      this.showFallback();
      return;
    }
    this.count = m.count;
    this.frames = new ScrollFrames(this.canvas, m);
    this.frames.setDecoding(this.near);
    this.frames.onFirstFrame = () => this.loading.classList.add('is-done');
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

  /**
   * Near the viewport (the landing's IntersectionObserver): decode frames around the reader. Far away (still
   * in the hero, or down at the credits): keep only the compressed frames, so 13–19 decoded frames (75–110 MB
   * at 1600w) are held only while they can be seen.
   */
  setNear(on: boolean): void {
    this.near = on;
    this.frames?.setDecoding(on);
    this.hat?.setDecoding(on);
  }

  frameIndex(): number {
    if (this.mode === 'stills') return this.manifest ? stillFrame(this.stillIndex, this.manifest.count) : -1;
    return this.hat?.frameIndex ?? this.frames?.frameIndex ?? -1;
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
    this.hat?.start();
    const count = this.count;
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
    this.hat?.pause();
    this.io?.disconnect();
    this.io = null;
    window.clearTimeout(this.stillTimer);
  }

  private onFrame(f: number, count: number): void {
    this.progress = f / (count - 1);
    this.frames?.seek(f);
    this.hat?.seek(f);
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

  /** Reduced motion: replace the four image-sequence stills with sharp renders of the live hat, then free it. */
  private async stillsFromHat(): Promise<void> {
    if (!this.stills.length) return;
    let hat: StoryHat | null = null;
    try {
      const { StoryHat } = await import('./StoryHat');
      // drawn off to the side, at the size the stills are shown
      this.hatHost.hidden = false;
      this.hatHost.classList.add('is-offstage');
      hat = new StoryHat(this.hatHost);
      let timer = 0;
      const late = new Promise<never>((_, reject) => (timer = window.setTimeout(() => reject(new Error('timeout')), HAT_TIMEOUT_MS)));
      await Promise.race([hat.ready, late]).finally(() => window.clearTimeout(timer));
      BEATS.forEach((b, i) => {
        this.stills[i].src = hat!.snapshot(Math.round(b.still * (HAT_FRAMES - 1)));
      });
      this.el.dataset.render = '3d';
    } catch {
      /* the image-sequence stills stay */
    } finally {
      hat?.destroy();
      this.hatHost.hidden = true;
      this.hatHost.classList.remove('is-offstage');
    }
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
