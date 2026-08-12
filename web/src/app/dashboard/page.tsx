'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useNextPrayer } from '@/components/NextPrayerHero';
import { Badge, Card, Empty, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type {
  Announcement,
  HouseholdSummary,
  Masjid,
  MasjidEvent,
  Paginated,
  PrayerTimetableEntry,
} from '@/lib/types';

const todayStr = () => new Date().toISOString().slice(0, 10);

function StatCard({ label, value, href }: { label: string; value: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <p className="tabular text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </Link>
  );
}

function OverviewHeader() {
  const [dateLabel, setDateLabel] = useState('');
  useEffect(() => {
    setDateLabel(
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    );
  }, []);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="text-sm text-muted-foreground">{dateLabel}</p>
    </div>
  );
}

function StaffOverview({ masjidId, firstName }: { masjidId: string; firstName: string }) {
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [announcements, setAnnouncements] = useState<Paginated<Announcement> | null>(null);
  const [events, setEvents] = useState<Paginated<MasjidEvent> | null>(null);
  const [today, setToday] = useState<PrayerTimetableEntry | null>(null);

  useEffect(() => {
    const d = todayStr();
    api<Masjid>(`/masjids/${masjidId}`).then(setMasjid).catch(() => {});
    api<HouseholdSummary>(`/masjids/${masjidId}/households/summary`)
      .then(setSummary)
      .catch(() => {});
    api<Paginated<Announcement>>(`/masjids/${masjidId}/announcements?pageSize=3`)
      .then(setAnnouncements)
      .catch(() => {});
    api<Paginated<MasjidEvent>>(`/masjids/${masjidId}/events?pageSize=3`)
      .then(setEvents)
      .catch(() => {});
    api<PrayerTimetableEntry[]>(`/masjids/${masjidId}/prayer-times?from=${d}&to=${d}`)
      .then((entries) => setToday(entries[0] ?? null))
      .catch(() => {});
  }, [masjidId]);

  const next = useNextPrayer(today, masjid?.timezone ?? 'UTC');
  const metaLine = masjid
    ? [
        [masjid.addressLine1, masjid.city].filter(Boolean).join(', '),
        `currency ${masjid.currency}`,
        masjid.calculationMethod.replaceAll('_', ' '),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="max-w-5xl space-y-6">
      <OverviewHeader />

      {/* Hero: the masjid at a glance + what's next */}
      <section className="texture-rub overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm opacity-80">Assalamu alaikum, {firstName}</p>
            <h2 className="font-display mt-1 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
              {masjid?.name ?? '…'}
            </h2>
            <p className="mt-2 text-sm opacity-80">{metaLine}</p>
            {masjid && (
              <a
                href={`/m/${masjid.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg bg-primary-foreground/10 px-3 py-1.5 text-sm font-medium hover:bg-primary-foreground/20"
              >
                View public page ↗
              </a>
            )}
          </div>
          {today && (
            <div className="shrink-0 rounded-xl bg-black/15 p-4 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                Next · {next.label}
              </p>
              <p className="font-display tabular mt-1 text-3xl font-bold">{next.countdown}</p>
              {next.time && <p className="tabular mt-0.5 text-xs opacity-80">at {next.time}</p>}
            </div>
          )}
        </div>
      </section>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Households"
          value={summary?.total ?? '…'}
          href="/dashboard/households"
        />
        <StatCard label="People" value={summary?.members ?? '…'} href="/dashboard/members" />
        <StatCard
          label="Events"
          value={events?.meta.total ?? '…'}
          href="/dashboard/events"
        />
        <StatCard label="Staff" value={masjid?._count?.users ?? '…'} href="/dashboard/staff" />
      </div>

      {/* Recent activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title="Recent announcements"
          actions={
            <Link className="text-sm font-medium text-primary hover:underline" href="/dashboard/announcements">
              All →
            </Link>
          }
        >
          {announcements === null ? (
            <Loading className="py-6" />
          ) : announcements.data.length ? (
            <ul className="divide-y divide-border">
              {announcements.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="min-w-0 truncate text-sm font-medium">{a.title}</p>
                  <Badge value={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No announcements yet.</Empty>
          )}
        </Card>

        <Card
          title="Upcoming events"
          actions={
            <Link className="text-sm font-medium text-primary hover:underline" href="/dashboard/events">
              All →
            </Link>
          }
        >
          {events === null ? (
            <Loading className="py-6" />
          ) : events.data.length ? (
            <ul className="divide-y divide-border">
              {events.data.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {new Date(e.startsAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {e.location ? ` · ${e.location}` : ''}
                    </p>
                  </div>
                  <Badge value={e.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No events yet.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

function PlatformOverview({ firstName }: { firstName: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [suspended, setSuspended] = useState<number | null>(null);

  useEffect(() => {
    api<Paginated<Masjid>>('/masjids?pageSize=1')
      .then((r) => setTotal(r.meta.total))
      .catch(() => {});
    api<Paginated<Masjid>>('/masjids?pageSize=1&status=ACTIVE')
      .then((r) => setActive(r.meta.total))
      .catch(() => {});
    api<Paginated<Masjid>>('/masjids?pageSize=1&status=SUSPENDED')
      .then((r) => setSuspended(r.meta.total))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <OverviewHeader />

      <section className="texture-rub overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Platform</p>
        <h2 className="font-display mt-1 text-3xl font-extrabold tracking-tight">
          Assalamu alaikum, {firstName}
        </h2>
        <p className="mt-2 text-sm opacity-80">
          One platform, many masjids — onboard, monitor, and support every community from here.
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Masjids" value={total ?? '…'} href="/dashboard/platform" />
        <StatCard label="Active" value={active ?? '…'} href="/dashboard/platform" />
        <StatCard label="Suspended" value={suspended ?? '…'} href="/dashboard/platform" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/platform"
          className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <p className="font-semibold">Manage masjids →</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Onboard a new masjid, suspend or delete existing ones.
          </p>
        </Link>
        <Link
          href="/dashboard/platform/audit"
          className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <p className="font-semibold">Audit log →</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every sensitive action across the platform, in one place.
          </p>
        </Link>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  if (!user) return null;
  return user.masjidId ? (
    <StaffOverview masjidId={user.masjidId} firstName={user.firstName} />
  ) : (
    <PlatformOverview firstName={user.firstName} />
  );
}
