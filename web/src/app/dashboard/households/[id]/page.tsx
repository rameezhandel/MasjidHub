'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorText, Input, Label, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Gender, Household } from '@/lib/types';

const HOUSEHOLD_FIELDS = [
  ['familyName', 'Family name'],
  ['headName', 'Head of household'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State/Province'],
  ['postalCode', 'Postal code'],
  ['country', 'Country'],
] as const;

export default function HouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role === 'MASJID_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const [household, setHousehold] = useState<Household | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('ACTIVE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [mFirst, setMFirst] = useState('');
  const [mLast, setMLast] = useState('');
  const [mRel, setMRel] = useState('');
  const [mGender, setMGender] = useState<'' | Gender>('');
  const [mDob, setMDob] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    const data = await api<Household>(`/masjids/${masjidId}/households/${id}`);
    setHousehold(data);
    const next: Record<string, string> = {};
    for (const [key] of HOUSEHOLD_FIELDS) next[key] = (data[key] as string | null) ?? '';
    setForm(next);
    setStatus(data.status);
    setNotes(data.notes ?? '');
  }, [masjidId, id]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  if (!masjidId) return <Empty>Households are managed per masjid.</Empty>;
  if (!household) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const saveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = { status, notes };
      for (const [key] of HOUSEHOLD_FIELDS) body[key] = form[key];
      await api(`/masjids/${masjidId}/households/${id}`, { method: 'PATCH', body });
      setNotice('Saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/households/${id}/members`, {
        method: 'POST',
        body: {
          firstName: mFirst,
          lastName: mLast,
          ...(mRel ? { relationship: mRel } : {}),
          ...(mGender ? { gender: mGender } : {}),
          ...(mDob ? { dateOfBirth: mDob } : {}),
        },
      });
      setMFirst('');
      setMLast('');
      setMRel('');
      setMGender('');
      setMDob('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (memberId: string) => {
    await api(`/masjids/${masjidId}/households/${id}/members/${memberId}`, { method: 'DELETE' });
    await load();
  };

  const deleteHousehold = async () => {
    await api(`/masjids/${masjidId}/households/${id}`, { method: 'DELETE' });
    router.push('/dashboard/households');
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link className="text-sm text-muted-foreground hover:underline" href="/dashboard/households">
            ← Households
          </Link>
          <h1 className="text-2xl font-bold">
            {household.familyName} <Badge value={household.status} />
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/households/${id}/tree`}>
            <Button variant="secondary">Family tree</Button>
          </Link>
          {isAdmin && (
            <Button variant="danger" onClick={deleteHousehold}>
              Delete household
            </Button>
          )}
        </div>
      </div>

      <Card title="Household details">
        <form onSubmit={saveHousehold} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {HOUSEHOLD_FIELDS.map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="MOVED_OUT">Moved out</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          {notice && <p className="text-sm text-primary">{notice}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </Button>
        </form>
      </Card>

      <Card title={`Members (${household.members?.length ?? 0})`}>
        {household.members && household.members.length > 0 ? (
          <ul className="mb-5 divide-y divide-border">
            {household.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      member.relationship,
                      member.gender === 'MALE' ? 'M' : member.gender === 'FEMALE' ? 'F' : null,
                      member.dateOfBirth,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <button
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => removeMember(member.id)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No members recorded.</Empty>
        )}

        <form onSubmit={addMember} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Input placeholder="First name" value={mFirst} onChange={(e) => setMFirst(e.target.value)} required />
          <Input placeholder="Last name" value={mLast} onChange={(e) => setMLast(e.target.value)} required />
          <Input placeholder="Relationship" value={mRel} onChange={(e) => setMRel(e.target.value)} />
          <Select value={mGender} onChange={(e) => setMGender(e.target.value as '' | Gender)}>
            <option value="">Gender…</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
          <Input type="date" value={mDob} onChange={(e) => setMDob(e.target.value)} />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </form>
      </Card>
    </div>
  );
}
