/**
 * Little DOM labels pinned to points on the hat ("Lá mo", "About 2 cm between rings"…).
 * They follow the hat as it turns, hide when their spot faces away, and are tappable: a tap reads
 * the label aloud (every word a child can see can also be heard).
 *
 * Nothing covers the picture: a label never sits on the hat itself. When its box would land on the
 * hat's outline (Labels.outline, the cone as the child sees it), it moves out beside the hat at the
 * same height and a short thread runs back to its spot. Labels never overlap each other, and they
 * stay clear of the top bar and of the caption strip at the bottom.
 */
import * as THREE from 'three';
import { el } from '../ui/el';
import { i18n } from '../i18n/i18n';
import type { Stage } from './scene';

export type LabelKind = 'chip' | 'num' | 'callout' | 'pop';
export type LabelTone = 'white' | 'red' | 'gold' | 'green' | 'bark' | 'strap';

export interface LabelSpec {
  /** i18n string id (or literal text when `text` is set) */
  id?: string;
  text?: string;
  vars?: Record<string, string | number>;
  /** world-space anchor; null hides the label */
  anchor: () => THREE.Vector3 | null;
  /** world-space outward normal at the anchor: hide when it faces away from the camera */
  facing?: () => THREE.Vector3 | null;
  kind?: LabelKind;
  tone?: LabelTone;
  /** where the label sits relative to its anchor (it still moves off the hat if that lands on it) */
  place?: 'above' | 'below' | 'left' | 'right' | 'center';
  onTap?: () => void;
}

export interface Label {
  el: HTMLElement;
  spec: LabelSpec;
  shown: boolean;
  /** the thread from a label moved beside the hat back to its spot */
  leader: HTMLElement;
}

export interface ScreenXY {
  x: number;
  y: number;
}

/** the hat's silhouette on screen (viewport px): the tip and the brim's widest points */
export interface HatOutline {
  apex: ScreenXY;
  left: ScreenXY;
  right: ScreenXY;
  /** the lowest point of the brim */
  bottom: number;
}

/** the band at the top (top bar, question, stamps) and at the bottom (caption strip) labels keep clear of */
const TOP_BAND = 92;
const CAPTION_BAND = 112;
const GAP = 14;
const PAD = 8;

const CAM = new THREE.Vector3();

interface Box {
  l: Label;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  side: -1 | 0 | 1;
}

/** left and right edge of the outline at screen height y (null where the hat isn't) */
export function outlineAt(o: HatOutline, y: number): { left: number; right: number } | null {
  if (y < o.apex.y || y > o.bottom) return null;
  const edge = (p: ScreenXY) => {
    if (y >= p.y || p.y <= o.apex.y) return p.x;
    const t = (y - o.apex.y) / (p.y - o.apex.y);
    return o.apex.x + (p.x - o.apex.x) * t;
  };
  return { left: edge(o.left), right: edge(o.right) };
}

/** does a box overlap the hat? returns the hat's widest left/right across the box's height */
export function overlapsOutline(o: HatOutline, b: { x: number; y: number; w: number; h: number }): { left: number; right: number } | null {
  let left = Infinity;
  let right = -Infinity;
  for (let k = 0; k <= 4; k++) {
    const e = outlineAt(o, b.y + (b.h * k) / 4);
    if (!e) continue;
    left = Math.min(left, e.left);
    right = Math.max(right, e.right);
  }
  if (left === Infinity) return null;
  return b.x + b.w > left + 2 && b.x < right - 2 ? { left, right } : null;
}

