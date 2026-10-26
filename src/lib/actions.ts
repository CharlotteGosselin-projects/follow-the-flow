// Every change the user can make to their data, as pure functions: (state, …) → new state.

import { DEFAULT_CHART_PICKS, EXPORT_EVERY } from './catalog.ts';
import { addDays, diffDays } from './dates.ts';
import { allHabits } from './habits.ts';
import { orderMoods } from './backup.ts';
import { firstGrapheme } from './text.ts';
import type { CustomHabit, IsoDate, MoodId, SleepId, State } from './types.ts';

export function togglePeriodDay(s: State, d: IsoDate): State {
  const days = new Set(s.days);
  if (days.has(d)) days.delete(d);
  else days.add(d);
  return { ...s, days: [...days].sort() };
}

export function setMoods(s: State, d: IsoDate, ids: MoodId[]): State {
  const moods = { ...s.moods };
  if (ids.length) moods[d] = orderMoods(ids);
  else delete moods[d];
  return { ...s, moods };
}

export function toggleMood(s: State, d: IsoDate, id: MoodId): State {
  const current = s.moods[d] ?? [];
  return setMoods(s, d, current.includes(id) ? current.filter((m) => m !== id) : [...current, id]);
}

/** Set or clear (null) the night before `d`. */
export function setSleep(s: State, d: IsoDate, id: SleepId | null): State {
  const sleep = { ...s.sleep };
  if (id) sleep[d] = id;
  else delete sleep[d];
  return { ...s, sleep };
}

/** Replace a day's habits; {} means "none of these", null un-logs the day. */
export function setHabitDay(s: State, d: IsoDate, day: Record<string, number> | null): State {
  const habits = { ...s.habits };
  if (day) habits[d] = day;
  else delete habits[d];
  return { ...s, habits };
}

/** Set one habit's level (0 removes it). Untapping the last habit un-logs the day. */
export function setHabit(s: State, d: IsoDate, id: string, level: number): State {
  const day = { ...(s.habits[d] ?? {}) };
  if (level) day[id] = level;
  else delete day[id];
  return setHabitDay(s, d, Object.keys(day).length ? day : null);
}

/** The level the next tap gives: one up, or back to none after the top level. */
export function nextLevel(current: number, levels: number): number {
  return current >= levels ? 0 : current + 1;
}

/** Remove a day's moods, sleep and habits (not its period mark). */
export function clearDay(s: State, d: IsoDate): State {
  return setHabitDay(setSleep(setMoods(s, d, []), d, null), d, null);
}

export function setHabitHidden(s: State, id: string, hidden: boolean): State {
  const hiddenHabits = s.hiddenHabits.filter((h) => h !== id);
  if (hidden) hiddenHabits.push(id);
  return { ...s, hiddenHabits };
}

/** Add a custom habit, or explain why not. */
export function addCustomHabit(
  s: State,
  emoji: string,
  name: string,
  today: IsoDate,
  id = 'c' + Date.now().toString(36),
): State | { error: string } {
  const label = name.trim().slice(0, 30);
  if (!label) return { error: 'Give the habit a name.' };
  if (allHabits(s).some((h) => h.label.toLowerCase() === label.toLowerCase())) {
    return { error: 'You already have a habit with that name.' };
  }
  const habit: CustomHabit = { id, emoji: firstGrapheme(emoji) || '⭐', label, since: today };
  return { ...s, customHabits: [...s.customHabits, habit] };
}

/** Remove a custom habit and everything logged for it. */
export function removeCustomHabit(s: State, id: string): State {
  const habits: State['habits'] = {};
  for (const [d, day] of Object.entries(s.habits))
    habits[d] = Object.fromEntries(Object.entries(day).filter(([h]) => h !== id));
  return {
    ...s,
    habits,
    customHabits: s.customHabits.filter((c) => c.id !== id),
    hiddenHabits: s.hiddenHabits.filter((h) => h !== id),
  };
}

export function chartPicks(s: State): (string | null)[] {
  return s.chartPicks ? [...s.chartPicks] : [...DEFAULT_CHART_PICKS];
}

/**
 * Turn a chart line on or off. A new line takes the first free colour slot and lines
 * already shown keep theirs, so a colour means the same thing while it's on screen.
 * Returns null when all slots are taken.
 */
export function toggleChartPick(s: State, key: string): State | null {
  const picks = chartPicks(s);
  const at = picks.indexOf(key);
  if (at >= 0) picks[at] = null;
  else {
    const free = picks.indexOf(null);
    if (free < 0) return null;
    picks[free] = key;
  }
  return { ...s, chartPicks: picks };
}

export function markExported(s: State, today: IsoDate): State {
  return { ...s, lastExport: today, snoozeUntil: null };
}

export function snoozeReminder(s: State, today: IsoDate): State {
  return { ...s, snoozeUntil: addDays(today, 1) };
}

export function hasData(s: State): boolean {
  return s.days.length > 0 || [s.moods, s.sleep, s.habits].some((x) => Object.keys(x).length > 0);
}

/** Whether the weekly backup reminder should show. */
export function backupDue(s: State, today: IsoDate): boolean {
  const ref = s.lastExport ?? s.createdAt;
  return (
    hasData(s) && !!ref && diffDays(ref, today) >= EXPORT_EVERY && !(s.snoozeUntil && today < s.snoozeUntil)
  );
}
