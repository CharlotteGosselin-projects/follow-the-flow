import { readFile, writeFile } from 'node:fs/promises';
import { test, expect, openWith, stored, answerDialogs, STORAGE_KEY } from './fixtures.ts';
import { TODAY, quiet } from '../fixtures/states.ts';

test('export writes a version 5 backup and resets the reminder', async ({ page }) => {
  await openWith(page, { days: ['2026-10-01'], moods: { '2026-10-02': ['sad'] }, createdAt: '2026-10-01' });
  await expect(page.locator('#reminder')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('#reminder-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`follow-the-flow-${TODAY}.json`);
  const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(backup).toMatchObject({
    app: 'follow-the-flow',
    version: 5,
    days: ['2026-10-01'],
    moods: { '2026-10-02': ['sad'] },
  });
  await expect(page.locator('#reminder')).toBeHidden();
  expect((await stored(page)).data.lastExport).toBe(TODAY);
});

test('import merges a backup into the current data', async ({ page }, info) => {
  await openWith(page, {
    ...quiet,
    moods: { '2026-10-02': ['sad'] },
    sleep: { '2026-10-03': 'insomnia' },
    habits: { '2026-10-04': { caffeine: 1 } },
  });
  const path = info.outputPath('backup.json');
  await writeFile(
    path,
    JSON.stringify({
      app: 'follow-the-flow',
      version: 5,
      days: ['2026-10-01'],
      moods: { '2026-10-02': ['calm'], '2026-10-05': 'happy' }, // older backups stored one mood as a string
      sleep: { '2026-10-03': 'poor', '2026-10-06': 'poor', '2026-10-07': 'great' },
      habits: { '2026-10-04': { caffeine: 3, nope: 1 } },
    }),
  );
  answerDialogs(page, [true]);
  await page.locator('#import').setInputFiles(path);
  await expect(page.locator('#summary')).toContainText('Cycle day');
  const data = (await stored(page)).data;
  expect(data.days).toEqual(['2026-10-01']);
  expect(data.moods).toEqual({ '2026-10-02': ['calm', 'sad'], '2026-10-05': ['happy'] });
  expect(data.sleep).toEqual({ '2026-10-03': 'insomnia', '2026-10-06': 'poor' }); // keeps the worse night
  expect(data.habits['2026-10-04']).toEqual({ caffeine: 3 }); // keeps the higher level
});

test('a passphrase encrypts the data and locks the app', async ({ page }) => {
  await openWith(page, { ...quiet, days: ['2026-10-01'] });
  answerDialogs(page, ['correct horse', 'correct horse']);
  await page.locator('#set-pass').click();
  await expect(page.locator('#lock-now')).toBeVisible();
  const raw = await stored(page);
  expect(raw.enc).toBe(true);
  expect(JSON.stringify(raw)).not.toContain('2026-10-01');

  await page.reload();
  await expect(page.locator('#lock')).toBeVisible();
  await page.locator('#unlock-pass').fill('wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#unlock-error')).toBeVisible();
  await page.locator('#unlock-pass').fill('correct horse');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#summary')).toContainText('Cycle day');

  await page.locator('#lock-now').click();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('delete all data wipes storage', async ({ page }) => {
  await openWith(page, { ...quiet, days: ['2026-10-01'] });
  answerDialogs(page, [true]);
  await page.locator('#wipe').click();
  await expect(page.locator('#summary')).toContainText('Welcome');
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
});
