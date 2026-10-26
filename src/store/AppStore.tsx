// App-wide data: the stored State, the passphrase lock, and today's date. Every change
// goes through `update`, which saves (encrypted when a passphrase is set).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { emptyState, sanitize } from '../lib/backup.ts';
import { newLock, seal, unseal, type Lock } from '../lib/crypto.ts';
import { analyse } from '../lib/cycle.ts';
import { todayIso } from '../lib/dates.ts';
import { hasData } from '../lib/actions.ts';
import type { Analysis, IsoDate, State } from '../lib/types.ts';
import { clearStored, loadStored, saveStored } from './storage.ts';

/** `dirty`: the data changed and needs saving (not after unlocking, locking or wiping). */
type Session = { open: false } | { open: true; state: State; lock: Lock | null; dirty: boolean };

interface Store {
  state: State;
  lock: Lock | null;
  today: IsoDate;
  analysis: Analysis;
  update: (change: (s: State) => State) => void;
  setPassphrase: (pass: string) => Promise<void>;
  removePassphrase: () => void;
  lockNow: () => void;
  wipe: () => void;
}

interface Gate {
  locked: boolean;
  /** Rejects when the passphrase is wrong. */
  unlock: (pass: string) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);
const GateContext = createContext<Gate | null>(null);

function initialSession(today: IsoDate): Session {
  const raw = loadStored();
  if (raw?.enc) return { open: false };
  const state = sanitize(raw?.data);
  // Older data may predate the backup reminder: start its clock now.
  if (hasData(state) && !state.createdAt) state.createdAt = today;
  return { open: true, state, lock: null, dirty: false };
}

/** Re-renders when the app comes back to the foreground, so "today" rolls over. */
function useToday(): IsoDate {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const check = () => setToday(todayIso());
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  return today;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const today = useToday();
  const [session, setSession] = useState<Session>(() => initialSession(today));

  // Save after every change. Saves run one after another so an older, slower encryption
  // never overwrites a newer one.
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (!session.open || !session.dirty) return;
    const { state, lock } = session;
    queue.current = queue.current.then(async () => saveStored(await seal(state, lock)));
  }, [session]);

  const update = useCallback(
    (change: (s: State) => State) =>
      setSession((s) => {
        if (!s.open) return s;
        const next = change(s.state);
        return { ...s, state: next.createdAt ? next : { ...next, createdAt: today }, dirty: true };
      }),
    [today],
  );

  const gate = useMemo<Gate>(
    () => ({
      locked: !session.open,
      unlock: async (pass) => {
        const raw = loadStored();
        if (!raw?.enc) throw new Error('Nothing to unlock');
        const { lock, data } = await unseal(raw, pass);
        setSession({ open: true, state: sanitize(data), lock, dirty: false });
      },
    }),
    [session.open],
  );

  const store = useMemo<Store | null>(() => {
    if (!session.open) return null;
    const { state, lock } = session;
    return {
      state,
      lock,
      today,
      analysis: analyse(state.days, today),
      update,
      setPassphrase: async (pass) => {
        const next = await newLock(pass);
        setSession({ open: true, state, lock: next, dirty: true });
      },
      removePassphrase: () => setSession({ open: true, state, lock: null, dirty: true }),
      lockNow: () => setSession({ open: false }),
      wipe: () => {
        clearStored();
        setSession({ open: true, state: emptyState(), lock: null, dirty: false });
      },
    };
  }, [session, today, update]);

  return (
    <GateContext.Provider value={gate}>
      <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    </GateContext.Provider>
  );
}

/** The open app's data and actions. Only use inside the unlocked app. */
export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore needs an unlocked AppStoreProvider');
  return store;
}

export function useGate(): Gate {
  const gate = useContext(GateContext);
  if (!gate) throw new Error('useGate needs an AppStoreProvider');
  return gate;
}
