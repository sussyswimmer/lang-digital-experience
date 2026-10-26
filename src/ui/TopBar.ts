/** Home · title · replay · EN|VI · sound. Present on every play screen. */
import { el, svg } from './el';
import { ICONS } from './icons';
import { i18n } from '../i18n/i18n';
import { parseHash } from '../app/router';
import type { AppContext } from '../app/context';
import type { Lang } from '../app/types';

// One listener for every toggle on the page. A listener per toggle would hold its buttons, and with
// them the whole unmounted screen (and everything its handlers reach), for the rest of the visit.
i18n.onChange((l) => {
  for (const b of document.querySelectorAll<HTMLElement>('.lang-toggle [data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === l));
});

export function LangToggle(ctx: AppContext): HTMLElement {
  const box = el('div.lang-toggle', { role: 'group', 'aria-label': 'Language / Ngôn ngữ' });
  const make = (lang: Lang, label: string) =>
    el(
      'button',
      {
        type: 'button',
        'data-touch': '',
        'data-lang': lang,
        'aria-pressed': String(i18n.lang === lang),
        onclick: () => {
          ctx.settings.patch({ lang });
          ctx.audio.sfx.play('tap');
        },
      },
      label,
    );
  box.append(make('en', 'EN'), make('vi', 'VI'));
  return box;
}

export function TopBar(ctx: AppContext, opts: { titleId?: string; home?: boolean } = {}): HTMLElement {
  const bar = el('div.topbar');
  if (opts.home !== false) {
    const home = el(
      'button.btn.btn--round.btn--ghost',
      {
        type: 'button',
        'data-touch': '',
        onclick: () => {
          ctx.audio.sfx.play('tap');
          // after the first run Home is the hub; on the hub itself it leaves for the landing page
          // (parents & teachers, credits), whose Continue button comes back
          const here = parseHash(location.hash);
          const onHub = here !== 'resume' && here.state === 'hub';
          ctx.go({ state: ctx.progress.get().firstRunComplete && !onHub ? 'hub' : 'landing', params: {} });
        },
      },
      svg(ICONS.home),
    );
    bar.appendChild(i18n.bindAttr(home, 'aria-label', 'ui.home'));
  }
  // the shell focuses the title after each route change (keyboard and screen-reader users land on the new screen)
  if (opts.titleId) bar.appendChild(i18n.bind(el('div.topbar__title', { tabindex: '-1', 'data-autofocus': '' }), opts.titleId));
  bar.appendChild(el('div.topbar__spacer'));
  const replay = el(
    'button.btn.btn--round.btn--ghost',
    { type: 'button', 'data-touch': '', onclick: () => ctx.narration.replay() },
    svg(ICONS.replay),
  );
  const sound = el('button.btn.btn--round.btn--ghost', { type: 'button', 'data-touch': '' });
  const paintSound = () => {
    sound.replaceChildren(svg(ctx.audio.muted ? ICONS.mute : ICONS.speaker));
    sound.setAttribute('aria-pressed', String(!ctx.audio.muted));
  };
  sound.addEventListener('click', () => {
    ctx.audio.setMuted(!ctx.audio.muted);
    paintSound();
  });
  paintSound();
  bar.append(i18n.bindAttr(replay, 'aria-label', 'ui.replay'), LangToggle(ctx), i18n.bindAttr(sound, 'aria-label', 'ui.sound'));
  return bar;
}
