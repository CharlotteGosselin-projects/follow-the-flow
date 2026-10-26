import { test, expect, openWith } from './fixtures.ts';
import { quiet } from '../fixtures/states.ts';

// Days holding several moods and a sleep marker must not shift or widen their column.
test('calendar stays aligned on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openWith(page, {
    ...quiet,
    moods: {
      '2026-10-01': ['happy'],
      '2026-10-02': ['happy', 'calm'],
      '2026-10-03': ['happy', 'calm', 'tired', 'sad'],
      '2026-10-06': ['irritable', 'anxious', 'sad'],
    },
    sleep: { '2026-10-03': 'insomnia' },
  });
  const cells = await page.locator('#calendar button.cell').evaluateAll((cs) =>
    cs.slice(0, 7).map((c) => ({
      width: Math.round(c.getBoundingClientRect().width),
      numberTop: Math.round(c.firstElementChild!.getBoundingClientRect().top - c.getBoundingClientRect().top),
    })),
  );
  expect(new Set(cells.map((c) => c.width)).size).toBe(1);
  expect(new Set(cells.map((c) => c.numberTop)).size).toBe(1);
  const overflow = await page.locator('#calendar').evaluate((g) => g.scrollWidth - g.clientWidth);
  expect(overflow).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
