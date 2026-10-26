/**
 * Asset URLs. Code refers to stable paths under public/assets/, so a final asset replaces its
 * placeholder by being dropped in with the same name: no code changes.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path.replace(/^\/+/, '')}`;
}

export interface PhotoSpec {
  /** stem under assets/img/photos/, e.g. 'p1-farmers' */
  stem: string;
  widths?: number[];
  alt: string;
  /** focal point for object-position, 0..1 */
  focal?: [number, number];
}

/** <picture> with AVIF + WebP sources and a JPEG fallback (see tools/assets/process-photos.mjs). */
export function picture(p: PhotoSpec, opts: { sizes?: string; eager?: boolean; className?: string } = {}): HTMLPictureElement {
  const widths = p.widths ?? [640, 1280, 1920];
  const pic = document.createElement('picture');
  for (const fmt of ['avif', 'webp'] as const) {
    const s = document.createElement('source');
    s.type = `image/${fmt}`;
    s.srcset = widths.map((w) => `${assetUrl(`img/photos/${p.stem}-${w}.${fmt}`)} ${w}w`).join(', ');
    s.sizes = opts.sizes ?? '100vw';
    pic.appendChild(s);
  }
  const img = document.createElement('img');
  img.src = assetUrl(`img/photos/${p.stem}-${widths[1] ?? widths[0]}.jpg`);
  img.srcset = widths.map((w) => `${assetUrl(`img/photos/${p.stem}-${w}.jpg`)} ${w}w`).join(', ');
  img.sizes = opts.sizes ?? '100vw';
  img.alt = p.alt;
  img.decoding = 'async';
  img.loading = opts.eager ? 'eager' : 'lazy';
  img.draggable = false;
  if (opts.className) img.className = opts.className;
  if (p.focal) img.style.objectPosition = `${p.focal[0] * 100}% ${p.focal[1] * 100}%`;
  pic.appendChild(img);
  return pic;
}
