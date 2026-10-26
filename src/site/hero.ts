/**
 * Hero: the title on a cream panel beside a window whose forest-green shutters swing open onto the
 * team's photo of hats against a blue sky (diverse-4, eager AVIF). Fruit from the market on the sill.
 */
import { el, svg } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { picture } from '../assets/manifest';
import { ICONS } from '../ui/icons';
import { SITE_ICONS } from './siteIcons';
import type { ReadAloud } from './readAloud';

const DRAGON_FRUIT = `<svg viewBox="0 0 120 100"><g stroke="#7a1240" stroke-width="2.5" stroke-linejoin="round">
<path d="M18 62c0-24 20-40 44-40s42 16 42 38-20 34-44 34S18 84 18 62z" fill="#d6246e"/>
<path d="M30 46c-8-6-16-6-22-4 6 4 10 8 12 14z" fill="#8cc152"/><path d="M52 30c-4-8-10-12-18-14 3 7 4 12 3 18z" fill="#8cc152"/>
<path d="M80 30c4-8 10-12 18-14-3 7-4 12-3 18z" fill="#8cc152"/><path d="M98 52c8-5 15-5 20-2-6 3-9 7-11 13z" fill="#8cc152"/>
<path d="M44 66c-6-4-12-4-17-2 4 3 7 7 8 11z" fill="#a5d36b"/><path d="M76 70c5-5 11-6 17-4-5 2-8 6-9 11z" fill="#a5d36b"/>
<path d="M60 52c-2-7-6-11-12-13 2 5 2 9 1 14z" fill="#a5d36b"/></g>
<ellipse cx="50" cy="48" rx="12" ry="6" fill="#fff" opacity=".25"/></svg>`;

const MANGO = `<svg viewBox="0 0 110 90"><path d="M14 54C10 30 34 12 62 16c26 4 40 22 34 42-6 22-32 30-54 24C26 78 16 68 14 54z" fill="#f6a623" stroke="#b86a10" stroke-width="2.5"/>
<path d="M62 16c18 2 32 12 34 30-10-12-22-18-36-18z" fill="#f9c74f" opacity=".8"/>
<path d="M60 17c2-6 6-10 12-12" fill="none" stroke="#5a3f28" stroke-width="3" stroke-linecap="round"/>
<path d="M71 6c10-4 22-2 28 6-10 4-20 3-28-6z" fill="#5f9e3f" stroke="#2f5d46" stroke-width="2"/>
<ellipse cx="38" cy="38" rx="12" ry="7" fill="#fff" opacity=".28" transform="rotate(-20 38 38)"/></svg>`;

const SWOOSH = `<svg viewBox="0 0 300 24" preserveAspectRatio="none"><path d="M4 16C80 4 200 2 296 12" fill="none" stroke="#E0A93B" stroke-width="7" stroke-linecap="round"/></svg>`;

function fruit(markup: string, kind: string): SVGSVGElement {
  const s = svg(markup, 'hero__fruit');
  s.classList.add(`hero__fruit--${kind}`);
  return s;
}

export interface HeroParts {
  el: HTMLElement;
  scrollCue: HTMLElement;
}

export function buildHero(opts: { startButton: HTMLElement; readAloud: ReadAloud; reduced: boolean; onScrollCue: () => void }): HeroParts {
  const photo = picture(
    { stem: 'diverse-4', widths: [640, 1280, 1920, 2560], alt: i18n.t('site.hero.alt'), focal: [0.42, 0.5] },
    { eager: true, sizes: '(max-width: 760px) 100vw, 55vw', className: 'hero__photo' },
  );
  const img = photo.querySelector('img')!;
  img.setAttribute('fetchpriority', 'high');
  i18n.onChange(() => (img.alt = i18n.t('site.hero.alt')));

  const shutter = (side: 'l' | 'r') =>
    el(`div.hero__shutter.hero__shutter--${side}`, { 'aria-hidden': 'true' }, el('span.hero__louvers'), el('span.hero__knob'));
  const frame = el('div.hero__frame', {}, photo, shutter('l'), shutter('r'));
  const windowBox = el(
    'div.hero__window',
    {},
    frame,
    el(
      'div.hero__sill',
      { 'aria-hidden': 'true' },
      fruit(DRAGON_FRUIT, 'dragon'),
      fruit(MANGO, 'mango'),
    ),
  );
  // open the shutters once the photo is ready (or soon anyway); under reduced motion they start open
  const open = () => frame.classList.add('is-open');
  if (opts.reduced) open();
  else {
    const t = window.setTimeout(open, 1400);
    img
      .decode()
      .catch(() => {})
      .then(() => requestAnimationFrame(() => (window.clearTimeout(t), open())));
  }

  const chip = (icon: string, id: string) => el('li.hero__chip', {}, svg(icon), i18n.bind(el('span'), id));
  const scrollCue = el(
    'button.hero__scroll',
    { type: 'button', 'data-touch': '', onclick: opts.onScrollCue },
    i18n.bind(el('span'), 'site.hero.scroll'),
    el('span.hero__scroll-arrow', { 'aria-hidden': 'true' }, svg(SITE_ICONS.chevronDown)),
  );

  const panel = el(
    'div.hero__panel',
    {},
    el('p.hero__kicker', {}, svg(SITE_ICONS.family), i18n.bind(el('span'), 'site.kicker')),
    el('h1.hero__title', { tabindex: '-1' }, i18n.bind(el('span'), 'site.title'), svg(SWOOSH, 'hero__swoosh')),
    el('div.hero__tagline', {}, i18n.bind(el('p'), 'site.tagline'), opts.readAloud.button('site.tagline')),
    el('div.hero__actions', {}, opts.startButton),
    el('ul.hero__chips', {}, chip(ICONS.speaker, 'site.chip.sound'), chip(SITE_ICONS.clock, 'site.chip.time'), chip(SITE_ICONS.tablet, 'site.chip.tablet')),
  );

  const hero = el('header.hero', {}, el('div.hero__inner', {}, panel, windowBox), scrollCue);
  return { el: hero, scrollCue };
}
