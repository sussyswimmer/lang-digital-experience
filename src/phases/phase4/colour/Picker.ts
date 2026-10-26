/**
 * "How would you paint your own Nón Lá?": the four pages as big picture cards. A page with an
 * unfinished drawing shows the child's colours under its lines and a "Keep colouring" badge.
 */
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { ICONS } from '../../../ui/icons';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import type { AppContext } from '../../../app/context';
import { PAGES, loadPageImage, type ColourPage } from './pages';
import { COLOUR_ICONS } from './icons';
import { getGallery } from '../gallery/galleryDb';

export interface PickerHost {
  ctx: AppContext;
  alive(): boolean;
  onPick(page: ColourPage): void;
  onGallery(): void;
  /** resolves once the studio's last draft write has landed */
  settled(): Promise<void>;
}

export class Picker {
  readonly el: HTMLElement;
  private cards: { page: ColourPage; btn: HTMLButtonElement; thumb: HTMLDivElement; line: HTMLImageElement }[] = [];
  private urls: string[] = [];
  private g = gsap.context(() => {});
  private galleryBtn: HTMLButtonElement;
  private countBadge: HTMLSpanElement;
  private visible = false;

  constructor(private host: PickerHost) {
    const listen = el(
      'button.btn.btn--round.btn--ghost.cp-listen',
      { type: 'button', 'data-touch': '', 'data-test': 'listen', onclick: () => this.speak(true) },
      svg(ICONS.speaker),
      i18n.bind(el('span.visually-hidden'), 'ui.replay'),
    );
    const head = el(
      'div.cp-head',
      {},
      el(
        'div.bubble.cp-bubble',
        {},
        svg(ICONS.hat, 'cp-bubble__hat'),
        el('div.cp-bubble__text', {}, i18n.bind(el('h2.cp-question'), 'colour.question'), i18n.bind(el('p.cp-sub'), 'colour.pick')),
        listen,
      ),
    );
    const grid = el('div.cp-grid', { role: 'list' });
    PAGES.forEach((page, i) => {
      const line = el('img.cp-thumb__line', { alt: '', draggable: false, decoding: 'async' });
      const thumb = el('div.cp-thumb', {}, line);
      const btn = el(
        'button.cp-card',
        { type: 'button', 'data-touch': '', 'data-test': `page-${page.id}`, role: 'listitem', onclick: () => this.pick(page) },
        thumb,
        el('span.cp-card__num', { 'aria-hidden': 'true' }, String(i + 1)),
        el('span.cp-card__draft', { hidden: true }, svg(COLOUR_ICONS.brush), i18n.bind(el('span'), 'colour.draft')),
        i18n.bind(el('span.cp-card__name'), page.nameId),
      );
      this.cards.push({ page, btn, thumb, line });
      grid.appendChild(btn);
      void loadPageImage(page).then(
        (img) => (line.src = img.currentSrc || img.src),
        () => thumb.classList.add('is-missing'),
      );
    });
    this.countBadge = el('span.cp-gallery__count', { hidden: true });
    this.galleryBtn = el(
      'button.btn.btn--straw.cp-gallery',
      { type: 'button', 'data-touch': '', 'data-test': 'open-gallery', onclick: () => host.onGallery() },
      svg(COLOUR_ICONS.gallery),
      i18n.bind(el('span'), 'gallery.title'),
      this.countBadge,
    );
    this.el = el('div.cp', { hidden: true, 'data-test': 'picker' }, head, grid, el('div.cp-foot', {}, this.galleryBtn));
  }

  /** show the picker; `first` = arriving at the activity (the brief's question) vs coming back */
  async show(first: boolean): Promise<void> {
    this.visible = true;
    this.el.hidden = false;
    if (!motion.reduced) {
      this.g.add(() =>
        gsap.fromTo(
          this.cards.map((c) => c.btn),
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, stagger: 0.07, ease: 'back.out(1.5)', clearProps: 'transform,opacity' },
        ),
      );
    }
    this.speak(first);
    this.host.ctx.idle.watch({ stepId: 'colour.pick', gesture: 'tap', target: () => this.suggested().getBoundingClientRect() });
    await this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  dispose(): void {
    this.g.kill();
    for (const u of this.urls.splice(0)) URL.revokeObjectURL(u);
  }

  private speak(first: boolean): void {
    const ctx = this.host.ctx;
    if (!first) {
      void ctx.narration.say('colour.pick');
      return;
    }
    void ctx.narration.say('colour.question').then((r) => {
      if (r === 'ended' && this.visible && this.host.alive()) void ctx.narration.say('colour.pick');
    });
  }

  /** the card the idle hand points at: the first unfinished drawing, else page 1 */
  private suggested(): HTMLButtonElement {
    return (this.cards.find((c) => c.btn.classList.contains('has-draft')) ?? this.cards[0]).btn;
  }

  private pick(page: ColourPage): void {
    this.host.ctx.audio.sfx.play('tap');
    this.host.onPick(page);
  }

  /** draft previews and the gallery count */
  async refresh(): Promise<void> {
    let store;
    try {
      await this.host.settled();
      store = await getGallery();
    } catch {
      return;
    }
    if (!this.host.alive()) return;
    for (const u of this.urls.splice(0)) URL.revokeObjectURL(u);
    await Promise.all(
      this.cards.map(async (c) => {
        const d = await store.loadDraft(c.page.id).catch(() => undefined);
        c.thumb.querySelector('.cp-thumb__paint')?.remove();
        const has = Boolean(d && c.line.src && d.src === c.line.src);
        c.btn.classList.toggle('has-draft', has);
        (c.btn.querySelector('.cp-card__draft') as HTMLElement).hidden = !has;
        if (has && d) {
          const url = URL.createObjectURL(d.paint);
          this.urls.push(url);
          c.thumb.prepend(el('img.cp-thumb__paint', { src: url, alt: '', draggable: false }));
        }
      }),
    );
    this.setCount(await store.count().catch(() => 0));
  }

  setCount(n: number): void {
    this.countBadge.hidden = n === 0;
    this.countBadge.textContent = String(n);
  }
}
