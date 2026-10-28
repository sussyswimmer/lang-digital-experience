/**
 * The colouring studio: one page of line art, a paint layer under it, and big friendly tools.
 *
 *  - paint canvas (1600×1200, CPU-backed) under the line canvas, so fill seams hide under lines;
 *  - `mirror` is the paint layer's pixels, kept in step with the canvas after every operation:
 *    the flood fill runs on it, undo patches are cut from it, and the test hook reads it;
 *  - every operation goes into History as before/after patches of its dirty rect;
 *  - the draft (paint only) autosaves 1 s after each change and comes back on reopen.
 */
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { ICONS } from '../../../ui/icons';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import type { AppContext } from '../../../app/context';
import { floodFill, hexToRGBA } from './floodFill';
import { History, applyPatch, clampRect, crop, type HistoryEntry, type Patch } from './history';
import { inkToRGBA, prepareLines, type PreparedLines } from './lineart';
import { BRUSH_SIZES, StrokeSmoother, drawSegments, type BrushSize, type Pt } from './brush';
import { DEFAULT_SWATCH, INK, PALETTE, type Swatch } from './palette';
import { loadPageImage, type ColourPage } from './pages';
import { canvasToBlob, composePicture, downloadBlob, pictureFilename } from './compose';
import { COLOUR_ICONS } from './icons';
import { getGallery, type GalleryStore } from '../gallery/galleryDb';

export const W = 1600;
export const H = 1200;
const FILL_TOLERANCE = 32;
/** px the fill reaches under the line, = gapClose + 1 (see lineart.ts) */
const EDGE_BLEED = 3;
const DRAFT_DELAY_MS = 1000;

type Tool = 'fill' | 'brush' | 'eraser';

interface Prepared {
  lines: PreparedLines;
  src: string;
}

const preparedCache = new Map<string, Promise<Prepared>>();

/** rasterise the page (PNG or SVG) at paint resolution and work out its ink and fill barrier */
function preparePage(page: ColourPage): Promise<Prepared> {
  let p = preparedCache.get(page.id);
  if (!p) {
    p = loadPageImage(page).then((img) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const data = g.getImageData(0, 0, W, H).data;
      return { lines: prepareLines(data, W, H), src: img.currentSrc || img.src };
    });
    p.catch(() => preparedCache.delete(page.id));
    preparedCache.set(page.id, p);
  }
  return p;
}

function isBlank(img: ImageData): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function blobToDrawable(blob: Blob): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export interface StudioHost {
  ctx: AppContext;
  alive(): boolean;
  /** the "Tranh của con" button the saved picture flies to */
  galleryButton(): HTMLElement | null;
  onSaved(count: number): void;
  onPages(): void;
}

export class Studio {
  readonly el: HTMLElement;
  private ctx: AppContext;
  private board: HTMLDivElement;
  private cell: HTMLDivElement;
  private paint: HTMLCanvasElement;
  private pg: CanvasRenderingContext2D;
  private lines: HTMLCanvasElement;
  private lg: CanvasRenderingContext2D;
  private mirror: ImageData;
  private barrier: Uint8Array | null = null;
  private history = new History();
  private page: ColourPage | null = null;
  private src = '';
  private store: GalleryStore | null = null;

  private tool: Tool = 'fill';
  private size: BrushSize = 'm';
  private swatch: Swatch = DEFAULT_SWATCH;
  private ready = false;
  private active = false;
  private openToken = 0;
  private ops = 0;
  private dirtySinceSave = false;
  private saving = false;
  private lastSaved: { png: Blob; at: number; pageId: string } | null = null;
  private draftTimer = 0;
  private draftDirty = false;
  private flushing: Promise<void> = Promise.resolve();
  private stroke: { id: number; smoother: StrokeSmoother; width: number } | null = null;
  private spread: { raf: number; finish: () => void } | null = null;
  private confirmOpen = false;

  private g = gsap.context(() => {});
  private cleanups: (() => void)[] = [];
  private toolBtns = {} as Record<Tool, HTMLButtonElement>;
  private sizeBtns = {} as Record<BrushSize, HTMLButtonElement>;
  private swatchBtns: HTMLButtonElement[] = [];
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private downloadBtn!: HTMLButtonElement;
  private loading!: HTMLDivElement;
  private loadingText!: HTMLParagraphElement;
  private loadingBack!: HTMLButtonElement;
  private cursor!: HTMLDivElement;
  private confirm!: HTMLDivElement;
  private confirmNo!: HTMLButtonElement;

