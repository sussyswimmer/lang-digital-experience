/**
 * The website wrapper: hero, the scroll-scrubbed intro (frames + caption beats), reduced-motion
 * stills, EN/VI, touch-target sizes, and Start → Phase 1 (and back: Start becomes Continue).
 */
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

/** window.__nonla.landing.<name>() */
const hook = <T = number>(page: Page, name: 'frameIndex' | 'beat' | 'progress' | 'mode' | 'readLog') =>
  page.evaluate((n) => (window as any).__nonla.landing[n](), name) as Promise<T>;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1#/');
  await expect(page.locator('h1.hero__title')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__nonla?.landing?.frameIndex)).toBe('function');
}

/** Scroll so the story is at `p` (0..1) of its pinned range. */
async function scrollStory(page: Page, p: number): Promise<void> {
  await page.evaluate((p) => {
    const s = document.querySelector<HTMLElement>('#story')!;
    window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p);
  }, p);
}

test('hero shows the title, tagline, a big Start button and the photo', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('h1.hero__title')).toHaveText('Explore the Nón Lá');
  const start = page.locator('[data-start="hero"]');
  await expect(start).toHaveText(/Start/);
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(88);
  const img = page.locator('.hero__photo');
  await expect(img).toHaveAttribute('loading', 'eager');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('scrolling scrubs the intro frames and syncs the four caption beats', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  expect(await hook<string>(page, 'mode')).toBe('scroll');
  await scrollStory(page, 0);
  await expect.poll(() => hook(page, 'frameIndex'), { timeout: 30_000 }).toBe(0);
  await expect(page.locator('.story-beat.is-on')).toHaveText(/A hat made of leaves/);

  await scrollStory(page, 0.42);
  await expect.poll(() => hook(page, 'beat')).toBe(1);
  await expect.poll(() => hook(page, 'frameIndex')).toBeGreaterThan(10);
  await expect(page.locator('.story-beat.is-on')).toHaveText(/16 bamboo rings/);

  await scrollStory(page, 0.7);
  await expect.poll(() => hook(page, 'beat')).toBe(2);
  await expect(page.locator('.story-beat.is-on')).toHaveText(/stitched by hand/);

  await scrollStory(page, 1);
  await expect.poll(() => hook(page, 'beat')).toBe(3);
  const last = await hook(page, 'frameIndex');
  await expect(page.locator('.story-beat.is-on')).toHaveText(/Ready to explore\?/);
  await expect(page.locator('.story-beat.is-on [data-start="story"]')).toBeVisible();

  // and back up again
  await scrollStory(page, 0.1);
  await expect.poll(() => hook(page, 'frameIndex')).toBeLessThan(last);
  await expect.poll(() => hook(page, 'beat')).toBe(0);
  expect(errors).toEqual([]);
});

/** Wait until a smooth scroll has come to rest. */
async function settle(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => scrollY);
      const still = y === last;
      last = y;
      return still;
    }, { intervals: [300] })
    .toBe(true);
}

test('the progress rail jumps to a beat and Listen reads it', async ({ page }) => {
  await open(page);
  await scrollStory(page, 0);
  await page.locator('.story__dot[data-beat="2"]').click();
  await settle(page);
  await expect.poll(() => hook(page, 'beat'), { timeout: 15_000 }).toBe(2);
  // dispatch, not click: Playwright's scroll-into-view would move the pinned story to another beat
  await page.locator('.story-beat.is-on .listen').dispatchEvent('click');
  await expect.poll(() => hook<string[]>(page, 'readLog')).toContain('site.story.3');
});

test('Vietnamese: the toggle switches the hero and the story captions', async ({ page }) => {
  await open(page);
  await page.locator('.site-bar .lang-toggle button[data-lang="vi"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('h1.hero__title')).toHaveText('Khám phá Nón Lá');
  await expect(page.locator('[data-start="hero"]')).toHaveText(/Bắt đầu/);
  await scrollStory(page, 0.42);
  await expect(page.locator('.story-beat.is-on')).toHaveText(/16 vòng tre/);
  await page.locator('.site-bar .lang-toggle button[data-lang="en"]').click();
  await expect(page.locator('.story-beat.is-on')).toHaveText(/16 bamboo rings/);
});

test('reduced motion: no scroll-scrubbing, four stills that crossfade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect.poll(() => hook<string>(page, 'mode')).toBe('stills');
  const h = await page.locator('#story').evaluate((s: HTMLElement) => s.offsetHeight / innerHeight);
  expect(h).toBeLessThanOrEqual(1.05);
  await page.locator('#story').scrollIntoViewIfNeeded();
  await expect(page.locator('.story__still')).toHaveCount(4);
  await page.locator('.story__dot[data-beat="1"]').click();
  await expect.poll(() => hook(page, 'beat')).toBe(1);
  await expect(page.locator('.story__still.is-on')).toHaveCount(1);
  await expect(page.locator('.story-beat.is-on')).toHaveText(/16 bamboo rings/);
});

test('every touch target on the page is at least 64 × 64 px', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#site [data-touch]')]
      .map((e) => ({ e: e.outerHTML.slice(0, 60), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 64 || r.height < 64))
      .map(({ e }) => e),
  );
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('Start enters Phase 1; coming back offers Continue', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.locator('[data-start="hero"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__nonla?.state?.()), { timeout: 30_000 }).toBe('p1');
  await expect(page.locator('#site')).toBeHidden();
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('#site')).toBeVisible();
  await expect(page.locator('[data-start="hero"]')).toHaveText(/Continue/);
  // the scroll story still scrubs after the hand-back
  await scrollStory(page, 0.42);
  await expect.poll(() => hook(page, 'beat')).toBe(1);
  expect(errors).toEqual([]);
});

test('phone, Vietnamese: the scroll cue fits the screen and the sticky Start pill stays on one line', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('nonla.settings.v1', JSON.stringify({ lang: 'vi' })));
  const page = await context.newPage();
  await page.goto('/?test=1#/');
  const cue = await page.locator('.hero__scroll').boundingBox();
  expect(cue!.x).toBeGreaterThanOrEqual(0);
  expect(cue!.x + cue!.width).toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo(0, innerHeight * 1.2));
  const label = page.locator('.site-bar [data-start="bar"] span:not(.site-start__icon)');
  await expect(label).toHaveText('Bắt đầu');
  expect((await label.boundingBox())!.height).toBeLessThan(40);
  await context.close();
});
