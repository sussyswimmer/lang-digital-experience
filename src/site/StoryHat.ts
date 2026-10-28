/**
 * The landing's scroll intro, rendered live: the experience's own Blender hat, lights and materials,
 * posed by scroll position along the INTRO timeline (blender/render_jobs.py build_intro): the hat
 * turns, the outer leaves open like petals and lift, the inner layers stack upward, the 16 rings
 * spread, the strap drops, and then it all comes back together. Sharp at any screen size and
 * nothing to decode while scrubbing; the image sequence (ScrollFrames) stays as the fallback where
 * WebGL or the model is missing.
 *
 * Positions are the Blender keyframes converted to three.js (Blender Z up → +Y): every moving part's
 * parent has an identity transform, so "up" in the script is +Y in the part's own parent space.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Stage } from '../three/scene';
import { loadHat, pad, type Hat } from '../three/hat';
import type { Rect } from '../three/framing';

/** frames in the Blender timeline the caption beats (storyBeats.ts) were written against */
export const INTRO_FRAMES = 270;

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** Blender's default Bézier keys ease in and out of every key */
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 0 at home, 1 away: leaves over frames [a, b], holds, comes back over [c, d] (hold_then_move) */
function away(f: number, a: number, b: number, c: number, d: number): number {
  if (f <= a || f >= d) return 0;
  if (f < b) return smooth((f - a) / (b - a));
  if (f <= c) return 1;
  return 1 - smooth((f - c) / (d - c));
}

/** smooth through [frame, value] keys */
function keyed(f: number, keys: readonly (readonly [number, number])[]): number {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    if (f <= f1) {
      const [f0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smooth((f - f0) / (f1 - f0));
    }
  }
  return keys[keys.length - 1][1];
}

// the hat's slow turn (degrees), as in the Blender script
const YAW = [[1, 0], [30, 20], [100, 32], [140, 50], [230, 70], [270, 30]] as const;
// the camera: close on the whole hat, pulled back and lower for the exploded view, close again.
// Extents are what must fit on screen (metres): the strap hangs to about −0.13 at rest and −0.33
// dropped; the lifted stitches reach about +0.77.
// The pulled-back view holds until the petals have closed (frame 196) and the cap is home (207).
const CY = [[1, 0.04], [30, 0.045], [95, 0.22], [196, 0.21], [228, 0.045], [270, 0.04]] as const;
const HALF_H = [[1, 0.21], [30, 0.2], [95, 0.56], [196, 0.54], [228, 0.21], [270, 0.21]] as const;
const HALF_W = [[1, 0.3], [30, 0.29], [95, 0.36], [196, 0.36], [228, 0.3], [270, 0.3]] as const;
const ELEV = [[1, 24], [30, 24], [95, 14], [196, 15], [228, 24], [270, 24]] as const;

interface Part {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
}

interface Panel extends Part {
  open: THREE.Quaternion;
  outward: THREE.Vector3;
  j: number;
}

