/**
 * Phase 4: the Activity Hub (non-linear). Three big illustrated cards (Build / Colour / Quiz),
 * "Revisit the story" (Phase 1, Phase 2 with a layer picker, Phase 3 with a chapter picker), the
 * "Tranh của con" gallery, a badge shelf and, once earned, the certificate.
 */
import './hub/hub.css';
import { gsap } from 'gsap';
import { el, svg } from '../../ui/el';
import { burst, preload } from '../../ui/lottie';
import { TopBar } from '../../ui/TopBar';
import { i18n } from '../../i18n/i18n';
import { motion } from '../../a11y/motion';
import { assetUrl } from '../../assets/manifest';
import { CHAPTERS, LAYERS, type ChapterId, type FlowState, type LayerId } from '../../app/types';
import type { AppContext, Screen } from '../../app/context';
import { speak } from '../phase1/speak';
import { art, refreshAlts } from './hub/media';
import { buildCardSvg, colourCardSvg, quizCardSvg } from './hub/cardArt';
import { P4_ICONS, P4_PICTURES } from './hub/icons';
import { ALL_BADGES, MAKER_BADGE, badgeSvg, earnedBadges } from './hub/badges';
import { centreOf, enter, labelButton, quietViewer, rectOf, testHook } from './hub/kit';
import { getGallery } from './gallery/galleryDb';

type Activity = 'build' | 'colour' | 'quiz';

const CARDS: { id: Activity; titleId: string; altId: string; icon: string; svg: () => string }[] = [
  { id: 'build', titleId: 'build.title', altId: 'hub.art.build', icon: P4_PICTURES.frame, svg: buildCardSvg },
  { id: 'colour', titleId: 'colour.title', altId: 'hub.art.colour', icon: P4_PICTURES.crayon, svg: colourCardSvg },
  { id: 'quiz', titleId: 'quiz.title', altId: 'hub.art.quiz', icon: P4_PICTURES.question, svg: quizCardSvg },
];

const LAYER_PICS: Record<LayerId, string> = {
  stitches: P4_PICTURES.stitches,
  leaves: P4_PICTURES.leaves,
  frame: P4_PICTURES.frame,
  strap: P4_PICTURES.strap,
};
const CHAPTER_PICS: Record<ChapterId, string> = { protection: P4_PICTURES.sun, heritage: P4_PICTURES.poem, identity: P4_PICTURES.rain };

/** the full card-by-card introduction plays once per visit; later returns just say "Choose an activity!" */
let introduced = false;

