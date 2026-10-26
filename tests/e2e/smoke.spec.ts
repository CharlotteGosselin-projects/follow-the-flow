import { test, expect, openWith } from './fixtures.ts';

test('a first visit shows the welcome card and blocks all network access', async ({ page }) => {
  await openWith(page, {});
  await expect(page.locator('#summary')).toContainText('Welcome');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("form-action 'none'");
});

test('every card renders with a year of data', async ({ page }) => {
  const { yearOfData } = await import('../fixtures/states.ts');
  await openWith(page, yearOfData());
  await expect(page.locator('#summary')).toContainText('Cycle day');
  await expect(page.locator('#forecast')).toContainText('Today');
  await expect(page.locator('#sleep-stats')).toContainText('Last 30 days');
  await expect(page.locator('#month-recap')).toContainText('October 2026 recap so far');
  await expect(page.locator('#history table')).toBeVisible();
});
