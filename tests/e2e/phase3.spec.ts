/**
 * Phase 3 end to end: the storybook cover, the three chapters (sun & shade, the poem hat in the
 * dark, rain and counting), first-run page locking and "Finish the story" → hub.
 * Driven through window.__nonla.p3; rendering on a CPU is slow, so waits are generous.
 */
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(180_000);

type Pt = { x: number; y: number };
const p3 = (page: Page) => ({
  chapter: () => page.evaluate(() => (window as any).__nonla.p3.chapter() as string),
  sunT: () => page.evaluate(() => (window as any).__nonla.p3.sunT() as number),
  shadowCoversFace: () => page.evaluate(() => (window as any).__nonla.p3.shadowCoversFace() as boolean),
  lit: () => page.evaluate(() => (window as any).__nonla.p3.lit() as boolean),
  raining: () => page.evaluate(() => (window as any).__nonla.p3.raining() as boolean),
  count: () => page.evaluate(() => (window as any).__nonla.p3.count() as number),
  hatCenters: () => page.evaluate(() => (window as any).__nonla.p3.hatCenters() as Pt[]),
});
const narrationLog = (page: Page) => page.evaluate(() => (window as any).__nonla.narrationLog() as string[]);
const sfxLog = (page: Page) => page.evaluate(() => (window as any).__nonla.sfxLog() as string[]);
const state = (page: Page) => page.evaluate(() => (window as any).__nonla.state() as string);
const chapters = (page: Page) => page.evaluate(() => (window as any).__nonla.progress().p3.chapters as Record<string, string>);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openBook(page: Page, query = '?test=1&review=1'): Promise<void> {
  await page.goto(`/${query}#/play/p3/protection`);
  await page.locator('.p3-cover:not([inert])').waitFor({ timeout: 60_000 });
  await page.locator('[data-test=cover]').click({ force: true });
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('protection');
}

/** drag the sun along the bottom of the sky band, from sunrise to sunset */
async function sweepSun(page: Page, check?: () => Promise<void>): Promise<void> {
  const sun = (await page.locator('[data-test=sun]').boundingBox())!;
  const pic = (await page.locator('.p3-sun').boundingBox())!;
  await page.mouse.move(sun.x + sun.width / 2, sun.y + sun.height / 2);
  await page.mouse.down();
  for (let i = 0; i <= 12; i++) {
    await page.mouse.move(pic.x + pic.width * (0.04 + 0.92 * (i / 12)), pic.y + pic.height * 0.21, { steps: 2 });
    await check?.();
  }
  await page.mouse.up();
}

test('the cover opens into chapter 1, where the shade always covers the farmer’s face', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&review=1#/play/p3/protection');
  await expect(page.locator('.p3-book')).toBeVisible();
  await expect(page.locator('.p3-book__title')).toHaveText('Stories of the Nón Lá');
  await page.locator('.p3-cover:not([inert])').waitFor({ timeout: 60_000 });
  await page.locator('[data-test=cover]').click({ force: true });
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('protection');
  expect(await sfxLog(page)).toContain('bookOpen');
  await expect.poll(() => narrationLog(page)).toContain('p3.ch1.story');

  const seen: number[] = [];
  await sweepSun(page, async () => {
    expect(await p3(page).shadowCoversFace()).toBe(true);
    seen.push(await p3(page).sunT());
  });
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.6);
  await expect(page.locator('[data-test=next]')).toHaveClass(/is-ready/);
  await page.locator('[data-test=next]').click({ force: true });
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('heritage');
  expect((await chapters(page)).protection).toBe('done');
  expect(errors).toEqual([]);
});

test('chapter 2: tapping the poem hat turns everything dark but the glowing poem, and back', async ({ page }) => {
  await page.goto('/?test=1&review=1#/play/p3/heritage');
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('heritage');
  await page.locator('[data-test=poem-hat]').click({ force: true });
  await expect.poll(() => p3(page).lit()).toBe(true);
  await expect(page.locator('section.screen.p3')).toHaveClass(/p3--dark/);
  // after the 1.5 s fade the page and the photo are black, and the glow layer is showing
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.p3-page[data-chapter=heritage]')!).backgroundColor), { timeout: 15_000 })
    .toBe('rgb(5, 4, 3)');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.p3-poem__base')!).filter), { timeout: 15_000 }).toBe('brightness(0)');
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.querySelector('.p3-poem__glow')!).opacity)), { timeout: 15_000 }).toBe(1);
  await expect.poll(() => narrationLog(page), { timeout: 15_000 }).toContain('p3.ch2.done');
  await page.locator('[data-test=poem-hat]').click({ force: true });
  await expect.poll(() => p3(page).lit()).toBe(false);
  await expect(page.locator('section.screen.p3')).not.toHaveClass(/p3--dark/);
});

