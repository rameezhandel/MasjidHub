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
import type { Announcement, Paginated } from '@/lib/types';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role !== 'MASJID_MAINTAINER';
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!masjidId) return;
    const res = await api<Paginated<Announcement>>(
      `/masjids/${masjidId}/announcements?pageSize=50`,
    );
    setItems(res.data);
  }, [masjidId]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  if (!masjidId) return <Empty>Announcements are managed per masjid.</Empty>;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/announcements`, { method: 'POST', body: { title, body } });
      setTitle('');
      setBody('');
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/masjids/${masjidId}/announcements/${id}`, { method: 'PATCH', body: { status } });
    await load();
  };

  const remove = async (id: string) => {
    await api(`/masjids/${masjidId}/announcements/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcements</h1>
        {items.length > 0 && <Button onClick={() => setOpen(true)}>+ New announcement</Button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>New announcement</DialogTitle>
          <p className="text-xs text-muted-foreground">Saved as a draft — publish it when ready.</p>
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save draft'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card title="All announcements">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <button
              type="button"
              aria-label="New announcement"
              onClick={() => setOpen(true)}
              className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-3xl leading-none text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              +
            </button>
            <p className="text-sm text-muted-foreground">
              Nothing yet — write your first announcement.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.title} <Badge value={item.status} />
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                    {item.body}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status !== 'PUBLISHED' && (
                    <Button variant="secondary" onClick={() => setStatus(item.id, 'PUBLISHED')}>
                      Publish
                    </Button>
                  )}
                  {item.status === 'PUBLISHED' && (
                    <Button variant="secondary" onClick={() => setStatus(item.id, 'ARCHIVED')}>
                      Archive
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
