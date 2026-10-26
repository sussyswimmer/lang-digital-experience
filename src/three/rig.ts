/**
 * Everything the four layers share on top of the raw model: the child's rotation, part states
 * (home / peeled / away), the stitch glow and floating piece, the leaf peel + curl, the strap rope,
 * poses and labels. One Rig per viewer; layer controllers drive it.
 */
import * as THREE from 'three';
import type { LayerId } from '../app/types';
import type { SfxId } from '../audio/sfx';
import { Anim } from './anim';
import { Hat, pad } from './hat';
import { Labels } from './labels';
import { Rotator, type GestureTarget } from './rotator';
import { HAT_CENTRE_Y, Stage, type Framing, DEFAULT_FRAMING } from './scene';
import { GlowDots, HaloShell, StitchGlow, clearGlow, setOpacity, setXray } from './fx';
import { Rope, type V3 } from './rope';
import { nearestAngle } from './framing';

export type Sound = (id: SfxId, opts?: { step?: number }) => void;

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);

export const STRAP_COLOURS = { purple: '#8E5BA8', peach: '#F4A79A', green: '#A9D8A0' } as const;
export type StrapColour = keyof typeof STRAP_COLOURS;

/** how far the floating stitches sit from the hat (world metres, along camera-right) */
export const FLOAT_DIST = 0.54;
const PEEL_ANGLE = THREE.MathUtils.degToRad(42);

// ------------------------------------------------------------------ stitches

export class StitchRig {
  readonly group: THREE.Object3D;
  readonly rows: { name: string; ring: number; mesh: THREE.Mesh; glow: StitchGlow; dots: GlowDots; count: number }[] = [];
  /** 0 = sewn on the hat, 1 = floating beside it */
  readonly float = { f: 0, lift: 0, bob: 0 };
  readonly halo: HaloShell;
  readonly proxy: THREE.Mesh;

  constructor(hat: Hat) {
    this.group = hat.get('stitches_white');
    for (const row of hat.meta.stitch_rows) {
      if (!hat.has(row.name)) continue;
      const mesh = hat.get(row.name) as THREE.Mesh;
      const glow = new StitchGlow(mesh, row.count, 0xffc94a);
      const dots = new GlowDots(row.points, 0xffd27a, 22 * Math.min(window.devicePixelRatio || 1, 2));
      this.group.add(dots.points);
      this.rows.push({ name: row.name, ring: row.ring, mesh, glow, dots, count: row.count });
    }
    this.halo = new HaloShell(this.rows.map((r) => r.mesh), 0xffd27a, { width: 0.0022, base: 0.35 });
    // a cone shell around all the rows: thin threads are impossible to tap otherwise
    const r0 = hat.meta.rings[1]?.r ?? 0.225;
    const y0 = hat.meta.rings[1]?.y ?? 0.013;
    const yTop = (hat.meta.rings[15]?.y ?? 0.2) + 0.01;
    const geo = new THREE.CylinderGeometry(0.02, r0 + 0.02, yTop - y0 + 0.02, 32, 1, true);
    this.proxy = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.proxy.position.y = (yTop + y0) / 2;
    this.proxy.userData.helper = true;
    this.proxy.name = 'stitches_hit_proxy';
    this.group.add(this.proxy);
  }

  row(name: string) {
    return this.rows.find((r) => r.name === name);
  }

  setRowGlow(name: string, v: number): void {
    const r = this.row(name);
    if (!r) return;
    r.glow.setAll(v);
    r.dots.values.fill(v);
  }

  setAllGlow(v: number): void {
    for (const r of this.rows) {
      r.glow.setAll(v);
      r.dots.values.fill(v);
    }
  }

  flush(): void {
    for (const r of this.rows) {
      r.glow.flush();
      r.dots.flush();
    }
  }

  get floating(): boolean {
    return this.float.f > 0.5;
  }

