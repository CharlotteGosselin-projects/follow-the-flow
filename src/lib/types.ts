// Shapes of the data the app stores and the results it computes.

/** A calendar date as 'YYYY-MM-DD'. All date maths is done on these strings in UTC. */
export type IsoDate = string;

export type MoodId = 'happy' | 'calm' | 'tired' | 'sad' | 'irritable' | 'anxious';
export type SleepId = 'poor' | 'insomnia';
export type PhaseId = 'period' | 'follicular' | 'ovulation' | 'luteal' | 'premenstrual';

export interface CustomHabit {
  id: string;
  emoji: string;
  label: string;
  /** The day it was added: it only counts in the analysis from then on. */
  since: IsoDate | null;
}

/** Everything the app saves, in the exact shape stored under `ftf:v1`. */
export interface State {
  /** Sorted period days. */
  days: IsoDate[];
  /** Several moods per day are allowed. */
  moods: Record<IsoDate, MoodId[]>;
  /** Only bad nights are logged, on the date you woke up. */
  sleep: Record<IsoDate, SleepId>;
  /** habitId → level (1..n). An empty object means "none of these" was tapped. */
  habits: Record<IsoDate, Record<string, number>>;
  customHabits: CustomHabit[];
  hiddenHabits: string[];
  /** Lines on the recap chart, by colour slot (3 slots); null means the default picks. */
  chartPicks: (string | null)[] | null;
  /** These three drive the weekly backup reminder. */
  createdAt: IsoDate | null;
  lastExport: IsoDate | null;
  snoozeUntil: IsoDate | null;
}

export interface Mood {
  id: MoodId;
  emoji: string;
  label: string;
}

export interface SleepKind {
  id: SleepId;
  emoji: string;
  label: string;
}

export interface Phase {
  id: PhaseId;
  label: string;
  /** Fits after "most common …", e.g. "in the week before your period". */
  when: string;
}

export interface Habit {
  id: string;
  emoji: string;
  label: string;
  group: 'daily' | 'mind' | 'body' | 'custom';
  /** Names of the levels a tap cycles through; habits without levels are on/off. */
  levels?: string[];
  /** The level from which a day counts as heavy (e.g. 3+ cups), compared on its own. */
  heavy?: { level: number; label: string };
  since?: IsoDate | null;
}

export interface Period {
  start: IsoDate;
  end: IsoDate;
}

/** The cycle as worked out from the logged period days. */
export interface Analysis {
  ps: Period[];
  /** Start-to-start lengths of every logged cycle. */
  cycles: number[];
  /** Average cycle and period length (or the defaults). */
  cycleLen: number;
  periodLen: number;
  last: Period | null;
  nextStart: IsoDate | null;
  /** How many cycles the average is based on. */
  sample: number;
}
