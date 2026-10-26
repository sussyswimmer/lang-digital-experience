/**
 * The Nón Lá Explorer certificate: the drawn certificate, an optional child's name typed by a
 * grown-up (kept on this device only), and Save picture / Save PDF / Print. Arriving straight from
 * the quiz it celebrates with confetti and tells the child how many badges they collected.
 */
import '../hub/p4.css';
import './certificate.css';
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { TopBar } from '../../../ui/TopBar';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import { readJSON, writeJSON } from '../../../app/persist';
import type { AppContext, Screen } from '../../../app/context';
import { speak } from '../../phase1/speak';
import { P4_ICONS } from '../hub/icons';
import { confettiBurst, type Burst } from '../hub/confetti';
import { enter, labelButton, quietViewer, rectOf, testHook } from '../hub/kit';
import { canonicalBadges } from './scoring';
import { takeFinishedRun } from './session';
import { CERT_H, CERT_W, downloadBlob, downloadPdf, drawCertificate, toPngBlob, type CertData } from './certificate';

const NAME_KEY = 'nonla.cert.name';
const NAME_MAX = 40;
export const PNG_NAME = 'chung-nhan-non-la.png';
export const PDF_NAME = 'chung-nhan-non-la.pdf';

class Certificate implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private g = gsap.context(() => {});
  private cleanups: (() => void)[] = [];
  private canvas!: HTMLCanvasElement;
  private printImg!: HTMLImageElement;
  private input!: HTMLInputElement;
  private buttons: HTMLButtonElement[] = [];
  private drawing: Promise<void> = Promise.resolve();
  private drawn = false;
  private redrawTimer = 0;
  private burst: Burst | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p4', 'p4-cert');
    quietViewer(ctx);

    this.canvas = el('canvas.p4c-canvas', { width: CERT_W, height: CERT_H, role: 'img', 'aria-label': i18n.t('cert.alt'), 'data-test': 'certificate' });
    const sheet = el('figure.p4c-sheet', {}, this.canvas);

    this.input = el('input.p4c-input', {
      type: 'text',
      id: 'p4c-name',
      maxlength: NAME_MAX,
      autocomplete: 'off',
      spellcheck: 'false',
      'data-test': 'name',
      placeholder: i18n.t('cert.name.placeholder'),
      value: readJSON<string>(NAME_KEY) ?? '',
    });
    this.input.addEventListener('input', () => this.onName());
    const nameBox = el(
      'div.p4c-name',
      {},
      el('label.p4c-name__label', { for: 'p4c-name' }, svg(P4_ICONS.pencil, 'p4-icon'), i18n.bind(el('span'), 'cert.name.label')),
      this.input,
      i18n.bind(el('p.p4c-name__note'), 'cert.name.private'),
    );
    const png = labelButton('button.p4-action.p4-action--cta', P4_ICONS.download, 'cert.png', () => void this.savePng(), { 'data-test': 'save-png' });
    const pdf = labelButton('button.p4-action', P4_ICONS.pdf, 'cert.pdf', () => void this.savePdf(), { 'data-test': 'save-pdf' });
    const print = labelButton('button.p4-action', P4_ICONS.print, 'cert.print', () => void this.print(), { 'data-test': 'print' });
    this.buttons = [png, pdf, print];
    const again = labelButton('button.p4-action.p4-action--light', P4_ICONS.again, 'cert.again', () => this.go('quiz'), { 'data-test': 'again' });
    const hub = labelButton('button.p4-action.p4-action--light', P4_ICONS.grid, 'hub.back', () => this.go('hub'), { 'data-test': 'to-hub' });
    const panel = el('aside.p4c-panel', {}, nameBox, el('div.p4c-save', {}, png, pdf, print), el('div.p4c-more', {}, again, hub));
    root.append(TopBar(ctx, { titleId: 'cert.title' }), el('div.p4c-layout', {}, sheet, panel));

    // the print stylesheet shows only this picture
    this.printImg = el('img#p4c-print', { alt: i18n.t('cert.alt') });
    document.body.appendChild(this.printImg);
    this.cleanups.push(() => this.printImg.remove());

    const offLang = i18n.onChange(() => {
      this.input.placeholder = i18n.t('cert.name.placeholder');
      this.canvas.setAttribute('aria-label', i18n.t('cert.alt'));
      this.redraw();
    });
    this.cleanups.push(offLang);
    this.cleanups.push(
      testHook(ctx, 'cert', {
        ready: () => this.drawn,
        name: () => this.input.value,
        badges: () => this.data().badges,
      }),
    );

    this.redraw();
    if (!motion.reduced) this.g.add(() => enter(sheet, { y: 30, opacity: 0, scale: 0.96 }, { duration: 0.6, ease: 'back.out(1.5)' }));
    ctx.idle.watch({ stepId: 'cert.save', gesture: 'tap', target: () => rectOf(png) });

    const fresh = takeFinishedRun();
    const n = this.data().badges.length;
    if (fresh) {
      ctx.audio.sfx.play('fanfare');
      void this.drawing.then(() => {
        if (this.alive) this.burst = confettiBurst(root, { from: { x: root.clientWidth * 0.35, y: root.clientHeight * 0.55 } });
      });
      void speak(ctx.narration, ['cert.intro', `cert.earned.${n}`, ...(n < 5 && n > 0 ? ['cert.missing'] : []), 'cert.ask'], () => this.alive);
    } else {
      void speak(ctx.narration, ['cert.look', 'cert.ask'], () => this.alive);
    }
  }

  unmount(): void {
    this.alive = false;
    window.clearTimeout(this.redrawTimer);
    this.burst?.stop();
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    this.ctx.idle.clear();
    this.root.replaceChildren();
  }

  private data(): CertData {
    const p = this.ctx.progress.get();
    const at = p.games.quiz.certificateAt ? new Date(p.games.quiz.certificateAt) : new Date();
    return {
      lang: i18n.lang,
      name: this.input.value.trim().slice(0, NAME_MAX),
      date: Number.isNaN(at.getTime()) ? new Date() : at,
      badges: canonicalBadges(p.games.quiz.badges),
      maker: p.games.build.completed > 0,
    };
  }

  private redraw(): void {
    const data = this.data();
    this.drawing = this.drawing
      .then(() => drawCertificate(this.canvas, data))
      .then(() => {
        if (!this.alive) return;
        this.drawn = true;
        this.printImg.src = this.canvas.toDataURL('image/png');
      })
      .catch((err) => console.error('[certificate] could not draw', err));
  }

  private onName(): void {
    writeJSON(NAME_KEY, this.input.value.slice(0, NAME_MAX));
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 250);
  }

  private async busy<T>(work: () => Promise<T>): Promise<T | undefined> {
    this.ctx.audio.sfx.play('tap');
    window.clearTimeout(this.redrawTimer);
    this.redraw();
    this.buttons.forEach((b) => (b.disabled = true));
    try {
      await this.drawing;
      return await work();
    } catch (err) {
      console.error('[certificate]', err);
      return undefined;
    } finally {
      this.buttons.forEach((b) => (b.disabled = false));
    }
  }

  private async savePng(): Promise<void> {
    await this.busy(async () => {
      downloadBlob(await toPngBlob(this.canvas), PNG_NAME);
      this.saved();
    });
  }

  private async savePdf(): Promise<void> {
    this.ctx.toast(i18n.t('cert.making'), 1600);
    await this.busy(async () => {
      await downloadPdf(this.canvas, PDF_NAME);
      this.saved();
    });
  }

  private async print(): Promise<void> {
    await this.busy(async () => {
      if (!this.printImg.complete) await new Promise((r) => this.printImg.addEventListener('load', r, { once: true }));
      window.print();
    });
  }

  private saved(): void {
    if (!this.alive) return;
    this.ctx.audio.sfx.play('sparkle');
    this.ctx.toast(i18n.t('cert.saved'));
  }

  private go(state: 'quiz' | 'hub'): void {
    this.ctx.audio.sfx.play('tap');
    this.ctx.go({ state, params: {} });
  }
}

export default function CertificateScreen(): Screen {
  return new Certificate();
}
