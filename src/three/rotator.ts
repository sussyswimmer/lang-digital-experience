/**
 * Turning the hat by hand, and deciding who owns a touch.
 *
 * On pointerdown the current layer gets the first say (`down`): if the finger lands on its target
 * (the stitch row to trace, a leaf to peel) it owns the gesture and the hat stays still. Otherwise
 * the drag turns the hat: yaw freely, pitch within limits, with a little inertia. A short touch
 * that never became a drag is offered to the layer as a tap (floating stitches, skeleton, strap).
 * No zoom, no pan.
 */
import { MathUtils } from 'three';

const clamp = MathUtils.clamp;

export interface PointerSample {
  x: number;
  y: number;
  /** ms */
  t: number;
}

export interface GestureTarget {
  down?(p: PointerSample): boolean;
  move?(p: PointerSample): void;
  up?(p: PointerSample, cancelled: boolean): void;
  tap?(p: PointerSample): boolean;
  /** mouse hover: return a CSS cursor when over something interactive */
  cursor?(p: PointerSample): string | null;
}

const YAW_PER_PX = 0.0062;
const PITCH_PER_PX = 0.0042;
export const PITCH_MIN = -1.05; // −60°: look into the underside
export const PITCH_MAX = 1.3; // +75°: look down on the tip
const TAP_MS = 450;
const TAP_PX = 14;
const DRAG_PX = 10;

export class Rotator {
  yaw = 0;
  pitch = 0;
  /** rad/s */
  vYaw = 0;
  vPitch = 0;
  /** scripted poses lock the child's rotation */
  locked = false;
  target: GestureTarget | null = null;
  /** called when the child starts touching (any pointer) */
  onInput: () => void = () => {};

  private active: { id: number; start: PointerSample; last: PointerSample; mode: 'pending' | 'rotate' | 'owned'; samples: PointerSample[] } | null = null;

  constructor(
    private el: HTMLElement,
    private wake: () => void,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onCancel);
  }

  get dragging(): boolean {
    return this.active?.mode === 'rotate';
  }

  /** advance inertia; true while still moving */
  update(dt: number): boolean {
    if (this.active || this.locked) return false;
    if (Math.abs(this.vYaw) < 0.002 && Math.abs(this.vPitch) < 0.002) {
      this.vYaw = this.vPitch = 0;
      return false;
    }
    this.yaw += this.vYaw * dt;
    this.pitch = clamp(this.pitch + this.vPitch * dt, PITCH_MIN, PITCH_MAX);
    const k = Math.exp(-4.5 * dt);
    this.vYaw *= k;
    this.vPitch *= k;
    return true;
  }

  stop(): void {
    this.vYaw = this.vPitch = 0;
  }

  dispose(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancel);
    el.removeEventListener('lostpointercapture', this.onCancel);
  }

  private sample(e: PointerEvent): PointerSample {
    return { x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.active) return; // one finger at a time keeps it simple for small hands
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.onInput();
    const p = this.sample(e);
    this.vYaw = this.vPitch = 0;
    const owned = !!this.target?.down?.(p);
    this.active = { id: e.pointerId, start: p, last: p, mode: owned ? 'owned' : 'pending', samples: [p] };
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events can't be captured */
    }
    e.preventDefault();
    this.wake();
  };

  private onMove = (e: PointerEvent): void => {
    const a = this.active;
    if (!a) {
      if (e.pointerType === 'mouse') this.el.style.cursor = this.target?.cursor?.(this.sample(e)) ?? 'grab';
      return;
    }
    if (e.pointerId !== a.id) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    for (const ev of list) this.handleMove(this.sample(ev));
  };

  private handleMove(p: PointerSample): void {
    const a = this.active!;
    if (a.mode === 'owned') {
      this.target?.move?.(p);
    } else {
      if (a.mode === 'pending' && Math.hypot(p.x - a.start.x, p.y - a.start.y) > DRAG_PX) {
        a.mode = 'rotate';
        this.el.style.cursor = 'grabbing';
      }
      if (a.mode === 'rotate' && !this.locked) {
        this.yaw += (p.x - a.last.x) * YAW_PER_PX;
        this.pitch = clamp(this.pitch + (p.y - a.last.y) * PITCH_PER_PX, PITCH_MIN, PITCH_MAX);
      }
    }
    a.last = p;
    a.samples.push(p);
    if (a.samples.length > 8) a.samples.shift();
    this.wake();
  }

  private onUp = (e: PointerEvent): void => {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const p = this.sample(e);
    this.active = null;
    if (a.mode === 'owned') {
      this.target?.up?.(p, false);
    } else if (a.mode === 'pending') {
      const quick = p.t - a.start.t < TAP_MS || Math.hypot(p.x - a.start.x, p.y - a.start.y) < TAP_PX;
      if (quick) this.target?.tap?.(p);
    } else if (!this.locked) {
      // fling: average velocity over the last ~80 ms
      const recent = a.samples.filter((s) => p.t - s.t < 90);
      const first = recent[0] ?? a.start;
      const dt = Math.max((p.t - first.t) / 1000, 1 / 120);
      this.vYaw = clamp(((p.x - first.x) * YAW_PER_PX) / dt, -9, 9);
      this.vPitch = clamp(((p.y - first.y) * PITCH_PER_PX) / dt, -5, 5);
    }
    this.el.style.cursor = '';
    this.wake();
  };

  private onCancel = (e: PointerEvent): void => {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    if (a.mode === 'owned') this.target?.up?.(this.sample(e), true);
    this.el.style.cursor = '';
  };
}
