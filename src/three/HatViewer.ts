/**
 * The persistent WebGL hat shared by Phase 1 (convergence), Phase 2 (layers) and Phase 3
 * (celebration → storybook cover). Built from the Blender GLB (assets/models/nonla.glb) and its
 * sidecar (assets/models/nonla.meta.json); see docs/ARCHITECTURE.md §3D contract.
 *
 * This file defines the public API the phases use. The implementation lives in ./stage.ts.
 */
import type { LayerId } from '../app/types';

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayerController {
  /** start the layer's interaction; resolves when the child has completed it */
  run(): Promise<void>;
  /** jump straight to the finished state (revisits, tests) */
  finish(): void;
  dispose(): void;
}

export interface LayerCallbacks {
  /** a narration cue fired by the layer (e.g. 'stitches.complete') */
  onEvent?(name: string, data?: unknown): void;
  /** where idle hints should point, in viewport px */
  hintTarget?(target: { x: number; y: number }[] | null): void;
}

export interface HatViewer {
  readonly canvas: HTMLCanvasElement;
  /** resolves once the GLB and textures are loaded */
  ready: Promise<void>;
  show(opts?: { fade?: number }): void;
  hide(opts?: { fade?: number }): void;
  /** pointer input on the canvas (rotation + layer gestures) */
  setInteractive(on: boolean): void;
  /** put every part home, reset the view (used when entering Phase 2 directly) */
  resetHat(): void;

  /** Phase 1 → 2: photos fly in from these rects and become the hat */
  convergeFrom(rects: ScreenRect[], images: string[]): Promise<void>;

  /** Phase 2: create the controller for one layer */
  layer(id: LayerId, cb: LayerCallbacks): LayerController;
  /** recolour the strap (purple / peach / green) */
  setStrapColour(c: 'purple' | 'peach' | 'green'): void;

  /** Phase 2 → 3: reassemble, celebrate (glow + one full turn), then shrink into `rect` */
  celebrateAndShrinkTo(rect: ScreenRect): Promise<void>;

  /** screen positions of a named part (for DOM labels / hints) */
  project(name: string): { x: number; y: number; visible: boolean } | null;
  dispose(): void;
}

let instance: Promise<HatViewer> | null = null;

export function getViewer(host: HTMLElement): Promise<HatViewer> {
  if (!instance) instance = import('./stage').then((m) => m.createViewer(host));
  return instance;
}
