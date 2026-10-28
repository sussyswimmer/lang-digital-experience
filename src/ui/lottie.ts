/**
 * One-shot Lottie bursts exported from EffectCraft (public/assets/lottie): badge-pop when a
 * badge lands, tap-ripple under the idle hand, sparkle when a picture is saved. They are
 * decoration only: the light SVG player loads on first use, nothing plays under reduced
 * motion, and a failed load leaves the screen exactly as it was.
 */
import type { AnimationItem } from 'lottie-web';
import { motion } from '../a11y/motion';
import { assetUrl } from '../assets/manifest';

export type LottieName = 'badge-pop' | 'sparkle' | 'tap-ripple';

type Player = typeof import('lottie-web/build/player/lottie_light').default;

let player: Promise<Player> | null = null;
const data = new Map<LottieName, Promise<object>>();
const loaded = new Map<LottieName, object>();

/** fetch the player and the animation ahead of time; resolves false when either fails */
export function preload(name: LottieName): Promise<boolean> {
  player ??= import('lottie-web/build/player/lottie_light').then((m) => m.default);
  if (!data.has(name)) {
    data.set(
      name,
      fetch(assetUrl(`lottie/${name}.json`)).then((r) => {
        if (!r.ok) throw new Error(`lottie/${name}: ${r.status}`);
        return r.json() as Promise<object>;
      }),
    );
  }
  return Promise.all([player, data.get(name)!]).then(
    ([, json]) => {
      loaded.set(name, json);
      return true;
    },
    () => {
      player = null;
      data.delete(name);
      return false;
    },
  );
}

/** true once preload() has both the player and the animation, so burst() plays without a gap */
export function isReady(name: LottieName): boolean {
  return loaded.has(name) && player !== null;
}

export interface BurstOptions {
  /** box size in px; the animation is square and centred on the point */
  size: number;
  /** play-rate multiplier */
  speed?: number;
}

/**
 * Plays `name` once, centred on `at` (viewport px), inside `host` (which must be positioned).
 * Returns a stop function that removes it early; the box also removes itself when the
 * animation ends.
 */
export function burst(host: HTMLElement, name: LottieName, at: { x: number; y: number }, opts: BurstOptions): () => void {
  if (motion.reduced) return () => {};
  const box = document.createElement('div');
  box.className = 'lottie-burst';
  box.setAttribute('aria-hidden', 'true');
  const r = host.getBoundingClientRect();
  Object.assign(box.style, {
    left: `${at.x - r.left + host.scrollLeft - opts.size / 2}px`,
    top: `${at.y - r.top + host.scrollTop - opts.size / 2}px`,
    width: `${opts.size}px`,
    height: `${opts.size}px`,
  });
  host.appendChild(box);
  let anim: AnimationItem | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    anim?.destroy();
    anim = null;
    box.remove();
  };
  // the longest burst is 36 frames at 30 fps; never leave a box behind if 'complete' is missed
  const timer = window.setTimeout(stop, 4000);
  void preload(name).then(async (ok) => {
    if (!ok || stopped || !box.isConnected) return stop();
    const lottie = await player!;
    anim = lottie.loadAnimation({
      container: box,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      // loadAnimation mutates the data it is given, so each burst gets its own copy
      animationData: structuredClone(loaded.get(name)!),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
    if (opts.speed) anim.setSpeed(opts.speed);
    anim.addEventListener('complete', stop);
  });
  return stop;
}
