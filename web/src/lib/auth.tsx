'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { apiPublic, session } from './api';
import type { AuthTokens, SafeUser } from './types';

const SESSION_EVENT = 'mh-session-changed';

function notifySessionChanged(): void {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem('mh.user');
}

function getServerSnapshot(): string | null {
  return null;
}

interface AuthContextValue {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  logout: () => Promise<void>;
  adopt: (tokens: AuthTokens) => void;
  setUser: (user: SafeUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // The session lives in localStorage (an external store); useSyncExternalStore
  // keeps React in sync without hydration mismatches (server snapshot = null).
  const rawUser = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const user = useMemo<SafeUser | null>(
    () => (rawUser ? (JSON.parse(rawUser) as SafeUser) : null),
    [rawUser],
  );

  const login = useCallback(async (email: string, password: string): Promise<SafeUser> => {
    const tokens = await apiPublic<AuthTokens>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    session.save(tokens);
    notifySessionChanged();
    return tokens.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = session.refreshToken();
    const accessToken = session.accessToken();
    if (refreshToken && accessToken) {
      try {
        await apiPublicWithAuth('/auth/logout', accessToken, { refreshToken });
      } catch {
        // best-effort server-side revocation
      }
    }
    session.clear();
    notifySessionChanged();
  }, []);

  const adopt = useCallback((tokens: AuthTokens): void => {
    session.save(tokens);
    notifySessionChanged();
  }, []);

  // Persist an updated profile (e.g. after a rename) so the whole app re-renders.
  const setUser = useCallback((next: SafeUser): void => {
    localStorage.setItem('mh.user', JSON.stringify(next));
    notifySessionChanged();
  }, []);

  const value = useMemo(
    () => ({ user, loading: !hydrated, login, logout, adopt, setUser }),
    [user, hydrated, login, logout, adopt, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function apiPublicWithAuth(
  path: string,
  accessToken: string,
  body: unknown,
): Promise<void> {
  const base =
    (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '') + '/api/v1';
  await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
