/**
 * The website wrapper: hero → scroll-scrubbed Blender/EffectCraft intro → what's inside → for
 * parents & teachers → credits. Every Start button calls onStart, which unlocks audio and enters
 * the experience; pause()/resume() hand the page over to the app and back.
 */
import './site.css';
import { el, svg } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { motion } from '../a11y/motion';
import { ICONS } from '../ui/icons';
import type { Store } from '../app/store';
import type { Settings } from '../app/types';
import type { AudioEngine } from '../audio/AudioEngine';
import { LangToggleStandalone } from './langToggleStandalone';
import { SITE_ICONS } from './siteIcons';
import { ReadAloud } from './readAloud';
import { IdleCue, type Cue } from './idleCue';
import { buildHero } from './hero';
import { Story } from './story';
import { BEATS } from './storyBeats';
import { buildCredits, buildFooter, buildInside, buildParents } from './sections';

export interface Landing {
  pause(): void;
  resume(): void;
  offerContinue(): void;
}

export function mountLanding(host: HTMLElement, opts: { settings: Store<Settings>; audio: AudioEngine; onStart: () => void }): Landing {
  motion.set(opts.settings.get().motion);
  const reduced = motion.reduced;
  const test = new URLSearchParams(location.search).has('test');
  const readAloud = new ReadAloud(opts.audio);

  // every Start button shares one label, so offerContinue() flips them all
  let startId = 'ui.start';
  let entered = false;
  const startLabels: HTMLElement[] = [];
  const start = () => {
    readAloud.stop();
    // The shell starts its router on the current hash before it moves to #/play, so a first Start
    // from #/ would route to the landing first. Pointing the hash at #/play beforehand avoids that.
    if (!entered && !location.hash.startsWith('#/play')) history.replaceState(history.state, '', `${location.pathname}${location.search}#/play`);
    entered = true;
    opts.onStart();
  };
  const startButton = (variant: 'cta' | 'compact', where: string) => {
    const label = i18n.bind(el('span'), startId);
    startLabels.push(label);
    return el(
      `button.btn.site-start.site-start--${variant}`,
      {
        type: 'button',
        'data-touch': '',
        'data-start': where,
        onclick: start,
      },
      el('span.site-start__icon', { 'aria-hidden': 'true' }, svg(SITE_ICONS.play)),
      label,
    );
  };
  const setStartLabel = (id: string) => {
    startId = id;
    for (const l of startLabels) i18n.bind(l, id);
  };

  const story = new Story({ reduced, readAloud, startButton: startButton('cta', 'story') });
  const scrollToStory = () => story.el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const hero = buildHero({ startButton: startButton('cta', 'hero'), readAloud, reduced, onScrollCue: scrollToStory });

  const brand = el(
    'button.site-bar__brand',
    { type: 'button', 'data-touch': '', onclick: () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }) },
    svg(ICONS.hat),
    i18n.bind(el('span'), 'site.title'),
  );
  const bar = el(
    'div.site-bar',
    {},
    brand,
    el('div.site-bar__spacer'),
    startButton('compact', 'bar'),
    LangToggleStandalone(opts.settings),
  );

  const root = el(
    'div.site',
    { dataset: { reduced: String(reduced) } },
    bar,
    el('main', {}, hero.el, story.el, buildInside(readAloud), buildParents(), buildCredits()),
    buildFooter({ startButton: startButton('cta', 'footer'), readAloud, onTop: () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }) }),
  );
  host.replaceChildren(root);
  i18n.onChange(() => readAloud.stop());

  // the bar shows the title and a Start button once the hero has scrolled away
  const heroIo = new IntersectionObserver(([e]) => root.classList.toggle('is-scrolled', !e.isIntersecting), { threshold: 0.15 });
  heroIo.observe(hero.el);

  // the story (GSAP + frames) loads after the hero has painted, or as soon as it comes near
  const kick = () => void story.init();
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(kick, { timeout: 1500 });
  else window.setTimeout(kick, 600);
  const nearIo = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      kick();
      nearIo.disconnect();
    },
    { rootMargin: '150% 0px' },
  );
  nearIo.observe(story.el);

  // 5-second hand hint: swipe up to keep reading the story, or tap Start at its end
  const cue = new IdleCue(
    root,
    (): Cue => {
      const vh = window.innerHeight;
      const heroRect = hero.el.getBoundingClientRect();
      if (heroRect.bottom > vh * 0.6) return { gesture: 'swipe', at: () => hero.scrollCue.getBoundingClientRect() };
      const s = story.el.getBoundingClientRect();
      if (s.top <= 1 && s.bottom >= vh) {
        if (story.beat() === BEATS.length - 1) {
          const btn = story.el.querySelector<HTMLElement>('[data-start="story"]');
          return btn ? { gesture: 'tap', at: () => btn.getBoundingClientRect() } : null;
        }
        // beside the hat, not over it: where a thumb would swipe
        return { gesture: 'swipe', at: () => new DOMRect(window.innerWidth - Math.min(140, window.innerWidth * 0.2), vh * 0.58, 2, 2) };
      }
      return null;
    },
    { delayMs: test ? 500 : 5000, repeatMs: 8000, reduced: () => reduced },
  );
  cue.start();

  if (test) {
    window.__nonla = {
      ...(window.__nonla ?? {}),
      landing: {
        frameIndex: () => story.frameIndex(),
        beat: () => story.beat(),
        progress: () => story.progressValue(),
        mode: () => story.mode,
        readLog: () => readAloud.log,
        showHint: () => cue.showNow(),
      },
    };
  }

  return {
    pause() {
      story.pause();
      cue.stop();
      readAloud.stop();
    },
    resume() {
      entered = true;
      // back from the app: the journey is under way, so Start becomes Continue
      setStartLabel('ui.continue');
      window.scrollTo(0, 0);
      story.resume();
      cue.start();
    },
    offerContinue() {
      setStartLabel('ui.continue');
    },
  };
}

declare global {
  interface Window {
    __nonla?: Record<string, unknown>;
  }
}
