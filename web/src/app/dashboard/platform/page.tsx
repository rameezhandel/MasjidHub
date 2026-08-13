'use client';

import { useCallback, useEffect, useState } from 'react';
import { LocationPicker, type Place } from '@/components/LocationPicker';
import { Badge, Button, Card, Empty, ErrorText, Input, Label, Loading, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { timezoneList } from '@/lib/timezones';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Masjid, Paginated } from '@/lib/types';

export default function PlatformMasjidsPage() {
  const t = useT();
  const { user } = useAuth();
  const [masjids, setMasjids] = useState<Masjid[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Masjid | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('INR');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirst, setAdminFirst] = useState('');
  const [adminLast, setAdminLast] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Default the timezone to the browser's zone (after mount, to avoid an SSR mismatch).
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      // keep UTC
    }
  }, []);

  const onPlace = (place: Place) => {
    setCountry(place.country ?? '');
    setRegion(place.state ?? '');
    setCoords({ lat: place.latitude, lon: place.longitude });
    // The masjid's timezone follows its location, not the admin's device.
    if (place.timezone) setTimezone(place.timezone);
  };

  const load = useCallback(async () => {
    const res = await api<Paginated<Masjid>>(
      `/masjids?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    );
    setMasjids(res.data);
  }, [search]);

  useEffect(() => {
    void load()
      .catch(() => {})
      .finally(() => setLoaded(true));
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
          ...(region ? { state: region } : {}),
          ...(country ? { country } : {}),
          ...(coords ? { latitude: coords.lat, longitude: coords.lon } : {}),
          timezone,
          currency,
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
      setCountry('');
      setRegion('');
      setCoords(null);
      setCurrency('INR');
      setAdminEmail('');
      setAdminFirst('');
      setAdminLast('');
      setAdminPassword('');
      setShowForm(false);
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

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await api(`/masjids/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setDeleteConfirm('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('plat.title')}</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('plat.close') : t('plat.add')}
        </Button>
      </div>

      {notice && !showForm && (
        <p className="rounded-lg border border-border bg-accent p-3 text-sm text-primary">
          {notice}
        </p>
      )}

      {showForm && (
        <Card title={t('plat.onboard')}>
          <form onSubmit={create} className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('plat.details')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('set.name')}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <Label>{t('set.timezone')}</Label>
                  <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
                    {timezoneList([timezone]).map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('set.currency')}</Label>
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)} required>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('plat.location')}</Label>
                <LocationPicker city={city} onCityChange={setCity} onSelect={onPlace} />
              </div>
              {coords && (
                <p className="text-xs text-muted-foreground">
                  Pinned {[city, region, country].filter(Boolean).join(', ')} ·{' '}
                  {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} — enables prayer-time
                  auto-calculation.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('plat.adminSection')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('acc.email')}</Label>
                  <Input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>{t('acc.firstName')}</Label>
                  <Input
                    value={adminFirst}
                    onChange={(e) => setAdminFirst(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>{t('acc.lastName')}</Label>
                  <Input
                    value={adminLast}
                    onChange={(e) => setAdminLast(e.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label>{t('plat.password')}</Label>
                  <Input
                    type="password"
                    minLength={12}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <div>
              <Button type="submit" disabled={busy}>
                {busy ? t('plat.creating') : t('plat.create')}
              </Button>
              <ErrorText>{error}</ErrorText>
              {notice && <p className="mt-2 text-sm text-primary">{notice}</p>}
            </div>
          </form>
        </Card>
      )}

      <Card
        title="All masjids"
        actions={
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-48"
          />
        }
      >
        {!loaded ? (
          <Loading label={t('plat.loading')} />
        ) : masjids.length === 0 ? (
          <Empty>{t('plat.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {masjids.map((masjid) => (
              <li key={masjid.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {masjid.name} <Badge value={masjid.status} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <a
                        className="underline"
                        href={`/m/${masjid.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        /m/{masjid.slug} ↗
                      </a>{' '}
                      · {[masjid.city, masjid.country].filter(Boolean).join(', ') || 'no address'} ·{' '}
                      {masjid._count?.users ?? '—'} staff
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {masjid.status === 'ACTIVE' ? (
                      <Button variant="secondary" onClick={() => setStatus(masjid.id, 'SUSPENDED')}>
                        {t('plat.suspend')}
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setStatus(masjid.id, 'ACTIVE')}>
                        {t('plat.activate')}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => {
                        setDeleteTarget(masjid);
                        setDeleteConfirm('');
                        setError('');
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>

                {deleteTarget?.id === masjid.id && (
                  <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 p-3">
                    <p className="text-sm">
                      Permanently delete <strong>{masjid.name}</strong> and{' '}
                      <strong>all</strong> its data — households, staff/admins, prayer times,
                      announcements and events. This cannot be undone.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Type <code className="rounded bg-secondary px-1 py-0.5">{masjid.slug}</code> to
                      confirm.
                    </p>
                    <Input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={masjid.slug}
                      className="max-w-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        disabled={deleteConfirm.trim() !== masjid.slug || deleteBusy}
                        onClick={doDelete}
                      >
                        {deleteBusy ? 'Deleting…' : 'Permanently delete'}
                      </Button>
                      <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
