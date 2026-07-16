import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import type {
  Announcement,
  MasjidEvent,
  Paginated,
  PrayerTimetableEntry,
  PublicMasjid,
} from '@/lib/types';

export const revalidate = 300;

async function fetchPublic<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/public${path}`, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const masjid = await fetchPublic<PublicMasjid>(`/masjids/${slug}`);
  return { title: masjid?.name ?? 'Masjid not found' };
}

const PRAYERS: Array<{ key: keyof PrayerTimetableEntry; iqamah: keyof PrayerTimetableEntry; label: string }> = [
  { key: 'fajr', iqamah: 'fajrIqamah', label: 'Fajr' },
  { key: 'dhuhr', iqamah: 'dhuhrIqamah', label: 'Dhuhr' },
  { key: 'asr', iqamah: 'asrIqamah', label: 'Asr' },
  { key: 'maghrib', iqamah: 'maghribIqamah', label: 'Maghrib' },
  { key: 'isha', iqamah: 'ishaIqamah', label: 'Isha' },
];

export default async function MasjidPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const masjid = await fetchPublic<PublicMasjid>(`/masjids/${slug}`);
  if (!masjid) notFound();

  const [timetable, announcements, events] = await Promise.all([
    fetchPublic<PrayerTimetableEntry[]>(`/masjids/${slug}/prayer-times`),
    fetchPublic<Paginated<Announcement>>(`/masjids/${slug}/announcements?pageSize=5`),
    fetchPublic<Paginated<MasjidEvent>>(`/masjids/${slug}/events?pageSize=5`),
  ]);
  const today = timetable?.[0];
  const address = [masjid.addressLine1, masjid.addressLine2, masjid.city, masjid.state, masjid.country]
    .filter(Boolean)
    .join(', ');

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{masjid.name}</h1>
        {address && <p className="mt-1 text-slate-600">{address}</p>}
        <p className="mt-1 text-sm text-slate-400">
          {[masjid.phone, masjid.email, masjid.website].filter(Boolean).join(' · ')}
        </p>
        {masjid.latitude != null && masjid.longitude != null && (
          <a
            className="mt-1 inline-block text-sm text-emerald-700 underline"
            href={`https://www.openstreetmap.org/?mlat=${masjid.latitude}&mlon=${masjid.longitude}#map=16/${masjid.latitude}/${masjid.longitude}`}
          >
            View on map
          </a>
        )}
      </header>

      <section className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Prayer times</h2>
          {today && <span className="text-sm text-slate-500">{today.date}</span>}
        </div>
        {today ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PRAYERS.map(({ key, iqamah, label }) => (
                <div key={label} className="rounded-lg bg-emerald-50 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{String(today[key])}</p>
                  {today[iqamah] && (
                    <p className="text-xs text-slate-500">Iqamah {String(today[iqamah])}</p>
                  )}
                </div>
              ))}
            </div>
            {(today.jumuah1 || today.jumuah2) && (
              <p className="mt-3 text-sm text-slate-600">
                Jumu&apos;ah: {[today.jumuah1, today.jumuah2].filter(Boolean).join(' & ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">No prayer times published yet.</p>
        )}
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Announcements</h2>
          {announcements?.data.length ? (
            <ul className="space-y-3">
              {announcements.data.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                  {a.publishedAt && (
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(a.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No announcements right now.</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Upcoming events</h2>
          {events?.data.length ? (
            <ul className="space-y-3">
              {events.data.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="font-medium">{e.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {new Date(e.startsAt).toLocaleString()} {e.location ? `· ${e.location}` : ''}
                  </p>
                  {e.description && (
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-500">
                      {e.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No upcoming events.</p>
          )}
        </section>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        Powered by MasjidHub · timezone {masjid.timezone}
      </footer>
    </main>
  );
}
