import { MOOD_BY_ID, SLEEP_BY_ID } from '../lib/catalog.ts';
import { predictions } from '../lib/cycle.ts';
import { addDays, addMonths, daysBetween, fmt, weekdayIndex } from '../lib/dates.ts';
import type { IsoDate } from '../lib/types.ts';
import { useStore } from '../store/AppStore.tsx';
import { Card } from './ui/Card.tsx';
import { Segmented } from './ui/Toggle.tsx';

export type TapMode = 'period' | 'mood';

/** Seven equal columns even when a day holds wide content like emoji. */
const grid = 'grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1';

const LEGEND = [
  ['bg-period', 'Period'],
  ['border border-dashed border-period bg-predicted', 'Predicted period'],
  ['bg-fertile', 'Fertile window (estimate)'],
  ['bg-ovulation', 'Ovulation (estimate)'],
  ['border-2 border-sleep', 'Poor sleep'],
  ['bg-sleep', 'Insomnia'],
] as const;

export function Calendar({
  month,
  onMonth,
  mode,
  onMode,
  onTapDay,
}: {
  month: IsoDate;
  onMonth: (m: IsoDate) => void;
  mode: TapMode;
  onMode: (m: TapMode) => void;
  onTapDay: (d: IsoDate) => void;
}) {
  const { state, today, analysis } = useStore();
  const { predicted, fertile, ovulation } = predictions(analysis, state.days);
  const marked = new Set(state.days);

  return (
    <Card>
      <Segmented
        label="What tapping a day does"
        className="mb-3"
        value={mode}
        onChange={onMode}
        options={[
          { value: 'period', label: '🩸 Period', id: 'mode-period' },
          { value: 'mood', label: '🙂 Mood, sleep & habits', id: 'mode-mood' },
        ]}
      />
      <div className="mb-2 flex items-center justify-between">
        <button
          id="prev"
          aria-label="Previous month"
          className="px-3 py-1 text-2xl/none"
          onClick={() => onMonth(addMonths(month, -1))}
        >
          ‹
        </button>
        <h2 id="month-label" className="m-0">
          {fmt(month, { month: 'long', year: 'numeric' })}
        </h2>
        <button
          id="next"
          aria-label="Next month"
          className="px-3 py-1 text-2xl/none"
          onClick={() => onMonth(addMonths(month, 1))}
        >
          ›
        </button>
      </div>
      <div id="weekdays" className={grid}>
        {/* 2024-01-01 was a Monday */}
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="pb-1 text-center text-xs text-muted">
            {fmt(addDays('2024-01-01', i), { weekday: 'narrow' })}
          </span>
        ))}
      </div>
      <div id="calendar" className={grid}>
        {Array.from({ length: weekdayIndex(month) }, (_, i) => (
          <span key={`empty-${i}`} className="cell empty invisible" />
        ))}
        {daysBetween(month, 1).map((d) => {
          const moods = (state.moods[d] ?? []).map((id) => MOOD_BY_ID[id]);
          const sick = !!state.habits[d]?.sick;
          const marks = [...(sick ? ['🤒'] : []), ...moods.map((m) => m.emoji)];
          const sleep = state.sleep[d];
          const kind = marked.has(d)
            ? 'period'
            : predicted.has(d)
              ? 'predicted'
              : ovulation.has(d)
                ? 'ovulation'
                : fertile.has(d)
                  ? 'fertile'
                  : '';
          const classes = [
            'cell',
            kind,
            sleep && `sleep-${sleep}`,
            d === today && 'today',
            d > today && 'future',
          ].filter(Boolean);
          const label =
            fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) +
            (marked.has(d) ? ', period' : '') +
            (moods.length ? `, mood ${moods.map((m) => m.label).join(', ')}` : '') +
            (sleep ? `, ${SLEEP_BY_ID[sleep]!.label.toLowerCase()}` : '') +
            (sick ? ', sick' : '');
          return (
            <button
              key={d}
              type="button"
              aria-label={label}
              aria-pressed={mode === 'period' ? marked.has(d) : undefined}
              onClick={() => onTapDay(d)}
              className={classes.join(' ')}
            >
              <span>{Number(d.slice(8))}</span>
              {marks.length > 0 && (
                <span className="mood-mark pointer-events-none absolute inset-x-0 bottom-0.5 overflow-hidden text-center text-[.6rem]/none whitespace-nowrap">
                  {/* Room for two emoji; '+' hints at more. */}
                  {marks.slice(0, 2).join('') + (marks.length > 2 ? '+' : '')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p id="cal-hint" className="my-1 text-[.85rem] text-muted">
        {mode === 'period'
          ? 'Tap a day to mark or unmark it as a period day.'
          : 'Tap a day to log its moods, habits and how you slept the night before.'}
      </p>
      <ul className="mt-2 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 text-[.8rem] text-muted">
        {LEGEND.map(([swatch, text]) => (
          <li key={text}>
            <span className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${swatch}`} />
            {text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