test('chapter 3: rain runs off the hats, then the family counts them', async ({ page }) => {
  await page.goto('/?test=1&review=1#/play/p3/identity');
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('identity');
  await page.locator('[data-test=rain]').click({ force: true });
  await expect.poll(() => p3(page).raining()).toBe(true);
  await expect(page.locator('.p3-rain')).toHaveClass(/is-raining/);
  await expect.poll(() => p3(page).raining(), { timeout: 60_000 }).toBe(false);
  await expect(page.locator('.p3-rain__count')).toHaveClass(/is-on/, { timeout: 30_000 });

  const hats = await p3(page).hatCenters();
  expect(hats.length).toBeGreaterThanOrEqual(40);
  for (const i of [0, 10, 20]) await page.mouse.click(hats[i].x, hats[i].y);
  await expect.poll(() => p3(page).count()).toBe(3);
  // tapping a counted hat again doesn't count it twice
  await page.mouse.click(hats[10].x, hats[10].y);
  expect(await p3(page).count()).toBe(3);
  await expect(page.locator('.p3-badge')).toHaveCount(3);
  await expect(page.locator('.p3-badge', { hasText: '3' })).toBeVisible();
  expect(await narrationLog(page)).toContain('num.3');

  await page.locator('[data-test=count-done]').click({ force: true });
  await expect(page.locator('[data-test=count-result]')).toHaveText('We counted 3 hats!');
  await page.locator('.lang-toggle button[data-lang="vi"]').first().click();
  await expect(page.locator('[data-test=count-result]')).toHaveText('Chúng ta đếm được 3 chiếc nón!');
  await page.locator('[data-test=count-again]').click({ force: true });
  await expect(page.locator('.p3-badge')).toHaveCount(0);

  await page.locator('[data-test=finish]').click({ force: true });
  await expect.poll(() => state(page), { timeout: 30_000 }).toBe('hub');
});

test('swiping the page turns to the next chapter', async ({ page }) => {
  await page.goto('/?test=1&review=1#/play/p3/heritage');
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('heritage');
  const side = (await page.locator('.p3-page[data-chapter=heritage] .p3-page__side').boundingBox())!;
  await page.mouse.move(side.x + side.width * 0.8, side.y + side.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(side.x + side.width * 0.1, side.y + side.height * 0.62, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('identity');
});

test('on the first run a chapter must be done before the next page opens', async ({ page }) => {
  // Phase 1 and 2 finished, the storybook not started yet
  await page.addInitScript(() => {
    const p = {
      v: 1,
      firstRunComplete: false,
      p1: { seenTiles: [], done: true },
      p2: { layers: { stitches: 'done', leaves: 'done', frame: 'done', strap: 'done' } },
      p3: { chapters: { protection: 'active', heritage: 'locked', identity: 'locked' } },
      games: { build: { completed: 0 }, colour: { saved: 0 }, quiz: { best: 0, badges: [] } },
    };
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('nonla.progress.v1', JSON.stringify(p));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openBook(page, '?test=1');
  // coming from Phase 2: the transition line was narrated
  expect(await narrationLog(page)).toContain('p3.transition');
  const next = page.locator('[data-test=next]');
  await expect(next).toHaveClass(/is-locked/);
  await next.click({ force: true });
  await expect.poll(() => narrationLog(page)).toContain('p3.locked');
  expect(await p3(page).chapter()).toBe('protection');
  await expect(page.locator('[data-test=dot-identity]')).toHaveClass(/is-locked/);

  await sweepSun(page);
  await expect(next).toHaveClass(/is-ready/);
  await next.click({ force: true });
  await expect.poll(() => p3(page).chapter(), { timeout: 30_000 }).toBe('heritage');
  expect(await chapters(page)).toMatchObject({ protection: 'done', heritage: 'active', identity: 'locked' });
});
