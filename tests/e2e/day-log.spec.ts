import { test, expect, openWith, calendarDay, stored } from './fixtures.ts';
import { quiet } from '../fixtures/states.ts';

test('several moods can be picked for today', async ({ page }) => {
  await openWith(page, quiet);
  const today = page.locator('#mood-today');
  await today.getByRole('button', { name: /Happy/ }).click();
  await today.getByRole('button', { name: /Tired/ }).click();
  await expect(today.getByRole('button', { name: /Happy/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(today.getByRole('button', { name: /Tired/ })).toHaveAttribute('aria-pressed', 'true');
  await today.getByRole('button', { name: /Happy/ }).click();
  expect((await stored(page)).data.moods).toEqual({ '2026-10-20': ['tired'] });
});

test('a past day is logged from the calendar dialog, then cleared', async ({ page }) => {
  await openWith(page, quiet);
  await page.locator('#mode-mood').click();
  await calendarDay(page, 15).click();
  const dialog = page.locator('#mood-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#mood-dialog-options').getByRole('button', { name: /Calm/ }).click();
  await dialog
    .locator('#mood-dialog-options')
    .getByRole('button', { name: /Anxious/ })
    .click();
  await dialog
    .locator('#sleep-dialog-options')
    .getByRole('button', { name: /Insomnia/ })
    .click();
  await dialog
    .locator('#habit-dialog-options')
    .getByRole('button', { name: /Alcohol/ })
    .click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(calendarDay(page, 15)).toHaveClass(/sleep-insomnia/);
  await expect(calendarDay(page, 15).locator('.mood-mark')).toHaveText('😌😰');
  const data = (await stored(page)).data;
  expect(data.moods['2026-10-15']).toEqual(['calm', 'anxious']);
  expect(data.sleep['2026-10-15']).toBe('insomnia');
  expect(data.habits['2026-10-15']).toEqual({ alcohol: 1 });

  await calendarDay(page, 15).click();
  await dialog.getByRole('button', { name: 'Clear all' }).click();
  await expect(calendarDay(page, 15).locator('.mood-mark')).toHaveCount(0);
  const cleared = (await stored(page)).data;
  expect(cleared.moods).toEqual({});
  expect(cleared.sleep).toEqual({});
  expect(cleared.habits).toEqual({});
});

test('future days cannot be logged', async ({ page }) => {
  await openWith(page, quiet);
  await page.locator('#mode-mood').click();
  page.once('dialog', (d) => d.accept());
  await calendarDay(page, 25).click();
  await expect(page.locator('#mood-dialog')).toBeHidden();
});

test('habit levels step up on each tap, and "None of these" logs an empty day', async ({ page }) => {
  await openWith(page, quiet);
  const habits = page.locator('#habit-today');
  const coffee = habits.getByRole('button', { name: /Caffeine/ });
  for (let i = 0; i < 3; i++) await coffee.click();
  await expect(coffee).toHaveText(/3 cups/);
  expect((await stored(page)).data.habits['2026-10-20']).toEqual({ caffeine: 3 });
  for (let i = 0; i < 3; i++) await coffee.click(); // 4, 5+, then off
  await expect(coffee).toHaveAttribute('aria-pressed', 'false');
  await habits.getByRole('button', { name: /None of these/ }).click();
  expect((await stored(page)).data.habits['2026-10-20']).toEqual({});
});

test('a custom habit can be added and logged', async ({ page }) => {
  await openWith(page, quiet);
  await page.getByText('Choose habits').click();
  await page.locator('#habit-emoji').fill('🧘');
  await page.locator('#habit-name').fill('Yoga');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('#habit-today').getByRole('button', { name: /Yoga/ }).click();
  const data = (await stored(page)).data;
  expect(data.customHabits).toEqual([
    expect.objectContaining({ emoji: '🧘', label: 'Yoga', since: '2026-10-20' }),
  ]);
  expect(Object.values(data.habits['2026-10-20'])).toEqual([1]);
});
