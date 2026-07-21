'use client';

import { useEffect, useState } from 'react';
import { LocationPicker, type Place } from '@/components/LocationPicker';
import { Button, Card, Empty, ErrorText, Input, Label, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CURRENCIES } from '@/lib/currencies';
import { CALCULATION_METHODS, type Masjid } from '@/lib/types';

const FIELDS = [
  ['name', 'Name'],
  ['email', 'Contact email'],
  ['phone', 'Phone'],
  ['website', 'Website'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State/Province'],
  ['postalCode', 'Postal code'],
  ['country', 'Country'],
  ['timezone', 'Timezone (IANA)'],
] as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const canEdit = user?.role === 'MASJID_ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const [form, setForm] = useState<Record<string, string>>({});
  const [calculationMethod, setCalculationMethod] = useState('MUSLIM_WORLD_LEAGUE');
  const [asrMethod, setAsrMethod] = useState('STANDARD');
  const [currency, setCurrency] = useState('INR');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  // Captured once on load so the map's initial pin doesn't jump as fields are edited.
  const [initialCoords, setInitialCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Danger zone: destructive resets, gated behind typing the masjid name.
  const [dangerConfirm, setDangerConfirm] = useState('');
  const [dangerBusy, setDangerBusy] = useState('');
  const [dangerNotice, setDangerNotice] = useState('');

  useEffect(() => {
    if (!masjidId) return;
    api<Masjid>(`/masjids/${masjidId}`)
      .then((masjid) => {
        const next: Record<string, string> = {};
        for (const [key] of FIELDS) next[key] = (masjid[key] as string | null) ?? '';
        setForm(next);
        setCalculationMethod(masjid.calculationMethod);
        setAsrMethod(masjid.asrMethod);
        setCurrency(masjid.currency);
        setLatitude(masjid.latitude?.toString() ?? '');
        setLongitude(masjid.longitude?.toString() ?? '');
        if (masjid.latitude != null && masjid.longitude != null) {
          setInitialCoords({ lat: masjid.latitude, lng: masjid.longitude });
        }
      })
      .catch(() => {});
  }, [masjidId]);

  if (!masjidId) return <Empty>Settings are managed per masjid.</Empty>;

  const onPlace = (place: Place) => {
    setLatitude(place.latitude.toString());
    setLongitude(place.longitude.toString());
    setForm((prev) => ({
      ...prev,
      city: place.city || prev.city,
      ...(place.state ? { state: place.state } : {}),
      ...(place.country ? { country: place.country } : {}),
    }));
  };

  const runReset = async (body: Record<string, boolean>, label: string) => {
    setDangerBusy(label);
    setDangerNotice('');
    try {
      const res = await api<Record<string, number>>(`/masjids/${masjidId}/reset`, {
        method: 'POST',
        body,
      });
      const deleted = Object.entries(res)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`);
      setDangerNotice(deleted.length ? `Deleted ${deleted.join(', ')}.` : 'Nothing to delete.');
      setDangerConfirm('');
    } catch (err) {
      setDangerNotice(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setDangerBusy('');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = { calculationMethod, asrMethod, currency };
      for (const [key] of FIELDS) {
        if (form[key] !== '') body[key] = form[key];
      }
      if (latitude !== '') body.latitude = Number(latitude);
      if (longitude !== '') body.longitude = Number(longitude);
      await api(`/masjids/${masjidId}`, { method: 'PATCH', body });
      setNotice('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Masjid settings</h1>
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Only masjid admins can change settings — shown read-only.
        </p>
      )}
      <form onSubmit={save} className="space-y-6">
        <Card title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  value={form[key] ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label>Currency (for dues)</Label>
              <Select
                value={currency}
                disabled={!canEdit}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card title="Prayer time calculation">
          {canEdit && (
            <div className="mb-4">
              <Label>Location (drives prayer-time auto-calculation)</Label>
              <LocationPicker
                city={form.city ?? ''}
                onCityChange={(c) => setForm((prev) => ({ ...prev, city: c }))}
                onSelect={onPlace}
                initialLat={initialCoords?.lat}
                initialLng={initialCoords?.lng}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Latitude</Label>
              <Input
                type="number"
                step="any"
                value={latitude}
                disabled={!canEdit}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input
                type="number"
                step="any"
                value={longitude}
                disabled={!canEdit}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
            <div>
              <Label>Calculation method</Label>
              <Select
                value={calculationMethod}
                disabled={!canEdit}
                onChange={(e) => setCalculationMethod(e.target.value)}
              >
                {CALCULATION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Asr method</Label>
              <Select
                value={asrMethod}
                disabled={!canEdit}
                onChange={(e) => setAsrMethod(e.target.value)}
              >
                <option value="STANDARD">Standard (Shafi&apos;i/Maliki/Hanbali)</option>
                <option value="HANAFI">Hanafi</option>
              </Select>
            </div>
          </div>
        </Card>

        {canEdit && (
          <div>
            <ErrorText>{error}</ErrorText>
            {notice && <p className="mb-2 text-sm text-primary">{notice}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        )}
      </form>

      {canEdit && (
        <Card title="Danger zone">
          <div className="space-y-4 rounded-lg border border-destructive/40 p-4">
            <p className="text-sm text-muted-foreground">
              These permanently delete data for <strong>{form.name || 'this masjid'}</strong> and
              cannot be undone. Type the masjid name below to enable them.
            </p>
            <Input
              placeholder={`Type "${form.name}" to confirm`}
              value={dangerConfirm}
              onChange={(e) => setDangerConfirm(e.target.value)}
            />
            {(() => {
              const armed = !!form.name && dangerConfirm.trim() === form.name.trim();
              return (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!armed || dangerBusy !== ''}
                    onClick={() => runReset({ households: true }, 'households')}
                  >
                    {dangerBusy === 'households' ? 'Deleting…' : 'Delete all households'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!armed || dangerBusy !== ''}
                    onClick={() => runReset({ prayerTimes: true }, 'prayerTimes')}
                  >
                    {dangerBusy === 'prayerTimes' ? 'Clearing…' : 'Clear prayer times'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!armed || dangerBusy !== ''}
                    onClick={() =>
                      runReset({ announcements: true, events: true }, 'announcements & events')
                    }
                  >
                    {dangerBusy === 'announcements & events'
                      ? 'Clearing…'
                      : 'Clear announcements & events'}
                  </Button>
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground">
              Deleting households also removes their members, dues history, and family-tree links.
            </p>
            {dangerNotice && <p className="text-sm text-primary">{dangerNotice}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
