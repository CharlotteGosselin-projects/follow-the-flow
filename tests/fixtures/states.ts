// Stored app states used by the tests, in the exact shape the app saves under `ftf:v1`.

export const TODAY = '2026-10-20';

export interface StoredState {
  days?: string[];
  moods?: Record<string, string[]>;
  sleep?: Record<string, 'poor' | 'insomnia'>;
  habits?: Record<string, Record<string, number>>;
  customHabits?: { id: string; emoji: string; label: string; since: string | null }[];
  hiddenHabits?: string[];
  chartPicks?: (string | null)[] | null;
  createdAt?: string | null;
  lastExport?: string | null;
  snoozeUntil?: string | null;
}

const DAY_MS = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Backed up today, so the weekly reminder stays out of the way.
export const quiet = { createdAt: TODAY, lastExport: TODAY };

// A year of plausible data up to TODAY: a 28-day cycle starting 3 Jan, weekend drinking
// followed by bad nights, weekday meetings (all-day meetings come with anxious moods),
// a few sick days in early October and ~10% of days not logged. Deterministic.
export function yearOfData(): StoredState {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 9, 20);
  const days: string[] = [];
  const moods: Record<string, string[]> = {};
  const sleep: Record<string, 'poor' | 'insomnia'> = {};
  const habits: Record<string, Record<string, number>> = {};
  for (let ms = Date.UTC(2026, 0, 3); ms <= end; ms += 28 * DAY_MS) {
    for (let i = 0; i < 5; i++) days.push(iso(ms + i * DAY_MS));
  }
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const d = iso(ms);
    const weekday = new Date(ms).getUTCDay();
    if (rnd() < 0.1) continue;
    const h: Record<string, number> = {};
    if ((weekday === 5 || weekday === 6) && rnd() < 0.7) h.alcohol = 1 + Math.floor(rnd() * 4);
    if (weekday >= 1 && weekday <= 5) {
      const m = rnd();
      if (m < 0.75) h.meetings = m < 0.25 ? 3 : m < 0.5 ? 2 : 1;
    }
    if (rnd() < 0.8) h.caffeine = 1 + Math.floor(rnd() * 3);
    if (rnd() < 0.3) h.exercise = 1;
    if (ms > Date.UTC(2026, 9, 5) && ms < Date.UTC(2026, 9, 9)) h.sick = 1;
    habits[d] = h;
    moods[d] = h.meetings === 3 ? ['anxious', 'tired'] : rnd() < 0.6 ? ['happy'] : ['calm'];
    if ((h.alcohol ?? 0) >= 2 && rnd() < 0.7) sleep[iso(ms + DAY_MS)] = rnd() < 0.3 ? 'insomnia' : 'poor';
  }
  return { days, moods, sleep, habits, customHabits: [], hiddenHabits: [], ...quiet };
}
