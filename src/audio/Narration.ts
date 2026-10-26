/**
 * Narration with captions. Every on-screen text has narration (the brief: "audio narration backup
 * for all onscreen text for non-readers"). If a clip isn't recorded yet, the caption still runs for
 * a reading-speed duration, so flows and tests keep moving.
 */
import { Howl } from 'howler';
import { i18n } from '../i18n/i18n';
import { assetUrl } from '../assets/manifest';
import type { AudioEngine } from './AudioEngine';
import type { CaptionBar } from '../ui/CaptionBar';
import audioIndex from '../../content/audio-index.json';

type Result = 'ended' | 'stopped';

const AVAILABLE = audioIndex as { en: string[]; vi: string[] };

export class Narration {
  private current: { id: string; howl: Howl | null; timer: number; resolve: (r: Result) => void } | null = null;
  private lastId: string | null = null;
  enabled = true;
  /** test hook: every id that was asked to play */
  log: string[] = [];
  private speedFactor = 1;
  /** told when a line starts/stops (idle hints wait for the voice to finish) */
  onBusy: (busy: boolean) => void = () => {};

  constructor(
    private audio: AudioEngine,
    private captions: CaptionBar,
  ) {
    i18n.onChange(() => {
      // restart the current line in the new language
      if (this.current) {
        const id = this.current.id;
        this.say(id);
      }
    });
  }

  /** test mode: run simulated narration faster */
  setSpeed(f: number): void {
    this.speedFactor = f;
  }

  currentId(): string | null {
    return this.current?.id ?? null;
  }

  /** Play one line (interrupting any current one). Resolves when it finishes or is stopped. */
  say(id: string): Promise<Result> {
    this.stop();
    this.lastId = id;
    this.log.push(id);
    const lang = i18n.lang;
    const text = i18n.t(id);
    this.captions.show(text);
    this.audio.duck(true);
    this.onBusy(true);
    return new Promise<Result>((resolve) => {
      const finish = (r: Result) => {
        if (!this.current || this.current.id !== id) return;
        window.clearTimeout(this.current.timer);
        this.current.howl?.unload();
        this.current = null;
        this.captions.hide();
        this.audio.duck(false);
        this.onBusy(false);
        resolve(r);
      };
      const hasFile = this.enabled && AVAILABLE[lang]?.includes(id);
      let howl: Howl | null = null;
      // reading-speed fallback (EN ≈ 14 chars/s, VI ≈ 12 chars/s) + a little breathing room
      const simulated = ((text.length / (lang === 'vi' ? 12 : 14)) * 1000 + 600) / this.speedFactor;
      const timer = window.setTimeout(() => finish('ended'), hasFile ? simulated * 3 + 4000 : simulated);
      if (hasFile) {
        howl = new Howl({
          src: [assetUrl(`audio/narration/${lang}/${id}.mp3`)],
          html5: false,
          onend: () => finish('ended'),
          onloaderror: () => {
            window.clearTimeout(timer);
            if (this.current) this.current.timer = window.setTimeout(() => finish('ended'), simulated);
          },
        });
        howl.on('play', () => this.captions.progress(howl!));
        howl.play();
      } else {
        this.captions.progressTimed(simulated);
      }
      this.current = { id, howl, timer, resolve: finish };
    });
  }

  /** Play several lines in order; stops early if interrupted. */
  async queue(ids: string[]): Promise<Result> {
    for (const id of ids) {
      const r = await this.say(id);
      if (r === 'stopped') return 'stopped';
    }
    return 'ended';
  }

  replay(): void {
    if (this.lastId) this.say(this.lastId);
  }

  stop(): void {
    if (!this.current) return;
    const c = this.current;
    window.clearTimeout(c.timer);
    c.howl?.stop();
    c.howl?.unload();
    this.current = null;
    this.captions.hide();
    this.audio.duck(false);
    this.onBusy(false);
    c.resolve('stopped');
  }
}
