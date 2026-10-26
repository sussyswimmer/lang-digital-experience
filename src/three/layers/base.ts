/** Shared plumbing for the four Phase 2 layer controllers. */
import type * as THREE from 'three';
import type { HintGesture, LayerCallbacks, LayerController, ScreenPoint } from '../HatViewer';
import type { SfxId } from '../../audio/sfx';
import type { Anim } from '../anim';
import type { Label, LabelSpec } from '../labels';
import type { Rig } from '../rig';
import type { GestureTarget } from '../rotator';

export abstract class LayerBase implements LayerController {
  protected anim: Anim;
  protected disposed = false;
  protected completed = false;
  private labelsOwned = new Set<Label>();
  private frameOffs: (() => void)[] = [];
  private resolveRun: (() => void) | null = null;

  constructor(
    protected rig: Rig,
    protected cb: LayerCallbacks,
  ) {
    this.anim = rig.anim.child();
  }

  abstract run(): Promise<void>;
  abstract finish(): void;

  hint(): { gesture: HintGesture; points: ScreenPoint[] } | null {
    return null;
  }

  assist(): void {}

  cue(_name: string): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.anim.dispose();
    for (const l of this.labelsOwned) this.rig.labels.remove(l);
    this.labelsOwned.clear();
    for (const off of this.frameOffs) off();
    this.frameOffs = [];
    if (this.rig.currentGesture === this.gestureTarget) this.rig.setGesture(null);
    this.rig.rot.locked = false;
    // run() is left pending on purpose: a disposed layer never "completes"
    this.resolveRun = null;
  }

  /** the gesture handler this layer installs (set in subclasses) */
  protected gestureTarget: GestureTarget | null = null;

  protected useGesture(g: GestureTarget | null): void {
    this.gestureTarget = g;
    this.rig.setGesture(g);
  }

  /** a promise that resolves when complete() is called (or the layer is disposed) */
  protected waitForCompletion(): Promise<void> {
    if (this.completed) return Promise.resolve();
    return new Promise((resolve) => {
      this.resolveRun = resolve;
    });
  }

  protected complete(): void {
    if (this.completed) return;
    this.completed = true;
    this.emit('complete');
    this.resolveRun?.();
    this.resolveRun = null;
  }

  protected label(spec: LabelSpec): Label {
    const l = this.rig.labels.add({
      ...spec,
      onTap: spec.onTap ?? (spec.id ? () => this.emit('say', spec.id) : undefined),
    });
    this.labelsOwned.add(l);
    return l;
  }

  protected unlabel(l: Label | null | undefined): void {
    if (!l) return;
    this.rig.labels.remove(l);
    this.labelsOwned.delete(l);
  }

  protected onFrame(fn: (dt: number) => boolean | void): void {
    this.frameOffs.push(this.rig.stage.onFrame(fn));
  }

  protected emit(name: string, data?: unknown): void {
    if (!this.disposed) this.cb.onEvent?.(name, data);
  }

  protected sfx(id: SfxId, step?: number): void {
    if (!this.disposed) this.rig.sound(id, step === undefined ? undefined : { step });
  }

  protected wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.anim.call(seconds, resolve));
  }

  protected screen(v: THREE.Vector3): ScreenPoint & { visible: boolean } {
    return this.rig.stage.toScreen(v, { x: 0, y: 0, visible: false });
  }
}
