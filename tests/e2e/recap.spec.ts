import { test, expect, openWith, stored, type Page } from './fixtures.ts';
import { quiet, yearOfData } from '../fixtures/states.ts';

const recap = (page: Page) => page.locator('#month-recap');
const picker = (page: Page) => recap(page).locator('.chip-pick');

// Text of the chart readout at a column (0-based), after scrolling the chart into view.
async function readout(page: Page, column: number, columns: number) {
  const chart = recap(page).locator('.chart svg');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + ((column + 0.5) * box.width) / columns, box.y + box.height / 2);
  return (await recap(page).locator('.chart-tip').innerText()).replace(/\n/g, ' | ');
}

test('the month recap describes mood, cycle, sleep and what happened', async ({ page }) => {
  await openWith(page, yearOfData());
  await expect(recap(page).locator('h2')).toHaveText('October 2026 recap so far');
  await expect(recap(page)).toContainText('Mostly a good month');
  await expect(recap(page)).toContainText('Period started Sat, Oct 10, lasted 5 days.');
  await expect(recap(page)).toContainText('Cycle before it: 28 days (your average was 28). Right on time.');
  await expect(recap(page)).toContainText('Sick 3 days.');
  await expect(recap(page)).toContainText('Compared with September');
  await page.locator('#next').click();
  await expect(recap(page)).toContainText('This month hasn’t started yet.');
});

test('the chart picker shows up to 3 lines and keeps colours stable', async ({ page }) => {
  await openWith(page, yearOfData());
  const pressed = () =>
    picker(page).evaluateAll((bs) =>
      bs
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map(
          (b) => `${b.children[1]!.textContent!.replace(/^\S+\s/, '')}:${b.className.match(/\bs\d\b/)![0]}`,
        ),
    );
  expect(await pressed()).toEqual(['Alcohol:s1', 'Meetings:s2']);
  // Lines with gaps are drawn in pieces, so count the colour slots drawn.
  const drawn = await recap(page)
    .locator('.chart-line')
    .evaluateAll((ls) => [...new Set(ls.map((l) => l.getAttribute('class')!.match(/\bs\d\b/)![0]))]);
  expect(drawn.sort()).toEqual(['s1', 's2']);

  await picker(page).filter({ hasText: 'Caffeine' }).click();
  expect(await pressed()).toEqual(['Alcohol:s1', 'Meetings:s2', 'Caffeine:s3']);
  await picker(page).filter({ hasText: 'Exercise' }).click();
  await expect(recap(page).locator('.picker-note')).toBeVisible();
  expect(await pressed()).toEqual(['Alcohol:s1', 'Meetings:s2', 'Caffeine:s3']);

  await picker(page).filter({ hasText: 'Alcohol' }).click();
  await picker(page).filter({ hasText: 'Exercise' }).click();
  expect(await pressed()).toEqual(['Meetings:s2', 'Caffeine:s3', 'Exercise:s1']);
  expect((await stored(page)).data.chartPicks).toEqual(['exercise', 'meetings', 'caffeine']);

  await page.reload();
  expect(await pressed()).toEqual(['Meetings:s2', 'Caffeine:s3', 'Exercise:s1']);
});

test('chart readouts give real values for the month and the year', async ({ page }) => {
  await openWith(page, yearOfData());
  expect(await readout(page, 9, 31)).toMatch(/^Sat, Oct 10 \| .+ \| Alcohol \| .+ \| Meetings$/);
  await recap(page).locator('.recap-range button', { hasText: '2026' }).click();
  expect(await readout(page, 5, 12)).toMatch(
    /^June \| \d+ drinks over \d+ days \(\d+%\) \| Alcohol \| \d+ days \(\d+%\) \| Meetings$/,
  );
  await recap(page).getByText('See the numbers').click();
  await expect(recap(page).locator('.chart-table tr')).toHaveCount(11); // header + Jan..Oct
});

test('a day with only a mood counts as "none" for habits; a period-only day is a gap', async ({ page }) => {
  await openWith(page, {
    ...quiet,
    days: ['2026-10-05'],
    habits: { '2026-10-01': { alcohol: 2 } },
    moods: { '2026-10-04': ['happy'] },
  });
  // Only alcohol has data this month, so it's the only line.
  expect(await readout(page, 0, 31)).toBe('Thu, Oct 1 | 2 drinks | Alcohol');
  expect(await readout(page, 3, 31)).toBe('Sun, Oct 4 | none | Alcohol');
  expect(await readout(page, 4, 31)).toBe('Mon, Oct 5 | not logged | Alcohol');
});

test('recap insights point out heavy days and weekday clusters', async ({ page }) => {
  await openWith(page, yearOfData());
  await recap(page).locator('.recap-range button', { hasText: '2026' }).click();
  const insights = recap(page).locator('h3:text-is("Insights") + ul');
  await expect(insights).toContainText(/🍷 \d+ days with 3\+ drinks\./);
  await expect(insights).toContainText('Alcohol mostly on Fridays and Saturdays');
  await expect(insights).toContainText(/Tough moods on \d+% of days with meetings a lot or all day/);
});