export class StoryHat {
  readonly ready: Promise<void>;
  /** the image to show until the first frame is drawn, and the element to label for screen readers */
  readonly host: HTMLElement;
  onFirstFrame: () => void = () => {};
  private stage: Stage;
  private hat: Hat | null = null;
  private parts = new Map<string, Part>();
  private rings: Part[] = [];
  private panels: Panel[] = [];
  private brim: Part[] = [];
  private frame = 0;
  private shown = -1;
  private running = false;
  private drawn = false;
  private disposed = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.stage = new Stage(host);
    // a full-window canvas: 1.5× is sharp on retina screens at well under half the pixels of 2×
    this.stage.maxDpr = 1.5;
    this.stage.resize();
    this.stage.onAfterRender(() => {
      if (!this.hat || this.drawn) return;
      this.drawn = true;
      this.onFirstFrame();
    });
    this.ready = this.load();
  }

  get frameIndex(): number {
    return this.shown;
  }

  private async load(): Promise<void> {
    const hat = await loadHat(this.stage.renderer.capabilities.getMaxAnisotropy());
    if (this.disposed) return;
    this.hat = hat;
    this.stage.pivot.add(hat.root);
    const keep = (name: string): Part => {
      const obj = hat.get(name);
      const p = { obj, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
      this.parts.set(name, p);
      return p;
    };
    for (const n of ['strap_rig', 'stitches_white', 'poem_art', 'mo_bark', 'leaf_inner', 'leaf_outer_cap', 'apex_cap']) keep(n);
    this.brim = ['brim_wire_inner', 'brim_wire_outer', 'brim_bark', 'brim_thread_red'].filter((n) => hat.has(n)).map(keep);
    for (let i = 1; i <= 16; i++) if (hat.has(`ring_${pad(i)}`)) this.rings.push(keep(`ring_${pad(i)}`));
    const qOpen = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 22 * DEG);
    for (let j = 0; hat.has(`leaf_outer_panel_${pad(j)}_hinge`); j++) {
      const p = keep(`leaf_outer_panel_${pad(j)}_hinge`);
      // petals tip out from the cone: the hinge's local X turn, then up and away from the axis
      const outward = new THREE.Vector3(p.pos.x, 0, p.pos.z).normalize();
      this.panels.push({ ...p, open: p.quat.clone().multiply(qOpen), outward, j });
    }
    // the light pool on the landing is wider than the app's: let the contact shadow match the hat
    this.stage.shadow.scale.setScalar(1.15);
    this.place();
    this.pose(this.frame);
  }

  /** Bind to scrolling: render on demand from now on. */
  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.stage.start();
    this.place();
    this.pose(this.frame);
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.stage.stop();
  }

  /** Off: stop drawing (the story is far from the viewport); the hat stays loaded. */
  setDecoding(on: boolean): void {
    if (on) this.start();
    else this.pause();
  }

  /** Move to a fractional frame of the timeline (0 … INTRO_FRAMES − 1). */
  seek(index: number): void {
    this.frame = Math.min(INTRO_FRAMES - 1, Math.max(0, index));
    this.pose(this.frame);
  }

  /** Render a pose and hand back a picture of it (reduced-motion stills). */
  snapshot(index: number, type = 'image/webp'): string {
    this.place();
    this.pose(index);
    this.stage.render();
    return this.stage.canvas.toDataURL(type, 0.92);
  }

  destroy(): void {
    this.disposed = true;
    this.pause();
    this.stage.dispose();
  }

  /** Keep the hat in the space above the caption card and clear of the beat rail and the top bar. */
  private place(): void {
    const w = this.stage.width;
    const h = this.stage.height;
    const phone = w < 700;
    const top = phone ? 140 : 84;
    // the caption card and (on the last beat) the Start button sit along the bottom
    const bottom = phone ? Math.min(250, h * 0.3) : Math.min(250, h * 0.28);
    // a centred stage, never wider than a little more than it is tall, so the hat stays a hat-sized hat
    const width = Math.min(w - (phone ? 24 : 192), (h - top - bottom) * 1.5);
    const rect: Rect = { x: (w - width) / 2, y: top, width: Math.max(1, width), height: Math.max(1, h - top - bottom) };
    this.stage.setRect(rect, 0);
  }

  private pose(fIndex: number): void {
    const hat = this.hat;
    if (!hat) return;
    const f = fIndex + 1; // Blender frames start at 1
    this.shown = Math.round(fIndex);

    hat.assembly.rotation.y = keyed(f, YAW) * DEG;
    const lift = (name: string, metres: number, w: number) => {
      const p = this.parts.get(name);
      if (p) p.obj.position.copy(p.pos).addScaledVector(UP, metres * w);
    };
    lift('strap_rig', -0.2, away(f, 31, 50, 212, 230));
    lift('stitches_white', 0.56, away(f, 35, 62, 200, 215));
    lift('poem_art', 0.33, away(f, 55, 80, 172, 186));
    lift('mo_bark', 0.23, away(f, 60, 85, 165, 180));
    lift('leaf_inner', 0.12, away(f, 65, 90, 155, 172));
    const cap = away(f, 78, 96, 198, 207);
    lift('leaf_outer_cap', 0.47, cap);
    lift('apex_cap', 0.47, cap);

    const b = away(f, 60, 90, 205, 218);
    for (const p of this.brim) {
      p.obj.scale.set(p.scale.x * (1 + 0.22 * b), p.scale.y, p.scale.z * (1 + 0.22 * b));
      p.obj.position.copy(p.pos).addScaledVector(UP, -0.05 * b);
    }
    this.rings.forEach((p, k) => {
      const i = k + 1;
      p.obj.position.copy(p.pos).addScaledVector(UP, 0.012 * (i - 1) * away(f, 70 + i, 100, 141 + Math.floor(i / 2), 160));
    });
    for (const p of this.panels) {
      const w = away(f, 40 + 2 * p.j, 72 + 2 * p.j, 180 + p.j, 196 + p.j);
      p.obj.quaternion.slerpQuaternions(p.quat, p.open, w);
      p.obj.position.copy(p.pos).addScaledVector(UP, 0.42 * w).addScaledVector(p.outward, 0.07 * w);
    }

    const fr = this.stage.framing;
    fr.cx = 0;
    fr.cz = 0;
    fr.cy = keyed(f, CY);
    fr.halfW = keyed(f, HALF_W);
    fr.halfH = keyed(f, HALF_H);
    fr.elev = keyed(f, ELEV) * DEG;
    fr.margin = 1.04;
    gsap.killTweensOf(fr);
    this.stage.invalidate();
  }
}
