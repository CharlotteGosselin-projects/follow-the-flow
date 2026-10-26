import { MOOD_BY_ID } from '../../lib/catalog.ts';
import { mainPhase } from '../../lib/cycle.ts';
import { addMonths, diffDays, fmt } from '../../lib/dates.ts';
import { allHabits } from '../../lib/habits.ts';
import { compareMonths, monthStats, monthTone, periodRecap, type MonthStats } from '../../lib/recap.ts';
import { plural } from '../../lib/text.ts';
import type { MoodId } from '../../lib/types.ts';
import { useStore } from '../../store/AppStore.tsx';
import { Card } from '../ui/Card.tsx';
import { Findings, Note } from '../ui/Text.tsx';
import { RecapCharts } from './RecapCharts.tsx';

const TONE = { good: '🌤️ Mostly a good month', mixed: '⛅ A mixed month', tough: '🌧️ A tough month' };
const longDay = { weekday: 'short', day: 'numeric', month: 'short' } as const;

/** A summary of the month shown in the calendar, live while it's still going. */
export function MonthRecap({ month }: { month: string }) {
  const { state, today, analysis } = useStore();
  const s = monthStats(state, analysis, month, today);
  const soFar = !s.complete && month <= today ? ' so far' : '';
  const prev = addMonths(month, -1);
  const comparisons = compareMonths(s, monthStats(state, analysis, prev, today));

  return (
    <Card id="month-recap" className="[&_h3]:mt-3.5 [&_h3]:mb-1 [&_p]:my-1">
      <h2>
        {fmt(month, { month: 'long', year: 'numeric' })} recap{soFar}
      </h2>
      {month > today ? (
        <Note>This month hasn’t started yet.</Note>
      ) : (
        <>
          <h3>Mood</h3>
          <MoodSection s={s} />
          <h3>Cycle</h3>
          <CycleSection s={s} />
          <h3>Sleep</h3>
          <SleepSection s={s} />
          <h3>What happened</h3>
          <HappenedSection s={s} />
          {comparisons.length > 0 && (
            <>
              <h3>Compared with {fmt(prev, { month: 'long' })}</h3>
              <Findings items={comparisons} />
            </>
          )}
          <RecapCharts month={month} />
        </>
      )}
    </Card>
  );
}

function MoodSection({ s }: { s: MonthStats }) {
  const { analysis } = useStore();
  const tone = monthTone(s);
  if (!tone) {
    return (
      <Note>
        {s.moodDays.length
          ? `Only ${plural(s.moodDays.length, 'day')} with a mood logged. Log a few more to see how the month felt.`
          : 'No moods logged this month.'}
      </Note>
    );
  }
  const top = (Object.entries(s.moodCount) as [MoodId, number][]).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const phase = s.tough.length >= 3 && mainPhase(s.tough, analysis);
  return (
    <>
      <p className="recap-tone text-[1.1rem] font-semibold">{TONE[tone]}</p>
      <div className="my-1.5 flex flex-wrap gap-1.5">
        {top.map(([id, n]) => (
          <span
            key={id}
            className="rounded-full border border-line px-2.5 py-0.5 text-[.88rem] whitespace-nowrap"
          >
            {MOOD_BY_ID[id].emoji} {MOOD_BY_ID[id].label} · {plural(n, 'day')}
          </span>
        ))}
      </div>
      <Note>
        {`${plural(s.good.length, 'good day')}, ${plural(s.tough.length, 'tough day')} out of ${s.moodDays.length} logged.`}
        {phase && ` Tough days were mostly ${phase.when}.`}
      </Note>
    </>
  );
}

function CycleSection({ s }: { s: MonthStats }) {
  const { today, analysis: a } = useStore();
  if (!s.periods.length) {
    const next = a.nextStart;
    const expected = !!next && next >= s.month && next < addMonths(s.month, 1) && !s.complete;
    return (
      <p>
        {expected
          ? `No period yet. Next one expected around ${fmt(next, longDay)}.`
          : 'No period started this month.'}
      </p>
    );
  }
  return s.periods.map((period) => {
    const p = periodRecap(period, a, today);
    let cycle = null;
    if (p.cycle != null) {
      cycle = `Cycle before it: ${plural(p.cycle, 'day')}`;
      if (p.shift != null) {
        cycle +=
          ` (your average was ${p.avg}). ` +
          (Math.abs(p.shift) <= 1
            ? 'Right on time.'
            : `Came ${plural(Math.abs(p.shift), 'day')} ${p.shift > 0 ? 'later' : 'earlier'} than expected.`);
      } else cycle += '.';
    }
    return (
      <div key={p.start}>
        <p>
          🩸 Period started {fmt(p.start, longDay)},{' '}
          {p.ongoing ? `day ${diffDays(p.start, today) + 1} so far.` : `lasted ${plural(p.length, 'day')}.`}
        </p>
        {cycle && <p>{cycle}</p>}
      </div>
    );
  });
}

function SleepSection({ s }: { s: MonthStats }) {
  const { analysis } = useStore();
  if (!s.bad.length) return <p>{s.sleepNights ? 'No bad nights logged. 🌙' : 'No sleep logged.'}</p>;
  const poor = s.bad.length - s.insomnia;
  const phase = mainPhase(s.bad, analysis);
  return (
    <>
      <p>
        {[s.insomnia && `${plural(s.insomnia, 'night')} of insomnia`, poor && plural(poor, 'poor night')]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {phase && <Note>Most bad nights were {phase.when}.</Note>}
    </>
  );
}

/** Sick days and the habits logged most often. */
function HappenedSection({ s }: { s: MonthStats }) {
  const { state } = useStore();
  if (!s.habitDays) {
    return (
      <Note>
        Nothing logged this month. Tap a day in “Mood, sleep &amp; habits” mode to add what happened, like
        being sick.
      </Note>
    );
  }
  const sick = s.habitCount.sick ?? 0;
  const byId = new Map(allHabits(state).map((h) => [h.id, h]));
  const top = Object.entries(s.habitCount)
    .filter(([id]) => id !== 'sick' && byId.has(id))
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3);
  return (
    <>
      <p>{sick ? `🤒 Sick ${plural(sick, 'day')}.` : 'No sick days logged.'}</p>
      {top.length > 0 && (
        <Note>
          {'Most logged: ' +
            top
              .map(([id, n]) => `${byId.get(id)!.emoji} ${byId.get(id)!.label} (${plural(n, 'day')})`)
              .join(', ') +
            ` · ${plural(s.habitDays, 'day')} logged.`}
        </Note>
      )}
    </>
  );
}
