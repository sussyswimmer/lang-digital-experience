import { describe, expect, it } from 'vitest';
import ann from '../../content/phase3.json';
import { buildHats, hatAt, insideDry, insideHat, runoffTarget, type HatAnnotation } from '../../src/phases/phase3/hats';
import { RainSim } from '../../src/phases/phase3/rain/RainSim';

const I = ann.identity;
const W = 1000;
const H = Math.round((W * I.height) / I.width);
const hats = buildHats(I.hats as HatAnnotation[], W, H);

describe('Chapter 3 hat annotations', () => {
  it('has dozens of hats to count', () => {
    expect(hats.length).toBeGreaterThanOrEqual(40);
    expect(hats.length).toBeLessThanOrEqual(60);
  });

  it('every hat can be tapped at its badge spot, with a hit area of at least 64 px', () => {
    hats.forEach((h, i) => {
      expect(h.reach * 2).toBeGreaterThanOrEqual(64);
      expect(hatAt(hats, h.centre)).toBe(i);
    });
  });

  it('runs water to the brim tip on the side it landed (or the tip of an upside-down hat)', () => {
    for (const h of hats) {
      const left = runoffTarget(h, { x: h.c.x - h.dir.x * h.a * 0.5, y: h.c.y - h.dir.y * h.a * 0.5 });
      const right = runoffTarget(h, { x: h.c.x + h.dir.x * h.a * 0.5, y: h.c.y + h.dir.y * h.a * 0.5 });
      expect([h.l, h.apex]).toContainEqual(left);
      expect([h.r, h.apex]).toContainEqual(right);
    }
  });
});

describe('Chapter 3 rain (seeded)', () => {
  for (const seed of [1, 7, 42]) {
    it(`never lets a drop fall under a hat, and drops on hats drip off the brim (seed ${seed})`, () => {
      const drips: { hat: number; x: number; y: number }[] = [];
      const sim = new RainSim(W, H, hats, { seed, onDrip: (hat, tip) => drips.push({ hat, ...tip }) });
      sim.start(10);
      let maxDrops = 0;
      for (let f = 0; f < 60 * 13; f++) {
        sim.step(1 / 60);
        expect(sim.violations()).toBe(0);
        maxDrops = Math.max(maxDrops, sim.drops.length);
      }
      expect(sim.running).toBe(false);
      expect(sim.stats.spawned).toBeGreaterThan(2000);
      expect(maxDrops).toBeGreaterThan(200);
      expect(sim.stats.hits).toBeGreaterThan(200);
      expect(sim.stats.drips).toBeGreaterThan(100);
      // every drip leaves from a brim tip (or the tip of a hat hanging upside down)
      for (const d of drips) {
        const h = hats[d.hat];
        const at = [h.l, h.r, h.apex].some((p) => Math.hypot(p.x - d.x, p.y - d.y) < 1e-6);
        expect(at).toBe(true);
      }
    });
  }

  it('the shoppers under the hats stay dry: no live drop is ever inside a dry zone', () => {
    const sim = new RainSim(W, H, hats, { seed: 3 });
    sim.start(6);
    let wet = 0;
    let checked = 0;
    for (let f = 0; f < 60 * 7; f++) {
      sim.step(1 / 60);
      for (const d of sim.drops) {
        if (d.state === 'slide' || d.state === 'splash') continue;
        checked++;
        for (const h of hats) if (insideDry(h, d) || insideHat(h, d)) wet++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(wet).toBe(0);
  }, 20000);

  it('is reproducible for a given seed', () => {
    const run = () => {
      const sim = new RainSim(W, H, hats, { seed: 11 });
      sim.start(3);
      for (let f = 0; f < 120; f++) sim.step(1 / 60);
      return { ...sim.stats, n: sim.drops.length };
    };
    expect(run()).toEqual(run());
  });

  it('uses fewer, slower drops under reduced motion', () => {
    const full = new RainSim(W, H, hats, { seed: 5 });
    const calm = new RainSim(W, H, hats, { seed: 5, reduced: true });
    full.start(4);
    calm.start(4);
    for (let f = 0; f < 120; f++) {
      full.step(1 / 60);
      calm.step(1 / 60);
    }
    expect(calm.stats.spawned).toBeLessThan(full.stats.spawned * 0.3);
  });
});
