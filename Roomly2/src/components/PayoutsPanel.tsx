import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check } from 'lucide-react';
import { subscribeOrders, getRunners, payeeOf, payoutPending, roomlyPayoutOf, markPayoutPaid, isRoomlyOrder } from '../api.js';
import { OrderRecord } from '../types';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const dayText = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/**
 * Admin: who Roomly owes for delivered orders it collected (runners: item cost + ₦500; stores: item cost + ₦500 transport).
 * Amounts can be corrected before paying (an out-of-stock item the runner didn't buy, say).
 */
export const PayoutsPanel: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [runners, setRunners] = useState<any[]>([]);
  const [calc, setCalc] = useState<Record<string, any>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => subscribeOrders((l: OrderRecord[]) => setOrders(l || [])), []);
  useEffect(() => {
    getRunners().then((r: any[]) => setRunners(r || []));
  }, []);

  const pending = useMemo(() => orders.filter((o) => payoutPending(o) && payeeOf(o)), [orders]);
  const paidToday = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o: any) => isRoomlyOrder(o) && o.payout?.paidAt && new Date(o.payout.paidAt).toDateString() === today);
  }, [orders]);

  // Work out each order's amount once (it reads the product costs)
  useEffect(() => {
    let live = true;
    pending
      .filter((o) => !calc[o.id])
      .forEach((o) =>
        roomlyPayoutOf(o)
          .then((r: any) => live && setCalc((c) => ({ ...c, [o.id]: r })))
          .catch(() => {})
      );
    return () => {
      live = false;
    };
  }, [pending.map((o) => o.id).join('|')]);

  const groups = useMemo(() => {
    const m = new Map<string, { payee: any; orders: OrderRecord[] }>();
    pending.forEach((o) => {
      const p: any = payeeOf(o);
      const g = m.get(p.key) || { payee: p, orders: [] };
      g.orders.push(o);
      m.set(p.key, g);
    });
    return Array.from(m.values());
  }, [pending]);

  const amountOf = (o: OrderRecord) => {
    const v = edit[o.id];
    if (v !== undefined && v !== '') return Math.max(0, Math.round(Number(v) || 0));
    return calc[o.id] ? calc[o.id].amount : 0;
  };
  const accountOf = (p: any) => {
    if (p.kind === 'runner') {
      const r = runners.find((x) => x.id === p.uid);
      return (r && r.payAccount) || null;
    }
    return p.payTo || null;
  };

  const pay = async (g: { payee: any; orders: OrderRecord[] }) => {
    const ready = g.orders.every((o) => calc[o.id] || edit[o.id]);
    if (!ready) return;
    const total = g.orders.reduce((t, o) => t + amountOf(o), 0);
    if (!window.confirm(`Mark ${naira(total)} as paid to ${g.payee.name}?\n\nOnly tap OK after you've sent the money.`)) return;
    setBusy(g.payee.key);
    try {
      await markPayoutPaid(g.orders.map((o) => ({ orderId: o.id, amount: amountOf(o) })));
    } catch (e) {
      window.alert('Could not save. Check your connection and try again.');
    } finally {
      setBusy('');
    }
  };

  const copy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const totalDue = pending.reduce((t, o) => t + amountOf(o), 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
          <Wallet className="w-4 h-4 text-[#0e9f55]" />
          <span>Payouts</span>
        </div>
        <span className="text-xs font-bold text-slate-500">{pending.length ? `${naira(totalDue)} due` : 'Nothing due'}</span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        Delivered orders Roomly collected for. Runners get item cost + ₦500 delivery, stores get item cost + ₦500 transport. Correct an amount if
        something wasn't bought, send the money, then tap Mark paid.
      </p>

      {groups.map((g) => {
        const acct = accountOf(g.payee);
        const total = g.orders.reduce((t, o) => t + amountOf(o), 0);
        const ready = g.orders.every((o) => calc[o.id] || edit[o.id]);
        return (
          <div key={g.payee.key} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white">
                  {g.payee.name} <span className="font-normal text-slate-500">({g.payee.kind === 'runner' ? 'runner' : g.payee.kind === 'food' ? 'food' : 'store'})</span>
                </p>
                {acct ? (
                  <button
                    type="button"
                    onClick={() => copy(acct.accountNumber, g.payee.key)}
                    className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    {acct.bankName} {acct.accountNumber} · {acct.accountName}
                    {copied === g.payee.key ? <Check className="w-3 h-3 text-[#0e9f55]" /> : <Copy className="w-3 h-3" />}
                  </button>
                ) : (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">No account saved. Ask them for it{g.payee.phone ? ` (${g.payee.phone})` : ''}.</p>
                )}
              </div>
              <p className="font-extrabold text-[#0e9f55] shrink-0">{naira(total)}</p>
            </div>
            {g.orders.map((o: any) => {
              const c = calc[o.id];
              const refunded = (o.refunds || []).reduce((t: number, r: any) => t + (r.amount || 0), 0);
              return (
                <div key={o.id} className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 pt-1.5">
                  <div className="min-w-0">
                    <p className="truncate">
                      {o.name} <span className="font-mono text-slate-400">{o.id}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {dayText(o.deliveredAt)}
                      {c ? ` · items ${naira(c.items)}${c.estimated ? ' (est.)' : ''} + ${naira(c.delivery)}` : ' · working out...'}
                    </p>
                    {refunded > 0 && <p className="text-[11px] text-rose-600">Refunded {naira(refunded)} to the student: check the amount</p>}
                  </div>
                  <input
                    value={edit[o.id] ?? (c ? String(c.amount) : '')}
                    onChange={(e) => setEdit({ ...edit, [o.id]: e.target.value.replace(/[^\d]/g, '') })}
                    inputMode="numeric"
                    className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-mono"
                  />
                </div>
              );
            })}
            <button
              type="button"
              disabled={!ready || busy === g.payee.key}
              onClick={() => pay(g)}
              className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-50"
            >
              {busy === g.payee.key ? 'Saving...' : `Mark ${naira(total)} paid to ${g.payee.name}`}
            </button>
          </div>
        );
      })}

      {paidToday.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Paid out today: {naira(paidToday.reduce((t: number, o: any) => t + (o.payout?.amount || 0), 0))} on {paidToday.length}{' '}
          {paidToday.length === 1 ? 'order' : 'orders'}.
        </p>
      )}
    </div>
  );
};
