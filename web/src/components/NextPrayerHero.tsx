'use client';

import { useEffect, useState } from 'react';
import type { PrayerTimetableEntry } from '@/lib/types';

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
const PRAYER_KEYS: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** English fallbacks; callers translate via the returned key when they can. */
const EN_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Seconds since local midnight in the masjid's timezone. */
function nowInZone(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  } catch {
    const d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  }
}

/**
 * Which prayer is next (in the masjid's own timezone) and a ticking countdown.
 * Renders a stable placeholder until mounted, so SSR markup never mismatches.
 */
export function useNextPrayer(
  today: PrayerTimetableEntry | null | undefined,
  timezone: string,
): { key: PrayerKey | null; label: string; time: string; countdown: string } {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!today) return;
    setNow(nowInZone(timezone));
    const t = setInterval(() => setNow(nowInZone(timezone)), 1000);
    return () => clearInterval(t);
  }, [timezone, today]);

  let key: PrayerKey | null = null;
  let label = '—';
  let time = '';
  let countdown = '--:--:--';
  if (today && now != null) {
    const upcoming = PRAYER_KEYS.map((k) => ({ key: k, at: toMinutes(String(today[k])) * 60 })).find(
      (p) => p.at > now,
    );
    const next = upcoming ?? {
      key: 'fajr' as PrayerKey,
      at: toMinutes(String(today.fajr)) * 60 + 24 * 3600, // tomorrow's Fajr (approx.)
    };
    key = next.key;
    label = EN_LABELS[next.key];
    time = String(today[next.key]);
    const secs = next.at - now;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    countdown = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }
  return { key, label, time, countdown };
}

/**
 * The public page's showcase: which prayer is next and a live countdown,
 * in the masjid's own timezone, on a textured primary panel. Labels come in
 * as props so the server-rendered public page controls the language.
 */
export function NextPrayerHero({
  today,
  timezone,
  labels,
}: {
  today: PrayerTimetableEntry;
  timezone: string;
  labels?: { nextPrayer: string; at: string; prayers: Record<PrayerKey, string> };
}) {
  const { key, label, time, countdown } = useNextPrayer(today, timezone);
  const prayerName = key && labels ? labels.prayers[key] : label;

  return (
    <section className="texture-rub overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
        {labels?.nextPrayer ?? 'Next prayer'}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            {prayerName}
          </p>
          {time && (
            <p className="mt-1 text-sm opacity-80">
              {labels?.at ?? 'at'} {time}
            </p>
          )}
        </div>
        <p className="font-display tabular text-3xl font-bold tracking-tight opacity-95 sm:text-4xl">
          {countdown}
        </p>
      </div>
    </section>
  );
}
