import { useState } from 'react';
import { chartPicks, toggleChartPick } from '../../lib/actions.ts';
import { RECAP_CHARTS } from '../../lib/catalog.ts';
import {
  chartSeries,
  chartTotals,
  levelText,
  niceMax,
  rangeDays,
  recapInsights,
  type Range,
} from '../../lib/charts.ts';
import { addMonths, daysBetween, fmt } from '../../lib/dates.ts';
import { pct, plural } from '../../lib/text.ts';
import { useStore } from '../../store/AppStore.tsx';
import { Findings, Note } from '../ui/Text.tsx';
import { Segmented } from '../ui/Toggle.tsx';
import { LineChart } from './LineChart.tsx';

/** One habit's data over the charted range. */
interface Line {
  key: string;
  label: string;
  title: string;
  summary: string;
  /** Plotted values on the shared scale, readout texts and table cells, per position. */
  values: (number | null)[];
  texts: string[];
  cells: string[];
  /** Colour slot 1–3 when shown, else 0. */
  slot: number;
}

export function RecapCharts({ month }: { month: string }) {
  const { state, today, analysis, update } = useStore();
  const [range, setRange] = useState<Range>('month');
  const [full, setFull] = useState(false);
  const year = month.slice(0, 4);
  const days = rangeDays(range, month);
  const months = range === 'year' ? Array.from({ length: 12 }, (_, i) => addMonths(days[0]!, i)) : null;
  const columns = months ?? days;
  const picks = chartPicks(state);

  // Everything with data in this range.
  const lines: Line[] = [];
  for (const def of RECAP_CHARTS) {
    const c = chartSeries(def, state, today);
    if (!c) continue;
    const t = chartTotals(c, days);
    if (!t.hit) continue;
    const total = (sum: number, hit: number) => (c.key === 'sleep' ? c.total(hit) : c.total(sum));
    const line: Line = {
      key: c.key,
      label: `${c.emoji} ${c.title}`,
      title: c.title,
      summary: total(t.sum, t.hit) + (c.amount ? ` · ${plural(t.hit, 'day')}` : ''),
      values: [],
      texts: [],
      cells: [],
      slot: picks.indexOf(c.key) + 1,
    };
    if (months) {
      // Per month: the share of logged days with the habit, so different habits share one scale.
      for (const m of months) {
        const mt = m > today ? null : chartTotals(c, daysBetween(m, 1));
        line.values.push(mt?.logged ? mt.hit / mt.logged : null);
        line.texts.push(
          !mt
            ? 'not yet'
            : !mt.logged
              ? 'not logged'
              : `${total(mt.sum, mt.hit)}${c.amount ? ` over ${plural(mt.hit, 'day')}` : ''} (${pct(mt.hit / mt.logged)}%)`,
        );
        line.cells.push(!mt ? '' : !mt.logged ? '–' : total(mt.sum, mt.hit));
      }
    } else {
      // Per day: how high that day's level is, from none (0) to the habit's top level (1).
      for (const d of days) {
        const v = d > today ? null : c.value(d);
        line.values.push(v == null ? null : v / c.levels.length);
        line.texts.push(d > today ? 'not yet' : levelText(c, v));
        line.cells.push(d > today ? '' : v == null ? '–' : levelText(c, v));
      }
    }
    lines.push(line);
  }

  const shown = lines.filter((l) => l.slot).sort((x, y) => x.slot - y.slot);
  // Top of the scale: the day view runs from none to each habit's top level (0–1); the year
  // view from 0 to a round percentage just above the highest month.
  const highest = Math.max(0, ...shown.flatMap((l) => l.values.map((v) => v ?? 0)));
  const top = months ? Math.min(1, niceMax(100 * highest) / 100) : 1;
  const allTaken = picks.every(Boolean);
  const insights = recapInsights(state, analysis, range, month, today);
  const scope = range === 'year' ? year : 'this month';

  return (
    <>
      <h3>Charts</h3>
      <Segmented
        label="Chart period"
        className="recap-range mt-1 mb-2"
        value={range}
        onChange={setRange}
        options={[
          { value: 'month', label: fmt(month, { month: 'long' }) },
          { value: 'year', label: year },
        ]}
      />
      {!lines.length ? (
        <Note>
          Nothing to chart for {scope} yet. Log alcohol, meetings, caffeine, sleep and more from the Habits
          and Sleep cards.
        </Note>
      ) : (
        <>
          {/* The legend doubles as the picker: tap to show or hide a line, up to three at once. */}
          <div
            role="group"
            aria-label="Lines to show"
            className="mt-1 mb-2.5 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5"
          >
            {lines.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={!!l.slot}
                title={!l.slot && allTaken ? 'Up to 3 lines at a time' : undefined}
                onClick={() => {
                  const next = toggleChartPick(state, l.key);
                  if (next) {
                    update(() => next);
                    setFull(false);
                  } else setFull(true);
                }}
                className={`chip-pick ${l.slot ? `s${l.slot}` : ''} grid min-w-0 grid-cols-[auto_1fr] content-start items-center gap-x-1.5 rounded-[10px] border border-line px-2.5 py-1 text-left text-[.85rem] aria-pressed:border-(--series)`}
              >
                <span
                  className={
                    l.slot
                      ? 'w-3.5 rounded-xs border-t-[3px] border-(--series)'
                      : 'w-3.5 border-t-2 border-dashed border-muted'
                  }
                />
                <span>{l.label}</span>
                <span className="col-start-2 text-[.78rem] text-muted">{l.summary}</span>
              </button>
            ))}
          </div>
          {full && (
            <Note className="picker-note -mt-1 mb-2">
              Up to 3 lines at a time. Turn one off to add another.
            </Note>
          )}
          {!shown.length ? (
            <Note>Pick up to 3 to draw them on the chart.</Note>
          ) : (
            <LineChart
              series={shown.map((l) => ({ slot: l.slot, values: l.values }))}
              n={columns.length}
              max={top}
              topLabel={months ? `${pct(top)}% of days` : 'most'}
              ticks={
                months
                  ? months.map((m, i) => [i, fmt(m, { month: 'narrow' })])
                  : [0, 7, 14, 21, 28].filter((i) => i < days.length).map((i) => [i, String(i + 1)])
              }
              title={`${shown.map((l) => l.title).join(', ')}, ${months ? `share of logged days per month in ${year}` : `per day in ${fmt(month, { month: 'long', year: 'numeric' })}`}`}
              readout={(i) => ({
                head: months
                  ? fmt(columns[i]!, { month: 'long' })
                  : fmt(columns[i]!, { weekday: 'short', day: 'numeric', month: 'short' }),
                rows: shown.map((l) => ({ slot: l.slot, value: l.texts[i]!, name: l.title })),
              })}
            />
          )}
          <Note>
            {range === 'year'
              ? 'Each point is the share of logged days with that habit in the month (for sleep, the share of bad nights). Months with nothing logged leave a gap. Tap the chart for totals.'
              : 'Each line goes from none at the bottom to its highest level at the top (5+ drinks, meetings all day, insomnia…). Days with nothing logged leave a gap. Tap the chart for details.'}
          </Note>
          <NumbersTable range={range} columns={columns} today={today} lines={lines} />
          {insights.length > 0 && (
            <>
              <h3>Insights</h3>
              <Findings items={insights} />
              <Note>Counted over {scope}. Patterns in your own data, not proof of cause.</Note>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Every charted value, for reading without the chart. */
function NumbersTable({
  range,
  columns,
  today,
  lines,
}: {
  range: Range;
  columns: string[];
  today: string;
  lines: Line[];
}) {
  return (
    <details className="chart-table">
      <summary className="my-2 text-[.85rem] text-accent">See the numbers</summary>
      <div className="overflow-x-auto">
        <table className="text-[.8rem] tabular-nums [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead>
            <tr>
              <th>{range === 'year' ? 'Month' : 'Day'}</th>
              {lines.map((l) => (
                <th key={l.key}>{l.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((col, i) =>
              col > today ? null : (
                <tr key={col}>
                  <td>
                    {range === 'year'
                      ? fmt(col, { month: 'short' })
                      : fmt(col, { weekday: 'short', day: 'numeric' })}
                  </td>
                  {lines.map((l) => (
                    <td key={l.key}>{l.cells[i]}</td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
