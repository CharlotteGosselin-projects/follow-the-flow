import { describe, expect, it } from 'vitest';
import { emptyState } from '../../src/lib/backup.ts';
import { analyse } from '../../src/lib/cycle.ts';
import { addDays } from '../../src/lib/dates.ts';
import { activeHabits, compareByPhase, habitInsights, notable, type Sample } from '../../src/lib/habits.ts';
import type { State } from '../../src/lib/types.ts';

describe('habit list', () => {
  it('adds custom habits and leaves out hidden ones', () => {
    const state = {
      customHabits: [{ id: 'c1', emoji: '🧘', label: 'Yoga', since: '2026-10-01' }],
      hiddenHabits: ['alcohol'],
    };
    const ids = activeHabits(state).map((h) => h.id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('alcohol');
  });
});

describe('compareByPhase', () => {
  const day = (i: number) => addDays('2026-01-01', i);

  it('compares days with a habit to days without it in the same phases', () => {
    // 10 habit days and 10 other days in each of two phases. Bad outcome on 8/10 habit
    // days vs 2/10 other days in both phases.
    const samples: Sample[] = [];
    for (let i = 0; i < 40; i++) samples.push({ day: day(i), phase: i < 20 ? 'period' : 'luteal' });
    const has = (d: string) => samples.findIndex((s) => s.day === d) % 20 < 10;
    const outcome = (d: string) => {
      const i = samples.findIndex((s) => s.day === d) % 20;
      return i < 8 || (i >= 10 && i < 12);
    };
    const r = compareByPhase(samples, has, outcome)!;
    expect(r).toEqual({ n: 20, observed: 0.8, expected: 0.2 });
    expect(notable(r)).toBe(true);
  });

  it('does not blame a habit for its phase', () => {
    // Habit only in the premenstrual phase; bad outcomes are common there either way.
    const samples: Sample[] = [];
    for (let i = 0; i < 40; i++) samples.push({ day: day(i), phase: i < 20 ? 'premenstrual' : 'follicular' });
    const idx = (d: string) => samples.findIndex((s) => s.day === d);
    const has = (d: string) => idx(d) < 10;
    const outcome = (d: string) => idx(d) < 20 && idx(d) % 2 === 0;
    const r = compareByPhase(samples, has, outcome)!;
    expect(r.observed).toBeCloseTo(r.expected);
    expect(notable(r)).toBe(false);
  });

  it('needs at least 8 days on each side', () => {
    const samples: Sample[] = Array.from({ length: 10 }, (_, i) => ({
      day: day(i),
      phase: 'period' as const,
    }));
    expect(
      compareByPhase(
        samples,
        (d) => d < day(3),
        () => true,
      ),
    ).toBeNull();
  });
});

describe('habitInsights', () => {
  it('links alcohol to the bad night after it', () => {
    const today = '2026-10-20';
    const state: State = { ...emptyState() };
    state.days = Array.from({ length: 11 }, (_, k) => addDays('2026-01-03', 28 * k)).flatMap((s) =>
      Array.from({ length: 5 }, (_, i) => addDays(s, i)),
    );
    for (let i = 1; i <= 150; i++) {
      const d = addDays(today, -i);
      const drink = i % 3 === 0;
      state.habits[d] = drink ? { alcohol: 2 } : {};
      if (drink) state.sleep[addDays(d, 1)] = 'poor';
    }
    const r = habitInsights(state, analyse(state.days, today), today);
    expect(r.ready).toBe(true);
    expect(r.sleep[0]?.f.label).toBe('🍷 Alcohol');
    expect(r.sleep[0]?.observed).toBe(1);
    expect(r.sleep[0]?.expected).toBe(0);
  });
});
