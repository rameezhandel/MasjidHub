'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, ErrorText, Input, Label, Select } from '@/components/ui';
import { api } from '@/lib/api';
import type { DuesSummary, FeeFrequency } from '@/lib/types';

const money = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(parseFloat(v) * 100);
const todayStr = () => new Date().toISOString().slice(0, 10);

export function HouseholdDues({ masjidId, householdId }: { masjidId: string; householdId: string }) {
  const [dues, setDues] = useState<DuesSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Fee (price) form.
  const [feeAmount, setFeeAmount] = useState('');
  const [feeFrequency, setFeeFrequency] = useState<'' | FeeFrequency>('');
  const [feeStartOn, setFeeStartOn] = useState('');
  const [feeNotice, setFeeNotice] = useState('');

  // Record-payment form.
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState('');
  const [payPeriod, setPayPeriod] = useState('');

  const load = useCallback(async () => {
    const data = await api<DuesSummary>(`/masjids/${masjidId}/households/${householdId}/dues`);
    setDues(data);
    setFeeAmount(data.feeAmountCents != null ? money(data.feeAmountCents) : '');
    setFeeFrequency(data.feeFrequency ?? '');
    setFeeStartOn(data.feeStartOn ?? '');
  }, [masjidId, householdId]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dues'));
  }, [load]);

  const saveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFeeNotice('');
    try {
      const clearing = feeAmount.trim() === '' || feeFrequency === '';
      await api(`/masjids/${masjidId}/households/${householdId}`, {
        method: 'PATCH',
        body: clearing
          ? { feeAmountCents: 0, feeFrequency: null, feeStartOn: null }
          : {
              feeAmountCents: toCents(feeAmount),
              feeFrequency,
              feeStartOn: feeStartOn || todayStr(),
            },
      });
      setFeeNotice('Fee saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the fee');
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/masjids/${masjidId}/households/${householdId}/payments`, {
        method: 'POST',
        body: {
          amountCents: toCents(payAmount),
          paidOn: payDate,
          ...(payMethod ? { method: payMethod } : {}),
          ...(payPeriod ? { periodLabel: payPeriod } : {}),
        },
      });
      setPayAmount('');
      setPayMethod('');
      setPayPeriod('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment');
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (paymentId: string) => {
    setError('');
    try {
      await api(`/masjids/${masjidId}/households/${householdId}/payments/${paymentId}`, {
        method: 'DELETE',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the payment');
    }
  };

  if (!dues) return <Card title="Dues">{error ? <ErrorText>{error}</ErrorText> : <Empty>Loading…</Empty>}</Card>;

  const balance = dues.balanceCents;
  const balanceLabel =
    balance > 0 ? `${money(balance)} owing` : balance < 0 ? `${money(-balance)} in credit` : 'Paid up';
  const balanceTone =
    balance > 0 ? 'text-destructive' : balance < 0 ? 'text-primary' : 'text-muted-foreground';

  return (
    <Card title="Dues">
      <div className="space-y-5">
        {/* Balance summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Owed to date', money(dues.expectedCents)],
            ['Paid', money(dues.paidCents)],
            ['Balance', balanceLabel],
          ].map(([label, value], i) => (
            <div key={label} className="rounded-xl border border-border bg-muted/40 p-3">
              <p className={`text-lg font-bold ${i === 2 ? balanceTone : ''}`}>{value}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Set the fee (price) */}
        <form onSubmit={saveFee} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Fee for this household</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 50.00"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select
                value={feeFrequency}
                onChange={(e) => setFeeFrequency(e.target.value as '' | FeeFrequency)}
              >
                <option value="">No fee</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </Select>
            </div>
            <div>
              <Label>Starts on</Label>
              <Input
                type="date"
                value={feeStartOn}
                onChange={(e) => setFeeStartOn(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" disabled={busy}>
              Save fee
            </Button>
            {feeNotice && <span className="text-sm text-primary">{feeNotice}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Balance owed is the fee times the number of {feeFrequency === 'YEARLY' ? 'years' : 'periods'}{' '}
            since the start date, minus what&apos;s been paid.
          </p>
        </form>

        {/* Payment history */}
        <div>
          <p className="mb-2 text-sm font-medium">Payment history</p>
          {dues.payments.length === 0 ? (
            <Empty>No payments recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {dues.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{money(p.amountCents)}</span>{' '}
                    <span className="text-muted-foreground">
                      · {p.paidOn}
                      {p.method ? ` · ${p.method}` : ''}
                      {p.periodLabel ? ` · ${p.periodLabel}` : ''}
                    </span>
                  </div>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => removePayment(p.id)}
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Record a payment */}
        <form onSubmit={addPayment} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Amount"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
          <Input
            placeholder="Method"
            list="pay-methods"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
          />
          <Input
            placeholder="Period (e.g. Jan 2026)"
            value={payPeriod}
            onChange={(e) => setPayPeriod(e.target.value)}
          />
          <datalist id="pay-methods">
            {['Cash', 'Bank transfer', 'Cheque', 'Card'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Button type="submit" disabled={busy}>
            Record payment
          </Button>
        </form>

        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}