  constructor(private host: StudioHost) {
    this.ctx = host.ctx;
    this.paint = el('canvas.cs-paint', { width: W, height: H });
    this.pg = this.paint.getContext('2d', { willReadFrequently: true })!;
    this.lines = el('canvas.cs-lines', { width: W, height: H });
    this.lg = this.lines.getContext('2d')!;
    this.mirror = this.pg.createImageData(W, H);
    this.cursor = el('div.cs-cursor', { 'aria-hidden': 'true' });
    this.buildLoading();
    this.board = el(
      'div.cs-board',
      { role: 'img', tabindex: '-1', 'data-test': 'board' },
      this.paint,
      this.lines,
      this.cursor,
      this.loading,
    );
    this.cell = el('div.cs-cell', {}, this.board);
    this.buildConfirm();
    this.el = el('div.cs', { hidden: true, 'data-test': 'studio' }, this.buildRail(), this.cell, this.buildSide(), this.confirm);
    this.setSwatch(DEFAULT_SWATCH, false);
    this.wire();
    this.refresh();
  }

  // ---------- building ----------

  private toolButton(cls: string, icon: string, labelId: string, onClick: () => void, test: string): HTMLButtonElement {
    return el(
      `button.cs-btn.${cls}` as 'button',
      { type: 'button', 'data-touch': '', 'data-test': test, onclick: onClick },
      svg(icon, 'cs-btn__icon'),
      i18n.bind(el('span.cs-btn__label'), labelId),
    );
  }

  private buildRail(): HTMLElement {
    const tools = i18n.bindAttr(el('div.cs-tools', { role: 'group' }), 'aria-label', 'colour.tools');
    for (const [tool, icon] of [
      ['fill', COLOUR_ICONS.fill],
      ['brush', COLOUR_ICONS.brush],
      ['eraser', COLOUR_ICONS.eraser],
    ] as const) {
      const b = this.toolButton('cs-tool', icon, `colour.tool.${tool}`, () => this.setTool(tool, true), `tool-${tool}`);
      this.toolBtns[tool] = b;
      tools.appendChild(b);
    }
    const sizes = i18n.bindAttr(el('div.cs-sizes', { role: 'group' }), 'aria-label', 'colour.size');
    for (const s of ['s', 'm', 'l'] as const) {
      const b = el(
        'button.cs-size',
        { type: 'button', 'data-touch': '', 'data-test': `size-${s}`, onclick: () => this.setSize(s) },
        el('span.cs-size__dot', { style: `--d:${Math.round(8 + (BRUSH_SIZES[s] / BRUSH_SIZES.l) * 26)}px` }),
        i18n.bind(el('span.cs-size__label'), `colour.size.${s}`),
      );
      this.sizeBtns[s] = b;
      sizes.appendChild(b);
    }
    this.saveBtn = el(
      'button.cs-save',
      { type: 'button', 'data-touch': '', 'data-test': 'save', onclick: () => void this.save() },
      svg(COLOUR_ICONS.save, 'cs-btn__icon'),
      i18n.bind(el('span.cs-btn__label'), 'colour.save'),
    );
    this.downloadBtn = el(
      'button.cs-btn.cs-download',
      { type: 'button', 'data-touch': '', 'data-test': 'download', hidden: true, onclick: () => this.downloadLast() },
      svg(COLOUR_ICONS.download, 'cs-btn__icon'),
      i18n.bind(el('span.cs-btn__label'), 'colour.download'),
    );
    return el('div.cs-rail', {}, tools, sizes, el('div.cs-grow'), this.saveBtn, this.downloadBtn);
  }

