'use client';

import { useCallback, useEffect, useState } from 'react';
import { LocationPicker, type Place } from '@/components/LocationPicker';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  Empty,
  ErrorText,
  Input,
  Label,
  Loading,
  Select,
} from '@/components/ui';
import { api, refreshPublicPages } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CURRENCIES } from '@/lib/currencies';
import { useT, type DictKey } from '@/lib/i18n';
import { timezoneList } from '@/lib/timezones';
import { CALCULATION_METHODS, type Masjid } from '@/lib/types';

const FIELDS = [
  ['name', 'set.name'],
  ['email', 'set.contactEmail'],
  ['phone', 'hh.phone'],
  ['website', 'set.website'],
  ['addressLine1', 'hhd.addressLine1'],
  ['addressLine2', 'hhd.addressLine2'],
  ['city', 'hh.city'],
  ['state', 'hhd.state'],
  ['postalCode', 'hhd.postalCode'],
  ['country', 'hhd.country'],
] as const;

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const canEdit = user?.role === 'MASJID_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [dialog, setDialog] = useState<'profile' | 'prayer' | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [calculationMethod, setCalculationMethod] = useState('MUSLIM_WORLD_LEAGUE');
  const [asrMethod, setAsrMethod] = useState('STANDARD');
  const [currency, setCurrency] = useState('INR');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Danger zone: destructive resets, gated behind typing the masjid name.
  const [dangerConfirm, setDangerConfirm] = useState('');
  const [dangerBusy, setDangerBusy] = useState('');
  const [dangerNotice, setDangerNotice] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    setMasjid(await api<Masjid>(`/masjids/${masjidId}`));
  }, [masjidId]);

  useEffect(() => {
    void load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  if (!masjidId) return <Empty>Settings are managed per masjid.</Empty>;

  // Copy the saved values into the form state whenever a dialog opens, so
  // edits abandoned by closing the popup never leak into the next one.
  const openDialog = (which: 'profile' | 'prayer') => {
    if (!masjid) return;
    const next: Record<string, string> = {};
    for (const [key] of FIELDS) next[key] = (masjid[key] as string | null) ?? '';
    next.timezone = masjid.timezone || 'UTC';
    setForm(next);
    setCalculationMethod(masjid.calculationMethod);
    setAsrMethod(masjid.asrMethod);
    setCurrency(masjid.currency);
    setLatitude(masjid.latitude?.toString() ?? '');
    setLongitude(masjid.longitude?.toString() ?? '');
    setError('');
    setDialog(which);
  };

  const onPlace = (place: Place) => {
    setLatitude(place.latitude.toString());
    setLongitude(place.longitude.toString());
    setForm((prev) => ({
      ...prev,
      city: place.city || prev.city,
      ...(place.state ? { state: place.state } : {}),
      ...(place.country ? { country: place.country } : {}),
      // The masjid's timezone follows its location, not the admin's device.
      ...(place.timezone ? { timezone: place.timezone } : {}),
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
      const body: Record<string, unknown> = {
        calculationMethod,
        asrMethod,
        currency,
        timezone: form.timezone || 'UTC',
      };
      for (const [key] of FIELDS) {
        if (form[key] !== '') body[key] = form[key];
      }
      if (latitude !== '') body.latitude = Number(latitude);
      if (longitude !== '') body.longitude = Number(longitude);
      await api(`/masjids/${masjidId}`, { method: 'PATCH', body });
      refreshPublicPages();
      await load();
      setNotice(t('common.saved'));
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || !masjid) {
    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">{t('set.title')}</h1>
        {loaded ? <Empty>{t('set.loadFailed')}</Empty> : <Loading label={t('set.loading')} />}
      </div>
    );
  }

  const coordsLabel =
    masjid.latitude != null && masjid.longitude != null
      ? `${masjid.latitude.toFixed(4)}, ${masjid.longitude.toFixed(4)}`
      : '';

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('set.title')}</h1>
      {!canEdit && <p className="text-sm text-muted-foreground">{t('set.readOnly')}</p>}
      {notice && !dialog && <p className="text-sm text-primary">{notice}</p>}

      <Card
        title={t('set.profile')}
        actions={
          canEdit && (
            <Button variant="secondary" onClick={() => openDialog('profile')}>
              {t('common.edit')}
            </Button>
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <Detail key={key} label={t(label as DictKey)} value={masjid[key] as string | null} />
          ))}
          <Detail label={t('set.timezone')} value={masjid.timezone} />
          <Detail
            label={t('set.currency')}
            value={
              CURRENCIES.find((c) => c.code === masjid.currency)
                ? `${masjid.currency} — ${CURRENCIES.find((c) => c.code === masjid.currency)?.name}`
                : masjid.currency
            }
          />
        </dl>
      </Card>

      <Card
        title="Prayer time calculation"
        actions={
          canEdit && (
            <Button variant="secondary" onClick={() => openDialog('prayer')}>
              Edit
            </Button>
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail
            label="Calculation method"
            value={masjid.calculationMethod.replaceAll('_', ' ')}
          />
          <Detail
            label="Asr method"
            value={masjid.asrMethod === 'HANAFI' ? 'Hanafi' : "Standard (Shafi'i/Maliki/Hanbali)"}
          />
          <Detail label="Coordinates" value={coordsLabel} />
        </dl>
        {!coordsLabel && (
          <p className="mt-3 text-xs text-muted-foreground">
            Set the masjid&apos;s location to enable prayer-time auto-calculation.
          </p>
        )}
      </Card>

      {/* Edit profile: centered popup */}
      <Dialog
        open={dialog === 'profile'}
        onOpenChange={(open) => setDialog(open ? 'profile' : null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>Edit profile</DialogTitle>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    value={form[key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <Label>Timezone</Label>
                <Select
                  value={form.timezone ?? 'UTC'}
                  onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                >
                  {timezoneList([form.timezone]).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Currency (for dues)</Label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit prayer calculation: centered popup */}
      <Dialog open={dialog === 'prayer'} onOpenChange={(open) => setDialog(open ? 'prayer' : null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>Edit prayer time calculation</DialogTitle>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label>Location (drives prayer-time auto-calculation)</Label>
              <LocationPicker
                city={form.city ?? ''}
                onCityChange={(c) => setForm((prev) => ({ ...prev, city: c }))}
                onSelect={onPlace}
                initialLat={masjid.latitude ?? undefined}
                initialLng={masjid.longitude ?? undefined}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
              <div>
                <Label>Calculation method</Label>
                <Select
                  value={calculationMethod}
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
                <Select value={asrMethod} onChange={(e) => setAsrMethod(e.target.value)}>
                  <option value="STANDARD">Standard (Shafi&apos;i/Maliki/Hanbali)</option>
                  <option value="HANAFI">Hanafi</option>
                </Select>
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save calculation settings'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {canEdit && (
        <Card title="Danger zone">
          <div className="space-y-4 rounded-lg border border-destructive/40 p-4">
            <p className="text-sm text-muted-foreground">
              These permanently delete data for <strong>{masjid.name}</strong> and cannot be
              undone. Type the masjid name below to enable them.
            </p>
            <Input
              placeholder={`Type "${masjid.name}" to confirm`}
              value={dangerConfirm}
              onChange={(e) => setDangerConfirm(e.target.value)}
            />
            {(() => {
              const armed = dangerConfirm.trim() === masjid.name.trim();
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
