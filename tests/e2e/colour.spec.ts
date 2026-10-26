/**
 * Colour Your Nón Lá + "Tranh của con": page picker, one-tap fill, brush and eraser, undo/redo,
 * clear with confirm, save → gallery (view, download, hold-to-delete), drafts across a reload,
 * the session-only fallback without IndexedDB, and the Vietnamese labels.
 * Driven with real pointer input where it matters; window.__nonla.colour reads the paint layer.
 */
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

type Hooks = {
  ready(): boolean;
  pixel(x: number, y: number): number[];
  fillAt(x: number, y: number, hex: string): boolean;
  barrier(x: number, y: number): number | null;
  toScreen(x: number, y: number): { x: number; y: number };
  history(): { undo: boolean; redo: boolean; length: number };
  mismatch(): number;
  saveCount(): Promise<number>;
  persistent(): Promise<boolean>;
};

const PURPLE = [142, 91, 168, 255];
const SKY = [126, 200, 227, 255];
/** canvas px in the background outside the hat, on every page */
const CORNER = { x: 30, y: 30 };

function hook<K extends keyof Hooks>(page: Page, name: K, ...args: Parameters<Hooks[K]>) {
  return page.evaluate(
    ([n, a]) => (window as any).__nonla.colour[n as string](...(a as unknown[])),
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<Hooks[K]>>>;
}

const narrationLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.narrationLog?.() ?? []) as string[]);
const sfxLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.sfxLog?.() ?? []) as string[]);
const galleryCount = (page: Page) => page.evaluate(() => (window as any).__nonla?.gallery?.count?.() as number);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openPage(page: Page, id: 'plain' | 'strap' | 'poem' | 'market'): Promise<void> {
  await page.goto(`/?test=1&review=1#/play/colour/${id}`);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__nonla?.colour?.ready?.())), { timeout: 60_000 }).toBe(true);
}