  private buildSide(): HTMLElement {
    this.undoBtn = this.toolButton('cs-act', COLOUR_ICONS.undo, 'colour.tool.undo', () => this.undo(), 'undo');
    this.redoBtn = this.toolButton('cs-act', COLOUR_ICONS.redo, 'colour.tool.redo', () => this.redo(), 'redo');
    this.clearBtn = this.toolButton('cs-act', COLOUR_ICONS.clear, 'colour.tool.clear', () => this.askClear(), 'clear');
    const acts = el('div.cs-acts', {}, this.undoBtn, this.redoBtn, this.clearBtn);
    const grid = i18n.bindAttr(el('div.cs-swatches', { role: 'group' }), 'aria-label', 'colour.palette');
    for (const s of PALETTE) {
      const b = el(
        'button.cs-swatch',
        {
          type: 'button',
          'data-touch': '',
          'data-test': `swatch-${s.id}`,
          'data-hex': s.hex,
          style: `--c:${s.hex}`,
          onclick: () => this.setSwatch(s, true),
        },
        el('span.cs-swatch__blob'),
        svg(ICONS.check, 'cs-swatch__tick'),
        i18n.bind(el('span.visually-hidden'), s.nameId),
      );
      if (s.strap) b.classList.add('cs-swatch--strap');
      if (s.id === 'white') b.classList.add('cs-swatch--light');
      this.swatchBtns.push(b);
      grid.appendChild(b);
    }
    const strapLabel = el('div.cs-straplabel', {}, svg(ICONS.hat, 'cs-straplabel__hat'), i18n.bind(el('span'), 'colour.strap-row'));
    return el('div.cs-side', {}, acts, el('div.cs-palette', {}, strapLabel, grid));
  }

  private buildLoading(): void {
    this.loadingText = i18n.bind(el('p.cs-loading__text'), 'colour.loading');
    this.loadingBack = el(
      'button.btn.btn--straw',
      { type: 'button', 'data-touch': '', hidden: true, onclick: () => this.host.onPages() },
      svg(COLOUR_ICONS.pages),
      i18n.bind(el('span'), 'colour.pages'),
    );
    this.loading = el('div.cs-loading', {}, el('div.cs-loading__hat', {}, svg(ICONS.hat)), this.loadingText, this.loadingBack);
  }

  private buildConfirm(): void {
    const yes = el(
      'button.btn.cs-confirm__yes',
      { type: 'button', 'data-touch': '', 'data-test': 'clear-yes', onclick: () => this.closeConfirm(true) },
      svg(COLOUR_ICONS.trash),
      i18n.bind(el('span'), 'colour.clear.yes'),
    );
    this.confirmNo = el(
      'button.btn.btn--straw',
      { type: 'button', 'data-touch': '', 'data-test': 'clear-no', onclick: () => this.closeConfirm(false) },
      svg(COLOUR_ICONS.keep),
      i18n.bind(el('span'), 'colour.clear.no'),
    );
    const card = el(
      'div.cs-confirm__card',
      { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'cs-confirm-q' },
      svg(COLOUR_ICONS.clear, 'cs-confirm__icon'),
      i18n.bind(el('p#cs-confirm-q.cs-confirm__q'), 'colour.clear.ask'),
      el('div.cs-confirm__btns', {}, this.confirmNo, yes),
    );
    this.confirm = el('div.cs-confirm', { hidden: true }, card);
  }

