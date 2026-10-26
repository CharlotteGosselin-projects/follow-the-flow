// The mood, sleep and habit buttons for one day, used both for today and in the day dialog.

import { nextLevel, setHabit, setHabitDay, setSleep, toggleMood } from '../lib/actions.ts';
import { HABIT_GROUPS, MOODS, SLEEP } from '../lib/catalog.ts';
import { activeHabits } from '../lib/habits.ts';
import type { IsoDate } from '../lib/types.ts';
import { useStore } from '../store/AppStore.tsx';
import { ChipGroup, ToggleChip } from './ui/Toggle.tsx';

export function MoodPicker({ day, id }: { day: IsoDate; id?: string }) {
  const { state, update } = useStore();
  const selected = state.moods[day] ?? [];
  return (
    <div id={id} className="flex flex-wrap gap-1.5">
      {MOODS.map((m) => (
        <ToggleChip
          key={m.id}
          on={selected.includes(m.id)}
          onClick={() => update((s) => toggleMood(s, day, m.id))}
        >
          {m.emoji} {m.label}
        </ToggleChip>
      ))}
    </div>
  );
}

/** One choice at most: tapping the selected one clears it. */
export function SleepPicker({ day, id }: { day: IsoDate; id?: string }) {
  const { state, update } = useStore();
  return (
    <div id={id} className="flex flex-wrap gap-1.5">
      {SLEEP.map((k) => {
        const on = state.sleep[day] === k.id;
        return (
          <ToggleChip key={k.id} on={on} onClick={() => update((s) => setSleep(s, day, on ? null : k.id))}>
            {k.emoji} {k.label}
          </ToggleChip>
        );
      })}
    </div>
  );
}

/** Habits by group. Tapping a levelled habit steps up a level, then back to off. */
export function HabitPicker({ day, id }: { day: IsoDate; id?: string }) {
  const { state, update } = useStore();
  const logged = state.habits[day];
  const shown = activeHabits(state);
  const isNone = !!logged && !Object.keys(logged).length;
  return (
    <div id={id}>
      {HABIT_GROUPS.map((g) => {
        const habits = shown.filter((h) => h.group === g.id);
        if (!habits.length) return null;
        return (
          <div key={g.id}>
            <p className="mt-2.5 mb-1 text-[.85rem] text-muted">{g.label}</p>
            <ChipGroup label={g.label}>
              {habits.map((h) => {
                const level = logged?.[h.id] ?? 0;
                const levels = h.levels?.length ?? 1;
                return (
                  <ToggleChip
                    key={h.id}
                    on={!!level}
                    title={h.levels ? `Tap again for more: ${h.levels.join(' → ')}` : undefined}
                    onClick={() => update((s) => setHabit(s, day, h.id, nextLevel(level, levels)))}
                  >
                    {h.emoji} {h.label}
                    {level > 0 && h.levels ? ` · ${h.levels[level - 1]}` : ''}
                  </ToggleChip>
                );
              })}
            </ChipGroup>
          </div>
        );
      })}
      <div className="mt-2.5">
        <ToggleChip on={isNone} onClick={() => update((s) => setHabitDay(s, day, isNone ? null : {}))}>
          ∅ None of these
        </ToggleChip>
      </div>
    </div>
  );
}
