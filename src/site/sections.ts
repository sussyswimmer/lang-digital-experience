/** The static sections under the scroll story: what's inside, for parents & teachers, credits. */
import { el, svg } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { assetUrl, picture } from '../assets/manifest';
import { ICONS } from '../ui/icons';
import { SITE_ICONS, type SiteIcon } from './siteIcons';
import type { ReadAloud } from './readAloud';

interface PhaseCard {
  titleId: string;
  textId: string;
  altId: string;
  /** a team photo stem, or an illustration under img/art/ */
  photo?: { stem: string; focal?: [number, number] };
  art?: string;
  /** the ink of the card's number stamp (paper.css .stamp--*) */
  stamp: 'thread' | 'forest' | 'mango' | 'dragon';
}

const PHASES: PhaseCard[] = [
  { titleId: 'p1.title', textId: 'site.inside.1', altId: 'site.inside.1.alt', photo: { stem: 'p1-market', focal: [0.5, 0.45] }, stamp: 'thread' },
  { titleId: 'p2.title', textId: 'site.inside.2', altId: 'site.inside.2.alt', photo: { stem: 'p2-16-rims', focal: [0.45, 0.5] }, stamp: 'forest' },
  { titleId: 'p3.title', textId: 'site.inside.3', altId: 'site.inside.3.alt', photo: { stem: 'p3-protection', focal: [0.6, 0.4] }, stamp: 'mango' },
  { titleId: 'hub.title', textId: 'site.inside.4', altId: 'site.inside.4.alt', art: 'hub-build', stamp: 'dragon' },
];

/** a short running stitch under a heading */
const stitch = () => el('span.stitch.stitch--short', { 'aria-hidden': 'true' });

function sectionHead(titleId: string, leadId: string | null, readAloud: ReadAloud | null, idPrefix: string): HTMLElement {
  const head = el('div.site-section__head', {}, i18n.bind(el('h2', { id: `${idPrefix}-title` }), titleId), stitch());
  if (leadId) {
    head.append(el('div.site-section__lead', {}, i18n.bind(el('p'), leadId), readAloud ? readAloud.button(leadId) : null));
  }
  return head;
}

function altSync(img: HTMLImageElement, id: string): void {
  img.alt = i18n.t(id);
  i18n.onChange(() => (img.alt = i18n.t(id)));
}

export function buildInside(readAloud: ReadAloud): HTMLElement {
  const cards = PHASES.map((p, i) => {
    let media: HTMLElement;
    if (p.photo) {
      media = picture({ stem: p.photo.stem, alt: '', focal: p.photo.focal }, { sizes: '(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 300px' });
      altSync(media.querySelector('img')!, p.altId);
    } else {
      const img = el('img', {
        src: assetUrl(`img/art/${p.art}-800.webp`),
        srcset: `${assetUrl(`img/art/${p.art}-800.webp`)} 800w, ${assetUrl(`img/art/${p.art}-1600.webp`)} 1600w`,
        sizes: '(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 300px',
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
      }) as HTMLImageElement;
      altSync(img, p.altId);
      media = img;
    }
    // four sheets of paper taped to the table, each a little askew, the photo pasted on with a hairline edge
    const tilt = i % 2 ? 'sheet--tilt-r' : 'sheet--tilt-l';
    const ink = p.stamp === 'thread' ? '' : `.stamp--${p.stamp}`;
    return el(
      `article.phase-card.sheet.${tilt}.sheet--tape`,
      {},
      el(
        'div.phase-card__media',
        {},
        el('div.phase-card__photo', {}, media),
        el(`span.phase-card__num.stamp${ink}`, { 'aria-hidden': 'true' }, String(i + 1)),
      ),
      el(
        'div.phase-card__body',
        {},
        el('p.phase-card__step', {}, i18n.bind(el('span'), 'site.inside.step', { n: i + 1 })),
        i18n.bind(el('h3'), p.titleId),
        i18n.bind(el('p.phase-card__text'), p.textId),
        readAloud.button(p.textId, 'phase-card__listen'),
      ),
    );
  });
  return el(
    'section.site-section.inside',
    { 'aria-labelledby': 'inside-title' },
    sectionHead('site.inside.title', 'site.inside.lead', readAloud, 'inside'),
    el('div.inside__grid', {}, ...cards),
  );
}

