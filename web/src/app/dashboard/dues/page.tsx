'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  Empty,
  ErrorText,
  Input,
  Label,
  Loading,
  Select,
} from '@/components/ui';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/currencies';
import { useT } from '@/lib/i18n';
import type {
  DuesFilter,
  DuesTotals,
  FeeFrequency,
  HouseholdDuesRow,
  Paginated,
} from '@/lib/types';

const todayStr = () => new Date().toISOString().slice(0, 10);
const toCents = (v: string) => Math.round(parseFloat(v) * 100);
const centsToInput = (cents: number) => (cents / 100).toFixed(2);

type DuesResponse = Paginated<HouseholdDuesRow> & { totals: DuesTotals };

export default function DuesPage() {
  const { user } = useAuth();
  const t = useT();
  const masjidId = user?.masjidId;

  const [rows, setRows] = useState<HouseholdDuesRow[]>([]);
  const [totals, setTotals] = useState<DuesTotals | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DuesFilter>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // One dialog at a time: bulk fee, a household's fee, or a payment.
  const [dialog, setDialog] = useState<'bulk' | 'fee' | 'payment' | null>(null);
  const [target, setTarget] = useState<HouseholdDuesRow | null>(null);

  const [feeAmount, setFeeAmount] = useState('');
  const [feeFrequency, setFeeFrequency] = useState<'' | FeeFrequency>('MONTHLY');
  const [feeStartOn, setFeeStartOn] = useState(todayStr());
  const [onlyWithoutFee, setOnlyWithoutFee] = useState(false);

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    const query = new URLSearchParams({ pageSize: '100', filter });
    if (search.trim()) query.set('search', search.trim());
    const res = await api<DuesResponse>(`/masjids/${masjidId}/dues?${query.toString()}`);
    setRows(res.data);
    setTotals(res.totals);
  }, [masjidId, search, filter]);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void load()
          .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
          .finally(() => setLoaded(true)),
      250,
    );
    return () => clearTimeout(timer);
  }, [load]);

  if (!masjidId) return <Empty>{t('common.perMasjid')}</Empty>;

  const currency = totals?.currency ?? 'INR';
  const fmt = (cents: number) => formatMoney(cents, currency);

  const openBulk = () => {
    setFeeAmount('');
    setFeeFrequency('MONTHLY');
    setFeeStartOn(todayStr());
    setOnlyWithoutFee(false);
    setError('');
    setDialog('bulk');
  };

  const openFee = (row: HouseholdDuesRow) => {
    setTarget(row);
    setFeeAmount(row.feeAmountCents != null ? centsToInput(row.feeAmountCents) : '');
    setFeeFrequency(row.feeFrequency ?? '');
    setFeeStartOn(row.feeStartOn ?? todayStr());
    setError('');
    setDialog('fee');
  };

  const openPayment = (row: HouseholdDuesRow) => {
    setTarget(row);
    setPayAmount(row.balanceCents > 0 ? centsToInput(row.balanceCents) : '');
    setPayDate(todayStr());
    setPayMethod('');
    setError('');
    setDialog('payment');
  };

  const applyBulkFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ updated: number; skipped: number }>(`/masjids/${masjidId}/dues/fee`, {
        method: 'POST',
        body: {
          feeAmountCents: toCents(feeAmount),
          feeFrequency: feeFrequency || 'MONTHLY',
          feeStartOn,
          onlyWithoutFee,
        },
      });
      setNotice(t('duesPage.applied', { n: res.updated, m: res.skipped }));
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the fee');
    } finally {
      setBusy(false);
    }
  };

  const saveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const clearing = feeAmount.trim() === '' || feeFrequency === '';
      await api(`/masjids/${masjidId}/households/${target.id}`, {
        method: 'PATCH',
        body: clearing
          ? { feeAmountCents: 0, feeFrequency: null, feeStartOn: null }
          : {
              feeAmountCents: toCents(feeAmount),
              feeFrequency,
              feeStartOn: feeStartOn || todayStr(),
            },
      });
      setNotice(t('duesPage.saved'));
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the fee');
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !payAmount.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/households/${target.id}/payments`, {
        method: 'POST',
        body: {
          amountCents: toCents(payAmount),
          paidOn: payDate,
          ...(payMethod ? { method: payMethod } : {}),
        },
      });
      setNotice(t('duesPage.saved'));
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment');
    } finally {
      setBusy(false);
    }
  };

  const exportSheet = async () => {
    setExporting(true);
    try {
      await apiDownload(`/masjids/${masjidId}/dues/export`, 'masjidhub-dues.xlsx');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const feeLabel = (row: HouseholdDuesRow) => {
    if (row.feeAmountCents == null || !row.feeFrequency) return t('duesPage.noFee');
    const amount = fmt(row.feeAmountCents);
    return row.feeFrequency === 'YEARLY'
      ? t('duesPage.perYear', { amount })
      : t('duesPage.perMonth', { amount });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('duesPage.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('duesPage.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportSheet} disabled={exporting}>
            {exporting ? t('duesPage.exporting') : t('duesPage.export')}
          </Button>
          <Button onClick={openBulk}>{t('duesPage.setFee')}</Button>
        </div>
      </div>

      {notice && !dialog && <p className="text-sm text-primary">{notice}</p>}
      <ErrorText>{!dialog ? error : ''}</ErrorText>

      {/* Masjid-wide roll-up — always the whole masjid, not the filtered page. */}
      {totals && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            [t('duesPage.expected'), fmt(totals.expectedCents), ''],
            [t('duesPage.collected'), fmt(totals.paidCents), 'text-primary'],
            [
              t('duesPage.outstanding'),
              fmt(totals.balanceCents),
              totals.balanceCents > 0 ? 'text-gold' : 'text-muted-foreground',
            ],
          ].map(([label, value, tone], i) => (
            <div
              key={label}
              className={`rounded-xl border p-4 ${
                i === 2 && totals.balanceCents > 0
                  ? 'border-gold/40 bg-gold/10'
                  : 'border-border bg-card'
              }`}
            >
              <p className={`tabular text-2xl font-bold ${tone}`}>{value}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {totals && (
        <p className="text-sm text-muted-foreground">
          {t('duesPage.owingCount', { n: totals.owingHouseholds, total: totals.households })}
          {totals.withoutFee > 0 && ` · ${t('duesPage.noFeeCount', { n: totals.withoutFee })}`}
        </p>
      )}

      <Card
        title={t('duesPage.household')}
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            />
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as DuesFilter)}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            >
              <option value="all">{t('duesPage.filterAll')}</option>
              <option value="owing">{t('duesPage.filterOwing')}</option>
              <option value="settled">{t('duesPage.filterSettled')}</option>
              <option value="no-fee">{t('duesPage.filterNoFee')}</option>
            </Select>
          </div>
        }
      >
        {!loaded ? (
          <Loading label={t('duesPage.loading')} />
        ) : rows.length === 0 ? (
          <Empty>{t('duesPage.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Link className="hover:underline" href={`/dashboard/households/${row.id}`}>
                      {row.familyName}
                    </Link>{' '}
                    {row.status !== 'ACTIVE' && <Badge value={row.status} />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.headName} · {feeLabel(row)}
                    {row.feeEndOn ? ` · ${t('duesPage.stopped', { date: row.feeEndOn })}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`tabular text-sm font-semibold ${
                      row.balanceCents > 0 ? 'text-gold' : 'text-muted-foreground'
                    }`}
                  >
                    {fmt(row.balanceCents)}
                  </span>
                  <Button variant="ghost" onClick={() => openFee(row)}>
                    {t('duesPage.editFee')}
                  </Button>
                  <Button variant="secondary" onClick={() => openPayment(row)}>
                    {t('duesPage.record')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* One fee for the whole masjid */}
      <Dialog open={dialog === 'bulk'} onOpenChange={(open) => setDialog(open ? 'bulk' : null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('duesPage.setFeeTitle')}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('duesPage.setFeeHint')}</p>
          <form onSubmit={applyBulkFee} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>{t('dues.amount')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>{t('dues.frequency')}</Label>
                <Select
                  value={feeFrequency}
                  onChange={(e) => setFeeFrequency(e.target.value as '' | FeeFrequency)}
                >
                  <option value="MONTHLY">{t('dues.monthly')}</option>
                  <option value="YEARLY">{t('dues.yearly')}</option>
                </Select>
              </div>
              <div>
                <Label>{t('dues.startsOn')}</Label>
                <Input
                  type="date"
                  value={feeStartOn}
                  onChange={(e) => setFeeStartOn(e.target.value)}
                  required
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyWithoutFee}
                onChange={(e) => setOnlyWithoutFee(e.target.checked)}
              />
              {t('duesPage.onlyWithoutFee')}
            </label>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? t('duesPage.applying') : t('duesPage.apply')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* One household's fee */}
      <Dialog open={dialog === 'fee'} onOpenChange={(open) => setDialog(open ? 'fee' : null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('duesPage.editFeeFor', { name: target?.familyName ?? '' })}</DialogTitle>
          <form onSubmit={saveFee} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>{t('dues.amount')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('dues.frequency')}</Label>
                <Select
                  value={feeFrequency}
                  onChange={(e) => setFeeFrequency(e.target.value as '' | FeeFrequency)}
                >
                  <option value="">{t('dues.noFee')}</option>
                  <option value="MONTHLY">{t('dues.monthly')}</option>
                  <option value="YEARLY">{t('dues.yearly')}</option>
                </Select>
              </div>
              <div>
                <Label>{t('dues.startsOn')}</Label>
                <Input
                  type="date"
                  value={feeStartOn}
                  onChange={(e) => setFeeStartOn(e.target.value)}
                />
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? t('common.saving') : t('dues.saveFee')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record a payment */}
      <Dialog open={dialog === 'payment'} onOpenChange={(open) => setDialog(open ? 'payment' : null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('duesPage.recordFor', { name: target?.familyName ?? '' })}</DialogTitle>
          <form onSubmit={addPayment} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>{t('dues.amount')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>{t('dues.startsOn')}</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>{t('dues.method')}</Label>
                <Input
                  list="dues-methods"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                />
                <datalist id="dues-methods">
                  {['Cash', 'Bank transfer', 'Cheque', 'Card'].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" variant="gold" disabled={busy}>
              {busy ? t('common.saving') : t('dues.record')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
