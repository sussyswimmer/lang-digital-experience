/**
 * Little DOM labels pinned to points on the hat ("Mo (tree bark)", ring numbers, "≈ 2 cm"…).
 * They follow the hat as it turns, hide when their spot faces away, and are tappable: a tap reads
 * the label aloud (every word a child can see can also be heard).
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
  /** where the label sits relative to its anchor */
  place?: 'above' | 'below' | 'left' | 'right' | 'center';
  onTap?: () => void;
}

export interface Label {
  el: HTMLElement;
  spec: LabelSpec;
  shown: boolean;
}

const CAM = new THREE.Vector3();

export class Labels {
  private items = new Set<Label>();

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
    this.overlay.appendChild(node);
    const label: Label = { el: node, spec, shown: false };
    this.items.add(label);
    this.place(label);
    // let the browser lay it out hidden, then fade in
    requestAnimationFrame(() => this.place(label));
    return label;
  }

  setText(label: Label, text: string): void {
    const t = label.el.querySelector('.hat-label__text');
    if (t) t.textContent = text;
  }

  remove(label: Label | null | undefined): void {
    if (!label) return;
    label.el.remove();
    this.items.delete(label);
  }

  clear(): void {
    for (const l of this.items) l.el.remove();
    this.items.clear();
  }

  update(): void {
    if (!this.items.size) return;
    const host = this.stage.host.getBoundingClientRect();
    for (const l of this.items) this.place(l, host);
  }

  private place(l: Label, host = this.stage.host.getBoundingClientRect()): void {
    const a = l.spec.anchor();
    let show = !!a;
    if (a) {
      const s = this.stage.toScreen(a);
      show = s.visible;
      const n = l.spec.facing?.();
      if (show && n) {
        CAM.copy(this.stage.camera.position).sub(a).normalize();
        show = n.dot(CAM) > 0.05;
      }
      if (show) {
        l.el.style.transform = `translate(${(s.x - host.left).toFixed(1)}px, ${(s.y - host.top).toFixed(1)}px)`;
      }
    }
    if (show !== l.shown) {
      l.shown = show;
      l.el.classList.toggle('is-shown', show);
    }
  }
}
