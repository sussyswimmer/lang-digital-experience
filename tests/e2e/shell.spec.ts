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
