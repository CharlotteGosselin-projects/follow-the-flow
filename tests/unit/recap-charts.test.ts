import { describe, expect, it } from 'vitest';
import { emptyState } from '../../src/lib/backup.ts';
import { analyse } from '../../src/lib/cycle.ts';
import {
  chartSeries,
  chartTotals,
  levelText,
  niceMax,
  recapInsights,
  usedApp,
} from '../../src/lib/charts.ts';
import { addDays, daysBetween } from '../../src/lib/dates.ts';
import { compareMonths, monthStats, monthTone, periodRecap } from '../../src/lib/recap.ts';
import type { State } from '../../src/lib/types.ts';

const TODAY = '2026-10-20';
const state = (patch: Partial<State>): State => ({ ...emptyState(), ...patch });

describe('monthly recap', () => {
  it('rates a month from its good and tough mood days', () => {
    const moods: State['moods'] = {
      '2026-10-01': ['happy'],
      '2026-10-02': ['calm', 'tired'],
      '2026-10-03': ['sad'],
      '2026-10-04': ['happy'],
    };
    const s = monthStats(state({ moods }), analyse([], TODAY), '2026-10-01', TODAY);
    expect(s).toMatchObject({ days: 20, complete: false, good: ['2026-10-01', '2026-10-02', '2026-10-04'] });
    expect(monthTone(s)).toBe('good'); // (3 − 1) / 4 = 0.5
    expect(monthTone({ ...s, moodDays: s.moodDays.slice(0, 2) })).toBeNull();
  });

  it('says how early or late a period came compared with the cycles before it', () => {
    const days = ['2026-07-01', '2026-07-29', '2026-08-26', '2026-09-26', '2026-09-27'];
    const a = analyse(days, TODAY);
    const s = monthStats(state({ days }), a, '2026-09-01', TODAY);
    expect(periodRecap(s.periods[0]!, a, TODAY)).toEqual({
      start: '2026-09-26',
      length: 2,
      ongoing: false,
      cycle: 31,
      avg: 28,
      shift: 3,
    });
  });

  it('compares a month with the one before', () => {
    const moods: State['moods'] = {};
    for (const d of daysBetween('2026-09-01', 1)) moods[d] = ['calm'];
    for (const d of daysBetween('2026-10-01', 1).filter((d) => d <= TODAY)) moods[d] = ['anxious'];
    const st = state({ moods });
    const a = analyse([], TODAY);
    const lines = compareMonths(
      monthStats(st, a, '2026-10-01', TODAY),
      monthStats(st, a, '2026-09-01', TODAY),
    );
    expect(lines).toEqual([
      '😌 Fewer calm days than in September so far (0% of logged days vs 100%).',
      '😰 More anxious days than in September so far (100% of logged days vs 0%).',
    ]);
  });
});

describe('recap chart data', () => {
  const st = state({
    days: ['2026-10-05'],
    habits: { '2026-10-01': { alcohol: 5 }, '2026-10-02': { alcohol: 1, meetings: 3 } },
    moods: { '2026-10-04': ['happy'] },
  });
  const alcohol = chartSeries({ habit: 'alcohol', amount: 'drink' }, st, TODAY)!;

  it('counts a day once anything is logged, but not for period days alone', () => {
    expect(usedApp(st, '2026-10-04')).toBe(true);
    expect(usedApp(st, '2026-10-05')).toBe(false);
    expect(alcohol.value('2026-10-04')).toBe(0);
    expect(alcohol.value('2026-10-05')).toBeNull();
    expect(alcohol.value('2026-10-25')).toBeNull(); // future
  });

  it('adds up drinks (5+ as 5) and counts days for other habits', () => {
    expect(chartTotals(alcohol, daysBetween('2026-10-01', 1))).toEqual({
      logged: 3,
      hit: 2,
      sum: 6,
      heavy: 1,
    });
    const meetings = chartSeries({ habit: 'meetings' }, st, TODAY)!;
    expect(chartTotals(meetings, daysBetween('2026-10-01', 1)).sum).toBe(1);
    expect(levelText(meetings, 3)).toBe('all day');
    expect(levelText(meetings, 0)).toBe('none');
    expect(levelText(meetings, null)).toBe('not logged');
  });

  it('skips hidden habits', () => {
    expect(chartSeries({ habit: 'alcohol' }, { ...st, hiddenHabits: ['alcohol'] }, TODAY)).toBeNull();
  });

  it('rounds chart maxima to friendly numbers', () => {
    expect([3, 6, 12, 19, 21, 51, 101].map(niceMax)).toEqual([5, 10, 20, 20, 50, 100, 200]);
  });
});

describe('recap insights', () => {
  it('points out heavy days and weekday clusters', () => {
    const habits: State['habits'] = {};
    for (const d of daysBetween('2026-01-01', 10)) {
      const weekday = new Date(d).getUTCDay();
      habits[d] = weekday === 5 || weekday === 6 ? { alcohol: 3 } : {};
    }
    const st = state({ habits });
    const lines = recapInsights(st, analyse([], TODAY), 'year', '2026-10-01', TODAY);
    expect(lines[0]).toMatch(/^🍷 \d+ days with 3\+ drinks\.$/);
    expect(lines[1]).toMatch(/^🍷 Alcohol mostly on Fridays and Saturdays \(100% of \d+ days\)\.$/);
  });

  it('compares tough moods on heavy meeting days with other days', () => {
    const habits: State['habits'] = {};
    const moods: State['moods'] = {};
    for (let i = 0; i < 20; i++) {
      const d = addDays('2026-10-01', i % 20);
      const heavy = i % 2 === 0;
      habits[d] = { meetings: heavy ? 3 : 1 };
      moods[d] = [heavy ? 'anxious' : 'calm'];
    }
    const lines = recapInsights(state({ habits, moods }), analyse([], TODAY), 'month', '2026-10-01', TODAY);
    expect(lines).toContain(
      '📅 Tough moods on 100% of days with meetings a lot or all day vs 0% of other days.',
    );
  });
});
