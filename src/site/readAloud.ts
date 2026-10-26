/**
 * "Listen" buttons on the landing page: the brief asks for narration of all on-screen text, and the
 * app's Narration (with its caption bar) only exists after Start. A tap is a user gesture, so it
 * may unlock audio here. Recorded clips are used when they exist; otherwise the device's own voice
 * reads the line, if it has one for the language.
 */
import { Howl } from 'howler';
import { i18n } from '../i18n/i18n';
import { assetUrl } from '../assets/manifest';
import type { AudioEngine } from '../audio/AudioEngine';
import audioIndex from '../../content/audio-index.json';
import { el, svg } from '../ui/el';
import { ICONS } from '../ui/icons';

const RECORDED = audioIndex as { en: string[]; vi: string[] };

export class ReadAloud {
  private howl: Howl | null = null;
  private active: { id: string; button?: HTMLElement } | null = null;
  /** test hook: every id that was asked to play */
  readonly log: string[] = [];

  constructor(private audio: AudioEngine) {}

  async say(id: string, button?: HTMLElement): Promise<void> {
    this.stop();
    this.log.push(id);
    this.active = { id, button };
    button?.classList.add('is-speaking');
    await this.audio.unlock().catch(() => {});
    if (this.active?.id !== id) return;
    const lang = i18n.lang;
    const done = () => {
      if (this.active?.id === id) this.stop();
    };
    if (RECORDED[lang]?.includes(id)) {
      this.howl = new Howl({ src: [assetUrl(`audio/narration/${lang}/${id}.mp3`)], html5: false, onend: done, onloaderror: done });
      this.howl.play();
      return;
    }
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const voice = synth?.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (!synth || !voice) {
      window.setTimeout(done, 900);
      return;
    }
    const u = new SpeechSynthesisUtterance(i18n.t(id));
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.92;
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }

  stop(): void {
    this.howl?.stop();
    this.howl?.unload();
    this.howl = null;
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    this.active?.button?.classList.remove('is-speaking');
    this.active = null;
  }

  /** A round 64 px "Listen" button for one string id. */
  button(id: string, extraClass = ''): HTMLButtonElement {
    const b = el(`button.btn.btn--round.btn--ghost.listen${extraClass ? `.${extraClass}` : ''}`, {
      type: 'button',
      'data-touch': '',
      'data-say': id,
    }) as HTMLButtonElement;
    b.append(svg(ICONS.speaker));
    const label = () => b.setAttribute('aria-label', `${i18n.t('site.listen')}: ${i18n.t(id)}`);
    label();
    i18n.onChange(label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.active?.id === id) this.stop();
      else void this.say(id, b);
    });
    return b;
  }
}
