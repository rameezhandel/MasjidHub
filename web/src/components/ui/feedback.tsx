import * as React from 'react';
import { cn } from '@/lib/utils';

function ErrorText({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn('mt-2 text-sm text-destructive', className)}>{children}</p>;
}

function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('py-6 text-center text-sm text-muted-foreground', className)}>{children}</p>;
}

export { ErrorText, Empty };
