/**
 * Sound effects synthesised live with Web Audio: no files to download, nothing to license,
 * and they can follow the child's finger (e.g. stitch ticks rise in pitch as a row is traced).
 * Every sound is soft (peaks well under 0 dBFS) and never harsh: a wrong answer is a gentle
 * two-note float, never a buzzer.
 */
export type SfxId =
  | 'tap'
  | 'snap'
  | 'peel'
  | 'ringSnap'
  | 'stitchTick'
  | 'floatBack'
  | 'chime'
  | 'badge'
  | 'pageTurn'
  | 'whoosh'
  | 'fillPop'
  | 'sparkle'
  | 'swish'
  | 'bookOpen'
  | 'invite'
  | 'leafRustle'
  | 'threadZip'
  | 'fanfare';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  /** for tests: every played id */
  log: string[] = [];

  attach(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    if (this.out) this.out.gain.value = 0.7 * v;
  }

  play(id: SfxId, opts: { step?: number; pan?: number } = {}): void {
    this.log.push(id);
    if (!this.enabled || !this.ctx || !this.out || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const s = opts.step ?? 0;
    switch (id) {
      case 'tap':
        this.tone(660, t, 0.06, 0.18, 'sine');
        break;
      case 'snap':
        this.knock(t, 900, 0.22);
        this.tone(1320, t + 0.03, 0.18, 0.12, 'triangle');
        break;
      case 'ringSnap':
        this.knock(t, 500 + s * 60, 0.25);
        this.tone(midi(67 + PENTA[s % PENTA.length]), t, 0.25, 0.1, 'triangle');
        break;
      case 'stitchTick':
        this.tone(midi(72 + PENTA[s % PENTA.length]), t, 0.12, 0.09, 'sine');
        break;
      case 'peel':
      case 'leafRustle':
        this.noiseSweep(t, id === 'peel' ? 0.45 : 0.3, 1800, 5200, 0.22);
        break;
      case 'floatBack':
        this.tone(midi(72), t, 0.18, 0.13, 'sine');
        this.tone(midi(67), t + 0.16, 0.3, 0.12, 'sine');
        break;
      case 'chime':
        [0, 4, 7, 12].forEach((n, i) => this.tone(midi(72 + n), t + i * 0.09, 0.9, 0.11, 'sine'));
        break;
      case 'fanfare':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(67 + n), t + i * 0.08, 0.8, 0.1, 'triangle'));
        break;
      case 'badge':
        [12, 16, 19, 24].forEach((n, i) => this.tone(midi(72 + n), t + i * 0.06, 0.5, 0.08, 'sine'));
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) this.tone(midi(84 + PENTA[(i * 3) % PENTA.length]), t + i * 0.045, 0.25, 0.05, 'sine');
        break;
      case 'pageTurn':
        this.noiseSweep(t, 0.35, 600, 3000, 0.18);
        break;
      case 'bookOpen':
        this.noiseSweep(t, 0.5, 400, 2200, 0.2);
        this.tone(midi(67), t + 0.25, 0.6, 0.07, 'sine');
        break;
      case 'whoosh':
      case 'swish':
        this.noiseSweep(t, id === 'whoosh' ? 0.7 : 0.4, 300, 2400, 0.2);
        break;
      case 'threadZip':
        this.noiseSweep(t, 0.25, 3000, 8000, 0.12);
        break;
      case 'fillPop':
        this.tone(440, t, 0.12, 0.16, 'sine', 880);
        break;
      case 'invite':
        this.tone(midi(79), t, 0.5, 0.08, 'sine');
        this.tone(midi(84), t + 0.12, 0.6, 0.06, 'sine');
        break;
    }
  }

  private tone(freq: number, t: number, dur: number, gain: number, type: OscillatorType, glideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private knock(t: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp).connect(g).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + 0.12);
  }

  private noiseSweep(t: number, dur: number, f0: number, f1: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /**
   * A soft, endless rain/breeze bed built from filtered noise (fallback for ambient files).
   * setLevel(v) uses the same 0…1 scale as the ambient files (0.8 = full bed).
   */
  ambientNoise(kind: 'rain' | 'breeze' | 'market', level = 0.8): { stop: () => void; setLevel: (v: number) => void } {
    if (!this.ctx || !this.out) return { stop: () => {}, setLevel: () => {} };
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'rain' ? 'highpass' : 'lowpass';
    f.frequency.value = kind === 'rain' ? 1200 : kind === 'breeze' ? 700 : 900;
    const base = (kind === 'rain' ? 0.12 : 0.07) / 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(base * level, ctx.currentTime + 0.8);
    src.connect(f).connect(g).connect(this.out);
    src.start();
    let lfo: OscillatorNode | null = null;
    if (kind !== 'rain') {
      lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.15;
      lg.gain.value = 300;
      lfo.connect(lg).connect(f.frequency);
      lfo.start();
    }
    return {
      stop: () => {
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
        src.stop(ctx.currentTime + 0.7);
        lfo?.stop(ctx.currentTime + 0.7);
      },
      setLevel: (v) => {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.3);
      },
    };
  }
}

function midi(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}
