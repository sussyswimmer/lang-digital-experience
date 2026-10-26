/**
 * The experience shell: owns the stores, audio, narration, idle hints and the current screen.
 * Each route's screen module is loaded on demand (code-split per phase).
 */
import { Store } from './store';
import { Router } from './router';
import { canEnter, completeChapter, completeLayer, completeP1, migrate, nextAfter, resumeRoute, type Flags } from './flow';
import { KEYS, readJSON, writeJSON } from './persist';
import type { AppContext, Screen, ScreenModule } from './context';
import type { FlowState, Progress, Route, Settings } from './types';
import { AudioEngine } from '../audio/AudioEngine';
import { Narration } from '../audio/Narration';
import { CaptionBar } from '../ui/CaptionBar';
import { IdleHint } from '../a11y/idleHint';
import { motion } from '../a11y/motion';
import { i18n } from '../i18n/i18n';
import { el } from '../ui/el';
import { getViewer, type HatViewer } from '../three/HatViewer';

const SCREENS: Record<Exclude<FlowState, 'landing'>, () => Promise<ScreenModule>> = {
  p1: () => import('../phases/phase1/Phase1Screen'),
  p2: () => import('../phases/phase2/Phase2Screen'),
  p3: () => import('../phases/phase3/Phase3Screen'),
  hub: () => import('../phases/phase4/HubScreen'),
  build: () => import('../phases/phase4/build/BuildScreen'),
  colour: () => import('../phases/phase4/colour/ColourScreen'),
  gallery: () => import('../phases/phase4/gallery/GalleryScreen'),
  quiz: () => import('../phases/phase4/quiz/QuizScreen'),
  certificate: () => import('../phases/phase4/quiz/CertificateScreen'),
};

export class App {
  readonly ctx: AppContext;
  private screen: Screen | null = null;
  private screenState: FlowState | null = null;
  private mountToken = 0;
  private onLeave: () => void;
  /** the shared hat, once a screen has asked for it */
  private hat: HatViewer | null = null;

  constructor(opts: { audio: AudioEngine; settings: Store<Settings>; onLeave: () => void }) {
    this.onLeave = opts.onLeave;
    const root = document.getElementById('app')!;
    const layers = {
      ui: document.getElementById('ui')!,
      stage: document.getElementById('stage')!,
      hints: document.getElementById('hints')!,
      toasts: document.getElementById('toasts')!,
    };
    const params = new URLSearchParams(location.search);
    const flags: Flags & { test: boolean; debug: boolean } = {
      review: params.has('review'),
      test: params.has('test'),
      debug: params.has('debug'),
    };
    const progress = new Store<Progress>(migrate(readJSON(KEYS.progress)));
    progress.subscribe((p) => writeJSON(KEYS.progress, p));
    const captions = new CaptionBar(document.getElementById('captions')!);
    const narration = new Narration(opts.audio, captions);
    const idle = new IdleHint(layers.hints);
    narration.onBusy = (busy) => idle.setBusy(busy);
    if (flags.test) {
      idle.scale = 0.1;
      narration.setSpeed(20);
    }
    const settings = opts.settings;
    captions.enabled = settings.get().captions;
    settings.subscribe((s) => {
      captions.enabled = s.captions;
      narration.enabled = s.narration;
    });
    const router = new Router();

    const go = (route: Route) => router.go(route);
    const advance = (state: FlowState, params: Record<string, string>) => go(nextAfter(state, params, progress.get()));

    this.ctx = {
      progress,
      settings,
      router,
      flags,
      audio: opts.audio,
      narration,
      idle,
      layers,
      viewer: () =>
        getViewer(layers.stage).then((v) => {
          if (!this.hat) this.releaseHat((this.hat = v));
          return v;
        }),
      go,
      completeP1: () => {
        progress.set(completeP1);
        advance('p1', {});
      },
      completeLayer: (layer) => {
        progress.set((p) => completeLayer(p, layer));
        advance('p2', { layer });
      },
      completeChapter: (chapter) => {
        progress.set((p) => completeChapter(p, chapter));
        advance('p3', { chapter });
      },
      toast: (text, ms = 2400) => {
        const t = el('div.toast', {}, text);
        layers.toasts.appendChild(t);
        window.setTimeout(() => t.remove(), ms);
      },
    };
    root.hidden = false;
    document.addEventListener('visibilitychange', () => opts.audio.suspend(document.hidden));
    motion.set(settings.get().motion);
    if (flags.test) exposeTestHooks(this);
  }

  start(): void {
    this.ctx.router.start((r) => this.route(r));
  }

  private async route(r: Route | 'resume'): Promise<void> {
    const ctx = this.ctx;
    if (r === 'resume') {
      ctx.router.go(resumeRoute(ctx.progress.get()), true);
      return;
    }
    if (r.state === 'landing') {
      this.unmountScreen();
      this.onLeave();
      return;
    }
    if (!canEnter(r, ctx.progress.get(), ctx.flags)) {
      ctx.router.go(resumeRoute(ctx.progress.get()), true);
      return;
    }
    if (this.screen && this.screenState === r.state && this.screen.update?.(r.params)) return;
    const token = ++this.mountToken;
    this.unmountScreen();
    const mod = await SCREENS[r.state]();
    if (token !== this.mountToken) return;
    const screen = mod.default();
    const host = el('section.screen', { dataset: { screen: r.state } });
    ctx.layers.ui.appendChild(host);
    this.screen = screen;
    this.screenState = r.state;
    await screen.mount(host, ctx, r.params);
    // move focus to the new screen (TopBar's title), unless the child is already working inside it
    if (!host.contains(document.activeElement)) {
      (host.querySelector<HTMLElement>('[data-autofocus]') ?? host.querySelector<HTMLElement>('h1, h2'))?.focus({ preventScroll: true });
    }
  }

  private unmountScreen(): void {
    this.ctx.idle.clear();
    this.ctx.narration.stop();
    this.ctx.audio.stopAmbient();
    this.screen?.unmount();
    this.screen = null;
    this.screenState = null;
    this.ctx.layers.ui.replaceChildren();
    // the old screen's i18n bindings would otherwise keep its whole DOM (and the screen) alive
    i18n.prune();
    if (this.hat) this.releaseHat(this.hat);
  }

  /** The hat outlives screens: point its sound hook back at the shell, so a screen's closure can't keep that screen alive. */
  private releaseHat(v: HatViewer): void {
    const sfx = this.ctx.audio.sfx;
    v.sound = (id, o) => sfx.play(id, o);
  }

  get currentState(): FlowState | null {
    return this.screenState;
  }
}

declare global {
  interface Window {
    __nonla?: Record<string, unknown>;
  }
}

function exposeTestHooks(app: App): void {
  window.__nonla = {
    ...(window.__nonla ?? {}),
    state: () => app.currentState,
    go: (hash: string) => (location.hash = hash),
    progress: () => app.ctx.progress.get(),
    narrationLog: () => app.ctx.narration.log,
    sfxLog: () => app.ctx.audio.sfx.log,
    lang: () => i18n.lang,
    showHint: () => app.ctx.idle.showNow(),
  };
}
