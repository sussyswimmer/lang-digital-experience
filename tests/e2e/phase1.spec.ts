/**
 * Phase 1 end to end: the collage, a scene filling the screen and closing again (Esc, tap,
 * swipe down), the optional story, "Let's explore" (there from the start) and the convergence into Phase 2.
 * Tiles float (GSAP), so clicks use { force: true }; rendering on a CPU is slow, so waits are generous.
 */
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(180_000);

const tiles = (page: Page) => page.evaluate(() => ((window as any).__nonla?.p1?.tiles?.() ?? []) as string[]);
const narrationLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.narrationLog?.() ?? []) as string[]);
const sfxLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.sfxLog?.() ?? []) as string[]);
const state = (page: Page) => page.evaluate(() => (window as any).__nonla?.state?.() as string);
const p1Progress = (page: Page) => page.evaluate(() => (window as any).__nonla.progress().p1 as { seenTiles: string[]; done: boolean });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1&review=1#/play/p1');
  await page.waitForSelector('[data-test=tile-market]');
}

async function expandScene(page: Page, tile: string): Promise<void> {
  await page.click(`[data-test=tile-${tile}]`, { force: true });
  await page.waitForSelector('.p1-expand[data-ready]', { timeout: 30_000 });
}

test('shows the five everyday scenes as polaroids', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  expect(await tiles(page)).toEqual(['farmers', 'market', 'aodai', 'rain', 'craft']);
  await expect(page.locator('button.p1-tile')).toHaveCount(5);
  // nothing is compulsory: no voice starts on its own, and both choices are there at once
  await page.waitForTimeout(1500);
  expect(await narrationLog(page)).not.toContain('p1.intro.1');
  await expect(page.locator('[data-test=explore]')).toBeVisible();
  await expect(page.locator('[data-test=hear]')).toBeVisible();
  // no ticks: the photos are not a checklist
  await expect(page.locator('.p1-tile__seen')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"Hear the story" plays the intro only when asked, and a second tap stops it', async ({ page }) => {
  await open(page);
  const hear = page.locator('[data-test=hear]');
  await hear.click({ force: true });
  await expect.poll(() => narrationLog(page)).toContain('p1.intro.1');
  await expect(hear).toHaveAttribute('aria-pressed', 'true');
  await hear.click({ force: true });
  await expect(hear).toHaveAttribute('aria-pressed', 'false');
});

test('a tapped scene fills the screen with its caption, and closes by Esc, tap or swipe down', async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;

  await expandScene(page, 'market');
  const box = (await page.locator('.p1-photo.is-expanded').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 2);
  expect(await narrationLog(page)).toContain('p1.tile.market');
  // a modal: focus moves to Close and the tiles behind it can't be tabbed to
  await expect(page.locator('[data-test=close]')).toBeFocused();
  await expect(page.locator('.p1-collage')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.p1-expand')).toHaveCount(0, { timeout: 30_000 });
  // and back on the tile that was opened
  await expect(page.locator('[data-test=tile-market]')).toBeFocused();
  await expect(page.locator('.p1-collage')).toHaveJSProperty('inert', false);

  await expandScene(page, 'rain');
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect(page.locator('.p1-expand')).toHaveCount(0, { timeout: 30_000 });

  await expandScene(page, 'craft');
  await page.mouse.move(vp.width / 2, vp.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2, vp.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.p1-expand')).toHaveCount(0, { timeout: 30_000 });

  const p1 = await p1Progress(page);
  expect(p1.seenTiles).toEqual(expect.arrayContaining(['market', 'rain', 'craft']));
});

test('"Let\'s explore" is there from the start, and in Vietnamese too', async ({ page }) => {
  await open(page);
  const explore = page.locator('[data-test=explore]');
  await expect(explore).toBeVisible({ timeout: 30_000 });
  await expect(explore).toContainText("Let's explore");
  await page.locator('.lang-toggle button[data-lang="vi"]').first().click();
  await expect(explore).toContainText('Cùng khám phá nào!');
  await expect(page.locator('[data-test=tile-rain]')).toHaveAttribute('aria-label', /Lộp độp/);
});

test('"Let\'s explore" spirals the collage into the hat and moves on to Phase 2', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const explore = page.locator('[data-test=explore]');
  // no photo has to be opened first
  await expect(explore).toBeVisible({ timeout: 60_000 });
  await explore.click({ force: true });
  await expect.poll(() => sfxLog(page)).toContain('whoosh');
  await expect.poll(() => state(page), { timeout: 150_000 }).toBe('p2');
  expect((await p1Progress(page)).done).toBe(true);
  expect(errors).toEqual([]);
});

test('if the hat model never arrives, "Let\'s explore" lands on the drawn hat and still moves on', async ({ page }) => {
  // the model request never answers
  await page.route('**/models/nonla.glb', () => {});
  await open(page);
  const explore = page.locator('[data-test=explore]');
  await expect(explore).toBeVisible({ timeout: 60_000 });
  await explore.click({ force: true });
  await expect(page.locator('.p1-finale')).toBeAttached({ timeout: 60_000 });
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('p2');
  expect((await p1Progress(page)).done).toBe(true);
});
