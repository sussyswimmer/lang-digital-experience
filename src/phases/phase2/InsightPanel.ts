/**
 * The insight sheet that slides in after each layer's interaction: the layer's name, a real photo
 * from the team (tap to enlarge), layer extras (thread legend, strap colours), chunk navigation
 * (Back · stitches · More) and the Next button. The words themselves are narrated with captions.
 */
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { i18n } from '../../i18n/i18n';
import { picture } from '../../assets/manifest';
import type { LayerScript } from './script';
import { LAYER_ICONS, PANEL_ICONS } from './icons';

export interface InsightHandlers {
  onPrev(): void;
  onNext(): void;
  onReplay(): void;
  /** the layer's name was tapped: say it again */
  onName(): void;
  onDone(): void;
  onPhoto(): void;
}

export class InsightPanel {
  readonly el: HTMLElement;
  readonly extras: HTMLElement;
  readonly doneBtn: HTMLButtonElement;
  readonly nextBtn: HTMLButtonElement;
  readonly prevBtn: HTMLButtonElement;
  private dots: HTMLElement;
  private photo: HTMLElement;
  private header: HTMLElement;
  private say: HTMLButtonElement;
  private nameId = '';
  private img: HTMLImageElement | null = null;
  private altId = '';
  private offLang: () => void;

  constructor(private h: InsightHandlers) {
    this.header = el('div.p2-panel__head');
    this.say = el('button.p2-panel__say', { type: 'button', onclick: () => this.h.onName() });
    this.photo = el('button.p2-panel__photo', { type: 'button', 'data-touch': '', onclick: () => h.onPhoto() });
    this.extras = el('div.p2-panel__extras');
    this.dots = el('div.p2-panel__dots', { 'aria-hidden': 'true' });
    this.prevBtn = el(
      'button.btn.btn--ghost.p2-nav',
      { type: 'button', 'data-touch': '', 'data-test': 'chunk-prev', onclick: () => h.onPrev() },
      svg(ICONS.prev),
      i18n.bind(el('span'), 'p2.ui.back'),
    );
    this.nextBtn = el(
      'button.btn.btn--ghost.p2-nav',
      { type: 'button', 'data-touch': '', 'data-test': 'chunk-next', onclick: () => h.onNext() },
      i18n.bind(el('span'), 'p2.ui.more'),
      svg(ICONS.next),
    );
    const replay = i18n.bindAttr(
      el('button.btn.btn--round.btn--ghost.p2-replay', { type: 'button', 'data-touch': '', onclick: () => h.onReplay() }, svg(ICONS.replay)),
      'aria-label',
      'ui.replay',
    );
    // ink, not red: the thread already runs down the sheet's spine
    this.doneBtn = el('button.btn.p2-done', { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => h.onDone() });
    this.el = el(
      'aside.p2-panel',
      { 'aria-live': 'polite' },
      this.header,
      this.photo,
      this.extras,
      // the stitch progress lives in the sticky foot, so it stays in view when the sheet scrolls
      el('div.p2-panel__foot', {}, this.dots, el('div.p2-panel__nav', {}, this.prevBtn, replay, this.nextBtn), this.doneBtn),
    );
    this.offLang = i18n.onChange(() => {
      if (this.img) this.img.alt = i18n.t(this.altId);
      if (this.nameId) this.paintName();
    });
  }

  setLayer(s: LayerScript, last: boolean): void {
    this.nameId = s.name;
    this.paintName();
    this.header.replaceChildren(
      el('span.p2-panel__icon', { 'aria-hidden': 'true' }, svg(LAYER_ICONS[s.layer], 'p2-layer-icon')),
      el('span.p2-panel__titles', {}, i18n.bind(el('span.p2-panel__step'), 'p2.layer.label', { n: s.index + 1 }), el('h2.p2-panel__name', {}, this.say)),
      // the running stitch under the heading sews in when the sheet opens (phase2.css)
      el('hr.stitch.stitch--short.p2-panel__stitch'),
    );
    this.altId = s.photo.alt;
    const pic = picture({ stem: s.photo.stem, alt: i18n.t(s.photo.alt), focal: [0.5, 0.5] }, { sizes: '(max-width: 700px) 30vw, 360px', className: 'p2-panel__img' });
    this.img = pic.querySelector('img');
    this.photo.replaceChildren(pic, el('span.p2-panel__photo-tag', {}, svg(PANEL_ICONS.photo), i18n.bind(el('span'), 'p2.ui.realPhoto')));
    this.photo.setAttribute('aria-label', i18n.t('p2.ui.realPhoto'));
    this.dots.replaceChildren(...s.chunks.map(() => el('span.p2-panel__dot')));
    this.doneBtn.replaceChildren(i18n.bind(el('span'), last ? 'p2.ui.finish' : 'p2.ui.nextLayer'), svg(last ? PANEL_ICONS.star : ICONS.next));
    this.extras.replaceChildren();
  }

  /**
   * The layer's name, with the part in brackets (the Vietnamese name: "Chỉ Khâu") as a hand-written
   * sticker. The brackets stay in the text, hidden, so the string reads the same to a screen reader.
   */
  private paintName(): void {
    const text = i18n.t(this.nameId);
    const m = /^(.*\S)\s*\((.+)\)$/.exec(text);
    if (!m) {
      this.say.replaceChildren(text);
      return;
    }
    this.say.replaceChildren(
      el('span.p2-panel__en', {}, m[1]),
      ' ',
      el('span.p2-panel__vi.sheet.sheet--tape', {}, el('span.visually-hidden', {}, '('), m[2], el('span.visually-hidden', {}, ')')),
    );
  }

  setChunk(i: number, total: number): void {
    this.dots.querySelectorAll('.p2-panel__dot').forEach((d, k) => {
      d.classList.toggle('is-on', k === i);
      d.classList.toggle('is-seen', k < i);
    });
    this.prevBtn.disabled = i <= 0;
    this.nextBtn.disabled = i >= total - 1;
  }

  photoSrc(): HTMLPictureElement | null {
    return this.photo.querySelector('picture');
  }

  dispose(): void {
    this.offLang();
  }
}
