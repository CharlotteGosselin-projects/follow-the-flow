import { backupDue, snoozeReminder } from '../lib/actions.ts';
import { diffDays, fmt } from '../lib/dates.ts';
import { useStore } from '../store/AppStore.tsx';
import { Button, ButtonRow } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';

/** The weekly "export a backup" banner. */
export function Reminder({ onExport }: { onExport: () => void }) {
  const { state, today, update } = useStore();
  if (!backupDue(state, today)) return null;
  return (
    <Card id="reminder" className="border-accent">
      <p>
        <strong>Time for your weekly backup.</strong>{' '}
        <span id="reminder-text">
          {state.lastExport
            ? `Your last export was ${diffDays(state.lastExport, today)} days ago (${fmt(state.lastExport)}).`
            : "You haven't exported a backup yet."}
        </span>
      </p>
      <ButtonRow>
        <Button id="reminder-export" variant="primary" onClick={onExport}>
          Export now
        </Button>
        <Button id="reminder-snooze" onClick={() => update((s) => snoozeReminder(s, today))}>
          Remind me tomorrow
        </Button>
      </ButtonRow>
    </Card>
  );
}
