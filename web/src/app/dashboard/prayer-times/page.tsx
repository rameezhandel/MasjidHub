'use client';

import { useCallback, useEffect, useState } from 'react';
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
} from '@/components/ui';
import { api, refreshPublicPages } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { PrayerTimetableEntry } from '@/lib/types';

const todayStr = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export default function PrayerTimesPage() {
  const t = useT();
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const [entries, setEntries] = useState<PrayerTimetableEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The timetable always shows the coming month, starting today.
  const [from] = useState(todayStr());
  const [to] = useState(() => plusDays(30));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const [genFrom, setGenFrom] = useState(todayStr());
  // Default to a full year — the backend allows up to 366 days inclusive.
  const [genTo, setGenTo] = useState(() => plusDays(365));
  const [overwrite, setOverwrite] = useState(false);
  const [fajrOffset, setFajrOffset] = useState('');
  const [dhuhrOffset, setDhuhrOffset] = useState('');
  const [asrOffset, setAsrOffset] = useState('');
  const [maghribOffset, setMaghribOffset] = useState('');
  const [ishaOffset, setIshaOffset] = useState('');
  const [jumuah1, setJumuah1] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    try {
      setEntries(
        await api<PrayerTimetableEntry[]>(
          `/masjids/${masjidId}/prayer-times?from=${from}&to=${to}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [masjidId, from, to]);

  useEffect(() => {
    void load().finally(() => setLoaded(true));
  }, [load]);

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const offsets: Record<string, number> = {};
      for (const [key, value] of Object.entries({
        fajr: fajrOffset,
        dhuhr: dhuhrOffset,
        asr: asrOffset,
        maghrib: maghribOffset,
        isha: ishaOffset,
      })) {
        if (value !== '') offsets[key] = Number(value);
      }
      const result = await api<{ generated: number; skipped: number }>(
        `/masjids/${masjidId}/prayer-times/generate`,
        {
          method: 'POST',
          body: {
            from: genFrom,
            to: genTo,
            overwrite,
            ...(Object.keys(offsets).length ? { iqamahOffsets: offsets } : {}),
            ...(jumuah1 ? { jumuah1 } : {}),
          },
        },
      );
      setNotice(t('pt.generated', { n: result.generated, m: result.skipped }));
      setOpen(false);
      refreshPublicPages();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('pt.title')}</h1>
        <Button onClick={() => setOpen(true)}>{t('pt.autoGenerate')}</Button>
      </div>

      {notice && !open && (
        <p className="rounded-lg border border-border bg-accent p-3 text-sm text-primary">
          {notice}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{t('pt.dialogTitle')}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('pt.dialogHint')}</p>
          <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('pt.from')}</Label>
              <Input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t('pt.to')}</Label>
              <Input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} />
            </div>
            <div>
              <Label>{t('pt.jumuahTime')}</Label>
              <Input
                placeholder="13:30"
                value={jumuah1}
                onChange={(e) => setJumuah1(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <input
                id="overwrite"
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              <label htmlFor="overwrite" className="text-sm text-muted-foreground">
                {t('pt.overwrite')}
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label>{t('pt.offsets')}</Label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  [t('prayer.fajr'), fajrOffset, setFajrOffset],
                  [t('prayer.dhuhr'), dhuhrOffset, setDhuhrOffset],
                  [t('prayer.asr'), asrOffset, setAsrOffset],
                  [t('prayer.maghrib'), maghribOffset, setMaghribOffset],
                  [t('prayer.isha'), ishaOffset, setIshaOffset],
                ].map(([label, value, setter]) => (
                  <Input
                    key={label as string}
                    type="number"
                    min={0}
                    max={180}
                    placeholder={label as string}
                    value={value as string}
                    onChange={(e) =>
                      (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)
                    }
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? t('pt.generating') : t('pt.generate')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card
        title={t('pt.timetable')}
        actions={
          <span className="tabular text-sm text-muted-foreground">
            {from} — {to}
          </span>
        }
      >
        {!loaded ? (
          <Loading label={t('pt.loading')} />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <button
              type="button"
              aria-label={t('pt.autoGenerate')}
              onClick={() => setOpen(true)}
              className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-3xl leading-none text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              +
            </button>
            <p className="text-sm text-muted-foreground">{t('pt.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">{t('pt.date')}</th>
                  <th className="py-2 pr-3">{t('prayer.fajr')}</th>
                  <th className="py-2 pr-3">{t('prayer.dhuhr')}</th>
                  <th className="py-2 pr-3">{t('prayer.asr')}</th>
                  <th className="py-2 pr-3">{t('prayer.maghrib')}</th>
                  <th className="py-2 pr-3">{t('prayer.isha')}</th>
                  <th className="py-2 pr-3">{t('prayer.jumuah')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">{entry.date}</td>
                    {(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((prayer) => (
                      <td key={prayer} className="py-1.5 pr-3">
                        {entry[prayer]}
                        {entry[`${prayer}Iqamah`] && (
                          <span className="text-xs text-muted-foreground"> / {entry[`${prayer}Iqamah`]}</span>
                        )}
                      </td>
                    ))}
                    <td className="py-1.5 pr-3">{entry.jumuah1 ?? '—'}</td>
                    <td className="py-1.5 text-right">
                      <button
                        className="text-xs text-red-500 underline"
                        onClick={async () => {
                          await api(`/masjids/${masjidId}/prayer-times/${entry.date}`, {
                            method: 'DELETE',
                          });
                          refreshPublicPages();
                          await load();
                        }}
                      >
                        {t('pt.deleteRow')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{t('pt.legend')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
