/**
 * Phase 2 · Uncover the Secrets of the Nón Lá. One screen for all four layers (stitches → leaves →
 * frame → strap); moving between layers keeps the same 3D hat, so pieces carry over.
 *
 * Per layer: guided question (narrated, replayable) → the layer's interaction on the 3D hat →
 * the insight sheet (brief's words, chunk by chunk, each chunk can cue the hat) → Next.
 */
import './phase2.css';
import { gsap } from 'gsap';
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { TopBar } from '../../ui/TopBar';
import { i18n } from '../../i18n/i18n';
import { picture } from '../../assets/manifest';
import { LAYERS, type LayerId } from '../../app/types';
import type { AppContext, Screen } from '../../app/context';
import type { Gesture } from '../../a11y/idleHint';
import type { SfxId } from '../../audio/sfx';
import type { HatViewer, LayerController, ScreenRect } from '../../three/HatViewer';
import { speak, speakLine } from '../phase1/speak';
import { InsightPanel } from './InsightPanel';
import { LAYER_ICONS, PANEL_ICONS } from './icons';
import { SCRIPT, isLayer, nextChunk, prevChunk, type LayerScript } from './script';

type Phase = 'loading' | 'question' | 'insight' | 'done';
type StrapColour = 'purple' | 'peach' | 'green';

const HINT_GESTURE: Record<LayerId, Gesture> = { stitches: 'trace', leaves: 'swipe', frame: 'tap', strap: 'tap' };
const COLOURS: StrapColour[] = ['purple', 'peach', 'green'];

