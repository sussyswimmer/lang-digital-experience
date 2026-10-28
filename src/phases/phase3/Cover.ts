/**
 * The storybook cover the hat shrinks into at the end of Phase 2: forest-green cloth, a golden frame,
 * a glowing nón lá (the Blender render of the same hat, so the 3D hat lands on its own picture), a
 * stitched paper label and a red thread bookmark. Tapping it swings the cover open in 3D.
 */
import { gsap } from 'gsap';
import { el, svg } from '../../ui/el';
import { i18n } from '../../i18n/i18n';
import { motion } from '../../a11y/motion';
import { assetUrl } from '../../assets/manifest';
import { P3_ICONS } from './art';

/** the Blender cover render of the hat, trimmed to the hat (no floor shadow) */
export function renderedHat(className = ''): HTMLImageElement {
  return el(`img.p3-hat-render${className ? '.' + className : ''}`, {
    src: assetUrl('img/renders/cover-hat-600.webp'),
    srcset: `${assetUrl('img/renders/cover-hat-600.webp')} 600w, ${assetUrl('img/renders/cover-hat.webp')} 1200w`,
    sizes: '(max-width: 600px) 60vw, 420px',
    alt: '',
    draggable: 'false',
  });
}

/** flip to true once assets/img/art/storybook-cover.webp exists (listed in asset-requests.phase3.json) */
const COVER_ART_READY = false;

export class Cover {
  readonly wrap: HTMLDivElement;
  readonly book: HTMLDivElement;
  readonly face: HTMLButtonElement;
  readonly hat: HTMLDivElement;
  readonly cta: HTMLButtonElement;
  private offLang: () => void;

  constructor(onOpen: () => void) {
    this.hat = el('div.p3-book__hat');
    this.hat.append(renderedHat());
    // the title stays live text on top of the art, so it follows the EN/VI toggle
    const plate = el('div.p3-book__plate.stitched.stitched--thread', {}, i18n.bind(el('span.p3-book__title'), 'p3.title'), i18n.bind(el('span.p3-book__sub'), 'p3.cover.sub'));
    const art = COVER_ART_READY
      ? el('div.p3-book__frame.p3-book__frame--art', {}, el('img.p3-book__art', { src: assetUrl('img/art/storybook-cover.webp'), alt: '' }), plate)
      : el('div.p3-book__frame', {}, el('div.p3-book__glow'), this.hat, plate);
    this.face = el(
      'button.p3-book__cover',
      { type: 'button', 'data-touch': '', 'data-test': 'cover', 'aria-label': i18n.t('p3.cover.open'), onclick: onOpen },
      el('div.p3-book__front', {}, el('div.p3-book__spine'), art),
      el('div.p3-book__inside', {}, el('div.p3-book__endpaper')),
    );
    // the bookmark hangs out from between the pages, so it sits under them in the DOM
    this.book = el('div.p3-book', {}, el('div.p3-book__ribbon'), el('div.p3-book__pages'), this.face);
    this.cta = el(
      'button.btn.btn--cta.p3-cover-cta',
      { type: 'button', 'data-touch': '', 'data-test': 'cover-open', onclick: onOpen },
      svg(P3_ICONS.book),
      i18n.bind(el('span'), 'p3.cover.cta'),
    );
    this.wrap = el('div.p3-cover', {}, this.book, this.cta);
    this.offLang = i18n.onChange(() => this.face.setAttribute('aria-label', i18n.t('p3.cover.open')));
  }

  dispose(): void {
    this.offLang();
  }

  /** where the 3D hat should shrink to (the drawn hat on the cover) */
  hatRect(): DOMRect {
    return (this.hat.isConnected ? this.hat : this.book).getBoundingClientRect();
  }

  reveal(g: gsap.Context): gsap.core.Timeline {
    return g.add(() => {
      const tl = gsap.timeline();
      tl.fromTo(this.book, { opacity: 0, scale: 0.9, y: 24 }, { opacity: 1, scale: 1, y: 0, duration: motion.dur(0.7), ease: 'back.out(1.4)' });
      tl.fromTo(this.cta, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: motion.dur(0.45), ease: 'power2.out' }, '-=0.2');
      return tl;
    });
  }

  /** the cover swings open around its spine, then the whole book zooms into the pages */
  open(g: gsap.Context): gsap.core.Timeline {
    return g.add(() => {
      const tl = gsap.timeline();
      tl.to(this.cta, { opacity: 0, y: 20, duration: 0.25 }, 0);
      if (motion.reduced) {
        tl.to(this.book, { opacity: 0, duration: 0.3 }, 0);
        return tl;
      }
      tl.to(this.face, { rotationY: -168, transformPerspective: 1800, transformOrigin: '0% 50%', duration: 1.05, ease: 'power2.inOut' }, 0);
      tl.to(this.book, { xPercent: 22, duration: 1.05, ease: 'power2.inOut' }, 0);
      tl.to(this.book, { scale: 1.25, opacity: 0, duration: 0.45, ease: 'power2.in' }, 0.9);
      return tl;
    });
  }
}
