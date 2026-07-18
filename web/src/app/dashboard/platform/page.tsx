'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorText, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Masjid, Paginated } from '@/lib/types';

export default function PlatformMasjidsPage() {
  const { user } = useAuth();
  const [masjids, setMasjids] = useState<Masjid[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirst, setAdminFirst] = useState('');
  const [adminLast, setAdminLast] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const load = useCallback(async () => {
    const res = await api<Paginated<Masjid>>(
      `/masjids?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    );
    setMasjids(res.data);
  }, [search]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  if (user && user.role !== 'PLATFORM_ADMIN') {
    return <Empty>Only the platform admin can manage masjids.</Empty>;
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const masjid = await api<Masjid>('/masjids', {
        method: 'POST',
        body: {
          name,
          ...(city ? { city } : {}),
          timezone,
          admin: {
            email: adminEmail,
            firstName: adminFirst,
            lastName: adminLast,
            password: adminPassword,
          },
        },
      });
      setNotice(`Created ${masjid.name} (/m/${masjid.slug}) with admin ${adminEmail}.`);
      setName('');
      setCity('');
      setAdminEmail('');
      setAdminFirst('');
      setAdminLast('');
      setAdminPassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/masjids/${id}/status`, { method: 'PATCH', body: { status } });
    await load();
  };

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Masjids</h1>

      <Card title="Onboard a new masjid">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>Timezone (IANA)</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
          </div>
          <div>
            <Label>Admin email</Label>
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Admin first name</Label>
            <Input value={adminFirst} onChange={(e) => setAdminFirst(e.target.value)} required />
          </div>
          <div>
            <Label>Admin last name</Label>
            <Input value={adminLast} onChange={(e) => setAdminLast(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label>Admin initial password (12+ chars — they can change it later)</Label>
            <Input
              type="password"
              minLength={12}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create masjid'}
            </Button>
          </div>
          <div className="sm:col-span-3">
            <ErrorText>{error}</ErrorText>
            {notice && <p className="text-sm text-primary">{notice}</p>}
          </div>
        </form>
      </Card>

      <Card
        title="All masjids"
        actions={
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
        }
      >
        {masjids.length === 0 ? (
          <Empty>No masjids found.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {masjids.map((masjid) => (
              <li key={masjid.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {masjid.name} <Badge value={masjid.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Link className="underline" href={`/m/${masjid.slug}`}>
                      /m/{masjid.slug}
                    </Link>{' '}
                    · {[masjid.city, masjid.country].filter(Boolean).join(', ') || 'no address'} ·{' '}
                    {masjid._count?.users ?? '—'} staff
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {masjid.status === 'ACTIVE' ? (
                    <Button variant="danger" onClick={() => setStatus(masjid.id, 'SUSPENDED')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setStatus(masjid.id, 'ACTIVE')}>
                      Activate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