  private wire(): void {
    const b = this.board;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(b, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(b, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(b, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(b, 'pointercancel', (e: PointerEvent) => this.onUp(e));
    on(b, 'pointerleave', () => this.cursor.classList.remove('is-on'));
    on(b, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e));
    const ro = new ResizeObserver(() => this.fit());
    ro.observe(this.cell);
    this.cleanups.push(() => ro.disconnect());
    this.cleanups.push(i18n.onChange(() => this.label()));
  }

  /** keep the board 4:3 and as large as its cell allows */
  private fit(): void {
    const r = this.cell.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.floor(Math.min(r.width, (r.height * W) / H));
    this.board.style.width = `${w}px`;
    this.board.style.height = `${Math.floor((w * H) / W)}px`;
  }

  private label(): void {
    if (this.page) this.board.setAttribute('aria-label', i18n.t('colour.canvas', { page: i18n.t(this.page.nameId) }));
  }

  // ---------- page lifecycle ----------

  get pageId(): string | null {
    return this.page?.id ?? null;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** resolves once pending draft writes have landed */
  settled(): Promise<void> {
    return this.flushing;
  }

  async open(page: ColourPage): Promise<void> {
    this.active = true;
    this.el.hidden = false;
    this.fit();
    if (this.page?.id === page.id && this.ready) {
      this.greet();
      return;
    }
    const token = ++this.openToken;
    if (this.page) this.flushDraft();
    this.cancelStroke();
    this.finishSpread();
    this.page = page;
    this.ready = false;
    this.barrier = null;
    this.history.reset();
    this.ops = 0;
    this.dirtySinceSave = false;
    this.lastSaved = null;
    this.downloadBtn.hidden = true;
    this.pg.clearRect(0, 0, W, H);
    this.lg.clearRect(0, 0, W, H);
    this.mirror.data.fill(0);
    this.label();
    this.showLoading('loading');
    this.refresh();
    this.ctx.idle.clear();
    try {
      const [prep, store] = await Promise.all([preparePage(page), getGallery()]);
      await this.flushing;
      if (token !== this.openToken || !this.host.alive()) return;
      this.store = store;
      this.src = prep.src;
      this.barrier = prep.lines.barrier;
      const lineImg = this.lg.createImageData(W, H);
      inkToRGBA(prep.lines.ink, INK, lineImg.data);
      this.lg.putImageData(lineImg, 0, 0);
      const draft = await store.loadDraft(page.id).catch(() => undefined);
      if (token !== this.openToken || !this.host.alive()) return;
      if (draft && draft.src === prep.src) {
        try {
          const pic = await blobToDrawable(draft.paint);
          if (token !== this.openToken || !this.host.alive()) return;
          this.pg.drawImage(pic, 0, 0, W, H);
          (pic as ImageBitmap).close?.();
        } catch {
          /* an unreadable draft just means a fresh page */
        }
      }
      this.mirror = this.pg.getImageData(0, 0, W, H);
      this.ready = true;
      this.showLoading(null);
      this.refresh();
      this.greet();
      this.board.focus({ preventScroll: true });
    } catch {
      if (token !== this.openToken || !this.host.alive()) return;
      this.showLoading('error');
      void this.ctx.narration.say('colour.load-error');
    }
  }

  /** say the page's name, then how to use the current tool */
  private greet(): void {
    const page = this.page;
    if (!page) return;
    this.watchIdle();
    void this.ctx.narration.say(page.nameId).then((r) => {
      if (r === 'ended' && this.active && this.page === page && this.host.alive()) void this.ctx.narration.say(`colour.tip.${this.tool}`);
    });
  }

  /** leaving for the page picker: keep the page loaded, save the draft */
  hide(): void {
    this.active = false;
    this.cancelStroke();
    this.finishSpread();
    if (this.confirmOpen) this.closeConfirm(false, true);
    this.flushDraft();
    this.el.hidden = true;
  }

  dispose(): void {
    this.active = false;
    this.cancelStroke();
    this.finishSpread();
    this.flushDraft();
    window.clearTimeout(this.draftTimer);
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
  }

  private showLoading(state: 'loading' | 'error' | null): void {
    this.loading.hidden = state === null;
    this.loading.classList.toggle('is-error', state === 'error');
    i18n.bind(this.loadingText, state === 'error' ? 'colour.load-error' : 'colour.loading');
    this.loadingBack.hidden = state !== 'error';
  }

  // ---------- tools ----------

  private setTool(tool: Tool, speak: boolean): void {
    this.tool = tool;
    this.ctx.audio.sfx.play('tap');
    this.refresh();
    if (speak) void this.ctx.narration.say(`colour.tip.${tool}`);
    this.watchIdle();
  }

  private setSize(s: BrushSize): void {
    this.size = s;
    this.ctx.audio.sfx.play('tap', { step: s === 's' ? 0 : s === 'm' ? 2 : 4 });
    if (this.tool === 'fill') this.tool = 'brush';
    this.refresh();
    this.watchIdle();
  }

  private setSwatch(s: Swatch, speak: boolean): void {
    this.swatch = s;
    this.el.style.setProperty('--swatch', s.hex);
    this.swatchBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hex === s.hex)));
    if (!speak) return;
    this.ctx.audio.sfx.play('tap');
    // picking a colour while rubbing out means "paint with this"
    if (this.tool === 'eraser') this.tool = 'brush';
    this.refresh();
    void this.ctx.narration.say(s.nameId);
  }

