/** Small building blocks shared by the Phase 4 screens. */
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import type { AppContext } from '../../../app/context';

/** a button that pairs a picture/icon with its (bound, translatable) text */
export function labelButton(
  tag: `button.${string}`,
  icon: string,
  textId: string,
  onClick: () => void,
  attrs: Record<string, unknown> = {},
): HTMLButtonElement {
  return el(
    tag as 'button',
    { type: 'button', 'data-touch': '', onclick: onClick, ...attrs },
    svg(icon, 'p4-icon'),
    i18n.bind(el('span.p4-btn__text'), textId),
  );
}

/** the shared 3D hat isn't used in Phase 4: make sure it isn't left running underneath */
export function quietViewer(ctx: AppContext): void {
  if (!ctx.layers.stage.querySelector('canvas')) return;
  void ctx.viewer().then((v) => v.hide({ fade: 0 }));
}

/** register (and later remove) a test hook under window.__nonla.<name> */
export function testHook(ctx: AppContext, name: string, api: Record<string, unknown>): () => void {
  if (!ctx.flags.test) return () => {};
  const w = window as unknown as { __nonla?: Record<string, unknown> };
  w.__nonla = { ...(w.__nonla ?? {}), [name]: api };
  return () => {
    if (w.__nonla?.[name] === api) delete w.__nonla[name];
  };
}

export function rectOf(node: Element): DOMRect | null {
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

export function centreOf(node: Element): { x: number; y: number } {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const REST: Record<string, number> = { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 };

/**
 * An entrance tween with explicit end values. (gsap.from() reads the end state lazily, which
 * goes wrong when the element is mid-way through a CSS transition or another tween.)
 */
export function enter(targets: gsap.TweenTarget, from: Record<string, number>, vars: gsap.TweenVars = {}): gsap.core.Tween {
  const to: gsap.TweenVars = { ...vars };
  for (const k of Object.keys(from)) to[k] = REST[k] ?? 0;
  return gsap.fromTo(targets, from, to);
}
