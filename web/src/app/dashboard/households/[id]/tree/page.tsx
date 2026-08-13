'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { FamilyTreeGraph } from '@/components/FamilyTreeGraph';
import { Button, Card, Empty, ErrorText, Label, Loading, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { FamilyTree, Household, Paginated, RelationshipType } from '@/lib/types';

interface MemberOption {
  id: string;
  label: string;
}

export default function HouseholdTreePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;

  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<RelationshipType>('PARENT');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  const loadTree = useCallback(async () => {
    if (!masjidId) return;
    const [treeData, hh] = await Promise.all([
      api<FamilyTree>(`/masjids/${masjidId}/households/${id}/tree`),
      api<Household>(`/masjids/${masjidId}/households/${id}`),
    ]);
    setTree(treeData);
    setHousehold(hh);
  }, [masjidId, id]);

  // Every member in the masjid can be linked — relationships often span households.
  const loadMembers = useCallback(async () => {
    if (!masjidId) return;
    const list = await api<Paginated<Household>>(`/masjids/${masjidId}/households?pageSize=100`);
    const details = await Promise.all(
      list.data.map((h) => api<Household>(`/masjids/${masjidId}/households/${h.id}`)),
    );
    const options = details
      .flatMap((h) =>
        (h.members ?? []).map((m) => ({
          id: m.id,
          label: `${m.firstName} ${m.lastName} — ${h.familyName}`,
        })),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    setMembers(options);
  }, [masjidId]);

  useEffect(() => {
    void Promise.all([loadTree(), loadMembers()]).catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
  }, [loadTree, loadMembers]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of tree?.nodes ?? []) map.set(node.id, `${node.firstName} ${node.lastName}`);
    return (memberId: string) => map.get(memberId) ?? 'Unknown';
  }, [tree]);

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) return;
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/member-relationships`, {
        method: 'POST',
        body: { type, fromMemberId: fromId, toMemberId: toId },
      });
      setFromId('');
      setToId('');
      await loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (relId: string) => {
    setError('');
    try {
      await api(`/masjids/${masjidId}/member-relationships/${relId}`, { method: 'DELETE' });
      await loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the link');
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          className="text-sm text-slate-500 hover:underline"
          href={`/dashboard/households/${id}`}
        >
          ← {household?.familyName ?? 'Household'}
        </Link>
        <h1 className="text-2xl font-bold">{t('tree.title')}</h1>
        <p className="text-sm text-slate-500">{t('tree.note')}</p>
      </div>

      <ErrorText>{error}</ErrorText>

      {tree === null ? (
        <Loading label={t('tree.loading')} />
      ) : tree.nodes.length > 0 ? (
        <>
          <FamilyTreeGraph tree={tree} />
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              <span className="mr-1 inline-block h-3 w-3 rounded border border-emerald-500 bg-emerald-50 align-middle" />
              {t('tree.thisHousehold')}
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 rounded border border-sky-300 bg-sky-50 align-middle" />
              {t('hhd.male')}
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 rounded border border-pink-300 bg-pink-50 align-middle" />
              {t('hhd.female')}
            </span>
            <span>{t('tree.legendEdges')}</span>
          </div>
          {tree.truncated && (
            <p className="text-xs text-amber-600">
              {t('tree.truncated', { n: tree.nodes.length })}
            </p>
          )}
        </>
      ) : (
        <Empty>{t('tree.empty')}</Empty>
      )}

      <Card title={t('tree.link')}>
        <form onSubmit={link} className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>{t('tree.relationship')}</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
              <option value="PARENT">{t('tree.parentChild')}</option>
              <option value="SPOUSE">{t('tree.spouses')}</option>
            </Select>
          </div>
          <div>
            <Label>{type === 'PARENT' ? t('tree.parent') : t('tree.personA')}</Label>
            <Select value={fromId} onChange={(e) => setFromId(e.target.value)} required>
              <option value="">{t('tree.select')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{type === 'PARENT' ? t('tree.child') : t('tree.personB')}</Label>
            <Select value={toId} onChange={(e) => setToId(e.target.value)} required>
              <option value="">{t('tree.select')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !fromId || !toId}>
              {busy ? t('tree.linking') : t('tree.addLink')}
            </Button>
          </div>
        </form>
      </Card>

      {tree && tree.edges.length > 0 && (
        <Card title={t('tree.relationships', { n: tree.edges.length })}>
          <ul className="divide-y divide-slate-100">
            {tree.edges.map((edge) => (
              <li key={edge.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {edge.type === 'PARENT'
                    ? t('tree.isParentOf', {
                        a: nameOf(edge.fromMemberId),
                        b: nameOf(edge.toMemberId),
                      })
                    : t('tree.areSpouses', {
                        a: nameOf(edge.fromMemberId),
                        b: nameOf(edge.toMemberId),
                      })}
                </span>
                <button
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => unlink(edge.id)}
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
