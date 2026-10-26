/**
 * A short burst of confetti in the warm palette: paper squares, round dots, little leaves and tiny
 * nón lá. Reduced motion: a few pieces that only fade in place.
 */
import { motion } from '../../../a11y/motion';

const COLOURS = ['#E0A93B', '#F6A623', '#A9472A', '#2F5D46', '#C21F66', '#E0457B', '#7FBF5E', '#8E5BA8', '#FFF9EC'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  wobble: number;
  size: number;
  colour: string;
  shape: number;
}

export interface Burst {
  done: Promise<void>;
  stop(): void;
}

/** `from` is the burst origin in host px (default: centre, a little below the middle) */
export function confettiBurst(host: HTMLElement, opts: { from?: { x: number; y: number }; ms?: number; count?: number } = {}): Burst {
  const canvas = document.createElement('canvas');
  canvas.className = 'p4-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const w = Math.max(1, host.clientWidth);
  const h = Math.max(1, host.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  const ms = opts.ms ?? 2600;
  const reduced = motion.reduced;
  const n = reduced ? 30 : (opts.count ?? 150);
  const o = opts.from ?? { x: w / 2, y: h * 0.55 };
  const bits: Bit[] = Array.from({ length: n }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const v = 9 + Math.random() * 13;
    return {
      x: reduced ? Math.random() * w : o.x + (Math.random() - 0.5) * 40,
      y: reduced ? Math.random() * h : o.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.32,
      wobble: Math.random() * Math.PI * 2,
      size: 8 + Math.random() * 10,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      shape: Math.floor(Math.random() * 4),
    };
  });
  let raf = 0;
  let stopped = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    resolve();
  };
  if (!c) {
    stop();
    return { done, stop };
  }
  const start = performance.now();
  let last = start;
  const tick = (now: number) => {
    const t = now - start;
    const k = Math.min(2.5, (now - last) / 16.7);
    last = now;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.globalAlpha = reduced ? Math.min(1, t / 300) * Math.max(0, Math.min(1, (ms - t) / 600)) : Math.max(0, Math.min(1, (ms - t) / 600));
    for (const b of bits) {
      if (!reduced) {
        b.vy += 0.38 * k;
        b.vx *= 0.985 ** k;
        b.vy *= 0.985 ** k;
        b.wobble += 0.12 * k;
        b.x += (b.vx + Math.sin(b.wobble) * 0.8) * k;
        b.y += b.vy * k;
        b.rot += b.vr * k;
      }
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.rot);
      c.scale(1, reduced ? 1 : Math.abs(Math.cos(b.wobble)) * 0.7 + 0.3);
      c.fillStyle = b.colour;
      const s = b.size;
      c.beginPath();
      if (b.shape === 0) c.rect(-s / 2, -s / 3, s, s * 0.66);
      else if (b.shape === 1) c.arc(0, 0, s / 2.6, 0, Math.PI * 2);
      else if (b.shape === 2) c.ellipse(0, 0, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      else {
        c.moveTo(0, -s * 0.55);
        c.lineTo(s * 0.7, s * 0.3);
        c.quadraticCurveTo(0, s * 0.55, -s * 0.7, s * 0.3);
        c.closePath();
      }
      c.fill();
      c.restore();
    }
    if (t < ms) raf = requestAnimationFrame(tick);
    else stop();
  };
  raf = requestAnimationFrame(tick);
  return { done, stop };
}
