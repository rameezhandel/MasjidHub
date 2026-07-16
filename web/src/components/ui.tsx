'use client';

import { clsx } from 'clsx';

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-1 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-emerald-700 text-white hover:bg-emerald-800',
        variant === 'secondary' &&
          'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100',
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-600',
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100',
        props.className,
      )}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>;
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const badgeStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  SUSPENDED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-red-100 text-red-800',
  ARCHIVED: 'bg-slate-200 text-slate-600',
  INACTIVE: 'bg-amber-100 text-amber-800',
  MOVED_OUT: 'bg-slate-200 text-slate-600',
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={clsx(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
        badgeStyles[value] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {value}
    </span>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-red-600">{children}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}
