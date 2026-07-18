'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Empty, ErrorText, Input, Label, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!masjidId) return;
    api<Masjid>(`/masjids/${masjidId}`)
      .then((masjid) => {
        const next: Record<string, string> = {};
        for (const [key] of FIELDS) next[key] = (masjid[key] as string | null) ?? '';
        setForm(next);
        setCalculationMethod(masjid.calculationMethod);
        setAsrMethod(masjid.asrMethod);
        setLatitude(masjid.latitude?.toString() ?? '');
        setLongitude(masjid.longitude?.toString() ?? '');
      })
      .catch(() => {});
  }, [masjidId]);

  if (!masjidId) return <Empty>Settings are managed per masjid.</Empty>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = { calculationMethod, asrMethod };
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
          </div>
        </Card>

        <Card title="Prayer time calculation">
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
    </div>
  );
}
