/**
 * The WebGL stage: renderer, warm lights, camera framing, a render-on-demand loop and screen
 * projection helpers. The camera only moves when a screen asks for a new frame or a layer needs a
 * pose; the child turns the hat itself (see rotator.ts).
 *
 *   scene
 *   ├─ lights, soft contact shadow (inside rig)
 *   └─ rig (placement: lift, scale-in, shrink)      ← script only
 *      └─ spin (yaw / pitch)                         ← the child's drag + scripted turns
 *         └─ pivot (−hat centre, so it turns about its middle)
 *            └─ nonla_root → hat_assembly → parts
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Anim } from './anim';
import { defaultFrame, fitDistance, viewOffset, type Extent, type Rect } from './framing';

export const HAT_CENTRE_Y = 0.095;

/** returns true while it still needs frames (inertia, rope, glow fades) */
export type FrameFn = (dt: number, time: number) => boolean | void;

export interface Framing {
  /** subject centre in world space (the camera looks here) */
  cx: number;
  cy: number;
  cz: number;
  halfW: number;
  halfH: number;
  /** camera elevation (radians) */
  elev: number;
  margin: number;
}

export const DEFAULT_FRAMING: Framing = { cx: 0, cy: 0, cz: 0, halfW: 0.27, halfH: 0.2, elev: 0.26, margin: 1.06 };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLDivElement;
  readonly rig = new THREE.Group();
  readonly spin = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly anim: Anim;
  readonly framing: Framing = { ...DEFAULT_FRAMING };
  /** screen rect (viewport px) the subject sits in; null = defaultFrame */
  frameRect: Rect | null = null;
  private rectFrom: Rect | null = null;
  private rectTo: Rect | null = null;
  readonly rectMix = { t: 1 };
  private frameFns = new Set<FrameFn>();
  private needs = true;
  private running = false;
  private size = { w: 1, h: 1, left: 0, top: 0 };
  private ro: ResizeObserver | null = null;
  private pmrem: THREE.PMREMGenerator;
  private envTex: THREE.Texture;
  private lastTime = 0;
  private afterRender = new Set<() => void>();

  constructor(readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hat-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      // MSAA only where pixels are big; also off for automated tests (software GL is slow)
      antialias: (window.devicePixelRatio || 1) < 2 && !new URLSearchParams(location.search).has('test'),
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral keeps the straw golden (AgX greys it out a little at this exposure)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000, 0);

    this.overlay = document.createElement('div');
    this.overlay.className = 'hat-overlay';
    host.append(this.canvas, this.overlay);

    this.anim = new Anim(() => this.invalidate());

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = warmRoom();
    this.envTex = this.pmrem.fromScene(env, 0.04).texture;
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.4;

    // warm afternoon light from the upper left, a soft fill, and a rim that outlines the cone
    const hemi = new THREE.HemisphereLight(0xfff3d6, 0xb85f36, 0.65);
    const key = new THREE.DirectionalLight(0xffd59a, 2.9);
    key.position.set(-1.0, 1.1, 0.7);
    const fill = new THREE.DirectionalLight(0xfff1dc, 0.6);
    fill.position.set(1.0, 0.3, 0.9);
    const rim = new THREE.DirectionalLight(0xffe2b0, 1.3);
    rim.position.set(0.6, 0.9, -1.1);
    // a soft light from the child's side, so the underside (Layer 4) isn't left in the dark
    const front = new THREE.DirectionalLight(0xfff0d8, 0.45);
    front.position.set(0.2, -0.15, 1);
    this.scene.add(hemi, key, fill, rim, front);

    this.shadow = makeContactShadow();
    this.rig.add(this.shadow);
    this.rig.add(this.spin);
    this.spin.add(this.pivot);
    this.spin.position.y = HAT_CENTRE_Y;
    this.pivot.position.y = -HAT_CENTRE_Y;
    this.scene.add(this.rig);

    this.framing.cy = HAT_CENTRE_Y;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onWindowResize);
  }

  get width(): number {
    return this.size.w;
  }

  get height(): number {
    return this.size.h;
  }

  invalidate(): void {
    this.needs = true;
  }

  /** run `fn` on every rendered frame until it is removed (returns the remover) */
  onFrame(fn: FrameFn): () => void {
    this.frameFns.add(fn);
    this.invalidate();
    return () => this.frameFns.delete(fn);
  }

  onAfterRender(fn: () => void): () => void {
    this.afterRender.add(fn);
    return () => this.afterRender.delete(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    gsap.ticker.add(this.tick);
    this.invalidate();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  /** move the subject into `rect` (viewport px), easing between frames */
  setRect(rect: Rect | null, duration = 0.6): void {
    const from = this.currentRect();
    this.rectFrom = from;
    this.rectTo = rect;
    this.frameRect = rect;
    gsap.killTweensOf(this.rectMix);
    if (duration <= 0) {
      this.rectMix.t = 1;
      this.invalidate();
      return;
    }
    this.rectMix.t = 0;
    this.anim.to(this.rectMix, { t: 1, duration, ease: 'power2.inOut' });
  }

  currentRect(): Rect {
    const target = this.rectTo ?? defaultFrame(this.size.w, this.size.h);
    if (this.rectMix.t >= 1 || !this.rectFrom) return target;
    const a = this.rectFrom;
    const t = this.rectMix.t;
    return {
      x: a.x + (target.x - a.x) * t,
      y: a.y + (target.y - a.y) * t,
      width: a.width + (target.width - a.width) * t,
      height: a.height + (target.height - a.height) * t,
    };
  }

  /** tween the framing (subject centre/extent/elevation) */
  frameTo(f: Partial<Framing>, duration = 0.8, ease = 'power2.inOut'): gsap.core.Tween {
    return this.anim.to(this.framing, { ...f, duration, ease, overwrite: 'auto' });
  }

  /** world → viewport px */
  toScreen(v: THREE.Vector3, out = { x: 0, y: 0, visible: false }): { x: number; y: number; visible: boolean } {
    const p = TMP.copy(v).project(this.camera);
    out.x = this.size.left + (p.x * 0.5 + 0.5) * this.size.w;
    out.y = this.size.top + (-p.y * 0.5 + 0.5) * this.size.h;
    out.visible = p.z < 1 && p.z > -1 && out.x >= 0 && out.y >= 0 && out.x <= this.size.left + this.size.w && out.y <= this.size.top + this.size.h;
    return out;
  }

  /** viewport px → a ray from the camera */
  raycaster(x: number, y: number): THREE.Raycaster {
    const ndc = new THREE.Vector2(((x - this.size.left) / this.size.w) * 2 - 1, -((y - this.size.top) / this.size.h) * 2 + 1);
    RAY.setFromCamera(ndc, this.camera);
    return RAY;
  }

  hit(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    if (!objects.length) return null;
    this.updateCamera();
    this.scene.updateMatrixWorld();
    const hits = this.raycaster(x, y).intersectObjects(objects, true);
    return hits[0] ?? null;
  }

  /** camera right (world) — used to float pieces "to the side" on screen */
  cameraRight(out = new THREE.Vector3()): THREE.Vector3 {
    return out.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
  }

  /** px per metre at the subject's distance */
  pxPerMetre(): number {
    const d = this.camera.position.distanceTo(TMP.set(this.framing.cx, this.framing.cy, this.framing.cz));
    return this.size.h / 2 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * d);
  }

  updateCamera(): void {
    const f = this.framing;
    const rect = this.currentRect();
    const ext: Extent = { halfW: f.halfW, halfH: f.halfH };
    const d = fitDistance(ext, rect, this.size.h, THREE.MathUtils.degToRad(this.camera.fov), f.margin);
    this.camera.position.set(f.cx, f.cy + Math.sin(f.elev) * d, f.cz + Math.cos(f.elev) * d);
    this.camera.lookAt(f.cx, f.cy, f.cz);
    const off = viewOffset(rect, this.size.w, this.size.h);
    this.camera.setViewOffset(this.size.w, this.size.h, off.x, off.y, this.size.w, this.size.h);
    this.camera.updateMatrixWorld();
  }

  render(): void {
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    for (const fn of this.afterRender) fn();
  }

  private tick = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 20);
    this.lastTime = now;
    if (!this.needs) return;
    this.needs = false;
    let keep = false;
    for (const fn of this.frameFns) if (fn(dt, now / 1000)) keep = true;
    this.render();
    if (keep) this.needs = true;
  };

  private onWindowResize = (): void => this.resize();

  resize(): void {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width || window.innerWidth));
    const h = Math.max(1, Math.round(r.height || window.innerHeight));
    this.size = { w, h, left: r.left, top: r.top };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // a narrower lens on phones keeps the hat from looking stretched at the edges
    this.camera.fov = w / h < 0.8 ? 34 : 30;
    this.camera.updateProjectionMatrix();
    this.invalidate();
    if (this.running) this.render();
  }

  dispose(): void {
    this.stop();
    this.anim.dispose();
    this.ro?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.envTex.dispose();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) disposeMaterial(mat);
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }
}

const TMP = new THREE.Vector3();
const RAY = new THREE.Raycaster();

export function disposeMaterial(mat: THREE.Material): void {
  for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
  mat.dispose();
}

/**
 * Reflections come from a warm "workshop": cream sky, straw walls, wooden floor and one sunny
 * window. A neutral studio would turn the glossy leaves silver wherever they catch the light at a
 * grazing angle (the underside view in Layer 4); this keeps every reflection golden.
 */
function warmRoom(): THREE.Scene {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color('#FFF6E2') },
        mid: { value: new THREE.Color('#E9C88A') },
        bottom: { value: new THREE.Color('#7A5A3A') },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, y)) : mix(mid, bottom, smoothstep(0.0, 0.5, -y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 2.0) }));
  sun.position.set(-2.6, 2.4, 2.4);
  sun.lookAt(0, 0, 0);
  scene.add(sky, sun);
  return scene;
}

/** a soft radial blob under the brim (no real-time shadows needed) */
function makeContactShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(70,40,15,0.55)');
  grd.addColorStop(0.55, 'rgba(70,40,15,0.22)');
  grd.addColorStop(1, 'rgba(70,40,15,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.012;
  mesh.renderOrder = -1;
  mesh.name = 'contact_shadow';
  return mesh;
}