  /** keep the floating piece beside the hat on screen, turned exactly like the hat */
  updateFloat(stage: Stage, assembly: THREE.Object3D): void {
    const f = this.float;
    if (f.f <= 0 && f.lift <= 0) {
      if (this.group.position.lengthSq() > 0) this.group.position.set(0, 0, 0);
      return;
    }
    assembly.updateWorldMatrix(true, false);
    assembly.matrixWorld.decompose(TMP2, Q, TMP);
    const s = TMP.x || 1;
    const right = stage.cameraRight(new THREE.Vector3());
    const world = right.multiplyScalar(FLOAT_DIST * f.f).addScaledVector(UP, 0.025 * f.lift + f.bob);
    this.group.position.copy(world.applyQuaternion(Q.invert()).divideScalar(s));
  }
}

// ------------------------------------------------------------------ leaves

const CURL_PARS = `
uniform float uPeel;
uniform float uCurlR;
uniform float uLen;
uniform float uScale;
uniform vec3 uOffset;
vec3 curlPos;
`;

const CURL_CODE = `
{
  // hinge space: -z runs from the hinge down to the brim, +y points outward
  vec3 hp = position * uScale + uOffset;
  curlPos = position;
  float d = -hp.z;
  float d0 = uLen * (1.0 - uPeel);
  if (uPeel > 0.0 && d > d0) {
    float a = d - d0;
    float phiMax = 1.9;
    float phi = min(a / uCurlR, phiMax);
    float dn = d0 + uCurlR * sin(phi);
    float nn = hp.y + uCurlR * (1.0 - cos(phi));
    float rest = max(0.0, a - uCurlR * phiMax);
    dn += rest * cos(phiMax);
    nn += rest * sin(phiMax);
    hp.z = -dn;
    hp.y = nn;
    float c = cos(phi);
    float s = sin(phi);
    objectNormal = vec3(objectNormal.x, objectNormal.y * c - objectNormal.z * s, objectNormal.y * s + objectNormal.z * c);
    curlPos = (hp - uOffset) / uScale;
  }
}
`;

export interface PanelState {
  index: number;
  hinge: THREE.Object3D;
  mesh: THREE.Mesh;
  peel: { value: number };
  /** 'on' the hat, or peeled and gone */
  state: 'on' | 'away';
  az: number;
  radial: THREE.Vector3;
}

export class PanelRig {
  readonly panels: PanelState[] = [];

  constructor(hat: Hat) {
    for (const p of hat.meta.panels) {
      if (!hat.has(p.hinge) || !hat.has(p.name)) continue;
      const hinge = hat.get(p.hinge);
      const mesh = hat.get(p.name) as THREE.Mesh;
      const peel = { value: 0 };
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const uniforms = {
        uPeel: peel,
        uCurlR: { value: 0.04 },
        uLen: { value: p.len },
        uScale: { value: mesh.scale.x },
        uOffset: { value: mesh.position.clone() },
      };
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${CURL_PARS}`)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${CURL_CODE}`)
          .replace('#include <begin_vertex>', 'vec3 transformed = curlPos;');
      };
      mat.customProgramCacheKey = () => 'leaf-curl';
      mat.needsUpdate = true;
      mesh.frustumCulled = false; // the curl moves vertices outside the static bounds
      const radial = new THREE.Vector3(p.hinge_point[0], 0, p.hinge_point[2]).normalize();
      const idx = Number(p.name.slice(-2));
      this.panels.push({ index: idx, hinge, mesh, peel, state: 'on', az: p.az_deg, radial });
    }
  }

  get peeledCount(): number {
    return this.panels.filter((p) => p.state === 'away').length;
  }

  setPeel(p: PanelState, v: number, hat: Hat): void {
    p.peel.value = v;
    const home = hat.home(p.hinge);
    p.hinge.quaternion.copy(home.quaternion).multiply(Q.setFromAxisAngle(AXIS_X, v * PEEL_ANGLE));
  }
}

// ------------------------------------------------------------------ strap rope

export class StrapRig {
  readonly rope: Rope;
  readonly ribbon: THREE.Mesh;
  readonly halo: HaloShell;
  readonly proxy: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly yarnMaterials: THREE.MeshStandardMaterial[];
  private positions: Float32Array;
  private normals: Float32Array;
  private restMid: V3;
  private width: number;
  /** seconds since the last tap (wind gust clock); < 0 = calm */
  gustT = -1;
  gustAmp = 1.6;
  simulating = false;

