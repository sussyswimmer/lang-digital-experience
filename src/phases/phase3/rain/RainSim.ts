/**
 * Chapter 3 rain (pure and seeded, so it is unit-tested): drops fall all over the market photo.
 * A drop that lands on a hat becomes a bead that runs along the cone to the brim tip and drips
 * off; nothing ever enters the dry zone under a hat, so the shoppers stay dry.
 * Coordinates are photo pixels; the chapter draws `drops` onto a canvas every frame.
 */
import { insideDry, insideHat, runoffTarget, type Hat } from '../hats';
import { rng, type Pt } from '../geometry';

export type DropState = 'fall' | 'slide' | 'drip' | 'splash';

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: DropState;
  hat: number;
  /** slide target (brim tip) */
  tx: number;
  ty: number;
  speed: number;
  age: number;
  /** fall: y at which it lands (on the ground or a raincoat further away) */
  landY: number;
  dead: boolean;
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

export class RainSim {
  readonly drops: Drop[] = [];
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
    this.rate = opts.rate ?? (this.reduced ? 140 : 700);
    this.max = opts.max ?? (this.reduced ? 160 : 800);
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
    const maxSpeed = this.reduced ? 700 : 1400;
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
      const vy = this.reduced ? 450 + r() * 200 : 900 + r() * 400;
      this.drops.push({
        x,
        y,
        vx: -vy * 0.12,
        vy,
        state: 'fall',
        hat: -1,
        tx: 0,
        ty: 0,
        speed: 0,
        age: 0,
        landY: y + 90 + r() * 240,
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
        d.speed = Math.min(520, d.speed + 700 * dt);
        const dx = d.tx - d.x;
        const dy = d.ty - d.y;
        const len = Math.hypot(dx, dy);
        if (len <= d.speed * dt) this.drip(d);
        else {
          d.x += (dx / len) * d.speed * dt;
          d.y += (dy / len) * d.speed * dt;
        }
        break;
      }
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
        const t = runoffTarget(hat, p);
        d.state = 'slide';
        d.hat = i;
        d.tx = t.x;
        d.ty = t.y;
        d.speed = 40;
        this.stats.hits++;
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

  private drip(d: Drop): void {
    const hat = this.hats[d.hat];
    const tip = { x: d.tx, y: d.ty };
    const ox = tip.x - hat.c.x;
    const oy = tip.y - hat.c.y;
    const len = Math.hypot(ox, oy) || 1;
    const out = { x: ox / len, y: oy / len };
    d.state = 'drip';
    d.x = tip.x + out.x * 4;
    d.y = tip.y + out.y * 4 + 2;
    d.vx = out.x * 50;
    d.vy = 60;
    d.landY = d.y + 60 + this.random() * 120;
    this.stats.drips++;
    this.opts.onDrip?.(d.hat, tip);
    this.settle(d);
  }
}

function key(cx: number, cy: number): number {
  return (cx + 1000) * 4096 + (cy + 1000);
}