/** push boxes apart vertically (top to bottom), keeping them inside [minY, maxY] */
export function separate(boxes: { x: number; y: number; w: number; h: number }[], minY: number, maxY: number): void {
  for (let pass = 0; pass < 4; pass++) {
    boxes.sort((a, b) => a.y - b.y);
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const xOver = a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6;
        const yOver = b.y < a.y + a.h + 6;
        if (!xOver || !yOver) continue;
        const down = a.y + a.h + 6;
        if (down + b.h <= maxY) b.y = down;
        else a.y = Math.max(minY, b.y - a.h - 6);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export class Labels {
  private items = new Set<Label>();
  /** the hat's outline on screen right now (set by the rig); without it labels sit where they are told */
  outline: (() => HatOutline | null) | null = null;
  /** where labels may sit (viewport px), e.g. not under an open card; null = the whole stage */
  area: { x: number; y: number; width: number; height: number } | null = null;
  /** buttons labels must keep off (viewport px), e.g. Skip */
  avoid: { x: number; y: number; width: number; height: number }[] = [];

  constructor(
    private overlay: HTMLElement,
    private stage: Stage,
  ) {}

  add(spec: LabelSpec): Label {
    const kind = spec.kind ?? 'chip';
    const tag = spec.onTap ? 'button' : 'div';
    const node = el(tag as 'div', {
      class: `hat-label hat-label--${kind} hat-label--${spec.place ?? 'above'}${spec.tone ? ` hat-label--${spec.tone}` : ''}`,
      ...(spec.onTap ? { type: 'button', 'data-touch': '' } : {}),
    });
    if (kind === 'chip' || kind === 'callout') node.appendChild(el('span.hat-label__dot', { 'aria-hidden': 'true' }));
    const text = el('span.hat-label__text');
    if (spec.text !== undefined) text.textContent = spec.text;
    else if (spec.id) i18n.bind(text, spec.id, spec.vars);
    node.appendChild(text);
    if (spec.onTap) {
      const tap = spec.onTap;
      node.addEventListener('pointerdown', (e) => e.stopPropagation());
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        tap();
      });
    }
    const leader = el('div.hat-leader', { 'aria-hidden': 'true' });
    this.overlay.append(leader, node);
    const label: Label = { el: node, spec, shown: false, leader };
    this.items.add(label);
    this.update();
    // let the browser lay it out hidden, then fade in
    requestAnimationFrame(() => this.update());
    return label;
  }

  setText(label: Label, text: string): void {
    const t = label.el.querySelector('.hat-label__text');
    if (t) t.textContent = text;
  }

  remove(label: Label | null | undefined): void {
    if (!label) return;
    label.el.remove();
    label.leader.remove();
    this.items.delete(label);
  }

  clear(): void {
    for (const l of this.items) {
      l.el.remove();
      l.leader.remove();
    }
    this.items.clear();
  }

  update(): void {
    if (!this.items.size) return;
    const host = this.stage.host.getBoundingClientRect();
    const outline = this.outline?.() ?? null;
    // the caption strip: whichever is higher, the band every screen keeps or the strip itself
    const cap = document.querySelector<HTMLElement>('#captions .caption.is-on')?.getBoundingClientRect();
    const bottomBand = Math.max(host.height < 600 ? 96 : CAPTION_BAND, cap ? host.bottom - cap.top + PAD : 0);
    const minY = Math.max(Math.min(TOP_BAND, host.height * 0.2), this.area ? this.area.y - host.top : 0);
    const maxY = Math.min(host.height - bottomBand, this.area ? this.area.y + this.area.height - host.top : Infinity);
    const minX = this.area ? Math.max(0, this.area.x - host.left) : 0;
    const maxX = this.area ? Math.min(host.width, this.area.x + this.area.width - host.left) : host.width;
    const boxes: Box[] = [];
    for (const l of this.items) {
      const b = this.place(l, host, outline, minY, maxY, minX, maxX);
      if (b) boxes.push(b);
    }
    // pop-ups ("Whoosh!") are short-lived and centred: only tags are kept apart
    const tags = boxes.filter((b) => (b.l.spec.kind ?? 'chip') !== 'pop');
    separate(tags, minY, maxY);
    for (const b of boxes) this.apply(b, host);
  }

  private place(l: Label, host: DOMRect, outline: HatOutline | null, minY: number, maxY: number, minX: number, maxX: number): Box | null {
    const a = l.spec.anchor();
    let show = !!a;
    let box: Box | null = null;
    if (a) {
      const s = this.stage.toScreen(a);
      show = s.visible;
      const n = l.spec.facing?.();
      if (show && n) {
        CAM.copy(this.stage.camera.position).sub(a).normalize();
        show = n.dot(CAM) > 0.05;
      }
      if (show) {
        const w = l.el.offsetWidth;
        const h = l.el.offsetHeight;
        const ax = s.x - host.left;
        const ay = s.y - host.top;
        let x = ax;
        let y = ay;
        switch (l.spec.place ?? 'above') {
          case 'above': x -= w / 2; y -= h + GAP; break;
          case 'below': x -= w / 2; y += GAP; break;
          case 'left': x -= w + GAP; y -= h / 2; break;
          case 'right': x += GAP; y -= h / 2; break;
          default: x -= w / 2; y -= h / 2;
        }
        let side: -1 | 0 | 1 = 0;
        const kind = l.spec.kind ?? 'chip';
        if (outline && kind !== 'pop') {
          const o = this.local(outline, host);
          y = clamp(y, minY, maxY - h);
          const hit = overlapsOutline(o, { x, y, w, h });
          if (hit) {
            // out beside the hat at the same height, on the side the spot is on (or the side asked for)
            const asked = l.spec.place === 'left' ? -1 : l.spec.place === 'right' ? 1 : 0;
            side = asked || (ax < o.apex.x ? -1 : 1);
            if (side < 0 && hit.left - GAP - w < minX + PAD) side = 1;
            else if (side > 0 && hit.right + GAP + w > maxX - PAD) side = -1;
            x = side < 0 ? hit.left - GAP - w : hit.right + GAP;
            y = clamp(ay - h / 2, minY, maxY - h);
          }
        }
        x = clamp(x, minX + PAD, Math.max(minX + PAD, maxX - w - PAD));
        y = clamp(y, minY, Math.max(minY, maxY - h));
        // off any button the screen keeps clear (lift it above, or tuck it beside, whichever is closer)
        for (const r of this.avoid) {
          const rx = r.x - host.left;
          const ry = r.y - host.top;
          if (x < rx + r.width + 6 && x + w > rx - 6 && y < ry + r.height + 6 && y + h > ry - 6) {
            const up = ry - h - 8;
            const left = rx - w - 8;
            if (up >= minY && ry - up <= x + w - left) y = up;
            else x = Math.max(minX + PAD, left);
          }
        }
        box = { l, x, y, w, h, ax, ay, side };
      }
    }
    if (show !== l.shown) {
      l.shown = show;
      l.el.classList.toggle('is-shown', show);
    }
    if (!show) l.leader.classList.remove('is-shown');
    return box;
  }

  private apply(b: Box, _host: DOMRect): void {
    b.l.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
    // the thread: from the label's inner edge back to its spot on the hat
    const fromX = b.side < 0 ? b.x + b.w : b.side > 0 ? b.x : b.x + b.w / 2;
    const fromY = b.y + b.h / 2;
    const dx = b.ax - fromX;
    const dy = b.ay - fromY;
    const len = Math.hypot(dx, dy);
    const show = b.side !== 0 && len > 18;
    b.l.leader.classList.toggle('is-shown', show);
    if (show) {
      b.l.leader.style.width = `${len.toFixed(1)}px`;
      b.l.leader.style.transform = `translate(${fromX.toFixed(1)}px, ${fromY.toFixed(1)}px) rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    }
  }

  private local(o: HatOutline, host: DOMRect): HatOutline {
    const p = (q: ScreenXY) => ({ x: q.x - host.left, y: q.y - host.top });
    return { apex: p(o.apex), left: p(o.left), right: p(o.right), bottom: o.bottom - host.top };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
