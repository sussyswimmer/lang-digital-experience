/** Home · title · replay · EN|VI · sound. Present on every play screen. */
import { el, svg } from './el';
import { ICONS } from './icons';
import { i18n } from '../i18n/i18n';
import type { AppContext } from '../app/context';
import type { Lang } from '../app/types';

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
  const en = make('en', 'EN');
  const vi = make('vi', 'VI');
  box.append(en, vi);
  i18n.onChange((l) => {
    en.setAttribute('aria-pressed', String(l === 'en'));
    vi.setAttribute('aria-pressed', String(l === 'vi'));
  });
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
        'aria-label': i18n.t('ui.home'),
        onclick: () => {
          ctx.audio.sfx.play('tap');
          ctx.go({ state: ctx.progress.get().firstRunComplete ? 'hub' : 'landing', params: {} });
        },
      },
      svg(ICONS.home),
    );
    bar.appendChild(home);
  }
  if (opts.titleId) bar.appendChild(i18n.bind(el('div.topbar__title'), opts.titleId));
  bar.appendChild(el('div.topbar__spacer'));
  const replay = el(
    'button.btn.btn--round.btn--ghost',
    { type: 'button', 'data-touch': '', 'aria-label': i18n.t('ui.replay'), onclick: () => ctx.narration.replay() },
    svg(ICONS.replay),
  );
  const sound = el('button.btn.btn--round.btn--ghost', { type: 'button', 'data-touch': '', 'aria-label': i18n.t('ui.sound') });
  const paintSound = () => {
    sound.replaceChildren(svg(ctx.audio.muted ? ICONS.mute : ICONS.speaker));
    sound.setAttribute('aria-pressed', String(!ctx.audio.muted));
  };
  sound.addEventListener('click', () => {
    ctx.audio.setMuted(!ctx.audio.muted);
    paintSound();
  });
  paintSound();
  bar.append(replay, LangToggle(ctx), sound);
  return bar;
}
