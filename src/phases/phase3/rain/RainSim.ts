/**
 * Chapter 3 rain (pure and seeded, so it is unit-tested): fine, fast drops fall all over the market
 * photo at a slight angle, each at its own depth (far drops are slower, thinner and fainter).
 * A drop that lands on a hat splashes, then runs as a bead straight down the cone to the brim and
 * along it to the brim's edge, hangs there for a moment and drips off. Nothing ever enters the dry
 * zone under a hat, so the shoppers stay dry.
 * Coordinates are photo pixels; the chapter draws `drops` onto a canvas every frame.
 */
import { insideDry, insideHat, runoffTarget, type Hat } from '../hats';
import { rng, type Pt } from '../geometry';

export type DropState = 'fall' | 'slide' | 'hang' | 'drip' | 'splash';

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: DropState;
  hat: number;
  /** depth, 0 (far) .. 1 (near): far drops fall slower and are drawn thinner and fainter */
  z: number;
  /** slide: where it hit the hat, the bend where it reaches the brim, and the target (brim tip) */
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  /** slide: progress along the run (0..1) and the run's length in px */
  t: number;
  plen: number;
  speed: number;
  /** hang: how long the bead swells on the brim's edge before it lets go */
  hangFor: number;
  age: number;
  /** fall: y at which it lands (on the ground or a raincoat further away) */
  landY: number;
  dead: boolean;
}

/**
 * Rain close to the camera: far above the crowd, so it touches nothing in the picture, but it is
 * what makes a photo of rain look like rain (fine, fast, faint streaks over the whole frame).
 * The drops that reach the hats and the ground are `drops`.
 */
export interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface RainOptions {
  seed?: number;
  reduced?: boolean;
  /** drops per second at full intensity */
  rate?: number;
  max?: number;
  onDrip?: (hat: number, tip: Pt) => void;
}

const CELL = 64;
const GRAVITY = 2200;
/** a bead on a hat: how fast a rivulet runs down the leaves (px/s, and px/s²) */
const RUN_MAX = 240;
const RUN_ACCEL = 520;
/** where a bead is along its run: a curve from the hit, down the slope to the brim, then to the tip */
export function runPoint(d: Pick<Drop, 'sx' | 'sy' | 'cx' | 'cy' | 'tx' | 'ty'>, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * d.sx + 2 * u * t * d.cx + t * t * d.tx,
    y: u * u * d.sy + 2 * u * t * d.cy + t * t * d.ty,
  };
}

