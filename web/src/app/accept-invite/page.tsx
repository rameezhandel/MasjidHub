'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { apiPublic } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AuthTokens } from '@/lib/types';

function AcceptInviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { adopt } = useAuth();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const tokens = await apiPublic<AuthTokens>('/invitations/accept', {
        method: 'POST',
        body: { token, password },
      });
      adopt(tokens);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        This link is incomplete — open the invitation link from your email.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <p className="text-sm text-muted-foreground">
        Welcome! Choose a password to activate your MasjidHub account.
      </p>
      <div>
        <Label>Password (12+ characters)</Label>
        <Input
          type="password"
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Confirm password</Label>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Activating…' : 'Activate account'}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-center text-xl font-bold">Join your masjid on MasjidHub</h1>
      <Suspense>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
