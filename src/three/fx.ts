/**
 * Light effects without post-processing (tablets stay smooth): emissive tints, an additive fresnel
 * "halo shell" that outlines a part, per-stitch glow (a vertex attribute driven from the CPU), soft
 * halo sprites for the stitches, sparkle bursts and an x-ray look for the inner shells.
 */
import * as THREE from 'three';

type StdMat = THREE.MeshStandardMaterial;

export function materialsOf(meshes: THREE.Mesh[]): StdMat[] {
  return meshes.map((m) => m.material as StdMat).filter((m) => m && 'emissive' in m);
}

/** set emissive = colour × amount on top of each material's own emissive */
export function setGlow(meshes: THREE.Mesh[], color: THREE.ColorRepresentation, amount: number): void {
  const c = new THREE.Color(color);
  for (const mat of materialsOf(meshes)) {
    const base = mat.userData.baseEmissive as THREE.Color | undefined;
    mat.emissive.copy(base ?? new THREE.Color(0)).lerp(c, Math.min(1, amount));
    mat.emissiveIntensity = Math.max(mat.userData.baseEmissiveIntensity ?? 1, amount);
  }
}

export function clearGlow(meshes: THREE.Mesh[]): void {
  for (const mat of materialsOf(meshes)) {
    mat.emissive.copy((mat.userData.baseEmissive as THREE.Color) ?? new THREE.Color(0));
    mat.emissiveIntensity = mat.userData.baseEmissiveIntensity ?? 1;
  }
}

/** see-through shells so the frame shows inside (L3) */
export function setXray(meshes: THREE.Mesh[], amount: number): void {
  for (const mat of materialsOf(meshes)) {
    const baseOpacity = mat.userData.baseOpacity ?? 1;
    const wasTransparent = mat.transparent;
    if (amount <= 0) {
      mat.opacity = baseOpacity;
      mat.transparent = mat.userData.baseTransparent ?? false;
      mat.depthWrite = true;
    } else {
      mat.transparent = true;
      mat.opacity = baseOpacity * (1 - amount * 0.75);
      mat.depthWrite = amount < 0.5;
    }
    refreshProgram(mat, wasTransparent);
  }
}

/** fade whole parts (used while pieces fly away or back) */
export function setOpacity(meshes: THREE.Mesh[], opacity: number): void {
  for (const m of meshes) {
    const mat = m.material as StdMat;
    const base = mat.userData.baseOpacity ?? 1;
    const wasTransparent = mat.transparent;
    if (opacity >= 1) {
      mat.opacity = base;
      mat.transparent = mat.userData.baseTransparent ?? false;
      mat.depthWrite = true;
    } else {
      mat.transparent = true;
      mat.opacity = base * opacity;
      mat.depthWrite = opacity > 0.6;
    }
    refreshProgram(mat, wasTransparent);
  }
}

/**
 * three draws a transparent double-sided material in two single-sided passes, leaving the
 * front-side non-opaque program bound; when `transparent` flips, ask for a fresh one (else dark leaves)
 */
function refreshProgram(mat: THREE.Material, wasTransparent: boolean): void {
  if (mat.transparent !== wasTransparent) mat.needsUpdate = true;
}

// ---------------------------------------------------------------- halo shell

