'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui';
import { isLocale, translate, type Locale } from '@/lib/i18n/dictionaries';

const AUTO_RETRY_SECONDS = 10;

/**
 * Shown when the masjid data could not be loaded — in practice a suspended
 * free-tier API still booting. It counts down and retries by itself, so a
 * visitor who simply leaves the tab open lands on the real page once the
 * server is up, without ever seeing a misleading "not found".
 */
export default function MasjidPageError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useSearchParams();
  const lang = params.get('lang');
  const locale: Locale = isLocale(lang) ? lang : 'en';
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const [seconds, setSeconds] = useState(AUTO_RETRY_SECONDS);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (seconds <= 0) {
      unstable_retry();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, unstable_retry]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6" lang={locale}>
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Spinner className="mx-auto size-6" />
        <h1 className="mt-4 text-xl font-bold">{t('pub.warmingTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('pub.warmingBody')}</p>
        <button
          onClick={() => unstable_retry()}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('pub.retry')}
        </button>
        <p className="tabular mt-3 text-xs text-muted-foreground">
          {t('pub.retryingIn', { n: Math.max(0, seconds) })}
        </p>
      </div>
    </main>
  );
}
