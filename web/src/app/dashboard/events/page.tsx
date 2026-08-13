'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
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
  Textarea,
} from '@/components/ui';
import { api, refreshPublicPages } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { MasjidEvent, Paginated } from '@/lib/types';

export default function EventsPage() {
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role !== 'MASJID_MAINTAINER';
  const [items, setItems] = useState<MasjidEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!masjidId) return;
    const res = await api<Paginated<MasjidEvent>>(`/masjids/${masjidId}/events?pageSize=50`);
    setItems(res.data);
  }, [masjidId]);

  useEffect(() => {
    void load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/events`, {
        method: 'POST',
        body: {
          title,
          description: description || undefined,
          location: location || undefined,
          startsAt: new Date(startsAt).toISOString(),
          ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
        },
      });
      setTitle('');
      setDescription('');
      setLocation('');
      setStartsAt('');
      setEndsAt('');
      setOpen(false);
      refreshPublicPages();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/masjids/${masjidId}/events/${id}`, { method: 'PATCH', body: { status } });
    refreshPublicPages();
    await load();
  };

  const remove = async (id: string) => {
    await api(`/masjids/${masjidId}/events/${id}`, { method: 'DELETE' });
    refreshPublicPages();
    await load();
  };

  const newEventForm = (
    <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>{t('ann.titleLabel')}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </div>
      <div>
        <Label>{t('ev.starts')}</Label>
        <Input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>{t('ev.ends')}</Label>
        <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Label>{t('ev.location')}</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
      </div>
      <div className="sm:col-span-2">
        <Label>{t('ev.description')}</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('ann.saveDraft')}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('ev.title')}</h1>
        {items.length > 0 && <Button onClick={() => setOpen(true)}>{t('ev.new')}</Button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{t('ev.dialogTitle')}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('ann.draftHint')}</p>
          {newEventForm}
        </DialogContent>
      </Dialog>

      <Card title={t('ev.all')}>
        {!loaded ? (
          <Loading label={t('ev.loading')} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <button
              type="button"
              aria-label={t('ev.dialogTitle')}
              onClick={() => setOpen(true)}
              className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-3xl leading-none text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              +
            </button>
            <p className="text-sm text-muted-foreground">{t('ev.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.title} <Badge value={item.status} />
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(item.startsAt).toLocaleString()}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status === 'DRAFT' && (
                    <Button variant="secondary" onClick={() => setStatus(item.id, 'PUBLISHED')}>
                      {t('common.publish')}
                    </Button>
                  )}
                  {item.status === 'PUBLISHED' && (
                    <Button variant="secondary" onClick={() => setStatus(item.id, 'CANCELLED')}>
                      {t('common.cancel')}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="danger" onClick={() => remove(item.id)}>
                      {t('common.delete')}
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
