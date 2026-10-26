/**
 * Layer 3 · Bamboo rings (Vành nón): the inner shells turn see-through and the skeleton glows;
 * a tap sends the shells away and the 16 rings count off from the wide brim (1) to the tip (16),
 * stretching apart so they're easy to count, then settle. Joints light up in turn (staggered),
 * and callouts show "≈ 2 cm between rings" and "40–50 cm across".
 */
import * as THREE from 'three';
import { motion } from '../../a11y/motion';
import type { HintGesture, LayerCallbacks, ScreenPoint } from '../HatViewer';
import { HaloShell, clearGlow, setGlow, setXray } from '../fx';
import { pad } from '../hat';
import type { Rig } from '../rig';
import type { PointerSample } from '../rotator';
import { DEFAULT_FRAMING, HAT_CENTRE_Y } from '../scene';
import type { Label } from '../labels';
import { LayerBase } from './base';

const GOLD = 0xffc24a;
const SPREAD = 1.75;

export class FrameLayer extends LayerBase {
  private rings: THREE.Object3D[] = [];
  private joints: THREE.Object3D[] = [];
  private inner: THREE.Object3D[] = [];
  private halo: HaloShell;
  private proxy: THREE.Mesh;
  private shown = 0;
  private busy = false;
  private numerals: Label[] = [];
  private spiral: THREE.Mesh | null = null;
  private dimLine: THREE.Mesh | null = null;

  constructor(rig: Rig, cb: LayerCallbacks, animate: boolean) {
    super(rig, cb);
    rig.prepare('frame', this.anim, animate);
    rig.defaultFraming(animate ? 0.8 : 0);
    const hat = rig.hat;
    for (let i = 1; i <= 16; i++) {
      if (hat.has(`ring_${pad(i)}`)) this.rings.push(hat.get(`ring_${pad(i)}`));
      if (hat.has(`ring_joint_${pad(i)}`)) this.joints.push(hat.get(`ring_joint_${pad(i)}`));
    }
    this.inner = ['poem_art', 'mo_bark', 'leaf_inner'].filter((n) => hat.has(n)).map((n) => hat.get(n));
    this.halo = new HaloShell(hat.meshes('frame'), GOLD, { width: 0.0025, base: 0.3 });
    // tapping "the skeleton" = anywhere on the hat's cone
    const geo = new THREE.CylinderGeometry(0.012, 0.25, 0.22, 32, 1, true);
    this.proxy = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.proxy.position.y = 0.105;
    this.proxy.userData.helper = true;
    hat.assembly.add(this.proxy);
    // inner shells go see-through so the rings show
    const shells = this.inner.flatMap((o) => hat.meshes(o));
    if (animate) {
      const st = { x: 0 };
      this.anim.to(st, { x: 0.96, duration: 0.8, delay: 0.3, onUpdate: () => setXray(shells, st.x) });
    } else {
      setXray(shells, 0.96);
    }
  }

  async run(): Promise<void> {
    this.useGesture({ tap: (p) => this.tap(p), cursor: (p) => (this.hitHat(p) ? 'pointer' : null) });
    if (!motion.reduced) {
      this.anim.to(this.halo, { intensity: 0.9, duration: 0.8, yoyo: true, repeat: this.rig.decor ? -1 : 2, ease: 'sine.inOut' });
    } else {
      this.halo.intensity = 0.6;
    }
    return this.waitForCompletion();
  }

  finish(): void {
    if (this.completed) return;
    this.anim.killAll();
    this.halo.intensity = 0;
    for (const o of this.inner) this.rig.snapAway(o);
    this.shown = 16;
    this.emit('ring', 16);
    this.showCallouts();
    this.complete();
  }

  hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
    if (this.completed || this.busy) return null;
    const c = this.screen(this.rig.world([0, 0.07, 0.12]));
    return { gesture: 'tap', points: [c] };
  }

  assist(): void {
    if (!this.completed && !this.busy) void this.reveal();
  }

  get ringsShown(): number {
    return this.shown;
  }

  cue(name: string): void {
    const hat = this.rig.hat;
    if (name === 'rings') {
      // bottom → top: "smaller and smaller until they reach the tip"
      this.rings.forEach((r, i) => this.flash(hat.meshes(r), GOLD, i * 0.09, 0.9));
    } else if (name === 'joints') {
      if (hat.has('ribs')) this.flash(hat.meshes('ribs'), 0xffe7a3, 0, 1.0, 2);
      this.lightJoints();
    } else if (name === 'measure') {
      this.showCallouts();
      this.flash(hat.meshes('ring_01'), GOLD, 0, 1.2, 2);
    }
  }

  dispose(): void {
    clearGlow(this.rig.hat.meshes('frame'));
    this.halo.dispose();
    this.proxy.removeFromParent();
    this.proxy.geometry.dispose();
    this.spiral?.removeFromParent();
    this.spiral?.geometry.dispose();
    this.dimLine?.removeFromParent();
    this.dimLine?.geometry.dispose();
    // rings and ribs always end at home
    for (const r of this.rings) this.rig.hat.snapHome(r);
    super.dispose();
  }

  private hitHat(p: PointerSample): boolean {
    return !!this.rig.stage.hit(p.x, p.y, [this.proxy, ...this.rig.hat.meshes('frame')]);
  }

  private tap(p: PointerSample): boolean {
    if (this.completed || this.busy || !this.hitHat(p)) return false;
    void this.reveal();
    return true;
  }

  private async reveal(): Promise<void> {
    this.busy = true;
    this.useGesture(null);
    const rig = this.rig;
    const hat = rig.hat;
    const reduced = motion.reduced;
    this.anim.killAll();
    this.halo.intensity = 0;
    rig.rot.locked = true;
    this.sfx('whoosh');
    const left = rig.stage.cameraRight().negate().add(new THREE.Vector3(0, 1, 0));
    this.inner.forEach((o, i) => rig.sendAway(o, this.anim, { dir: left, dist: 0.5, delay: i * 0.15, duration: 0.7 }));
    await this.wait(reduced ? 0.4 : 0.9);
    if (this.disposed) return;
    // nearly side-on, so the rings stack up visibly as they spread
    rig.pose({ pitch: 0.16 }, 0.8, this.anim);
    rig.frameTo({ cy: HAT_CENTRE_Y * SPREAD * 0.98, halfH: DEFAULT_FRAMING.halfH * 1.55, halfW: DEFAULT_FRAMING.halfW * 1.05 }, 1.2);
    const step = reduced ? 0.06 : 0.16;
    const ribs = hat.has('ribs') ? hat.meshes('ribs') : [];
    const fade = { o: 1 };
    this.anim.to(fade, { o: 0, duration: 0.6, onUpdate: () => ribs.forEach((m) => (m.visible = fade.o > 0.5)) });
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const home = hat.home(ring);
      const delay = 0.3 + i * step;
      this.anim.to(ring.position, { y: home.position.y * SPREAD, duration: 0.5, delay, ease: 'back.out(1.6)' });
      this.anim.fromTo(ring.scale, { x: 0.9, y: 0.9, z: 0.9 }, { x: 1, y: 1, z: 1, duration: 0.5, delay, ease: 'back.out(3)' });
      this.flash(hat.meshes(ring), GOLD, delay, 0.7);
      this.anim.call(delay, () => {
        this.shown = i + 1;
        this.emit('ring', this.shown);
        this.sfx('ringSnap', i);
        this.addNumeral(i);
      });
    }
    const countEnd = 0.3 + this.rings.length * step + 0.5;
    await this.wait(countEnd + (reduced ? 0.3 : 1.4));
    if (this.disposed) return;
    // settle back together; ribs return
    for (const r of this.rings) this.anim.to(r.position, { y: hat.home(r).position.y, duration: 0.9, ease: 'power2.inOut' });
    this.anim.call(0.5, () => ribs.forEach((m) => (m.visible = true)));
    rig.defaultFraming(1.0);
    rig.pose({ pitch: 0.28 }, 1.0, this.anim);
    await this.wait(1.1);
    if (this.disposed) return;
    rig.rot.locked = false;
    for (const l of this.numerals) this.unlabel(l);
    this.numerals = [];
    this.sfx('snap');
    await this.lightJoints();
    if (this.disposed) return;
    this.showCallouts();
    this.busy = false;
    this.useGesture({ tap: (p) => this.tapRing(p) });
    this.complete();
  }

  /** after the count, tapping a ring jiggles it */
  private tapRing(p: PointerSample): boolean {
    const hit = this.rig.stage.hit(p.x, p.y, this.rings.flatMap((r) => this.rig.hat.meshes(r)));
    if (!hit) return false;
    const ring = this.rings.find((r) => {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o === r) return true;
        o = o.parent;
      }
      return false;
    });
    if (!ring) return false;
    const i = this.rings.indexOf(ring);
    this.sfx('ringSnap', i);
    this.flash(this.rig.hat.meshes(ring), GOLD, 0, 0.6);
    this.anim.fromTo(ring.scale, { x: 1.06, y: 1.06, z: 1.06 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const l = this.addNumeral(i);
    this.anim.call(1.6, () => this.unlabel(l));
    return true;
  }

  private addNumeral(i: number): Label {
    const ring = this.rings[i];
    const meta = this.rig.hat.meta.rings[i];
    const r = meta?.r ?? 0.2;
    const a = new THREE.Vector3();
    const n = new THREE.Vector3();
    const l = this.label({
      text: String(i + 1),
      kind: 'num',
      place: 'center',
      // on the ring's outline as the child sees it: odd numbers on the left, even on the right,
      // so 16 badges climb the two slopes of the cone without piling up
      anchor: () => {
        const cam = this.rig.stage.camera.position;
        const toCam = ring.worldToLocal(cam.clone());
        toCam.y = 0;
        if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1);
        toCam.normalize();
        const side = i % 2 === 0 ? 1 : -1;
        const out = new THREE.Vector3(-toCam.z * side, 0, toCam.x * side).multiplyScalar(0.94).addScaledVector(toCam, 0.34);
        out.setLength(r + 0.02);
        return ring.localToWorld(a.copy(out));
      },
      facing: () => n.set(0, 0, 1),
      onTap: () => this.sfx('ringSnap', i),
    });
    this.numerals.push(l);
    return l;
  }

  /** joints glow one after another along a golden spiral: they never line up */
  private async lightJoints(): Promise<void> {
    const hat = this.rig.hat;
    const pts = hat.meta.rings.map((r) => new THREE.Vector3(...r.joint_point));
    if (!this.spiral && pts.length > 2) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const geo = new THREE.TubeGeometry(curve, 160, 0.0016, 6, false);
      const mat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, toneMapped: false, depthTest: false });
      this.spiral = new THREE.Mesh(geo, mat);
      this.spiral.renderOrder = 8;
      this.spiral.userData.helper = true;
      this.spiral.raycast = () => {};
      hat.assembly.add(this.spiral);
    }
    const geo = this.spiral?.geometry;
    const total = geo?.index ? geo.index.count : 0;
    const st = { t: 0 };
    const step = motion.reduced ? 0.04 : 0.11;
    this.joints.forEach((j, i) => this.flash(hat.meshes(j), 0xffe7a3, i * step, 1.2, 1, 3));
    const label = this.label({ id: 'p2.label.joints', tone: 'gold', place: 'right', anchor: () => this.rig.world(pts[Math.floor(pts.length / 2)] ?? new THREE.Vector3()) });
    const tw = this.anim.to(st, {
      t: 1,
      duration: this.joints.length * step + 0.3,
      ease: 'none',
      onUpdate: () => geo?.setDrawRange(0, Math.floor((total * st.t) / 3) * 3),
    });
    await this.anim.done(tw);
    this.anim.call(5, () => this.unlabel(label));
  }

  private showCallouts(): void {
    if (this.dimLine) return;
    const hat = this.rig.hat;
    const rings = hat.meta.rings;
    const r1 = rings[0]?.r ?? 0.24;
    // a dimension line across the brim
    const mat = new THREE.MeshBasicMaterial({ color: 0xa9472a, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 });
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, r1 * 2, 8), mat);
    line.rotation.z = Math.PI / 2;
    line.position.set(0, 0.002, 0);
    line.renderOrder = 8;
    line.userData.helper = true;
    line.raycast = () => {};
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat);
      cap.position.y = (s * r1);
      cap.userData.helper = true;
      line.add(cap);
    }
    hat.assembly.add(line);
    this.dimLine = line;
    const w = new THREE.Vector3();
    this.label({ id: 'p2.label.brimWidth', kind: 'callout', tone: 'red', place: 'below', anchor: () => this.rig.world([0, -0.01, 0], w) });
    const g = new THREE.Vector3();
    const n = new THREE.Vector3();
    const r2 = rings[1];
    this.label({
      id: 'p2.label.ringGap',
      kind: 'callout',
      tone: 'gold',
      place: 'left',
      anchor: () => {
        // between ring 1 and ring 2, on the side facing the child
        const cam = this.rig.hat.assembly.worldToLocal(this.rig.stage.camera.position.clone());
        cam.y = 0;
        cam.normalize();
        // 55° round to the child's left of the point nearest them
        const side = new THREE.Vector3(-cam.z, 0, cam.x).multiplyScalar(0.82).add(cam.multiplyScalar(0.57)).normalize();
        const rr = ((r2?.r ?? 0.225) + r1) / 2;
        return this.rig.world(side.multiplyScalar(rr).setY((r2?.y ?? 0.013) / 2), g);
      },
      facing: () => n.set(0, 0, 1),
    });
  }

  private flash(meshes: THREE.Mesh[], color: number, delay: number, duration: number, repeat = 1, peak = 1.6): void {
    const st = { v: 0 };
    this.anim.to(st, {
      v: 1,
      delay,
      duration: duration / 2,
      yoyo: true,
      repeat: repeat * 2 - 1,
      ease: 'sine.inOut',
      onUpdate: () => setGlow(meshes, color, st.v * peak),
      onComplete: () => clearGlow(meshes),
    });
  }
}
