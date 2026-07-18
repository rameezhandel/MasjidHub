import * as React from 'react';
import { cn } from '@/lib/utils';

function CardRoot({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-border/70 px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/**
 * App-level Card: the previous kit's convenience API (`title` + `actions`),
 * now composed from the shadcn card parts.
 */
function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CardRoot className={className}>
      {(title || actions) && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {actions}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </CardRoot>
  );
}

export { Card, CardRoot, CardHeader, CardTitle, CardContent };
