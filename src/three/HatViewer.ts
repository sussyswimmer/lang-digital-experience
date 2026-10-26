/**
 * The persistent WebGL hat shared by Phase 1 (convergence), Phase 2 (layers) and Phase 3
 * (celebration → storybook cover). Built from the Blender GLB (assets/models/nonla.glb) and its
 * sidecar (assets/models/nonla.meta.json); see docs/ARCHITECTURE.md §3D contract.
 *
 * This file defines the public API the phases use. The implementation lives in ./stage.ts
 * (and ./fallback2d.ts when the device can't run WebGL).
 */
import type { LayerId } from '../app/types';
import type { SfxId } from '../audio/sfx';

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type HintGesture = 'tap' | 'swipe' | 'drag' | 'trace';

export interface LayerController {
  /** start the layer's interaction; resolves when the child has completed it */
  run(): Promise<void>;
  /** jump straight to the finished state (revisits, tests) */
  finish(): void;
  dispose(): void;
  /** where the 5-second hand hint should point right now (viewport px), or null when nothing to do */
  hint?(): { gesture: HintGesture; points: ScreenPoint[] } | null;
  /** do the current step for the child ("show me", keyboard Enter/Space) */
  assist?(): void;
  /** a visual cue fired by an insight chunk (e.g. 'thirdRim', 'brim', 'joints') */
  cue?(name: string): void;
}

export interface LayerCallbacks {
  /**
   * Things the layer wants the screen to know: 'say' (string id: a label was tapped, narrate it),
   * 'ring' (number: rings counted so far), 'peeled' (number), 'whoosh', 'complete', 'floating' (boolean)…
   */
  onEvent?(name: string, data?: unknown): void;
  /** where idle hints should point, in viewport px */
  hintTarget?(target: { x: number; y: number }[] | null): void;
}

/** Test hooks (window.__nonla.p2) read these. */
export interface ViewerDebug {
  tracePath(): ScreenPoint[];
  floating(): boolean;
  peeled(): number;
  ringsShown(): number;
  strapAngle(): number;
  /** screen point on the white stitches piece (on the hat or floating) */
  stitchesPoint(): ScreenPoint | null;
}

export interface HatViewer {
  readonly canvas: HTMLCanvasElement;
  /** '3d' normally; '2d' is the layered drawing used when WebGL can't start */
  readonly kind: '3d' | '2d';
  /** resolves once the GLB and textures are loaded */
  ready: Promise<void>;
  /**
   * Where the hat's own sounds go (stitch ticks, leaf peels, ring snaps, the celebration chime).
   * Screens set it to `(id, o) => ctx.audio.sfx.play(id, o)`; it stays set for later phases.
   */
  sound: (id: SfxId, opts?: { step?: number }) => void;
  show(opts?: { fade?: number }): void;
  hide(opts?: { fade?: number }): void;
  /** pointer input on the canvas (rotation + layer gestures) */
  setInteractive(on: boolean): void;
  /** put every part home, reset the view (used when entering Phase 2 directly) */
  resetHat(): void;
  /**
   * The screen area (viewport px) the hat should sit in, e.g. the space left of an open panel.
   * null = the whole viewport minus the top bar and captions.
   */
  setFrame(rect: ScreenRect | null, opts?: { duration?: number }): void;

  /** Phase 1 → 2: photos fly in from these rects and become the hat */
  convergeFrom(rects: ScreenRect[], images: string[]): Promise<void>;

  /** Phase 2: create the controller for one layer */
  layer(id: LayerId, cb: LayerCallbacks): LayerController;
  /** recolour the strap (purple / peach / green) */
  setStrapColour(c: 'purple' | 'peach' | 'green'): void;

  /**
   * Phase 2 → 3: reassemble, celebrate (glow + one full turn), then shrink into `rect`.
   * The hat is left visible inside `rect`; the caller hides it once its own cover is in place.
   */
  celebrateAndShrinkTo(rect: ScreenRect): Promise<void>;

  /** screen positions of a named part (for DOM labels / hints) */
  project(name: string): { x: number; y: number; visible: boolean } | null;
  debug(): ViewerDebug;
  dispose(): void;
}

let instance: Promise<HatViewer> | null = null;

/**
 * The shared viewer. It resolves once the hat can be shown: the 3D hat, or the 2D drawing when WebGL
 * or the model fails. If even the code can't load, it rejects and the next call tries again.
 */
export function getViewer(host: HTMLElement): Promise<HatViewer> {
  if (!instance) {
    instance = import('./stage')
      .then((m) => m.createViewer(host))
      .catch((err) => {
        instance = null;
        throw err;
      });
  }
  return instance;
}
