import '@fontsource-variable/fraunces/full.css';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/playpen-sans';
import './styles/tokens.css';
import './styles/paper.css';
import './styles/base.css';
import './styles/components.css';

import { Store } from './app/store';
import { KEYS, writeJSON } from './app/persist';
import { loadSettings } from './app/settings';
import type { App } from './app/App';
import type { Settings } from './app/types';
import { AudioEngine } from './audio/AudioEngine';
import { i18n } from './i18n/i18n';
import { motion } from './a11y/motion';
import { mountLanding, type Landing } from './site/Landing';

const settings = new Store<Settings>(loadSettings());
const audio = new AudioEngine();
i18n.setLang(settings.get().lang);
document.documentElement.lang = settings.get().lang;
settings.subscribe((s, prev) => {
  writeJSON(KEYS.settings, s);
  if (s.lang !== prev.lang) i18n.setLang(s.lang);
  if (s.motion !== prev.motion) motion.set(s.motion);
});

let app: App | null = null;
let landing: Landing | null = null;

async function startApp(): Promise<void> {
  await audio.unlock();
  document.body.classList.add('app-mode');
  landing?.pause();
  document.getElementById('site')!.hidden = true;
  document.getElementById('app')!.hidden = false; // showLanding() hid it when the child went back
  if (!app) {
    // route to the experience before the router's first read, so it never mounts the landing route
    if (!location.hash.startsWith('#/play')) history.replaceState(null, '', '#/play');
    const { App } = await import('./app/App');
    app = new App({ audio, settings, onLeave: showLanding });
    app.start();
  } else if (!location.hash.startsWith('#/play')) {
    location.hash = '#/play';
  }
}

function showLanding(): void {
  document.body.classList.remove('app-mode');
  document.getElementById('app')!.hidden = true;
  const site = document.getElementById('site')!;
  site.hidden = false;
  if (!landing) {
    landing = mountLanding(site, { settings, audio, onStart: startApp });
    // first shown after a ?test=1 deep link started the app: the journey is already under way
    if (app) landing.offerContinue();
  } else landing.resume();
}

// Browser Back/Forward (or Android's back gesture) from the landing to a #/play route: the router
// mounts that screen, so the app must be shown again too, or the hidden screen talks over the landing.
window.addEventListener('hashchange', () => {
  if (app && location.hash.startsWith('#/play') && document.getElementById('app')!.hidden) void startApp();
});

// Deep links straight into the experience still need a tap to unlock sound: the landing's
// Start button provides it. With ?test=1 the app starts immediately.
const params = new URLSearchParams(location.search);
if (location.hash.startsWith('#/play') && params.has('test')) {
  void startApp();
} else if (location.hash.startsWith('#/play')) {
  showLanding();
  landing!.offerContinue();
} else {
  showLanding();
}
