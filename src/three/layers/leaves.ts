/**
 * Layer 2 · Outer leaves (Lá nón): swipe (or tap) a leaf panel to peel it back: it curls from the
 * brim end and sweeps away round the cone, and the hat turns a little so the next leaf faces the
 * child. After three by hand the rest go "Whoosh!": the hat turns once in the maker's hands and each
 * leaf comes off as it reaches the front, then the cap, revealing the lá mo, the inner leaves and a
 * sparkly secret (the poem art, seen later). Labels sit beside the hat, never on the painting.
 *
 * While the narrator explains, two cues play the layering order a hat maker follows, with the step
 * shown on screen ('step' events): 1 inner leaves, 2 the painting, 3 the outer leaves wrapped back
 * on round the cone, covering the painting again ('layers'), then 4 the coating ('coat').
 */
import * as THREE from 'three';
import { motion } from '../../a11y/motion';
import type { HintGesture, LayerCallbacks, ScreenPoint } from '../HatViewer';
import { Sparkles, clearGlow, setGlow } from '../fx';
import { MANUAL_PEELS, peelProgress, peelRelease } from '../peel';
import { DEFAULT_POSE, type PanelState, type Rig } from '../rig';
import type { PointerSample } from '../rotator';
import { LayerBase } from './base';

const UP = new THREE.Vector3(0, 1, 0);

export class LeavesLayer extends LayerBase {
  private drag: { panel: PanelState; start: PointerSample; dir: { x: number; y: number }; p: number; last: PointerSample; rustled: boolean } | null = null;
  private manual = 0;
  private busy = false;
  private animating = new Set<PanelState>();
  private sparkles = new Set<Sparkles>();
  private revealLabels: ReturnType<LayerBase['label']>[] = [];
  /** the layering sequence (cue 'layers'); the coating waits for it */
  private layering: Promise<void> | null = null;
  private coated = false;

  constructor(rig: Rig, cb: LayerCallbacks, animate: boolean) {
    super(rig, cb);
    rig.prepare('leaves', this.anim, animate);
    rig.defaultFraming(animate ? 0.8 : 0);
  }

  async run(): Promise<void> {
    this.useGesture({
      down: (p) => this.down(p),
      move: (p) => this.move(p),
      up: (p) => this.up(p),
      tap: (p) => this.tap(p),
      cursor: (p) => (this.panelAt(p) ? 'grab' : null),
    });
    return this.waitForCompletion();
  }

  finish(): void {
    if (this.completed) return;
    this.anim.killAll();
    const rig = this.rig;
    for (const p of rig.panels.panels) {
      p.state = 'away';
      rig.panels.setPeel(p, 1, rig.hat);
      rig.snapAway(p.hinge);
    }
    for (const n of ['leaf_outer_cap', 'apex_cap']) if (rig.hat.has(n)) rig.snapAway(rig.hat.get(n));
    this.reveal(false);
    this.complete();
  }

  hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
    if (this.completed || this.busy) return null;
    const p = this.frontPanel();
    if (!p) return null;
    const { centre, dir } = this.panelScreen(p);
    const len = Math.min(160, 0.22 * Math.min(this.rig.stage.width, this.rig.stage.height));
    return { gesture: 'swipe', points: [centre, { x: centre.x + dir.x * len, y: centre.y + dir.y * len }] };
  }

  assist(): void {
    if (this.completed || this.busy) return;
    const p = this.frontPanel();
    if (p) this.peelAway(p, true);
  }

  cue(name: string): void {
    if (name === 'layers') {
      this.layering ??= this.layerUp();
    } else if (name === 'coat') {
      void this.coat();
    } else if (name === 'secret') {
      this.sparkle(this.poemPoint(), 40, 0.06);
    }
  }

  // ---------------------------------------------------------------- the layering order

  /** 1 inner leaves → 2 painting → 3 outer leaves wrapped back on round the cone */
  private async layerUp(): Promise<void> {
    const rig = this.rig;
    const hat = rig.hat;
    const reduced = motion.reduced;
    this.useGesture(null);
    for (const l of this.revealLabels) this.unlabel(l);
    this.revealLabels = [];
    // start from the open hat (a revisit or a quick finish may have left leaves on)
    if (rig.panels.panels.some((p) => p.state === 'on')) {
      const t = rig.turnLeaves('off', this.anim, { duration: 1.6, caps: true });
      await this.wait(t);
      if (this.disposed) return;
    }
    rig.rot.locked = true;
    rig.pose({ yaw: DEFAULT_POSE.yaw * 0.5, pitch: 0.2 }, reduced ? 0.3 : 0.8, this.anim);

    // 1 · inner leaves (and the lá mo over them): the painting isn't on yet
    this.emit('step', 0);
    this.sfx('leafRustle');
    const poem = hat.has('poem_art') ? hat.get('poem_art') : null;
    const front = new THREE.Vector3(0.1, 0.25, 1);
    if (poem) rig.sendAway(poem, this.anim, { dir: front, dist: 0.3, duration: reduced ? 0.2 : 0.6 });
    const inner = ['leaf_inner', 'mo_bark'].filter((n) => hat.has(n)).flatMap((n) => hat.meshes(n));
    this.glow(inner, 0xffd27a, 2);
    const step1 = [this.innerLabel(), this.moLabel()].filter((l): l is NonNullable<typeof l> => !!l);
    await this.wait(reduced ? 1.4 : 2.8);
    if (this.disposed) return;
    for (const l of step1) this.unlabel(l);

    // 2 · the painting, laid on over them
    this.emit('step', 1);
    this.sfx('sparkle');
    if (poem) {
      rig.bringBack(poem, this.anim, {
        dir: front,
        dist: 0.3,
        duration: reduced ? 0.2 : 0.8,
        onLand: () => {
          this.glow(hat.meshes(poem), 0xffe7a3, 1);
          this.sparkle(this.poemPoint(), 46, 0.07);
        },
      });
    }
    const secret = this.secretLabel();
    await this.wait(reduced ? 1.4 : 2.8);
    if (this.disposed) return;
    this.unlabel(secret);

    // 3 · the outer leaves, laid on at the front as the hat turns, wrapping round the cone and
    //     covering the painting again
    this.emit('step', 2);
    this.sfx('leafRustle');
    const t = rig.turnLeaves('on', this.anim, {
      duration: 4.2,
      caps: true,
      onLeaf: (n) => n % 3 === 1 && this.sfx('peel'),
    });
    await this.wait(t);
    if (this.disposed) return;
    rig.rot.locked = false;
  }

  /** 4 · the coating: a shine brushed over the finished hat */
  private async coat(): Promise<void> {
    if (this.coated) return;
    this.coated = true;
    await (this.layering ?? Promise.resolve());
    if (this.disposed) return;
    this.emit('step', 3);
    this.sfx('sparkle');
    const leaves = this.rig.panels.panels.flatMap((p) => this.rig.hat.meshes(p.hinge));
    this.glow(leaves, 0xfff1c4, 1, 0.55);
    // the brush goes round the front from one side to the other
    for (let k = 0; k < 5; k++) {
      const a = -0.9 + k * 0.45;
      const at = this.rig.world([Math.sin(a) * 0.15, 0.07 + 0.02 * Math.cos(k), Math.cos(a) * 0.15]);
      this.anim.call(k * 0.28, () => this.sparkle(at, 26, 0.06));
    }
  }

  private glow(meshes: THREE.Mesh[], color: number, times: number, peak = 0.5): void {
    if (!meshes.length) return;
    const st = { v: 0 };
    this.anim.to(st, { v: 1, duration: 0.45, yoyo: true, repeat: times * 2 - 1, onUpdate: () => setGlow(meshes, color, st.v * peak), onComplete: () => clearGlow(meshes) });
  }

  // ---------------------------------------------------------------- peeling

  private onPanels(): PanelState[] {
    return this.rig.panels.panels.filter((p) => p.state === 'on' && !this.animating.has(p));
  }

  private panelAt(p: PointerSample): PanelState | null {
    const panels = this.onPanels();
    const hit = this.rig.stage.hit(p.x, p.y, panels.map((x) => x.mesh));
    if (!hit) return null;
    return panels.find((x) => x.mesh === hit.object) ?? null;
  }

  private down(p: PointerSample): boolean {
    if (this.completed || this.busy) return false;
    const panel = this.panelAt(p);
    if (!panel) return false;
    const { dir } = this.panelScreen(panel);
    this.drag = { panel, start: p, dir, p: 0, last: p, rustled: false };
    this.animating.add(panel);
    return true;
  }

  private move(p: PointerSample): void {
    const d = this.drag;
    if (!d) return;
    const prog = peelProgress({ x: p.x - d.start.x, y: p.y - d.start.y }, d.dir, this.rig.stage.width, this.rig.stage.height);
    d.p = prog;
    d.last = p;
    this.rig.panels.setPeel(d.panel, prog, this.rig.hat);
    if (!d.rustled && prog > 0.08) {
      d.rustled = true;
      this.sfx('leafRustle');
    }
    this.rig.stage.invalidate();
  }

  private up(p: PointerSample): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const dt = Math.max(1, p.t - d.start.t);
    const moved = Math.hypot(p.x - d.start.x, p.y - d.start.y);
    const speed = moved / dt;
    // a quick tap on a leaf peels it too (little hands don't always swipe)
    const tapped = moved < 12 && dt < 500;
    if (tapped || peelRelease(d.p, speed) === 'peel') {
      this.animating.delete(d.panel);
      this.peelAway(d.panel, true);
    } else {
      const panel = d.panel;
      this.anim.to(panel.peel, {
        value: 0,
        duration: 0.7,
        ease: 'elastic.out(1, 0.5)',
        onUpdate: () => this.rig.panels.setPeel(panel, panel.peel.value, this.rig.hat),
        onComplete: () => this.animating.delete(panel),
      });
    }
  }

  private tap(p: PointerSample): boolean {
    if (this.completed || this.busy) return false;
    const panel = this.panelAt(p);
    if (!panel) return false;
    this.peelAway(panel, true);
    return true;
  }

  private peelAway(panel: PanelState, manual: boolean, delay = 0): void {
    if (panel.state !== 'on') return;
    const rig = this.rig;
    panel.state = 'away';
    this.animating.add(panel);
    const reduced = motion.reduced;
    if (manual) this.sfx('peel');
    this.anim.to(panel.peel, {
      value: 1,
      duration: reduced ? 0.15 : 0.35,
      delay,
      ease: 'power2.out',
      onUpdate: () => rig.panels.setPeel(panel, panel.peel.value, rig.hat),
    });
    // away round the cone, against the way the hat turns (not straight up)
    const a = Math.atan2(panel.radial.x, panel.radial.z);
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const dir = panel.radial.clone().multiplyScalar(0.75).addScaledVector(tangent, -0.85).addScaledVector(UP, 0.12).normalize();
    rig.sendAway(panel.hinge, this.anim, { dir, dist: 0.55, duration: reduced ? 0.3 : 0.8, delay: delay + (reduced ? 0.1 : 0.3), spin: reduced ? 0 : 0.5 });
    this.anim.call(delay + 1.2, () => this.animating.delete(panel));
    if (!manual) return;
    this.manual++;
    this.emit('peeled', rig.panels.peeledCount);
    if (this.manual >= MANUAL_PEELS) {
      this.anim.call(0.5, () => this.whoosh());
    } else if (!reduced) {
      // turn a little so the next leaf faces the child
      rig.pose({ yaw: rig.rot.yaw + 0.45 }, 0.9, this.anim);
    }
  }

  private async whoosh(): Promise<void> {
    if (this.busy || this.completed) return;
    this.busy = true;
    const rig = this.rig;
    this.emit('whoosh');
    this.sfx('whoosh');
    const pop = this.label({ id: 'p2.l2.whoosh', kind: 'pop', place: 'center', anchor: () => rig.world([0, 0.26, 0]) });
    // the hat turns once in the maker's hands; each leaf comes off as it reaches the front
    rig.rot.locked = true;
    const off = rig.turnLeaves('off', this.anim, { duration: 3.6, caps: true, onLeaf: (n) => n % 2 === 1 && this.sfx('peel') });
    await this.wait(off);
    if (this.disposed) return;
    // end facing the front, where the hidden paper art is
    rig.pose({ yaw: DEFAULT_POSE.yaw * 0.5, pitch: 0.2 }, motion.reduced ? 0.3 : 0.8, this.anim);
    await this.wait(motion.reduced ? 0.3 : 0.8);
    if (this.disposed) return;
    rig.rot.locked = false;
    this.emit('peeled', rig.panels.peeledCount);
    this.unlabel(pop);
    this.reveal(true);
    await this.wait(motion.reduced ? 0.4 : 1.4);
    if (this.disposed) return;
    this.busy = false;
    this.useGesture(null);
    this.complete();
  }

  /** labels for what the leaves were hiding: beside the hat, never on the painting */
  private reveal(animate: boolean): void {
    if (animate) this.sfx('sparkle');
    this.revealLabels = [this.moLabel(), this.innerLabel(), this.secretLabel()].filter((l): l is NonNullable<typeof l> => !!l);
    if (animate && this.rig.hat.has('poem_art')) this.sparkle(this.poemPoint(), 46, 0.07);
  }

  private moLabel() {
    const rig = this.rig;
    const hat = rig.hat;
    if (!hat.has('mo_bark')) return null;
    const a = new THREE.Vector3();
    const n = new THREE.Vector3();
    // on the left slope, low down: the label goes out to the left of the hat
    return this.label({ id: 'p2.label.mo', tone: 'bark', place: 'left', anchor: () => rig.world([-0.17, 0.04, 0.09], a), facing: () => hat.dirToWorld([-0.8, 0.6, 0.4], n) });
  }

  private innerLabel() {
    const rig = this.rig;
    if (!rig.hat.has('leaf_inner')) return null;
    // the inner leaves peep out at the tip, above the lá mo
    const a = new THREE.Vector3();
    return this.label({ id: 'p2.label.innerLeaves', tone: 'green', place: 'right', anchor: () => rig.world([0.012, 0.19, 0.012], a) });
  }

  private secretLabel() {
    const hat = this.rig.hat;
    if (!hat.has('poem_art')) return null;
    const n = new THREE.Vector3();
    return this.label({
      id: 'p2.label.secret',
      kind: 'callout',
      tone: 'gold',
      place: 'right',
      anchor: () => this.poemPoint(),
      facing: () => hat.dirToWorld([0.2, 0.6, 0.8], n),
      onTap: () => {
        this.emit('say', 'p2.label.secret');
        this.cue('secret');
      },
    });
  }

  /** the paper art sits on the front of the hat (+Z), between rings 3 and 12 */
  private poemPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return this.rig.world([0.035, 0.085, 0.142], out);
  }

  private sparkle(at: THREE.Vector3, count: number, radius: number): void {
    if (motion.reduced) count = Math.round(count / 3);
    const sp = new Sparkles(count, at, radius, 16 * Math.min(window.devicePixelRatio || 1, 2));
    this.rig.stage.scene.add(sp.points);
    this.sparkles.add(sp);
    this.onFrame((dt) => {
      if (!this.sparkles.has(sp)) return false;
      if (sp.update(dt)) return true;
      sp.dispose();
      this.sparkles.delete(sp);
      return false;
    });
  }

  dispose(): void {
    for (const sp of this.sparkles) sp.dispose();
    this.sparkles.clear();
    super.dispose();
    // a leaf caught mid-flight (Skip, a new layer) lands exactly on or off, so the next layer
    // starts from a hat that makes sense
    this.rig.settleLeaves();
    const hat = this.rig.hat;
    const leavesOn = this.rig.panels.panels.every((p) => p.state === 'on');
    if (hat.has('poem_art') && hat.get('poem_art').userData.away) this.rig.snapHome(hat.get('poem_art'));
    for (const n of ['leaf_outer_cap', 'apex_cap']) {
      if (!hat.has(n)) continue;
      if (leavesOn) this.rig.snapHome(hat.get(n));
      else this.rig.snapAway(hat.get(n));
    }
  }

  // ---------------------------------------------------------------- geometry helpers

  /** the unpeeled panel facing the camera most */
  private frontPanel(): PanelState | null {
    const panels = this.onPanels();
    const cam = this.rig.stage.camera.position;
    let best: PanelState | null = null;
    let bestDot = -2;
    const w = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const p of panels) {
      const mid = this.brimEnd(p, w, 0.55);
      const n = this.rig.hat.dirToWorld(p.radial, c);
      const d = n.dot(cam.clone().sub(mid).normalize());
      if (d > bestDot) {
        bestDot = d;
        best = p;
      }
    }
    return best;
  }

  /** a point along the panel from hinge (0) to brim (1), in world space */
  private brimEnd(p: PanelState, out: THREE.Vector3, along = 1, outward = 0): THREE.Vector3 {
    const meta = this.rig.hat.meta.panels.find((m) => m.hinge === p.hinge.name);
    const len = meta?.len ?? 0.28;
    return p.hinge.localToWorld(out.set(0, outward, -len * along));
  }

  private panelScreen(p: PanelState): { centre: ScreenPoint; dir: { x: number; y: number } } {
    const a = this.screen(this.brimEnd(p, new THREE.Vector3(), 0.6));
    const b = this.screen(this.brimEnd(p, new THREE.Vector3(), 0.75, 0.12));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) {
      dx = 0;
      dy = 1;
    } else {
      dx /= l;
      dy /= l;
    }
    return { centre: { x: a.x, y: a.y }, dir: { x: dx, y: dy } };
  }
}
