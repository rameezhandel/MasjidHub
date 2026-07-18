'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Empty, ErrorText, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { SafeUser } from '@/lib/types';

const MIN_PASSWORD = 12;

export default function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();

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

  if (!user) return <Empty>Loading…</Empty>;

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

      <Card title="Your profile">
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
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Role:</span> {roleLabel}
            </p>
          </div>
          <ErrorText>{profileError}</ErrorText>
          {profileNotice && <p className="text-sm text-primary">{profileNotice}</p>}
          <Button type="submit" disabled={profileBusy}>
            {profileBusy ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      </Card>

      <Card title="Change password">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
      </Card>
    </div>
  );
}
