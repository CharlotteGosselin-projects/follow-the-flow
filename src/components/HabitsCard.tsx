import { useState, type FormEvent } from 'react';
import { addCustomHabit, removeCustomHabit, setHabitHidden } from '../lib/actions.ts';
import { HABIT_MIN_SPAN, HABIT_SHOW } from '../lib/catalog.ts';
import { allHabits, habitInsights, type Comparison } from '../lib/habits.ts';
import { pct, plural } from '../lib/text.ts';
import { useStore } from '../store/AppStore.tsx';
import { HabitPicker } from './Pickers.tsx';
import { Button } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';
import { Findings, Note, Unlocking } from './ui/Text.tsx';

export function HabitsCard() {
  const { today } = useStore();
  return (
    <Card>
      <h2>Habits</h2>
      <Note>
        What happened today? Tap again to go up a level. If nothing applies, tap “None of these” so the day
        still counts: days you don&apos;t log are left out of the analysis.
      </Note>
      <HabitPicker id="habit-today" day={today} />
      <HabitSettings />
      <HabitLinks />
    </Card>
  );
}

function HabitSettings() {
  const { state, today, update } = useStore();
  const [emoji, setEmoji] = useState('');
  const [name, setName] = useState('');

  function add(e: FormEvent) {
    e.preventDefault();
    const result = addCustomHabit(state, emoji, name, today);
    if ('error' in result) {
      alert(result.error);
      return;
    }
    update(() => result);
    setEmoji('');
    setName('');
  }

  const input = 'min-w-0 rounded-[10px] border border-line bg-bg px-2.5 py-2';
  return (
    <details className="mt-3">
      <summary className="text-[.85rem] text-accent">Choose habits</summary>
      <Note>
        Untick habits you don&apos;t want to track. Habits you add only count from the day you add them.
      </Note>
      <div id="habit-manage">
        {allHabits(state).map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-2 py-1">
            <label>
              <input
                type="checkbox"
                className="accent-accent"
                checked={!state.hiddenHabits.includes(h.id)}
                onChange={(e) => update((s) => setHabitHidden(s, h.id, !e.target.checked))}
              />{' '}
              {h.emoji} {h.label}
            </label>
            {h.group === 'custom' && (
              <Button
                variant="danger"
                className="px-2.5 py-1 text-[.85rem]"
                onClick={() => {
                  if (confirm(`Remove “${h.label}” and everything logged for it?`))
                    update((s) => removeCustomHabit(s, h.id));
                }}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
      <form id="habit-add" className="mt-2 flex gap-1.5" onSubmit={add}>
        <input
          id="habit-emoji"
          type="text"
          maxLength={16}
          placeholder="⭐"
          aria-label="Emoji (optional)"
          className={`${input} w-[3.2em] text-center`}
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />
        <input
          id="habit-name"
          type="text"
          maxLength={30}
          placeholder="New habit"
          aria-label="Habit name"
          required
          className={`${input} flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>
    </details>
  );
}

/** What affects sleep and mood: unlocks after ~2 months of habit logging. */
function HabitLinks() {
  const { state, today, analysis } = useStore();
  const f = habitInsights(state, analysis, today);

  if (!f.ready) {
    const needs = [];
    if (f.span < HABIT_MIN_SPAN) needs.push(`${HABIT_MIN_SPAN - f.span} more days of tracking`);
    if (!analysis.last) needs.push('at least one logged period');
    return (
      <div id="habit-stats">
        <h3>What affects your sleep and mood</h3>
        <Unlocking
          intro="After about 2 months of logging, this shows which habits go with bad nights or certain moods, and when in your cycle each habit tends to happen."
          progress={(100 * f.span) / HABIT_MIN_SPAN}
          needs={needs}
        />
      </div>
    );
  }

  const vs = (r: Comparison) =>
    `${pct(r.observed)}% vs ${pct(r.expected)}% expected for the same cycle phases (${plural(r.n, 'day')}).`;
  const sections: [string, string[], string][] = [
    [
      'Linked to your sleep',
      f.sleep.map(
        (r) =>
          `${r.f.label}: ${r.observed > r.expected ? 'more' : 'fewer'} bad nights after these days. ${vs(r)}`,
      ),
      'No habit stands out for your sleep yet.',
    ],
    [
      'Linked to your mood',
      f.mood.map(
        (r) =>
          `${r.f.label}: ${r.mood.emoji} ${r.mood.label} ${r.observed > r.expected ? 'more' : 'less'} often on these days. ${vs(r)}`,
      ),
      'No habit stands out for your mood yet.',
    ],
    [
      'Across your cycle',
      f.cycle.map(
        (r) =>
          `${r.f.label}: most common ${r.phase.when} (${pct(r.rate)}% of those days vs ${pct(r.overall)}% overall).`,
      ),
      "Your habits don't seem tied to one part of your cycle.",
    ],
  ];
  return (
    <div id="habit-stats">
      {sections.map(([title, items, empty]) => (
        <div key={title}>
          <h3>{title}</h3>
          {items.length ? <Findings items={items.slice(0, HABIT_SHOW)} /> : <Note>{empty}</Note>}
        </div>
      ))}
      <Note>
        Each habit is compared with days without it in the same parts of your cycle, so PMS-time changes
        aren’t blamed on a habit. These are links in your own data, not proof of cause.
      </Note>
    </div>
  );
}
