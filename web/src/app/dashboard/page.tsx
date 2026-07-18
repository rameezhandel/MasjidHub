'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Masjid, Paginated } from '@/lib/types';

export default function DashboardHome() {
  const { user } = useAuth();
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [masjidCount, setMasjidCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.masjidId) {
      api<Masjid>(`/masjids/${user.masjidId}`).then(setMasjid).catch(() => {});
    } else if (user.role === 'PLATFORM_ADMIN') {
      api<Paginated<Masjid>>('/masjids?pageSize=1')
        .then((res) => setMasjidCount(res.meta.total))
        .catch(() => {});
    }
  }, [user]);

  if (!user) return null;

  if (user.role === 'PLATFORM_ADMIN') {
    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">As-salamu alaykum, {user.firstName}</h1>
        <Card title="Platform">
          <p className="text-sm text-muted-foreground">
            {masjidCount === null ? '…' : masjidCount} masjid{masjidCount === 1 ? '' : 's'} on the
            platform.
          </p>
          <div className="mt-4 flex gap-3">
            <Link className="text-sm font-medium text-primary underline" href="/dashboard/platform">
              Manage masjids →
            </Link>
            <Link
              className="text-sm font-medium text-primary underline"
              href="/dashboard/platform/audit"
            >
              Audit log →
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">As-salamu alaykum, {user.firstName}</h1>
      {masjid && (
        <Card
          title={masjid.name}
          actions={<Badge value={masjid.status} />}
        >
          <p className="text-sm text-muted-foreground">
            {[masjid.city, masjid.country].filter(Boolean).join(', ') || 'No address yet'} ·
            timezone {masjid.timezone} · {masjid._count?.users ?? '—'} staff
          </p>
          <p className="mt-2 text-sm">
            Public page:{' '}
            <Link className="text-primary underline" href={`/m/${masjid.slug}`}>
              /m/{masjid.slug}
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { href: '/dashboard/prayer-times', label: '🕐 Prayer times' },
              { href: '/dashboard/announcements', label: '📢 Announcements' },
              { href: '/dashboard/events', label: '📅 Events' },
              { href: '/dashboard/households', label: '🏠 Households' },
              { href: '/dashboard/staff', label: '👥 Staff' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-border p-3 text-center text-sm font-medium hover:border-emerald-300 hover:bg-accent"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
