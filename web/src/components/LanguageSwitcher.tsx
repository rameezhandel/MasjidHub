'use client';

import { LOCALES, LOCALE_NAMES, isLocale, setLocale, useLocale, useT } from '@/lib/i18n';

/** Compact language picker; lives next to the theme toggle. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  return (
    <select
      aria-label={t('nav.language')}
      value={locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) setLocale(e.target.value);
      }}
      className={
        className ??
        'rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground'
      }
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
