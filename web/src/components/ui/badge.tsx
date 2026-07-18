import * as React from 'react';
import { cn } from '@/lib/utils';

/** Status → colour, matching the previous kit's semantics. */
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

function Badge({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { value: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
        badgeStyles[value] ?? 'bg-slate-100 text-slate-700',
        className,
      )}
      {...props}
    >
      {value}
    </span>
  );
}

export { Badge };
