import type { ComponentProps } from 'react';

/** Secondary explanatory text. */
export function Note({ className = '', ...props }: ComponentProps<'p'>) {
  return <p className={`my-1 text-[.85rem] text-muted ${className}`} {...props} />;
}

/** A thin bar showing progress towards unlocking a feature. */
export function Progress({ value }: { value: number }) {
  return (
    <div className="my-1.5 h-2 overflow-hidden rounded-full bg-line">
      <span className="block h-full bg-accent" style={{ width: `${Math.min(100, Math.round(value))}%` }} />
    </div>
  );
}

/** "Still needed: …" with a progress bar, for features that unlock after ~2 months. */
export function Unlocking({
  intro,
  progress,
  needs,
  almost = 'Almost there.',
}: {
  intro: string;
  progress: number;
  needs: string[];
  almost?: string;
}) {
  return (
    <>
      <Note>{intro}</Note>
      <Progress value={progress} />
      <Note>{needs.length ? `Still needed: ${needs.join(', ')}.` : almost}</Note>
    </>
  );
}

/** A plain list of findings with hairlines between items. */
export function Findings({ items }: { items: string[] }) {
  return (
    <ul className="m-0 list-none p-0 text-[.9rem]">
      {items.map((t) => (
        <li key={t} className="border-b border-line py-1.5 last:border-b-0">
          {t}
        </li>
      ))}
    </ul>
  );
}
