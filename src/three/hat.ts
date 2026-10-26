/**
 * Loads the Blender hat (meshopt + WebP GLB) and its sidecar meta, checks the part names from the
 * 3D contract (docs/ARCHITECTURE.md §3), gives every mesh its own material (parts glow, fade and
 * recolour independently) and remembers each part's home transform for the fly-back tweens.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../assets/manifest';

type V3 = [number, number, number];

export interface HatMeta {
  params: { brim_d: number; height: number; ring_pitch: number; sew_start_ring: number };
  rings: { name: string; index: number; r: number; y: number; joint_az_deg: number; joint_point: V3 }[];
  panels: { name: string; hinge: string; az_deg: number; len: number; hinge_point: V3 }[];
  stitch_rows: { name: string; ring: number; count: number; sew_order: number; points: V3[]; normals: V3[] }[];
  trace_rows: string[];
  cascade_order: string[];
  strap: { anchor_L: V3; anchor_R: V3; rest_points: V3[]; width: number; length: number; colors: Record<string, string>; attach_rings: number[] };
  anchors: Record<string, V3>;
  inside_out: string[];
}

export interface Home {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/** names the experience relies on; a missing one is a contract break with the Blender script */
export const REQUIRED_PARTS = [
  'hat_assembly',
  'frame',
  'rings',
  'ribs',
  'leaf_inner',
  'mo_bark',
  'poem_art',
  'leaf_outer',
  'leaf_outer_cap',
  'stitches_white',
  'brim',
  'brim_thread_red',
  'brim_wire_inner',
  'brim_wire_outer',
  'brim_bark',
  'strap_rig',
  'strap',
  'strap_knot_L',
  'strap_knot_R',
  'apex_cap',
  ...Array.from({ length: 16 }, (_, i) => `ring_${pad(i + 1)}`),
  ...Array.from({ length: 16 }, (_, i) => `ring_joint_${pad(i + 1)}`),
  ...Array.from({ length: 12 }, (_, i) => `leaf_outer_panel_${pad(i)}_hinge`),
  ...Array.from({ length: 15 }, (_, i) => `stitch_white_row_${pad(i + 2)}`),
];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function missingParts(names: Iterable<string>): string[] {
  const have = new Set(names);
  return REQUIRED_PARTS.filter((n) => !have.has(n));
}

export class Hat {
  readonly homes = new Map<THREE.Object3D, Home>();
  private byName = new Map<string, THREE.Object3D>();

  constructor(
    readonly root: THREE.Object3D,
    readonly meta: HatMeta,
  ) {
    root.traverse((o) => {
      if (o.name && !this.byName.has(o.name)) this.byName.set(o.name, o);
      this.homes.set(o, { position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() });
    });
  }

  get assembly(): THREE.Object3D {
    return this.get('hat_assembly');
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): THREE.Object3D {
    const o = this.byName.get(name);
    if (!o) throw new Error(`[hat] missing part "${name}"`);
    return o;
  }

  /** every mesh under (and including) `obj` */
  meshes(obj: THREE.Object3D | string): THREE.Mesh[] {
    const root = typeof obj === 'string' ? this.get(obj) : obj;
    const out: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.helper) out.push(o as THREE.Mesh);
    });
    return out;
  }

  home(obj: THREE.Object3D): Home {
    return this.homes.get(obj)!;
  }

  snapHome(obj: THREE.Object3D): void {
    const h = this.homes.get(obj);
    if (!h) return;
    obj.position.copy(h.position);
    obj.quaternion.copy(h.quaternion);
    obj.scale.copy(h.scale);
  }

  /** a hat-space point (meta coordinates) → world */
  toWorld(p: V3 | THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    if (Array.isArray(p)) out.set(p[0], p[1], p[2]);
    else out.copy(p);
    return out.applyMatrix4(this.assembly.matrixWorld);
  }

  /** a hat-space direction → world (normalised) */
  dirToWorld(d: V3 | THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    if (Array.isArray(d)) out.set(d[0], d[1], d[2]);
    else out.copy(d);
    return out.transformDirection(this.assembly.matrixWorld);
  }

  row(name: string): HatMeta['stitch_rows'][number] {
    const r = this.meta.stitch_rows.find((s) => s.name === name);
    if (!r) throw new Error(`[hat] no stitch row ${name}`);
    return r;
  }
}

/** `maxAnisotropy`: the GPU's limit (renderer.capabilities); the leaf grain is seen at grazing angles on the cone */
export async function loadHat(maxAnisotropy = 8): Promise<Hat> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, meta] = await Promise.all([
    loader.loadAsync(assetUrl('models/nonla.glb')),
    fetch(assetUrl('models/nonla.meta.json')).then((r) => {
      if (!r.ok) throw new Error(`meta ${r.status}`);
      return r.json() as Promise<HatMeta>;
    }),
  ]);
  const root = gltf.scene.getObjectByName('nonla_root') ?? gltf.scene;
  const names: string[] = [];
  root.traverse((o) => names.push(o.name));
  const missing = missingParts(names);
  if (missing.length) {
    const msg = `[hat] the GLB is missing ${missing.length} contract part(s): ${missing.join(', ')}`;
    if (import.meta.env.DEV) console.warn(msg);
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = (m.material as THREE.Material).clone();
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.userData.baseEmissive = mat.emissive?.clone() ?? new THREE.Color(0);
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 1;
    mat.userData.baseOpacity = mat.opacity;
    mat.userData.baseTransparent = mat.transparent;
    for (const tex of [mat.map, mat.normalMap]) if (tex) tex.anisotropy = maxAnisotropy;
    // the vein relief is baked for close-ups; at viewing distance a lighter touch reads as leaf, not hair
    if (mat.normalMap) mat.normalScale.multiplyScalar(0.6);
    m.frustumCulled = true;
  });
  return new Hat(root, meta);
}
