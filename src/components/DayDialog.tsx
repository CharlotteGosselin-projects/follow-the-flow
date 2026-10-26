import { useEffect, useRef } from 'react';
import { clearDay } from '../lib/actions.ts';
import { fmt } from '../lib/dates.ts';
import type { IsoDate } from '../lib/types.ts';
import { useStore } from '../store/AppStore.tsx';
import { HabitPicker, MoodPicker, SleepPicker } from './Pickers.tsx';
import { Button, ButtonRow } from './ui/Button.tsx';

/** Log a past day's moods, the night before, and habits. Changes save as you tap. */
export function DayDialog({ day, onClose }: { day: IsoDate | null; onClose: () => void }) {
  const { state, update } = useStore();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (day && dialog && !dialog.open) dialog.showModal();
    if (!day && dialog?.open) dialog.close();
  }, [day]);

  const logged = !!day && !!(state.moods[day] || state.sleep[day] || state.habits[day]);

  return (
    <dialog
      id="mood-dialog"
      ref={ref}
      onClose={onClose}
      className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-2xl border border-line bg-card p-4 text-ink"
    >
      {day && (
        <>
          <h2 id="mood-dialog-title">{fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <h3 className="mt-3 mb-1.5">Mood</h3>
          <MoodPicker id="mood-dialog-options" day={day} />
          <h3 className="mt-3 mb-1.5">Sleep the night before</h3>
          <SleepPicker id="sleep-dialog-options" day={day} />
          <h3 className="mt-3 mb-1.5">Habits</h3>
          <HabitPicker id="habit-dialog-options" day={day} />
          <ButtonRow>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
            {logged && (
              <Button
                id="mood-clear"
                onClick={() => {
                  update((s) => clearDay(s, day));
                  onClose();
                }}
              >
                Clear all
              </Button>
            )}
          </ButtonRow>
        </>
      )}
    </dialog>
  );
}
