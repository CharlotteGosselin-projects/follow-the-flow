import { test, expect, openWith } from './fixtures.ts';
import { quiet } from '../fixtures/states.ts';

test.use({ serviceWorkers: 'allow' });

test('the app opens offline after one visit', async ({ page, context }) => {
  await openWith(page, { ...quiet, days: ['2026-10-01'] });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker, which caches what it serves
  await expect(page.locator('#summary')).toContainText('Cycle day');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#summary')).toContainText('Cycle day');
});
