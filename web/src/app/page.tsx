'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import { apiPublic } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated, PublicMasjidCard } from '@/lib/types';

export default function LandingPage() {
  const { user, loading } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicMasjidCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const handle = setTimeout(() => {
      apiPublic<Paginated<PublicMasjidCard>>(
        `/public/masjids?pageSize=8&search=${encodeURIComponent(term)}`,
      )
        .then((res) => {
          if (id !== reqId.current) return; // a newer keystroke won
          setResults(res.data);
          setSearched(true);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setResults([]);
          setSearched(true);
        })
        .finally(() => {
          if (id === reqId.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const place = (m: PublicMasjidCard) =>
    [m.city, m.state, m.country].filter(Boolean).join(', ');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-3 text-4xl">🕌</p>
      <h1 className="text-4xl font-bold tracking-tight text-foreground">MasjidHub</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        One platform for many masjids. Accurate prayer times, announcements, and events for your
        community — managed by your masjid&apos;s own team.
      </p>
      <div className="mt-8 flex gap-3">
        {loading ? null : user ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Staff sign in
          </Link>
        )}
      </div>

      {/* Find your masjid */}
      <div className="mt-12 w-full max-w-md text-left">
        <label htmlFor="masjid-search" className="mb-2 block text-center text-sm text-muted-foreground">
          Looking for your masjid? Search by name or city.
        </label>
        <Input
          id="masjid-search"
          type="search"
          placeholder="e.g. Central Mosque or London"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />

        {query.trim().length >= 2 && (
          <div className="mt-3 rounded-lg border border-border bg-card">
            {searching && results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
            ) : results.length > 0 ? (
              <ul className="divide-y divide-border">
                {results.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/m/${m.slug}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent"
                    >
                      <span className="font-medium text-foreground">{m.name}</span>
                      {place(m) && (
                        <span className="shrink-0 text-xs text-muted-foreground">{place(m)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : searched ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                No masjids found for “{query.trim()}”.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
