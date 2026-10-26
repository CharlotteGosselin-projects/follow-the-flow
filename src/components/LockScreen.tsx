import { useState, type FormEvent } from 'react';
import { useGate } from '../store/AppStore.tsx';
import { buttonClass } from './ui/Button.tsx';

export function LockScreen() {
  const { unlock } = useGate();
  const [pass, setPass] = useState('');
  const [wrong, setWrong] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await unlock(pass);
    } catch {
      setWrong(true);
    }
  }

  return (
    <section id="lock" className="mx-auto flex min-h-screen max-w-[560px] items-center justify-center p-4">
      <div className="w-full max-w-[360px] rounded-2xl border border-line bg-card p-4">
        <h1>Follow the Flow</h1>
        <p className="my-3 text-muted">
          Your data is encrypted on this device. Enter your passphrase to unlock it.
        </p>
        <form id="unlock-form" onSubmit={submit}>
          <input
            id="unlock-pass"
            type="password"
            autoComplete="current-password"
            placeholder="Passphrase"
            required
            autoFocus
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="my-2 w-full rounded-[10px] border border-line bg-bg px-3 py-2.5"
          />
          <button type="submit" className={`${buttonClass('primary')} w-full`}>
            Unlock
          </button>
        </form>
        {wrong && (
          <p id="unlock-error" className="mt-3 text-period">
            Wrong passphrase.
          </p>
        )}
      </div>
    </section>
  );
}
