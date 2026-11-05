/**
 * The layer card: it slides in only once the narrator has finished explaining the layer (one thing
 * at a time), with the layer's name, a real photo from the team (tap to enlarge), the strap colours
 * on the last layer, "Watch again" and the Next button. Nothing on it scrolls and nothing on it talks
 * over the hat: the words themselves were narrated, one caption sentence at a time, before it came.
 */
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { i18n } from '../../i18n/i18n';
import { picture } from '../../assets/manifest';
import type { LayerScript } from './script';
import { LAYER_ICONS, PANEL_ICONS } from './icons';

export interface InsightHandlers {
  /** "Watch again": play the explanation once more */
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
  readonly replayBtn: HTMLButtonElement;
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
    this.replayBtn = el(
      'button.btn.btn--ghost.p2-replay',
      { type: 'button', 'data-touch': '', 'data-test': 'watch-again', onclick: () => h.onReplay() },
      svg(ICONS.replay),
      i18n.bind(el('span'), 'p2.ui.watchAgain'),
    );
    // ink, not red: the thread already runs down the sheet's spine
    this.doneBtn = el('button.btn.p2-done', { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => h.onDone() });
    this.el = el(
      'aside.p2-panel',
      { 'aria-live': 'polite' },
      this.header,
      this.photo,
      this.extras,
      el('div.p2-panel__foot', {}, this.replayBtn, this.doneBtn),
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

  photoSrc(): HTMLPictureElement | null {
    return this.photo.querySelector('picture');
  }

  dispose(): void {
    this.offLang();
  }
}
