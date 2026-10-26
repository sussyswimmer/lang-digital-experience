/**
 * Phase 2 end to end: each layer's interaction on the real 3D hat (WebGL via SwiftShader in CI),
 * driven through the window.__nonla.p2 test hooks. Rendering on a CPU is slow, so timeouts are generous.
 */
import { expect, test, type Page } from '@playwright/test';

type Pt = { x: number; y: number };

test.describe.configure({ timeout: 240_000 });

async function open(page: Page, layer: string): Promise<void> {
  await page.goto(`/?test=1&review=1#/play/p2/${layer}`);
  await page.waitForFunction(() => (window as any).__nonla?.p2?.phase?.() === 'question', null, { timeout: 60_000 });
}

const hook = <T>(page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([n, a]) => (window as any).__nonla.p2[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

async function drag(page: Page, from: Pt, to: Pt, steps = 6): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test('layer 1: tracing row 3 lights the stitches, which float off and slide back on a tap', async ({ page }) => {
  await open(page, 'stitches');
  await expect(page.locator('.p2-question')).toContainText('What holds all these pieces tightly together?');
  const path = await hook<Pt[]>(page, 'tracePath');
  expect(path.length).toBeGreaterThan(20);
  await page.mouse.move(path[0].x, path[0].y);
  await page.mouse.down();
  for (let i = 0; i < path.length; i += 5) await page.mouse.move(path[i].x, path[i].y);
  await page.mouse.move(path[path.length - 1].x, path[path.length - 1].y);
  await page.mouse.up();
  await expect.poll(() => hook<boolean>(page, 'floating'), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.hat-label', { hasText: 'White thread sews the leaves' })).toBeVisible();
  await expect(page.locator('.hat-label', { hasText: 'Red thread + 2 bamboo wires make the brim strong' })).toBeVisible();
  // the insight sheet opens and narrates chunk by chunk
  await expect(page.locator('.screen.p2')).toHaveAttribute('data-phase', /insight|done/, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__nonla.narrationLog()), { timeout: 30_000 }).toContain('p2.l1.insight.1');
  // tap the floating stitches: they slide back onto the hat
  const p = await hook<Pt | null>(page, 'stitchesPoint');
  expect(p).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await expect.poll(() => hook<boolean>(page, 'floating'), { timeout: 30_000 }).toBe(false);
});

test('layer 2: three peels by hand, then the rest go whoosh', async ({ page }) => {
  await open(page, 'leaves');
  for (let k = 0; k < 3; k++) {
    const before = await hook<number>(page, 'peeled');
    const hint = await hook<{ points: Pt[] } | null>(page, 'hint');
    expect(hint).not.toBeNull();
    await drag(page, hint!.points[0], hint!.points[1]);
    await expect.poll(() => hook<number>(page, 'peeled'), { timeout: 30_000 }).toBeGreaterThan(before);
    await page.waitForTimeout(1200);
  }
  await expect.poll(() => hook<number>(page, 'peeled'), { timeout: 60_000 }).toBe(12);
  await expect(page.locator('.hat-label', { hasText: 'Mo (tree bark)' })).toBeAttached();
  await expect(page.locator('.screen.p2')).toHaveAttribute('data-phase', /insight|done/, { timeout: 30_000 });
});

test('layer 3: a tap on the skeleton counts all 16 rings', async ({ page }) => {
  await open(page, 'frame');
  const hint = await hook<{ points: Pt[] } | null>(page, 'hint');
  await page.mouse.click(hint!.points[0].x, hint!.points[0].y);
  await expect.poll(() => hook<number>(page, 'ringsShown'), { timeout: 60_000 }).toBe(16);
  await expect(page.locator('.p2-counter__n')).toHaveText('16');
  await expect(page.locator('.hat-label', { hasText: '40–50 cm across' })).toBeAttached({ timeout: 30_000 });
});

test('layer 4: everything flies back, the strap is centre stage and sways when tapped', async ({ page }) => {
  await open(page, 'strap');
  await expect.poll(() => hook<{ points: Pt[] } | null>(page, 'hint'), { timeout: 60_000 }).not.toBeNull();
  expect(await hook<number>(page, 'peeled')).toBe(0);
  const vp = page.viewportSize()!;
  const strap = (await hook<{ points: Pt[] }>(page, 'hint')).points[0];
  expect(Math.abs(strap.x - vp.width / 2)).toBeLessThan(vp.width * 0.2);
  await page.mouse.click(strap.x, strap.y);
  // a real sway: well past the few degrees it may still be settling by after dropping down
  await expect.poll(async () => Math.abs(await hook<number>(page, 'strapAngle')), { timeout: 30_000, intervals: [150] }).toBeGreaterThan(9);
  await expect(page.locator('.screen.p2')).toHaveAttribute('data-phase', /insight|done/, { timeout: 30_000 });
  await page.locator('.p2-swatch--green').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nonla.settings.v1') ?? '{}').strapColour)).toBe('green');
  await expect(page.locator('.p2-swatch--green')).toHaveAttribute('aria-checked', 'true');
});

test('Vietnamese: the question and panel follow the language toggle', async ({ page }) => {
  await open(page, 'stitches');
  await page.locator('.lang-toggle [data-lang="vi"]').click();
  await expect(page.locator('.p2-question')).toContainText('Điều gì giữ tất cả các mảnh này thật chặt với nhau?');
  await hook(page, 'finish');
  await expect(page.locator('.p2-panel__name')).toHaveText('Chỉ khâu', { timeout: 30_000 });
});

test('Next moves on to the following layer without reloading the hat', async ({ page }) => {
  await open(page, 'stitches');
  await hook(page, 'finish');
  const next = page.locator('[data-test="next"]');
  await expect(next).toBeVisible({ timeout: 30_000 });
  await next.click();
  await expect(page).toHaveURL(/#\/play\/p2\/leaves$/);
  await expect.poll(() => hook<string>(page, 'layer')).toBe('leaves');
});

test('"Show me" does the step for the child, also with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'stitches');
  await page.locator('[data-test="show-me"]').click();
  await expect.poll(() => hook<boolean>(page, 'floating'), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.screen.p2')).toHaveAttribute('data-phase', /insight|done/, { timeout: 30_000 });
});

test('without WebGL a layered drawing stands in and the layers still work', async ({ page }) => {
  await page.goto('/?test=1&review=1&no3d=1#/play/p2/frame');
  await page.waitForFunction(() => (window as any).__nonla?.p2?.phase?.() === 'question', null, { timeout: 30_000 });
  await expect(page.locator('.hat2d__notice')).toBeVisible();
  const hint = await hook<{ points: Pt[] }>(page, 'hint');
  await page.mouse.click(hint.points[0].x, hint.points[0].y);
  await expect.poll(() => hook<number>(page, 'ringsShown'), { timeout: 30_000 }).toBe(16);
});
