import { test as base, expect, type Page } from '@playwright/test';
import { TODAY, type StoredState } from '../fixtures/states.ts';

export { expect };
export type { Page };
export const STORAGE_KEY = 'ftf:v1';

// Every test runs on a fixed "today", fails on any request that leaves the app's own
// origin, and fails on any page error or console error.
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const outside: string[] = [];
      const errors: string[] = [];
      page.on('request', (r) => {
        const url = r.url();
        if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))
          outside.push(url);
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
      await use();
      expect(outside, 'requests to other hosts').toEqual([]);
      expect(errors, 'page errors').toEqual([]);
    },
    { auto: true },
  ],
});

// Store a state (unencrypted) before the app loads, then open the app.
export async function openWith(page: Page, state: StoredState) {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ enc: false, data }));
    },
    [STORAGE_KEY, state] as const,
  );
  await page.goto('./');
}

export async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

// Calendar day button for a day of the month shown.
export function calendarDay(page: Page, day: number) {
  return page.locator('#calendar button.cell').nth(day - 1);
}

// Answer the next prompt/confirm dialogs in order.
export function answerDialogs(page: Page, answers: (string | boolean)[]) {
  const queue = [...answers];
  page.on('dialog', async (d) => {
    const a = queue.shift();
    if (a === false) await d.dismiss();
    else await d.accept(typeof a === 'string' ? a : undefined);
  });
}
