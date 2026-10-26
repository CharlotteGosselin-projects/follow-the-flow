import { MOOD_BY_ID, MOOD_MIN_ENTRIES, MOOD_MIN_SPAN } from '../lib/catalog.ts';
import { fmt } from '../lib/dates.ts';
import { moodForecast } from '../lib/mood.ts';
import { useStore } from '../store/AppStore.tsx';
import { MoodPicker } from './Pickers.tsx';
import { Card } from './ui/Card.tsx';
import { Note, Unlocking } from './ui/Text.tsx';

export function MoodCard() {
  const { state, today, analysis } = useStore();
  const f = moodForecast(state.moods, analysis, today);

  let forecast;
  if (!f.ready) {
    const needs = [];
    if (f.span < MOOD_MIN_SPAN) needs.push(`${MOOD_MIN_SPAN - f.span} more days of history`);
    if (f.count < MOOD_MIN_ENTRIES) needs.push(`${MOOD_MIN_ENTRIES - f.count} more mood entries`);
    if (!analysis.last) needs.push('at least one logged period');
    forecast = (
      <Unlocking
        intro="Pick as many moods as fit. Your mood forecast unlocks after about 2 months of mood logging, so it can learn how you usually feel at each point of your cycle."
        progress={100 * Math.min(f.span / MOOD_MIN_SPAN, f.count / MOOD_MIN_ENTRIES)}
        needs={needs}
        almost="Almost there. Keep logging moods after your periods."
      />
    );
  } else {
    forecast = (
      <>
        <ul className="m-0 list-none p-0">
          {f.days.map((d, i) => (
            <li
              key={d.date}
              className="flex items-center gap-2.5 border-b border-line py-1.5 last:border-b-0"
            >
              <span className="w-[6.5em] shrink-0 text-[.88rem] whitespace-nowrap text-muted">
                {i === 0 ? 'Today' : fmt(d.date, { weekday: 'short', day: 'numeric' })}
              </span>
              <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[.9rem]">
                {d.moods.length
                  ? d.moods.map((m) => (
                      <span key={m.id} className="whitespace-nowrap">
                        {MOOD_BY_ID[m.id].emoji} {MOOD_BY_ID[m.id].label} {m.pct}%
                      </span>
                    ))
                  : 'Not enough data'}
              </span>
              <span className="ml-auto text-[.8rem] whitespace-nowrap text-muted">day {d.cycleDay}</span>
            </li>
          ))}
        </ul>
        <Note>
          Percentages show how often you felt each mood on the same days of past cycles. Just a pattern, not a
          certainty.
        </Note>
      </>
    );
  }

  return (
    <Card>
      <h2>Mood</h2>
      <Note>How do you feel today? Pick as many as you like.</Note>
      <MoodPicker id="mood-today" day={today} />
      <h3>Next 7 days</h3>
      <div id="forecast">{forecast}</div>
    </Card>
  );
}
