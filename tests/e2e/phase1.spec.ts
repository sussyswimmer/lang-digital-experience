/**
 * Phase 1 end to end: the collage, a scene filling the screen and closing again (Esc, tap,
 * swipe down), the "Let's explore" gate and the convergence into Phase 2.
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
  // the intro narration plays with captions (the brief's words)
  await expect.poll(() => narrationLog(page)).toContain('p1.intro.1');
  expect(errors).toEqual([]);
});

test('a tapped scene fills the screen with its caption, and closes by Esc, tap or swipe down', async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;

  await expandScene(page, 'market');
  const box = (await page.locator('.p1-photo.is-expanded').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 2);
  expect(await narrationLog(page)).toContain('p1.tile.market');
  await page.keyboard.press('Escape');
  await expect(page.locator('.p1-expand')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-test=tile-market]')).toHaveClass(/is-seen/);

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

test('"Let\'s explore" appears after two scenes and in Vietnamese too', async ({ page }) => {
  await open(page);
  await expandScene(page, 'farmers');
  await page.keyboard.press('Escape');
  await expect(page.locator('.p1-expand')).toHaveCount(0, { timeout: 30_000 });
  await expandScene(page, 'aodai');
  await page.keyboard.press('Escape');
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
  // in test mode the intro narration runs 20× faster, so the button appears on its own
  await expect(explore).toBeVisible({ timeout: 60_000 });
  await explore.click({ force: true });
  await expect.poll(() => sfxLog(page)).toContain('whoosh');
  await expect.poll(() => state(page), { timeout: 150_000 }).toBe('p2');
  expect((await p1Progress(page)).done).toBe(true);
  expect(errors).toEqual([]);
});
