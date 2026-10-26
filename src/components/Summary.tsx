import { Fragment } from 'react';
import { DEFAULT_CYCLE } from '../lib/catalog.ts';
import { diffDays, fmt } from '../lib/dates.ts';
import { plural } from '../lib/text.ts';
import { useStore } from '../store/AppStore.tsx';
import { Button } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';
import { Note } from './ui/Text.tsx';

/** Where you are in your cycle and when the next period is due. */
export function Summary({ onTogglePeriod }: { onTogglePeriod: (d: string) => void }) {
  const { state, today, analysis: a } = useStore();

  if (!a.last || !a.nextStart) {
    return (
      <Card id="summary">
        <h2>Welcome</h2>
        <p>
          Tap the days of your last period on the calendar below to start. Predictions improve as you log more
          cycles.
        </p>
      </Card>
    );
  }

  const cycleDay = diffDays(a.last.start, today) + 1;
  const toNext = diffDays(today, a.nextStart);
  const inPeriod = state.days.includes(today);
  const headline = inPeriod
    ? `Period · day ${cycleDay}`
    : toNext > 0
      ? `${plural(toNext, 'day')} until next period`
      : toNext === 0
        ? 'Period expected today'
        : `Period ${plural(-toNext, 'day')} late`;

  const stats: [string, string][] = [
    ['Cycle day', String(cycleDay)],
    ['Next period', fmt(a.nextStart, { weekday: 'short', day: 'numeric', month: 'short' })],
    ['Avg. cycle', `${a.cycleLen} days`],
    ['Avg. period', `${a.periodLen} days`],
  ];

  return (
    <Card id="summary">
      <div className="big mb-3 text-2xl font-[650]">{headline}</div>
      <dl className="mb-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {stats.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-[.8rem] text-muted">{k}</dt>
            <dd className="mb-1 font-semibold">{v}</dd>
          </Fragment>
        ))}
      </dl>
      <Note>
        {a.sample
          ? `Based on your last ${plural(a.sample, 'cycle')}.`
          : `Using a default ${DEFAULT_CYCLE}-day cycle until you log a second period.`}
      </Note>
      <Button variant="primary" className="mt-2" onClick={() => onTogglePeriod(today)}>
        {inPeriod ? 'Unmark today' : 'Period started today'}
      </Button>
    </Card>
  );
}
