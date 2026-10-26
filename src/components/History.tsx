import { diffDays, fmt } from '../lib/dates.ts';
import { useStore } from '../store/AppStore.tsx';
import { Card } from './ui/Card.tsx';

/** The last 12 periods, newest first. */
export function History() {
  const { analysis: a } = useStore();
  const rows = a.ps
    .map((p, i) => ({ p, i }))
    .slice(-12)
    .reverse();
  return (
    <Card>
      <h2>History</h2>
      <div id="history">
        {!rows.length ? (
          <p className="text-muted">No periods logged yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Period</th>
                <th>Cycle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, i }) => (
                <tr key={p.start}>
                  <td>{fmt(p.start, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>{diffDays(p.start, p.end) + 1} d</td>
                  <td>{i < a.cycles.length ? `${a.cycles[i]} d` : 'current'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
