/**
 * Phase 4a: "Build Your Nón Lá". Drag the pieces from the tray onto the workbench hat, inside → out
 * (or tap a piece, then tap the hat). A correct piece snaps on and stacks; a wrong one floats back
 * with a friendly hint; after two misses the right piece glows. The finished hat spins, confetti
 * flies and the child earns the "Little Hat Maker" badge.
 */
import '../hub/p4.css';
import './build.css';
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { burst, preload } from '../../../ui/lottie';
import { TopBar } from '../../../ui/TopBar';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { assetUrl } from '../../../assets/manifest';
import type { AppContext, Screen } from '../../../app/context';
import content from '../../../../content/build.json';
import { speak } from '../../phase1/speak';
import { BENCH, seams, STRAP_COLOURS, type StrapColour } from '../hub/hat';
import { MAKER_BADGE, badgeSvg } from '../hub/badges';
import { P4_ICONS, P4_PICTURES } from '../hub/icons';
import { confettiBurst, type Burst } from '../hub/confetti';
import { centreOf, enter, labelButton, quietViewer, rectOf, testHook } from '../hub/kit';
import { ORDER, evaluateDrop, isComplete, nextPiece, shuffledTray, type PieceId } from './order';
import { RENDER_BENCH, ghostSvg, layerSvg, trayArt } from './art';

const PIECES = content.pieces as Record<PieceId, { labelId: string; placedId: string; layer: string }>;
const DRAG_START_PX = 10;
/** the drop zone is the hat box plus this much on every side */
const ZONE_PAD = 0.15;
/** the workbench's width (585 px at 1180, 656 at 1440); the renders' 1.4× zoom only crops their empty margins */
const LAYER_SIZES = '(max-width: 760px) calc(100vw - 44px), min(50vw, 660px)';

/** a layer render at 800 or 1600 px wide (build-0N-x.webp + build-0N-x-800.webp) */
function layerImg(file: string): string {
  return `<img alt="" draggable="false" sizes="${LAYER_SIZES}" srcset="${assetUrl(file.replace(/\.webp$/, '-800.webp'))} 800w, ${assetUrl(file)} 1600w" src="${assetUrl(file)}">`;
}

interface Card {
  piece: PieceId;
  el: HTMLButtonElement;
  art: HTMLElement;
}