class Hub implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private g = gsap.context(() => {});
  private cards = new Map<Activity, HTMLButtonElement>();
  private picker!: HTMLDivElement;
  private pickerSheet!: HTMLDivElement;
  private pickerReturn: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];

  mount(root: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p4', 'p4-hub');
    quietViewer(ctx);
    void preload('sparkle');

    const side = el('div.p4h-side', {}, this.buildGallery());
    const cert = this.buildCertificate();
    if (cert) side.appendChild(cert);
    const main = el('div.p4h-main', {}, this.buildCards(), el('div.p4h-lower', {}, this.buildRevisit(), this.buildShelf(), side));
    this.picker = this.buildPicker();
    root.append(TopBar(ctx, { titleId: 'hub.title' }), main, this.picker);

    this.cleanups.push(i18n.onChange(() => refreshAlts(root)));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !this.picker.hidden) this.closePicker();
    };
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));
    this.cleanups.push(
      testHook(ctx, 'hub', {
        cards: () => [...this.cards.keys()],
        badges: () => earnedBadges(ctx.progress.get()),
        pickerOpen: () => !this.picker.hidden,
      }),
    );

    this.g.add(() => {
      if (!motion.reduced) {
        enter(root.querySelectorAll('.p4h-card'), { y: 40, opacity: 0 }, { duration: 0.6, stagger: 0.09, ease: 'back.out(1.6)' });
        enter(root.querySelectorAll('.p4h-lower > *'), { y: 24, opacity: 0 }, { duration: 0.5, delay: 0.25, stagger: 0.07, ease: 'power2.out' });
      }
    });
    this.watchCards();
    void this.introduce();
  }

  unmount(): void {
    this.alive = false;
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    this.ctx.idle.clear();
    this.root.replaceChildren();
  }

  // ---------- cards ----------

  private buildCards(): HTMLElement {
    const box = el('div.p4h-cards', { role: 'group', 'aria-label': i18n.t('hub.cards') });
    for (const c of CARDS) {
      const picture = art(
        {
          src: `img/art/hub-${c.id}-800.webp`,
          srcset: `${assetUrl(`img/art/hub-${c.id}-800.webp`)} 800w, ${assetUrl(`img/art/hub-${c.id}-1600.webp`)} 1600w`,
          sizes: '(max-width: 700px) 90vw, 32vw',
          altId: c.altId,
          svg: c.svg(),
        },
        'p4h-card__art',
      );
      const card = el(
        'button.p4h-card',
        { type: 'button', 'data-touch': '', 'data-test': `card-${c.id}`, dataset: { activity: c.id }, onclick: () => this.open(c.id) },
        picture,
        el('span.p4h-card__label', {}, svg(c.icon, 'p4h-card__icon'), i18n.bind(el('span.p4h-card__title'), c.titleId)),
      );
      this.cards.set(c.id, card);
      box.appendChild(card);
    }
    return box;
  }

  private open(state: FlowState, params: Record<string, string> = {}): void {
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state, params });
  }

  /** the activity to suggest with the idle hand: one the child hasn't done yet */
  private suggested(): Activity {
    const p = this.ctx.progress.get();
    if (p.games.build.completed === 0) return 'build';
    if (!p.games.quiz.certificateAt) return 'quiz';
    // `saved` counts every save ever made: here it just means "has coloured before"
    if (p.games.colour.saved === 0) return 'colour';
    return 'build';
  }

  private watchCards(): void {
    this.ctx.idle.watch({ stepId: 'hub.cards', gesture: 'tap', target: () => rectOf(this.cards.get(this.suggested())!) });
  }

  private async introduce(): Promise<void> {
    const ids = introduced ? ['hub.intro'] : ['hub.intro', ...CARDS.map((c) => c.titleId), 'hub.intro.more'];
    introduced = true;
    await speak(this.ctx.narration, ids, () => this.alive, (id) => {
      for (const [a, card] of this.cards) card.classList.toggle('is-told', CARDS.find((c) => c.id === a)!.titleId === id);
    });
    for (const card of this.cards.values()) card.classList.remove('is-told');
  }

  // ---------- revisit ----------

  private buildRevisit(): HTMLElement {
    const p1 = labelButton('button.p4h-chip', P4_PICTURES.photos, 'hub.revisit.p1', () => this.open('p1'), { 'data-test': 'revisit-p1' });
    const p2 = labelButton('button.p4h-chip', P4_PICTURES.layers, 'hub.revisit.p2', () => this.openPicker('layer', p2), {
      'data-test': 'revisit-p2',
      'aria-haspopup': 'dialog',
    });
    const p3 = labelButton('button.p4h-chip', P4_PICTURES.book, 'hub.revisit.p3', () => this.openPicker('chapter', p3), {
      'data-test': 'revisit-p3',
      'aria-haspopup': 'dialog',
    });
    return el(
      'section.p4h-panel.p4h-revisit',
      {},
      el('h2.p4h-panel__title', {}, svg(P4_ICONS.book, 'p4-icon'), i18n.bind(el('span'), 'hub.revisit')),
      el('div.p4h-revisit__row', {}, p1, p2, p3),
    );
  }

  private buildPicker(): HTMLDivElement {
    this.pickerSheet = el('div.p4h-picker__sheet', { role: 'dialog', 'aria-modal': 'true' });
    return el(
      'div.p4h-picker',
      { hidden: true },
      el('div.p4h-picker__scrim', { onclick: () => this.closePicker() }),
      this.pickerSheet,
    );
  }

  private openPicker(kind: 'layer' | 'chapter', from: HTMLElement): void {
    const ctx = this.ctx;
    ctx.audio.sfx.play('tap');
    this.pickerReturn = from;
    const promptId = kind === 'layer' ? 'hub.pick.layer' : 'hub.pick.chapter';
    const options =
      kind === 'layer'
        ? LAYERS.map((l) =>
            labelButton('button.p4h-option', LAYER_PICS[l], `hub.layer.${l}`, () => this.open('p2', { layer: l }), { 'data-test': `layer-${l}` }),
          )
        : CHAPTERS.map((c) =>
            labelButton('button.p4h-option', CHAPTER_PICS[c], `hub.chapter.${c}`, () => this.open('p3', { chapter: c }), { 'data-test': `chapter-${c}` }),
          );
    const close = el(
      'button.btn.btn--round.btn--ghost.p4h-picker__close',
      { type: 'button', 'data-touch': '', 'data-test': 'picker-close', 'aria-label': i18n.t('ui.close'), onclick: () => this.closePicker() },
      svg(P4_ICONS.close),
    );
    const title = i18n.bind(el('h2.p4h-picker__title', { id: 'p4h-picker-title' }), promptId);
    this.pickerSheet.setAttribute('aria-labelledby', 'p4h-picker-title');
    this.pickerSheet.replaceChildren(close, title, el('div.p4h-picker__options', { dataset: { kind } }, ...options));
    this.picker.hidden = false;
    this.root.querySelector<HTMLElement>('.p4h-main')!.inert = true;
    if (!motion.reduced) {
      this.g.add(() => {
        gsap.fromTo(this.pickerSheet, { y: 40, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)' });
        enter(options, { y: 16, opacity: 0 }, { duration: 0.3, stagger: 0.05, delay: 0.1 });
      });
    }
    options[0].focus({ preventScroll: true });
    void ctx.narration.say(promptId);
    ctx.idle.watch({ stepId: 'hub.picker', gesture: 'tap', target: () => rectOf(options[0]) });
  }

  private closePicker(): void {
    if (this.picker.hidden) return;
    this.ctx.audio.sfx.play('tap');
    this.ctx.narration.stop();
    this.picker.hidden = true;
    this.root.querySelector<HTMLElement>('.p4h-main')!.inert = false;
    this.pickerReturn?.focus({ preventScroll: true });
    this.watchCards();
  }

  // ---------- gallery, badges, certificate ----------

  private buildGallery(): HTMLElement {
    const btn = labelButton('button.p4h-gallery', P4_PICTURES.gallery, 'gallery.name', () => this.open('gallery'), { 'data-test': 'gallery' });
    // count the pictures really on the wall: progress only counts saves, and deleting doesn't undo
    // those (nothing saved yet: no need to open the store at all)
    if (this.ctx.progress.get().games.colour.saved > 0) {
      void getGallery()
        .then((s) => s.count())
        .then((n) => {
          if (n > 0 && this.alive) btn.appendChild(el('span.p4h-count', { 'aria-hidden': 'true' }, String(n)));
        })
        .catch(() => {});
    }
    return btn;
  }

  private buildShelf(): HTMLElement {
    const ctx = this.ctx;
    const p = ctx.progress.get();
    const have = new Set(earnedBadges(p));
    const slots = ALL_BADGES.map((b) => {
      const earned = have.has(b.id);
      const slot = el('button.p4h-badge', {
        type: 'button',
        'data-touch': '',
        'data-test': `badge-${b.id}`,
        'aria-label': earned ? i18n.t(b.nameId) : i18n.t(b.id === MAKER_BADGE.id ? 'hub.badge.locked.build' : 'hub.badge.locked.quiz'),
        dataset: { earned: String(earned) },
        onclick: () => {
          if (earned) {
            ctx.audio.sfx.play('sparkle');
            burst(this.root, 'sparkle', centreOf(slot), { size: 150 });
            void ctx.narration.say(b.nameId);
            if (!motion.reduced) this.g.add(() => gsap.fromTo(slot, { rotate: -12, scale: 1.15 }, { rotate: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
          } else {
            ctx.audio.sfx.play('tap');
            void ctx.narration.say(b.id === MAKER_BADGE.id ? 'hub.badge.locked.build' : 'hub.badge.locked.quiz');
          }
        },
      });
      slot.innerHTML = badgeSvg(b, earned);
      slot.firstElementChild?.setAttribute('aria-hidden', 'true');
      return slot;
    });
    return el(
      'section.p4h-panel.p4h-shelf',
      {},
      el('h2.p4h-panel__title', {}, svg(P4_ICONS.medal, 'p4-icon'), i18n.bind(el('span'), 'hub.badges')),
      el('div.p4h-shelf__row', {}, ...slots),
    );
  }

  private buildCertificate(): HTMLElement | null {
    if (!this.ctx.progress.get().games.quiz.certificateAt) return null;
    return labelButton('button.p4h-cert', P4_PICTURES.certificate, 'hub.cert', () => this.open('certificate'), { 'data-test': 'certificate' });
  }
}

export default function HubScreen(): Screen {
  return new Hub();
}
