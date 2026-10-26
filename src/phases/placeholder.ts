/** Temporary screen used until a phase's real screen lands; keeps the journey runnable end to end. */
import { el } from '../ui/el';
import { i18n } from '../i18n/i18n';
import { TopBar } from '../ui/TopBar';
import type { AppContext, Screen } from '../app/context';

export function placeholderScreen(titleId: string, onNext: (ctx: AppContext, params: Record<string, string>) => void): () => Screen {
  return () => {
    let root: HTMLElement | null = null;
    return {
      mount(host, ctx, params) {
        root = host;
        host.append(
          TopBar(ctx, { titleId }),
          el(
            'div.ph',
            { style: 'position:absolute;inset:110px 24px 140px;border-radius:32px;font-size:1.6rem' },
            el('div', {}, i18n.bind(el('h2'), titleId), el('p', {}, JSON.stringify(params))),
          ),
          el(
            'div',
            { style: 'position:absolute;right:24px;bottom:110px' },
            i18n.bind(
              el('button.btn.btn--cta', { type: 'button', 'data-touch': '', 'data-test': 'next', onclick: () => onNext(ctx, params) }),
              'ui.next',
            ),
          ),
        );
      },
      unmount() {
        root?.replaceChildren();
      },
    };
  };
}