export default function Phase2Screen(): Screen {
  let ctx: AppContext;
  let root: HTMLElement;
  let viewer: HatViewer | null = null;
  let ctrl: LayerController | null = null;
  let layer: LayerId = 'stitches';
  let script: LayerScript = SCRIPT.stitches;
  let phase: Phase = 'loading';
  let chunk = -1;
  let token = 0;
  let alive = true;
  let fallbackSaid = false;
  let cycleIds: number[] = [];
  const timers = new Set<number>();
  const offs: (() => void)[] = [];

  // ---- DOM
  const dots = el('nav.p2-dots', { 'aria-label': 'Layers' });
  const questionText = el('span.p2-question__text');
  const showMe = el(
    'button.btn.btn--straw.p2-showme',
    { type: 'button', 'data-touch': '', 'data-test': 'show-me', onclick: () => assist() },
    svg(PANEL_ICONS.hand, 'icon'),
    i18n.bind(el('span'), 'p2.ui.showMe'),
  );
  const question = el(
    'div.bubble.p2-question',
    {},
    el(
      'button.btn.btn--round.btn--ghost.p2-question__say',
      { type: 'button', 'data-touch': '', 'aria-label': i18n.t('ui.replay'), onclick: () => ctx.narration.say(script.question) },
      svg(ICONS.replay),
    ),
    questionText,
    showMe,
  );
  const loading = el('div.p2-loading', { role: 'status' }, el('span.p2-loading__hat', {}, svg(ICONS.hat)), i18n.bind(el('span'), 'p2.ui.loading'));
  const counter = el('div.p2-counter', { 'aria-live': 'polite' }, el('span.p2-counter__n', {}, '0'), i18n.bind(el('span.p2-counter__w'), 'p2.ui.rings'));
  const panel = new InsightPanel({
    onPrev: () => {
      const p = prevChunk(chunk);
      if (p !== null) playChunk(p, true);
    },
    onNext: () => {
      const n = nextChunk(chunk, script.chunks.length);
      if (n !== null) playChunk(n, true);
    },
    onReplay: () => playChunk(Math.max(0, chunk), true),
    onName: () => {
      play('tap');
      ctx.narration.say(script.name);
    },
    onDone: () => done(),
    onPhoto: () => openPhoto(),
  });
  const lightbox = el('div.p2-lightbox', { hidden: true, onclick: () => closePhoto() });

  // ---- helpers

  const later = (ms: number, fn: () => void): number => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const play = (id: SfxId, step?: number) => ctx.audio.sfx.play(id, step === undefined ? {} : { step });

  const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });
  const isWide = () => {
    const { w, h } = viewport();
    return w >= 720 && w > h * 1.05;
  };

  /** the screen area the hat should use right now (between the UI pieces) */
  function frameRect(): ScreenRect {
    const { w, h } = viewport();
    const top = Math.max(question.hidden ? 0 : question.getBoundingClientRect().bottom, dots.getBoundingClientRect().bottom, 80) + 8;
    const bottom = h - (h < 600 ? 96 : 128);
    if (phase === 'insight' || phase === 'done') {
      // the panel's resting place (its layout box, not the slide-in transform)
      const r = root.getBoundingClientRect();
      const left = r.left + panel.el.offsetLeft;
      if (isWide()) return { x: 16, y: Math.min(top, 104), width: Math.max(200, left - 32), height: bottom - Math.min(top, 104) };
      const below = r.top + panel.el.offsetTop + panel.el.offsetHeight + 8;
      return { x: 12, y: below, width: w - 24, height: Math.max(140, bottom - below) };
    }
    return { x: 16, y: top, width: w - 32, height: Math.max(180, bottom - top) };
  }

  function placeHat(duration = 0.7): void {
    viewer?.setFrame(frameRect(), { duration });
  }

  function paintDots(): void {
    const prog = ctx.progress.get().p2.layers;
    const open = ctx.flags.review || ctx.progress.get().firstRunComplete;
    dots.replaceChildren(
      ...LAYERS.map((l, i) => {
        const locked = !open && prog[l] === 'locked';
        const state = l === layer ? 'current' : locked ? 'locked' : prog[l] === 'done' ? 'done' : 'open';
        const b = el(
          'button.p2-dot',
          {
            type: 'button',
            'data-touch': '',
            'data-layer': l,
            'aria-current': l === layer ? 'step' : undefined,
            'aria-label': `${i + 1}. ${i18n.t(SCRIPT[l].name)}`,
            disabled: locked,
            onclick: () => {
              if (l === layer || locked) return;
              play('tap');
              ctx.go({ state: 'p2', params: { layer: l } });
            },
          },
          svg(LAYER_ICONS[l], 'p2-layer-icon'),
          prog[l] === 'done' && l !== layer ? el('span.p2-dot__tick', {}, svg(ICONS.check)) : null,
        );
        b.classList.add(`is-${state}`);
        return b;
      }),
    );
  }

  // ---- layer flow

  function startLayer(next: LayerId): void {
    const my = ++token;
    ctrl?.dispose();
    ctrl = null;
    ctx.idle.clear();
    ctx.narration.stop();
    stopCycle();
    layer = next;
    script = SCRIPT[next];
    chunk = -1;
    phase = 'question';
    root.dataset.layer = next;
    root.dataset.phase = phase;
    paintDots();
    i18n.bind(questionText, script.question);
    question.hidden = false;
    showMe.hidden = false;
    panel.el.classList.remove('is-open');
    panel.setLayer(script, next === 'strap');
    panel.doneBtn.hidden = true;
    counter.classList.remove('is-on');
    counter.querySelector('.p2-counter__n')!.textContent = '0';
    gsap.fromTo(question, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' });
    if (!viewer) return;
    viewer.setInteractive(true);
    placeHat(0.8);
    const c = viewer.layer(next, {
      onEvent: (name, data) => {
        if (my !== token) return;
        if (name === 'say' && typeof data === 'string') ctx.narration.say(data);
        else if (name === 'ring') showCount(Number(data));
      },
    });
    ctrl = c;
    if (next === 'strap') viewer.setStrapColour(ctx.settings.get().strapColour);
    if (viewer.kind === '2d' && !fallbackSaid) {
      // first tell the grown-ups why the hat is a drawing, then ask the question
      fallbackSaid = true;
      void speak(ctx.narration, ['p2.fallback', script.question], () => alive && my === token && phase === 'question');
    } else {
      ctx.narration.say(script.question);
    }
    watchInteraction(c);
    c.run().then(() => {
      if (my === token && alive) interactionDone(my);
    });
  }

  function watchInteraction(c: LayerController): void {
    ctx.idle.watch({
      stepId: `p2.${layer}.interact`,
      gesture: HINT_GESTURE[layer],
      target: () => c.hint?.()?.points[0] ?? null,
      path: () => c.hint?.()?.points ?? [],
      nudge: () => ctx.narration.say(script.question),
    });
  }

  function assist(): void {
    if (phase !== 'question') return;
    play('tap');
    ctrl?.assist?.();
  }

  function showCount(n: number): void {
    counter.classList.add('is-on');
    const num = counter.querySelector('.p2-counter__n')!;
    num.textContent = String(n);
    gsap.fromTo(num, { scale: 1.5 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
  }

  function interactionDone(my: number): void {
    ctx.idle.clear();
    showMe.hidden = true;
    later(700, () => {
      if (my !== token) return;
      phase = 'insight';
      root.dataset.phase = phase;
      question.hidden = true;
      panel.el.classList.add('is-open');
      panel.setChunk(-1, script.chunks.length);
      buildExtras();
      const revisit = ctx.flags.review || ctx.progress.get().p2.layers[layer] === 'done';
      panel.doneBtn.hidden = !revisit;
      // let the sheet lay out, then slide the hat into the free space
      requestAnimationFrame(() => placeHat(0.9));
      watchInsight();
      // the layer's name first (it carries the Vietnamese part name: Chỉ Khâu, Lá Nón…), then the insight
      void speakLine(ctx.narration, script.name, () => alive && my === token && chunk < 0).then((ok) => {
        if (ok && my === token && chunk < 0) playChunk(0, false);
      });
    });
  }

  /** if the sheet goes quiet (a line was cut short), the hand points at More, or at Next on the last chunk */
  function watchInsight(): void {
    ctx.idle.watch({
      stepId: `p2.${layer}.more`,
      gesture: 'tap',
      target: () => (chunk >= script.chunks.length - 1 ? panel.doneBtn : panel.nextBtn).getBoundingClientRect(),
    });
  }

  function playChunk(i: number, manual: boolean): void {
    if (phase !== 'insight' && phase !== 'done') return;
    const my = token;
    chunk = i;
    panel.setChunk(i, script.chunks.length);
    if (manual) play('pageTurn');
    const cue = script.cues[i];
    if (cue === 'colours') cycleColours();
    else if (cue) ctrl?.cue?.(cue);
    const last = i === script.chunks.length - 1;
    if (last) panel.doneBtn.hidden = false;
    if (phase === 'insight') watchInsight();
    // speakLine, not say(): the EN/VI toggle and "hear it again" restart the line, which must not stall the sheet
    void speakLine(ctx.narration, script.chunks[i], () => alive && my === token && chunk === i).then((ok) => {
      if (!ok || my !== token || chunk !== i) return;
      const n = nextChunk(i, script.chunks.length);
      if (n !== null) later(900, () => chunk === i && my === token && playChunk(n, false));
      else insightDone();
    });
  }

  function insightDone(): void {
    phase = 'done';
    root.dataset.phase = phase;
    panel.doneBtn.hidden = false;
    panel.doneBtn.classList.add('pulse');
    ctx.idle.watch({ stepId: `p2.${layer}.next`, gesture: 'tap', target: () => panel.doneBtn.getBoundingClientRect() });
  }

  function done(): void {
    play('tap');
    ctx.idle.clear();
    ctx.narration.stop();
    panel.doneBtn.classList.remove('pulse');
    ctx.completeLayer(layer);
  }

  function buildExtras(): void {
    const box = panel.extras;
    box.replaceChildren();
    if (layer === 'stitches') {
      const chip = (icon: string, id: string, cue: string, tone: string) =>
        el(
          `button.p2-chip.p2-chip--${tone}` as 'button',
          {
            type: 'button',
            'data-touch': '',
            onclick: () => {
              play('tap');
              ctx.narration.say(id);
              ctrl?.cue?.(cue);
            },
          },
          svg(icon, 'p2-chip__icon'),
          i18n.bind(el('span'), id),
        );
      box.append(
        i18n.bind(el('h3.p2-panel__sub'), 'p2.ui.legend'),
        chip(PANEL_ICONS.thread, 'p2.label.whiteThread', 'stitches', 'white'),
        chip(PANEL_ICONS.redThread, 'p2.label.redThread', 'brim', 'red'),
      );
    } else if (layer === 'strap') {
      const current = ctx.settings.get().strapColour;
      const row = el('div.p2-swatches', { role: 'radiogroup' });
      for (const c of COLOURS) {
        const b = el(
          `button.p2-swatch.p2-swatch--${c}` as 'button',
          {
            type: 'button',
            'data-touch': '',
            role: 'radio',
            'data-colour': c,
            'aria-checked': String(c === current),
            onclick: () => pickColour(c, true),
          },
          el('span.p2-swatch__blob', { 'aria-hidden': 'true' }),
          i18n.bind(el('span.p2-swatch__name'), `p2.colour.${c}`),
        );
        row.appendChild(b);
      }
      box.append(i18n.bind(el('h3.p2-panel__sub'), 'p2.ui.strapColours'), row);
    }
  }

  function pickColour(c: StrapColour, byChild: boolean): void {
    if (byChild) {
      stopCycle();
      play('fillPop');
      ctx.settings.patch({ strapColour: c });
      ctx.narration.say(`p2.colour.${c}`);
    }
    viewer?.setStrapColour(c);
    panel.extras.querySelectorAll<HTMLElement>('.p2-swatch').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.colour === c)));
  }

  /** "purple, peach pink, or light green": show each, then back to the child's choice (a tap ends the show) */
  function cycleColours(): void {
    stopCycle();
    COLOURS.forEach((c, i) => cycleIds.push(later(i * 1600 + 600, () => layer === 'strap' && pickColour(c, false))));
    cycleIds.push(later(COLOURS.length * 1600 + 900, () => layer === 'strap' && pickColour(ctx.settings.get().strapColour, false)));
  }

  function stopCycle(): void {
    for (const id of cycleIds) {
      window.clearTimeout(id);
      timers.delete(id);
    }
    cycleIds = [];
  }

  function openPhoto(): void {
    play('tap');
    const big = picture({ stem: script.photo.stem, alt: i18n.t(script.photo.alt) }, { sizes: '92vw', eager: true, className: 'p2-lightbox__img' });
    lightbox.replaceChildren(
      big,
      el('button.btn.btn--round.btn--ghost.p2-lightbox__close', { type: 'button', 'data-touch': '', 'aria-label': i18n.t('p2.ui.close') }, svg(ICONS.close)),
    );
    lightbox.hidden = false;
    gsap.fromTo(lightbox, { opacity: 0 }, { opacity: 1, duration: 0.25 });
  }

  function closePhoto(): void {
    play('tap');
    lightbox.hidden = true;
    lightbox.replaceChildren();
  }

  const onKey = (e: KeyboardEvent) => {
    if (!alive) return;
    const onButton = (e.target as HTMLElement)?.closest?.('button');
    if ((e.key === 'Enter' || e.key === ' ') && !onButton && phase === 'question') {
      e.preventDefault();
      assist();
    } else if (e.key === 'ArrowRight' && phase !== 'question') {
      const n = nextChunk(chunk, script.chunks.length);
      if (n !== null) playChunk(n, true);
    } else if (e.key === 'ArrowLeft' && phase !== 'question') {
      const p = prevChunk(chunk);
      if (p !== null) playChunk(p, true);
    } else if (e.key === 'Escape' && !lightbox.hidden) {
      closePhoto();
    }
  };

  const onResize = () => placeHat(0);

  // IdleHint only resets on pointerdown; a long trace or drag is activity too
  let lastPoke = 0;
  const onPointerMove = (e: PointerEvent) => {
    if (!e.buttons || phase !== 'question' || !ctrl) return;
    const now = performance.now();
    if (now - lastPoke < 250) return;
    lastPoke = now;
    watchInteraction(ctrl);
  };

  function showError(): void {
    loading.replaceChildren(i18n.bind(el('span'), 'p2.loadError'));
    loading.classList.add('is-error');
    ctx.narration.say('p2.loadError');
    const skip = el(
      'button.btn.btn--cta.p2-skip',
      { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => ctx.completeLayer(layer) },
      i18n.bind(el('span'), 'ui.next'),
      svg(ICONS.next),
    );
    root.appendChild(skip);
  }

  return {
    async mount(host, c, params) {
      ctx = c;
      root = host;
      root.classList.add('pass-through', 'p2');
      layer = isLayer(params.layer) ? params.layer : 'stitches';
      script = SCRIPT[layer];
      const bar = TopBar(ctx, { titleId: 'p2.title' });
      bar.insertBefore(dots, bar.querySelector('.topbar__spacer'));
      paintDots();
      i18n.bind(questionText, script.question);
      root.append(bar, question, counter, panel.el, loading, lightbox);
      question.hidden = true;
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      offs.push(
        () => window.removeEventListener('keydown', onKey),
        () => window.removeEventListener('resize', onResize),
        () => window.removeEventListener('pointermove', onPointerMove),
      );

      let v: HatViewer;
      try {
        v = await ctx.viewer();
        if (!alive) return;
        v.sound = (id, o) => ctx.audio.sfx.play(id, o);
        await v.ready;
      } catch (err) {
        console.error('[p2] hat viewer failed', err);
        if (alive) showError();
        return;
      }
      if (!alive) return;
      viewer = v;
      loading.remove();
      if (ctx.flags.test) {
        const d = v.debug();
        window.__nonla = {
          ...(window.__nonla ?? {}),
          p2: {
            ...d,
            layer: () => layer,
            phase: () => phase,
            chunk: () => chunk,
            finish: () => ctrl?.finish(),
            hint: () => ctrl?.hint?.() ?? null,
          },
        };
      }
      v.show({ fade: 0.4 });
      startLayer(layer);
    },

    update(params) {
      if (!isLayer(params.layer)) return false;
      if (params.layer === layer && phase !== 'done') return true;
      if (!viewer) {
        layer = params.layer;
        return true;
      }
      startLayer(params.layer);
      return true;
    },

    unmount() {
      alive = false;
      token++;
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
      offs.forEach((off) => off());
      ctrl?.dispose();
      ctrl = null;
      panel.dispose();
      gsap.killTweensOf([question, counter, lightbox, panel.doneBtn]);
      if (viewer) {
        viewer.setInteractive(false);
        viewer.setFrame(null, { duration: 0.5 });
        viewer.hide({ fade: 0.35 });
      }
      if (ctx?.flags.test && window.__nonla) delete window.__nonla.p2;
      root?.replaceChildren();
    },
  };
}
