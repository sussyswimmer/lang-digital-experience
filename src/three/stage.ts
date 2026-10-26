/**
 * The real HatViewer: a three.js stage with the Blender hat. Falls back to a layered 2D drawing
 * (./fallback2d.ts) when WebGL can't start, so the child can always carry on.
 */
import './viewer.css';
import { gsap } from 'gsap';
import * as THREE from 'three';
import type { LayerId } from '../app/types';
import type { SfxId } from '../audio/sfx';
import type { HatViewer, LayerCallbacks, LayerController, ScreenRect, ViewerDebug } from './HatViewer';
import { loadHat } from './hat';
import { Rig, type StrapColour } from './rig';
import { Stage } from './scene';
import { LayerBase } from './layers/base';
import { StitchesLayer } from './layers/stitches';
import { LeavesLayer } from './layers/leaves';
import { FrameLayer } from './layers/frame';
import { StrapLayer } from './layers/strap';
import { celebrateAndShrink, converge } from './transitions';
import { createFallbackViewer } from './fallback2d';

export async function createViewer(host: HTMLElement): Promise<HatViewer> {
  // Automated tests render on a CPU (software WebGL), where a frame can take over half a second;
  // GSAP's lag smoothing would then slow every tween to a crawl. Keep wall-clock time in tests.
  if (new URLSearchParams(location.search).has('test')) gsap.ticker.lagSmoothing(0);
  let stage: Stage;
  try {
    if (!webglAvailable()) throw new Error('no WebGL');
    stage = new Stage(host);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[hat] WebGL unavailable, using the 2D hat', err);
    return createFallbackViewer(host);
  }
  return new Viewer3D(stage);
}

function webglAvailable(): boolean {
  if (new URLSearchParams(location.search).has('no3d')) return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

const NOOP: LayerController = { run: () => new Promise(() => {}), finish: () => {}, dispose: () => {} };

class Viewer3D implements HatViewer {
  readonly kind = '3d' as const;
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  sound: (id: SfxId, opts?: { step?: number }) => void = () => {};
  private rig: Rig | null = null;
  private current: LayerBase | null = null;
  private hadLayer = false;
  private lastRings = 0;
  private fade: gsap.core.Tween | null = null;

  constructor(private stage: Stage) {
    this.canvas = stage.canvas;
    stage.canvas.style.opacity = '0';
    stage.overlay.style.opacity = '0';
    this.ready = loadHat().then((hat) => {
      this.rig = new Rig(stage, hat);
      this.rig.sound = (id, opts) => this.sound(id, opts);
      this.rig.resetAll();
      stage.invalidate();
    });
    this.ready.catch((err) => console.error('[hat] could not load the model', err));
    stage.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    stage.canvas.addEventListener('webglcontextrestored', () => stage.invalidate());
  }

  show(opts: { fade?: number } = {}): void {
    this.stage.start();
    this.stage.resize();
    this.fade?.kill();
    const targets = [this.stage.canvas, this.stage.overlay];
    this.fade = gsap.to(targets, { opacity: 1, duration: opts.fade ?? 0.4, ease: 'power1.out' });
  }

  hide(opts: { fade?: number } = {}): void {
    this.fade?.kill();
    const targets = [this.stage.canvas, this.stage.overlay];
    this.setInteractive(false);
    this.fade = gsap.to(targets, {
      opacity: 0,
      duration: opts.fade ?? 0.3,
      ease: 'power1.in',
      onComplete: () => this.stage.stop(),
    });
  }

  setInteractive(on: boolean): void {
    this.stage.host.classList.toggle('interactive', on);
    if (!on) this.stage.canvas.style.cursor = '';
  }

  resetHat(): void {
    this.current?.dispose();
    this.current = null;
    this.hadLayer = false;
    this.rig?.resetAll();
  }

  setFrame(rect: ScreenRect | null, opts: { duration?: number } = {}): void {
    this.stage.setRect(rect, opts.duration ?? 0.6);
  }

  async convergeFrom(rects: ScreenRect[], images: string[]): Promise<void> {
    await this.ready;
    this.current?.dispose();
    this.current = null;
    this.hadLayer = false;
    this.show({ fade: 0.2 });
    await converge(this.rig!, rects, images);
  }

  layer(id: LayerId, cb: LayerCallbacks): LayerController {
    const rig = this.rig;
    if (!rig) {
      console.warn('[hat] layer() before the hat is ready');
      return NOOP;
    }
    const animate = this.hadLayer;
    this.current?.dispose();
    this.hadLayer = true;
    const make = { stitches: StitchesLayer, leaves: LeavesLayer, frame: FrameLayer, strap: StrapLayer }[id];
    const ctrl = new make(rig, cb, animate);
    this.current = ctrl;
    const dispose = ctrl.dispose.bind(ctrl);
    ctrl.dispose = () => {
      if (ctrl instanceof FrameLayer) this.lastRings = ctrl.ringsShown;
      dispose();
      if (this.current === ctrl) this.current = null;
    };
    return ctrl;
  }

  setStrapColour(c: StrapColour): void {
    this.rig?.strap.setColour(c);
    this.stage.invalidate();
  }

  async celebrateAndShrinkTo(rect: ScreenRect): Promise<void> {
    await this.ready;
    this.current?.dispose();
    this.current = null;
    this.hadLayer = false;
    this.setInteractive(false);
    this.show({ fade: 0.3 });
    await celebrateAndShrink(this.rig!, rect);
  }

  project(name: string): { x: number; y: number; visible: boolean } | null {
    const hat = this.rig?.hat;
    if (!hat || !hat.has(name)) return null;
    const o = hat.get(name);
    const p = new THREE.Vector3();
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      p.copy(mesh.geometry.boundingSphere!.center).applyMatrix4(o.matrixWorld);
    } else {
      o.getWorldPosition(p);
    }
    const s = this.stage.toScreen(p);
    return { x: s.x, y: s.y, visible: s.visible && o.visible };
  }

  debug(): ViewerDebug {
    return {
      tracePath: () => (this.current instanceof StitchesLayer ? this.current.tracePath() : []),
      floating: () => !!this.rig?.stitches.floating && !!this.rig?.stitches.group.visible,
      peeled: () => this.rig?.panels.peeledCount ?? 0,
      ringsShown: () => (this.current instanceof FrameLayer ? this.current.ringsShown : this.lastRings),
      strapAngle: () => (this.rig ? THREE.MathUtils.radToDeg(this.rig.strap.swingFromVertical(this.rig.hat.assembly)) : 0),
      stitchesPoint: () => {
        const rig = this.rig;
        if (!rig || !rig.stitches.group.visible) return null;
        const p = rig.stitches.group.localToWorld(new THREE.Vector3(0, 0.1, 0.06));
        const s = this.stage.toScreen(p);
        return { x: s.x, y: s.y };
      },
    };
  }

  dispose(): void {
    this.current?.dispose();
    this.rig?.dispose();
    this.fade?.kill();
    this.stage.dispose();
  }
}
