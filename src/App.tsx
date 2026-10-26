import { useState } from 'react';
import { markExported, togglePeriodDay } from './lib/actions.ts';
import { backupFileName, toBackup } from './lib/backup.ts';
import { startOfMonth } from './lib/dates.ts';
import type { IsoDate } from './lib/types.ts';
import { useGate, useStore } from './store/AppStore.tsx';
import { Calendar, type TapMode } from './components/Calendar.tsx';
import { DataCard } from './components/DataCard.tsx';
import { DayDialog } from './components/DayDialog.tsx';
import { HabitsCard } from './components/HabitsCard.tsx';
import { History } from './components/History.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { MoodCard } from './components/MoodCard.tsx';
import { MonthRecap } from './components/recap/MonthRecap.tsx';
import { Reminder } from './components/Reminder.tsx';
import { SleepCard } from './components/SleepCard.tsx';
import { Summary } from './components/Summary.tsx';

export function App() {
  const { locked } = useGate();
  return locked ? <LockScreen /> : <Tracker />;
}

function Tracker() {
  const { state, today, update } = useStore();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [mode, setMode] = useState<TapMode>('period');
  const [dialogDay, setDialogDay] = useState<IsoDate | null>(null);

  function togglePeriod(d: IsoDate) {
    if (d > today && !state.days.includes(d) && !confirm('Mark a future day as a period day?')) return;
    update((s) => togglePeriodDay(s, d));
  }

  function openDay(d: IsoDate) {
    if (d > today) alert('You can only log moods, sleep and habits for today or past days.');
    else setDialogDay(d);
  }

  // The backup is a file the browser saves locally; nothing is uploaded.
  function exportBackup() {
    const blob = new Blob([JSON.stringify(toBackup(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(today);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    update((s) => markExported(s, today));
  }

  return (
    <main id="app" className="mx-auto max-w-[560px] p-4">
      <header className="mt-1 mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1>Follow the Flow</h1>
        <span
          title="This app makes no network requests. Data stays in this browser."
          className="rounded-full border border-line bg-card px-2.5 py-1 text-[.78rem] text-muted"
        >
          🔒 Offline · nothing sent
        </span>
      </header>
      <Reminder onExport={exportBackup} />
      <Summary onTogglePeriod={togglePeriod} />
      <MoodCard />
      <SleepCard />
      <HabitsCard />
      <Calendar
        month={month}
        onMonth={setMonth}
        mode={mode}
        onMode={setMode}
        onTapDay={(d) => (mode === 'period' ? togglePeriod(d) : openDay(d))}
      />
      <MonthRecap month={month} />
      <History />
      <DataCard onExport={exportBackup} />
      <footer className="pt-2 pb-6 text-center text-[.85rem] text-muted">
        Predictions are estimates based on your past cycles. They are not medical advice or contraception.
      </footer>
      <DayDialog day={dialogDay} onClose={() => setDialogDay(null)} />
    </main>
  );
}
