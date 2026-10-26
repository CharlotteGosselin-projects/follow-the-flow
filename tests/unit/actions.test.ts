import { describe, expect, it } from 'vitest';
import {
  addCustomHabit,
  backupDue,
  clearDay,
  markExported,
  nextLevel,
  removeCustomHabit,
  setHabit,
  setHabitDay,
  setSleep,
  snoozeReminder,
  toggleChartPick,
  toggleMood,
  togglePeriodDay,
} from '../../src/lib/actions.ts';
import { emptyState } from '../../src/lib/backup.ts';
import type { State } from '../../src/lib/types.ts';

const D = '2026-10-20';
const base = (patch: Partial<State> = {}): State => ({ ...emptyState(), ...patch });

describe('logging a day', () => {
  it('toggles period days and keeps them sorted', () => {
    const s = togglePeriodDay(togglePeriodDay(base(), '2026-10-20'), '2026-10-18');
    expect(s.days).toEqual(['2026-10-18', '2026-10-20']);
    expect(togglePeriodDay(s, '2026-10-18').days).toEqual(['2026-10-20']);
  });

  it('keeps several moods in the fixed order and removes empty days', () => {
    let s = toggleMood(toggleMood(base(), D, 'anxious'), D, 'happy');
    expect(s.moods[D]).toEqual(['happy', 'anxious']);
    s = toggleMood(toggleMood(s, D, 'anxious'), D, 'happy');
    expect(s.moods).toEqual({});
  });

  it('steps habit levels up and back to none; the last untap un-logs the day', () => {
    expect([0, 1, 4, 5].map((l) => nextLevel(l, 5))).toEqual([1, 2, 5, 0]);
    let s = setHabit(base(), D, 'caffeine', 2);
    expect(s.habits[D]).toEqual({ caffeine: 2 });
    s = setHabit(s, D, 'caffeine', 0);
    expect(s.habits).toEqual({});
    expect(setHabitDay(base(), D, {}).habits[D]).toEqual({}); // "none of these"
  });

  it('clears a day but keeps its period mark', () => {
    let s = base({ days: [D] });
    s = setHabit(setSleep(toggleMood(s, D, 'sad'), D, 'poor'), D, 'alcohol', 1);
    expect(clearDay(s, D)).toEqual(base({ days: [D] }));
  });

  it('does not change the state it was given', () => {
    const s = base();
    toggleMood(s, D, 'sad');
    setHabit(s, D, 'alcohol', 1);
    expect(s).toEqual(base());
  });
});

describe('custom habits', () => {
  it('adds a habit counted from today, refusing blanks and duplicates', () => {
    const s = addCustomHabit(base(), '🧘🏽 yoga', ' Yoga ', D, 'c1');
    expect(s).toMatchObject({ customHabits: [{ id: 'c1', emoji: '🧘🏽', label: 'Yoga', since: D }] });
    expect(addCustomHabit(s as State, '', 'yoga', D)).toEqual({
      error: 'You already have a habit with that name.',
    });
    expect(addCustomHabit(base(), '', 'Exercise', D)).toHaveProperty('error');
    expect(addCustomHabit(base(), '', '  ', D)).toHaveProperty('error');
  });

  it('removes a habit and everything logged for it', () => {
    const s = base({
      customHabits: [{ id: 'c1', emoji: '🧘', label: 'Yoga', since: D }],
      hiddenHabits: ['c1'],
      habits: { [D]: { c1: 1, alcohol: 2 } },
    });
    expect(removeCustomHabit(s, 'c1')).toMatchObject({
      customHabits: [],
      hiddenHabits: [],
      habits: { [D]: { alcohol: 2 } },
    });
  });
});

describe('chart picks', () => {
  it('fills free colour slots, keeps colours when a line is removed, and refuses a fourth', () => {
    let s = base();
    s = toggleChartPick(s, 'caffeine')!;
    expect(s.chartPicks).toEqual(['alcohol', 'meetings', 'caffeine']);
    expect(toggleChartPick(s, 'sleep')).toBeNull();
    s = toggleChartPick(s, 'alcohol')!;
    s = toggleChartPick(s, 'sleep')!;
    expect(s.chartPicks).toEqual(['sleep', 'meetings', 'caffeine']);
  });
});

describe('backup reminder', () => {
  const withData = base({ days: ['2026-10-01'], createdAt: '2026-10-01' });

  it('is due a week after the last export (or the first use)', () => {
    expect(backupDue(withData, '2026-10-07')).toBe(false);
    expect(backupDue(withData, '2026-10-08')).toBe(true);
    expect(backupDue(markExported(withData, '2026-10-08'), '2026-10-14')).toBe(false);
    expect(backupDue(base({ createdAt: '2026-01-01' }), D)).toBe(false); // nothing to back up
  });

  it('can be snoozed until tomorrow', () => {
    const s = snoozeReminder(withData, '2026-10-08');
    expect(backupDue(s, '2026-10-08')).toBe(false);
    expect(backupDue(s, '2026-10-09')).toBe(true);
  });
});
