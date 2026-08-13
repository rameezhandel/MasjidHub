'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  ErrorText,
  Input,
  Label,
  Select,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/**
 * The invite-a-staff-member flow, shared by the Staff page and Masjid
 * settings so both offer the same form rather than two copies of it.
 * `onInvited` receives the notice text, letting each host place it where
 * it fits that page.
 */
export function StaffInviteDialog({
  masjidId,
  open,
  onOpenChange,
  onInvited,
}: {
  masjidId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: (notice: string) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('MASJID_MAINTAINER');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/invitations`, {
        method: 'POST',
        body: { email, firstName, lastName, role },
      });
      onInvited?.(t('staff.sent', { email }));
      setEmail('');
      setFirstName('');
      setLastName('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{t('staff.inviteDialog')}</DialogTitle>
        <p className="text-xs text-muted-foreground">{t('staff.inviteHint')}</p>
        <form onSubmit={invite} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('acc.email')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
  );
}
