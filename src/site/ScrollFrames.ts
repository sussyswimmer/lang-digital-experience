/**
 * Draws the scroll intro's image sequence on a canvas.
 *
 * Every compressed frame (a few tens of KB) is kept as a Blob, but only a ±6-frame window around
 * the current position (6 more ahead while scrolling) is decoded to ImageBitmaps (a decoded 1600w
 * frame is ~5.8 MB), and only while the story is near the viewport (setDecoding). Frames arrive
 * coarse-to-fine, so scrubbing works after the first handful; until a frame is decoded the nearest
 * decoded one is drawn. Between two decoded neighbours the next frame is blended in by the
 * fractional position, which keeps a short placeholder sequence smooth.
 */
import { assetUrl } from '../assets/manifest';
import { chooseWidth, decodeWindow, fitRect, loadOrder, nearestAvailable } from './frameMath';

export interface FramesManifest {
  count: number;
  widths: number[];
  aspect?: [number, number];
  bg?: { top: string; bottom: string };
  placeholder?: boolean;
}

export async function loadManifest(signal?: AbortSignal): Promise<FramesManifest | null> {
  try {
    const res = await fetch(assetUrl('scroll/manifest.json'), { signal });
    if (!res.ok) return null;
    const m = (await res.json()) as FramesManifest;
    return m.count > 1 && Array.isArray(m.widths) && m.widths.length ? m : null;
  } catch {
    return null;
  }
}

export function frameUrl(width: number, index: number): string {
  return assetUrl(`scroll/${width}/f_${String(index + 1).padStart(4, '0')}.webp`);
}

const FETCH_PARALLEL = 4;
const DECODE_PARALLEL = 3;
const WINDOW = 6;