  private refresh(): void {
    for (const [t, b] of Object.entries(this.toolBtns)) b.setAttribute('aria-pressed', String(t === this.tool));
    for (const [s, b] of Object.entries(this.sizeBtns)) {
      b.setAttribute('aria-pressed', String(s === this.size));
      b.classList.toggle('is-muted', this.tool === 'fill');
    }
    this.el.dataset.tool = this.tool;
    this.undoBtn.disabled = !this.ready || !this.history.canUndo;
    this.redoBtn.disabled = !this.ready || !this.history.canRedo;
    this.clearBtn.disabled = !this.ready;
    this.saveBtn.disabled = !this.ready;
    this.saveBtn.classList.toggle('is-ready', this.ready && this.ops >= 3 && this.dirtySinceSave && !motion.reduced);
    this.saveBtn.classList.toggle('is-saved', this.ready && !this.dirtySinceSave && this.lastSaved !== null);
  }

  // ---------- pointer input ----------

  private toCanvas(e: { clientX: number; clientY: number }): Pt {
    const r = this.paint.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  private onDown(e: PointerEvent): void {
    if (!this.ready || this.confirmOpen || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = this.toCanvas(e);
    if (this.tool === 'fill') {
      this.fillAt(p.x, p.y, this.swatch.hex, true);
      return;
    }
    this.finishSpread();
    try {
      this.board.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    const width = BRUSH_SIZES[this.size];
    const smoother = new StrokeSmoother(1.5);
    this.stroke = { id: e.pointerId, smoother, width };
    const g = this.pg;
    g.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
    g.strokeStyle = g.fillStyle = this.tool === 'eraser' ? '#000' : this.swatch.hex;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    drawSegments(g, smoother.add(p), width);
  }

  private onMove(e: PointerEvent): void {
    this.moveCursor(e);
    const s = this.stroke;
    if (!s || e.pointerId !== s.id) return;
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of coalesced.length ? coalesced : [e]) drawSegments(this.pg, s.smoother.add(this.toCanvas(ev)), s.width);
  }

  private onUp(e: PointerEvent): void {
    const s = this.stroke;
    if (!s || e.pointerId !== s.id) return;
    drawSegments(this.pg, s.smoother.end(), s.width);
    this.endStroke();
  }

  private endStroke(): void {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.pg.globalCompositeOperation = 'source-over';
    const r = s.smoother.rect(s.width / 2 + 2);
    const rect = r && clampRect(r, W, H);
    if (!rect) return;
    const before = crop(this.mirror, rect);
    const after: Patch = { ...rect, data: this.pg.getImageData(rect.x, rect.y, rect.w, rect.h).data };
    if (samePixels(before.data, after.data)) return;
    applyPatch(this.mirror, after);
    this.commit({ before, after });
  }

  private cancelStroke(): void {
    if (this.stroke) this.endStroke();
  }

  private moveCursor(e: PointerEvent): void {
    const show = e.pointerType === 'mouse' && this.ready && this.tool !== 'fill';
    this.cursor.classList.toggle('is-on', show);
    if (!show) return;
    const r = this.board.getBoundingClientRect();
    const d = (BRUSH_SIZES[this.size] * r.width) / W;
    this.cursor.style.width = this.cursor.style.height = `${d}px`;
    this.cursor.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || !this.ready || this.confirmOpen) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) this.undo();
    else if ((k === 'z' && e.shiftKey) || k === 'y') this.redo();
    else return;
    e.preventDefault();
  }

  // ---------- operations ----------

  /** one-tap fill at canvas px; returns false when nothing changed (a line, or the same colour) */
  fillAt(x: number, y: number, hex: string, animate: boolean): boolean {
    if (!this.ready || !this.barrier) return false;
    this.finishSpread();
    let before: Patch | null = null;
    const rect = floodFill(this.mirror, this.barrier, x, y, hexToRGBA(hex), {
      tolerance: FILL_TOLERANCE,
      edgeBleed: EDGE_BLEED,
      beforeWrite: (r) => (before = crop(this.mirror, r)),
    });
    if (!rect || !before) return false;
    const after = crop(this.mirror, rect);
    this.ctx.audio.sfx.play('fillPop');
    if (animate && !motion.reduced) this.spreadFill(x, y, before, after, hex);
    else this.pg.putImageData(this.mirror, 0, 0, rect.x, rect.y, rect.w, rect.h);
    this.commit({ before, after });
    return true;
  }

