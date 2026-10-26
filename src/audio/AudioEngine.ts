/**
 * Audio buses: narration, ambient loops and synthesised sound effects.
 * Browsers only allow sound after a user gesture, so the landing "Start" tap calls unlock().
 * While narration plays, ambient loops duck to 30 %.
 */
import { Howl, Howler } from 'howler';
import { Sfx } from './sfx';
import { assetUrl } from '../assets/manifest';

export type AmbientId = 'rain' | 'market' | 'breeze' | 'workshop' | 'school' | 'rainMarket';

const AMBIENT_FILES: Record<AmbientId, string> = {
  rain: 'audio/ambient/rain-on-hat.mp3',
  market: 'audio/ambient/market-chatter.mp3',
  breeze: 'audio/ambient/breeze-leaves.mp3',
  workshop: 'audio/ambient/workshop.mp3',
  school: 'audio/ambient/schoolyard.mp3',
  rainMarket: 'audio/ambient/rain-market.mp3',
};

/** Ambient files that exist (written by tools/audio); others fall back to a synthesised bed. */
import ambientIndex from '../../content/ambient-index.json';

/** ambient loop volume, and while narration speaks (about 30 %) */
const AMBIENT_LEVEL = 0.8;
const DUCKED_LEVEL = 0.25;

export class AudioEngine {
  readonly sfx = new Sfx();
  private unlocked = false;
  private ambients = new Map<AmbientId, { stop: () => void; setLevel: (v: number) => void }>();
  private ducked = false;
  volume = 1;
  muted = false;

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Call from a user gesture. Safe to call many times. */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    try {
      // iOS 17+: let narration play even with the ringer switch on silent
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    const ctx = Howler.ctx;
    if (ctx) {
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      this.sfx.attach(ctx, Howler.masterGain ?? ctx.destination);
    }
    Howler.autoSuspend = false;
    this.unlocked = true;
  }

  setVolume(v: number): void {
    this.volume = v;
    Howler.volume(this.muted ? 0 : v);
    this.sfx.setVolume(v);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    Howler.mute(m);
    this.sfx.enabled = !m;
  }

  playAmbient(id: AmbientId): void {
    if (this.ambients.has(id)) return;
    if ((ambientIndex as string[]).includes(id)) {
      const howl = new Howl({ src: [assetUrl(AMBIENT_FILES[id])], loop: true, volume: 0, html5: false });
      // fade in once it really plays: fades queued before the file has loaded can run out of order
      howl.once('play', () => howl.fade(0, this.level(), 600));
      howl.play();
      this.ambients.set(id, {
        stop: () => {
          howl.fade(howl.volume(), 0, 500);
          setTimeout(() => howl.unload(), 600);
        },
        setLevel: (v) => {
          if (howl.playing()) howl.fade(howl.volume(), v, 300);
        },
      });
    } else {
      const kind = id === 'rain' || id === 'rainMarket' ? 'rain' : id === 'market' || id === 'school' ? 'market' : 'breeze';
      this.ambients.set(id, this.sfx.ambientNoise(kind, this.level()));
    }
  }

  private level(): number {
    return this.ducked ? DUCKED_LEVEL : AMBIENT_LEVEL;
  }

  stopAmbient(id?: AmbientId): void {
    for (const [key, a] of this.ambients) {
      if (!id || key === id) {
        a.stop();
        this.ambients.delete(key);
      }
    }
  }

  /** Narration start/end: every running loop fades down to ~30 % and back. */
  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    for (const a of this.ambients.values()) a.setLevel(this.level());
  }

  /** visibilitychange: pause everything while the tab is hidden */
  suspend(hidden: boolean): void {
    const ctx = Howler.ctx;
    if (!ctx) return;
    if (hidden) ctx.suspend().catch(() => {});
    else if (this.unlocked) ctx.resume().catch(() => {});
  }
}