const GOALS = ['site.parents.goal.1', 'site.parents.goal.2', 'site.parents.goal.3', 'site.parents.goal.4'];
const HOW: [SiteIcon | 'speaker', string][] = [
  ['tablet', 'site.parents.how.tablet'],
  ['speaker', 'site.parents.how.sound'],
  ['clock', 'site.parents.how.time'],
  ['family', 'site.parents.how.coplay'],
  ['globe', 'site.parents.how.lang'],
  ['lock', 'site.parents.how.privacy'],
];

export function buildParents(): HTMLElement {
  const goals = el(
    'div.parents__card',
    {},
    el('h3', {}, svg(SITE_ICONS.star), i18n.bind(el('span'), 'site.parents.goals.title')),
    stitch(),
    el('ul.parents__list.parents__list--goals', {}, ...GOALS.map((id) => el('li', {}, svg(SITE_ICONS.check), i18n.bind(el('span'), id)))),
  );
  const how = el(
    'div.parents__card',
    {},
    el('h3', {}, svg(SITE_ICONS.book), i18n.bind(el('span'), 'site.parents.how.title')),
    stitch(),
    el(
      'ul.parents__list',
      {},
      ...HOW.map(([icon, id]) => el('li', {}, svg(icon === 'speaker' ? ICONS.speaker : SITE_ICONS[icon]), i18n.bind(el('span'), id))),
    ),
  );
  // one folded note of green paper, stitched round the edge, with a dog-eared corner
  const note = el(
    'div.parents__note.stitched',
    {},
    sectionHead('site.parents.title', 'site.parents.lead', null, 'parents'),
    el('div.parents__grid', {}, goals, how),
    el('span.parents__fold', { 'aria-hidden': 'true' }),
  );
  return el('section.site-section.parents', { 'aria-labelledby': 'parents-title' }, note);
}

const TEAM: [string, string, string][] = [
  ['T', 'site.credits.tram', 'terracotta'],
  ['M', 'site.credits.meri', 'forest'],
  ['M', 'site.credits.max', 'mango'],
];
const TOOLS: [SiteIcon, string][] = [
  ['cube', 'site.credits.tool.blender'],
  ['sparkle', 'site.credits.tool.effectcraft'],
  ['camera', 'site.credits.tool.photocraft'],
  ['brush', 'site.credits.tool.higgsfield'],
];

export function buildCredits(): HTMLElement {
  const team = el(
    'div.credits__col',
    {},
    el('h3', {}, svg(SITE_ICONS.people), i18n.bind(el('span'), 'site.credits.team')),
    stitch(),
    el(
      'ul.credits__list',
      {},
      ...TEAM.map(([initial, id, tone]) => el('li', {}, el(`span.credits__avatar.stamp.tone-${tone}`, { 'aria-hidden': 'true' }, initial), i18n.bind(el('span'), id))),
    ),
  );
  const tools = el(
    'div.credits__col',
    {},
    el('h3', {}, svg(SITE_ICONS.puzzle), i18n.bind(el('span'), 'site.credits.tools')),
    stitch(),
    el('ul.credits__list', {}, ...TOOLS.map(([icon, id]) => el('li', {}, el('span.credits__badge.stamp.stamp--forest', {}, svg(SITE_ICONS[icon])), i18n.bind(el('span'), id)))),
  );
  const photos = el(
    'div.credits__col',
    {},
    el('h3', {}, svg(SITE_ICONS.camera), i18n.bind(el('span'), 'site.credits.photos')),
    stitch(),
    i18n.bind(el('p'), 'site.credits.photos.note'),
    i18n.bind(el('p.credits__copy'), 'site.credits.photos.market'),
  );
  return el(
    'section.site-section.credits',
    { 'aria-labelledby': 'credits-title' },
    sectionHead('site.credits.title', null, null, 'credits'),
    el('div.credits__grid', {}, team, tools, photos),
  );
}

export function buildFooter(opts: { startButton: HTMLElement; readAloud: ReadAloud; onTop: () => void }): HTMLElement {
  return el(
    'footer.site-footer',
    {},
    el(
      'div.site-footer__cta',
      {},
      el('div.site-footer__ask', {}, i18n.bind(el('p'), 'site.footer.ask'), opts.readAloud.button('site.footer.ask')),
      opts.startButton,
    ),
    el(
      'div.site-footer__row',
      {},
      el('p.site-footer__made', {}, svg(ICONS.hat), i18n.bind(el('span'), 'site.footer.made'), svg(SITE_ICONS.heart, 'site-footer__heart')),
      el('button.btn.btn--ghost.site-footer__top', { type: 'button', 'data-touch': '', onclick: opts.onTop }, svg(SITE_ICONS.arrowUp), i18n.bind(el('span'), 'site.top')),
    ),
  );
}
