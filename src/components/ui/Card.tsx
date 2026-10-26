import type { ComponentProps } from 'react';

export function Card({ className = '', ...props }: ComponentProps<'section'>) {
  return <section className={`mb-4 rounded-2xl border border-line bg-card p-4 ${className}`} {...props} />;
}