  constructor(
    private hat: Hat,
    readonly rig: THREE.Object3D,
  ) {
    const meta = hat.meta.strap;
    const orig = hat.get('strap') as THREE.Mesh;
    orig.visible = false;
    this.material = (orig.material as THREE.MeshStandardMaterial).clone();
    this.material.side = THREE.DoubleSide;
    this.material.userData = { ...(orig.material as THREE.Material).userData };
    this.width = meta.width * 1.25;
    const pts = meta.rest_points;
    this.rope = new Rope(pts as V3[], { damping: 0.992, iterations: 14, bend: 0.25 });
    this.rope.pin(0, meta.anchor_L);
    this.rope.pin(pts.length - 1, meta.anchor_R);
    const n = pts.length;
    this.positions = new Float32Array(n * 2 * 3);
    this.normals = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 6;
      uvs.set([u, 0, u, 1], i * 4);
      if (i < n - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    this.ribbon = new THREE.Mesh(geo, this.material);
    this.ribbon.name = 'strap_ribbon';
    this.ribbon.frustumCulled = false;
    rig.add(this.ribbon);
    const mid = pts[Math.floor(n / 2)];
    const am = [(meta.anchor_L[0] + meta.anchor_R[0]) / 2, (meta.anchor_L[1] + meta.anchor_R[1]) / 2, (meta.anchor_L[2] + meta.anchor_R[2]) / 2];
    this.restMid = [mid[0] - am[0], mid[1] - am[1], mid[2] - am[2]];
    this.halo = new HaloShell([this.ribbon], 0xffe08a, { width: 0.004, base: 0.55, side: THREE.DoubleSide });
    // a fat invisible tube along the rest curve: easy to tap
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    this.proxy = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.03, 8, false), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.userData.helper = true;
    this.proxy.name = 'strap_hit_proxy';
    rig.add(this.proxy);
    this.yarnMaterials = ['strap_knot_L', 'strap_knot_R', 'strap_yarn_L', 'strap_yarn_R']
      .filter((nm) => hat.has(nm))
      .map((nm) => (hat.get(nm) as THREE.Mesh).material as THREE.MeshStandardMaterial);
    this.rope.settle(240, 1 / 120, [0, -4.9, 0]);
    this.rebuild();
  }

  setColour(c: StrapColour): void {
    const col = new THREE.Color(STRAP_COLOURS[c]);
    this.material.color.copy(col);
    for (const m of this.yarnMaterials) m.color.copy(col).multiplyScalar(0.55);
  }

  /** gather the strap up under the brim so it can drop down and settle */
  gather(): void {
    const meta = this.hat.meta.strap;
    const n = meta.rest_points.length;
    const pts: V3[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push([
        meta.anchor_L[0] + (meta.anchor_R[0] - meta.anchor_L[0]) * t,
        meta.anchor_L[1] - Math.sin(Math.PI * t) * 0.03,
        meta.anchor_L[2] + 0.02 * Math.sin(Math.PI * t),
      ]);
    }
    this.rope.reset(pts);
    this.rebuild();
  }

  restShape(): void {
    this.rope.reset(this.hat.meta.strap.rest_points as V3[]);
    this.rope.settle(60, 1 / 120, [0, -4.9, 0]);
    this.rebuild();
  }

  tapGust(): void {
    this.gustT = 0;
    this.simulating = true;
  }

  get swing(): number {
    return this.rope.swingAngle(0, this.rope.n - 1, this.restMid);
  }

