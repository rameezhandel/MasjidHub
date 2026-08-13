'use client';

import Link from 'next/link';
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
  Select,
  Textarea,
} from '@/components/ui';
import { HouseholdImport } from '@/components/HouseholdImport';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Gender, Household, HouseholdSummary, Paginated } from '@/lib/types';

interface MemberDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  gender: '' | Gender;
  dateOfBirth: string;
}

const emptyMember = (): MemberDraft => ({
  firstName: '',
  lastName: '',
  relationship: '',
  gender: '',
  dateOfBirth: '',
});

export default function HouseholdsPage() {
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;
  const [items, setItems] = useState<Household[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  // Only one of the two flows can be open at a time.
  const [dialog, setDialog] = useState<'add' | 'import' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [familyName, setFamilyName] = useState('');
  const [headName, setHeadName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState<MemberDraft[]>([emptyMember()]);

  const load = useCallback(async () => {
    if (!masjidId) return;
    const query = new URLSearchParams({ pageSize: '100' });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    const [list, sum] = await Promise.all([
      api<Paginated<Household>>(`/masjids/${masjidId}/households?${query.toString()}`),
      api<HouseholdSummary>(`/masjids/${masjidId}/households/summary`),
    ]);
    setItems(list.data);
    setSummary(sum);
  }, [masjidId, search, status]);

  useEffect(() => {
    void load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  if (!masjidId) return <Empty>Households are managed per masjid.</Empty>;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cleanedMembers = members
        .filter((m) => m.firstName.trim() && m.lastName.trim())
        .map((m) => ({
          firstName: m.firstName,
          lastName: m.lastName,
          ...(m.relationship ? { relationship: m.relationship } : {}),
          ...(m.gender ? { gender: m.gender } : {}),
          ...(m.dateOfBirth ? { dateOfBirth: m.dateOfBirth } : {}),
        }));
      await api(`/masjids/${masjidId}/households`, {
        method: 'POST',
        body: {
          familyName,
          headName,
          ...(phone ? { phone } : {}),
          ...(addressLine1 ? { addressLine1 } : {}),
          ...(city ? { city } : {}),
          ...(notes ? { notes } : {}),
          ...(cleanedMembers.length ? { members: cleanedMembers } : {}),
        },
      });
      setFamilyName('');
      setHeadName('');
      setPhone('');
      setAddressLine1('');
      setCity('');
      setNotes('');
      setMembers([emptyMember()]);
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register household');
    } finally {
      setBusy(false);
    }
  };

  const updateMember = (index: number, patch: Partial<MemberDraft>) =>
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('hh.title')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDialog('import')}>
            {t('hh.import')}
          </Button>
          <Button onClick={() => setDialog('add')}>{t('hh.register')}</Button>
        </div>
      </div>

      {/* Import: centered popup */}
      <Dialog open={dialog === 'import'} onOpenChange={(open) => setDialog(open ? 'import' : null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{t('hh.importDialog')}</DialogTitle>
          <HouseholdImport
            masjidId={masjidId}
            onImported={() => {
              void load();
              setDialog(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            [t('hh.title'), summary.total],
            [t('common.active'), summary.active],
            [t('common.inactive'), summary.inactive],
            [t('common.movedOut'), summary.movedOut],
            [t('hh.people'), summary.members],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-border bg-card p-4">
              <p className="text-2xl font-bold">{value as number}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label as string}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add household: centered popup */}
      <Dialog open={dialog === 'add'} onOpenChange={(open) => setDialog(open ? 'add' : null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{t('hh.registerDialog')}</DialogTitle>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('hh.familyName')}</Label>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
              </div>
              <div>
                <Label>{t('hh.headName')}</Label>
                <Input value={headName} onChange={(e) => setHeadName(e.target.value)} required />
              </div>
              <div>
                <Label>{t('hh.phone')}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>{t('hh.city')}</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('hh.address')}</Label>
                <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('common.notes')}</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>{t('hh.familyMembers')}</Label>
              <div className="space-y-2">
                {members.map((member, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Input
                      placeholder={t('hhd.firstName')}
                      value={member.firstName}
                      onChange={(e) => updateMember(index, { firstName: e.target.value })}
                    />
                    <Input
                      placeholder={t('hhd.lastName')}
                      value={member.lastName}
                      onChange={(e) => updateMember(index, { lastName: e.target.value })}
                    />
                    <Input
                      placeholder={t('hhd.relationship')}
                      list="relationships"
                      value={member.relationship}
                      onChange={(e) => updateMember(index, { relationship: e.target.value })}
                    />
                    <Select
                      value={member.gender}
                      onChange={(e) =>
                        updateMember(index, { gender: e.target.value as '' | Gender })
                      }
                    >
                      <option value="">{t('hhd.gender')}</option>
                      <option value="MALE">{t('hhd.male')}</option>
                      <option value="FEMALE">{t('hhd.female')}</option>
                    </Select>
                    <Input
                      type="date"
                      value={member.dateOfBirth}
                      onChange={(e) => updateMember(index, { dateOfBirth: e.target.value })}
                    />
                  </div>
                ))}
                <datalist id="relationships">
                  {['Head', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other'].map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMembers((prev) => [...prev, emptyMember()])}
                >
                  {t('hh.addAnother')}
                </Button>
              </div>
            </div>

            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? t('common.saving') : t('hh.registerAction')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card
        title={t('hh.registered')}
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40"
            />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
              <option value="">{t('common.allStatuses')}</option>
              <option value="ACTIVE">{t('common.active')}</option>
              <option value="INACTIVE">{t('common.inactive')}</option>
              <option value="MOVED_OUT">{t('common.movedOut')}</option>
            </Select>
          </div>
        }
      >
        {!loaded ? (
          <Loading label={t('hh.loading')} />
        ) : items.length === 0 ? (
          <Empty>{t('hh.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((household) => (
              <li key={household.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    <Link className="hover:underline" href={`/dashboard/households/${household.id}`}>
                      {household.familyName}
                    </Link>{' '}
                    <Badge value={household.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {household.headName}
                    {household.city ? ` · ${household.city}` : ''} ·{' '}
                    {household._count?.members ?? 0}{' '}
                    {household._count?.members === 1 ? t('hh.member') : t('hh.members')}
                    {household.phone ? ` · ${household.phone}` : ''}
                  </p>
                </div>
                <Link
                  href={`/dashboard/households/${household.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t('hh.open')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
