/**
 * Layer 2 · Outer leaves (Lá nón): swipe (or tap) a leaf panel to peel it back — it curls from the
 * brim end and flutters away. After three by hand the rest go "Whoosh!", then the cap, revealing
 * the mo (tree bark) layer, the inner leaves and a sparkly secret (the poem art, seen later).
 */
import * as THREE from 'three';
import { motion } from '../../a11y/motion';
import type { HintGesture, LayerCallbacks, ScreenPoint } from '../HatViewer';
import { Sparkles, clearGlow, setGlow } from '../fx';
import { MANUAL_PEELS, peelProgress, peelRelease } from '../peel';
import type { PanelState, Rig } from '../rig';
import type { PointerSample } from '../rotator';
import { LayerBase } from './base';

const UP = new THREE.Vector3(0, 1, 0);

export class LeavesLayer extends LayerBase {
  private drag: { panel: PanelState; start: PointerSample; dir: { x: number; y: number }; p: number; last: PointerSample; rustled: boolean } | null = null;
  private manual = 0;
  private busy = false;
  private animating = new Set<PanelState>();

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
    const hat = this.rig.hat;
    if (name === 'mo' && hat.has('mo_bark')) {
      const meshes = hat.meshes('mo_bark');
      const st = { v: 0 };
      this.anim.to(st, { v: 1, duration: 0.45, yoyo: true, repeat: 3, onUpdate: () => setGlow(meshes, 0xffb347, st.v * 0.5), onComplete: () => clearGlow(meshes) });
    } else if (name === 'resin') {
      this.sparkle(this.rig.world([0, 0.12, 0.12]), 70, 0.16);
    } else if (name === 'secret') {
      this.sparkle(this.poemPoint(), 40, 0.06);
    }
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
    const speed = Math.hypot(p.x - d.start.x, p.y - d.start.y) / dt;
    if (peelRelease(d.p, speed) === 'peel') {
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
    const dir = panel.radial.clone().applyAxisAngle(UP, 0.4).add(UP.clone().multiplyScalar(0.8));
    rig.sendAway(panel.hinge, this.anim, { dir, dist: 0.55, duration: reduced ? 0.3 : 0.8, delay: delay + (reduced ? 0.1 : 0.3), spin: reduced ? 0 : 0.8 });
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
    const pop = this.label({ id: 'p2.l2.whoosh', kind: 'pop', place: 'center', anchor: () => rig.world([0, 0.24, 0]) });
    const rest = rig.panels.panels.filter((p) => p.state === 'on');
    const step = motion.reduced ? 0.02 : 0.08;
    rest.forEach((p, i) => this.peelAway(p, false, i * step));
    let t = rest.length * step + 0.4;
    for (const n of ['leaf_outer_cap', 'apex_cap']) {
      if (!rig.hat.has(n)) continue;
      rig.sendAway(rig.hat.get(n), this.anim, { dir: UP, dist: 0.35, delay: t, duration: 0.6 });
    }
    t += 0.7;
    if (!motion.reduced) rig.pose({ yaw: rig.rot.yaw + Math.PI * 0.5 }, t + 0.6, this.anim);
    await this.wait(t + 0.4);
    if (this.disposed) return;
    this.emit('peeled', rig.panels.peeledCount);
    this.unlabel(pop);
    this.reveal(true);
    await this.wait(motion.reduced ? 0.4 : 1.4);
    if (this.disposed) return;
    this.busy = false;
    this.useGesture(null);
    this.complete();
  }

  /** labels for what the leaves were hiding */
  private reveal(animate: boolean): void {
    const rig = this.rig;
    const hat = rig.hat;
    if (animate) this.sfx('sparkle');
    if (hat.has('mo_bark')) {
      const a = new THREE.Vector3();
      const n = new THREE.Vector3();
      this.label({
        id: 'p2.label.mo',
        tone: 'bark',
        place: 'left',
        anchor: () => rig.world([-0.13, 0.08, 0.1], a),
        facing: () => hat.dirToWorld([-0.6, 0.5, 0.6], n),
      });
    }
    if (hat.has('leaf_inner')) {
      const a = new THREE.Vector3();
      this.label({ id: 'p2.label.innerLeaves', tone: 'green', place: 'below', anchor: () => rig.world([0.02, -0.005, 0.24], a) });
    }
    if (hat.has('poem_art')) {
      const n = new THREE.Vector3();
      this.label({
        id: 'p2.label.secret',
        kind: 'callout',
        tone: 'gold',
        place: 'right',
        anchor: () => this.poemPoint(),
        facing: () => hat.dirToWorld([0.6, 0.5, 0.6], n),
        onTap: () => {
          this.emit('say', 'p2.label.secret');
          this.cue('secret');
        },
      });
      if (animate) this.sparkle(this.poemPoint(), 46, 0.07);
    }
  }

  private poemPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return this.rig.world([0.12, 0.1, 0.09], out);
  }

  private sparkle(at: THREE.Vector3, count: number, radius: number): void {
    if (motion.reduced) count = Math.round(count / 3);
    const sp = new Sparkles(count, at, radius, 16 * Math.min(window.devicePixelRatio || 1, 2));
    this.rig.stage.scene.add(sp.points);
    this.onFrame((dt) => {
      if (sp.update(dt)) return true;
      sp.dispose();
      return false;
    });
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
