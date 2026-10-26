/**
 * Chapter 1 · Protection & Care. The child drags a smiling sun along an arc over the rice field;
 * the shade under the brim slides the other way but always stays on the farmer's face, and a warm
 * light follows the sun. Done once the sun has travelled across most of the sky.
 */
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { assetUrl } from '../../../assets/manifest';
import { speak } from '../../phase1/speak';
import { ANN } from '../annotations';
import { P3_ICONS, SUN_ART } from '../art';
import { arcPoint, arcT, brimEllipse, rectInEllipse, shadowFor, skyColours, type Arc, type Ellipse, type Rect } from '../sunShade';
import type { Chapter, ChapterHost } from './types';

const A = ANN.protection;
/** height of the sky band above the photo, as a fraction of the photo's height */
const SKY = 0.3;
const PHOTO_AR = A.width / A.height;

export class SunShadeChapter implements Chapter {
  readonly id = 'protection' as const;
  readonly icon = P3_ICONS.ch1;
  readonly story = ['p3.ch1.story'];
  readonly firstPrompt = 'p3.ch1.prompt';
  readonly pic: HTMLDivElement;
  readonly actions: HTMLDivElement;
  complete = false;

  private sky: HTMLDivElement;
  private photoBox: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private sun: HTMLButtonElement;
  private arcPath: SVGPathElement;
  private arcSvg: SVGSVGElement;
  private img = new Image();
  private t = 0.18;
  private seenMin = 0.18;
  private seenMax = 0.18;
  private arc: Arc = { cx: 0, cy: 0, rx: 1, ry: 1 };
  private size = { w: 0, h: 0, frameW: 0, frameH: 0, skyH: 0, r: 40 };
  private raf = 0;
  private dragging = false;
  private storyTold = false;
  private pendingDone = false;
  private glide: gsap.core.Tween | null = null;
  private skyBottom = 'rgb(214, 236, 244)';
  private skyTop = 'rgb(126, 196, 232)';
  private offLang: () => void;

