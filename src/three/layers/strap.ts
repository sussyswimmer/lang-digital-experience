/**
 * Layer 4 · Chin strap (Quai nón): every piece taken off earlier flies back, inside → out (frame,
 * inner leaves, mo, poem art, outer leaves, cap, stitches). The hat rises a little and tilts toward
 * the child so the strap hangs in the middle of the screen, glowing. A tap sets it swaying in a
 * gust of wind, and the knots inside the hat (rings 3–5) glow to show where it is tied.
 */
import * as THREE from 'three';
import { motion } from '../../a11y/motion';
import type { HintGesture, LayerCallbacks, ScreenPoint } from '../HatViewer';
import { clearGlow, setGlow, setOpacity } from '../fx';
import { pad } from '../hat';
import type { Rig } from '../rig';
import type { PointerSample } from '../rotator';
import { HAT_CENTRE_Y } from '../scene';
import type { SfxId } from '../../audio/sfx';
import { LayerBase } from './base';

const UP = new THREE.Vector3(0, 1, 0);
/** anchors ~35° off the view axis so a front-to-back swing reads as side to side on screen */
const STRAP_YAW = THREE.MathUtils.degToRad(55);
const STRAP_PITCH = THREE.MathUtils.degToRad(-20);
const STRAP_LIFT = 0.07;

export class StrapLayer extends LayerBase {
  private phase: 'assembling' | 'invite' | 'swaying' | 'done' = 'assembling';
  private taps = 0;
  private knotLabel: ReturnType<LayerBase['label']> | null = null;

  constructor(rig: Rig, cb: LayerCallbacks, animate: boolean) {
    super(rig, cb);
    rig.prepare('strap', this.anim, animate);
    rig.defaultFraming(animate ? 0.8 : 0);
  }

  run(): Promise<void> {
    void this.sequence();
    return this.waitForCompletion();
  }

  private async sequence(): Promise<void> {
    await this.assemble();
    if (this.disposed || this.completed) return;
    await this.present();
    if (this.disposed || this.completed) return;
    this.invite();
  }

  finish(): void {
    if (this.completed) return;
    this.anim.killAll();
    const rig = this.rig;
    this.homeAll();
    rig.rot.locked = false;
    rig.rot.yaw = STRAP_YAW;
    rig.rot.pitch = STRAP_PITCH;
    rig.place.lift = STRAP_LIFT;
    rig.hat.get('strap_rig').visible = true;
    rig.strap.restShape();
    rig.applyTransforms();
    this.frameStrap(0);
    this.showKnotLabel();
    this.phase = 'done';
    this.useGesture({ tap: (p) => this.tap(p), cursor: (p) => (this.hitStrap(p) ? 'pointer' : null) });
    this.complete();
  }

  hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
    if (this.phase !== 'invite') return null;
    return { gesture: 'tap', points: [this.screen(this.rig.hat.toWorld(this.rig.strap.lowest()))] };
  }

  assist(): void {
    if (this.phase === 'invite') this.sway();
  }

  cue(name: string): void {
    if (name === 'knots') this.glowKnots();
    else if (name === 'strap') this.pulseStrap(2);
  }

  dispose(): void {
    this.rig.strap.halo.intensity = 0;
    clearGlow(this.knotMeshes());
    super.dispose();
  }

  // ---------------------------------------------------------------- 1. fly back inside → out

  private async assemble(): Promise<void> {
    const rig = this.rig;
    const hat = rig.hat;
    const reduced = motion.reduced;
    rig.rot.locked = true;
    rig.pose({ yaw: -0.35, pitch: 0.18 }, 0.8, this.anim);
    await this.wait(reduced ? 0.2 : 0.7);
    if (this.disposed) return;
    const gap = reduced ? 0.15 : 0.55;
    let t = 0;
    const left = rig.stage.cameraRight().negate().add(UP);
    const beat = (fn: () => void, sound: SfxId, partId?: string) => {
      this.anim.call(t, () => {
        fn();
        this.sfx(sound);
        if (partId) this.pop(partId);
      });
      t += gap;
    };
    // the bamboo frame "arrives": the rings ripple up from the brim and snap into place
    beat(() => {
      for (let i = 1; i <= 16; i++) {
        const name = `ring_${pad(i)}`;
        if (!hat.has(name)) continue;
        const ring = hat.get(name);
        const y = hat.home(ring).position.y;
        this.anim.fromTo(ring.position, { y: y * 1.35 + 0.01 }, { y, duration: 0.5, delay: i * 0.02, ease: 'bounce.out' });
      }
    }, 'ringSnap', 'p2.part.frame');
    const inner = [
      ['leaf_inner', 'p2.part.innerLeaves', 'snap'],
      ['mo_bark', 'p2.part.mo', 'leafRustle'],
      ['poem_art', 'p2.part.poem', 'sparkle'],
    ] as const;
    for (const [name, id, sound] of inner) {
      if (!hat.has(name)) continue;
      beat(() => rig.bringBack(hat.get(name), this.anim, { dir: left, dist: 0.5, duration: 0.6 }), sound, id);
    }
    beat(() => {
      for (const p of rig.panels.panels) {
        if (p.state === 'on') continue;
        p.state = 'on';
        const d = 0.05 * p.index;
        rig.bringBack(p.hinge, this.anim, { dir: p.radial.clone().add(UP), dist: 0.5, duration: 0.6, delay: d });
        this.anim.to(p.peel, { value: 0, duration: 0.6, delay: d + 0.15, onUpdate: () => rig.panels.setPeel(p, p.peel.value, hat) });
      }
      for (const n of ['leaf_outer_cap', 'apex_cap']) if (hat.has(n)) rig.bringBack(hat.get(n), this.anim, { dist: 0.35, duration: 0.6, delay: 0.6 });
    }, 'leafRustle', 'p2.part.outerLeaves');
    t += reduced ? 0 : 0.5;
    beat(() => {
      const st = rig.stitches;
      const g = st.group;
      g.visible = true;
      g.userData.away = false;
      Object.assign(st.float, { f: 1.4, lift: 2 });
      const o = { v: 0 };
      const meshes = hat.meshes(g);
      setOpacity(meshes, 0);
      this.anim.to(o, { v: 1, duration: 0.5, onUpdate: () => setOpacity(meshes, o.v) });
      this.anim.to(st.float, { f: 0, lift: 0, bob: 0, duration: 0.7, ease: 'power2.out' });
    }, 'threadZip', 'p2.part.stitches');
    await this.wait(t + 0.6);
    if (this.disposed) return;
    this.homeAll();
    this.sfx('chime');
  }

  /** belt and braces: everything exactly home */
  private homeAll(): void {
    const rig = this.rig;
    const hat = rig.hat;
    for (const n of ['leaf_inner', 'mo_bark', 'poem_art', 'leaf_outer_cap', 'apex_cap', 'stitches_white']) if (hat.has(n)) rig.snapHome(hat.get(n));
    for (const p of rig.panels.panels) {
      p.state = 'on';
      rig.snapHome(p.hinge);
      rig.panels.setPeel(p, 0, hat);
    }
    for (let i = 1; i <= 16; i++) if (hat.has(`ring_${pad(i)}`)) hat.snapHome(hat.get(`ring_${pad(i)}`));
    Object.assign(rig.stitches.float, { f: 0, lift: 0, bob: 0 });
    rig.stitches.setAllGlow(0);
  }

  // ---------------------------------------------------------------- 2. present the underside

  private async present(): Promise<void> {
    const rig = this.rig;
    const strapRig = rig.hat.get('strap_rig');
    rig.strap.gather();
    strapRig.visible = true;
    const dur = motion.reduced ? 0.4 : 1.4;
    rig.pose({ yaw: STRAP_YAW, pitch: STRAP_PITCH, lift: STRAP_LIFT }, dur, this.anim);
    this.frameStrap(dur);
    // the strap unfurls under the brim
    this.anim.call(dur * 0.4, () => {
      rig.strap.simulating = true;
      rig.strap.gustT = -1;
      this.sfx('swish');
    });
    await this.wait(dur + 0.5);
    if (this.disposed) return;
    rig.rot.locked = false;
  }

  /** frame the hat + hanging strap with the strap's middle near the centre of the stage */
  private frameStrap(duration: number): void {
    const rig = this.rig;
    const hat = rig.hat;
    // where things will be once posed: temporarily apply the target pose
    const saved = { yaw: rig.rot.yaw, pitch: rig.rot.pitch, lift: rig.place.lift };
    rig.rot.yaw = STRAP_YAW;
    rig.rot.pitch = STRAP_PITCH;
    rig.place.lift = STRAP_LIFT;
    rig.applyTransforms();
    const box = new THREE.Box3();
    const w = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      box.expandByPoint(hat.toWorld([Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], w));
    }
    box.expandByPoint(hat.toWorld([0, 0.21, 0], w));
    const strapBox = new THREE.Box3();
    for (const p of hat.meta.strap.rest_points) strapBox.expandByPoint(hat.toWorld(p, w));
    box.union(strapBox);
    rig.rot.yaw = saved.yaw;
    rig.rot.pitch = saved.pitch;
    rig.place.lift = saved.lift;
    rig.applyTransforms();
    const sc = strapBox.getCenter(new THREE.Vector3());
    const cy = (sc.y + box.getCenter(w).y) / 2;
    const halfH = Math.max(box.max.y - cy, cy - box.min.y) + 0.01;
    const halfW = Math.max(box.max.x - sc.x, sc.x - box.min.x) + 0.01;
    rig.frameTo({ cx: sc.x, cy, cz: 0, halfW, halfH, elev: 0.06 }, duration);
  }

  // ---------------------------------------------------------------- 3. invite, 4. sway, 5. knots

  private invite(): void {
    this.phase = 'invite';
    this.sfx('invite');
    this.useGesture({ tap: (p) => this.tap(p), cursor: (p) => (this.hitStrap(p) ? 'pointer' : null) });
    this.pulseStrap(this.rig.decor && !motion.reduced ? -1 : 2);
  }

  private pulseStrap(times: number): void {
    const h = this.rig.strap.halo;
    const mat = this.rig.strap.material;
    const st = { v: 0 };
    const base = mat.emissive.clone();
    this.anim.to(st, {
      v: 1,
      duration: 0.6,
      yoyo: true,
      repeat: times < 0 ? -1 : times * 2 - 1,
      ease: 'sine.inOut',
      onUpdate: () => {
        h.intensity = st.v * 1.1;
        mat.emissive.copy(base).lerp(mat.color, st.v * 0.45);
      },
      onComplete: () => {
        h.intensity = 0;
        mat.emissive.copy(base);
      },
      onInterrupt: () => {
        h.intensity = 0;
        mat.emissive.copy(base);
      },
    });
  }

  private hitStrap(p: PointerSample): boolean {
    return !!this.rig.stage.hit(p.x, p.y, [this.rig.strap.proxy, this.rig.strap.ribbon]);
  }

  private tap(p: PointerSample): boolean {
    if (this.phase === 'assembling' || !this.hitStrap(p)) return false;
    this.sway();
    return true;
  }

  private sway(): void {
    const rig = this.rig;
    this.taps++;
    rig.strap.gustAmp = motion.reduced ? 0.6 : 1.8;
    rig.strap.tapGust();
    rig.stage.invalidate();
    this.sfx('swish');
    if (this.phase === 'invite') {
      this.anim.killAll();
      rig.strap.halo.intensity = 0;
      rig.strap.material.emissive.copy(rig.strap.material.userData.baseEmissive ?? new THREE.Color(0));
      this.phase = 'swaying';
      this.anim.call(0.6, () => this.glowKnots());
      this.anim.call(2.2, () => {
        this.phase = 'done';
        this.complete();
      });
    }
  }

  private knotMeshes(): THREE.Mesh[] {
    const hat = this.rig.hat;
    return ['strap_knot_L', 'strap_knot_R', 'strap_yarn_L', 'strap_yarn_R'].filter((n) => hat.has(n)).flatMap((n) => hat.meshes(n));
  }

  private glowKnots(): void {
    const meshes = this.knotMeshes();
    const st = { v: 0 };
    this.sfx('sparkle');
    this.anim.to(st, {
      v: 1,
      duration: 0.6,
      yoyo: true,
      repeat: 3,
      ease: 'sine.inOut',
      onUpdate: () => setGlow(meshes, 0xffd27a, st.v * 2),
      onComplete: () => clearGlow(meshes),
    });
    // the rings the yarn goes round: 3, 4 and 5
    for (const i of this.rig.hat.meta.strap.attach_rings ?? [3, 4, 5]) {
      const name = `ring_${pad(i)}`;
      if (!this.rig.hat.has(name)) continue;
      const rm = this.rig.hat.meshes(name);
      const r = { v: 0 };
      this.anim.to(r, { v: 1, duration: 0.5, delay: 0.15 * (i - 3), yoyo: true, repeat: 1, onUpdate: () => setGlow(rm, 0xffd27a, r.v), onComplete: () => clearGlow(rm) });
    }
    this.showKnotLabel();
  }

  private showKnotLabel(): void {
    if (this.knotLabel) return;
    const hat = this.rig.hat;
    const knot = hat.has('strap_knot_R') ? hat.get('strap_knot_R') : null;
    const w = new THREE.Vector3();
    this.knotLabel = this.label({
      id: 'p2.label.knots',
      tone: 'strap',
      place: 'right',
      anchor: () => (knot ? knot.getWorldPosition(w) : null),
      onTap: () => {
        this.emit('say', 'p2.label.knots');
        this.glowKnots();
      },
    });
  }

  private pop(id: string): void {
    const at = new THREE.Vector3();
    const l = this.label({ id, kind: 'pop', place: 'center', anchor: () => this.rig.world([0, HAT_CENTRE_Y + 0.17, 0], at) });
    this.anim.call(1.1, () => this.unlabel(l));
  }
}