export class ScrollFrames {
  readonly width: number;
  private readonly count: number;
  private readonly ctx: CanvasRenderingContext2D;
  private blobs: (Blob | undefined)[];
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private fetching = new Set<number>();
  private queue: number[] = [];
  private abort: AbortController | null = null;
  private window = new Set<number>();
  private target = 0;
  private dir: -1 | 0 | 1 = 0;
  private shown = -1;
  private raf = 0;
  private running = false;
  private decodeOn = true;
  private ro: ResizeObserver | null = null;
  private firstDrawn = false;
  onFirstFrame: () => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private manifest: FramesManifest,
  ) {
    this.count = manifest.count;
    this.blobs = new Array(this.count);
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    const cssW = canvas.getBoundingClientRect().width || window.innerWidth;
    this.width = chooseWidth(cssW, window.devicePixelRatio || 1, manifest.widths);
  }

  get frameIndex(): number {
    return this.shown;
  }

  get loaded(): number {
    return this.blobs.filter(Boolean).length;
  }

  get decoded(): number {
    return this.bitmaps.size;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.queue = loadOrder(this.count).filter((i) => !this.blobs[i]);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.resize();
    this.pump();
    this.schedule();
  }

  /** Stop fetching and drawing and free decoded frames; the compressed frames stay for resume(). */
  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    this.fetching.clear();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.ro = null;
    for (const b of this.bitmaps.values()) b.close();
    this.bitmaps.clear();
    this.shown = -1;
  }

  /** Off: keep fetching, but free every decoded frame and decode none (the story is far from the viewport). */
  setDecoding(on: boolean): void {
    if (on === this.decodeOn) return;
    this.decodeOn = on;
    if (on) {
      this.schedule();
      this.requestDraw(true);
      return;
    }
    for (const b of this.bitmaps.values()) b.close();
    this.bitmaps.clear();
  }

  destroy(): void {
    this.pause();
    this.blobs = new Array(this.count);
  }

  /** Move to a fractional frame index (0 … count-1). */
  seek(index: number): void {
    const next = Math.min(this.count - 1, Math.max(0, index));
    if (next !== this.target) this.dir = next > this.target ? 1 : -1;
    this.target = next;
    this.schedule();
    this.requestDraw();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.requestDraw(true);
  }

  // ---------------------------------------------------------------- fetching

  private nextToFetch(): number | undefined {
    // the frames right around the reader come first, then the coarse-to-fine queue
    const c = Math.round(this.target);
    for (let d = 0; d <= 3; d++) {
      for (const i of [c + d, c - d]) {
        if (i >= 0 && i < this.count && !this.blobs[i] && !this.fetching.has(i)) return i;
      }
    }
    while (this.queue.length) {
      const i = this.queue.shift()!;
      if (!this.blobs[i] && !this.fetching.has(i)) return i;
    }
    return undefined;
  }

  private pump(): void {
    while (this.running && this.fetching.size < FETCH_PARALLEL) {
      const i = this.nextToFetch();
      if (i === undefined) return;
      this.fetching.add(i);
      const signal = this.abort!.signal;
      fetch(frameUrl(this.width, i), { signal })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob && !signal.aborted) {
            this.blobs[i] = blob;
            if (this.window.has(i) || !this.firstDrawn) this.schedule();
          }
        })
        .catch(() => {
          /* aborted on pause, or a missing frame: the nearest frame covers it */
        })
        .finally(() => {
          if (signal.aborted) return;
          this.fetching.delete(i);
          this.pump();
        });
    }
  }

  // ---------------------------------------------------------------- decoding

  private schedule(): void {
    if (!this.running || !this.decodeOn) return;
    const wanted = decodeWindow(this.target, this.count, WINDOW, this.dir);
    this.window = new Set(wanted);
    for (const [i, bmp] of this.bitmaps) {
      if (!this.window.has(i) && i !== this.shown) {
        bmp.close();
        this.bitmaps.delete(i);
      }
    }
    // before anything is drawn, decode whatever frame is closest so the canvas is never blank
    if (!this.firstDrawn && !this.bitmaps.size && !this.decoding.size) {
      const near = nearestAvailable(this.target, this.count, (i) => Boolean(this.blobs[i]));
      if (near >= 0 && !this.window.has(near)) this.decode(near);
    }
    for (const i of wanted) {
      if (this.decoding.size >= DECODE_PARALLEL) break;
      if (this.blobs[i] && !this.bitmaps.has(i) && !this.decoding.has(i)) this.decode(i);
    }
  }

  private decode(i: number): void {
    this.decoding.add(i);
    createImageBitmap(this.blobs[i]!)
      .then((bmp) => {
        this.decoding.delete(i);
        if (!this.running || !this.decodeOn || (this.firstDrawn && !this.window.has(i))) {
          bmp.close();
        } else {
          this.bitmaps.set(i, bmp);
          this.requestDraw();
        }
        this.schedule();
      })
      .catch(() => {
        this.decoding.delete(i);
        this.blobs[i] = undefined;
      });
  }

  // ---------------------------------------------------------------- drawing

  private requestDraw(force = false): void {
    if (!this.running || (this.raf && !force)) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const has = (i: number) => this.bitmaps.has(i);
    const i0 = Math.floor(this.target);
    const i1 = Math.min(this.count - 1, i0 + 1);
    const t = this.target - i0;
    const blend = has(i0) && has(i1) && i1 !== i0 && t > 0.02;
    const primary = blend || has(i0) ? i0 : nearestAvailable(this.target, this.count, has);
    if (primary < 0) return;
    const { width: cw, height: ch } = this.canvas;
    const ctx = this.ctx;
    const bg = this.manifest.bg ?? { top: '#F7E6BD', bottom: '#D4914F' };
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, bg.top);
    grad.addColorStop(1, bg.bottom);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const a = this.bitmaps.get(primary)!;
    const r = fitRect(a.width, a.height, cw, ch);
    ctx.drawImage(a, r.x, r.y, r.w, r.h);
    if (blend) {
      ctx.globalAlpha = t;
      ctx.drawImage(this.bitmaps.get(i1)!, r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }
    this.shown = blend && t >= 0.5 ? i1 : primary;
    if (!this.firstDrawn) {
      this.firstDrawn = true;
      this.onFirstFrame();
    }
  }
}
