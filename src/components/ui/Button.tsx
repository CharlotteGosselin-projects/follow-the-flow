import type { ComponentProps } from 'react';

type Variant = 'plain' | 'primary' | 'danger';

const variants: Record<Variant, string> = {
  plain: 'border-line hover:border-accent',
  primary: 'border-accent bg-accent text-white',
  danger: 'border-line text-period hover:border-accent',
};

export const buttonClass = (variant: Variant = 'plain') =>
  `inline-block rounded-[10px] border px-3.5 py-2 ${variants[variant]}`;

export function Button({
  variant,
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />;
}

/** A row of buttons that wraps on narrow screens. */
export function ButtonRow({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`mt-2.5 flex flex-wrap gap-2 ${className}`} {...props} />;
}
