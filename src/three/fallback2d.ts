/**
 * The hat as a layered drawing, for devices where WebGL can't start. Same four layers, simpler
 * gestures (trace or tap the stitch row, tap/swipe the leaves, tap the frame, tap the strap); no
 * rotation. A short notice tells the grown-ups why it looks different.
 */
import { gsap } from 'gsap';
import { i18n } from '../i18n/i18n';
import { motion } from '../a11y/motion';
import type { LayerId } from '../app/types';
import type { SfxId } from '../audio/sfx';
import type { HatViewer, HintGesture, LayerCallbacks, LayerController, ScreenPoint, ScreenRect, ViewerDebug } from './HatViewer';
import { defaultFrame } from './framing';
import { STRAP_COLOURS, type StrapColour } from './rig';

const NS = 'http://www.w3.org/2000/svg';
const APEX = { x: 200, y: 40 };
const BRIM = { cx: 200, cy: 280, rx: 190, ry: 42 };

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.appendChild(n);
  return n;
}

/** ring i (1 = brim … 16 = tip) as an ellipse */
function ring(i: number): { cx: number; cy: number; rx: number; ry: number } {
  const f = (i - 1) / 16;
  return { cx: BRIM.cx, cy: BRIM.cy - f * (BRIM.cy - APEX.y), rx: BRIM.rx * (1 - f), ry: BRIM.ry * (1 - f) };
}

function arcPath(e: { cx: number; cy: number; rx: number; ry: number }, a0 = 0, a1 = Math.PI): string {
  const p0 = { x: e.cx + e.rx * Math.cos(a0), y: e.cy + e.ry * Math.sin(a0) };
  const p1 = { x: e.cx + e.rx * Math.cos(a1), y: e.cy + e.ry * Math.sin(a1) };
  return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${e.rx.toFixed(1)},${e.ry.toFixed(1)} 0 0 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
}