  /** simulate in hat space; gravity is world-down, the gust pushes front-to-back across the anchors */
  step(dt: number, assembly: THREE.Object3D, gustAmp: number): boolean {
    if (!this.simulating) return false;
    assembly.updateWorldMatrix(true, false);
    assembly.matrixWorld.decompose(TMP2, Q, TMP);
    Q.invert();
    const g = TMP.set(0, -4.9, 0).applyQuaternion(Q);
    const sub = 1 / 120;
    let steps = Math.max(1, Math.round(dt / sub));
    steps = Math.min(steps, 6);
    for (let k = 0; k < steps; k++) {
      let wind = 0;
      if (this.gustT >= 0) {
        this.gustT += sub;
        const t = this.gustT;
        wind = gustAmp * Math.sin(2 * Math.PI * 0.75 * t) * Math.exp(-t / 2.4);
      }
      this.rope.step(sub, [g.x, g.y, g.z + wind]);
    }
    this.rebuild();
    const moving = this.rope.motion() > 2e-5 || (this.gustT >= 0 && this.gustT < 7);
    if (!moving) this.simulating = false;
    return moving;
  }

  rebuild(): void {
    const r = this.rope;
    const n = r.n;
    const a = r.point(0);
    const b = r.point(n - 1);
    const mid = r.point(Math.floor(n / 2));
    const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const down = new THREE.Vector3(mid[0] - (a[0] + b[0]) / 2, mid[1] - (a[1] + b[1]) / 2, mid[2] - (a[2] + b[2]) / 2);
    if (down.lengthSq() < 1e-8) down.set(0, -1, 0);
    // the ribbon's width lies across the swing plane (front–back of the hat at rest)
    const across = new THREE.Vector3().crossVectors(axis, down).normalize();
    if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
    const T = new THREE.Vector3();
    const W = new THREE.Vector3();
    const N = new THREE.Vector3();
    const hw = this.width / 2;
    for (let i = 0; i < n; i++) {
      const p0 = r.point(Math.max(0, i - 1));
      const p1 = r.point(Math.min(n - 1, i + 1));
      T.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      W.copy(across).addScaledVector(T, -T.dot(across)).normalize();
      N.crossVectors(T, W).normalize();
      const p = r.point(i);
      this.positions.set([p[0] - W.x * hw, p[1] - W.y * hw, p[2] - W.z * hw, p[0] + W.x * hw, p[1] + W.y * hw, p[2] + W.z * hw], i * 6);
      this.normals.set([N.x, N.y, N.z, N.x, N.y, N.z], i * 6);
    }
    const g = this.ribbon.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }

  /** the lowest point of the strap (hat space) */
  lowest(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.rope.point(Math.floor(this.rope.n / 2));
    return out.set(p[0], p[1], p[2]);
  }
}

// ------------------------------------------------------------------ the rig

export interface Pose {
  yaw: number;
  pitch: number;
  lift: number;
}

export const DEFAULT_POSE: Pose = { yaw: -0.35, pitch: 0.12, lift: 0 };

export class Rig {
  readonly rot: Rotator;
  readonly labels: Labels;
  readonly stitches: StitchRig;
  readonly panels: PanelRig;
  readonly strap: StrapRig;
  readonly anim: Anim;
  /** extra rig placement (scripted): lift in metres, uniform scale */
  readonly place = { lift: 0, scale: 1 };
  sound: Sound = () => {};
  private gesture: GestureTarget | null = null;
  private offFrame: () => void;
  private offAfter: () => void;

  constructor(
    readonly stage: Stage,
    readonly hat: Hat,
  ) {
    stage.pivot.add(hat.root);
    this.anim = stage.anim.child();
    this.rot = new Rotator(stage.canvas, () => stage.invalidate());
    this.rot.yaw = DEFAULT_POSE.yaw;
    this.rot.pitch = DEFAULT_POSE.pitch;
    this.labels = new Labels(stage.overlay, stage);
    this.stitches = new StitchRig(hat);
    this.panels = new PanelRig(hat);
    this.strap = new StrapRig(hat, hat.get('strap_rig'));
    this.offFrame = stage.onFrame((dt) => this.frame(dt));
    this.offAfter = stage.onAfterRender(() => this.labels.update());
    this.applyTransforms();
  }

  setGesture(g: GestureTarget | null): void {
    this.gesture = g;
    this.rot.target = g;
  }

  get currentGesture(): GestureTarget | null {
    return this.gesture;
  }

  /** all of the child's turning, scripted lifts and floating pieces, every frame */
  private frame(dt: number): boolean {
    let keep = this.rot.update(dt);
    if (this.strap.step(dt, this.hat.assembly, this.strap.gustAmp)) keep = true;
    this.applyTransforms();
    return keep;
  }

