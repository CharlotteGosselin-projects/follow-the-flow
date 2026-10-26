import { describe, expect, it } from 'vitest';
import { MOOD_MIN_SPAN } from '../../src/lib/catalog.ts';
import { analyse } from '../../src/lib/cycle.ts';
import { addDays } from '../../src/lib/dates.ts';
import { moodForecast } from '../../src/lib/mood.ts';
import { sleepPattern } from '../../src/lib/sleep.ts';
import type { MoodId, State } from '../../src/lib/types.ts';

const TODAY = '2026-10-20';
// 28-day cycles starting 3 Jan … 10 Oct, 5-day periods.
const days = Array.from({ length: 11 }, (_, k) => addDays('2026-01-03', 28 * k)).flatMap((s) =>
  Array.from({ length: 5 }, (_, i) => addDays(s, i)),
);
const a = analyse(days, TODAY);

describe('moodForecast', () => {
  it('stays locked until there are ~2 months and 15 entries', () => {
    const moods: State['moods'] = {};
    for (let i = 0; i < 30; i++) moods[addDays(TODAY, -i)] = ['happy'];
    const f = moodForecast(moods, a, TODAY);
    expect(f).toMatchObject({ ready: false, count: 30, span: 30 });
    expect(f.span).toBeLessThan(MOOD_MIN_SPAN);
  });

  it('predicts the moods usually logged at the same point of the cycle', () => {
    // Anxious in the last 5 days of every cycle, happy otherwise.
    const moods: State['moods'] = {};
    for (let i = 0; i < 150; i++) {
      const d = addDays(TODAY, -i);
      const cd = (((Math.round((Date.parse(d) - Date.parse('2026-01-03')) / 864e5) % 28) + 28) % 28) + 1;
      moods[d] = [cd > 23 ? 'anxious' : 'happy'] as MoodId[];
    }
    const f = moodForecast(moods, a, TODAY);
    expect(f.ready).toBe(true);
    expect(f.days).toHaveLength(7);
    const byDate = Object.fromEntries(f.days.map((d) => [d.date, d]));
    expect(byDate['2026-10-20']).toMatchObject({ cycleDay: 11, moods: [{ id: 'happy', pct: 100 }] });
    expect(byDate['2026-10-26']!.cycleDay).toBe(17);
    // 4 Nov is cycle day 26: its ±2-day window (days 24–28) is all in the anxious stretch.
    const late = moodForecast(moods, a, '2026-11-01').days.find((d) => d.date === '2026-11-04')!;
    expect(late.moods[0]).toEqual({ id: 'anxious', pct: 100 });
  });
});

describe('sleepPattern', () => {
  it('needs ~2 months of tracking and a few bad nights', () => {
    expect(sleepPattern({ '2026-10-01': 'poor' }, a, TODAY).ready).toBe(false);
  });

  it('finds the phase where bad nights cluster', () => {
    const sleep: State['sleep'] = {};
    // Bad nights on cycle days 25–27 of the last 4 cycles.
    for (const start of ['2026-06-20', '2026-07-18', '2026-08-15', '2026-09-12']) {
      for (const i of [24, 25, 26]) sleep[addDays(start, i)] = 'poor';
    }
    const s = sleepPattern(sleep, a, TODAY);
    expect(s.ready).toBe(true);
    expect(s.top?.id).toBe('premenstrual');
    expect(s.phases.find((p) => p.id === 'follicular')?.rate).toBe(0);
  });
});
