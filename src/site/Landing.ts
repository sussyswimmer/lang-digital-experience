/**
 * The website wrapper: hero + scroll-scrubbed Blender/EffectCraft intro + phase overview + parents
 * + credits. "Start" unlocks audio and enters the experience.
 * (First version: hero + Start; the scroll intro is built in ./ScrollIntro.ts.)
 */
import { el } from '../ui/el';
import { i18n } from '../i18n/i18n';
import type { Store } from '../app/store';
import type { Settings } from '../app/types';
import type { AudioEngine } from '../audio/AudioEngine';
import { LangToggleStandalone } from './langToggleStandalone';

export interface Landing {
  pause(): void;
  resume(): void;
  offerContinue(): void;
}

export function mountLanding(host: HTMLElement, opts: { settings: Store<Settings>; audio: AudioEngine; onStart: () => void }): Landing {
  const start = el('button.btn.btn--cta.pulse', { type: 'button', 'data-touch': '', onclick: () => opts.onStart() });
  i18n.bind(start, 'ui.start');
  const hero = el(
    'header.landing-hero',
    { style: 'min-height:100dvh;display:grid;place-items:center;text-align:center;padding:24px' },
    el(
      'div',
      {},
      i18n.bind(el('h1', { style: 'font-size:clamp(2.6rem,7vw,5rem);color:var(--forest-700)' }), 'site.title'),
      i18n.bind(el('p', { style: 'font-size:1.3rem;max-width:36ch;margin:0 auto 32px' }), 'site.tagline'),
      start,
      el('div', { style: 'margin-top:28px;display:flex;justify-content:center' }, LangToggleStandalone(opts.settings)),
    ),
  );
  host.replaceChildren(hero);
  return {
    pause() {},
    resume() {},
    offerContinue() {
      i18n.bind(start, 'ui.continue');
    },
  };
}
