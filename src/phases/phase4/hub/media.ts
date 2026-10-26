/** Show a final image when it exists, else (or if it fails to load) the in-code SVG drawing. */
import { el } from '../../../ui/el';
import { assetUrl } from '../../../assets/manifest';

export interface ArtSpec {
  /** path under public/assets/, or null to always draw the SVG */
  src: string | null;
  srcset?: string;
  sizes?: string;
  alt: string;
  /** SVG markup drawn until the image is ready */
  svg: string;
}

export function art(spec: ArtSpec, className: string): HTMLElement {
  const box = el('div', { class: className });
  const drawSvg = () => {
    box.innerHTML = spec.svg;
    const s = box.querySelector('svg');
    s?.setAttribute('role', 'img');
    s?.setAttribute('aria-label', spec.alt);
    box.dataset.art = 'svg';
  };
  if (!spec.src) {
    drawSvg();
    return box;
  }
  const img = el('img', { alt: spec.alt, decoding: 'async', draggable: false });
  img.addEventListener('error', drawSvg, { once: true });
  if (spec.srcset) {
    img.srcset = spec.srcset;
    img.sizes = spec.sizes ?? '100vw';
  }
  img.src = assetUrl(spec.src);
  box.dataset.art = 'img';
  box.appendChild(img);
  return box;
}