export class RainSim {
  readonly drops: Drop[] = [];
  /** the near-camera veil: a fixed pool, of which `veilCount` are drawn (it follows the intensity) */
  readonly veil: Streak[] = [];
  veilCount = 0;
  running = false;
  /** 0..1, how wet the hats look (sheen) */
  wetness = 0;
  stats = { spawned: 0, hits: 0, drips: 0, culled: 0, landed: 0 };
  private time = 0;
  private duration = 0;
  private random: () => number;
  private grid = new Map<number, number[]>();
  private rate: number;
  private max: number;
  private reduced: boolean;
  private spawnAcc = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly hats: Hat[],
    private opts: RainOptions = {},
  ) {
    this.random = rng(opts.seed ?? 7);
    this.reduced = Boolean(opts.reduced);
    // real rain is dense: the rate follows the photo's area (a 650 × 430 photo gets ~2400 drops a
    // second), capped so a big screen stays smooth on a tablet
    const area = (width * height) / 1e6;
    const full = Math.min(3600, Math.max(900, 8500 * area));
    this.rate = opts.rate ?? (this.reduced ? full * 0.18 : full);
    this.max = opts.max ?? (this.reduced ? 260 : 1600);
    const veil = Math.round(Math.min(420, Math.max(90, 900 * area)) * (this.reduced ? 0.3 : 1));
    for (let i = 0; i < veil; i++) {
      const vy = this.reduced ? 700 + this.random() * 200 : 1500 + this.random() * 700;
      this.veil.push({ x: this.random() * (width + 80), y: this.random() * (height + 120) - 60, vx: -vy * 0.14, vy });
    }
    hats.forEach((h, i) => {
      const xs = [h.box.x0, h.box.x1, ...h.dry.map((p) => p.x)];
      const ys = [h.box.y0, h.box.y1, ...h.dry.map((p) => p.y)];
      for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) {
        for (let cy = Math.floor(Math.min(...ys) / CELL); cy <= Math.floor(Math.max(...ys) / CELL); cy++) {
          const k = key(cx, cy);
          const list = this.grid.get(k);
          if (list) list.push(i);
          else this.grid.set(k, [i]);
        }
      }
    });
  }

  start(seconds = 10): void {
    this.running = true;
    this.time = 0;
    this.duration = seconds;
  }

  stop(): void {
    this.running = false;
  }

  /** ramps up over 0.6 s and tapers over the last 2 s */
  get intensity(): number {
    if (!this.running) return 0;
    return Math.min(1, this.time / 0.6, (this.duration - this.time) / 2);
  }

  get busy(): boolean {
    return this.running || this.drops.length > 0;
  }

  step(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    if (this.running) {
      this.time += dt;
      this.spawnAcc += this.rate * this.intensity * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.drops.length < this.max) this.spawn();
      }
      if (this.time >= this.duration) this.running = false;
    }
    this.wetness = this.running ? Math.min(1, this.wetness + dt * 0.25) : Math.max(0, this.wetness - dt * 0.04);
    this.veilCount = Math.round(this.veil.length * this.intensity);
    for (const v of this.veil) {
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      if (v.y > this.height + 60) {
        v.y -= this.height + 120;
        v.x = this.random() * (this.width + 80);
      }
      if (v.x < -40) v.x += this.width + 80;
    }
    const maxSpeed = this.reduced ? 700 : 1500;
    const n = Math.max(1, Math.ceil((maxSpeed * dt) / 6));
    const h = dt / n;
    for (let s = 0; s < n; s++) for (const d of this.drops) this.update(d, h);
    let w = 0;
    for (const d of this.drops) if (!d.dead) this.drops[w++] = d;
    this.drops.length = w;
  }

  /** test helper: drops that are falling inside a hat or a dry zone (must always be 0) */
  violations(): number {
    let n = 0;
    for (const d of this.drops) {
      if (d.dead || (d.state !== 'fall' && d.state !== 'drip')) continue;
      const p = { x: d.x, y: d.y };
      if (this.hats.some((hat) => insideHat(hat, p) || insideDry(hat, p))) n++;
    }
    return n;
  }

  private spawn(): void {
    const r = this.random;
    for (let tries = 0; tries < 4; tries++) {
      const x = r() * this.width;
      const y = -30 + r() * (this.height * 0.95);
      if (this.blocked(x, y)) continue;
      const z = r();
      const vy = this.reduced ? 420 + z * 260 : 820 + z * 560 + r() * 120;
      this.drops.push({
        x,
        y,
        // a light wind: every streak leans the same way, a little
        vx: -vy * 0.14,
        vy,
        state: 'fall',
        hat: -1,
        z,
        sx: 0,
        sy: 0,
        cx: 0,
        cy: 0,
        tx: 0,
        ty: 0,
        t: 0,
        plen: 0,
        speed: 0,
        hangFor: 0,
        age: 0,
        // near drops travel further down the picture before they reach the ground
        landY: y + 80 + z * 140 + r() * 160,
        dead: false,
      });
      this.stats.spawned++;
      return;
    }
  }

  private blocked(x: number, y: number): boolean {
    const p = { x, y };
    for (const i of this.near(x, y)) if (insideHat(this.hats[i], p) || insideDry(this.hats[i], p)) return true;
    return false;
  }

  private near(x: number, y: number): number[] {
    return this.grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? [];
  }

  private update(d: Drop, dt: number): void {
    if (d.dead) return;
    d.age += dt;
    switch (d.state) {
      case 'fall':
      case 'drip':
        if (d.state === 'drip') d.vy += GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        this.settle(d);
        break;
      case 'slide': {
        d.speed = Math.min(RUN_MAX, d.speed + RUN_ACCEL * dt);
        d.t = Math.min(1, d.t + (d.speed * dt) / d.plen);
        const p = runPoint(d, d.t);
        d.x = p.x;
        d.y = p.y;
        if (d.t >= 1) this.hang(d);
        break;
      }
      case 'hang':
        if (d.age >= d.hangFor) this.drip(d);
        break;
      case 'splash':
        if (d.age > 0.3) d.dead = true;
        break;
    }
  }

  /** after a falling drop moves: onto a hat → slide; under a hat → gone; far enough → lands */
  private settle(d: Drop): void {
    const p = { x: d.x, y: d.y };
    const near = this.near(d.x, d.y);
    for (const i of near) {
      const hat = this.hats[i];
      if (insideHat(hat, p)) {
        this.hit(d, i, p);
        return;
      }
    }
    for (const i of near) {
      if (insideDry(this.hats[i], p)) {
        d.dead = true;
        this.stats.culled++;
        return;
      }
    }
    if (d.y > this.height + 20 || d.x < -40 || d.x > this.width + 40) {
      d.dead = true;
    } else if (d.y >= d.landY) {
      d.state = 'splash';
      d.age = 0;
      d.vx = 0;
      d.vy = 0;
      this.stats.landed++;
    }
  }

  /**
   * A drop lands on a hat: it runs straight down the slope (along the line from the apex through
   * where it hit) until it reaches the brim, then along the brim to the edge on that side.
   * A hat hanging upside-down on someone's back runs to its tip instead.
   */
  private hit(d: Drop, i: number, p: Pt): void {
    const hat = this.hats[i];
    const t = runoffTarget(hat, p);
    let bend = { x: (p.x + t.x) / 2, y: (p.y + t.y) / 2 };
    if (t !== hat.apex) {
      // where apex → p meets the brim's chord (p itself if it hit the brim, below the chord)
      const vx = p.x - hat.apex.x;
      const vy = p.y - hat.apex.y;
      const den = vx * hat.nrm.x + vy * hat.nrm.y;
      const below = (p.x - hat.c.x) * hat.nrm.x + (p.y - hat.c.y) * hat.nrm.y >= 0;
      if (below || den <= 1e-6) bend = { ...p };
      else {
        const s = ((hat.c.x - hat.apex.x) * hat.nrm.x + (hat.c.y - hat.apex.y) * hat.nrm.y) / den;
        const q = { x: hat.apex.x + vx * s, y: hat.apex.y + vy * s };
        const u = Math.max(-hat.a, Math.min(hat.a, (q.x - hat.c.x) * hat.dir.x + (q.y - hat.c.y) * hat.dir.y));
        bend = { x: hat.c.x + hat.dir.x * u, y: hat.c.y + hat.dir.y * u };
      }
    }
    d.state = 'slide';
    d.hat = i;
    d.sx = p.x;
    d.sy = p.y;
    d.cx = bend.x;
    d.cy = bend.y;
    d.tx = t.x;
    d.ty = t.y;
    d.t = 0;
    d.plen = Math.max(4, Math.hypot(bend.x - p.x, bend.y - p.y) + Math.hypot(t.x - bend.x, t.y - bend.y));
    d.speed = 30;
    d.age = 0;
    this.stats.hits++;
  }

  /** the bead reaches the brim's edge and swells there for a moment before it lets go */
  private hang(d: Drop): void {
    d.state = 'hang';
    d.x = d.tx;
    d.y = d.ty;
    d.age = 0;
    d.hangFor = this.reduced ? 0.2 : 0.08 + this.random() * 0.28;
  }

  private drip(d: Drop): void {
    const hat = this.hats[d.hat];
    const tip = { x: d.tx, y: d.ty };
    const ox = tip.x - hat.c.x;
    const oy = tip.y - hat.c.y;
    const len = Math.hypot(ox, oy) || 1;
    const out = { x: ox / len, y: oy / len };
    d.state = 'drip';
    d.age = 0;
    d.x = tip.x + out.x * 4;
    d.y = tip.y + out.y * 4 + 2;
    d.vx = out.x * 40;
    d.vy = 50;
    // a drip falls a short way before it reaches the ground (or the next hat down the street)
    d.landY = d.y + 24 + this.random() * 60;
    this.stats.drips++;
    this.opts.onDrip?.(d.hat, tip);
    this.settle(d);
  }
}

function key(cx: number, cy: number): number {
  return (cx + 1000) * 4096 + (cy + 1000);
}
