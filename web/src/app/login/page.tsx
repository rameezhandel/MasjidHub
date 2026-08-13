'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function LoginPage() {
  const { login } = useAuth();
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordChanged] = useState(() => {
    if (typeof window === 'undefined') return false;
    const flagged = sessionStorage.getItem('mh.passwordChanged') === '1';
    if (flagged) sessionStorage.removeItem('mh.passwordChanged');
    return flagged;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex justify-center"><Logo /></div>
      <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">{t('login.tagline')}</p>
      {passwordChanged && (
        <p className="mb-4 rounded-lg border border-border bg-accent p-3 text-center text-sm text-primary">
          {t('login.passwordChanged')}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <Label>{t('login.email')}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>{t('login.password')}</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('login.signingIn') : t('login.signIn')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link className="underline" href="/forgot-password">
            {t('login.forgot')}
          </Link>
        </p>
      </form>
    </main>
  );
}
