/**
 * Phase 2 · Uncover the Secrets of the Nón Lá. One screen for all four layers (stitches → leaves →
 * frame → strap); moving between layers keeps the same 3D hat, so pieces carry over.
 *
 * One thing at a time, always skippable. Each layer is four simple steps:
 *   1. Listen: only the question and the hat are on screen while the narrator asks.
 *   2. Tap: the child touches the hat. "Show me" is pinned on the hat itself, beside the spot to
 *      touch, with a gently pulsing ring on that spot (a button in a corner teaches button-tapping).
 *   3. Watch and listen: the hat moves while the narrator explains; no side panel, nothing to
 *      scroll, the caption shows one sentence at a time (each chunk can cue the hat).
 *   4. The card: once the narrator has finished, the card slides in with the layer's name, the
 *      photo and "Next layer".
 * "Skip ›" stays in the same corner through steps 1–3: it stops the voice and goes straight to the
 * next layer (on the card, "Next layer" does the same job in the same place).
 */
import './phase2.css';
import { gsap } from 'gsap';
import { el, svg } from '../../ui/el';
import { ICONS } from '../../ui/icons';
import { TopBar } from '../../ui/TopBar';
import { i18n } from '../../i18n/i18n';
import { picture } from '../../assets/manifest';
import { motion } from '../../a11y/motion';
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
/** the layering order a hat maker follows (layer 2's "watch" step plays it) */
const STEPS = ['p2.step.inner', 'p2.step.painting', 'p2.step.outer', 'p2.step.coat'];
/** if the question's voice never ends (muted, blocked), "Show me" still comes */
const PIN_FALLBACK_MS = 6000;

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
  let pinRaf = 0;
  const timers = new Set<number>();
  const offs: (() => void)[] = [];

  // ---- DOM
  const dots = el('nav.p2-dots', { 'aria-label': 'Layers' });
  const questionText = el('span.p2-question__text');
  const question = el(
    'div.bubble.p2-question',
    {},
    i18n.bindAttr(
      el('button.btn.btn--round.btn--ghost.p2-question__say', { type: 'button', 'data-touch': '', onclick: () => ctx.narration.say(script.question) }, svg(ICONS.replay)),
      'aria-label',
      'ui.replay',
    ),
    questionText,
  );
  // "Show me", pinned on the hat: a pulsing ring on the spot to touch and a straw tag beside it
  const showMe = el(
    'button.btn.btn--straw.p2-showme',
    { type: 'button', 'data-touch': '', 'data-test': 'show-me', onclick: () => assist() },
    svg(PANEL_ICONS.hand, 'icon'),
    i18n.bind(el('span'), 'p2.ui.showMe'),
  );
  const pin = el('div.p2-pin', { hidden: true }, el('span.p2-pin__ring', { 'aria-hidden': 'true' }), el('span.p2-pin__thread', { 'aria-hidden': 'true' }), showMe);
  const skip = el(
    'button.btn.btn--ghost.p2-skipper',
    { type: 'button', 'data-touch': '', 'data-test': 'skip', onclick: () => skipLayer() },
    i18n.bind(el('span'), 'p2.ui.skip'),
    svg(ICONS.next),
  );
  const steps = el(
    'ol.p2-steps',
    { hidden: true, 'aria-live': 'polite' },
    ...STEPS.map((id, i) => el('li.p2-step', {}, el('span.p2-step__n.stamp', {}, String(i + 1)), i18n.bind(el('span.p2-step__w'), id))),
  );
  const loading = el('div.p2-loading', { role: 'status' }, el('span.p2-loading__hat', {}, svg(ICONS.hat)), i18n.bind(el('span'), 'p2.ui.loading'));
  // one red ink stamp at the end of layer 3: "16 rings"
  const counter = el('div.p2-counter.stamp', { 'aria-live': 'polite' }, el('span.p2-counter__n', {}, '16'), i18n.bind(el('span.p2-counter__w'), 'p2.ui.rings'));
  const panel = new InsightPanel({
    onReplay: () => watchAgain(),
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

  function setPhase(p: Phase): void {
    phase = p;
    root.dataset.phase = p;
    // Skip lives in the same corner through listen, tap and watch; on the card "Next layer" takes over
    skip.hidden = p === 'done' || p === 'loading';
  }

  /** the screen area the hat should use right now (between the UI pieces) */
  function frameRect(): ScreenRect {
    const { w, h } = viewport();
    const tops = [dots.getBoundingClientRect().bottom, 80];
    if (!question.hidden) tops.push(question.getBoundingClientRect().bottom);
    if (!steps.hidden) tops.push(steps.getBoundingClientRect().bottom);
    if (counter.classList.contains('is-on')) tops.push(counter.getBoundingClientRect().bottom - 18);
    const top = Math.max(...tops) + 8;
    const bottom = h - (h < 600 ? 96 : 128);
    if (phase === 'done') {
      // the card's resting place (its layout box, not the slide-in transform)
      const r = root.getBoundingClientRect();
      const left = r.left + panel.el.offsetLeft;
      if (isWide()) return { x: 16, y: Math.min(top, 104), width: Math.max(200, left - 32), height: bottom - Math.min(top, 104) };
      const below = r.top + panel.el.offsetTop + panel.el.offsetHeight + 8;
      return { x: 12, y: below, width: w - 24, height: Math.max(140, bottom - below) };
    }
    // while the narrator explains, the hat stays a little narrower so its labels fit beside it
    const side = phase === 'insight' && isWide() ? Math.min(250, w * 0.18) : 16;
    return { x: side, y: top, width: w - side * 2, height: Math.max(180, bottom - top) };
  }

  function placeHat(duration = 0.7): void {
    viewer?.setFrame(frameRect(), { duration });
    viewer?.setLabelArea?.(labelArea(), skip.hidden ? [] : [skip.getBoundingClientRect()]);
  }

  /** with the card open, the hat's labels stay in the hat's own space, never under the card */
  function labelArea(): ScreenRect | null {
    if (phase !== 'done') return null;
    const { w, h } = viewport();
    const r = root.getBoundingClientRect();
    if (isWide()) return { x: 0, y: 0, width: r.left + panel.el.offsetLeft - 8, height: h };
    const below = r.top + panel.el.offsetTop + panel.el.offsetHeight + 8;
    return { x: 0, y: below, width: w, height: h - below };
  }

  /** four paper tags on one red thread: the current one outlined in thread, done ones stamped */
  function paintDots(): void {
    const prog = ctx.progress.get().p2.layers;
    const open = ctx.flags.review || ctx.progress.get().firstRunComplete;
    dots.replaceChildren(
      el('span.stitch.p2-dots__thread', { 'aria-hidden': 'true' }),
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
          prog[l] === 'done' && l !== layer ? el('span.stamp.p2-dot__tick', {}, svg(ICONS.check)) : null,
        );
        b.classList.add(`is-${state}`);
        if (state === 'current') b.classList.add('stitched', 'stitched--thread');
        return b;
      }),
    );
  }

  /** the question, with "nón lá" kept together on one line (no lone word, no split name) */
  function setQuestion(): void {
    questionText.textContent = i18n.t(script.question).replace(/(nón) (lá|bài thơ)/gi, '$1\u00a0$2');
  }

  // ---- step 1 · listen, step 2 · tap

  function startLayer(next: LayerId): void {
    const my = ++token;
    ctrl?.dispose();
    ctrl = null;
    ctx.idle.clear();
    ctx.narration.stop();
    stopCycle();
    hidePin();
    layer = next;
    script = SCRIPT[next];
    chunk = -1;
    setPhase('question');
    root.dataset.layer = next;
    paintDots();
    setQuestion();
    question.hidden = false;
    panel.el.classList.remove('is-open');
    panel.setLayer(script, next === 'strap');
    panel.doneBtn.classList.remove('pulse');
    counter.classList.remove('is-on');
    showSteps(-1);
    gsap.fromTo(question, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' });
    if (!viewer) return;
    viewer.setInteractive(true);
    placeHat(0.8);
    const c = viewer.layer(next, {
      onEvent: (name, data) => {
        if (my !== token) return;
        if (name === 'say' && typeof data === 'string') ctx.narration.interject(data);
        else if (name === 'ring') showCount(Number(data));
        else if (name === 'step') showSteps(Number(data));
        else if (name === 'whoosh') {
          // the child's part is done: watch the leaves go, nothing else on screen
          question.hidden = true;
          hidePin();
          ctx.idle.clear();
        }
      },
    });
    ctrl = c;
    if (next === 'strap') viewer.setStrapColour(ctx.settings.get().strapColour);
    // listen first: "Show me" comes once the question has been asked
    const ask = () => speakLine(ctx.narration, script.question, () => alive && my === token && phase === 'question');
    let asked: Promise<unknown>;
    if (viewer.kind === '2d' && !fallbackSaid) {
      // first tell the grown-ups why the hat is a drawing, then ask the question
      fallbackSaid = true;
      asked = speak(ctx.narration, ['p2.fallback', script.question], () => alive && my === token && phase === 'question');
    } else {
      asked = ask();
    }
    const showTap = () => my === token && phase === 'question' && showPin();
    void asked.then(showTap);
    later(PIN_FALLBACK_MS, showTap);
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

  /** the tag follows its spot as the hat turns; it hides while there is nothing to touch */
  function showPin(): void {
    if (!pin.hidden || phase !== 'question') return;
    pin.hidden = false;
    pin.classList.remove('is-on');
    const follow = () => {
      if (!alive || pin.hidden) return;
      const h = ctrl?.hint?.() ?? null;
      const p = h?.points[0];
      if (p && phase === 'question') {
        const { w } = viewport();
        // the tag sits on the outer side of the spot, so the spot itself stays free to touch, unless
        // that side would run off the screen
        const reach = showMe.offsetWidth + (w < 600 ? 44 : 52) + 8;
        let left = p.x < w / 2;
        if (left && p.x - reach < 0) left = false;
        else if (!left && p.x + reach > w) left = true;
        pin.classList.toggle('p2-pin--left', left);
        pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        pin.classList.add('is-on');
      } else {
        pin.classList.remove('is-on');
      }
      pinRaf = requestAnimationFrame(follow);
    };
    cancelAnimationFrame(pinRaf);
    pinRaf = requestAnimationFrame(follow);
  }

  function hidePin(): void {
    cancelAnimationFrame(pinRaf);
    pin.hidden = true;
    pin.classList.remove('is-on');
  }

  function assist(): void {
    if (phase !== 'question') return;
    play('tap');
    ctrl?.assist?.();
  }

  /** layer 3 ends with one stamp, never a count: "16 rings" */
  function showCount(n: number): void {
    if (n < 16 || counter.classList.contains('is-on')) return;
    question.hidden = true;
    counter.querySelector('.p2-counter__n')!.textContent = String(n);
    counter.classList.add('is-on');
    play('snap');
    if (!motion.reduced) gsap.fromTo(counter, { scale: 1.6, rotate: -14 }, { scale: 1, rotate: -6, duration: 0.45, ease: 'back.out(2.2)' });
    requestAnimationFrame(() => placeHat(0.8));
  }

  /** layer 2's layering order: which step is playing (-1 hides the row) */
  function showSteps(i: number): void {
    steps.hidden = i < 0;
    steps.querySelectorAll('.p2-step').forEach((s, k) => {
      s.classList.toggle('is-on', k === i);
      s.classList.toggle('is-done', k < i);
      if (k === i) s.setAttribute('aria-current', 'step');
      else s.removeAttribute('aria-current');
    });
    requestAnimationFrame(() => phase !== 'done' && placeHat(0.6));
  }

  // ---- step 3 · watch and listen

  function interactionDone(my: number): void {
    ctx.idle.clear();
    hidePin();
    later(700, () => {
      if (my !== token) return;
      startWatch(my);
    });
  }

  function startWatch(my: number): void {
    setPhase('insight');
    question.hidden = true;
    panel.el.classList.remove('is-open');
    chunk = -1;
    requestAnimationFrame(() => placeHat(0.9));
    watchSkip();
    // the layer's name first (it carries the Vietnamese part name: Chỉ Khâu, Lá Nón…), then the explanation
    void speakLine(ctx.narration, script.name, () => alive && my === token && phase === 'insight' && chunk < 0).then(() => {
      if (my === token && phase === 'insight' && chunk < 0) later(300, () => my === token && phase === 'insight' && chunk < 0 && playChunk(0));
    });
  }

  /** while the narrator explains, the hand (if the child goes idle) points at Skip, never at a panel */
  function watchSkip(): void {
    ctx.idle.watch({ stepId: `p2.${layer}.skip`, gesture: 'tap', target: () => skip.getBoundingClientRect(), delayMs: 20000 });
  }

  function playChunk(i: number): void {
    if (phase !== 'insight') return;
    const my = token;
    chunk = i;
    const cue = script.cues[i];
    if (cue === 'colours') cycleColours();
    else if (cue) ctrl?.cue?.(cue);
    // speakLine, not say(): the EN/VI toggle and "hear it again" restart the line, which must not stall the step
    void speakLine(ctx.narration, script.chunks[i], () => alive && my === token && chunk === i && phase === 'insight').then((ok) => {
      if (my !== token || chunk !== i || phase !== 'insight') return;
      const n = nextChunk(i, script.chunks.length);
      // a line that was cut short (sound off, blocked audio) still moves on, a little later
      later(ok ? 600 : 1500, () => {
        if (chunk !== i || my !== token || phase !== 'insight') return;
        if (n !== null) playChunk(n);
        else showCard();
      });
    });
  }

  // ---- step 4 · the card

  function showCard(): void {
    setPhase('done');
    showSteps(-1);
    panel.el.classList.add('is-open');
    buildExtras();
    // an endless breathing loop: off under reduced motion and in automated tests (like the hat's decor)
    if (!motion.reduced && !ctx.flags.test) panel.doneBtn.classList.add('pulse');
    // let the card lay out, then slide the hat into the free space
    requestAnimationFrame(() => placeHat(0.9));
    ctx.idle.watch({ stepId: `p2.${layer}.next`, gesture: 'tap', target: () => panel.doneBtn.getBoundingClientRect() });
  }

  function watchAgain(): void {
    play('tap');
    stopCycle();
    panel.doneBtn.classList.remove('pulse');
    ctx.narration.stop();
    const my = token;
    setPhase('insight');
    panel.el.classList.remove('is-open');
    chunk = -1;
    requestAnimationFrame(() => placeHat(0.9));
    watchSkip();
    later(500, () => my === token && phase === 'insight' && playChunk(0));
  }

  function done(): void {
    play('tap');
    ctx.idle.clear();
    ctx.narration.stop();
    panel.doneBtn.classList.remove('pulse');
    ctx.completeLayer(layer);
  }

  /** "Skip ›": stop talking and go straight to the next layer, whatever step this is */
  function skipLayer(): void {
    if (phase === 'loading') return;
    play('tap');
    ctx.idle.clear();
    ctx.narration.stop();
    stopCycle();
    hidePin();
    ctx.completeLayer(layer);
  }

  function buildExtras(): void {
    const box = panel.extras;
    box.replaceChildren();
    if (layer !== 'strap') return;
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

  function pickColour(c: StrapColour, byChild: boolean): void {
    if (byChild) {
      stopCycle();
      play('fillPop');
      ctx.settings.patch({ strapColour: c });
      ctx.narration.interject(`p2.colour.${c}`);
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
      i18n.bindAttr(el('button.btn.btn--round.btn--ghost.p2-lightbox__close', { type: 'button', 'data-touch': '' }, svg(ICONS.close)), 'aria-label', 'p2.ui.close'),
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
    } else if (e.key === 'ArrowRight' && phase === 'insight') {
      const n = nextChunk(chunk, script.chunks.length);
      if (n !== null) playChunk(n);
    } else if (e.key === 'ArrowLeft' && phase === 'insight') {
      const p = prevChunk(chunk);
      if (p !== null) playChunk(p);
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
    skip.hidden = true;
    const next = el(
      'button.btn.btn--cta.p2-skip',
      { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => ctx.completeLayer(layer) },
      i18n.bind(el('span'), 'ui.next'),
      svg(ICONS.next),
    );
    root.appendChild(next);
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
      setQuestion();
      offs.push(i18n.onChange(() => setQuestion()));
      root.append(bar, question, steps, counter, pin, panel.el, skip, loading, lightbox);
      question.hidden = true;
      setPhase('loading');
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
      cancelAnimationFrame(pinRaf);
      offs.forEach((off) => off());
      ctrl?.dispose();
      ctrl = null;
      panel.dispose();
      gsap.killTweensOf([question, counter, lightbox, panel.doneBtn]);
      if (viewer) {
        viewer.setInteractive(false);
        viewer.setLabelArea?.(null);
        viewer.setFrame(null, { duration: 0.5 });
        viewer.hide({ fade: 0.35 });
      }
      if (ctx?.flags.test && window.__nonla) delete window.__nonla.p2;
      root?.replaceChildren();
    },
  };
}