class Build implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private g = gsap.context(() => {});
  private cleanups: (() => void)[] = [];

  private placed: PieceId[] = [];
  private misses = 0;
  private selected: PieceId | null = null;
  private finished = false;
  private toldTapHat = false;
  private uid = Math.random().toString(36).slice(2, 7);
  private strap: StrapColour = 'purple';
  private strapColour: string = STRAP_COLOURS.purple;

  private layout!: HTMLDivElement;
  private bench!: HTMLDivElement;
  private hat!: HTMLButtonElement;
  private stack!: HTMLDivElement;
  private dropLabel!: HTMLSpanElement;
  private bubble!: HTMLDivElement;
  private bubbleText!: HTMLSpanElement;
  private steps: HTMLSpanElement[] = [];
  private tray!: HTMLDivElement;
  private cards = new Map<PieceId, Card>();
  private done!: HTMLDivElement;
  private ghost: HTMLDivElement | null = null;
  private spinRaf = 0;
  private bursts: Burst[] = [];

  mount(root: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p4', 'p4-build');
    quietViewer(ctx);
    void preload('badge-pop');
    // the strap colour the child picked in Phase 2
    const strap = ctx.settings.get().strapColour;
    this.strap = strap in STRAP_COLOURS ? strap : 'purple';
    this.strapColour = STRAP_COLOURS[this.strap];

    this.buildBench();
    this.tray = el('div.p4b-tray', { role: 'group', 'aria-label': i18n.t('build.tray') });
    this.done = el('div.p4b-done', { hidden: true });
    this.layout = el('div.p4b-layout', {}, this.bench, el('div.p4b-side', {}, this.tray, this.done));
    root.append(TopBar(ctx, { titleId: 'build.title' }), this.layout);
    this.fillTray();

    this.cleanups.push(
      testHook(ctx, 'build', {
        order: () => [...ORDER],
        placed: () => [...this.placed],
        tray: () => [...this.cards.keys()],
        selected: () => this.selected,
        finished: () => this.finished,
        glowing: () => [...this.cards.values()].filter((c) => c.el.classList.contains('is-glow')).map((c) => c.piece),
      }),
    );
    const onResize = () => {
      const dragging = !!this.drag?.dragging;
      this.cancelDrag();
      if (dragging && this.alive) this.watchIdle();
    };
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    if (!motion.reduced) {
      this.g.add(() => {
        enter(this.bench, { y: 30, opacity: 0 }, { duration: 0.5, ease: 'power2.out' });
        enter(this.tray.children, { y: 26, opacity: 0, scale: 0.9 }, { duration: 0.45, stagger: 0.06, delay: 0.15, ease: 'back.out(1.8)' });
      });
    }
    this.watchIdle();
    void speak(ctx.narration, ['build.intro', 'build.how'], () => this.alive && this.placed.length === 0 && !this.selected);
  }

  unmount(): void {
    this.alive = false;
    this.cancelDrag();
    cancelAnimationFrame(this.spinRaf);
    for (const b of this.bursts.splice(0)) b.stop();
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    this.ctx.idle.clear();
    this.root.replaceChildren();
  }

  // ---------- building the DOM ----------

  private buildBench(): void {
    this.stack = el('div.p4b-stack');
    if (content.layerImagesReady) {
      // the Blender renders: their own floor shadow under a ghost outline drawn to match them
      this.stack.classList.add('is-renders');
      this.stack.innerHTML = `<div class="p4b-ghost">${layerImg(content.shadowImage)}${ghostSvg(RENDER_BENCH, false)}</div>`;
    } else {
      this.stack.innerHTML = `<div class="p4b-ghost">${ghostSvg()}</div>`;
    }
    this.dropLabel = i18n.bind(el('span.p4b-drop'), 'build.drop');
    this.hat = el(
      'button.p4b-hat',
      { type: 'button', 'data-test': 'workbench', 'aria-label': i18n.t('build.workbench'), onclick: () => this.onHatTap() },
      this.stack,
      this.dropLabel,
    );
    this.bubbleText = el('span.p4b-bubble__text', { 'aria-live': 'polite' });
    const face = el('span.p4b-bubble__face', { 'aria-hidden': 'true' });
    face.innerHTML = P4_PICTURES.maker;
    this.bubble = el('div.p4b-bubble', { hidden: true, 'data-test': 'hint' }, face, this.bubbleText);
    const steps = el('div.p4b-steps', { role: 'list', 'aria-label': i18n.t('build.steps') });
    this.steps = ORDER.map((_, i) => {
      const s = el('span.p4b-step', { role: 'listitem' }, el('span.p4b-step__n', {}, String(i + 1)));
      steps.appendChild(s);
      return s;
    });
    this.bench = el('div.p4b-bench', {}, this.bubble, el('div.p4b-hatbox', {}, this.hat), steps);
  }

  private fillTray(): void {
    this.tray.replaceChildren();
    this.cards.clear();
    for (const piece of shuffledTray()) {
      const art = el('span.p4b-piece__art');
      art.innerHTML = trayArt(piece, this.strapColour);
      art.firstElementChild?.setAttribute('aria-hidden', 'true');
      const card = el(
        'button.p4b-piece',
        { type: 'button', 'data-touch': '', 'data-piece': piece, 'data-test': `piece-${piece}` },
        art,
        i18n.bind(el('span.p4b-piece__label'), PIECES[piece].labelId),
        el('span.p4b-piece__check', { 'aria-hidden': 'true' }, svg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2F5D46"/><path d="m6.5 12.5 3.6 3.6 7.4-8" fill="none" stroke="#FFF9EC" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')),
      );
      card.addEventListener('pointerdown', (e) => this.onPointerDown(e, piece));
      // keyboard (Enter/Space) arrives as a click with detail 0; pointer taps are handled on pointerup
      card.addEventListener('click', (e) => {
        if (e.detail === 0) this.onPieceTap(piece);
      });
      this.cards.set(piece, { piece, el: card, art });
      this.tray.appendChild(card);
    }
  }

  // ---------- pointer: drag or tap ----------

  private drag: {
    piece: PieceId;
    id: number;
    x0: number;
    y0: number;
    dragging: boolean;
    moveX?: (v: number) => void;
    moveY?: (v: number) => void;
    off: () => void;
  } | null = null;

  private onPointerDown(e: PointerEvent, piece: PieceId): void {
    if (e.button !== 0 || this.finished || this.drag || this.placed.includes(piece)) return;
    const card = this.cards.get(piece)!.el;
    e.preventDefault();
    try {
      card.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events can't be captured */
    }
    const move = (ev: PointerEvent) => this.onPointerMove(ev);
    const up = (ev: PointerEvent) => this.onPointerUp(ev, false);
    const cancel = (ev: PointerEvent) => this.onPointerUp(ev, true);
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
    card.addEventListener('pointercancel', cancel);
    this.drag = {
      piece,
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dragging: false,
      off: () => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerup', up);
        card.removeEventListener('pointercancel', cancel);
      },
    };
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START_PX) return;
      this.startDrag(d.piece, e);
    }
    d.moveX?.(e.clientX);
    d.moveY?.(e.clientY);
    this.hat.classList.toggle('is-over', this.inZone(e.clientX, e.clientY));
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.off();
    this.drag = null;
    this.hat.classList.remove('is-over', 'is-ready');
    if (!d.dragging) {
      if (!cancelled) this.onPieceTap(d.piece);
      return;
    }
    this.cards.get(d.piece)!.el.classList.remove('is-lifted');
    if (!cancelled && this.inZone(e.clientX, e.clientY)) this.attempt(d.piece);
    else {
      this.floatBack(d.piece, false);
      this.watchIdle();
    }
  }

  private startDrag(piece: PieceId, e: PointerEvent): void {
    const d = this.drag!;
    d.dragging = true;
    this.deselect();
    const card = this.cards.get(piece)!;
    const r = card.art.getBoundingClientRect();
    const ghost = el('div.p4b-ghostpiece', { 'aria-hidden': 'true' });
    ghost.innerHTML = card.art.innerHTML;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    this.root.appendChild(ghost);
    this.ghost = ghost;
    // the ghost keeps the grab offset so it doesn't jump under the finger
    const ox = e.clientX - (r.left + r.width / 2);
    const oy = e.clientY - (r.top + r.height / 2);
    this.g.add(() => {
      gsap.set(ghost, { x: r.left + r.width / 2, y: r.top + r.height / 2, xPercent: -50, yPercent: -50 });
      gsap.to(ghost, { scale: 1.12, rotate: -4, duration: motion.dur(0.2) });
      const quickX = gsap.quickTo(ghost, 'x', { duration: motion.reduced ? 0.01 : 0.12, ease: 'power3.out' });
      const quickY = gsap.quickTo(ghost, 'y', { duration: motion.reduced ? 0.01 : 0.12, ease: 'power3.out' });
      d.moveX = (v) => quickX(v - ox);
      d.moveY = (v) => quickY(v - oy);
    });
    card.el.classList.add('is-lifted');
    this.hat.classList.add('is-ready');
    this.ctx.audio.sfx.play('tap');
    void this.ctx.narration.say(PIECES[piece].labelId);
    this.ctx.idle.clear();
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.off();
    this.drag = null;
    this.hat.classList.remove('is-over', 'is-ready');
    if (d.dragging) {
      this.cards.get(d.piece)?.el.classList.remove('is-lifted');
      this.removeGhost();
    }
  }

  private inZone(x: number, y: number): boolean {
    const r = this.stack.getBoundingClientRect();
    const px = r.width * ZONE_PAD;
    const py = r.height * ZONE_PAD;
    return x >= r.left - px && x <= r.right + px && y >= r.top - py && y <= r.bottom + py;
  }

  // ---------- tap to select, tap to place ----------

  private onPieceTap(piece: PieceId): void {
    if (this.finished || this.placed.includes(piece)) return;
    this.ctx.audio.sfx.play('tap');
    if (this.selected === piece) {
      this.deselect();
      this.watchIdle();
      return;
    }
    this.deselect();
    this.selected = piece;
    this.cards.get(piece)!.el.classList.add('is-selected');
    this.cards.get(piece)!.el.setAttribute('aria-pressed', 'true');
    this.hat.classList.add('is-ready');
    const lines = [PIECES[piece].labelId];
    if (!this.toldTapHat) lines.push('build.tap-hat');
    this.toldTapHat = true;
    void speak(this.ctx.narration, lines, () => this.alive && this.selected === piece);
    this.watchIdle();
  }

  private deselect(): void {
    if (!this.selected) return;
    const c = this.cards.get(this.selected)!.el;
    c.classList.remove('is-selected');
    c.removeAttribute('aria-pressed');
    this.selected = null;
    this.hat.classList.remove('is-ready');
  }

  private onHatTap(): void {
    if (this.finished) return;
    const piece = this.selected;
    if (!piece) {
      this.ctx.audio.sfx.play('tap');
      void this.ctx.narration.say('build.how');
      return;
    }
    this.deselect();
    this.attempt(piece);
  }

  // ---------- the rules in action ----------

  private attempt(piece: PieceId): void {
    const result = evaluateDrop(this.placed, piece);
    if (result.ok) this.snap(piece);
    else {
      this.misses++;
      this.floatBack(piece, true);
      this.showHint(result.hintId);
      if (this.misses >= content.missesBeforeGlow) this.glow(nextPiece(this.placed));
    }
    this.watchIdle();
  }

  private snap(piece: PieceId): void {
    const ctx = this.ctx;
    this.placed.push(piece);
    this.misses = 0;
    this.glow(null);
    this.hideHint();
    const card = this.cards.get(piece)!;
    card.el.classList.add('is-used');
    card.el.disabled = true;
    const layer = this.makeLayer(piece);
    this.stack.appendChild(layer);
    const step = this.steps[this.placed.length - 1];
    step.classList.add('is-done');
    const mini = el('span.p4b-step__art');
    mini.innerHTML = trayArt(piece, this.strapColour);
    step.appendChild(mini);

    const ghost = this.takeGhost() ?? this.flyingCopy(card);
    const land = () => {
      ctx.audio.sfx.play('snap');
      ghost.remove();
      // a piece can land while the next one is already on its way: only the last one finishes
      if (isComplete(this.placed)) {
        if (piece === ORDER[ORDER.length - 1]) void this.finish();
      } else if (this.placed[this.placed.length - 1] === piece) void ctx.narration.say(PIECES[piece].placedId);
    };
    this.g.add(() => {
      const hat = centreOf(this.stack);
      const tl = gsap.timeline({ onComplete: land });
      tl.to(ghost, { x: hat.x, y: hat.y, scale: 0.6, rotate: 0, opacity: 0, duration: motion.dur(0.32), ease: 'power2.in' });
      tl.fromTo(
        layer,
        { opacity: 0, y: motion.reduced ? 0 : -26, scale: motion.reduced ? 1 : 1.06 },
        { opacity: 1, y: 0, scale: 1, duration: motion.dur(0.45), ease: 'back.out(2)' },
        '-=0.12',
      );
      if (!motion.reduced) {
        tl.fromTo(this.stack, { scaleY: 0.97, scaleX: 1.02 }, { scaleY: 1, scaleX: 1, duration: 0.35, ease: 'elastic.out(1, 0.45)' }, '-=0.15');
        tl.fromTo(mini, { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(2.4)' }, '<');
      }
    });
  }

  private makeLayer(piece: PieceId): HTMLDivElement {
    const layer = el('div.p4b-layer', { dataset: { piece } });
    if (content.layerImagesReady) {
      // the strap in the child's colour (build-06-strap-green.webp…), else the default render, else the drawing
      const file = PIECES[piece].layer;
      const files = piece === 'strap' ? [file.replace(/\.webp$/, `-${this.strap}.webp`), file] : [file];
      const next = () => {
        const f = files.shift();
        if (!f) {
          layer.innerHTML = layerSvg(piece, `${this.uid}${piece}`, this.strapColour);
          return;
        }
        layer.innerHTML = layerImg(f);
        layer.firstElementChild!.addEventListener('error', next, { once: true });
      };
      next();
    } else {
      layer.innerHTML = layerSvg(piece, `${this.uid}${piece}`, this.strapColour);
    }
    return layer;
  }

  /** a copy of the card's picture to fly with (tap mode has no dragged ghost) */
  private flyingCopy(card: Card): HTMLDivElement {
    const r = card.art.getBoundingClientRect();
    const ghost = el('div.p4b-ghostpiece', { 'aria-hidden': 'true' });
    ghost.innerHTML = card.art.innerHTML;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    this.root.appendChild(ghost);
    gsap.set(ghost, { x: r.left + r.width / 2, y: r.top + r.height / 2, xPercent: -50, yPercent: -50 });
    return ghost;
  }

  /** the piece drifts back to its place in the tray (wrong piece, or dropped off the hat) */
  private floatBack(piece: PieceId, wrong: boolean): void {
    const card = this.cards.get(piece)!;
    if (wrong) this.ctx.audio.sfx.play('floatBack');
    const ghost = this.takeGhost();
    this.g.add(() => {
      if (ghost) {
        const home = centreOf(card.art);
        gsap.to(ghost, {
          x: home.x,
          y: home.y,
          scale: 1,
          rotate: 0,
          duration: motion.reduced ? 0.2 : 0.9,
          ease: motion.reduced ? 'power1.out' : 'elastic.out(1, 0.55)',
          onComplete: () => ghost.remove(),
        });
      }
      if (wrong && !motion.reduced) {
        gsap.fromTo(card.el, { rotate: 0 }, { keyframes: { rotate: [-5, 5, -3, 3, 0] }, duration: 0.6, delay: ghost ? 0.35 : 0, ease: 'none' });
      }
    });
  }

  /** hand over the dragged ghost to a finishing animation (so a new drag can start meanwhile) */
  private takeGhost(): HTMLDivElement | null {
    const g = this.ghost;
    this.ghost = null;
    return g;
  }

  private removeGhost(): void {
    if (!this.ghost) return;
    gsap.killTweensOf(this.ghost);
    this.ghost.remove();
    this.ghost = null;
  }

  private glow(piece: PieceId | null): void {
    for (const c of this.cards.values()) c.el.classList.toggle('is-glow', c.piece === piece);
  }

  private showHint(hintId: string): void {
    i18n.bind(this.bubbleText, hintId);
    this.bubble.hidden = false;
    this.bubble.dataset.hint = hintId;
    if (!motion.reduced) this.g.add(() => gsap.fromTo(this.bubble, { y: 10, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }));
    void this.ctx.narration.say(hintId);
  }

  private hideHint(): void {
    this.bubble.hidden = true;
    delete this.bubble.dataset.hint;
  }

  // ---------- idle hints ----------

  private watchIdle(): void {
    const idle = this.ctx.idle;
    if (this.finished) {
      const btn = this.done.querySelector<HTMLElement>('[data-test=again]');
      if (btn) idle.watch({ stepId: 'build.done', gesture: 'tap', target: () => rectOf(btn) });
      return;
    }
    if (this.selected) {
      idle.watch({ stepId: 'build.place', gesture: 'tap', target: () => rectOf(this.stack) });
      return;
    }
    idle.watch({
      stepId: 'build.drag',
      gesture: 'drag',
      target: () => this.hintCard()?.art.getBoundingClientRect() ?? null,
      path: () => [centreOf(this.stack)],
    });
  }

  /** the glowing card if there is one, else the first piece still in the tray */
  private hintCard(): Card | undefined {
    const cards = [...this.cards.values()].filter((c) => !this.placed.includes(c.piece));
    return cards.find((c) => c.el.classList.contains('is-glow')) ?? cards[0];
  }

  // ---------- the finished hat ----------

  private async finish(): Promise<void> {
    const ctx = this.ctx;
    if (this.finished) return;
    this.finished = true;
    const first = ctx.progress.get().games.build.completed === 0;
    ctx.progress.set((p) => ({ ...p, games: { ...p.games, build: { completed: p.games.build.completed + 1 } } }));
    this.hat.disabled = true;
    this.hat.classList.add('is-finished');
    ctx.audio.sfx.play('fanfare');
    this.spin();
    this.bursts.push(confettiBurst(this.root, { from: centreOf(this.stack) }));
    this.showDone(first);
    this.watchIdle();
    await speak(ctx.narration, [PIECES.strap.placedId, 'build.done', 'build.badge.earned'], () => this.alive && this.finished);
  }

  /** the hat hops and turns once: the leaf seams sweep round (SVG) or the picture turns (renders) */
  private spin(): void {
    if (motion.reduced) return;
    this.g.add(() => {
      gsap.timeline()
        .to(this.stack, { y: -28, duration: 0.35, ease: 'power2.out' })
        .to(this.stack, { y: 0, duration: 0.6, ease: 'bounce.out' }, '+=0.9');
      if (content.layerImagesReady) gsap.fromTo(this.stack, { rotationY: 0 }, { rotationY: 360, transformPerspective: 900, duration: 1.4, ease: 'power2.inOut' });
    });
    const seamGroup = this.stack.querySelector<SVGGElement>('[data-piece="leaf-outer"] [data-seams]');
    const stitchRows = [...this.stack.querySelectorAll<SVGPathElement>('[data-piece="stitches"] path[stroke-dasharray]')];
    if (!seamGroup) return;
    const start = performance.now();
    const ms = 1600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      seamGroup.innerHTML = seams(BENCH, e * Math.PI * 2);
      for (const r of stitchRows) r.setAttribute('stroke-dashoffset', String(-e * 60));
      if (t < 1) this.spinRaf = requestAnimationFrame(tick);
    };
    this.spinRaf = requestAnimationFrame(tick);
  }

  private showDone(first: boolean): void {
    const ctx = this.ctx;
    const medal = el('div.p4b-done__medal', { 'aria-hidden': 'true' });
    medal.innerHTML = badgeSvg(MAKER_BADGE);
    const again = labelButton('button.p4-action.p4-action--straw', P4_ICONS.again, 'build.again', () => this.restart(), { 'data-test': 'again' });
    const hub = labelButton('button.p4-action', P4_ICONS.grid, 'hub.back', () => {
      ctx.audio.sfx.play('tap');
      ctx.go({ state: 'hub', params: {} });
    }, { 'data-test': 'to-hub' });
    this.done.replaceChildren(
      medal,
      i18n.bind(el('h2.p4b-done__name', { 'data-test': 'badge-name' }), 'build.badge.name'),
      el('div.p4b-done__actions', {}, again, hub),
    );
    this.done.dataset.first = String(first);
    this.tray.hidden = true;
    this.done.hidden = false;
    this.g.add(() => {
      if (motion.reduced) enter(this.done, { opacity: 0 }, { duration: 0.25 });
      else {
        enter(medal, { scale: 0, rotate: -40 }, {
          duration: 0.8,
          delay: 0.5,
          ease: 'back.out(2.2)',
          onStart: () => {
            ctx.audio.sfx.play('badge');
            burst(this.root, 'badge-pop', centreOf(medal), { size: 420 });
          },
        });
        enter(this.done.querySelectorAll('h2, .p4-action'), { y: 20, opacity: 0 }, { duration: 0.4, stagger: 0.08, delay: 0.9 });
      }
    });
  }

  private restart(): void {
    const ctx = this.ctx;
    ctx.audio.sfx.play('tap');
    ctx.narration.stop();
    cancelAnimationFrame(this.spinRaf);
    for (const b of this.bursts.splice(0)) b.stop();
    this.placed = [];
    this.misses = 0;
    this.selected = null;
    this.finished = false;
    this.hat.disabled = false;
    this.hat.classList.remove('is-finished');
    gsap.set(this.stack, { clearProps: 'transform' });
    this.stack.querySelectorAll('.p4b-layer').forEach((n) => n.remove());
    for (const s of this.steps) {
      s.classList.remove('is-done');
      s.querySelector('.p4b-step__art')?.remove();
    }
    this.hideHint();
    this.done.hidden = true;
    this.tray.hidden = false;
    this.fillTray();
    if (!motion.reduced) this.g.add(() => enter(this.tray.children, { y: 20, opacity: 0 }, { duration: 0.35, stagger: 0.05, ease: 'back.out(1.8)' }));
    this.watchIdle();
    void ctx.narration.say('build.how');
  }
}

export default function BuildScreen(): Screen {
  return new Build();
}
