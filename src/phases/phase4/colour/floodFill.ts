/**
 * One-tap fill for the colouring studio (pure, unit-tested in tests/unit/p4-colour.floodFill.test.ts).
 *
 * An iterative scanline span fill over the paint layer. It never enters a barrier pixel (the line
 * art, already dilated to close small gaps, see lineart.ts). In 'color' mode it only takes pixels
 * whose paint is within `tolerance` of the seed's paint, so brushed patterns survive a fill; in
 * 'region' mode it fills the whole line-bounded shape. `edgeBleed` then paints a few pixels into
 * the barrier margin around the shape, so no paper-white halo is left between the fill and the
 * (dilated) line; those pixels sit under the line layer.
 */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RGBA = readonly [number, number, number, number];

export interface FillOptions {
  /** max per-channel difference (0–255) from the seed's paint, in 'color' mode; default 32 */
  tolerance?: number;
  mode?: 'color' | 'region';
  /** how far (px, 8-connected) the fill reaches into the barrier margin; default 0 */
  edgeBleed?: number;
  /** called with the dirty rect after the region is found and before any pixel changes (for undo) */
  beforeWrite?: (rect: DirtyRect) => void;
}

const FILLED = 1;
const BLED = 2;

export function packRGBA(rgba: RGBA): number {
  const bytes = new Uint8ClampedArray(rgba as unknown as number[]);
  return new Uint32Array(bytes.buffer)[0];
}

export function hexToRGBA(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(full.slice(0, 6), 16);
  const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** Fill the shape under (x, y). Returns the changed rect, or null when nothing changes. */
export function floodFill(paint: PixelBuffer, barrier: Uint8Array, x: number, y: number, rgba: RGBA, opts: FillOptions = {}): DirtyRect | null {
  const { width: w, height: h, data } = paint;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const seed = y * w + x;
  if (barrier[seed]) return null;

  const px = new Uint32Array(data.buffer, data.byteOffset, w * h);
  const fill = packRGBA(rgba);
  const seedColour = px[seed];
  if (seedColour === fill) return null;

  const regionMode = opts.mode === 'region';
  const tol = Math.max(0, opts.tolerance ?? 32);
  const sr = data[seed * 4];
  const sg = data[seed * 4 + 1];
  const sb = data[seed * 4 + 2];
  const sa = data[seed * 4 + 3];
  const mask = new Uint8Array(w * h);

  // can pixel i join the region? (not yet taken, not a line, paint close to the seed's)
  const ok = (i: number): boolean => {
    if ((mask[i] | barrier[i]) !== 0) return false;
    if (regionMode || px[i] === seedColour) return true;
    if (tol === 0) return false;
    const o = i << 2;
    return (
      Math.abs(data[o] - sr) <= tol &&
      Math.abs(data[o + 1] - sg) <= tol &&
      Math.abs(data[o + 2] - sb) <= tol &&
      Math.abs(data[o + 3] - sa) <= tol
    );
  };

  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  // filled runs as [left, right] index pairs: the write pass then uses TypedArray.fill
  const spans: number[] = [];
  const stack: number[] = [seed];
  while (stack.length) {
    const start = stack.pop()!;
    if (!ok(start)) continue;
    const row = start - (start % w);
    let l = start;
    while (l > row && ok(l - 1)) l--;
    let r = start;
    while (r < row + w - 1 && ok(r + 1)) r++;
    mask.fill(FILLED, l, r + 1);
    spans.push(l, r);
    const cy = row / w;
    if (l - row < minX) minX = l - row;
    if (r - row > maxX) maxX = r - row;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
    // queue one seed per run of fillable pixels in the rows above and below
    for (let pass = 0; pass < 2; pass++) {
      const nrow = pass === 0 ? row - w : row + w;
      if (nrow < 0 || nrow >= w * h) continue;
      let inRun = false;
      for (let i = l - row; i <= r - row; i++) {
        const ni = nrow + i;
        if (ok(ni)) {
          if (!inRun) stack.push(ni);
          inRun = true;
        } else inRun = false;
      }
    }
  }

  const bleed = Math.max(0, Math.floor(opts.edgeBleed ?? 0));
  const bled = bleed > 0 ? bleedIntoBarrier(mask, barrier, w, h, minX, minY, maxX, maxY, bleed) : [];

  const rect = {
    x: Math.max(0, minX - bleed),
    y: Math.max(0, minY - bleed),
    w: 0,
    h: 0,
  };
  rect.w = Math.min(w - 1, maxX + bleed) - rect.x + 1;
  rect.h = Math.min(h - 1, maxY + bleed) - rect.y + 1;
  opts.beforeWrite?.(rect);
  for (let k = 0; k < spans.length; k += 2) px.fill(fill, spans[k], spans[k + 1] + 1);
  for (const i of bled) px[i] = fill;
  return rect;
}

/** breadth-first, 8-connected, through barrier pixels only, up to `depth` steps from the region */
function bleedIntoBarrier(mask: Uint8Array, barrier: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, depth: number): number[] {
  // the first ring: barrier pixels touching the region (lines are a small share of the page,
  // so testing from the barrier side is much cheaper than testing every filled pixel)
  let frontier: number[] = [];
  const ya = Math.max(0, y0 - 1);
  const yb = Math.min(h - 1, y1 + 1);
  const xa = Math.max(0, x0 - 1);
  const xb = Math.min(w - 1, x1 + 1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa, i = y * w + xa; x <= xb; x++, i++) {
      if (barrier[i] === 0 || mask[i] !== 0) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && mask[ny * w + nx] === FILLED) {
            touches = true;
            break;
          }
        }
      }
      if (touches) frontier.push(i);
    }
  }
  for (const i of frontier) mask[i] = BLED;
  const all = frontier.slice();
  for (let d = 1; d < depth && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (mask[ni] === 0 && barrier[ni] !== 0) {
            mask[ni] = BLED;
            next.push(ni);
            all.push(ni);
          }
        }
      }
    }
    frontier = next;
  }
  return all;
}
