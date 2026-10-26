// When in the cycle bad nights happen.

import { PHASES, SLEEP_MIN_BAD, SLEEP_MIN_SPAN } from './catalog.ts';
import { cycleDayOf, phaseOf } from './cycle.ts';
import { addDays, diffDays } from './dates.ts';
import type { Analysis, IsoDate, Phase, PhaseId, State } from './types.ts';

export interface PhaseRate extends Phase {
  nights: number;
  bad: number;
  rate: number;
}

export interface SleepPattern {
  span: number;
  bad: number;
  ready: boolean;
  phases: PhaseRate[];
  /** The phase that clearly stands out, if any. */
  top: PhaseRate | null;
}

/**
 * For each phase, the share of tracked nights that were bad. Tracking starts at the first
 * logged bad night; unlogged nights count as normal.
 */
export function sleepPattern(sleep: State['sleep'], a: Analysis, today: IsoDate): SleepPattern {
  const logged = Object.keys(sleep)
    .filter((d) => d <= today)
    .sort();
  const first = logged[0] ?? null;
  const span = first ? diffDays(first, today) + 1 : 0;
  const status: SleepPattern = { span, bad: logged.length, ready: false, phases: [], top: null };
  if (!a.last || !first || span < SLEEP_MIN_SPAN || logged.length < SLEEP_MIN_BAD) return status;

  const nights: Partial<Record<PhaseId, number>> = {};
  const bad: Partial<Record<PhaseId, number>> = {};
  let total = 0;
  let totalBad = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const cd = cycleDayOf(d, a.ps);
    if (!cd) continue;
    const ph = phaseOf(cd, a);
    nights[ph] = (nights[ph] ?? 0) + 1;
    total++;
    if (sleep[d]) {
      bad[ph] = (bad[ph] ?? 0) + 1;
      totalBad++;
    }
  }
  if (!totalBad) return status;
  status.ready = true;
  status.phases = PHASES.filter((p) => nights[p.id]).map((p) => ({
    ...p,
    nights: nights[p.id]!,
    bad: bad[p.id] ?? 0,
    rate: (bad[p.id] ?? 0) / nights[p.id]!,
  }));
  const overall = totalBad / total;
  const best = [...status.phases].sort((x, y) => y.rate - x.rate)[0];
  // Only call out a phase when it clearly stands out from the rest of the cycle.
  if (best && best.rate >= 1.5 * overall && best.bad >= 2) status.top = best;
  return status;
}
