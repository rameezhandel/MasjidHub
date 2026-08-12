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
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { SafeUser } from '@/lib/types';

const MIN_PASSWORD = 12;

export default function AccountPage() {
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
      setProfileNotice('Name updated.');
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

  const roleLabel = user.role
    .replace('PLATFORM_ADMIN', 'Platform admin')
    .replace('MASJID_ADMIN', 'Masjid admin')
    .replace('MASJID_MAINTAINER', 'Masjid maintainer');

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {profileNotice && !dialog && <p className="text-sm text-primary">{profileNotice}</p>}

      <Card
        title="Your profile"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>
              Edit
            </Button>
            <Button variant="secondary" onClick={openPassword}>
              Change password
            </Button>
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(
            [
              ['First name', user.firstName],
              ['Last name', user.lastName],
              ['Email', user.email],
              ['Role', roleLabel],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Edit name: centered popup */}
      <Dialog open={dialog === 'edit'} onOpenChange={(open) => setDialog(open ? 'edit' : null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit your name</DialogTitle>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <ErrorText>{profileError}</ErrorText>
            <Button type="submit" disabled={profileBusy}>
              {profileBusy ? 'Saving…' : 'Save name'}
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
          <DialogTitle>Change password</DialogTitle>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <Label>Current password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>New password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD} characters. Changing your password signs you out of all
              sessions — you&apos;ll log back in with the new one.
            </p>
            <ErrorText>{pwError}</ErrorText>
            <Button type="submit" disabled={pwBusy}>
              {pwBusy ? 'Updating…' : 'Change password'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
