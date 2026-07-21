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
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MasjidEvent, Paginated } from '@/lib/types';

export default function EventsPage() {
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role !== 'MASJID_MAINTAINER';
  const [items, setItems] = useState<MasjidEvent[]>([]);
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
    void load().catch(() => {});
  }, [load]);

  if (!masjidId) return <Empty>Events are managed per masjid.</Empty>;

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/masjids/${masjidId}/events/${id}`, { method: 'PATCH', body: { status } });
    await load();
  };

  const remove = async (id: string) => {
    await api(`/masjids/${masjidId}/events/${id}`, { method: 'DELETE' });
    await load();
  };

  const newEventForm = (
    <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </div>
      <div>
        <Label>Starts</Label>
        <Input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Ends (optional)</Label>
        <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Label>Location (optional)</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
      </div>
      <div className="sm:col-span-2">
        <Label>Description (optional)</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        {items.length > 0 && <Button onClick={() => setOpen(true)}>+ New event</Button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>New event</DialogTitle>
          <p className="text-xs text-muted-foreground">Saved as a draft — publish it when ready.</p>
          {newEventForm}
        </DialogContent>
      </Dialog>

      <Card title="All events">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <button
              type="button"
              aria-label="New event"
              onClick={() => setOpen(true)}
              className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-3xl leading-none text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              +
            </button>
            <p className="text-sm text-muted-foreground">No events yet — add your first one.</p>
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
                      Publish
                    </Button>
                  )}
                  {item.status === 'PUBLISHED' && (
                    <Button variant="secondary" onClick={() => setStatus(item.id, 'CANCELLED')}>
                      Cancel
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="danger" onClick={() => remove(item.id)}>
                      Delete
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
