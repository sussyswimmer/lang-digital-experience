/**
 * Hero: the title set large straight on the paper, with the kicker on a luggage tag and the three
 * facts on tags pinned under the Start button; beside it, overlapping the title block, a window
 * whose forest-green shutters swing open onto the team's photo of hats against a blue sky
 * (diverse-4, eager AVIF), resting on a plain wooden sill. Nothing on the sill: the hats are the subject.
 */
import { el, svg } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { picture } from '../assets/manifest';
import { ICONS } from '../ui/icons';
import { SITE_ICONS } from './siteIcons';
import type { ReadAloud } from './readAloud';

/* a hand-drawn arrow: one wobbly stroke of red thread pointing down */
const ARROW = `<svg viewBox="0 0 36 60" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 4c-4.5 11 4.5 21-1 33-2 4.5 1.5 10 .5 17"/><path d="M8 43.5c3.5 4 7 8 10 12.5 3-5 7-9.5 11-13.5"/></svg>`;

/** the entrance: each piece settles onto the table in turn (paper.css .settle) */
function settle<T extends HTMLElement>(node: T, order: number): T {
  node.classList.add('settle');
  node.style.setProperty('--settle-i', String(order));
  return node;
}

export interface HeroParts {
  el: HTMLElement;
  scrollCue: HTMLElement;
}

export function buildHero(opts: { startButton: HTMLElement; readAloud: ReadAloud; reduced: boolean; onScrollCue: () => void }): HeroParts {
  const photo = picture(
    { stem: 'diverse-4', widths: [640, 1280, 1920, 2560], alt: i18n.t('site.hero.alt'), focal: [0.42, 0.5] },
    { eager: true, sizes: '(max-width: 760px) 100vw, 45vw', className: 'hero__photo' },
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
    el('div.hero__sill', { 'aria-hidden': 'true' }),
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

  const chip = (icon: string, id: string) => el('li.hero__chip.tag', {}, svg(icon), i18n.bind(el('span'), id));
  const scrollCue = el(
    'button.hero__scroll',
    { type: 'button', 'data-touch': '', onclick: opts.onScrollCue },
    i18n.bind(el('span.hero__scroll-label'), 'site.hero.scroll'),
    svg(ARROW, 'hero__scroll-arrow'),
  );

  // on a phone the copy block dissolves (display: contents) so the window can sit between the tagline and Start
  const copy = el(
    'div.hero__copy',
    {},
    settle(el('p.hero__kicker.tag', {}, svg(SITE_ICONS.family), i18n.bind(el('span'), 'site.kicker')), 0),
    settle(
      el('h1.hero__title', { tabindex: '-1' }, i18n.bind(el('span'), 'site.title'), el('span.stitch.stitch--sew.hero__stitch', { 'aria-hidden': 'true' })),
      1,
    ),
    settle(el('div.hero__tagline', {}, i18n.bind(el('p'), 'site.tagline'), opts.readAloud.button('site.tagline')), 2),
    settle(el('div.hero__actions', {}, opts.startButton), 4),
    settle(el('ul.hero__chips', {}, chip(ICONS.speaker, 'site.chip.sound'), chip(SITE_ICONS.clock, 'site.chip.time'), chip(SITE_ICONS.tablet, 'site.chip.tablet')), 5),
  );
  settle(windowBox, 3);

  const hero = el('header.hero', {}, el('div.hero__inner', {}, copy, windowBox), scrollCue);
  return { el: hero, scrollCue };
}
