/**
 * Layer 1 · Stitching thread (Chỉ khâu): trace row 03 (where sewing starts) with a finger, watch
 * the glow cascade (row 03 → row 02 → the red brim → the other rows), then the white stitches lift
 * off as one piece and float beside the hat, keeping their shape and turning with it. Tapping the
 * floating stitches slides them back; tapping the hat lifts them off again.
 */
import * as THREE from 'three';
import { motion } from '../../a11y/motion';
import type { HintGesture, LayerCallbacks, ScreenPoint } from '../HatViewer';
import { clearGlow, setGlow } from '../fx';
import { FLOAT_DIST, type Rig } from '../rig';
import { HAT_CENTRE_Y, DEFAULT_FRAMING } from '../scene';
import { coverage, isTraceComplete, nearArc, samplePath, stitchesNearSegment, traceRadius, visibleArc, type StitchOnScreen } from '../trace';
import type { PointerSample } from '../rotator';
import type { Label } from '../labels';
import { LayerBase } from './base';

const GLOW_RATE = 12; // per second: each stitch takes ~0.1 s to light
const RED = 0xff3b2a;
/** the floating stitches keep a faint glow so they read as "the lit-up piece" */
const REST = 0.15;

export class StitchesLayer extends LayerBase {
  private rowName: string;
  private pts: THREE.Vector3[];
  private nrm: THREE.Vector3[];
  private covered: boolean[];
  private target: Float32Array;
  private screenPts: StitchOnScreen[] = [];
  private last: PointerSample | null = null;
  private stroke = 0;
  private failedLifts = 0;
  private ticks = 0;
  private lastTick = 0;
  private floatLabel: Label | null = null;
  private tapLabel: Label | null = null;
  private brimLabel: Label | null = null;
  private busy = false;

  constructor(rig: Rig, cb: LayerCallbacks, animate: boolean) {
    super(rig, cb);
    rig.prepare('stitches', this.anim, animate);
    rig.defaultFraming(animate ? 0.8 : 0);
    const meta = rig.hat.meta;
    this.rowName = meta.trace_rows[0] ?? 'stitch_white_row_03';
    const row = rig.hat.row(this.rowName);
    this.pts = row.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.nrm = row.normals.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.covered = new Array(row.count).fill(false);
    this.target = new Float32Array(row.count);
    this.onFrame((dt) => this.lerpGlow(dt));
  }

  async run(): Promise<void> {
    this.useGesture({
      down: (p) => this.down(p),
      move: (p) => this.move(p),
      up: (p) => this.up(p),
      tap: (p) => this.tap(p),
      cursor: (p) => (this.completed ? (this.hitStitches(p) ? 'pointer' : null) : nearArc(this.project(), p, this.radius()) ? 'crosshair' : null),
    });
    // a soft shimmer running along the row says "this one"
    if (!motion.reduced) this.shimmer();
    return this.waitForCompletion();
  }

  finish(): void {
    if (this.completed) return;
    this.anim.killAll();
    this.covered.fill(true);
    this.target.fill(1);
    this.rig.stitches.setAllGlow(REST);
    Object.assign(this.rig.stitches.float, { f: 1, lift: 1 });
    this.frameBoth(0);
    this.showFloatLabels();
    this.showBrimLabel();
    this.emit('floating', true);
    this.complete();
  }

  hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
    if (this.completed || this.busy) return null;
    const path = this.tracePath();
    if (path.length < 2) return null;
    return { gesture: 'trace', points: samplePath(path, 9) };
  }

  assist(): void {
    if (this.completed || this.busy) return;
    const arc = this.arcIndices();
    const st = { k: 0 };
    this.busy = true;
    this.anim.to(st, {
      k: arc.length,
      duration: 1.6,
      ease: 'none',
      onUpdate: () => {
        for (let j = 0; j < Math.floor(st.k); j++) this.cover(arc[j]);
      },
      onComplete: () => {
        this.busy = false;
        this.celebrate();
      },
    });
  }

  cue(name: string): void {
    const s = this.rig.stitches;
    if (name === 'thirdRim') {
      // the needle path: row 03 first, then down towards the edge (row 02)
      const r3 = s.row(this.rowName);
      const r2 = s.row('stitch_white_row_02');
      const st = { a: 0, b: 0 };
      const paint = () => {
        if (r3) {
          r3.glow.setAll(REST + (1 - REST) * st.a);
          r3.dots.values.fill(st.a);
        }
        if (r2) {
          r2.glow.setAll(REST + (1 - REST) * st.b);
          r2.dots.values.fill(st.b);
        }
      };
      this.anim
        .timeline({ onUpdate: paint })
        .to(st, { a: 1, duration: 0.5 })
        .to(st, { b: 1, duration: 0.5 })
        .to(st, { a: 0, b: 0, duration: 1.2, delay: 1.6 });
      const l = this.label({ id: 'p2.label.thirdRim', anchor: () => this.frontPoint(), facing: () => this.frontNormal(), tone: 'white', place: 'below' });
      this.anim.call(5, () => this.unlabel(l));
    } else if (name === 'brim') {
      this.pulseBrim(3);
      this.showBrimLabel();
    } else if (name === 'stitches') {
      const st = { v: REST };
      this.anim.to(st, { v: 1, duration: 0.4, yoyo: true, repeat: 1, onUpdate: () => s.setAllGlow(st.v) });
    }
  }

  dispose(): void {
    clearGlow(this.rig.hat.meshes('brim'));
    super.dispose();
  }

  // ---------------------------------------------------------------- tracing

  private radius(): number {
    return traceRadius(this.rig.stage.width, this.rig.stage.height);
  }

  /** screen positions + visibility of the trace row's stitches, right now */
  private project(): StitchOnScreen[] {
    const stage = this.rig.stage;
    const hat = this.rig.hat;
    const cam = stage.camera.position;
    const w = new THREE.Vector3();
    const n = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const out: StitchOnScreen[] = this.screenPts;
    out.length = this.pts.length;
    const group = this.rig.stitches.group;
    for (let i = 0; i < this.pts.length; i++) {
      w.copy(this.pts[i]).applyMatrix4(group.matrixWorld);
      n.copy(this.nrm[i]).transformDirection(hat.assembly.matrixWorld);
      toCam.copy(cam).sub(w).normalize();
      const s = stage.toScreen(w);
      out[i] = { x: s.x, y: s.y, visible: s.visible && n.dot(toCam) > 0.12 };
    }
    return out;
  }

  private arcIndices(): number[] {
    return visibleArc(this.project().map((s) => s.visible));
  }

  tracePath(): ScreenPoint[] {
    const pts = this.project();
    return visibleArc(pts.map((s) => s.visible)).map((i) => ({ x: pts[i].x, y: pts[i].y }));
  }

  private down(p: PointerSample): boolean {
    if (this.completed || this.busy) return false;
    const pts = this.project();
    if (!nearArc(pts, p, this.radius() * 1.25)) return false;
    this.last = p;
    this.stroke = 0;
    this.markSegment(p, p);
    return true;
  }

  private move(p: PointerSample): void {
    if (!this.last || this.completed) return;
    this.project();
    this.markSegment(this.last, p);
    this.last = p;
    if (isTraceComplete(this.covered, this.screenPts.map((s) => s.visible))) this.celebrate();
  }

  private up(_p: PointerSample): void {
    if (!this.last) return;
    this.last = null;
    if (this.completed || this.busy) return;
    const c = coverage(this.covered, this.project().map((s) => s.visible));
    if (c.ratio < 0.3) this.failedLifts++;
    // after two tries that didn't get far, help: "let's do it together"
    if (this.failedLifts >= 2) {
      this.emit('assist');
      this.assist();
    }
  }

  private markSegment(a: PointerSample, b: PointerSample): void {
    for (const i of stitchesNearSegment(this.screenPts, a, b, this.radius())) this.cover(i);
  }

  private cover(i: number): void {
    if (this.covered[i]) return;
    this.covered[i] = true;
    this.target[i] = 1;
    this.stroke++;
    this.ticks++;
    const now = performance.now();
    if (this.ticks % 3 === 0 && now - this.lastTick > 80) {
      this.lastTick = now;
      this.sfx('stitchTick', Math.min(10, Math.floor(this.ticks / 6)));
      if (this.ticks % 9 === 0) navigator.vibrate?.(8);
    }
    this.rig.stage.invalidate();
  }

  private lerpGlow(dt: number): boolean {
    const r = this.rig.stitches.row(this.rowName);
    if (!r || this.completed) return false;
    let moving = false;
    for (let i = 0; i < this.target.length; i++) {
      const cur = r.glow.values[i];
      const t = this.target[i];
      if (Math.abs(cur - t) < 0.01) continue;
      const v = cur + Math.sign(t - cur) * Math.min(Math.abs(t - cur), dt * GLOW_RATE);
      r.glow.set(i, v);
      r.dots.values[i] = v;
      moving = true;
    }
    if (moving) {
      r.dots.flush();
      r.glow.flush();
    }
    return moving;
  }

  private shimmer(): void {
    const r = this.rig.stitches.row(this.rowName);
    if (!r) return;
    const st = { t: 0 };
    const n = r.count;
    this.anim.to(st, {
      t: 1,
      duration: 2.4,
      repeat: -1,
      repeatDelay: 1.2,
      ease: 'none',
      onUpdate: () => {
        if (this.completed) return;
        const head = st.t * n * 1.5 - n * 0.25;
        for (let i = 0; i < n; i++) {
          if (this.covered[i]) continue;
          const d = Math.abs(i - head);
          const v = d < 10 ? 0.25 * (1 - d / 10) : 0;
          r.glow.set(i, v);
          r.dots.values[i] = v * 0.8;
        }
        r.dots.flush();
      },
    });
  }

  // ---------------------------------------------------------------- the reveal

  private async celebrate(): Promise<void> {
    if (this.completed || this.busy) return;
    this.busy = true;
    this.last = null;
    this.useGesture(null);
    const rig = this.rig;
    const s = rig.stitches;
    const reduced = motion.reduced;
    rig.rot.locked = true;
    rig.rot.stop();
    this.emit('traced');
    this.sfx('chime');
    const row3 = s.row(this.rowName)!;
    const n = row3.count;
    // distance (in stitches) from every stitch to the traced part, so the glow runs on from there
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let best = n;
      for (let j = 0; j < n; j++) {
        if (!this.covered[j]) continue;
        const d = Math.min(Math.abs(i - j), n - Math.abs(i - j));
        if (d < best) best = d;
      }
      dist[i] = best;
    }
    const maxD = Math.max(1, ...dist);
    const row2 = s.row('stitch_white_row_02');
    const others = s.rows.filter((r) => r !== row3 && r !== row2);
    const st = { a: 0, b: 0, c: 0, brim: 0 };
    const brim = rig.hat.meshes('brim_thread_red');
    const wires = [...rig.hat.meshes('brim_wire_inner'), ...rig.hat.meshes('brim_wire_outer')];
    const tl = this.anim.timeline();
    tl.to(st, {
      a: 1,
      duration: reduced ? 0.2 : 0.55,
      ease: 'none',
      onUpdate: () => {
        for (let i = 0; i < n; i++) {
          const v = dist[i] <= st.a * maxD ? 1 : row3.glow.values[i];
          row3.glow.set(i, v);
          row3.dots.values[i] = v;
        }
      },
    });
    // row 02: sewing continues down towards the edge
    if (row2) {
      tl.call(() => this.sfx('threadZip'));
      tl.to(st, {
        b: 1,
        duration: reduced ? 0.2 : 0.6,
        ease: 'none',
        onUpdate: () => {
          for (let i = 0; i < row2.count; i++) {
            const k = (i / row2.count + 0.25) % 1; // start at the front
            const v = k <= st.b ? 1 : 0;
            row2.glow.set(i, v);
            row2.dots.values[i] = v;
          }
        },
      });
    }
    // the brim: red thread + two bamboo wires, a different job
    tl.call(() => {
      this.sfx('invite');
      this.showBrimLabel();
    });
    tl.to(st, {
      brim: 1,
      duration: 0.35,
      yoyo: true,
      repeat: 3,
      ease: 'sine.inOut',
      onUpdate: () => {
        setGlow(brim, RED, st.brim * 1.4);
        setGlow(wires, 0xffc46b, st.brim * 0.6);
      },
      onComplete: () => {
        setGlow(brim, RED, 0.25);
        clearGlow(wires);
      },
    });
    // the rest of the white rows light together (no upward sweep)
    tl.call(() => this.sfx('sparkle'));
    tl.to(st, {
      c: 1,
      duration: 0.4,
      onUpdate: () => {
        for (const r of others) {
          r.glow.setAll(st.c);
          r.dots.values.fill(st.c * 0.8);
        }
      },
    });
    tl.to({}, { duration: reduced ? 0.1 : 0.35 });
    tl.call(() => this.sfx('swish'));
    tl.to(s.float, { lift: 1, duration: 0.45, ease: 'back.out(2)' });
    tl.call(() => this.frameBoth(1.1));
    tl.to(s.float, { f: 1, duration: reduced ? 0.3 : 1.1, ease: 'power2.inOut' });
    tl.to(st, {
      a: 0,
      duration: 0.8,
      onUpdate: () => s.setAllGlow(REST + (1 - REST) * st.a),
    });
    await this.anim.done(tl);
    if (this.disposed) return;
    s.setAllGlow(REST);
    rig.rot.locked = false;
    this.busy = false;
    this.showFloatLabels();
    this.startBob();
    this.useGesture({ tap: (p) => this.tap(p), cursor: (p) => (this.hitStitches(p) ? 'pointer' : null) });
    this.emit('floating', true);
    this.complete();
  }

  private frameBoth(duration: number): void {
    const half = FLOAT_DIST / 2;
    this.rig.frameTo({ cx: half, cy: HAT_CENTRE_Y + 0.01, halfW: DEFAULT_FRAMING.halfW + half, halfH: DEFAULT_FRAMING.halfH + 0.02 }, duration);
  }

  private startBob(): void {
    if (motion.reduced) return;
    const s = this.rig.stitches;
    this.onFrame(() => {
      if (s.float.f < 0.5) {
        s.float.bob = 0;
        return false;
      }
      s.float.bob = Math.sin(performance.now() / 1000 * Math.PI * 2 * 0.5) * 0.004;
      return true;
    });
  }

  private hitStitches(p: PointerSample): boolean {
    return !!this.rig.stage.hit(p.x, p.y, [this.rig.stitches.proxy]);
  }

  private tap(p: PointerSample): boolean {
    if (!this.completed || this.busy) return false;
    if (!this.hitStitches(p)) return false;
    this.toggle();
    return true;
  }

  /** slide the white stitches back onto the hat, or lift them off again */
  toggle(): void {
    const s = this.rig.stitches;
    const out = s.float.f < 0.5;
    this.busy = true;
    if (out) {
      this.sfx('swish');
      this.frameBoth(0.9);
      this.anim
        .timeline({ onComplete: () => (this.busy = false) })
        .to(s.float, { lift: 1, duration: 0.3, ease: 'back.out(2)' })
        .to(s.float, { f: 1, duration: 0.9, ease: 'power2.inOut' });
      this.showFloatLabels();
    } else {
      this.sfx('floatBack');
      this.unlabel(this.floatLabel);
      this.unlabel(this.tapLabel);
      this.floatLabel = this.tapLabel = null;
      this.rig.defaultFraming(0.9);
      this.anim
        .timeline({ onComplete: () => {
          this.busy = false;
          this.sfx('snap');
        } })
        .to(s.float, { f: 0, duration: 0.8, ease: 'power2.inOut' })
        .to(s.float, { lift: 0, bob: 0, duration: 0.25 });
    }
    this.emit('floating', out);
  }

  private showFloatLabels(): void {
    const s = this.rig.stitches;
    const top = new THREE.Vector3();
    if (!this.floatLabel) {
      this.floatLabel = this.label({
        id: 'p2.label.whiteThread',
        tone: 'white',
        place: 'above',
        anchor: () => (s.float.f > 0.8 ? s.group.localToWorld(top.set(0, 0.215, 0)) : null),
      });
    }
    if (!this.tapLabel) {
      const low = new THREE.Vector3();
      this.tapLabel = this.label({
        id: 'p2.label.tapToReturn',
        kind: 'callout',
        tone: 'gold',
        place: 'below',
        anchor: () => (s.float.f > 0.8 ? s.group.localToWorld(low.set(0, -0.03, 0)) : null),
        onTap: () => this.toggle(),
      });
    }
  }

  private showBrimLabel(): void {
    if (this.brimLabel) return;
    const a = this.rig.hat.meta.anchors.anchor_label_brim ?? [0.08, 0.005, 0.23];
    const w = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    this.brimLabel = this.label({
      id: 'p2.label.redThread',
      tone: 'red',
      place: 'below',
      anchor: () => this.rig.hat.toWorld(a, w),
      facing: () => this.rig.hat.dirToWorld([a[0], 0, a[2]], nrm),
      onTap: () => {
        this.emit('say', 'p2.label.redThread');
        this.pulseBrim(2);
      },
    });
  }

  private pulseBrim(times: number): void {
    const brim = this.rig.hat.meshes('brim_thread_red');
    const wires = [...this.rig.hat.meshes('brim_wire_inner'), ...this.rig.hat.meshes('brim_wire_outer'), ...this.rig.hat.meshes('brim_bark')];
    const st = { v: 0 };
    this.anim.to(st, {
      v: 1,
      duration: 0.4,
      yoyo: true,
      repeat: times * 2 - 1,
      ease: 'sine.inOut',
      onUpdate: () => {
        setGlow(brim, RED, 0.25 + st.v * 1.3);
        setGlow(wires, 0xffc46b, st.v * 0.55);
      },
      onComplete: () => clearGlow(wires),
    });
  }

  /** the trace-row stitch that faces the camera most (for labels) */
  private frontIndex(): number {
    const pts = this.project();
    const arc = visibleArc(pts.map((s) => s.visible));
    return arc[Math.floor(arc.length / 2)] ?? 0;
  }

  private frontPoint(): THREE.Vector3 {
    return this.pts[this.frontIndex()].clone().applyMatrix4(this.rig.stitches.group.matrixWorld);
  }

  private frontNormal(): THREE.Vector3 {
    return this.rig.hat.dirToWorld(this.nrm[this.frontIndex()]);
  }
}
