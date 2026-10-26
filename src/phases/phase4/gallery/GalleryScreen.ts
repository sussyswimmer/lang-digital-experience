/**
 * "Tranh của con" (the child's pictures): every saved colouring page pegged on a wall. Tap one
 * to see it big, download it as a PNG, or delete it with a press-and-hold (so a stray tap can't).
 * When IndexedDB isn't available the pictures live for this visit only, and the screen says so.
 */
import './gallery.css';
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { ICONS } from '../../../ui/icons';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { TopBar } from '../../../ui/TopBar';
import type { AppContext, Screen } from '../../../app/context';
import { getGallery, type Artwork, type GalleryStore } from './galleryDb';
import { pageById } from '../colour/pages';
import { COLOUR_ICONS } from '../colour/icons';
import { downloadBlob, pictureFilename } from '../colour/compose';

const HOLD_MS = 1400;

interface Tile {
  art: Artwork;
  btn: HTMLButtonElement;
  thumbUrl: string;
}

class GalleryScreen implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private store: GalleryStore | null = null;
  private tiles: Tile[] = [];
  private g = gsap.context(() => {});
  private cleanups: (() => void)[] = [];
  private wall!: HTMLDivElement;
  private empty!: HTMLDivElement;
  private banner!: HTMLDivElement;
  private countText!: HTMLSpanElement;
  private colourBtn!: HTMLButtonElement;
  private emptyBtn!: HTMLButtonElement;
  // the large view
  private view!: HTMLDivElement;
  private viewImg!: HTMLImageElement;
  private viewName!: HTMLParagraphElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;
  private downloadBtn!: HTMLButtonElement;
  private delBtn!: HTMLButtonElement;
  private ring!: SVGCircleElement;
  private viewIndex = -1;
  private viewUrl = '';
  private hold: { tween: gsap.core.Tween; done: boolean } | null = null;
  private lastFocus: HTMLElement | null = null;

  async mount(root: HTMLElement, ctx: AppContext): Promise<void> {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('gallery-screen');
    root.append(TopBar(ctx, { titleId: 'gallery.title' }), this.build(), this.buildView());
    if (ctx.flags.test && window.__nonla) {
      window.__nonla.gallery = {
        count: () => this.tiles.length,
        persistent: () => this.store?.persistent ?? null,
        viewing: () => (this.viewIndex >= 0 ? this.tiles[this.viewIndex]?.art.id ?? null : null),
      };
    }
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));

    try {
      this.store = await getGallery();
      const arts = await this.store.list();
      if (!this.alive) return;
      this.render(arts);
      if (!this.store.persistent) {
        this.banner.hidden = false;
        ctx.toast(i18n.t('gallery.session'), 6000);
      }
      const intro = arts.length ? 'gallery.intro' : 'gallery.empty';
      void ctx.narration.say(intro).then((r) => {
        if (r === 'ended' && this.alive && this.store && !this.store.persistent && this.viewIndex < 0) void ctx.narration.say('gallery.session');
      });
    } catch {
      if (!this.alive) return;
      this.render([]);
      void ctx.narration.say('gallery.load-error');
    }
    this.watchIdle();
  }

  unmount(): void {
    this.alive = false;
    this.hold?.tween.kill();
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    for (const t of this.tiles) URL.revokeObjectURL(t.thumbUrl);
    if (this.viewUrl) URL.revokeObjectURL(this.viewUrl);
    if (this.ctx.flags.test && window.__nonla) delete window.__nonla.gallery;
    this.root.replaceChildren();
  }

  // ---------- building ----------

  private build(): HTMLElement {
    this.countText = el('span.gl-count');
    this.colourBtn = el(
      'button.btn.btn--cta.gl-colour',
      { type: 'button', 'data-touch': '', 'data-test': 'colour-more', onclick: () => this.toColour() },
      svg(COLOUR_ICONS.brush),
      i18n.bind(el('span'), 'gallery.colour'),
    );
    const head = el(
      'div.gl-head',
      {},
      el('div.gl-title', {}, svg(COLOUR_ICONS.gallery, 'gl-title__icon'), el('div', {}, i18n.bind(el('h2'), 'gallery.title'), this.countText)),
      this.colourBtn,
    );
    this.banner = el(
      'div.gl-banner',
      { hidden: true, role: 'note', 'data-test': 'session-banner' },
      svg(COLOUR_ICONS.download, 'gl-banner__icon'),
      i18n.bind(el('span'), 'gallery.session'),
    );
    this.wall = el('div.gl-wall', { role: 'list', 'data-test': 'wall' });
    this.emptyBtn = el(
      'button.btn.btn--cta',
      { type: 'button', 'data-touch': '', 'data-test': 'empty-colour', onclick: () => this.toColour() },
      svg(COLOUR_ICONS.brush),
      i18n.bind(el('span'), 'gallery.colour'),
    );
    this.empty = el(
      'div.gl-empty',
      { hidden: true, 'data-test': 'empty' },
      el('div.gl-empty__art', {}, svg(EMPTY_ART)),
      i18n.bind(el('p.gl-empty__text'), 'gallery.empty'),
      this.emptyBtn,
    );
    const offLang = i18n.onChange(() => this.updateCount());
    this.cleanups.push(offLang);
    return el('div.gl', {}, head, this.banner, this.wall, this.empty);
  }

  private buildView(): HTMLElement {
    this.viewImg = el('img.gl-view__img', { alt: '', draggable: false });
    this.viewName = el('p.gl-view__name');
    this.closeBtn = el(
      'button.btn.btn--ghost.gl-view__close',
      { type: 'button', 'data-touch': '', 'data-test': 'view-close', onclick: () => this.closeView() },
      svg(ICONS.close),
      i18n.bind(el('span'), 'ui.close'),
    );
    this.prevBtn = el(
      'button.btn.btn--round.btn--ghost.gl-view__nav',
      { type: 'button', 'data-touch': '', 'data-test': 'view-prev', onclick: () => this.step(-1) },
      svg(ICONS.prev),
      i18n.bind(el('span.visually-hidden'), 'gallery.prev'),
    );
    this.nextBtn = el(
      'button.btn.btn--round.btn--ghost.gl-view__nav',
      { type: 'button', 'data-touch': '', 'data-test': 'view-next', onclick: () => this.step(1) },
      svg(ICONS.next),
      i18n.bind(el('span.visually-hidden'), 'gallery.next'),
    );
    this.downloadBtn = el(
      'button.btn.btn--straw',
      { type: 'button', 'data-touch': '', 'data-test': 'view-download', onclick: () => this.download() },
      svg(COLOUR_ICONS.download),
      i18n.bind(el('span'), 'gallery.download'),
    );
    const ringSvg = svg(
      '<svg viewBox="0 0 52 52"><circle class="gl-del__track" cx="26" cy="26" r="23"/><circle class="gl-del__prog" cx="26" cy="26" r="23" pathLength="1"/></svg>',
      'gl-del__ring',
    );
    this.ring = ringSvg.querySelector('.gl-del__prog') as SVGCircleElement;
    this.delBtn = el(
      'button.btn.gl-del',
      { type: 'button', 'data-touch': '', 'data-test': 'view-delete' },
      el('span.gl-del__icon', {}, ringSvg, svg(COLOUR_ICONS.trash, 'gl-del__trash')),
      i18n.bind(el('span'), 'gallery.delete'),
    );
    this.wireHold();
    const card = el(
      'div.gl-view__card',
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gl-view-name' },
      this.closeBtn,
      el('div.gl-view__frame', {}, this.viewImg),
      el('div.gl-view__row', {}, this.prevBtn, el('div.gl-view__mid', {}, this.viewName, el('div.gl-view__btns', {}, this.downloadBtn, this.delBtn)), this.nextBtn),
    );
    this.viewName.id = 'gl-view-name';
    this.view = el('div.gl-view', { hidden: true, 'data-test': 'view' }, card);
    this.view.addEventListener('click', (e) => {
      if (e.target === this.view) this.closeView();
    });
    return this.view;
  }

  // ---------- the wall ----------

  private render(arts: Artwork[]): void {
    for (const t of this.tiles) URL.revokeObjectURL(t.thumbUrl);
    this.tiles = [];
    this.wall.replaceChildren();
    arts.forEach((art, i) => {
      const thumbUrl = URL.createObjectURL(art.thumb);
      const btn = el(
        'button.gl-tile',
        { type: 'button', 'data-touch': '', 'data-test': 'tile', role: 'listitem', onclick: () => this.openView(this.tiles.findIndex((t) => t.art.id === art.id)) },
        el('span.gl-tile__peg', { 'aria-hidden': 'true' }),
        el('span.gl-tile__paper', {}, el('img', { src: thumbUrl, alt: '', draggable: false, decoding: 'async' })),
      );
      btn.style.setProperty('--tilt', `${[-2, 1.5, -1, 2, -1.5, 1][i % 6]}deg`);
      this.tiles.push({ art, btn, thumbUrl });
      this.wall.appendChild(btn);
    });
    this.labelTiles();
    this.updateCount();
    this.empty.hidden = arts.length > 0;
    this.wall.hidden = arts.length === 0;
    if (arts.length && !motion.reduced) {
      this.g.add(() =>
        gsap.from(
          this.tiles.map((t) => t.btn),
          { y: -30, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'back.out(1.6)', clearProps: 'opacity,transform' },
        ),
      );
    }
  }

  private labelTiles(): void {
    this.tiles.forEach((t, i) => {
      t.btn.setAttribute('aria-label', i18n.t('gallery.open', { n: i + 1 }));
      (t.btn.querySelector('img') as HTMLImageElement).alt = i18n.t('gallery.picture', { page: this.pageName(t.art) });
    });
  }

  private updateCount(): void {
    const n = this.tiles.length;
    this.countText.textContent = n === 1 ? i18n.t('gallery.count.one') : i18n.t('gallery.count', { n });
    this.countText.hidden = n === 0;
    this.labelTiles();
  }

  private pageName(art: Artwork): string {
    const page = pageById(art.pageId);
    return page ? i18n.t(page.nameId) : art.pageId;
  }

  private toColour(): void {
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state: 'colour', params: {} });
  }

  // ---------- the large view ----------

  private openView(i: number): void {
    const t = this.tiles[i];
    if (!t) return;
    const wasOpen = this.viewIndex >= 0;
    if (!wasOpen) this.lastFocus = t.btn;
    this.viewIndex = i;
    this.cancelHold(false);
    if (this.viewUrl) URL.revokeObjectURL(this.viewUrl);
    this.viewUrl = URL.createObjectURL(t.art.png);
    this.viewImg.src = this.viewUrl;
    this.viewImg.alt = i18n.t('gallery.picture', { page: this.pageName(t.art) });
    const page = pageById(t.art.pageId);
    if (page) i18n.bind(this.viewName, page.nameId);
    else this.viewName.textContent = t.art.pageId;
    const many = this.tiles.length > 1;
    this.prevBtn.disabled = !many;
    this.nextBtn.disabled = !many;
    this.view.hidden = false;
    this.ctx.audio.sfx.play(wasOpen ? 'pageTurn' : 'tap');
    if (!wasOpen && !motion.reduced) {
      const from = t.btn.getBoundingClientRect();
      const card = this.view.firstElementChild as HTMLElement;
      const to = card.getBoundingClientRect();
      this.g.add(() => {
        gsap.fromTo(this.view, { backgroundColor: 'rgba(18,48,31,0)' }, { backgroundColor: 'rgba(18,48,31,0.6)', duration: 0.3 });
        gsap.fromTo(
          card,
          {
            x: from.left + from.width / 2 - (to.left + to.width / 2),
            y: from.top + from.height / 2 - (to.top + to.height / 2),
            scale: Math.max(0.15, from.width / to.width),
            opacity: 0.4,
          },
          { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'power3.out', clearProps: 'transform,opacity' },
        );
      });
    }
    this.closeBtn.focus({ preventScroll: true });
    if (page) void this.ctx.narration.say(page.nameId);
    this.watchIdle();
  }

  private closeView(): void {
    if (this.viewIndex < 0) return;
    this.cancelHold(false);
    this.viewIndex = -1;
    this.view.hidden = true;
    this.ctx.narration.stop();
    this.ctx.audio.sfx.play('tap');
    this.lastFocus?.focus({ preventScroll: true });
    this.watchIdle();
  }

  private step(d: number): void {
    if (this.viewIndex < 0 || this.tiles.length < 2) return;
    this.openView((this.viewIndex + d + this.tiles.length) % this.tiles.length);
  }

  private download(): void {
    const t = this.tiles[this.viewIndex];
    if (!t) return;
    this.ctx.audio.sfx.play('tap');
    downloadBlob(t.art.png, pictureFilename(t.art.pageId, t.art.createdAt));
  }

  // ---------- press-and-hold delete ----------

  private wireHold(): void {
    const b = this.delBtn;
    const start = (e: Event) => {
      e.preventDefault();
      this.startHold();
    };
    const stop = () => this.cancelHold(true);
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic */
      }
      start(e);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(e);
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') stop();
    });
    // a click without a hold (keyboard "click", assistive tech) only explains what to do
    b.addEventListener('click', (e) => e.preventDefault());
  }

  private startHold(): void {
    if (this.hold || this.viewIndex < 0) return;
    const prog = { p: 0 };
    this.ring.style.strokeDashoffset = '1';
    this.delBtn.classList.add('is-holding');
    this.ctx.audio.sfx.play('tap');
    const tween = gsap.to(prog, {
      p: 1,
      duration: HOLD_MS / 1000,
      ease: 'none',
      onUpdate: () => {
        this.ring.style.strokeDashoffset = String(1 - prog.p);
      },
      onComplete: () => {
        if (this.hold) this.hold.done = true;
        void this.deleteCurrent();
      },
    });
    this.hold = { tween, done: false };
  }

  private cancelHold(explain: boolean): void {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    this.delBtn.classList.remove('is-holding');
    h.tween.kill();
    this.ring.style.strokeDashoffset = '1';
    if (explain && !h.done) void this.ctx.narration.say('gallery.hold-more');
  }

  private async deleteCurrent(): Promise<void> {
    const i = this.viewIndex;
    const t = this.tiles[i];
    this.hold = null;
    this.delBtn.classList.remove('is-holding');
    this.ring.style.strokeDashoffset = '1';
    if (!t || !this.store) return;
    try {
      await this.store.remove(t.art.id);
    } catch {
      return;
    }
    if (!this.alive) return;
    this.ctx.audio.sfx.play('swish');
    URL.revokeObjectURL(t.thumbUrl);
    this.tiles.splice(i, 1);
    t.btn.remove();
    this.updateCount();
    void this.ctx.narration.say('gallery.deleted');
    if (this.tiles.length === 0) {
      this.viewIndex = -1;
      this.view.hidden = true;
      this.wall.hidden = true;
      this.empty.hidden = false;
      this.watchIdle();
      return;
    }
    this.viewIndex = -1;
    this.view.hidden = true;
    this.openView(Math.min(i, this.tiles.length - 1));
  }

  // ---------- misc ----------

  private onKey(e: KeyboardEvent): void {
    if (this.viewIndex < 0) return;
    if (e.key === 'Escape') this.closeView();
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
  }

  private watchIdle(): void {
    const idle = this.ctx.idle;
    if (this.viewIndex >= 0) {
      const target = this.tiles.length > 1 ? this.nextBtn : this.downloadBtn;
      idle.watch({ stepId: 'gallery.view', gesture: 'tap', target: () => target.getBoundingClientRect() });
    } else if (this.tiles.length) {
      idle.watch({ stepId: 'gallery.open', gesture: 'tap', target: () => this.tiles[0]?.btn.getBoundingClientRect() ?? null });
    } else {
      idle.watch({ stepId: 'gallery.colour', gesture: 'tap', target: () => this.emptyBtn.getBoundingClientRect() });
    }
  }
}

