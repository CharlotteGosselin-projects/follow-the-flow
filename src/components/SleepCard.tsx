import { SLEEP_MIN_BAD, SLEEP_MIN_SPAN } from '../lib/catalog.ts';
import { futureCycleDay, phaseOf } from '../lib/cycle.ts';
import { addDays, diffDays, fmt } from '../lib/dates.ts';
import { sleepPattern } from '../lib/sleep.ts';
import { pct, plural } from '../lib/text.ts';
import { useStore } from '../store/AppStore.tsx';
import { SleepPicker } from './Pickers.tsx';
import { Card } from './ui/Card.tsx';
import { Note, Unlocking } from './ui/Text.tsx';

export function SleepCard() {
  const { state, today, analysis: a } = useStore();
  const recent = Object.entries(state.sleep).filter(([d]) => d <= today && diffDays(d, today) < 30);
  const insomnia = recent.filter(([, v]) => v === 'insomnia').length;
  const f = sleepPattern(state.sleep, a, today);

  let pattern;
  if (!f.ready) {
    const needs = [];
    if (f.span < SLEEP_MIN_SPAN) needs.push(`${SLEEP_MIN_SPAN - f.span} more days of tracking`);
    if (f.bad < SLEEP_MIN_BAD) needs.push(`${SLEEP_MIN_BAD - f.bad} more bad nights logged`);
    if (!a.last) needs.push('at least one logged period');
    pattern = (
      <Unlocking
        intro="After about 2 months of tracking, this shows when in your cycle bad nights tend to happen."
        progress={(100 * f.span) / SLEEP_MIN_SPAN}
        needs={needs}
      />
    );
  } else {
    const max = Math.max(...f.phases.map((p) => p.rate)) || 1;
    let note: string | null = null;
    if (f.top) {
      note = `Bad nights are most common for you ${f.top.when}.`;
      // Heads-up if that phase is coming up in the next week.
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        if (phaseOf(futureCycleDay(d, a), a) === f.top.id) {
          note +=
            i === 0
              ? " You're in that phase now."
              : ` That phase starts around ${fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}.`;
          break;
        }
      }
    }
    pattern = (
      <>
        <ul
          className="my-2 list-none p-0"
          aria-label="Share of nights with poor sleep or insomnia, by cycle phase"
        >
          {f.phases.map((p) => (
            <li
              key={p.id}
              title={`${p.label}: ${p.bad} bad of ${plural(p.nights, 'night')}`}
              className="grid grid-cols-[9.5em_1fr_3.2em] items-center gap-2 py-1 text-[.88rem]"
            >
              <span className={f.top?.id === p.id ? 'font-semibold' : ''}>{p.label}</span>
              <span className="h-2.5">
                <span
                  className="block h-full min-w-0.5 rounded-r bg-sleep"
                  style={{ width: `${(100 * p.rate) / max}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{pct(p.rate)}%</span>
            </li>
          ))}
        </ul>
        {note ? <p>{note}</p> : <Note>Your bad nights don&apos;t seem tied to one part of your cycle.</Note>}
        <Note>Percentages show the share of nights in each phase with poor sleep or insomnia.</Note>
      </>
    );
  }

  return (
    <Card>
      <h2>Sleep</h2>
      <Note>
        How did you sleep last night? Only log the bad nights: nights you don&apos;t log count as normal.
      </Note>
      <SleepPicker id="sleep-today" day={today} />
      <div id="sleep-stats">
        <h3>Last 30 days</h3>
        <p>
          {recent.length
            ? `${plural(insomnia, 'night')} of insomnia · ${plural(recent.length - insomnia, 'poor night')}`
            : 'No bad nights logged.'}
        </p>
        <h3>Across your cycle</h3>
        {pattern}
      </div>
    </Card>
  );
}
