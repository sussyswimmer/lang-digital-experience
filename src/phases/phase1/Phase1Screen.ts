/**
 * Phase 1: A Hat Full of Stories.
 * A floating polaroid collage of the nón lá in everyday life. Tapping a scene expands it to fill
 * the screen (GSAP Flip) with its ambient sound and a narrated caption. "Let's explore" appears
 * after the intro narration (or two scenes), and spirals the collage into the centre, handing
 * the photos to the 3D hat (viewer.convergeFrom) before moving on to Phase 2.
 */
import './phase1.css';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { TopBar } from '../../ui/TopBar';
import { i18n } from '../../i18n/i18n';
import { motion } from '../../a11y/motion';
import { assetUrl, picture } from '../../assets/manifest';
import { seeTile } from '../../app/flow';
import type { AppContext, Screen } from '../../app/context';
import type { ScreenRect } from '../../three/HatViewer';
import { DECOS, TILES, VIDEO_READY, type TileSpec } from './tiles';
import { exploreReady, placeTiles, spiralPath } from './layout';
import { hatArt, P1_ICONS } from './art';
import { speak } from './speak';

gsap.registerPlugin(Flip, MotionPathPlugin);

const INTRO = ['p1.intro.1', 'p1.intro.2', 'p1.intro.3'];
const TILE_SIZES = '(max-width: 700px) 60vw, 32vw';

function prefetch3d(): void {
  void import('../../three/stage').catch(() => {});
  for (const file of ['models/nonla.glb', 'models/nonla.meta.json']) {
    const href = assetUrl(file);
    if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
    document.head.appendChild(el('link', { rel: 'prefetch', href }));
  }
}

/** a picture's sources and img share one `sizes`; full screen needs the bigger files */
function setSizes(media: HTMLElement, sizes: string): void {
  media.querySelectorAll<HTMLImageElement | HTMLSourceElement>('source, img').forEach((n) => (n.sizes = sizes));
}

interface TileView {
  spec: TileSpec;
  slot: HTMLDivElement;
  tile: HTMLElement;
  photo: HTMLElement;
  media: HTMLElement;
}

interface OpenScene {
  view: TileView;
  overlay: HTMLDivElement;
  backdrop: HTMLDivElement;
  frame: HTMLDivElement;
  close: HTMLButtonElement;
  holder: HTMLDivElement;
  drift: gsap.core.Tween | null;
}

