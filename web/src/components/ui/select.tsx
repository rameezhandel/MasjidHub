import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Native styled <select>. We keep the native element (not the Radix Select)
 * so existing `<Select><option/></Select>` usages work unchanged; it is themed
 * with the same shadcn tokens as the other form controls.
 */
function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