  constructor(private host: ChapterHost) {
    this.sky = el('div.p3-sun__sky', { 'data-no-swipe': '' });
    this.canvas = el('canvas.p3-sun__canvas', { 'aria-hidden': 'true' });
    this.photoBox = el('div.p3-sun__photo', { role: 'img', 'aria-label': i18n.t('p3.ch1.alt') }, this.canvas);
    this.arcSvg = svg('<svg xmlns="http://www.w3.org/2000/svg"><path class="p3-sun__arcpath"/></svg>', 'p3-sun__arc');
    this.arcPath = this.arcSvg.querySelector('path')!;
    this.sun = el(
      'button.p3-sun__sun',
      {
        type: 'button',
        'data-touch': '',
        'data-no-swipe': '',
        'data-test': 'sun',
        'aria-label': i18n.t('p3.ch1.prompt'),
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            this.setT(this.t + (e.key === 'ArrowRight' ? 0.05 : -0.05));
          }
        },
      },
      svg(SUN_ART, 'p3-sun__art'),
    );
    this.pic = el('div.p3-pic.p3-sun', { style: `--ar:${(PHOTO_AR / (1 + SKY)).toFixed(4)}` }, this.sky, this.photoBox, this.arcSvg, this.sun);
    this.actions = el('div.p3-actions');
    this.wireDrag(this.sky);
    this.img.decoding = 'async';
    this.img.onload = () => this.draw();
    this.img.src = assetUrl(`img/photos/${A.photo}-1280.jpg`);
    this.offLang = i18n.onChange(() => {
      this.photoBox.setAttribute('aria-label', i18n.t('p3.ch1.alt'));
      this.sun.setAttribute('aria-label', i18n.t('p3.ch1.prompt'));
    });
  }

  start(): void {
    this.host.prompt(this.complete ? 'p3.ch1.done' : this.firstPrompt);
    this.resize();
    void this.tell();
    this.hint();
  }

  stop(): void {
    this.dragging = false;
    this.glide?.kill();
  }

  dispose(): void {
    this.stop();
    cancelAnimationFrame(this.raf);
    this.img.onload = null;
    this.offLang();
  }

  private async tell(): Promise<void> {
    const ctx = this.host.ctx;
    const alive = () => this.host.isCurrent(this.id);
    const r = await speak(ctx.narration, this.story, alive);
    this.storyTold = true;
    if (r.result !== 'ended' || !alive()) return;
    if (this.pendingDone) {
      this.pendingDone = false;
      void ctx.narration.say('p3.ch1.done');
    } else if (!this.complete) void ctx.narration.say(this.firstPrompt);
  }

  // ---------- layout ----------

  resize(): void {
    const frame = this.pic.getBoundingClientRect();
    if (!frame.width) return;
    const skyH = frame.height * (SKY / (1 + SKY));
    const w = frame.width;
    const h = frame.height - skyH;
    const r = Math.max(32, Math.min(48, w * 0.075));
    this.size = { w, h, frameW: frame.width, frameH: frame.height, skyH, r };
    this.sky.style.height = `${skyH}px`;
    this.photoBox.style.top = `${skyH}px`;
    this.photoBox.style.height = `${h}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.sun.style.width = this.sun.style.height = `${r * 2}px`;
    const cy = skyH + r * 0.4;
    this.arc = { cx: w / 2, cy, rx: w / 2 - r - 6, ry: Math.max(20, cy - r - 4) };
    this.arcSvg.setAttribute('viewBox', `0 0 ${w} ${frame.height}`);
    const pts = Array.from({ length: 41 }, (_, i) => arcPoint(this.arc, i / 40));
    this.arcPath.setAttribute('d', `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`);
    this.setT(this.t, true);
  }

  // ---------- the sun ----------

  private wireDrag(skyHit: HTMLElement): void {
    const local = (e: PointerEvent) => {
      const b = this.pic.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    this.sun.addEventListener('pointerdown', (e) => {
      this.sun.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.glide?.kill();
      this.sun.classList.add('is-dragging');
      this.host.ctx.audio.sfx.play('tap');
    });
    this.sun.addEventListener('pointermove', (e) => {
      if (this.dragging) this.setT(arcT(this.arc, local(e)));
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.sun.classList.remove('is-dragging');
    };
    this.sun.addEventListener('pointerup', end);
    this.sun.addEventListener('pointercancel', end);
    // tapping the sky glides the sun there
    skyHit.addEventListener('pointerdown', (e) => {
      const target = arcT(this.arc, local(e));
      const proxy = { t: this.t };
      this.glide?.kill();
      this.glide = this.host.g.add(() =>
        gsap.to(proxy, { t: target, duration: motion.dur(0.7), ease: 'power2.out', onUpdate: () => this.setT(proxy.t) }),
      );
    });
  }

  private setT(t: number, silent = false): void {
    this.t = Math.max(0, Math.min(1, t));
    const p = arcPoint(this.arc, this.t);
    const r = this.size.r;
    this.sun.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
    const [top, bottom] = skyColours(this.t);
    this.skyBottom = bottom;
    this.skyTop = top;
    this.sky.style.background = `linear-gradient(180deg, ${top}, ${bottom})`;
    this.scheduleDraw();
    if (silent) return;
    this.seenMin = Math.min(this.seenMin, this.t);
    this.seenMax = Math.max(this.seenMax, this.t);
    if (!this.complete && this.seenMax - this.seenMin >= 0.6) this.finish();
  }

  private finish(): void {
    this.complete = true;
    const ctx = this.host.ctx;
    ctx.audio.sfx.play('chime');
    this.host.prompt('p3.ch1.done');
    this.host.done(this.id);
    if (this.storyTold) void ctx.narration.say('p3.ch1.done');
    else this.pendingDone = true;
    if (!motion.reduced) this.host.g.add(() => gsap.fromTo(this.sun, { scale: 1 }, { scale: 1.25, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' }));
  }

  // ---------- drawing ----------

  private scheduleDraw(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  /** photo-space geometry for the current size */
  private geometry(): { brim: Ellipse & { rot: number }; face: Rect; apex: { x: number; y: number } } {
    const { w, h } = this.size;
    const brim = brimEllipse({ x: A.brim.l[0] * w, y: A.brim.l[1] * h }, { x: A.brim.r[0] * w, y: A.brim.r[1] * h }, A.brim.d * h);
    const face = { x: A.face.x * w, y: A.face.y * h, w: A.face.w * w, h: A.face.h * h };
    return { brim, face, apex: { x: A.apex[0] * w, y: A.apex[1] * h } };
  }

  shadowCoversFace(): boolean {
    const { brim, face } = this.geometry();
    return rectInEllipse(face, shadowFor(this.t, brim, face));
  }

  private draw(): void {
    const c = this.canvas.getContext('2d');
    const { w, h, skyH } = this.size;
    if (!c || !w || !this.img.complete || !this.img.naturalWidth) return;
    const dpr = this.canvas.width / w;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.img, 0, 0, w, h);
    // melt the photo's hazy top edge into the sky band, and tint the scene with the time of day
    const tint = (a: number) => this.skyBottom.replace('rgb', 'rgba').replace(')', `, ${a})`);
    let seam = c.createLinearGradient(0, 0, 0, h * 0.09);
    seam.addColorStop(0, tint(1));
    seam.addColorStop(1, tint(0));
    c.fillStyle = seam;
    c.fillRect(0, 0, w, h * 0.09);
    c.globalCompositeOperation = 'soft-light';
    seam = c.createLinearGradient(0, 0, 0, h * 0.45);
    seam.addColorStop(0, tint(0.9));
    seam.addColorStop(1, tint(0));
    c.fillStyle = seam;
    c.fillRect(0, 0, w, h * 0.45);
    c.fillStyle = this.skyTop.replace('rgb', 'rgba').replace(')', ', 0.28)');
    c.fillRect(0, 0, w, h);

    const sunPos = arcPoint(this.arc, this.t);
    const sun = { x: sunPos.x, y: sunPos.y - skyH };
    const elevation = Math.sin(Math.PI * this.t);
    // warm light falling from the sun
    let g = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, w * 1.1);
    g.addColorStop(0, `rgba(255, 214, 140, ${0.75 + 0.15 * elevation})`);
    g.addColorStop(0.45, 'rgba(255, 196, 120, 0.3)');
    g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    g = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, w * 0.55);
    g.addColorStop(0, 'rgba(255, 240, 200, 0.35)');
    g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    c.globalCompositeOperation = 'screen';
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // soft sunbeams fanning down from the sun
    c.globalCompositeOperation = 'screen';
    for (let k = -2; k <= 2; k++) {
      const a = Math.atan2(h * 0.9 - sun.y, w * 0.5 + (w / 2 - sun.x) * 0.3 - sun.x) + k * 0.16;
      const len = Math.hypot(w, h) * 1.1;
      const beam = c.createLinearGradient(sun.x, sun.y, sun.x + Math.cos(a) * len, sun.y + Math.sin(a) * len);
      beam.addColorStop(0, 'rgba(255, 236, 180, 0.14)');
      beam.addColorStop(1, 'rgba(255, 236, 180, 0)');
      c.fillStyle = beam;
      c.beginPath();
      c.moveTo(sun.x, sun.y);
      c.lineTo(sun.x + Math.cos(a - 0.06) * len, sun.y + Math.sin(a - 0.06) * len);
      c.lineTo(sun.x + Math.cos(a + 0.06) * len, sun.y + Math.sin(a + 0.06) * len);
      c.closePath();
      c.fill();
    }

    // the shade, drawn on its own layer, with the hat cut out so it only falls under the brim
    const { brim, face, apex } = this.geometry();
    const s = shadowFor(this.t, brim, face);
    const layer = this.shadeLayer(w, h, dpr);
    const lc = layer.getContext('2d')!;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.clearRect(0, 0, w, h);
    lc.save();
    lc.translate(s.cx, s.cy);
    lc.scale(1, s.ry / s.rx);
    const sg = lc.createRadialGradient(0, 0, 0, 0, 0, s.rx);
    // a cool, deep pool of shade (multiplied onto the photo below)
    sg.addColorStop(0, 'rgba(26, 30, 58, 0.9)');
    sg.addColorStop(0.6, 'rgba(40, 44, 76, 0.7)');
    sg.addColorStop(1, 'rgba(60, 64, 96, 0)');
    lc.fillStyle = sg;
    lc.beginPath();
    lc.arc(0, 0, s.rx, 0, Math.PI * 2);
    lc.fill();
    lc.restore();
    lc.globalCompositeOperation = 'destination-out';
    lc.beginPath();
    lc.moveTo(apex.x, apex.y);
    lc.lineTo(A.brim.l[0] * w, A.brim.l[1] * h);
    lc.lineTo(A.brim.r[0] * w, A.brim.r[1] * h);
    lc.closePath();
    lc.fill();
    lc.beginPath();
    lc.ellipse(brim.cx, brim.cy, brim.rx, brim.ry, brim.rot, 0, Math.PI * 2);
    lc.fill();
    lc.globalCompositeOperation = 'source-over';
    c.globalCompositeOperation = 'multiply';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(layer, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  private shade: HTMLCanvasElement | null = null;
  private shadeLayer(w: number, h: number, dpr: number): HTMLCanvasElement {
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (!this.shade) this.shade = document.createElement('canvas');
    if (this.shade.width !== cw || this.shade.height !== ch) {
      this.shade.width = cw;
      this.shade.height = ch;
    }
    return this.shade;
  }

  // ---------- hints / tests ----------

  hint(): void {
    const ctx = this.host.ctx;
    if (this.complete) return;
    ctx.idle.watch({
      stepId: 'p3.ch1.sun',
      gesture: 'drag',
      target: () => this.sun.getBoundingClientRect(),
      path: () => {
        const b = this.pic.getBoundingClientRect();
        const to = this.t < 0.5 ? Math.min(1, this.t + 0.55) : Math.max(0, this.t - 0.55);
        return [0.25, 0.5, 0.75, 1].map((k) => {
          const p = arcPoint(this.arc, this.t + (to - this.t) * k);
          return { x: b.left + p.x, y: b.top + p.y };
        });
      },
    });
  }

  get sunT(): number {
    return this.t;
  }
}