class Phase1 implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private collage!: HTMLDivElement;
  private explore!: HTMLButtonElement;
  private views: TileView[] = [];
  private g = gsap.context(() => {});
  private alive = false;
  private busy = false;
  private converging = false;
  private open: OpenScene | null = null;
  private introDone = false;
  private introAt = 0;
  private introRunning = false;
  private exploreShown = false;
  private exploreAnnounced = false;
  private floats: gsap.core.Tween[] = [];
  private cleanups: (() => void)[] = [];

  mount(root: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p1');
    this.collage = el('div.p1-collage');
    this.explore = el(
      'button.btn.btn--cta.p1-explore',
      { type: 'button', 'data-touch': '', 'data-test': 'explore', hidden: true, onclick: () => void this.converge() },
      svg(P1_ICONS.explore),
      i18n.bind(el('span'), 'p1.explore'),
    );
    root.append(TopBar(ctx, { titleId: 'p1.title' }), this.collage, el('div.p1-explore-wrap', {}, this.explore));

    for (const spec of [...DECOS, ...TILES]) this.views.push(this.buildTile(spec));
    this.collage.append(...this.views.map((v) => v.slot));
    this.layout();
    this.enter();

    const ro = new ResizeObserver(() => this.layout());
    ro.observe(this.collage);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.open) void this.closeScene();
    };
    window.addEventListener('keydown', onKey);
    const offLang = i18n.onChange(() => this.relabel());
    this.cleanups.push(() => ro.disconnect(), () => window.removeEventListener('keydown', onKey), offLang);

    if (ctx.flags.test && window.__nonla) {
      window.__nonla.p1 = { tiles: () => TILES.map((t) => t.id) };
      this.cleanups.push(() => delete window.__nonla?.p1);
    }

    // fetch three.js and the hat model while the child looks at the photos (network only: the
    // WebGL viewer itself is created once "Let's explore" shows, when nothing else is animating)
    const prefetch = window.setTimeout(() => this.alive && prefetch3d(), 1500);
    this.cleanups.push(() => window.clearTimeout(prefetch));

    if (exploreReady(false, this.seenCount(), ctx.progress.get().p1.done)) this.showExplore(false);
    this.hint();
    void this.runIntro(0);
  }

  unmount(): void {
    this.alive = false;
    this.g.kill();
    this.floats = [];
    for (const c of this.cleanups.splice(0)) c();
    if (this.open?.view.spec.ambient) this.ctx.audio.stopAmbient(this.open.view.spec.ambient);
    this.open = null;
    this.root.replaceChildren();
  }

  // ---------- building ----------

  private buildTile(spec: TileSpec): TileView {
    const deco = Boolean(spec.deco);
    const media = this.media(spec);
    const photo = el('div.p1-photo', {}, media);
    const strip = el(
      'span.p1-tile__strip',
      {},
      spec.icon ? el('span.p1-tile__icon', {}, svg(spec.icon, 'tile-icon')) : null,
      deco ? null : el('span.p1-tile__seen', {}, svg(P1_ICONS.check, 'seen-icon')),
    );
    const tile: HTMLElement = deco
      ? el('div.p1-tile.p1-tile--deco', { 'aria-hidden': 'true' }, el('span.p1-tile__tape'), photo, strip)
      : el(
          'button.p1-tile',
          { type: 'button', 'data-touch': '', 'data-test': `tile-${spec.id}`, 'aria-label': i18n.t(`p1.tile.${spec.id}`) },
          el('span.p1-tile__tape'),
          photo,
          strip,
        );
    const slot = el('div.p1-slot', { dataset: { tile: spec.id } }, tile);
    const view: TileView = { spec, slot, tile, photo, media };
    if (deco) tile.addEventListener('click', () => this.wiggle(view));
    else tile.addEventListener('click', () => void this.openScene(view));
    if (!deco && this.ctx.progress.get().p1.seenTiles.includes(spec.id)) tile.classList.add('is-seen');
    return view;
  }

  private media(spec: TileSpec): HTMLElement {
    const alt = i18n.t(`p1.alt.${spec.id}`);
    if (!spec.deco && VIDEO_READY[spec.id as keyof typeof VIDEO_READY]) {
      const v = el('video', {
        muted: true,
        loop: true,
        playsInline: true,
        autoplay: !motion.reduced,
        preload: 'metadata',
        poster: assetUrl(`video/p1-${spec.id}-poster.webp`),
        'aria-label': alt,
      });
      v.append(el('source', { src: assetUrl(`video/p1-${spec.id}.webm`), type: 'video/webm' }), el('source', { src: assetUrl(`video/p1-${spec.id}.mp4`), type: 'video/mp4' }));
      v.style.objectPosition = `${spec.focal[0] * 100}% ${spec.focal[1] * 100}%`;
      return v;
    }
    return picture({ stem: spec.stem, alt, focal: spec.focal }, { sizes: TILE_SIZES, eager: !spec.deco });
  }

  private relabel(): void {
    for (const v of this.views) {
      const img = v.media.querySelector('img');
      if (img) img.alt = i18n.t(`p1.alt.${v.spec.id}`);
      if (!v.spec.deco) v.tile.setAttribute('aria-label', i18n.t(`p1.tile.${v.spec.id}`));
    }
    this.open?.close.setAttribute('aria-label', i18n.t('ui.close'));
  }

  private layout(): void {
    if (this.converging) return;
    const box = this.collage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const placed = placeTiles(box, this.views.map((v) => v.spec.id));
    for (const v of this.views) {
      const p = placed[v.spec.id];
      v.slot.hidden = !p;
      if (!p) continue;
      Object.assign(v.slot.style, { left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, zIndex: String(p.z) });
      gsap.set(v.slot, { rotation: p.rot });
    }
  }

  private enter(): void {
    this.g.add(() => {
      const slots = this.views.map((v) => v.slot);
      if (motion.reduced) {
        gsap.from(slots, { opacity: 0, duration: 0.3, stagger: 0.03 });
        return;
      }
      gsap.from(slots, { opacity: 0, scale: 0.82, y: 40, duration: 0.7, ease: 'back.out(1.5)', stagger: 0.08 });
      for (const v of this.views) {
        const t = gsap.to(v.tile, {
          y: gsap.utils.random(-5, 5),
          rotation: gsap.utils.random(-1.2, 1.2),
          duration: gsap.utils.random(2.6, 3.8),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: gsap.utils.random(0, 1.2),
        });
        this.floats.push(t);
      }
    });
  }

  // ---------- narration ----------

  private async runIntro(from: number): Promise<void> {
    if (this.introRunning || this.introDone) return;
    this.introRunning = true;
    const r = await speak(this.ctx.narration, INTRO.slice(from), () => this.alive && !this.converging, (_id, i) => this.cue(from + i));
    this.introRunning = false;
    if (!this.alive) return;
    if (r.result === 'ended') {
      this.introDone = true;
      if (this.exploreShown) this.announceExplore();
      else this.maybeShowExplore();
    } else {
      this.introAt = from + r.index;
    }
  }

  /** visual cue for each intro line: "a busy market, a green rice field, on your way to school" */
  private cue(index: number): void {
    if (index !== 0 || motion.reduced) return;
    const order = ['market', 'farmers', 'aodai'];
    this.g.add(() =>
      order.forEach((id, i) => {
        const v = this.views.find((x) => x.spec.id === id);
        if (v) gsap.to(v.slot, { y: -16, duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1, delay: 2.2 + i * 1.6 });
      }),
    );
  }

  // ---------- scenes ----------

  private async openScene(view: TileView): Promise<void> {
    if (this.busy || this.open || this.converging) return;
    this.busy = true;
    const { spec } = view;
    const ctx = this.ctx;
    ctx.audio.sfx.play('tap');
    const holder = el('div.p1-photo.p1-photo--holder');
    const backdrop = el('div.p1-expand__backdrop');
    const frame = el('div.p1-expand__frame');
    const close = el(
      'button.btn.btn--ghost.p1-expand__close',
      { type: 'button', 'data-touch': '', 'data-test': 'close', 'aria-label': i18n.t('ui.close') },
      svg(ICONS.close),
      i18n.bind(el('span'), 'ui.close'),
    );
    const overlay = el(
      'div.p1-expand',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': i18n.t(`p1.tile.${spec.id}`), dataset: { scene: spec.id } },
      backdrop,
      frame,
      el('div.p1-expand__handle'),
      close,
    );
    this.root.appendChild(overlay);
    const state = Flip.getState(view.photo);
    view.photo.replaceWith(holder);
    frame.appendChild(view.photo);
    view.photo.classList.add('is-expanded');
    setSizes(view.media, '100vw');
    const open: OpenScene = { view, overlay, backdrop, frame, close, holder, drift: null };
    this.open = open;
    this.wireOverlay(open);

    if (spec.ambient) ctx.audio.playAmbient(spec.ambient);
    void ctx.narration.say(`p1.tile.${spec.id}`);
    ctx.progress.set((p) => seeTile(p, spec.id));
    view.tile.classList.add('is-seen');

    await this.g.add(() => {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: motion.dur(0.5) });
      return Flip.from(state, { duration: motion.dur(0.6), ease: 'power3.inOut' });
    });
    if (!this.alive || this.open !== open) return;
    overlay.dataset.ready = '';
    if (!motion.reduced) {
      const target = view.media.querySelector('img, video') ?? view.media;
      open.drift = this.g.add(() =>
        gsap.fromTo(
          target,
          { scale: 1, xPercent: 0, yPercent: 0 },
          { scale: 1.08, xPercent: gsap.utils.random([-2, 2]), yPercent: -1.5, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1 },
        ),
      );
    }
    this.busy = false;
    this.hint();
  }

  /** close by tap anywhere or a swipe down (the X button and Esc too) */
  private wireOverlay(open: OpenScene): void {
    let start: { x: number; y: number } | null = null;
    open.overlay.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY };
    });
    open.overlay.addEventListener('pointermove', (e) => {
      if (!start || this.busy) return;
      const dy = Math.max(0, e.clientY - start.y);
      gsap.set(open.frame, { y: dy * 0.45 });
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      const tap = Math.hypot(dx, dy) < 14;
      const swipeDown = dy > 60 && dy > Math.abs(dx);
      if (tap || swipeDown) void this.closeScene();
      else gsap.to(open.frame, { y: 0, duration: 0.25 });
    };
    open.overlay.addEventListener('pointerup', end);
    open.overlay.addEventListener('pointercancel', () => {
      start = null;
      gsap.to(open.frame, { y: 0, duration: 0.25 });
    });
    open.close.addEventListener('click', () => void this.closeScene());
  }

  private async closeScene(): Promise<void> {
    const open = this.open;
    if (!open || this.busy) return;
    this.busy = true;
    const { view } = open;
    const ctx = this.ctx;
    open.drift?.kill();
    gsap.set(view.media.querySelectorAll('img, video'), { clearProps: 'transform' });
    if (view.spec.ambient) ctx.audio.stopAmbient(view.spec.ambient);
    if (ctx.narration.currentId() === `p1.tile.${view.spec.id}`) ctx.narration.stop();
    ctx.audio.sfx.play('swish');
    const state = Flip.getState(view.photo);
    gsap.set(open.frame, { y: 0 });
    open.holder.replaceWith(view.photo);
    view.photo.classList.remove('is-expanded');
    setSizes(view.media, TILE_SIZES);
    await this.g.add(() => {
      gsap.to(open.backdrop, { opacity: 0, duration: motion.dur(0.45) });
      return Flip.from(state, { duration: motion.dur(0.55), ease: 'power3.inOut' });
    });
    open.overlay.remove();
    this.open = null;
    this.busy = false;
    if (!this.alive) return;
    // resume the intro first, so "Let's explore" isn't spoken only to be cut off by it
    if (!this.introDone && !this.introRunning) void this.runIntro(this.introAt);
    this.maybeShowExplore();
    this.hint();
  }

  private wiggle(view: TileView): void {
    if (this.converging || this.open) return;
    this.ctx.audio.sfx.play('sparkle');
    void this.ctx.narration.say(`p1.deco.${view.spec.id}`);
    if (motion.reduced) return;
    this.g.add(() => gsap.fromTo(view.slot, { y: 0 }, { y: -12, duration: 0.18, yoyo: true, repeat: 3, ease: 'power1.inOut' }));
  }

  // ---------- "Let's explore" ----------

  private seenCount(): number {
    return this.ctx.progress.get().p1.seenTiles.filter((t) => TILES.some((x) => x.id === t)).length;
  }

  private maybeShowExplore(): void {
    if (exploreReady(this.introDone, this.seenCount(), this.ctx.progress.get().p1.done)) this.showExplore(true);
  }

  private showExplore(announce: boolean): void {
    if (this.exploreShown) return;
    this.exploreShown = true;
    const warm = window.setTimeout(() => this.alive && !this.converging && void this.ctx.viewer(), 1200);
    this.cleanups.push(() => window.clearTimeout(warm));
    const b = this.explore;
    b.hidden = false;
    this.g.add(() =>
      gsap.fromTo(
        b,
        { scale: 0.2, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: motion.dur(0.6),
          ease: 'back.out(1.8)',
          onComplete: () => {
            gsap.set(b, { clearProps: 'transform' });
            if (!motion.reduced) b.classList.add('p1-pulse');
          },
        },
      ),
    );
    if (announce) {
      this.ctx.audio.sfx.play('invite');
      this.announceExplore();
    }
    this.hint();
  }

  /** say "Let's explore" once, when nothing else is talking */
  private announceExplore(): void {
    if (this.exploreAnnounced || this.open || this.converging || this.ctx.narration.currentId()) return;
    this.exploreAnnounced = true;
    void this.ctx.narration.say('p1.explore');
  }

  private async converge(): Promise<void> {
    if (this.busy || this.converging || this.open) return;
    this.busy = true;
    this.converging = true;
    const ctx = this.ctx;
    ctx.idle.clear();
    ctx.narration.stop();
    ctx.audio.sfx.play('whoosh');
    this.explore.classList.remove('p1-pulse');
    for (const f of this.floats) f.kill();

    const area = this.collage.getBoundingClientRect();
    const centre = { x: area.width / 2, y: area.height * 0.46 };
    const views = this.views.filter((v) => !v.slot.hidden);
    const slots = views.map((v) => v.slot);
    // a warm glow gathers in the middle as the photos spiral in
    const gather = el('div.p1-gather');
    this.collage.appendChild(gather);
    gsap.set(gather, { left: centre.x, top: centre.y });
    const fly = this.g.add(() => {
      const tl = gsap.timeline();
      tl.fromTo(gather, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: motion.dur(1.3), ease: 'power2.in' }, 0.1);
      tl.to(this.explore, { scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(2)' }, 0);
      views.forEach((v, i) => {
        const b = v.slot.getBoundingClientRect();
        const c = { x: b.left + b.width / 2 - area.left, y: b.top + b.height / 2 - area.top };
        const to = { x: centre.x - c.x, y: centre.y - c.y };
        const at = 0.1 + i * 0.06;
        if (motion.reduced) {
          tl.to(v.slot, { x: to.x, y: to.y, scale: 0.18, duration: 0.3, ease: 'power1.in' }, at * 0.3);
        } else {
          tl.to(v.slot, { motionPath: { path: spiralPath({ x: 0, y: 0 }, to, i % 2 ? 0.75 : -0.75), curviness: 1.3 }, duration: 1.15, ease: 'power2.in' }, at);
          tl.to(v.slot, { scale: 0.16, rotation: `+=${i % 2 ? 160 : -160}`, duration: 1.15, ease: 'power2.in' }, at);
          // explicit start values: tweening from "none" would start at brightness(0), i.e. black
          tl.fromTo(
            v.photo,
            { filter: 'sepia(0) saturate(1) brightness(1)' },
            { filter: 'sepia(0.75) saturate(1.5) brightness(1.18)', duration: 0.9 },
            at + 0.15,
          );
        }
      });
      return tl;
    });
    await fly;
    if (!this.alive) return;

    // hand the photos to the 3D hat
    const rects: ScreenRect[] = slots.map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const images = views.map((v) => assetUrl(`img/photos/${v.spec.stem}-640.jpg`));
    const flash = el('div.p1-flash');
    this.root.appendChild(flash);
    this.root.classList.add('is-converging');
    this.g.add(() => {
      gsap.fromTo(flash, { opacity: 0, scale: 0.5 }, { opacity: 0.95, scale: 1, duration: motion.dur(0.35), ease: 'power2.out', yoyo: true, repeat: 1, repeatDelay: 0.1 });
      gsap.to(slots, { opacity: 0, duration: motion.dur(0.3), delay: 0.15 });
      gsap.to(gather, { opacity: 0, scale: 1.6, duration: motion.dur(0.6), delay: 0.2 });
    });
    const viewer = await ctx.viewer();
    if (!this.alive) return;
    viewer.sound = (id, o) => ctx.audio.sfx.play(id, o);
    const t0 = performance.now();
    await viewer.convergeFrom(rects, images);
    if (!this.alive) return;
    // the WebGL hand-off is still a stub: finish with a DOM hat so the moment still lands
    if (performance.now() - t0 < 120) await this.finale();
    if (this.alive) ctx.completeP1();
  }

  private async finale(): Promise<void> {
    const hat = el('div.p1-finale');
    hat.innerHTML = hatArt('p1');
    this.root.appendChild(hat);
    this.ctx.audio.sfx.play('chime');
    await this.g.add(() => {
      const tl = gsap.timeline();
      tl.fromTo(hat, { scale: 0.15, rotation: -25, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: motion.dur(0.8), ease: 'back.out(1.7)' });
      tl.to(hat, { scale: 1.04, duration: 0.35, yoyo: true, repeat: 1, ease: 'sine.inOut' });
      return tl;
    });
  }

  // ---------- idle hints ----------

  private hint(): void {
    if (!this.alive || this.converging) return;
    const ctx = this.ctx;
    if (this.open) {
      const close = this.open.close;
      ctx.idle.watch({ stepId: 'p1.close', gesture: 'tap', target: () => close.getBoundingClientRect() });
      return;
    }
    if (this.exploreShown) {
      ctx.idle.watch({ stepId: 'p1.explore', gesture: 'tap', target: () => this.explore.getBoundingClientRect() });
      return;
    }
    ctx.idle.watch({
      stepId: 'p1.tiles',
      gesture: 'tap',
      target: () => {
        const seen = ctx.progress.get().p1.seenTiles;
        const v = this.views.find((x) => !x.spec.deco && !seen.includes(x.spec.id)) ?? this.views.find((x) => !x.spec.deco);
        return v ? v.photo.getBoundingClientRect() : null;
      },
    });
  }
}

export default function Phase1Screen(): Screen {
  return new Phase1();
}