/** empty wall: a nón lá with a paintbrush and three strap-colour dabs */
const EMPTY_ART = `<svg viewBox="0 0 240 180"><ellipse cx="120" cy="150" rx="92" ry="14" fill="#EED39A" opacity=".6"/><path d="M120 22 206 128Q120 150 34 128Z" fill="#F6E7C4" stroke="#5A3F28" stroke-width="5" stroke-linejoin="round"/><path d="M62 104q58 16 116 0" fill="none" stroke="#8E5BA8" stroke-width="10" stroke-linecap="round"/><path d="M82 80q38 10 76 0" fill="none" stroke="#F4A79A" stroke-width="10" stroke-linecap="round"/><path d="M99 56q21 6 42 0" fill="none" stroke="#A9D8A0" stroke-width="10" stroke-linecap="round"/><path d="M196 36c-12 8-30 28-38 42l8 7c13-10 30-29 37-42Z" fill="#E0A93B" stroke="#5A3F28" stroke-width="4" stroke-linejoin="round"/><path d="M156 80c-9 1-14 7-15 15-1 6-5 10-12 12 9 7 26 6 32-1 4-5 4-12 2-18Z" fill="#E0457B" stroke="#5A3F28" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="40" r="9" fill="#8E5BA8"/><circle cx="62" cy="26" r="7" fill="#F4A79A"/><circle cx="30" cy="66" r="6" fill="#A9D8A0"/></svg>`;

export default function (): Screen {
  return new GalleryScreen();
}
