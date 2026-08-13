'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
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
  Select,
  Textarea,
} from '@/components/ui';
import { HouseholdDues } from '@/components/HouseholdDues';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT, type DictKey } from '@/lib/i18n';
import type { Gender, Household } from '@/lib/types';

const HOUSEHOLD_FIELDS = [
  ['familyName', 'hh.familyName'],
  ['headName', 'hh.headName'],
  ['phone', 'hh.phone'],
  ['email', 'hhd.email'],
  ['addressLine1', 'hhd.addressLine1'],
  ['addressLine2', 'hhd.addressLine2'],
  ['city', 'hh.city'],
  ['state', 'hhd.state'],
  ['postalCode', 'hhd.postalCode'],
  ['country', 'hhd.country'],
] as const;

const STATUS_LABELS: Record<string, DictKey> = {
  ACTIVE: 'common.active',
  INACTIVE: 'common.inactive',
  MOVED_OUT: 'common.movedOut',
};

export default function HouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role === 'MASJID_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const [household, setHousehold] = useState<Household | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'members' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('ACTIVE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
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

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;
  if (!household) return <Loading label={t('hhd.loading')} />;

  const members = household.members ?? [];

  const saveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { status, notes };
      for (const [key] of HOUSEHOLD_FIELDS) body[key] = form[key];
      await api(`/masjids/${masjidId}/households/${id}`, { method: 'PATCH', body });
      setDialog(null);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link className="text-sm text-muted-foreground hover:underline" href="/dashboard/households">
            {t('hhd.back')}
          </Link>
          <h1 className="break-words text-2xl font-bold">
            {household.familyName} <Badge value={household.status} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/households/${id}/tree`}>
            <Button variant="secondary">{t('hhd.familyTree')}</Button>
          </Link>
          {isAdmin && (
            <Button variant="danger" onClick={deleteHousehold}>
              {t('hhd.deleteHousehold')}
            </Button>
          )}
        </div>
      </div>

      <ErrorText>{!dialog ? error : ''}</ErrorText>

      {/* Dues lead the page — the most actionable information for staff. */}
      <HouseholdDues masjidId={masjidId} householdId={id} />

      <Card
        title={t('hhd.details')}
        actions={
          <Button variant="secondary" onClick={() => setDialog('edit')}>
            {t('common.edit')}
          </Button>
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {HOUSEHOLD_FIELDS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</dt>
              <dd className="text-sm font-medium">
                {(household[key] as string | null) || <span className="text-muted-foreground">—</span>}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</dt>
            <dd className="text-sm font-medium">
              {STATUS_LABELS[household.status] ? t(STATUS_LABELS[household.status]) : household.status}
            </dd>
          </div>
        </dl>
        {household.notes && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.notes')}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{household.notes}</p>
          </div>
        )}
      </Card>

      <Card
        title={t('hhd.membersTitle')}
        actions={
          <Button variant="secondary" onClick={() => setDialog('members')}>
            {t('common.viewManage')}
          </Button>
        }
      >
        <button
          type="button"
          onClick={() => setDialog('members')}
          className="flex w-full items-baseline gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent"
        >
          <span className="tabular text-3xl font-bold">{members.length}</span>
          <span className="text-sm text-muted-foreground">
            {members.length === 1 ? t('hhd.personIn') : t('hhd.peopleIn')}
          </span>
        </button>
      </Card>

      {/* Edit details: centered popup */}
      <Dialog open={dialog === 'edit'} onOpenChange={(open) => setDialog(open ? 'edit' : null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>{t('hhd.editDialog')}</DialogTitle>
          <form onSubmit={saveHousehold} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HOUSEHOLD_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <Label>{t(label)}</Label>
                  <Input
                    value={form[key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <Label>{t('common.status')}</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ACTIVE">{t('common.active')}</option>
                  <option value="INACTIVE">{t('common.inactive')}</option>
                  <option value="MOVED_OUT">{t('common.movedOut')}</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? t('common.saving') : t('hhd.saveDetails')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members list + add: centered popup */}
      <Dialog open={dialog === 'members'} onOpenChange={(open) => setDialog(open ? 'members' : null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>{t('hhd.membersTitle')} ({members.length})</DialogTitle>
          {members.length > 0 ? (
            <ul className="divide-y divide-border">
              {members.map((member) => (
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
                    className="text-xs text-destructive hover:underline"
                    onClick={() => removeMember(member.id)}
                  >
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('hhd.noMembers')}</Empty>
          )}

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">{t('hhd.addMember')}</p>
            <form onSubmit={addMember} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Input
                placeholder={t('hhd.firstName')}
                value={mFirst}
                onChange={(e) => setMFirst(e.target.value)}
                required
              />
              <Input
                placeholder={t('hhd.lastName')}
                value={mLast}
                onChange={(e) => setMLast(e.target.value)}
                required
              />
              <Input
                placeholder={t('hhd.relationship')}
                list="member-relationships"
                value={mRel}
                onChange={(e) => setMRel(e.target.value)}
              />
              <Select value={mGender} onChange={(e) => setMGender(e.target.value as '' | Gender)}>
                <option value="">{t('hhd.gender')}</option>
                <option value="MALE">{t('hhd.male')}</option>
                <option value="FEMALE">{t('hhd.female')}</option>
              </Select>
              <Input type="date" value={mDob} onChange={(e) => setMDob(e.target.value)} />
              <datalist id="member-relationships">
                {['Head', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other'].map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <Button type="submit" disabled={busy}>
                {busy ? t('common.adding') : t('common.add')}
              </Button>
            </form>
            <ErrorText>{error}</ErrorText>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
