'use client';

import { AlertCircleIcon, CheckCircle2Icon, InfoIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal app-wide toasts: a module-level store so non-React code (the API
 * client) can raise them, and a <Toaster /> mounted once in the root layout.
 */

type ToastVariant = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function push(variant: ToastVariant, message: string): void {
  // Collapse exact duplicates (e.g. several parallel requests all timing out).
  if (items.some((t) => t.message === message)) return;
  const id = nextId++;
  items = [...items, { id, variant, message }];
  emit();
  setTimeout(() => dismiss(id), 6000);
}

function dismiss(id: number): void {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  error: (message: string) => push('error', message),
  success: (message: string) => push('success', message),
  info: (message: string) => push('info', message),
};

const ICONS: Record<ToastVariant, typeof InfoIcon> = {
  error: AlertCircleIcon,
  success: CheckCircle2Icon,
  info: InfoIcon,
};

const TONES: Record<ToastVariant, string> = {
  error: 'border-destructive/40 text-destructive',
  success: 'border-success/40 text-success',
  info: 'border-border text-foreground',
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    const update = () => setList(items);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-4"
    >
      {list.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg',
              TONES[t.variant],
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1 text-foreground">{t.message}</p>
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