async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  const p = await hook(page, 'toScreen', x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const a = await hook(page, 'toScreen', from.x, from.y);
  const b = await hook(page, 'toScreen', to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

/** the paint on screen catches up with the model once the spread animation ends */
async function settled(page: Page): Promise<void> {
  await expect.poll(() => hook(page, 'mismatch'), { timeout: 20_000 }).toBe(0);
}

test('the picker asks the brief’s question and opens a page', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&review=1#/play/colour');
  await expect(page.locator('[data-test=picker]')).toBeVisible();
  await expect(page.locator('.cp-question')).toHaveText('How would you paint your own Nón Lá?');
  await expect(page.locator('.cp-card')).toHaveCount(4);
  await expect.poll(() => narrationLog(page)).toContain('colour.question');
  await page.locator('[data-test=page-strap]').click();
  await expect(page).toHaveURL(/#\/play\/colour\/strap$/);
  await expect.poll(() => page.evaluate(() => (window as any).__nonla.colour.ready()), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => narrationLog(page)).toContain('colour.page.strap');
  expect(errors).toEqual([]);
});

test('one tap fills a shape; undo and redo; a line is never filled', async ({ page }) => {
  const errors = collectErrors(page);
  await openPage(page, 'poem');
  await page.locator('[data-test=swatch-purple]').click();
  await tapCanvas(page, CORNER.x, CORNER.y);
  expect(await hook(page, 'pixel', CORNER.x, CORNER.y)).toEqual(PURPLE);
  expect(await sfxLog(page)).toContain('fillPop');
  await settled(page);

  await page.locator('[data-test=undo]').click();
  expect((await hook(page, 'pixel', CORNER.x, CORNER.y))[3]).toBe(0);
  await page.locator('[data-test=redo]').click();
  expect(await hook(page, 'pixel', CORNER.x, CORNER.y)).toEqual(PURPLE);
  await settled(page);

  // find a line pixel along the middle row and try to fill it
  const onLine = await page.evaluate(() => {
    const c = (window as any).__nonla.colour;
    for (let x = 200; x < 1400; x++) if (c.barrier(x, 600) === 1) return x;
    return -1;
  });
  expect(onLine).toBeGreaterThan(0);
  const before = (await hook(page, 'history')).length;
  expect(await hook(page, 'fillAt', onLine, 600, '#D7263D')).toBe(false);
  expect((await hook(page, 'history')).length).toBe(before);
  expect(errors).toEqual([]);
});

test('the brush paints and the eraser rubs paint out', async ({ page }) => {
  await openPage(page, 'plain');
  await page.locator('[data-test=tool-brush]').click();
  await page.locator('[data-test=size-l]').click();
  await page.locator('[data-test=swatch-sky]').click();
  await drag(page, { x: 60, y: 1000 }, { x: 400, y: 1000 });
  expect(await hook(page, 'pixel', 230, 1000)).toEqual(SKY);
  await page.locator('[data-test=tool-eraser]').click();
  await drag(page, { x: 40, y: 1000 }, { x: 420, y: 1000 });
  expect((await hook(page, 'pixel', 230, 1000))[3]).toBe(0);
  expect((await hook(page, 'history')).length).toBe(2);
});

test('clear asks first, and is undoable', async ({ page }) => {
  await openPage(page, 'market');
  await hook(page, 'fillAt', CORNER.x, CORNER.y, '#8E5BA8');
  await page.locator('[data-test=clear]').click();
  await expect(page.locator('.cs-confirm')).toBeVisible();
  await expect.poll(() => narrationLog(page)).toContain('colour.clear.ask');
  await page.locator('[data-test=clear-no]').click();
  await expect(page.locator('.cs-confirm')).toBeHidden();
  expect(await hook(page, 'pixel', CORNER.x, CORNER.y)).toEqual(PURPLE);
  await page.locator('[data-test=clear]').click();
  await page.locator('[data-test=clear-yes]').click();
  expect((await hook(page, 'pixel', CORNER.x, CORNER.y))[3]).toBe(0);
  await page.locator('[data-test=undo]').click();
  expect(await hook(page, 'pixel', CORNER.x, CORNER.y)).toEqual(PURPLE);
});

test('save to Tranh của con, then view, download and hold-to-delete', async ({ page }) => {
  const errors = collectErrors(page);
  await openPage(page, 'poem');
  await hook(page, 'fillAt', CORNER.x, CORNER.y, '#8E5BA8');
  await page.locator('[data-test=save]').click({ force: true });
  await expect.poll(() => hook(page, 'saveCount'), { timeout: 20_000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__nonla.progress().games.colour.saved)).toBe(1);
  await expect.poll(() => narrationLog(page)).toContain('colour.saved');
  await expect(page.locator('[data-test=gallery] .cs-nav__count')).toHaveText('1');

  await page.locator('[data-test=gallery]').click();
  await expect(page.locator('.gl-tile')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('.gl-tile').click();
  await expect(page.locator('[data-test=view]')).toBeVisible();
  await expect(page.locator('.gl-view__name')).toHaveText('A nón bài thơ, the poem hat');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-test=view-download]').click()]);
  expect(download.suggestedFilename()).toMatch(/^tranh-cua-con-poem-.*\.png$/);

  const del = (await page.locator('[data-test=view-delete]').boundingBox())!;
  await page.mouse.move(del.x + del.width / 2, del.y + del.height / 2);
  // a short press only explains
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect.poll(() => narrationLog(page)).toContain('gallery.hold-more');
  expect(await galleryCount(page)).toBe(1);
  // holding deletes
  await page.mouse.down();
  await expect.poll(() => galleryCount(page), { timeout: 10_000 }).toBe(0);
  await page.mouse.up();
  await expect(page.locator('[data-test=empty]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the draft comes back after a reload', async ({ page }) => {
  await openPage(page, 'strap');
  await hook(page, 'fillAt', CORNER.x, CORNER.y, '#7EC8E3');
  // autosave runs a second after the last change
  await page.waitForTimeout(2500);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__nonla?.colour?.ready?.())), { timeout: 60_000 }).toBe(true);
  expect(await hook(page, 'pixel', CORNER.x, CORNER.y)).toEqual(SKY);
  // the picker shows the unfinished drawing
  await page.locator('[data-test=pages]').click();
  await expect(page.locator('[data-test=page-strap]')).toHaveClass(/has-draft/);
});

test('without IndexedDB the gallery is session-only and offers a download', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get: () => undefined });
  });
  await openPage(page, 'plain');
  expect(await hook(page, 'persistent')).toBe(false);
  await hook(page, 'fillAt', CORNER.x, CORNER.y, '#8E5BA8');
  await page.locator('[data-test=save]').click({ force: true });
  await expect(page.locator('[data-test=download]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#toasts')).toContainText('Download');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-test=download]').click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await page.locator('[data-test=gallery]').click();
  await expect(page.locator('[data-test=session-banner]')).toBeVisible();
  await expect(page.locator('.gl-tile')).toHaveCount(1);
});

test('Vietnamese labels, and the idle hand points at the page', async ({ page }) => {
  await openPage(page, 'plain');
  await page.locator('.lang-toggle [data-lang=vi]').click();
  await expect(page.locator('[data-test=tool-fill]')).toContainText('Đổ màu');
  await expect(page.locator('[data-test=save]')).toContainText('Lưu tranh');
  await expect(page.locator('.cs-straplabel')).toContainText('Màu quai nón');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  expect(await page.locator('#app').innerText()).not.toContain('⟦');
  // test mode shortens the 5 s idle wait to 0.5 s (after narration ends)
  await expect(page.locator('#hints .hand-hint')).toBeVisible({ timeout: 30_000 });
});
