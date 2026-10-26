/**
 * Phase 4 end to end: the Activity Hub (cards, revisit pickers, badge shelf), "Build Your Nón Lá"
 * (drag and tap-to-place, hints, glow after two misses, the finished hat and its badge) and the
 * Memory Quiz (first-try badges, wrong-answer flow, certificate with PNG and PDF downloads).
 * Driven through the real UI; window.__nonla.{hub,build,quiz,cert} report state.
 */
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

const PIECES = ['frame', 'leaf-inner', 'poem-art', 'leaf-outer', 'stitches', 'strap'];

const build = (page: Page) => ({
  placed: () => page.evaluate(() => (window as any).__nonla.build.placed() as string[]),
  order: () => page.evaluate(() => (window as any).__nonla.build.order() as string[]),
  glowing: () => page.evaluate(() => (window as any).__nonla.build.glowing() as string[]),
  finished: () => page.evaluate(() => (window as any).__nonla.build.finished() as boolean),
});
const quiz = (page: Page) => ({
  current: () => page.evaluate(() => (window as any).__nonla.quiz.current() as number),
  badges: () => page.evaluate(() => (window as any).__nonla.quiz.badges() as string[]),
});
const narrationLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.narrationLog?.() ?? []) as string[]);
const sfxLog = (page: Page) => page.evaluate(() => ((window as any).__nonla?.sfxLog?.() ?? []) as string[]);
const state = (page: Page) => page.evaluate(() => (window as any).__nonla?.state?.() as string);
const games = (page: Page) => page.evaluate(() => (window as any).__nonla.progress().games);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** press on a tray piece, move across to the hat in small steps, let go */
async function dragPiece(page: Page, piece: string, to: 'hat' | 'away' = 'hat'): Promise<void> {
  const a = (await page.locator(`[data-test=piece-${piece}]`).boundingBox())!;
  const b = (await page.locator('[data-test=workbench]').boundingBox())!;
  const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  // 'away': a short drag that stays over the tray, far from the hat
  const end = to === 'hat' ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: from.x, y: from.y - 36 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((end.x - from.x) * i) / 10, from.y + ((end.y - from.y) * i) / 10);
  await page.mouse.up();
}

test.describe('Activity Hub', () => {
  test('three activity cards, revisit pickers and the badge shelf', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?test=1&review=1#/play/hub');
    for (const id of ['build', 'colour', 'quiz']) await expect(page.locator(`[data-test=card-${id}]`)).toBeVisible();
    await expect(page.locator('[data-test=card-build]')).toContainText('Build Your Nón Lá');
    await expect.poll(() => narrationLog(page)).toContain('hub.intro');
    await expect(page.locator('.p4h-badge')).toHaveCount(6);
    await expect(page.locator('[data-test=certificate]')).toHaveCount(0);

    // every touch target is at least 64 px
    const small = await page.$$eval('.p4-hub [data-touch]', (els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 63.5 || r.height < 63.5)).length,
    );
    expect(small).toBe(0);

    // Phase 2 with a layer picker
    await page.locator('[data-test=revisit-p2]').click();
    await expect(page.locator('.p4h-picker')).toBeVisible();
    await expect(page.locator('[data-test^=layer-]')).toHaveCount(4);
    await page.locator('[data-test=picker-close]').click();
    await expect(page.locator('.p4h-picker')).toBeHidden();

    // Phase 3 with a chapter picker → the chosen chapter
    await page.locator('[data-test=revisit-p3]').click();
    await page.locator('[data-test=chapter-identity]').click();
    await expect.poll(() => state(page)).toBe('p3');
    expect(await page.evaluate(() => location.hash)).toBe('#/play/p3/identity');
    expect(errors).toEqual([]);
  });

  test('cards open the activities; the shelf shows earned badges and the certificate', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'nonla.progress.v1',
        JSON.stringify({
          v: 1,
          firstRunComplete: true,
          p1: { seenTiles: [], done: true },
          p2: { layers: { stitches: 'done', leaves: 'done', frame: 'done', strap: 'done' } },
          p3: { chapters: { protection: 'done', heritage: 'done', identity: 'done' } },
          games: { build: { completed: 1 }, colour: { saved: 2 }, quiz: { best: 2, badges: ['q1', 'q4'], certificateAt: '2026-10-26T06:00:00Z' } },
        }),
      );
    });
    await page.goto('/?test=1#/play/hub');
    await expect(page.locator('[data-test=badge-q1][data-earned=true]')).toBeVisible();
    await expect(page.locator('[data-test=badge-maker][data-earned=true]')).toBeVisible();
    await expect(page.locator('[data-test=badge-q2][data-earned=false]')).toBeVisible();
    await expect(page.locator('[data-test=gallery] .p4h-count')).toHaveText('2');
    await page.locator('[data-test=certificate]').click();
    await expect.poll(() => state(page)).toBe('certificate');
    await page.goBack();
    await page.locator('[data-test=card-build]').click();
    await expect.poll(() => state(page)).toBe('build');
  });

  test('switches to Vietnamese', async ({ page }) => {
    await page.goto('/?test=1&review=1#/play/hub');
    await page.locator('[data-lang=vi]').click();
    await expect(page.locator('[data-test=card-build]')).toContainText('Làm chiếc nón lá của con');
    await expect(page.locator('[data-test=revisit-p1]')).toContainText('Ảnh');
  });
});

