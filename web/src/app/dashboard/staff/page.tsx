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
  Select,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Invitation, Paginated, SafeUser } from '@/lib/types';

export default function StaffPage() {
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;
  const isAdmin = user?.role === 'MASJID_ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const [staff, setStaff] = useState<SafeUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('MASJID_MAINTAINER');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!masjidId) return;
    const [users, invites] = await Promise.all([
      api<Paginated<SafeUser>>(`/masjids/${masjidId}/users?pageSize=100`),
      isAdmin
        ? api<Paginated<Invitation>>(`/masjids/${masjidId}/invitations?pageSize=50`)
        : Promise.resolve(null),
    ]);
    setStaff(users.data);
    if (invites) setInvitations(invites.data);
  }, [masjidId, isAdmin]);

  useEffect(() => {
    void load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  if (!masjidId) return <Empty>Staff are managed per masjid.</Empty>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/masjids/${masjidId}/invitations`, {
        method: 'POST',
        body: { email, firstName, lastName, role },
      });
      setNotice(t('staff.sent', { email }));
      setEmail('');
      setFirstName('');
      setLastName('');
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (target: SafeUser) => {
    await api(`/masjids/${masjidId}/users/${target.id}`, {
      method: 'PATCH',
      body: { isActive: !target.isActive },
    });
    await load();
  };

  const revokeInvite = async (id: string) => {
    await api(`/masjids/${masjidId}/invitations/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('staff.title')}</h1>
        {isAdmin && <Button onClick={() => setOpen(true)}>{t('staff.invite')}</Button>}
      </div>

      {notice && !open && (
        <p className="rounded-lg border border-border bg-accent p-3 text-sm text-primary">
          {notice}
        </p>
      )}

      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-xl">
            <DialogTitle>{t('staff.inviteDialog')}</DialogTitle>
            <p className="text-xs text-muted-foreground">{t('staff.inviteHint')}</p>
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t('acc.email')}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>{t('acc.firstName')}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>{t('acc.lastName')}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div>
                <Label>{t('staff.role')}</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="MASJID_MAINTAINER">{t('staff.maintainer')}</option>
                  <option value="MASJID_ADMIN">{t('staff.admin')}</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy}>
                  {busy ? t('staff.sending') : t('staff.send')}
                </Button>
              </div>
              <div className="sm:col-span-2">
                <ErrorText>{error}</ErrorText>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Card title={t('staff.team')}>
        {!loaded ? (
          <Loading label={t('staff.loading')} />
        ) : staff.length === 0 ? (
          <Empty>{t('staff.none')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {member.firstName} {member.lastName}{' '}
                    <span className="text-xs text-muted-foreground">({member.email})</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {member.role === 'MASJID_ADMIN' ? t('staff.admin') : t('staff.maintainer')}
                    {!member.isActive && (
                      <span className="text-red-600"> · {t('staff.deactivated')}</span>
                    )}
                  </p>
                </div>
                {isAdmin && member.id !== user?.id && (
                  <Button
                    variant={member.isActive ? 'danger' : 'secondary'}
                    onClick={() => toggleActive(member)}
                  >
                    {member.isActive ? t('staff.deactivate') : t('staff.reactivate')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin && invitations.length > 0 && (
        <Card title={t('staff.invitations')}>
          <ul className="divide-y divide-border">
            {invitations.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {invite.email} <Badge value={invite.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invite.firstName} {invite.lastName} ·{' '}
                    {invite.role === 'MASJID_ADMIN' ? t('staff.admin') : t('staff.maintainer')} ·{' '}
                    {t('staff.expires')} {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                {invite.status === 'PENDING' && (
                  <Button variant="secondary" onClick={() => revokeInvite(invite.id)}>
                    {t('staff.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
