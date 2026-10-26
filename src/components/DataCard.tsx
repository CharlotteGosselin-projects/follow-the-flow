import { mergeBackup, sanitize } from '../lib/backup.ts';
import { useStore } from '../store/AppStore.tsx';
import { Button, ButtonRow, buttonClass } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';
import { Note } from './ui/Text.tsx';

/** Backups, passphrase and wiping. Everything stays on this device. */
export function DataCard({ onExport }: { onExport: () => void }) {
  const { lock, update, setPassphrase, removePassphrase, lockNow, wipe } = useStore();

  async function importFile(file: File) {
    try {
      const incoming = sanitize(JSON.parse(await file.text()));
      const count = (o: object) => Object.keys(o).length;
      const question =
        `Import ${incoming.days.length} period days, moods for ${count(incoming.moods)} days, ` +
        `${count(incoming.sleep)} bad nights and habits for ${count(incoming.habits)} days? ` +
        'They will be merged with your current data.';
      if (confirm(question)) update((s) => mergeBackup(s, incoming));
    } catch {
      alert('That file could not be read as a Follow the Flow backup.');
    }
  }

  async function choosePassphrase() {
    const first = prompt('Choose a passphrase. If you forget it, your data cannot be recovered.');
    if (!first) return;
    if (prompt('Repeat the passphrase:') !== first) {
      alert('The passphrases did not match.');
      return;
    }
    await setPassphrase(first);
  }

  return (
    <Card>
      <h2>Your data</h2>
      <Note>
        Everything is saved only in this browser on this device. Nothing is ever uploaded. If you clear your
        browser data or change devices it&apos;s gone, so export a backup file from time to time.
      </Note>
      <ButtonRow>
        <Button id="export" onClick={onExport}>
          Export backup
        </Button>
        <label className={buttonClass()}>
          Import backup
          <input
            id="import"
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </ButtonRow>
      <ButtonRow>
        <Button id="set-pass" onClick={choosePassphrase}>
          {lock ? 'Change passphrase' : 'Set passphrase'}
        </Button>
        {lock && (
          <>
            <Button
              id="remove-pass"
              onClick={() => confirm('Store your data unencrypted on this device?') && removePassphrase()}
            >
              Remove passphrase
            </Button>
            <Button id="lock-now" onClick={lockNow}>
              Lock now
            </Button>
          </>
        )}
      </ButtonRow>
      <ButtonRow>
        <Button
          id="wipe"
          variant="danger"
          onClick={() => confirm('Delete all your data from this device? This cannot be undone.') && wipe()}
        >
          Delete all data
        </Button>
      </ButtonRow>
    </Card>
  );
}
