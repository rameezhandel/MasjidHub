'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorText, Input, Loading, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Gender, MemberSearchResult, Paginated } from '@/lib/types';

const PAGE_SIZE = 25;

export default function MembersPage() {
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;

  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<'' | Gender>('');
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  // Starts true so the first render shows a loader, not a false "no members".
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!masjidId) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) query.set('search', search.trim());
      if (gender) query.set('gender', gender);
      const res = await api<Paginated<MemberSearchResult>>(
        `/masjids/${masjidId}/members?${query.toString()}`,
      );
      setResults(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [masjidId, search, gender, page]);

  // Reset to the first page whenever the query changes.
  useEffect(() => {
    setPage(1);
  }, [search, gender]);

  // Debounce so we don't hit the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('mem.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('mem.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t('mem.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
          autoFocus
        />
        <Select
          value={gender}
          onChange={(e) => setGender(e.target.value as '' | Gender)}
          className="w-36"
        >
          <option value="">{t('mem.anyGender')}</option>
          <option value="MALE">{t('hhd.male')}</option>
          <option value="FEMALE">{t('hhd.female')}</option>
        </Select>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {loading ? (
            <>
              <Spinner className="size-3.5" /> {t('mem.searching')}
            </>
          ) : (
            `${total} ${total === 1 ? t('mem.person') : t('mem.people')}`
          )}
        </span>
      </div>

      <ErrorText>{error}</ErrorText>

      <Card title={t('mem.results')}>
        {loading && results.length === 0 ? (
          <Loading label={t('mem.searchingLong')} />
        ) : results.length === 0 ? (
          <Empty>{search.trim() ? t('mem.noMatch') : t('mem.none')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {member.firstName} {member.lastName}
                    {member.relationship ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {member.relationship}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link
                      className="hover:underline"
                      href={`/dashboard/households/${member.household.id}`}
                    >
                      {member.household.familyName}
                    </Link>{' '}
                    <Badge value={member.household.status} />
                    {member.phone ? ` · ${member.phone}` : ''}
                    {member.email ? ` · ${member.email}` : ''}
                  </p>
                </div>
                <Link
                  href={`/dashboard/households/${member.household.id}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  {t('hh.open')}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              className="text-primary disabled:text-muted-foreground"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('mem.prev')}
            </button>
            <span className="text-muted-foreground">
              {t('mem.page', { x: page, y: totalPages })}
            </span>
            <button
              className="text-primary disabled:text-muted-foreground"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('mem.next')}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
