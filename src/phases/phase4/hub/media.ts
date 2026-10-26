/** Show a final image when it exists, else (or if it fails to load) the in-code SVG drawing. */
import { el } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import { assetUrl } from '../../../assets/manifest';

export interface ArtSpec {
  /** path under public/assets/, or null to always draw the SVG */
  src: string | null;
  srcset?: string;
  sizes?: string;
  /** string id of the alt text (kept in step with the EN/VI toggle by refreshAlts) */
  altId: string;
  /** SVG markup drawn until the image is ready */
  svg: string;
}

export function art(spec: ArtSpec, className: string): HTMLElement {
  const box = el('div', { class: className, dataset: { altId: spec.altId } });
  const drawSvg = () => {
    box.innerHTML = spec.svg;
    box.querySelector('svg')?.setAttribute('role', 'img');
    box.dataset.art = 'svg';
    refreshAlt(box);
  };
  if (!spec.src) {
    drawSvg();
    return box;
  }
  const img = el('img', { decoding: 'async', draggable: false });
  img.addEventListener('error', drawSvg, { once: true });
  if (spec.srcset) {
    img.srcset = spec.srcset;
    img.sizes = spec.sizes ?? '100vw';
  }
  img.src = assetUrl(spec.src);
  box.dataset.art = 'img';
  box.appendChild(img);
  refreshAlt(box);
  return box;
}

function refreshAlt(box: HTMLElement): void {
  const text = i18n.t(box.dataset.altId!);
  box.querySelector('img')?.setAttribute('alt', text);
  box.querySelector('svg[role=img]')?.setAttribute('aria-label', text);
}

/** call on language change: every picture made by art() under `root` gets its alt in the new language */
export function refreshAlts(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-alt-id]').forEach(refreshAlt);
}