  applyTransforms(): void {
    const s = this.stage;
    s.spin.rotation.set(this.rot.pitch, this.rot.yaw, 0, 'XYZ');
    s.rig.position.y = this.place.lift;
    s.rig.scale.setScalar(Math.max(this.place.scale, 1e-4));
    s.scene.updateMatrixWorld();
    s.updateCamera();
    this.stitches.updateFloat(s, this.hat.assembly);
    this.stitches.flush();
  }

  /** turn to a pose (shortest way round), optionally with a lift */
  pose(p: Partial<Pose>, duration = 1.2, anim: Anim = this.anim): gsap.core.Tween {
    const target: Record<string, number> = {};
    if (p.yaw !== undefined) target.yaw = nearestAngle(this.rot.yaw, p.yaw);
    if (p.pitch !== undefined) target.pitch = p.pitch;
    this.rot.stop();
    if (p.lift !== undefined) anim.to(this.place, { lift: p.lift, duration, ease: 'power2.inOut' });
    return anim.to(this.rot, { ...target, duration, ease: 'power2.inOut' });
  }

  frameTo(f: Partial<Framing>, duration = 1): gsap.core.Tween {
    return this.stage.frameTo(f, duration);
  }

  defaultFraming(duration = 1): gsap.core.Tween {
    return this.frameTo({ ...DEFAULT_FRAMING, cy: HAT_CENTRE_Y }, duration);
  }

  // -------------------------------------------------------------- part states

  isAway(obj: THREE.Object3D): boolean {
    return !!obj.userData.away;
  }

  snapAway(obj: THREE.Object3D): void {
    obj.userData.away = true;
    obj.visible = false;
  }

  snapHome(obj: THREE.Object3D): void {
    obj.userData.away = false;
    obj.visible = true;
    this.hat.snapHome(obj);
    setOpacity(this.hat.meshes(obj), 1);
  }

