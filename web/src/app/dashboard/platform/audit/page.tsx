'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AuditLog, Paginated } from '@/lib/types';

const ACTIONS = [
  '',
  'MASJID_CREATED',
  'MASJID_STATUS_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'INVITATION_CREATED',
  'INVITATION_ACCEPTED',
  'INVITATION_REVOKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
];

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    const res = await api<Paginated<AuditLog>>(
      `/audit-logs?pageSize=100${action ? `&action=${action}` : ''}`,
    );
    setEntries(res.data);
  }, [action]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  if (user && user.role !== 'PLATFORM_ADMIN') {
    return <Empty>Only the platform admin can view the audit log.</Empty>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Audit log</h1>
      <Card
        title="Sensitive actions"
        actions={
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56">
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value === '' ? 'All actions' : value.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        }
      >
        {entries.length === 0 ? (
          <Empty>No audit entries.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-medium">{entry.action.replaceAll('_', ' ')}</td>
                    <td className="py-2 pr-3">{entry.actorEmail ?? '—'}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
