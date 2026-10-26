import { test, expect, openWith, calendarDay, stored } from './fixtures.ts';
import { quiet } from '../fixtures/states.ts';

test('marking today starts a cycle and predicts the next one', async ({ page }) => {
  await openWith(page, quiet);
  await calendarDay(page, 20).click();
  await expect(page.locator('#summary .big')).toHaveText('Period · day 1');
  await expect(page.getByRole('button', { name: 'Unmark today' })).toBeVisible();
  await expect(page.locator('#summary')).toContainText('Using a default 28-day cycle');
  await expect(calendarDay(page, 20)).toHaveClass(/period/);
  expect((await stored(page)).data.days).toEqual(['2026-10-20']);
  await page.locator('#next').click();
  await expect(calendarDay(page, 17)).toHaveClass(/predicted/); // 20 Oct + 28 days
});

test('"Period started today" marks today once a cycle is known', async ({ page }) => {
  await openWith(page, { ...quiet, days: ['2026-09-22', '2026-09-23'] });
  await page.getByRole('button', { name: 'Period started today' }).click();
  await expect(page.locator('#summary .big')).toHaveText('Period · day 1');
  await expect(page.locator('#summary')).toContainText('Based on your last 1 cycle.');
});

test('marked days group into periods and give averages', async ({ page }) => {
  // Starts 5 Aug, 2 Sep, 30 Sep (28-day cycles), each 4 days with one forgotten day.
  const days = [
    '2026-08-05',
    '2026-08-06',
    '2026-08-08',
    '2026-09-02',
    '2026-09-03',
    '2026-09-05',
    '2026-09-30',
    '2026-10-01',
    '2026-10-03',
  ];
  await openWith(page, { ...quiet, days });
  await expect(page.locator('#summary')).toContainText('Avg. cycle28 days');
  await expect(page.locator('#summary')).toContainText('Avg. period4 days');
  await expect(page.locator('#summary .big')).toHaveText('8 days until next period');
  await expect(page.locator('#history tr')).toHaveCount(4);
  await expect(page.locator('#history tr').nth(1)).toContainText('Sep 30, 2026');
  // Ovulation 14 days before the 28 Oct prediction: 14 Oct; fertile window 9–15 Oct.
  await expect(calendarDay(page, 14)).toHaveClass(/ovulation/);
  await expect(calendarDay(page, 9)).toHaveClass(/fertile/);
  await expect(calendarDay(page, 16)).not.toHaveClass(/fertile/);
});

test('tapping a calendar day in period mode toggles it', async ({ page }) => {
  await openWith(page, quiet);
  await calendarDay(page, 12).click();
  await expect(calendarDay(page, 12)).toHaveClass(/period/);
  await calendarDay(page, 12).click();
  await expect(calendarDay(page, 12)).not.toHaveClass(/period/);
  expect((await stored(page)).data.days).toEqual([]);
});