const HALO_VERT = /* glsl */ `
  uniform float uWidth;
  varying float vRim;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    mv.xyz += n * uWidth;
    vec3 v = normalize(-mv.xyz);
    vRim = 1.0 - abs(dot(n, v));
    gl_Position = projectionMatrix * mv;
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uBase;
  varying float vRim;
  void main() {
    float a = (uBase + (1.0 - uBase) * pow(vRim, 1.6)) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export class HaloShell {
  readonly meshes: THREE.Mesh[] = [];
  readonly material: THREE.ShaderMaterial;

  constructor(targets: THREE.Mesh[], color: THREE.ColorRepresentation, opts: { width?: number; base?: number; side?: THREE.Side } = {}) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: 0 },
        uWidth: { value: opts.width ?? 0.003 },
        uBase: { value: opts.base ?? 0.25 },
      },
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: opts.side ?? THREE.FrontSide,
      toneMapped: false,
    });
    for (const t of targets) {
      const shell = new THREE.Mesh(t.geometry, this.material);
      shell.userData.helper = true;
      shell.renderOrder = 5;
      shell.visible = false;
      shell.raycast = () => {};
      t.add(shell);
      this.meshes.push(shell);
    }
  }

  get intensity(): number {
    return this.material.uniforms.uIntensity.value as number;
  }

  set intensity(v: number) {
    this.material.uniforms.uIntensity.value = v;
    for (const m of this.meshes) m.visible = v > 0.001;
  }

  setColor(c: THREE.ColorRepresentation): void {
    (this.material.uniforms.uColor.value as THREE.Color).set(c);
  }

  dispose(): void {
    for (const m of this.meshes) m.removeFromParent();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------- per-stitch glow

/**
 * Adds `aGlow` (one value per vertex, from the GLB's `_stitch_t`) and patches the thread material so
 * each stitch can light up on its own and pop a hair outward. Returns a setter per stitch.
 */
export class StitchGlow {
  readonly values: Float32Array;
  private attr: THREE.BufferAttribute;
  private stitchOfVertex: Uint16Array;
  private dirty = false;

  constructor(
    readonly mesh: THREE.Mesh,
    readonly count: number,
    color: THREE.ColorRepresentation,
  ) {
    const geo = mesh.geometry;
    const n = geo.getAttribute('position').count;
    const t = geo.getAttribute('_stitch_t') as THREE.BufferAttribute | undefined;
    this.stitchOfVertex = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.stitchOfVertex[i] = t ? Math.round(t.getX(i) * (count - 1)) : 0;
    this.values = new Float32Array(count);
    this.attr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', this.attr);
    const scale = Math.max(mesh.scale.x, 1e-4);
    const mat = mesh.material as StdMat;
    const uniforms = {
      uGlowColor: { value: new THREE.Color(color) },
      uGlowGain: { value: 2.2 },
      uPop: { value: 0.0009 / scale },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;\nuniform float uPop;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\ntransformed += objectNormal * aGlow * uPop;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform vec3 uGlowColor;\nuniform float uGlowGain;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * vGlow * uGlowGain;\ndiffuseColor.a = min(1.0, diffuseColor.a + vGlow);',
        );
    };
    mat.customProgramCacheKey = () => 'stitch-glow';
    mat.needsUpdate = true;
  }

  set(i: number, v: number): void {
    if (this.values[i] === v) return;
    this.values[i] = v;
    this.dirty = true;
  }

  setAll(v: number): void {
    this.values.fill(v);
    this.dirty = true;
  }

  /** push changed values to the GPU */
  flush(): void {
    if (!this.dirty) return;
    const a = this.attr.array as Float32Array;
    for (let i = 0; i < a.length; i++) a[i] = this.values[this.stitchOfVertex[i]];
    this.attr.needsUpdate = true;
    this.dirty = false;
  }
}

// ---------------------------------------------------------------- halo sprites

const DOT_VERT = /* glsl */ `
  attribute float aGlow;
  uniform float uSize;
  varying float vGlow;
  void main() {
    vGlow = aGlow;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * aGlow;
    gl_Position = projectionMatrix * mv;
  }
`;

const DOT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.2) * vGlow;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** soft additive dots at given points (hat space), one brightness per point */
export class GlowDots {
  readonly points: THREE.Points;
  readonly values: Float32Array;
  private attr: THREE.BufferAttribute;
  readonly material: THREE.ShaderMaterial;

  constructor(positions: [number, number, number][], color: THREE.ColorRepresentation, sizePx: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
    this.values = new Float32Array(positions.length);
    this.attr = new THREE.BufferAttribute(this.values, 1);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', this.attr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: sizePx } },
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.userData.helper = true;
    this.points.renderOrder = 6;
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  setSize(px: number): void {
    this.material.uniforms.uSize.value = px;
  }

  flush(): void {
    this.attr.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------- sparkles

const PALETTE = [0xffd27a, 0xf6a623, 0xe0457b, 0x7fbf5e, 0xfff3d6, 0xe0a93b];

/** a short burst of palette sparkles around a point; call update(dt) each frame until it returns false */
export class Sparkles {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private life: Float32Array;
  private pos: Float32Array;
  private alpha: Float32Array;
  private age = 0;

  constructor(count: number, origin: THREE.Vector3, radius: number, sizePx = 18) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.alpha = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const p = origin.clone().addScaledVector(dir, radius * Math.random() * 0.6);
      this.pos.set([p.x, p.y, p.z], i * 3);
      const speed = radius * (0.6 + Math.random() * 1.2);
      this.vel.set([dir.x * speed, Math.abs(dir.y) * speed + radius * 0.4, dir.z * speed], i * 3);
      this.life[i] = 0.8 + Math.random() * 0.9;
      c.set(PALETTE[i % PALETTE.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: sizePx } },
      vertexShader: /* glsl */ `
        attribute float aGlow;
        attribute vec3 color;
        uniform float uSize;
        varying float vA;
        varying vec3 vC;
        void main() {
          vA = aGlow; vC = color;
          gl_PointSize = uSize * (0.4 + aGlow);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying vec3 vC;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float star = max(0.0, 1.0 - (abs(q.x) + abs(q.y)) * 2.2) + max(0.0, 1.0 - length(q) * 3.0);
          float a = clamp(star, 0.0, 1.0) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.userData.helper = true;
    this.points.raycast = () => {};
  }

  update(dt: number): boolean {
    this.age += dt;
    let alive = false;
    const n = this.life.length;
    for (let i = 0; i < n; i++) {
      const t = this.age / this.life[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        continue;
      }
      alive = true;
      this.vel[i * 3 + 1] -= 0.25 * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= 0.96;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      this.alpha[i] = Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.5);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aGlow.needsUpdate = true;
    return alive;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
