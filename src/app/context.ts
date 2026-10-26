import type { Store } from './store';
import type { Router } from './router';
import type { Flags } from './flow';
import type { ChapterId, LayerId, Progress, Route, Settings } from './types';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Narration } from '../audio/Narration';
import type { IdleHint } from '../a11y/idleHint';
import type { HatViewer } from '../three/HatViewer';

/** Everything a screen needs. One instance for the whole visit. */
export interface AppContext {
  progress: Store<Progress>;
  settings: Store<Settings>;
  router: Router;
  flags: Flags & { test: boolean; debug: boolean };
  audio: AudioEngine;
  narration: Narration;
  idle: IdleHint;
  /** the persistent full-screen WebGL hat (created on first use; P1 → P2 → P3 share it) */
  viewer(): Promise<HatViewer>;
  /** layers: #ui (screen DOM), #stage (canvas host), #hints, #toasts */
  layers: { ui: HTMLElement; stage: HTMLElement; hints: HTMLElement; toasts: HTMLElement };

  go(route: Route): void;
  /** mark progress and move on to the next step of the journey */
  completeP1(): void;
  completeLayer(layer: LayerId): void;
  completeChapter(chapter: ChapterId): void;
  toast(text: string, ms?: number): void;
}

/** A screen is mounted into #ui for one route and unmounted when the route changes. */
export interface Screen {
  mount(root: HTMLElement, ctx: AppContext, params: Record<string, string>): Promise<void> | void;
  /** called when only the params change (e.g. p2/stitches → p2/leaves); return false to remount */
  update?(params: Record<string, string>): boolean;
  /** must kill tweens, stop audio and remove listeners */
  unmount(): void;
}

export type ScreenModule = { default: () => Screen };
