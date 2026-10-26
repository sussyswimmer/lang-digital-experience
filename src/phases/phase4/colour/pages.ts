/**
 * The four colouring pages from the brief. Each lives at img/lineart/page-N-name.png (Blender
 * Freestyle / Higgsfield line art) and/or .svg (hand-drawn fallback). The PNG is used when it
 * exists; `?lineart=svg` forces the SVGs for review.
 */
import { assetUrl } from '../../../assets/manifest';

export interface ColourPage {
  id: 'plain' | 'strap' | 'poem' | 'market';
  file: string;
  /** spoken + visible name */
  nameId: string;
  /** where the idle hand points first, as a fraction of the page (a big, friendly shape) */
  hint: { x: number; y: number };
}

export const PAGES: readonly ColourPage[] = [
  { id: 'plain', file: 'page-1-plain', nameId: 'colour.page.plain', hint: { x: 0.5, y: 0.5 } },
  { id: 'strap', file: 'page-2-strap', nameId: 'colour.page.strap', hint: { x: 0.5, y: 0.45 } },
  { id: 'poem', file: 'page-3-poem', nameId: 'colour.page.poem', hint: { x: 0.62, y: 0.25 } },
  { id: 'market', file: 'page-4-market', nameId: 'colour.page.market', hint: { x: 0.5, y: 0.2 } },
];

export function pageById(id: string | undefined): ColourPage | undefined {
  return PAGES.find((p) => p.id === id);
}

export function sourceCandidates(page: ColourPage, search = typeof location === 'undefined' ? '' : location.search): string[] {
  const png = assetUrl(`img/lineart/${page.file}.png`);
  const svg = assetUrl(`img/lineart/${page.file}.svg`);
  return new URLSearchParams(search).get('lineart') === 'svg' ? [svg, png] : [png, svg];
}

const resolved = new Map<string, Promise<HTMLImageElement>>();

/** the first source that loads as an image (cached for the visit) */
export function loadPageImage(page: ColourPage): Promise<HTMLImageElement> {
  let p = resolved.get(page.id);
  if (!p) {
    p = (async () => {
      let last: unknown;
      for (const url of sourceCandidates(page)) {
        try {
          return await loadImage(url);
        } catch (e) {
          last = e;
        }
      }
      throw last ?? new Error(`no line art for ${page.id}`);
    })();
    // a failed load may be a flaky network: let the next visit try again
    p.catch(() => resolved.delete(page.id));
    resolved.set(page.id, p);
  }
  return p;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error(`empty image ${url}`)));
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}