export function createFallbackViewer(host: HTMLElement): HatViewer {
  const root = document.createElement('div');
  root.className = 'hat2d';
  root.style.opacity = '0';
  const canvas = document.createElement('canvas'); // the contract wants one; it stays empty
  canvas.hidden = true;
  const notice = document.createElement('div');
  notice.className = 'hat2d__notice';
  i18n.bind(notice, 'p2.fallback');
  const svg = svgEl('svg', { viewBox: '0 0 400 430', class: 'hat2d__svg', role: 'img' });
  i18n.bind(svgEl('title', {}, svg), 'p2.title');
  root.append(svg, notice);
  host.append(canvas, root);

  // --- the drawing, inside → out
  const g = (cls: string) => svgEl('g', { class: cls }, svg);
  const strap = g('strap');
  const strapPath = svgEl('path', { d: 'M40,262 Q200,520 360,262', fill: 'none', stroke: STRAP_COLOURS.purple, 'stroke-width': 9, 'stroke-linecap': 'round' }, strap);
  const knots = [svgEl('circle', { cx: 40, cy: 262, r: 7, fill: '#6E4A86' }, strap), svgEl('circle', { cx: 360, cy: 262, r: 7, fill: '#6E4A86' }, strap)];
  strap.style.opacity = '0';
  const inner = g('inner');
  svgEl('path', { d: `M${APEX.x},${APEX.y} L${BRIM.cx - BRIM.rx},${BRIM.cy} ${arcPath(BRIM).replace(/^M[^A]+/, '')} Z`, fill: '#9C6B3F' }, inner);
  svgEl('path', { d: `M${APEX.x},${APEX.y} L${BRIM.cx - BRIM.rx * 0.5},${BRIM.cy + BRIM.ry * 0.86} L${BRIM.cx + BRIM.rx * 0.2},${BRIM.cy + BRIM.ry * 0.98} Z`, fill: '#E6D2A0', opacity: 0.55 }, inner);
  const frame = g('frame');
  const ringEls: SVGPathElement[] = [];
  for (let i = 1; i <= 16; i++) ringEls.push(svgEl('path', { d: arcPath(ring(i)), fill: 'none', stroke: '#C79A55', 'stroke-width': 3.2 }, frame));
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * Math.PI;
    svgEl('line', { x1: APEX.x, y1: APEX.y, x2: BRIM.cx + BRIM.rx * Math.cos(a), y2: BRIM.cy + BRIM.ry * Math.sin(a), stroke: '#B8862A', 'stroke-width': 2.4 }, frame);
  }
  frame.style.opacity = '0';
  const leaves = g('leaves');
  const wedges: SVGPathElement[] = [];
  const shades = ['#E3BE6E', '#D9B56A', '#EBD08F', '#DDB767', '#E7C77D', '#D6AE5E'];
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI;
    const a1 = ((k + 1) / 6) * Math.PI;
    const p0 = { x: BRIM.cx + BRIM.rx * Math.cos(a0), y: BRIM.cy + BRIM.ry * Math.sin(a0) };
    const d = `M${APEX.x},${APEX.y} L${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${arcPath(BRIM, a0, a1).replace(/^M[^A]+/, '')} Z`;
    const w = svgEl('path', { d, fill: shades[k], stroke: '#B8862A', 'stroke-width': 1.2, 'data-hit': 'leaf' }, leaves);
    w.style.transformOrigin = `${APEX.x}px ${APEX.y}px`;
    wedges.push(w);
  }
  const brim = g('brim');
  svgEl('path', { d: arcPath({ ...BRIM, rx: BRIM.rx + 2, ry: BRIM.ry + 1 }), fill: 'none', stroke: '#C0261C', 'stroke-width': 5, 'stroke-dasharray': '3 3' }, brim);
  const stitches = g('stitches');
  const rows: SVGPathElement[] = [];
  for (let i = 2; i <= 16; i++) {
    rows.push(svgEl('path', { d: arcPath(ring(i)), fill: 'none', stroke: '#FBFAF6', 'stroke-width': i === 3 ? 3.4 : 2.4, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }, stitches));
  }
  const row3 = rows[1];

  // --- placement
  let rect: ScreenRect | null = null;
  const layout = () => {
    const r = rect ?? defaultFrame(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    const scale = Math.min(r.width / 400, r.height / 430);
    Object.assign(svg.style, { left: `${r.x + (r.width - 400 * scale) / 2}px`, top: `${r.y + (r.height - 430 * scale) / 2}px`, width: `${400 * scale}px`, height: `${430 * scale}px` });
  };
  window.addEventListener('resize', layout);
  layout();
  const toScreen = (x: number, y: number): ScreenPoint => {
    const b = svg.getBoundingClientRect();
    return { x: b.left + (x / 400) * b.width, y: b.top + (y / 430) * b.height };
  };

  let floating = false;
  let peeled = 0;
  let rings = 0;
  let strapAngle = 0;
  let current: (LayerController & { layerId: LayerId }) | null = null;
  const tweens = new Set<gsap.core.Animation>();
  const tw = (a: gsap.core.Animation) => (tweens.add(a), a);

  const reset = (level: number) => {
    for (const a of tweens) a.kill();
    tweens.clear();
    gsap.set(stitches, { x: 0, opacity: level === 0 ? 1 : 0 });
    floating = false;
    rows.forEach((r) => r.setAttribute('stroke', '#FBFAF6'));
    wedges.forEach((w) => gsap.set(w, { opacity: level <= 1 ? 1 : 0, rotate: 0, y: 0 }));
    peeled = level <= 1 ? 0 : 12;
    gsap.set(inner, { opacity: level <= 2 ? 1 : 0 });
    gsap.set(frame, { opacity: level >= 2 ? 1 : 0 });
    ringEls.forEach((r) => r.setAttribute('stroke', '#C79A55'));
    gsap.set(strap, { opacity: 0, rotate: 0 });
  };

  const makeLayer = (id: LayerId, cb: LayerCallbacks): LayerController & { layerId: LayerId } => {
    const level = ['stitches', 'leaves', 'frame', 'strap'].indexOf(id);
    reset(level);
    let done = false;
    let resolveRun: () => void = () => {};
    const sfx = (s: SfxId, step?: number) => viewer.sound(s, step === undefined ? undefined : { step });
    const complete = () => {
      if (done) return;
      done = true;
      cb.onEvent?.('complete');
      resolveRun();
    };
    const listeners: [EventTarget, string, EventListener][] = [];
    const on = (t: EventTarget, ev: string, fn: EventListener) => {
      t.addEventListener(ev, fn);
      listeners.push([t, ev, fn]);
    };
    const finishers: Record<LayerId, () => void> = {
      stitches: () => {
        rows.forEach((r) => r.setAttribute('stroke', '#FFD27A'));
        tw(gsap.to(stitches, { x: 150, duration: motion.dur(0.9), ease: 'power2.inOut' }));
        floating = true;
        cb.onEvent?.('floating', true);
        complete();
        on(stitches, 'click', () => {
          floating = !floating;
          sfx(floating ? 'swish' : 'floatBack');
          tw(gsap.to(stitches, { x: floating ? 150 : 0, duration: motion.dur(0.8), ease: 'power2.inOut' }));
          cb.onEvent?.('floating', floating);
        });
      },
      leaves: () => {
        wedges.forEach((w, k) => tw(gsap.to(w, { opacity: 0, y: -80, rotate: k < 3 ? -25 : 25, duration: motion.dur(0.6), delay: k * 0.06 })));
        peeled = 12;
        cb.onEvent?.('peeled', 12);
        complete();
      },
      frame: () => {
        tw(gsap.to(inner, { opacity: 0, duration: motion.dur(0.6) }));
        rings = 16;
        cb.onEvent?.('ring', 16);
        complete();
      },
      strap: () => {
        gsap.set([inner, stitches], { opacity: 1, x: 0 });
        wedges.forEach((w) => gsap.set(w, { opacity: 1, y: 0, rotate: 0 }));
        tw(gsap.to(strap, { opacity: 1, duration: 0.5 }));
        complete();
      },
    };
    const ctrl = {
      layerId: id,
      run(): Promise<void> {
        return new Promise<void>((resolve) => {
          resolveRun = resolve;
          if (id === 'stitches') {
            tw(gsap.to(row3, { attr: { 'stroke-width': 5 }, duration: 0.7, yoyo: true, repeat: -1 }));
            on(svg, 'pointerdown', ((e: PointerEvent) => {
              if (done) return;
              sfx('stitchTick', 3);
              row3.setAttribute('stroke', '#FFD27A');
              sfx('chime');
              finishers.stitches();
              e.preventDefault();
            }) as EventListener);
          } else if (id === 'leaves') {
            wedges.forEach((w, k) =>
              on(w, 'pointerdown', () => {
                if (done || Number(w.style.opacity || 1) === 0) return;
                sfx('peel');
                tw(gsap.to(w, { opacity: 0, y: -70, rotate: k < 3 ? -20 : 20, duration: motion.dur(0.6) }));
                peeled += 2;
                cb.onEvent?.('peeled', peeled);
                if (peeled >= 6) {
                  sfx('whoosh');
                  cb.onEvent?.('whoosh');
                  finishers.leaves();
                }
              }),
            );
          } else if (id === 'frame') {
            on(svg, 'pointerdown', () => {
              if (done || rings > 0) return;
              tw(gsap.to(inner, { opacity: 0, duration: motion.dur(0.6) }));
              ringEls.forEach((r, i) =>
                tw(
                  gsap.delayedCall(0.4 + i * (motion.reduced ? 0.05 : 0.14), () => {
                    r.setAttribute('stroke', '#F6A623');
                    rings = i + 1;
                    sfx('ringSnap', i);
                    cb.onEvent?.('ring', rings);
                    if (rings === 16) complete();
                  }),
                ),
              );
            });
          } else {
            gsap.set([inner, stitches], { opacity: 1, x: 0 });
            wedges.forEach((w, k) => tw(gsap.fromTo(w, { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: motion.dur(0.5), delay: k * 0.08 })));
            peeled = 0;
            tw(gsap.to(strap, { opacity: 1, duration: 0.6, delay: 0.8 }));
            strap.style.transformOrigin = '200px 262px';
            on(strap, 'pointerdown', () => {
              sfx('swish');
              const s = { a: 0, t: 0 };
              tw(
                gsap.to(s, {
                  t: 4,
                  duration: motion.reduced ? 1.5 : 4,
                  ease: 'none',
                  onUpdate: () => {
                    strapAngle = (motion.reduced ? 4 : 14) * Math.sin(s.t * Math.PI * 1.6) * Math.exp(-s.t / 1.5);
                    strap.setAttribute('transform', `rotate(${strapAngle.toFixed(2)} 200 262)`);
                  },
                }),
              );
              knots.forEach((k) => tw(gsap.fromTo(k, { attr: { r: 7 } }, { attr: { r: 12 }, duration: 0.4, yoyo: true, repeat: 3 })));
              tw(gsap.delayedCall(1.6, complete));
            });
          }
        });
      },
      finish(): void {
        finishers[id]();
      },
      dispose(): void {
        for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
        listeners.length = 0;
        if (current === ctrl) current = null;
      },
      hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
        if (done) return null;
        if (id === 'stitches') {
          const e = ring(3);
          const pts: ScreenPoint[] = [];
          for (let k = 0; k <= 8; k++) {
            const a = Math.PI - (k / 8) * Math.PI;
            pts.push(toScreen(e.cx + e.rx * Math.cos(a), e.cy + e.ry * Math.sin(a)));
          }
          return { gesture: 'trace', points: pts };
        }
        if (id === 'leaves') return { gesture: 'swipe', points: [toScreen(200, 200), toScreen(200, 120)] };
        if (id === 'frame') return { gesture: 'tap', points: [toScreen(200, 200)] };
        return { gesture: 'tap', points: [toScreen(200, 390)] };
      },
      assist(): void {
        finishers[id]();
      },
    };
    return ctrl;
  };

  const viewer: HatViewer = {
    kind: '2d',
    canvas,
    ready: Promise.resolve(),
    sound: () => {},
    show: (o = {}) => {
      layout();
      gsap.to(root, { opacity: 1, duration: o.fade ?? 0.3 });
    },
    hide: (o = {}) => {
      gsap.to(root, { opacity: 0, duration: o.fade ?? 0.3 });
    },
    setInteractive: (on) => {
      svg.style.pointerEvents = on ? 'auto' : 'none';
    },
    resetHat: () => {
      current?.dispose();
      reset(0);
    },
    setFrame: (r) => {
      rect = r;
      layout();
    },
    convergeFrom: async () => {
      reset(0);
      viewer.show();
      await new Promise((r) => setTimeout(r, 400));
    },
    layer: (id, cb) => {
      current?.dispose();
      current = makeLayer(id, cb);
      return current;
    },
    setStrapColour: (c: StrapColour) => {
      strapPath.setAttribute('stroke', STRAP_COLOURS[c]);
    },
    celebrateAndShrinkTo: async (r) => {
      current?.dispose();
      reset(0);
      gsap.set(strap, { opacity: 1 });
      viewer.show();
      viewer.sound('chime');
      await gsap.to(svg, { rotate: 360, duration: motion.dur(1.6), ease: 'power2.inOut' });
      gsap.set(svg, { rotate: 0 });
      rect = r;
      layout();
    },
    project: () => null,
    debug: (): ViewerDebug => ({
      tracePath: () => (current?.layerId === 'stitches' ? (current.hint?.()?.points ?? []) : []),
      floating: () => floating,
      peeled: () => peeled,
      ringsShown: () => rings,
      strapAngle: () => strapAngle,
      stitchesPoint: () => {
        const b = stitches.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height * 0.7 };
      },
    }),
    dispose: () => {
      for (const a of tweens) a.kill();
      window.removeEventListener('resize', layout);
      root.remove();
      canvas.remove();
    },
  };
  return viewer;
}
