import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { NextPrayerHero, type PrayerKey } from '@/components/NextPrayerHero';
import { API_BASE } from '@/lib/api';
import {
  LOCALES,
  LOCALE_NAMES,
  isLocale,
  translate,
  type Locale,
} from '@/lib/i18n/dictionaries';
import type {
  Announcement,
  MasjidEvent,
  Paginated,
  PrayerTimetableEntry,
  PublicMasjid,
} from '@/lib/types';

export const revalidate = 60;

/** A sleeping free-tier API answers 503 for a while, then takes ~30s to boot. */
const ATTEMPT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 6_000, 10_000];

class ApiUnavailableError extends Error {
  constructor(path: string) {
    super(`The masjid API did not respond for ${path}`);
    this.name = 'ApiUnavailableError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tells "this masjid does not exist" (a real 404 from the API) apart from
 * "the API is asleep or erroring" (503, timeout, refused connection), and
 * rides out the latter with a few retries.
 *
 * The distinction is the whole point: rendering a 404 for an API that is
 * merely cold-starting told visitors — and search engines — that the masjid
 * was gone, and the page only recovered once somebody woke the API from the
 * dashboard. Unavailability throws instead, so the error boundary can say
 * "warming up" and retry.
 */
async function fetchPublic<T>(path: string): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/public${path}`, {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      // 5xx — Render answers 503 while a suspended service boots. Retry.
    } catch {
      // Connection refused or timed out. Retry.
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw new ApiUnavailableError(path);
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

/** Same, for sections the page is still worth rendering without. */
async function fetchOptional<T>(path: string): Promise<T | null> {
  try {
    return await fetchPublic<T>(path);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const masjid = await fetchOptional<PublicMasjid>(`/masjids/${slug}`);
  return { title: masjid?.name ?? 'Masjid' };
}

const PRAYERS: Array<{ key: PrayerKey; iqamah: keyof PrayerTimetableEntry }> = [
  { key: 'fajr', iqamah: 'fajrIqamah' },
  { key: 'dhuhr', iqamah: 'dhuhrIqamah' },
  { key: 'asr', iqamah: 'asrIqamah' },
  { key: 'maghrib', iqamah: 'maghribIqamah' },
  { key: 'isha', iqamah: 'ishaIqamah' },
];

export default async function MasjidPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const locale: Locale = isLocale(lang) ? lang : 'en';
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  // Only a genuine 404 from the API means "no such masjid"; anything else
  // throws and is handled by error.tsx.
  const masjid = await fetchPublic<PublicMasjid>(`/masjids/${slug}`);
  if (!masjid) notFound();

  const [timetable, announcements, events] = await Promise.all([
    fetchOptional<PrayerTimetableEntry[]>(`/masjids/${slug}/prayer-times`),
    fetchOptional<Paginated<Announcement>>(`/masjids/${slug}/announcements?pageSize=5`),
    fetchOptional<Paginated<MasjidEvent>>(`/masjids/${slug}/events?pageSize=5`),
  ]);
  const today = timetable?.[0];
  const address = [masjid.addressLine1, masjid.addressLine2, masjid.city, masjid.state, masjid.country]
    .filter(Boolean)
    .join(', ');
  const prayerLabels = Object.fromEntries(
    PRAYERS.map(({ key }) => [key, t(`prayer.${key}`)]),
  ) as Record<PrayerKey, string>;
  const dateLocale = locale === 'en' ? 'en-GB' : `${locale}-IN`;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-10" lang={locale}>
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
        <Link href="/">
          <Logo markClassName="size-6" className="[&>span]:text-base" />
        </Link>
        <nav className="flex gap-1 text-xs">
          {LOCALES.map((l) => (
            <a
              key={l}
              href={l === 'en' ? `/m/${slug}` : `/m/${slug}?lang=${l}`}
              className={
                l === locale
                  ? 'rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground'
                  : 'rounded-full px-2.5 py-1 text-muted-foreground hover:bg-accent'
              }
            >
              {LOCALE_NAMES[l]}
            </a>
          ))}
        </nav>
      </div>

      <header className="mb-6">
        <h1 className="break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
          {masjid.name}
        </h1>
        {address && <p className="mt-1 text-muted-foreground">{address}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {[masjid.phone, masjid.email, masjid.website].filter(Boolean).join(' · ')}
        </p>
        {masjid.latitude != null && masjid.longitude != null && (
          <a
            className="mt-1 inline-block text-sm text-primary underline"
            href={`https://www.google.com/maps?q=${masjid.latitude},${masjid.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('pub.maps')}
          </a>
        )}
      </header>

      {today && (
        <NextPrayerHero
          today={today}
          timezone={masjid.timezone}
          labels={{ nextPrayer: t('prayer.next'), at: t('prayer.at'), prayers: prayerLabels }}
        />
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{t('pub.today')}</h2>
          {today && <span className="text-sm text-muted-foreground">{today.date}</span>}
        </div>
        {today ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PRAYERS.map(({ key, iqamah }) => (
                <div key={key} className="rounded-lg bg-accent p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">
                    {prayerLabels[key]}
                  </p>
                  <p className="tabular mt-1 text-xl font-bold text-foreground">
                    {String(today[key])}
                  </p>
                  {today[iqamah] && (
                    <p className="tabular text-xs text-muted-foreground">
                      {t('prayer.iqamah')} {String(today[iqamah])}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {(today.jumuah1 || today.jumuah2) && (
              <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-medium text-foreground">
                {t('prayer.jumuah')} · {[today.jumuah1, today.jumuah2].filter(Boolean).join(' & ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('pub.noTimes')}</p>
        )}
      </section>

      {timetable && timetable.length > 1 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">{t('pub.comingDays')}</h2>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">{t('pub.date')}</th>
                  {PRAYERS.map(({ key }) => (
                    <th key={key} className="py-2 pr-3">
                      {prayerLabels[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timetable.slice(1, 8).map((entry) => (
                  <tr key={entry.date} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-3 font-medium">{entry.date}</td>
                    {PRAYERS.map(({ key }) => (
                      <td key={key} className="py-1.5 pr-3">
                        {String(entry[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('pub.announcements')}</h2>
          {announcements?.data.length ? (
            <ul className="space-y-3">
              {announcements.data.map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                  {a.publishedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(a.publishedAt).toLocaleDateString(dateLocale)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('pub.noAnnouncements')}</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('pub.upcomingEvents')}</h2>
          {events?.data.length ? (
            <ul className="space-y-3">
              {events.data.map((e) => (
                <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="font-medium">{e.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(e.startsAt).toLocaleString(dateLocale)}{' '}
                    {e.location ? `· ${e.location}` : ''}
                  </p>
                  {e.description && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('pub.noEvents')}</p>
          )}
        </section>
      </div>

      <footer className="mt-12 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        {t('pub.footer', { tz: masjid.timezone })}
      </footer>
    </main>
  );
}
