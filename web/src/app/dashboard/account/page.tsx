'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  ErrorText,
  Input,
  Label,
  Loading,
} from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { SafeUser } from '@/lib/types';

const MIN_PASSWORD = 12;

export default function AccountPage() {
  const t = useT();
  const { user, setUser, logout } = useAuth();
  const router = useRouter();

  const [dialog, setDialog] = useState<'edit' | 'password' | null>(null);

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  if (!user) return <Loading />;

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  const openEdit = () => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setProfileError('');
    setDialog('edit');
  };

  const openPassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwError('');
    setDialog('password');
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    setProfileNotice('');
    try {
      const updated = await api<SafeUser>('/auth/me', {
        method: 'PATCH',
        body: { firstName: firstName.trim(), lastName: lastName.trim() },
      });
      // Keep only the SafeUser fields the session stores.
      setUser({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        role: updated.role,
        masjidId: updated.masjidId,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
      setProfileNotice(t('acc.nameUpdated'));
      setDialog(null);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update your name');
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword.length < MIN_PASSWORD) {
      setPwError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      // Changing the password revokes every session — send them back to log in.
      // Flag via sessionStorage: the layout's auth guard also redirects to
      // /login when the session clears, which would strip a query param.
      sessionStorage.setItem('mh.passwordChanged', '1');
      await logout();
      router.replace('/login');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change your password');
      setPwBusy(false);
    }
  };

  const roleLabel =
    user.role === 'PLATFORM_ADMIN'
      ? t('acc.platformAdmin')
      : user.role === 'MASJID_ADMIN'
        ? t('acc.masjidAdmin')
        : t('acc.masjidMaintainer');

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('acc.title')}</h1>

      {profileNotice && !dialog && <p className="text-sm text-primary">{profileNotice}</p>}

      <Card
        title={t('acc.profile')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>
              {t('common.edit')}
            </Button>
            <Button variant="secondary" onClick={openPassword}>
              {t('acc.changePassword')}
            </Button>
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(
            [
              [t('acc.firstName'), user.firstName],
              [t('acc.lastName'), user.lastName],
              [t('acc.email'), user.email],
              [t('acc.role'), roleLabel],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Device preferences — stored locally, not on the account. */}
      <Card title={t('acc.preferences')}>
        <dl className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm font-medium">{t('nav.language')}</dt>
            <dd>
              <LanguageSwitcher className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm font-medium">{t('acc.theme')}</dt>
            <dd>
              <ThemeToggle className="text-sm" />
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <Button variant="danger" onClick={signOut}>
          {t('nav.signOut')}
        </Button>
      </div>

      {/* Edit name: centered popup */}
      <Dialog open={dialog === 'edit'} onOpenChange={(open) => setDialog(open ? 'edit' : null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t('acc.editName')}</DialogTitle>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('acc.firstName')}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>{t('acc.lastName')}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <ErrorText>{profileError}</ErrorText>
            <Button type="submit" disabled={profileBusy}>
              {profileBusy ? t('common.saving') : t('acc.saveName')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change password: centered popup */}
      <Dialog
        open={dialog === 'password'}
        onOpenChange={(open) => setDialog(open ? 'password' : null)}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>{t('acc.changePassword')}</DialogTitle>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <Label>{t('acc.currentPassword')}</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t('acc.newPassword')}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t('acc.confirmPassword')}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('acc.passwordHint', { n: MIN_PASSWORD })}
            </p>
            <ErrorText>{pwError}</ErrorText>
            <Button type="submit" disabled={pwBusy}>
              {pwBusy ? t('acc.updating') : t('acc.changePassword')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
