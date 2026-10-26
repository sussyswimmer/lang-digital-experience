/**
 * Phase 4c: the Nón Lá Memory Quiz. Five questions; every answer is a big picture card with a
 * label. Narration reads the question, then each answer while its card glows. A correct first tap
 * earns that question's badge (it flies to the shelf); a wrong tap wobbles gently, the right card
 * lights up and the explanation is read. Every child reaches the certificate.
 */
import '../hub/p4.css';
import './quiz.css';
import { gsap } from 'gsap';
import { el, svg } from '../../../ui/el';
import { TopBar } from '../../../ui/TopBar';
import { i18n } from '../../../i18n/i18n';
import { motion } from '../../../a11y/motion';
import type { AppContext, Screen } from '../../../app/context';
import { speak } from '../../phase1/speak';
import { art } from '../hub/media';
import { P4_ICONS } from '../hub/icons';
import { QUIZ_BADGES, badgeSvg } from '../hub/badges';
import { centreOf, enter, labelButton, quietViewer, rectOf, testHook } from '../hub/kit';
import { answerArt } from './pictures';
import { QUESTIONS, advance, answer, answered, correctIndex, finished, recordRun, score, startRun, type QuizQuestion, type QuizRun } from './scoring';
import { setFinishedRun } from './session';

const YES = ['quiz.yes.1', 'quiz.yes.2', 'quiz.yes.3'];
const OOPS = ['quiz.oops.1', 'quiz.oops.2'];

class Quiz implements Screen {
  private ctx!: AppContext;
  private root!: HTMLElement;
  private alive = false;
  private g = gsap.context(() => {});
  private cleanups: (() => void)[] = [];
  private run: QuizRun = startRun();

  private dots: HTMLSpanElement[] = [];
  private count!: HTMLSpanElement;
  private slots: HTMLSpanElement[] = [];
  private stage!: HTMLDivElement;
  private cards: HTMLButtonElement[] = [];
  private actions!: HTMLDivElement;

  mount(root: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.root = root;
    this.alive = true;
    root.classList.add('p4', 'p4-quiz');
    quietViewer(ctx);
    this.run = startRun(QUESTIONS.length);

    this.count = el('span.p4q-count');
    const progress = el('div.p4q-progress', { 'aria-hidden': 'true' });
    this.dots = QUESTIONS.map(() => {
      const d = el('span.p4q-dot');
      d.innerHTML = '<svg viewBox="0 0 32 24"><path d="M16 2 31 19Q16 25 1 19Z"/></svg>';
      progress.appendChild(d);
      return d;
    });
    const shelf = el('div.p4q-shelf', { 'aria-label': i18n.t('hub.badges'), role: 'list' });
    this.slots = QUIZ_BADGES.map((b) => {
      const s = el('span.p4q-slot', { role: 'listitem', dataset: { badge: b.id } });
      s.innerHTML = badgeSvg(b, false);
      shelf.appendChild(s);
      return s;
    });
    this.stage = el('div.p4q-stage');
    root.append(
      TopBar(ctx, { titleId: 'quiz.title' }),
      el('div.p4q-layout', {}, el('header.p4q-head', {}, el('div.p4q-where', {}, progress, this.count), shelf), this.stage),
    );

    this.cleanups.push(
      testHook(ctx, 'quiz', {
        answer: (i: number) => this.choose(i),
        current: () => this.run.index,
        badges: () => [...this.run.badges],
        answered: () => answered(this.run),
        next: () => this.onNext(),
      }),
    );
    this.showQuestion(true);
  }

  unmount(): void {
    this.alive = false;
    this.g.kill();
    for (const c of this.cleanups.splice(0)) c();
    this.ctx.idle.clear();
    this.root.replaceChildren();
  }

  private get question(): QuizQuestion {
    return QUESTIONS[this.run.index];
  }

  // ---------- one question ----------

