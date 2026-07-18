'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, ErrorText, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PrayerTimetableEntry } from '@/lib/types';

const todayStr = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export default function PrayerTimesPage() {
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const [entries, setEntries] = useState<PrayerTimetableEntry[]>([]);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(plusDays(30));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [genFrom, setGenFrom] = useState(todayStr());
  const [genTo, setGenTo] = useState(plusDays(30));
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
    void load();
  }, [load]);

  if (!masjidId) return <Empty>Prayer times are managed per masjid.</Empty>;

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
      setNotice(`Generated ${result.generated} day(s), kept ${result.skipped} existing.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Prayer times</h1>

      <Card title="Auto-generate from your masjid's location">
        <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>From</Label>
            <Input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} />
          </div>
          <div>
            <Label>Jumu&apos;ah time (Fridays)</Label>
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
              Overwrite existing days
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Iqamah offsets in minutes after adhan (optional)</Label>
            <div className="grid grid-cols-5 gap-2">
              {[
                ['Fajr', fajrOffset, setFajrOffset],
                ['Dhuhr', dhuhrOffset, setDhuhrOffset],
                ['Asr', asrOffset, setAsrOffset],
                ['Maghrib', maghribOffset, setMaghribOffset],
                ['Isha', ishaOffset, setIshaOffset],
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
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={busy}>
              {busy ? 'Generating…' : 'Generate timetable'}
            </Button>
            {notice && <span className="ml-3 text-sm text-primary">{notice}</span>}
            <ErrorText>{error}</ErrorText>
            <p className="mt-2 text-xs text-muted-foreground">
              Requires the masjid&apos;s coordinates and calculation method — set them under Masjid
              settings.
            </p>
          </div>
        </form>
      </Card>

      <Card
        title="Timetable"
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
        }
      >
        {entries.length === 0 ? (
          <Empty>No entries in this range yet — generate above.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Fajr</th>
                  <th className="py-2 pr-3">Dhuhr</th>
                  <th className="py-2 pr-3">Asr</th>
                  <th className="py-2 pr-3">Maghrib</th>
                  <th className="py-2 pr-3">Isha</th>
                  <th className="py-2 pr-3">Jumu&apos;ah</th>
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
                          await load();
                        }}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Times shown as adhan / iqamah.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
