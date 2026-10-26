import { el } from '../ui/el';
import { i18n } from '../i18n/i18n';
import type { Store } from '../app/store';
import type { Lang, Settings } from '../app/types';

/** EN | VI pill for the landing page (before the app context exists). */
export function LangToggleStandalone(settings: Store<Settings>): HTMLElement {
  const box = el('div.lang-toggle', { role: 'group', 'aria-label': 'Language / Ngôn ngữ' });
  const make = (lang: Lang, label: string) =>
    el(
      'button',
      { type: 'button', 'data-touch': '', 'data-lang': lang, 'aria-pressed': String(i18n.lang === lang), onclick: () => settings.patch({ lang }) },
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