  private showQuestion(first = false): void {
    const ctx = this.ctx;
    const q = this.question;
    const index = this.run.index;
    i18n.bind(this.count, 'quiz.qnum', { n: index + 1 });
    this.dots.forEach((d, i) => d.classList.toggle('is-current', i === index));

    const scene = q.scene ? art({ src: q.scene.image, alt: i18n.t(q.scene.altId), svg: '' }, 'p4q-scene') : null;
    const listen = labelButton('button.p4-action.p4-action--light.p4q-listen', P4_ICONS.speaker, 'ui.replay', () => {
      ctx.audio.sfx.play('tap');
      this.readAloud();
    }, { 'data-test': 'listen' });
    this.actions = el('div.p4q-actions', {}, listen);
    const prompt = i18n.bind(el('h2.p4q-prompt', { id: `p4q-prompt-${q.id}` }), q.promptId);
    const panel = el('div.p4q-question', { dataset: { source: q.source } }, scene, prompt, this.actions);

    this.cards = q.answers.map((a, i) => {
      const picture = art(
        { src: a.imageReady ? `img/quiz/${a.imageId}.webp` : null, alt: i18n.t(a.labelId), svg: answerArt(a.art) },
        'p4q-card__pic',
      );
      const card = el(
        'button.p4q-card',
        {
          type: 'button',
          'data-touch': '',
          'data-test': `answer-${i}`,
          'data-answer': a.id,
          onclick: () => this.choose(i),
        },
        picture,
        i18n.bind(el('span.p4q-card__label'), a.labelId),
        el('span.p4q-card__mark', { 'aria-hidden': 'true' }, svg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2F5D46"/><path d="m6.5 12.5 3.6 3.6 7.4-8" fill="none" stroke="#FFF9EC" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')),
      );
      return card;
    });
    const answers = el('div.p4q-answers', { role: 'group', 'aria-labelledby': `p4q-prompt-${q.id}` }, ...this.cards);
    this.stage.replaceChildren(panel, answers);
    if (!motion.reduced) {
      this.g.add(() => {
        enter(panel, { y: -16, opacity: 0 }, { duration: 0.4, ease: 'power2.out' });
        enter(this.cards, { y: 40, opacity: 0, scale: 0.94 }, { duration: 0.5, stagger: 0.08, delay: 0.1, ease: 'back.out(1.6)' });
      });
    }
    ctx.idle.watch({ stepId: `quiz.${q.id}`, gesture: 'tap', target: () => rectOf(this.cards[1] ?? this.cards[0]) });
    if (first) void speak(ctx.narration, ['quiz.intro'], () => this.alive && this.run.index === index && !answered(this.run)).then((r) => {
      if (r.result === 'ended') this.readAloud();
    });
    else this.readAloud();
  }

  /** the question, then each answer while its card glows */
  private readAloud(): void {
    const q = this.question;
    if (!q) return;
    const index = this.run.index;
    const ids = answered(this.run) ? [q.explanationId] : [q.promptId, ...q.answers.map((a) => a.labelId)];
    void speak(
      this.ctx.narration,
      ids,
      () => this.alive && this.run.index === index,
      (id) => this.cards.forEach((c, i) => c.classList.toggle('is-told', q.answers[i]?.labelId === id)),
    ).then(() => this.cards.forEach((c) => c.classList.remove('is-told')));
  }

  private choose(i: number): void {
    if (!this.alive || finished(this.run) || answered(this.run)) return;
    const ctx = this.ctx;
    const q = this.question;
    const outcome = answer(this.run, QUESTIONS, i);
    if (outcome.run === this.run) return;
    this.run = outcome.run;
    const right = correctIndex(q);
    const chosen = this.cards[i];
    this.cards.forEach((c, k) => {
      c.classList.remove('is-told');
      c.classList.add('is-locked');
      c.setAttribute('aria-disabled', 'true');
      c.classList.toggle('is-correct', k === right);
      c.classList.toggle('is-dim', k !== right && k !== i);
    });
    chosen.classList.add(outcome.correct ? 'is-right' : 'is-wrong');
    this.dots[this.run.index].classList.add(outcome.correct ? 'is-won' : 'is-done');

    let lines: string[];
    if (outcome.correct) {
      ctx.audio.sfx.play('chime');
      if (!motion.reduced) this.g.add(() => gsap.fromTo(chosen, { scale: 1 }, { keyframes: { scale: [1.06, 0.98, 1] }, duration: 0.5, ease: 'power1.out' }));
      if (outcome.badge) this.flyBadge(outcome.badge, chosen);
      lines = [YES[this.run.index % YES.length], ...(outcome.badge ? [`quiz.badge.${outcome.badge}.earned`] : []), q.explanationId];
    } else {
      ctx.audio.sfx.play('floatBack');
      if (!motion.reduced) {
        this.g.add(() => {
          gsap.fromTo(chosen, { rotate: 0, x: 0 }, { keyframes: { rotate: [-3, 3, -2, 2, 0], x: [-8, 8, -5, 4, 0] }, duration: 0.6, ease: 'none' });
          gsap.fromTo(this.cards[right], { scale: 1 }, { keyframes: { scale: [1.05, 1.02] }, duration: 0.6, delay: 0.4 });
        });
      }
      lines = [OOPS[this.run.index % OOPS.length], q.explanationId];
    }
    this.showNext();
    const index = this.run.index;
    void speak(ctx.narration, lines, () => this.alive && this.run.index === index);
  }

  private flyBadge(id: string, from: HTMLElement): void {
    const ctx = this.ctx;
    const def = QUIZ_BADGES.find((b) => b.id === id)!;
    const slot = this.slots[QUIZ_BADGES.indexOf(def)];
    const fill = () => {
      slot.innerHTML = badgeSvg(def, true);
      slot.classList.add('is-earned');
      slot.setAttribute('aria-label', i18n.t(def.nameId));
      ctx.audio.sfx.play('badge');
    };
    if (motion.reduced) {
      fill();
      return;
    }
    const start = centreOf(from);
    const end = centreOf(slot);
    const s = slot.getBoundingClientRect();
    const fly = el('div.p4q-fly', { 'aria-hidden': 'true' });
    fly.innerHTML = badgeSvg(def, true);
    this.root.appendChild(fly);
    this.g.add(() => {
      gsap.set(fly, { x: start.x, y: start.y, xPercent: -50, yPercent: -50, scale: 0, rotate: -30 });
      gsap
        .timeline({ onComplete: () => fly.remove() })
        .to(fly, { scale: 1.25, rotate: 0, duration: 0.45, ease: 'back.out(2.2)' })
        .to(fly, { x: end.x, duration: 0.8, ease: 'power2.inOut' }, '+=0.35')
        .to(fly, { y: end.y, duration: 0.8, ease: 'back.in(1.6)' }, '<')
        .to(fly, { scale: s.height / 150, duration: 0.8, ease: 'power2.in' }, '<')
        .add(fill)
        .fromTo(slot, { scale: 1.5 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    });
  }

  private showNext(): void {
    const last = this.run.index === QUESTIONS.length - 1;
    const next = labelButton(
      'button.p4-action.p4-action--cta.p4q-next',
      last ? P4_ICONS.scroll : P4_ICONS.next,
      last ? 'quiz.finish' : 'quiz.next',
      () => this.onNext(),
      { 'data-test': 'next' },
    );
    this.actions.querySelector('.p4q-listen')?.remove();
    this.actions.appendChild(next);
    if (!motion.reduced) this.g.add(() => enter(next, { scale: 0.6, opacity: 0 }, { duration: 0.45, delay: 0.3, ease: 'back.out(2)' }));
    this.ctx.idle.watch({ stepId: 'quiz.next', gesture: 'tap', target: () => rectOf(next) });
  }

  private onNext(): void {
    if (!this.alive || !answered(this.run)) return;
    const ctx = this.ctx;
    ctx.audio.sfx.play('tap');
    ctx.narration.stop();
    this.run = advance(this.run);
    if (finished(this.run)) {
      this.finish();
      return;
    }
    if (motion.reduced) this.showQuestion();
    else {
      const out = [...this.stage.children];
      this.g.add(() => gsap.to(out, { opacity: 0, y: -14, duration: 0.22, ease: 'power1.in', onComplete: () => this.alive && this.showQuestion() }));
    }
  }

  private finish(): void {
    const ctx = this.ctx;
    const run = this.run;
    ctx.progress.set((p) => ({ ...p, games: { ...p.games, quiz: recordRun(p.games.quiz, run, new Date()) } }));
    setFinishedRun({ badges: [...run.badges], score: score(run), at: Date.now() });
    ctx.go({ state: 'certificate', params: {} });
  }
}

export default function QuizScreen(): Screen {
  return new Quiz();
}
