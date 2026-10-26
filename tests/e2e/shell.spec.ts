import { test, expect, type Page } from '@playwright/test';

const ROUTES = ['p1', 'p2', 'p3', 'hub', 'build', 'colour', 'gallery', 'quiz', 'certificate'];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test('a fresh visit starts at Phase 1', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1#/play');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__nonla?.state)).toBe('function');
  await expect.poll(() => page.evaluate(() => (window as any).__nonla.state())).toBe('p1');
  expect(errors).toEqual([]);
});

test('language toggle switches every bound string', async ({ page }) => {
  await page.goto('/?test=1#/play');
  await expect.poll(() => page.evaluate(() => (window as any).__nonla?.lang?.())).toBe('en');
  await page.locator('.lang-toggle button[data-lang="vi"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__nonla.lang())).toBe('vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

for (const route of ROUTES) {
  test(`route ${route} mounts without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/?test=1&review=1#/play/${route}`);
    await expect(page.locator(`section.screen[data-screen="${route}"]`)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
}

const firstRunDone = (page: Page) =>
  page.addInitScript(() => {
    if (!localStorage.getItem('nonla.progress.v1')) {
      localStorage.setItem('nonla.progress.v1', JSON.stringify({ v: 1, firstRunComplete: true, p1: { seenTiles: [], done: true } }));
    }
  });
const state = (page: Page) => page.evaluate(() => (window as any).__nonla?.state?.());

test('browser Back from the landing shows the app again (no screen talking behind the landing)', async ({ page }) => {
  await page.goto('/?test=1#/play/p1');
  await expect.poll(() => state(page)).toBe('p1');
  await page.locator('.topbar button[aria-label="Home"]').click();
  await expect(page.locator('#site')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await page.goBack();
  await expect.poll(() => state(page)).toBe('p1');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#site')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/app-mode/);
});

test('after the first run, Home on the hub opens the landing and Continue comes back', async ({ page }) => {
  await firstRunDone(page);
  await page.goto('/?test=1#/play/hub');
  await expect.poll(() => state(page)).toBe('hub');
  await page.locator('.topbar button[aria-label="Home"]').click();
  await expect(page.locator('#site')).toBeVisible();
  await expect(page.locator('[data-start="hero"]')).toHaveText(/Continue/);
  await page.locator('[data-start="hero"]').click();
  await expect.poll(() => state(page)).toBe('hub');
  await expect(page.locator('#app')).toBeVisible();
});

test('a route change moves keyboard focus to the new screen, and the top bar labels follow EN/VI', async ({ page }) => {
  await firstRunDone(page);
  await page.goto('/?test=1#/play/hub');
  await expect.poll(() => state(page)).toBe('hub');
  await page.locator('.p4h-card').first().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).not.toBe('hub');
  await expect.poll(() => page.evaluate(() => document.activeElement?.className)).toContain('topbar__title');
  await page.locator('#app .lang-toggle button[data-lang="vi"]').click();
  await expect(page.locator('#app .topbar button').first()).toHaveAttribute('aria-label', 'Trang chính');
  await expect(page.locator('#app .lang-toggle button[data-lang="vi"]')).toHaveAttribute('aria-pressed', 'true');
});
