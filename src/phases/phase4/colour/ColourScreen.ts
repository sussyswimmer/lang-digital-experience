/**
 * Phase 4b, "Colour Your Nón Lá" (the colouring studio). #/play/colour shows the four pages;
 * #/play/colour/:page opens one in the studio. Switching between them goes through update(), so
 * the studio keeps its page, history and draft while the child looks at the picker.
 * Finished pictures go to "Tranh của con" (#/play/gallery).
 */
import './colour.css';
import { el, svg } from '../../../ui/el';
import { i18n } from '../../../i18n/i18n';
import { TopBar } from '../../../ui/TopBar';
import type { AppContext, Screen } from '../../../app/context';
import { Picker } from './Picker';
import { Studio } from './Studio';
import { pageById, type ColourPage } from './pages';
import { COLOUR_ICONS } from './icons';
import { getGallery } from '../gallery/galleryDb';

class ColourScreen implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private picker!: Picker;
  private studio!: Studio;
  private pagesBtn!: HTMLButtonElement;
  private galleryBtn!: HTMLButtonElement;
  private galleryCount!: HTMLSpanElement;
  private shownOnce = false;

  mount(root: HTMLElement, ctx: AppContext, params: Record<string, string>): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('colour-screen');
    const alive = () => this.alive;
    this.picker = new Picker({
      ctx,
      alive,
      onPick: (page) => this.go(page),
      onGallery: () => this.openGallery(),
      settled: () => this.studio.settled(),
    });
    this.studio = new Studio({
      ctx,
      alive,
      galleryButton: () => this.galleryBtn,
      onSaved: (n) => this.setCount(n),
      onPages: () => this.go(null),
    });
    root.append(this.topBar(), this.picker.el, this.studio.el);
    this.show(params.page);
    void getGallery().then((s) => {
      if (!this.alive) return;
      void s.count().then((n) => this.setCount(n));
    });
    if (ctx.flags.test && window.__nonla) {
      window.__nonla.colour = this.studio.testHooks();
    }
  }

  update(params: Record<string, string>): boolean {
    this.show(params.page);
    return true;
  }

  unmount(): void {
    this.alive = false;
    this.studio.dispose();
    this.picker.dispose();
    if (this.ctx.flags.test && window.__nonla) delete window.__nonla.colour;
    this.root.replaceChildren();
  }

  /** the shared top bar plus "Pictures" (back to the picker) and "Tranh của con" */
  private topBar(): HTMLElement {
    const bar = TopBar(this.ctx, { titleId: 'colour.title' });
    this.pagesBtn = el(
      'button.btn.btn--ghost.cs-nav',
      { type: 'button', 'data-touch': '', 'data-test': 'pages', onclick: () => this.go(null) },
      svg(COLOUR_ICONS.pages),
      i18n.bind(el('span.cs-nav__label'), 'colour.pages'),
    );
    this.galleryCount = el('span.cs-nav__count', { hidden: true });
    this.galleryBtn = el(
      'button.btn.btn--ghost.cs-nav',
      { type: 'button', 'data-touch': '', 'data-test': 'gallery', onclick: () => this.openGallery() },
      svg(COLOUR_ICONS.gallery),
      // the short name: the full one squeezes the page title out of the top bar on tablets
      i18n.bind(el('span.cs-nav__label'), 'gallery.name.short'),
      this.galleryCount,
    );
    const group = el('div.cs-navgroup', {}, this.pagesBtn, this.galleryBtn);
    const spacer = bar.querySelector('.topbar__spacer');
    if (spacer) bar.insertBefore(group, spacer);
    else bar.appendChild(group);
    return bar;
  }

  private go(page: ColourPage | null): void {
    this.ctx.go({ state: 'colour', params: page ? { page: page.id } : {} });
  }

  private openGallery(): void {
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state: 'gallery', params: {} });
  }

  private show(pageId: string | undefined): void {
    const page = pageById(pageId);
    this.ctx.narration.stop();
    this.ctx.idle.clear();
    this.root.dataset.view = page ? 'studio' : 'picker';
    this.pagesBtn.hidden = !page;
    if (page) {
      this.picker.hide();
      void this.studio.open(page);
    } else {
      this.studio.hide();
      void this.picker.show(!this.shownOnce);
    }
    this.shownOnce = true;
  }

  private setCount(n: number): void {
    this.galleryCount.hidden = n === 0;
    this.galleryCount.textContent = String(n);
    this.picker.setCount(n);
  }
}

export default function (): Screen {
  return new ColourScreen();
}