  /** the new colour grows outwards from the finger like spilled paint, then snaps exact */
  private spreadFill(x: number, y: number, before: Patch, after: Patch, hex: string): void {
    const overlay = document.createElement('canvas');
    overlay.width = after.w;
    overlay.height = after.h;
    const og = overlay.getContext('2d')!;
    const img = og.createImageData(after.w, after.h);
    const a = after.data;
    const b = before.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
        img.data[i] = a[i];
        img.data[i + 1] = a[i + 1];
        img.data[i + 2] = a[i + 2];
        img.data[i + 3] = a[i + 3];
      }
    }
    og.putImageData(img, 0, 0);
    const far = Math.max(
      Math.hypot(x - after.x, y - after.y),
      Math.hypot(x - (after.x + after.w), y - after.y),
      Math.hypot(x - after.x, y - (after.y + after.h)),
      Math.hypot(x - (after.x + after.w), y - (after.y + after.h)),
    );
    const ms = Math.min(600, 220 + far / 4);
    const t0 = performance.now();
    const finish = () => {
      if (!this.spread) return;
      cancelAnimationFrame(this.spread.raf);
      this.spread = null;
      this.pg.putImageData(this.mirror, 0, 0, after.x, after.y, after.w, after.h);
    };
    // a circle filled with the new paint as a pattern: no clip state to leak between frames
    const pattern = this.pg.createPattern(overlay, 'no-repeat');
    pattern?.setTransform(new DOMMatrix().translateSelf(after.x, after.y));
    const frame = (now: number) => {
      // rAF timestamps are frame starts and can be a little earlier than t0
      const t = Math.min(1, Math.max(0, (now - t0) / ms));
      const r = far * (1 - Math.pow(1 - t, 3)) + 2;
      const g = this.pg;
      if (pattern) {
        g.save();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = pattern;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      if (t >= 1 || !pattern) finish();
      else if (this.spread) this.spread.raf = requestAnimationFrame(frame);
    };
    this.spread = { raf: requestAnimationFrame(frame), finish };
    this.ripple(x, y, hex);
  }

  private finishSpread(): void {
    this.spread?.finish();
  }

  private ripple(x: number, y: number, hex: string): void {
    const r = this.board.getBoundingClientRect();
    if (!r.width) return;
    const dot = el('div.cs-ripple', { style: `left:${(x / W) * r.width}px;top:${(y / H) * r.height}px;border-color:${hex}` });
    this.board.appendChild(dot);
    this.g.add(() => {
      gsap.fromTo(dot, { scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => dot.remove() });
    });
  }

  private commit(entry: HistoryEntry): void {
    this.history.push(entry);
    this.ops++;
    this.dirtySinceSave = true;
    this.scheduleDraft();
    this.refresh();
    this.watchIdle();
  }

  undo(): void {
    if (!this.ready) return;
    this.cancelStroke();
    this.finishSpread();
    const p = this.history.undo();
    if (!p) return;
    this.applyToCanvas(p);
    this.ctx.audio.sfx.play('swish');
  }

  redo(): void {
    if (!this.ready) return;
    this.finishSpread();
    const p = this.history.redo();
    if (!p) return;
    this.applyToCanvas(p);
    this.ctx.audio.sfx.play('swish');
  }

  private applyToCanvas(p: Patch): void {
    applyPatch(this.mirror, p);
    this.pg.putImageData(this.mirror, 0, 0, p.x, p.y, p.w, p.h);
    this.dirtySinceSave = true;
    this.scheduleDraft();
    this.refresh();
  }

  private askClear(): void {
    if (!this.ready) return;
    this.ctx.audio.sfx.play('tap');
    this.confirmOpen = true;
    this.confirm.hidden = false;
    if (!motion.reduced) this.g.add(() => gsap.fromTo(this.confirm.firstElementChild, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' }));
    this.confirmNo.focus({ preventScroll: true });
    void this.ctx.narration.say('colour.clear.ask');
    this.ctx.idle.watch({ stepId: 'colour.clear', gesture: 'tap', target: () => this.confirmNo.getBoundingClientRect() });
  }

  private closeConfirm(clear: boolean, silent = false): void {
    if (!this.confirmOpen) return;
    this.confirmOpen = false;
    this.confirm.hidden = true;
    this.ctx.narration.stop();
    if (clear) this.clearAll();
    else if (!silent) this.ctx.audio.sfx.play('tap');
    this.watchIdle();
  }

  private clearAll(): void {
    this.finishSpread();
    const all = { x: 0, y: 0, w: W, h: H };
    const before = crop(this.mirror, all);
    if (isBlank(this.mirror)) return;
    this.mirror.data.fill(0);
    this.pg.clearRect(0, 0, W, H);
    this.ctx.audio.sfx.play('whoosh');
    this.commit({ before, after: crop(this.mirror, all) });
  }

  // ---------- saving ----------

  async save(): Promise<boolean> {
    if (!this.ready || !this.page || this.saving) return false;
    this.cancelStroke();
    this.finishSpread();
    if (isBlank(this.mirror)) {
      void this.ctx.narration.say('colour.save-empty');
      if (!motion.reduced) this.g.add(() => gsap.fromTo(this.board, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }));
      return false;
    }
    if (!this.dirtySinceSave && this.lastSaved) {
      void this.ctx.narration.say('colour.saved');
      this.bounceGallery();
      return false;
    }
    this.saving = true;
    this.saveBtn.classList.add('is-busy');
    const page = this.page;
    try {
      const { png, thumb } = await composePicture(this.paint, this.lines);
      const store = this.store ?? (await getGallery());
      await store.add({ pageId: page.id, png, thumb, lang: i18n.lang });
      this.ctx.progress.set((p) => ({ ...p, games: { ...p.games, colour: { saved: p.games.colour.saved + 1 } } }));
      this.dirtySinceSave = false;
      this.lastSaved = { png, at: Date.now(), pageId: page.id };
      this.flushDraft();
      if (!this.host.alive()) return true;
      this.ctx.audio.sfx.play('badge');
      this.flyToGallery(thumb);
      const told = this.ctx.narration.say('colour.saved');
      if (!store.persistent) {
        this.downloadBtn.hidden = false;
        this.ctx.toast(i18n.t('colour.session'), 6000);
        void told.then((r) => {
          if (r === 'ended' && this.active && this.host.alive()) void this.ctx.narration.say('colour.session');
        });
      }
      this.host.onSaved(await store.count());
      return true;
    } catch {
      void this.ctx.narration.say('colour.save-failed');
      return false;
    } finally {
      this.saving = false;
      this.saveBtn.classList.remove('is-busy');
      this.refresh();
      this.watchIdle();
    }
  }

  private downloadLast(): void {
    if (!this.lastSaved) return;
    this.ctx.audio.sfx.play('tap');
    downloadBlob(this.lastSaved.png, pictureFilename(this.lastSaved.pageId, this.lastSaved.at));
  }

  private flyToGallery(thumb: Blob): void {
    const target = this.host.galleryButton();
    if (!target || motion.reduced) {
      this.bounceGallery();
      return;
    }
    const from = this.board.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const url = URL.createObjectURL(thumb);
    const pic = el('img.cs-fly', { src: url, alt: '' });
    Object.assign(pic.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(pic);
    const done = () => {
      pic.remove();
      URL.revokeObjectURL(url);
    };
    this.cleanups.push(done);
    this.g.add(() => {
      gsap
        .timeline({ onComplete: done })
        .to(pic, { scale: 1.04, duration: 0.18, ease: 'power1.out' })
        .to(pic, {
          x: to.left + to.width / 2 - (from.left + from.width / 2),
          y: to.top + to.height / 2 - (from.top + from.height / 2),
          scale: Math.max(0.06, to.height / from.height),
          rotation: -8,
          duration: 0.7,
          ease: 'power2.in',
        })
        .add(() => this.bounceGallery());
    });
  }

  private bounceGallery(): void {
    const target = this.host.galleryButton();
    if (!target) return;
    if (motion.reduced) return;
    this.g.add(() => gsap.fromTo(target, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
  }

  // ---------- drafts ----------

  private scheduleDraft(): void {
    this.draftDirty = true;
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => this.flushDraft(), DRAFT_DELAY_MS);
  }

  /** write the draft now; the canvas is snapshotted synchronously so a page switch can follow */
  private flushDraft(): void {
    window.clearTimeout(this.draftTimer);
    if (!this.draftDirty || !this.page || !this.ready) return;
    this.draftDirty = false;
    const pageId = this.page.id;
    const src = this.src;
    const blank = isBlank(this.mirror);
    const blob = blank ? null : canvasToBlob(this.paint, 'image/png');
    const prev = this.flushing;
    this.flushing = (async () => {
      await prev;
      const store = this.store ?? (await getGallery());
      if (!blob) await store.deleteDraft(pageId);
      else await store.saveDraft({ pageId, updatedAt: Date.now(), paint: await blob, src });
    })().catch(() => {
      /* a lost draft is not worth interrupting the child */
    });
  }

  // ---------- idle hints ----------

  private hintPoint(): { x: number; y: number } | null {
    const page = this.page;
    if (!page || !this.active) return null;
    const r = this.board.getBoundingClientRect();
    return { x: r.left + page.hint.x * r.width, y: r.top + page.hint.y * r.height };
  }

  private watchIdle(): void {
    if (!this.active || !this.ready || this.confirmOpen) return;
    const idle = this.ctx.idle;
    if (this.ops >= 3 && this.dirtySinceSave) {
      idle.watch({ stepId: 'colour.save', gesture: 'tap', target: () => this.saveBtn.getBoundingClientRect() });
    } else if (this.ops >= 3 && this.lastSaved) {
      idle.watch({ stepId: 'colour.gallery', gesture: 'tap', target: () => this.host.galleryButton()?.getBoundingClientRect() ?? null });
    } else if (this.tool === 'fill') {
      idle.watch({ stepId: 'colour.fill', gesture: 'tap', target: () => this.hintPoint() });
    } else {
      idle.watch({
        stepId: 'colour.paint',
        gesture: 'drag',
        target: () => this.hintPoint(),
        path: () => {
          const p = this.hintPoint();
          if (!p) return [];
          const s = this.board.getBoundingClientRect().width * 0.08;
          return [
            { x: p.x + s, y: p.y - s * 0.4 },
            { x: p.x + s * 2, y: p.y + s * 0.3 },
            { x: p.x + s * 3, y: p.y - s * 0.2 },
          ];
        },
      });
    }
  }

  // ---------- test hooks ----------

  testHooks(): Record<string, unknown> {
    return {
      pixel: (x: number, y: number) => {
        const o = (Math.floor(y) * W + Math.floor(x)) * 4;
        return Array.from(this.mirror.data.subarray(o, o + 4));
      },
      fillAt: (x: number, y: number, hex: string, animate = false) => this.fillAt(x, y, hex, animate),
      undo: () => this.undo(),
      redo: () => this.redo(),
      saveCount: async () => (await getGallery()).count(),
      save: () => this.save(),
      ready: () => this.ready,
      page: () => this.page?.id ?? null,
      tool: () => this.tool,
      swatch: () => this.swatch.hex,
      barrier: (x: number, y: number) => this.barrier?.[Math.floor(y) * W + Math.floor(x)] ?? null,
      source: () => this.src,
      history: () => ({ undo: this.history.canUndo, redo: this.history.canRedo, length: this.history.length }),
      /** canvas px → viewport px, for driving real pointer input */
      toScreen: (x: number, y: number) => {
        const r = this.paint.getBoundingClientRect();
        return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height };
      },
      persistent: async () => (await getGallery()).persistent,
      /** pixels where what's on screen differs from the paint model (should be 0 once animations end) */
      mismatch: () => {
        const shown = this.pg.getImageData(0, 0, W, H).data;
        const model = this.mirror.data;
        let n = 0;
        for (let i = 0; i < shown.length; i += 4) {
          if (Math.abs(shown[i + 3] - model[i + 3]) > 2 || (model[i + 3] > 0 && Math.abs(shown[i] - model[i]) > 2)) n++;
        }
        return n;
      },
    };
  }
}
