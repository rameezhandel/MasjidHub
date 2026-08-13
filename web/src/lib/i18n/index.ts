'use client';

import { useSyncExternalStore } from 'react';
import { isLocale, translate, type DictKey, type Locale } from './dictionaries';

export { LOCALES, LOCALE_NAMES, isLocale, type DictKey, type Locale } from './dictionaries';

/**
 * Module-level locale store (same shape as the toast store): usable from
 * plain modules like api.ts, with a hook for components. Persisted per
 * device in localStorage; the root layout's inline script applies the
 * stored value to <html lang> before hydration.
 */
const KEY = 'mh.lang';
let locale: Locale = 'en';
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(KEY);
  if (isLocale(stored)) locale = stored;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  try {
    localStorage.setItem(KEY, next);
    document.documentElement.lang = next;
  } catch {
    // persistence is best-effort
  }
  for (const listener of listeners) listener();
}

/** Translate in the current locale. Safe to call from non-React modules. */
export function t(key: DictKey, vars?: Record<string, string | number>): string {
  return translate(locale, key, vars);
}

/**
 * Hook version: re-renders the component when the language changes.
 * The server snapshot is always 'en'; React re-renders with the stored
 * locale right after hydration.
 */
export function useT(): typeof t {
  useSyncExternalStore(
    subscribe,
    () => locale,
    () => 'en' as Locale,
  );
  return t;
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    () => locale,
    () => 'en' as Locale,
  );
}
