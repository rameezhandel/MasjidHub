'use client';

import { useEffect, useState } from 'react';
import type { PrayerTimetableEntry } from '@/lib/types';

const PRAYERS: Array<{ key: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; label: string }> = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Dhuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
];

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
 * The public page's showcase: which prayer is next and a live countdown,
 * in the masjid's own timezone, on a textured primary panel.
 */
export function NextPrayerHero({
  today,
  timezone,
}: {
  today: PrayerTimetableEntry;
  timezone: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(nowInZone(timezone));
    const t = setInterval(() => setNow(nowInZone(timezone)), 1000);
    return () => clearInterval(t);
  }, [timezone]);

  // Render a stable shell on the server; the countdown fills in after mount.
  let label = '—';
  let time = '';
  let countdown = '--:--:--';
  if (now != null) {
    const upcoming = PRAYERS.map((p) => ({ ...p, at: toMinutes(String(today[p.key])) * 60 })).find(
      (p) => p.at > now,
    );
    const next = upcoming ?? {
      ...PRAYERS[0],
      at: toMinutes(String(today.fajr)) * 60 + 24 * 3600, // tomorrow's Fajr (approx.)
    };
    label = next.label;
    time = String(today[next.key]);
    const secs = next.at - now;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    countdown = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  return (
    <section className="texture-rub overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Next prayer</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{label}</p>
          {time && <p className="mt-1 text-sm opacity-80">at {time}</p>}
        </div>
        <p className="font-display tabular text-3xl font-bold tracking-tight opacity-95 sm:text-4xl">
          {countdown}
        </p>
      </div>
    </section>
  );
}
