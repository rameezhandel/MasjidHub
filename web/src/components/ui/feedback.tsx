import * as React from 'react';
import { cn } from '@/lib/utils';

function ErrorText({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn('mt-2 text-sm text-destructive', className)}>{children}</p>;
}

function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('py-6 text-center text-sm text-muted-foreground', className)}>{children}</p>;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin text-primary', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Centered block spinner for a section or page whose data is still loading. */
function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}
    >
      <Spinner />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export { ErrorText, Empty, Spinner, Loading };