  /** fly a part off the hat (outward + up), shrinking and fading, then hide it */
  sendAway(obj: THREE.Object3D, anim: Anim, opts: { dir?: THREE.Vector3; dist?: number; duration?: number; delay?: number; spin?: number } = {}): gsap.core.Tween {
    const home = this.hat.home(obj);
    const dir = (opts.dir ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    const dist = opts.dist ?? 0.45;
    const meshes = this.hat.meshes(obj);
    const st = { t: 0 };
    obj.userData.away = true;
    const startPos = obj.position.clone();
    const startScale = obj.scale.clone();
    const startQ = obj.quaternion.clone();
    const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), opts.spin ?? 0);
    return anim.to(st, {
      t: 1,
      duration: opts.duration ?? 0.7,
      delay: opts.delay ?? 0,
      ease: 'power2.in',
      onUpdate: () => {
        const t = st.t;
        obj.position.copy(startPos).addScaledVector(dir, dist * t).addScaledVector(UP, 0.12 * Math.sin(Math.PI * t * 0.5));
        obj.scale.copy(startScale).multiplyScalar(1 - 0.7 * t);
        obj.quaternion.copy(startQ).multiply(TMPQ.copy(spinQ).slerp(IDQ, 1 - t));
        setOpacity(meshes, 1 - t * t);
      },
      onComplete: () => {
        obj.visible = false;
        obj.position.copy(home.position);
        obj.scale.copy(home.scale);
      },
    });
  }

  /** fly a hidden part back home along an arc */
  bringBack(obj: THREE.Object3D, anim: Anim, opts: { dir?: THREE.Vector3; dist?: number; duration?: number; delay?: number; onLand?: () => void } = {}): gsap.core.Tween {
    const home = this.hat.home(obj);
    const dir = (opts.dir ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    const dist = opts.dist ?? 0.45;
    const meshes = this.hat.meshes(obj);
    const st = { t: 0 };
    const from = obj.userData.away ? home.position.clone().addScaledVector(dir, dist) : obj.position.clone();
    const fromScale = obj.userData.away ? 0.3 : obj.scale.x / (home.scale.x || 1);
    const wasAway = !!obj.userData.away;
    return anim.to(st, {
      t: 1,
      duration: opts.duration ?? 0.7,
      delay: opts.delay ?? 0,
      ease: 'power2.out',
      onStart: () => {
        obj.visible = true;
        obj.userData.away = false;
        if (wasAway) setOpacity(meshes, 0);
      },
      onUpdate: () => {
        const t = st.t;
        obj.position.lerpVectors(from, home.position, t).addScaledVector(UP, 0.1 * Math.sin(Math.PI * t));
        obj.scale.copy(home.scale).multiplyScalar(fromScale + (1 - fromScale) * t);
        obj.quaternion.copy(home.quaternion);
        setOpacity(meshes, Math.min(1, t * 1.6));
      },
      onComplete: () => {
        this.hat.snapHome(obj);
        setOpacity(meshes, 1);
        opts.onLand?.();
      },
    });
  }

  /**
   * Put parts into the state a layer starts from: stitches → whole hat; leaves → stitches gone;
   * frame → outer leaves gone too; strap → inner shells gone too (they all fly back in L4).
   */
  prepare(layer: LayerId, anim: Anim, animate: boolean): void {
    const order: LayerId[] = ['stitches', 'leaves', 'frame', 'strap'];
    const level = order.indexOf(layer);
    const h = this.hat;
    const stitches = h.get('stitches_white');
    const caps = ['leaf_outer_cap', 'apex_cap'].filter((n) => h.has(n)).map((n) => h.get(n));
    const inner = ['poem_art', 'mo_bark', 'leaf_inner'].filter((n) => h.has(n)).map((n) => h.get(n));
    const right = this.stage.cameraRight();
    // reset looks that only belong inside a layer
    this.stitches.setAllGlow(0);
    this.stitches.halo.intensity = 0;
    setXray(inner.flatMap((o) => h.meshes(o)), 0);
    clearGlow(h.meshes('frame'));
    clearGlow(h.meshes('brim'));
    this.strap.halo.intensity = 0;
    this.labels.clear();
    for (let i = 1; i <= 16; i++) {
      const ring = h.has(`ring_${pad(i)}`) ? h.get(`ring_${pad(i)}`) : null;
      if (ring) h.snapHome(ring);
    }
    h.get('strap_rig').visible = false;
    this.strap.simulating = false;

    // stitches: on the hat for L1, gone from L2
    if (level === 0) {
      if (this.stitches.float.f > 0 || stitches.userData.away) {
        const wasAway = !!stitches.userData.away;
        stitches.visible = true;
        stitches.userData.away = false;
        const meshes = h.meshes(stitches);
        if (animate) {
          if (wasAway) Object.assign(this.stitches.float, { f: 1.6, lift: 4 });
          const st = { o: wasAway ? 0 : 1 };
          setOpacity(meshes, st.o);
          anim.to(st, { o: 1, duration: 0.6, onUpdate: () => setOpacity(meshes, st.o) });
          anim.to(this.stitches.float, { f: 0, lift: 0, bob: 0, duration: 0.8, ease: 'power2.inOut' });
        } else {
          setOpacity(meshes, 1);
          Object.assign(this.stitches.float, { f: 0, lift: 0, bob: 0 });
        }
      }
    } else if (!stitches.userData.away) {
      if (animate) {
        stitches.userData.away = true;
        const meshes = h.meshes(stitches);
        const st = { o: 1 };
        anim.to(this.stitches.float, { f: Math.max(this.stitches.float.f, 1) * 1.6, lift: 4, duration: 0.7, ease: 'power2.in' });
        anim.to(st, {
          o: 0,
          duration: 0.7,
          ease: 'power1.in',
          onUpdate: () => setOpacity(meshes, st.o),
          onComplete: () => {
            stitches.visible = false;
            Object.assign(this.stitches.float, { f: 0, lift: 0, bob: 0 });
          },
        });
      } else {
        this.snapAway(stitches);
        Object.assign(this.stitches.float, { f: 0, lift: 0, bob: 0 });
      }
    }

    // outer leaves + cap: on for L1–L2, gone from L3
    for (const p of this.panels.panels) {
      if (level <= 1) {
        if (p.state !== 'on' || p.peel.value !== 0) {
          p.state = 'on';
          if (animate) {
            this.bringBack(p.hinge, anim, { dir: p.radial.clone().add(UP), dist: 0.5, duration: 0.6, delay: 0.03 * p.index });
            anim.to(p.peel, { value: 0, duration: 0.6, delay: 0.03 * p.index, onUpdate: () => this.panels.setPeel(p, p.peel.value, h) });
          } else {
            this.snapHome(p.hinge);
            this.panels.setPeel(p, 0, h);
          }
        }
      } else if (p.state === 'on') {
        p.state = 'away';
        if (animate) {
          anim.to(p.peel, { value: 1, duration: 0.4, delay: 0.04 * p.index, onUpdate: () => this.panels.setPeel(p, p.peel.value, h) });
          this.sendAway(p.hinge, anim, { dir: p.radial.clone().add(UP), dist: 0.5, delay: 0.25 + 0.04 * p.index });
        } else {
          this.panels.setPeel(p, 1, h);
          this.snapAway(p.hinge);
        }
      }
    }
    for (const c of caps) {
      if (level <= 1) {
        if (c.userData.away || !c.visible) animate ? this.bringBack(c, anim, { dist: 0.4 }) : this.snapHome(c);
      } else if (!c.userData.away) {
        animate ? this.sendAway(c, anim, { dist: 0.4, delay: 0.5 }) : this.snapAway(c);
      }
    }

    // inner shells: present until L4 starts (it brings them back)
    for (const o of inner) {
      if (level <= 2) {
        if (o.userData.away || !o.visible) animate ? this.bringBack(o, anim, { dir: right.clone().negate().add(UP), dist: 0.5 }) : this.snapHome(o);
      } else if (!o.userData.away) {
        animate ? this.sendAway(o, anim, { dir: right.clone().negate().add(UP), dist: 0.5 }) : this.snapAway(o);
      }
    }
  }

  /** every part home, glow off, default view */
  resetAll(): void {
    this.anim.killAll();
    const h = this.hat;
    for (const name of ['stitches_white', 'leaf_outer_cap', 'apex_cap', 'poem_art', 'mo_bark', 'leaf_inner', 'frame']) {
      if (h.has(name)) this.snapHome(h.get(name));
    }
    for (const p of this.panels.panels) {
      p.state = 'on';
      this.snapHome(p.hinge);
      this.panels.setPeel(p, 0, h);
    }
    for (let i = 1; i <= 16; i++) if (h.has(`ring_${pad(i)}`)) h.snapHome(h.get(`ring_${pad(i)}`));
    Object.assign(this.stitches.float, { f: 0, lift: 0, bob: 0 });
    this.stitches.setAllGlow(0);
    this.stitches.halo.intensity = 0;
    setXray(['poem_art', 'mo_bark', 'leaf_inner'].filter((n) => h.has(n)).flatMap((n) => h.meshes(n)), 0);
    clearGlow(h.meshes(h.root));
    this.strap.halo.intensity = 0;
    this.strap.simulating = false;
    this.strap.restShape();
    h.get('strap_rig').visible = false;
    this.labels.clear();
    this.rot.stop();
    this.rot.locked = false;
    this.rot.yaw = DEFAULT_POSE.yaw;
    this.rot.pitch = DEFAULT_POSE.pitch;
    this.place.lift = 0;
    this.place.scale = 1;
    Object.assign(this.stage.framing, { ...DEFAULT_FRAMING, cy: HAT_CENTRE_Y });
    this.applyTransforms();
    this.stage.invalidate();
  }

  /** world anchor for a hat-space point */
  world(p: [number, number, number] | THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return this.hat.toWorld(p, out);
  }

  dispose(): void {
    this.offFrame();
    this.offAfter();
    this.anim.dispose();
    this.rot.dispose();
    this.labels.clear();
  }
}

const TMPQ = new THREE.Quaternion();
const IDQ = new THREE.Quaternion();