test.describe('Build Your Nón Lá', () => {
  test('a wrong piece floats back with a hint; two misses make the right piece glow', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?test=1&review=1#/play/build');
    await expect(page.locator('[data-test=piece-frame]')).toBeVisible();
    expect(await build(page).order()).toEqual(PIECES);

    await dragPiece(page, 'leaf-outer');
    await expect(page.locator('[data-test=hint]')).toHaveText('The leaves need something to sit on first!');
    expect(await build(page).placed()).toEqual([]);
    await expect(page.locator('[data-test=piece-leaf-outer]')).toBeEnabled();
    await expect.poll(() => sfxLog(page)).toContain('floatBack');
    expect(await narrationLog(page)).toContain('build.hint.leaves-first');
    expect(await build(page).glowing()).toEqual([]);

    await dragPiece(page, 'strap');
    await expect(page.locator('[data-test=hint]')).toHaveText('The strap is tied on last, when the hat is finished!');
    await expect.poll(() => build(page).glowing()).toEqual(['frame']);

    // dropping off the hat is not a miss
    await dragPiece(page, 'frame', 'away');
    expect(await build(page).placed()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('builds the whole hat (drag and tap-to-place) and earns the Little Hat Maker badge', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?test=1&review=1#/play/build');
    await expect(page.locator('[data-test=piece-frame]')).toBeVisible();
    for (const [i, piece] of PIECES.entries()) {
      if (i % 2) {
        await page.locator(`[data-test=piece-${piece}]`).click();
        await expect(page.locator(`[data-test=piece-${piece}]`)).toHaveAttribute('aria-pressed', 'true');
        await page.locator('[data-test=workbench]').click();
      } else {
        await dragPiece(page, piece);
      }
      await expect.poll(() => build(page).placed()).toEqual(PIECES.slice(0, i + 1));
      await expect(page.locator(`[data-test=piece-${piece}]`)).toBeDisabled();
    }
    await expect.poll(() => build(page).finished()).toBe(true);
    await expect(page.locator('[data-test=badge-name]')).toHaveText('Little Hat Maker');
    expect((await games(page)).build.completed).toBe(1);
    expect((await sfxLog(page)).filter((s) => s === 'snap')).toHaveLength(6);
    await expect.poll(() => narrationLog(page)).toContain('build.badge.earned');

    await page.locator('[data-test=again]').click();
    expect(await build(page).placed()).toEqual([]);
    await expect(page.locator('[data-test=piece-frame]')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});

test.describe('Nón Lá Memory Quiz', () => {
  test('a badge for each correct first try, a gentle wrong answer, then the certificate and its downloads', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?test=1&review=1#/play/quiz');
    await expect(page.locator('[data-test=answer-0]')).toBeVisible();
    await expect(page.locator('.p4q-prompt')).toContainText('A strong wind blows');
    await expect.poll(() => narrationLog(page)).toContain('quiz.q1.prompt');

    // Q1 wrong (the sewing thread): no badge, the chin strap lights up
    await page.locator('[data-test=answer-0]').click();
    await expect(page.locator('[data-test=answer-2]')).toHaveClass(/is-correct/);
    await expect(page.locator('[data-test=answer-0]')).toHaveClass(/is-wrong/);
    expect(await quiz(page).badges()).toEqual([]);
    await expect.poll(() => narrationLog(page)).toContain('quiz.q1.explain');
    // a second tap doesn't count
    await page.locator('[data-test=answer-2]').click({ force: true });
    expect(await quiz(page).badges()).toEqual([]);
    await page.locator('[data-test=next]').click();

    // Q2–Q5 right
    const right = [0, 0, 1, 0];
    for (const [k, i] of right.entries()) {
      await expect.poll(() => quiz(page).current()).toBe(k + 1);
      await page.locator(`[data-test=answer-${i}]`).click();
      await expect(page.locator(`[data-test=answer-${i}]`)).toHaveClass(/is-correct/);
      await page.locator('[data-test=next]').click();
    }

    await expect.poll(() => state(page)).toBe('certificate');
    await expect.poll(() => page.evaluate(() => (window as any).__nonla.cert?.ready?.())).toBe(true);
    const g = await games(page);
    expect(g.quiz.badges).toEqual(['q2', 'q3', 'q4', 'q5']);
    expect(g.quiz.best).toBe(4);
    expect(g.quiz.certificateAt).toBeTruthy();
    await expect.poll(() => narrationLog(page)).toContain('cert.earned.4');

    await page.locator('[data-test=name]').fill('Lan');
    const [png] = await Promise.all([page.waitForEvent('download'), page.locator('[data-test=save-png]').click()]);
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('[data-test=save-pdf]').click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await page.evaluate(() => localStorage.getItem('nonla.cert.name'))).toBe('"Lan"');

    // print shows only the certificate picture
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#p4c-print')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('every answer has a picture and the quiz speaks Vietnamese', async ({ page }) => {
    await page.goto('/?test=1&review=1#/play/quiz');
    await page.locator('[data-lang=vi]').click();
    await expect(page.locator('.p4q-prompt')).toContainText('Một cơn gió mạnh');
    await expect(page.locator('.p4q-card__pic svg, .p4q-card__pic img')).toHaveCount(3);
    await expect(page.locator('[data-test=answer-2]')).toContainText('Quai nón');
  });
});
