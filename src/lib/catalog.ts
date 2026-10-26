// The fixed lists the app offers (moods, sleep, habits, phases) and the thresholds its
// analyses use.

import type { Habit, Mood, MoodId, Phase, SleepKind } from './types.ts';

export const STORAGE_KEY = 'ftf:v1';
export const BACKUP_VERSION = 5;

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
/** Days from ovulation to the next period (typical). */
export const LUTEAL_PHASE = 14;
/** Number of recent cycles used for averages. */
export const HISTORY_WINDOW = 6;
/** Cycles outside this range are treated as logging gaps and left out of averages. */
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 60;

/** Days between backup reminders. */
export const EXPORT_EVERY = 7;

/** About 2 months of mood history, with enough entries, before forecasting. */
export const MOOD_MIN_SPAN = 60;
export const MOOD_MIN_ENTRIES = 15;
/** The forecast uses at most the last ~6 months. */
export const MOOD_LOOKBACK = 183;

/** About 2 months of sleep tracking, with a few bad nights, before showing patterns. */
export const SLEEP_MIN_SPAN = 60;
export const SLEEP_MIN_BAD = 3;

/** About 2 months of habit logging before showing links. */
export const HABIT_MIN_SPAN = 60;
/** Days with and without a habit needed to compare them. */
export const HABIT_MIN_DAYS = 8;
/** Most findings listed per section. */
export const HABIT_SHOW = 6;

/** Monthly recap: moods that make a day feel good or tough ('tired' is neither). */
export const GOOD_MOODS: MoodId[] = ['happy', 'calm'];
export const TOUGH_MOODS: MoodId[] = ['sad', 'irritable', 'anxious'];
/** Mood days needed to describe a month, and in both months to compare them. */
export const RECAP_MIN_MOOD_DAYS = 3;
export const RECAP_COMPARE_DAYS = 5;
/** Days on each side before a recap insight compares moods or sleep. */
export const INSIGHT_MIN_DAYS = 4;
/** Lines the recap chart shows at once (colours are validated as a set of 3). */
export const MAX_CHART_LINES = 3;

export const MOODS: Mood[] = [
  { id: 'happy', emoji: '😄', label: 'Happy' },
  { id: 'calm', emoji: '😌', label: 'Calm' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
  { id: 'sad', emoji: '😢', label: 'Sad' },
  { id: 'irritable', emoji: '😠', label: 'Irritable' },
  { id: 'anxious', emoji: '😰', label: 'Anxious' },
];
export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<MoodId, Mood>;
export const MOOD_ORDER = MOODS.map((m) => m.id);

/** Sleep is logged on the morning after: the date is the day you woke up. */
export const SLEEP: SleepKind[] = [
  { id: 'poor', emoji: '🥱', label: 'Poor sleep' },
  { id: 'insomnia', emoji: '🦉', label: 'Insomnia' },
];
export const SLEEP_BY_ID = Object.fromEntries(SLEEP.map((s) => [s.id, s])) as Record<string, SleepKind>;

export const PHASES: Phase[] = [
  { id: 'period', label: 'During your period', when: 'during your period' },
  { id: 'follicular', label: 'After your period', when: 'in the days after your period' },
  { id: 'ovulation', label: 'Around ovulation', when: 'around ovulation' },
  { id: 'luteal', label: 'Second half of cycle', when: 'in the second half of your cycle' },
  { id: 'premenstrual', label: 'Week before period', when: 'in the week before your period' },
];

export const HABIT_GROUPS = [
  { id: 'daily', label: 'Daily habits' },
  { id: 'mind', label: 'Mind & social' },
  { id: 'body', label: 'Body' },
  { id: 'custom', label: 'Your own' },
] as const;

/** Habits are tapped once per day; habits with levels cycle through them on each tap. */
export const HABITS: Habit[] = [
  { id: 'exercise', emoji: '🏃', label: 'Exercise', group: 'daily', levels: ['light', 'intense'] },
  {
    id: 'caffeine',
    emoji: '☕',
    label: 'Caffeine',
    group: 'daily',
    levels: ['1 cup', '2 cups', '3 cups', '4 cups', '5+ cups'],
    heavy: { level: 3, label: '3+ cups' },
  },
  {
    id: 'alcohol',
    emoji: '🍷',
    label: 'Alcohol',
    group: 'daily',
    levels: ['1 drink', '2 drinks', '3 drinks', '4 drinks', '5+ drinks'],
    heavy: { level: 3, label: '3+ drinks' },
  },
  { id: 'stress', emoji: '😣', label: 'Stress', group: 'mind', levels: ['some', 'high'] },
  {
    id: 'meetings',
    emoji: '📅',
    label: 'Meetings',
    group: 'mind',
    levels: ['some', 'a lot', 'all day'],
    heavy: { level: 2, label: 'a lot or all day' },
  },
  { id: 'social', emoji: '👯', label: 'Social time', group: 'mind' },
  { id: 'alone', emoji: '🛋️', label: 'Alone time', group: 'mind' },
  { id: 'sick', emoji: '🤒', label: 'Sick', group: 'body' },
  { id: 'cramps', emoji: '😖', label: 'Cramps', group: 'body', levels: ['mild', 'strong'] },
  { id: 'headache', emoji: '🤕', label: 'Headache', group: 'body' },
  { id: 'digestion', emoji: '🤢', label: 'Digestion issues', group: 'body' },
];

/**
 * What the recap chart can draw, in picker order. `amount`: the levels are counts
 * (drinks, cups), so totals add them up; otherwise totals count days.
 */
export type ChartDef = { habit: string; amount?: string } | { sleep: true };
export const RECAP_CHARTS: ChartDef[] = [
  { habit: 'alcohol', amount: 'drink' },
  { habit: 'meetings' },
  { habit: 'caffeine', amount: 'cup' },
  { sleep: true },
  { habit: 'stress' },
  { habit: 'exercise' },
  { habit: 'sick' },
];
export const chartKey = (c: ChartDef) => ('sleep' in c ? 'sleep' : c.habit);
export const DEFAULT_CHART_PICKS = ['alcohol', 'meetings', null];

/** Habits the recap writes insights about. */
export const RECAP_INSIGHTS = ['alcohol', 'meetings', 'caffeine', 'stress'];
