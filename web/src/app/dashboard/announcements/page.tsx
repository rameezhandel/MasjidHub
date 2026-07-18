'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorText, Input, Label, Textarea } from '@/components/ui';
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
      <h1 className="text-2xl font-bold">Announcements</h1>

      <Card title="New announcement (saved as draft)">
        <form onSubmit={create} className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
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
      </Card>

      <Card title="All announcements">
        {items.length === 0 ? (
          <Empty>Nothing yet — write your first announcement above.</Empty>
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
