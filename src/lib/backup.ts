// Reading stored data and backup files safely, writing backups, and merging an import.

import {
  BACKUP_VERSION,
  HABITS,
  MOOD_BY_ID,
  MOOD_ORDER,
  RECAP_CHARTS,
  SLEEP_BY_ID,
  chartKey,
} from './catalog.ts';
import { isIsoDate } from './dates.ts';
import { firstGrapheme } from './text.ts';
import type { CustomHabit, IsoDate, MoodId, SleepId, State } from './types.ts';

export function emptyState(): State {
  return {
    days: [],
    moods: {},
    sleep: {},
    habits: {},
    customHabits: [],
    hiddenHabits: [],
    chartPicks: null,
    createdAt: null,
    lastExport: null,
    snoozeUntil: null,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Moods in the app's fixed order, without duplicates or unknown ids. */
export function orderMoods(ids: readonly unknown[]): MoodId[] {
  return MOOD_ORDER.filter((id) => ids.includes(id));
}

/**
 * Turn anything read from storage or a backup file into a valid State, dropping what
 * doesn't fit. Also migrates older formats (one mood per day stored as a string).
 */
export function sanitize(input: unknown): State {
  const data = isObject(input) ? input : {};
  const date = (v: unknown) => (isIsoDate(v) ? v : null);

  const days = Array.isArray(data.days) ? data.days.filter(isIsoDate) : [];

  const moods: State['moods'] = {};
  if (isObject(data.moods)) {
    for (const [d, v] of Object.entries(data.moods)) {
      const ids = orderMoods(
        (Array.isArray(v) ? v : [v]).filter((m) => typeof m === 'string' && m in MOOD_BY_ID),
      );
      if (isIsoDate(d) && ids.length) moods[d] = ids;
    }
  }

  const sleep: State['sleep'] = {};
  if (isObject(data.sleep)) {
    for (const [d, v] of Object.entries(data.sleep)) {
      if (isIsoDate(d) && typeof v === 'string' && v in SLEEP_BY_ID) sleep[d] = v as SleepId;
    }
  }

  const customHabits: CustomHabit[] = [];
  if (Array.isArray(data.customHabits)) {
    for (const c of data.customHabits) {
      if (!isObject(c) || typeof c.id !== 'string' || !/^c[a-z0-9]{1,16}$/.test(c.id)) continue;
      const label = typeof c.label === 'string' ? c.label.trim().slice(0, 30) : '';
      if (label && !customHabits.some((x) => x.id === c.id)) {
        customHabits.push({ id: c.id, emoji: firstGrapheme(c.emoji) || '⭐', label, since: date(c.since) });
      }
    }
  }

  const maxLevel = new Map(
    [...HABITS, ...customHabits].map((h) => [h.id, 'levels' in h && h.levels ? h.levels.length : 1]),
  );
  const habits: State['habits'] = {};
  if (isObject(data.habits)) {
    for (const [d, v] of Object.entries(data.habits)) {
      if (!isIsoDate(d) || !isObject(v)) continue;
      const day: Record<string, number> = {};
      for (const [id, lv] of Object.entries(v)) {
        if (typeof lv === 'number' && Number.isInteger(lv) && lv >= 1 && lv <= (maxLevel.get(id) ?? 0))
          day[id] = lv;
      }
      // An empty day means "none of these"; a day whose entries were all invalid is dropped.
      if (Object.keys(day).length || !Object.keys(v).length) habits[d] = day;
    }
  }

  const hiddenHabits = Array.isArray(data.hiddenHabits)
    ? [...new Set(data.hiddenHabits.filter((id): id is string => typeof id === 'string' && maxLevel.has(id)))]
    : [];

  const chartKeys = new Set(RECAP_CHARTS.map(chartKey));
  const chartPicks =
    Array.isArray(data.chartPicks) && data.chartPicks.length === 3
      ? data.chartPicks
          .map((k) => (typeof k === 'string' && chartKeys.has(k) ? k : null))
          .map((k, i, all) => (all.indexOf(k) === i ? k : null))
      : null;

  return {
    days: [...new Set(days)].sort(),
    moods,
    sleep,
    habits,
    customHabits,
    hiddenHabits,
    chartPicks,
    createdAt: date(data.createdAt),
    lastExport: date(data.lastExport),
    snoozeUntil: date(data.snoozeUntil),
  };
}

/** The backup file's content (version 5). */
export function toBackup(state: State) {
  return {
    app: 'follow-the-flow',
    version: BACKUP_VERSION,
    days: state.days,
    moods: state.moods,
    sleep: state.sleep,
    habits: state.habits,
    customHabits: state.customHabits,
    hiddenHabits: state.hiddenHabits,
  };
}

export function backupFileName(today: IsoDate) {
  return `follow-the-flow-${today}.json`;
}

/**
 * Merge an imported (sanitized) backup into the current data. Nothing is lost: moods are
 * combined, and where both copies logged a night or a habit, the worse night and the
 * higher level win.
 */
export function mergeBackup(state: State, incoming: State): State {
  const moods = { ...state.moods };
  for (const [d, ids] of Object.entries(incoming.moods)) moods[d] = orderMoods([...(moods[d] ?? []), ...ids]);

  const sleep = { ...state.sleep };
  for (const [d, v] of Object.entries(incoming.sleep)) if (sleep[d] !== 'insomnia') sleep[d] = v;

  const customHabits = [...state.customHabits];
  for (const c of incoming.customHabits) if (!customHabits.some((x) => x.id === c.id)) customHabits.push(c);

  const habits = { ...state.habits };
  for (const [d, day] of Object.entries(incoming.habits)) {
    const merged = { ...(habits[d] ?? {}) };
    for (const [id, lv] of Object.entries(day)) merged[id] = Math.max(merged[id] ?? 0, lv);
    habits[d] = merged;
  }

  return {
    ...state,
    days: [...new Set([...state.days, ...incoming.days])].sort(),
    moods,
    sleep,
    customHabits,
    habits,
  };
}
