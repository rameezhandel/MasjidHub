'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'mb-1 block text-xs font-medium text-muted-foreground select-none',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
