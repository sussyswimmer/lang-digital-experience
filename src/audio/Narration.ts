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
import type { Lang } from '../app/types';
import audioIndex from '../../content/audio-index.json';

type Result = 'ended' | 'stopped';

const AVAILABLE = audioIndex as { en: string[]; vi: string[] };
/** decoded clips kept for Replay, the EN↔VI switch and the next line of a queue (the oldest is unloaded) */
const CACHE = 4;

export class Narration {
  private current: { id: string; howl: Howl | null; timer: number; detach: () => void; resolve: (r: Result) => void } | null = null;
  private lastId: string | null = null;
  /** `${lang}/${id}` → clip, least recently used first */
  private clips = new Map<string, Howl>();
  enabled = true;
  /** test hook: every id that was asked to play */
  log: string[] = [];
  /** ids said with interject(): a sequence waiting on another line should not treat them as an interruption */
  private asides = new Set<string>();
  /** the line an aside interrupted, read again once the aside ends */
  private resume: { id: string; resolve: (r: Result) => void } | null = null;
  private asideToken = 0;
  private speedFactor = 1;
  /** told when a line starts/stops (idle hints wait for the voice to finish) */
  onBusy: (busy: boolean) => void = () => {};

  constructor(
    private audio: AudioEngine,
    private captions: CaptionBar,
  ) {
    i18n.onChange(() => {
      // restart the current line in the new language; whoever awaits it keeps waiting for the new take
      const c = this.current;
      if (c) {
        this.detach();
        void this.play(c.id, c.resolve);
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

  /** Start fetching and decoding a line that is about to be said (e.g. the next chunk), so it starts without a gap. */
  preload(id: string): void {
    if (this.enabled) this.clip(i18n.lang, id);
  }

  private clip(lang: Lang, id: string): Howl | null {
    if (!AVAILABLE[lang]?.includes(id)) return null;
    const key = `${lang}/${id}`;
    let howl = this.clips.get(key);
    if (!howl) {
      const h = (howl = new Howl({ src: [assetUrl(`audio/narration/${lang}/${id}.mp3`)], html5: false }));
      // a clip that failed to load is not kept: the next say() tries again
      h.once('loaderror', () => this.clips.get(key) === h && this.clips.delete(key));
    }
    // re-insert as the most recently used
    this.clips.delete(key);
    this.clips.set(key, howl);
    for (const [k, old] of this.clips) {
      if (this.clips.size <= CACHE) break;
      if (old === this.current?.howl) continue;
      old.unload();
      this.clips.delete(k);
    }
    return howl;
  }

  /** Play one line (interrupting any current one). Resolves when it finishes or is stopped. */
  say(id: string): Promise<Result> {
    return this.play(id);
  }

  /**
   * A short aside (a colour, thread or part name the child tapped) that must not derail the explanation
   * being read: the current line pauses, the aside plays, then the line is read again from its start and
   * its original promise settles as usual. Without a current line it is a plain say().
   */
  interject(id: string): void {
    this.asides.add(id);
    const c = this.current;
    if (!c || (!this.resume && c.id === id)) {
      void this.say(id);
      return;
    }
    // the line to come back to; a second aside during the first keeps the same one
    if (!this.resume) this.resume = { id: c.id, resolve: c.resolve };
    this.detach();
    const token = ++this.asideToken;
    void this.play(id).then((r) => {
      const back = this.resume;
      if (token !== this.asideToken || !back) return;
      this.resume = null;
      if (r === 'ended') void this.play(back.id, back.resolve);
      else back.resolve('stopped'); // something else took over while the aside played
    });
  }

  isAside(id: string): boolean {
    return this.asides.has(id);
  }

  /** `handOff`: the resolver of a line this one replaces (a language switch, Replay or an aside), settled with it */
  private play(id: string, handOff?: (r: Result) => void): Promise<Result> {
    this.stop();
    this.lastId = id;
    this.log.push(id);
    const lang = i18n.lang;
    const text = i18n.t(id);
    this.captions.show(text);
    this.audio.duck(true);
    this.onBusy(true);
    return new Promise<Result>((resolveOwn) => {
      const resolve = (r: Result) => {
        resolveOwn(r);
        handOff?.(r);
      };
      const finish = (r: Result) => {
        if (!this.current || this.current.id !== id) return;
        window.clearTimeout(this.current.timer);
        this.current.detach();
        this.current = null;
        this.captions.hide();
        this.audio.duck(false);
        this.onBusy(false);
        resolve(r);
      };
      const howl = this.enabled ? this.clip(lang, id) : null;
      // reading-speed fallback (EN ≈ 14 chars/s, VI ≈ 12 chars/s) + a little breathing room
      const simulated = ((text.length / (lang === 'vi' ? 12 : 14)) * 1000 + 600) / this.speedFactor;
      const timer = window.setTimeout(() => finish('ended'), howl ? simulated * 3 + 4000 : simulated);
      let detach = () => {};
      if (howl) {
        // the clip is shared with later lines, so this line's handlers come off again when it ends or is stopped
        const onEnd = () => finish('ended');
        const onPlay = () => this.captions.progress(howl);
        const onError = () => {
          window.clearTimeout(timer);
          if (this.current) this.current.timer = window.setTimeout(() => finish('ended'), simulated);
        };
        howl.on('end', onEnd).on('play', onPlay).on('loaderror', onError);
        detach = () => {
          howl.off('end', onEnd).off('play', onPlay).off('loaderror', onError);
          howl.stop();
        };
        howl.play();
      } else {
        this.captions.progressTimed(simulated);
      }
      // stop() does its own cleanup, so it gets the bare resolver (finish() ignores a line that is no longer current)
      this.current = { id, howl, timer, detach, resolve };
    });
  }

  /** Play several lines in order; stops early if interrupted. The next line loads while one plays. */
  async queue(ids: string[]): Promise<Result> {
    for (const [i, id] of ids.entries()) {
      const said = this.say(id);
      if (ids[i + 1]) this.preload(ids[i + 1]);
      if ((await said) === 'stopped') return 'stopped';
    }
    return 'ended';
  }

  replay(): void {
    const c = this.current;
    if (c && c.id === this.lastId) {
      this.detach();
      void this.play(c.id, c.resolve);
    } else if (this.lastId) {
      void this.say(this.lastId);
    }
  }

  /** take the current line off the air without settling its promise (it is about to be handed on) */
  private detach(): void {
    const c = this.current;
    if (!c) return;
    window.clearTimeout(c.timer);
    c.detach();
    this.current = null;
  }

  stop(): void {
    if (!this.current) return;
    const c = this.current;
    window.clearTimeout(c.timer);
    c.detach();
    this.current = null;
    this.captions.hide();
    this.audio.duck(false);
    this.onBusy(false);
    c.resolve('stopped');
  }
}
