/** A short burst of palette confetti, including tiny nón lá triangles (about 2 s). */
import { motion } from '../../a11y/motion';

const COLOURS = ['#E0A93B', '#A9472A', '#2F5D46', '#C21F66', '#F6A623', '#7FBF5E', '#FFF9EC'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  colour: string;
  shape: 0 | 1 | 2;
}

export function confetti(host: HTMLElement, ms = 2200): { done: Promise<void>; stop: () => void } {
  const canvas = document.createElement('canvas');
  canvas.className = 'p3-confetti';
  host.appendChild(canvas);
  const w = host.clientWidth;
  const h = host.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext('2d')!;
  const n = motion.reduced ? 36 : 140;
  const pieces: Piece[] = Array.from({ length: n }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.55,
    vx: (Math.random() - 0.5) * (motion.reduced ? 2 : 18),
    vy: motion.reduced ? 0 : -(8 + Math.random() * 14),
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    size: 7 + Math.random() * 9,
    colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
  }));
  if (motion.reduced) for (const p of pieces) p.y = Math.random() * h;
  let raf = 0;
  let stopped = false;
  const start = performance.now();
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    resolve();
  };
  const tick = (now: number) => {
    const t = now - start;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.globalAlpha = Math.max(0, Math.min(1, (ms - t) / 500));
    for (const p of pieces) {
      if (!motion.reduced) {
        p.vy += 0.35;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
      }
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.colour;
      if (p.shape === 0) c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      else if (p.shape === 1) {
        c.beginPath();
        c.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        c.fill();
      } else {
        c.beginPath();
        c.moveTo(0, -p.size * 0.6);
        c.lineTo(p.size * 0.7, p.size * 0.35);
        c.quadraticCurveTo(0, p.size * 0.6, -p.size * 0.7, p.size * 0.35);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
    if (t < ms) raf = requestAnimationFrame(tick);
    else stop();
  };
  raf = requestAnimationFrame(tick);
  return { done, stop };
}
