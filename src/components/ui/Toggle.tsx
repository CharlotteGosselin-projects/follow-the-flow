import type { ComponentProps, ReactNode } from 'react';

/** A pill that stays highlighted while on (moods, sleep, habits). */
export function ToggleChip({ on, className = '', ...props }: ComponentProps<'button'> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`rounded-full border border-line px-2.5 py-1.5 text-[.9rem] hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white ${className}`}
      {...props}
    />
  );
}

/** A wrapping group of chips. */
export function ChipGroup({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={`flex flex-wrap gap-1.5 ${className}`}
    >
      {children}
    </div>
  );
}

/** Pick one of a few options (calendar mode, chart range). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string;
  options: { value: T; label: string; id?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex w-fit gap-1 rounded-xl border border-line p-[3px] ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          id={o.id}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-[10px] px-3 py-1.5 aria-pressed:bg-accent aria-pressed:text-white"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
