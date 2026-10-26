import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Package, Phone } from 'lucide-react';
import {
  subscribeOperatorOrders,
  updatePartStatus,
  operatorConfirmPayment,
  getCurrentStaff,
  logoutStaff,
  ensureOperatorStatus,
  subscribeMyTodaySummary,
  getMySummaries,
  getMyUid,
  getOperatorOrderMaths,
} from '../api.js';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';
import { ProviderSettlement, PayAccountForm } from './SettlementPanel';
import { OperatorProductsPanel } from './StoreProducts';
import { ProductRequestsPanel } from './ProductRequestsPanel';
import { MyRatingsPanel } from './FeedbackPanels';
import { OrderRecord, partLabel, shortLocation } from '../types';
import { OUT_OF_STOCK_LABEL } from '../config';
import { playChime } from '../sound';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle } from './ThemeToggle';

type Kind = 'store' | 'food';

type Range = 'today' | 'week' | 'month' | 'year' | 'custom';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

function rangeDates(r: Range): [string, string] {
  const now = new Date();
  const start = new Date(now);
  if (r === 'week') start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // from Monday
  if (r === 'month') start.setDate(1);
  if (r === 'year') start.setMonth(0, 1);
  return [ymd(start), ymd(now)];
}

function addUp(days: any[]) {
  return days.reduce(
    (t, d) => ({
      orders: t.orders + (d.orders || 0),
      paid: t.paid + (d.itemsPaid || 0),
      earnings: t.earnings + (d.keep || 0),
      sales: t.sales + (d.paid || 0),
      owed: t.owed + (d.due || 0),
      delivery: t.delivery + (d.deliveryKeep || 0),
      estimated: t.estimated || Boolean(d.estimated),
    }),
    { orders: 0, paid: 0, earnings: 0, sales: 0, owed: 0, delivery: 0, estimated: false }
  );
}

/** Live overview: completed orders, earnings and amount owed, from small daily summaries */
const OperatorOverview: React.FC = () => {
  const [range, setRange] = useState<Range>('today');
  const [today, setToday] = useState<any | null>(null);
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const week = rangeDates('week');
  const [from, setFrom] = useState(week[0]);
  const [to, setTo] = useState(week[1]);

  useEffect(() => subscribeMyTodaySummary(setToday), []);

  const load = async (r: Range, f?: string, t?: string) => {
    if (r === 'today') return;
    const [a, b] = r === 'custom' ? [f || from, t || to] : rangeDates(r);
    setLoading(true);
    setDays(await getMySummaries(a <= b ? a : b, a <= b ? b : a));
    setLoading(false);
  };

  useEffect(() => {
    if (range !== 'custom') load(range);
  }, [range]);

  // Keep the longer ranges in step with today's live numbers
  const list = range === 'today' ? (today ? [today] : []) : days.filter((d) => d.date !== ymd(new Date())).concat(today ? [today] : []);
  const inRange = range === 'today' ? list : list.filter((d) => {
    const [a, b] = range === 'custom' ? [from, to] : rangeDates(range);
    return d.date >= (a <= b ? a : b) && d.date <= (a <= b ? b : a);
  });
  const t = addUp(inRange);
  const tabs: [Range, string][] = [
    ['today', 'Today'],
    ['week', 'Week'],
    ['month', 'Month'],
    ['year', 'Year'],
    ['custom', 'Pick dates'],
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setRange(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
              range === k ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          <span className="text-slate-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          <button type="button" onClick={() => load('custom', from, to)} className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold cursor-pointer">
            Show
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Completed</span>
          <span className="block text-lg font-extrabold">{t.orders}</span>
          <span className="block text-[10px] text-slate-400">orders</span>
        </div>
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Total Sales</span>
          <span className="block text-base font-extrabold text-[#0e9f55]">{naira(t.sales)}</span>
          <span className="block text-[10px] text-slate-400">items + delivery</span>
        </div>
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">{range === 'today' ? 'Owed today' : 'Owed'}</span>
          <span className="block text-base font-extrabold text-amber-700 dark:text-amber-300">{naira(t.owed)}</span>
          <span className="block text-[10px] text-slate-400">to Roomly</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        {loading
          ? 'Loading…'
          : `Total Sales is everything students paid on your completed carts (items ${naira(t.paid)} plus delivery). You keep ${naira(t.earnings)}. Counted when you tap "Order delivered".`}
      </p>
      {t.estimated && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Some amounts are estimated because an item has no cost price yet. Ask the admin to add it.
        </p>
      )}
    </div>
  );
};

interface OperatorPortalProps {
  onBack: () => void;
}

/** Store and food operators: they only see PAID orders, and only their own items. */
export const OperatorPortal: React.FC<OperatorPortalProps> = ({ onBack }) => {
  const staff = getCurrentStaff();
  const isAdmin = staff?.role === 'admin';
  const [kind, setKind] = useState<Kind>(staff?.role === 'food' ? 'food' : 'store');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Stages: All (student says paid, check your account) -> Packaging (payment confirmed) -> Delivered (sent to the gate)
  const [filter, setFilter] = useState<'active' | 'confirmed' | 'completed'>('active');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const seen = useRef<Set<string> | null>(null);
  // Cost price and settlement maths for each opened order (same numbers as the daily settlement)
  const [maths, setMaths] = useState<Record<string, any>>({});
  useEffect(() => {
    orders
      .filter((o) => open[o.id] && !maths[o.id])
      .forEach((o) =>
        getOperatorOrderMaths(o, kind)
          .then((m: any) => setMaths((p) => ({ ...p, [o.id]: m })))
          .catch(() => {})
      );
  }, [open, orders, kind]);

  // Make sure the admin can see this operator in the override list
  useEffect(() => {
    if (!isAdmin) ensureOperatorStatus();
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    seen.current = null;
    return subscribeOperatorOrders(kind, (list: OrderRecord[]) => {
      const ids = new Set(list.map((o) => o.id));
      if (seen.current && list.some((o) => !seen.current!.has(o.id))) playChime('order');
      seen.current = ids;
      // Each order goes to the operator the student chose; older orders without one show to everyone
      const me = getMyUid();
      setOrders(isAdmin ? list : list.filter((o) => !o.operatorId || o.operatorId === me));
      setLoading(false);
    });
  }, [kind]);

  const mine = (o: OrderRecord) => (o.items || []).filter((i) => (kind === 'food' ? i.source === 'food' : i.source === 'outside'));
  const statusOf = (o: OrderRecord) => (kind === 'food' ? o.foodStatus : o.storeStatus) || 'pending';
  const stageOf = (o: OrderRecord) =>
    statusOf(o) === 'sent' ? 'completed' : o.paymentStatus === 'payment_confirmed' ? 'confirmed' : 'active';
  const count = (s: string) => orders.filter((o) => stageOf(o) === s).length;
  const shown = orders.filter((o) => stageOf(o) === filter);
  const confirmPaid = async (o: OrderRecord) => {
    const msg = `Confirm that ₦${(o.totalAmount || 0).toLocaleString()} from ${o.name} reached your account?\n\nItems ₦${(o.subtotal || 0).toLocaleString()} + delivery ₦${(o.deliveryFee || 0).toLocaleString()}.\n\nThe student will see "Confirmed & Packaging".`;
    if (!window.confirm(msg)) return;
    setBusy(o.id);
    const res = await operatorConfirmPayment(o.id);
    if (!res) window.alert('Could not confirm. Check your connection and try again.');
    setBusy('');
  };

  const setStatus = async (o: OrderRecord, status: 'packed' | 'sent') => {
    setBusy(o.id);
    await updatePartStatus(o.id, kind, status, staff?.name || 'Operator');
    setBusy('');
  };

  const pill = (s: string) =>
    s === 'sent'
      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
      : s === 'packed'
      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';

  const tabs: [typeof filter, string][] = [
    ['active', `All (${count('active')})`],
    ['confirmed', `Packaging (${count('confirmed')})`],
    ['completed', `Delivered (${count('completed')})`],
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0e9f55]">Welcome back, {staff?.name || 'Operator'}</p>
            <h1 className="text-lg font-extrabold leading-tight">{kind === 'food' ? 'Food orders' : 'Store orders'}</h1>
            <p className="text-xs text-slate-500">Paid orders only</p>
          </div>
          <div className="flex items-center gap-1">
            <SoundToggle className="hover:bg-slate-100 dark:hover:bg-slate-800" />
            <ThemeToggle className="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" />
            {isAdmin ? (
              <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 px-2 py-1.5 cursor-pointer">
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => logoutStaff()}
                className="text-xs font-bold text-slate-500 hover:text-rose-500 px-2 py-1.5 cursor-pointer whitespace-nowrap"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(['store', 'food'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  kind === k ? 'bg-white dark:bg-slate-900 shadow-xs text-[#0e9f55]' : 'text-slate-500'
                }`}
              >
                {k === 'store' ? 'Store view' : 'Food view'}
              </button>
            ))}
          </div>
        )}

        {/* Live overview, settlement and payment account (operators only) */}
        {!isAdmin && <OperatorOverview />}
        {!isAdmin && <ProviderSettlement kind="operator" />}
        {!isAdmin && <PayAccountForm />}
        {!isAdmin && <ProductRequestsPanel />}
        {!isAdmin && <MyRatingsPanel />}
        {!isAdmin && <OperatorProductsPanel />}

        {/* Availability: operators set their own batches; the admin sees everyone and can switch them off */}
        {isAdmin ? <OperatorOverridePanel kind={kind} /> : <BatchSwitches side={kind} />}

        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                filter === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-xs text-center text-slate-400 py-6">Loading orders…</p>}
        {!loading && shown.length === 0 && (
          <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            <Package className="w-7 h-7 mx-auto mb-2 opacity-40" />
            Nothing here. Orders appear once the student has paid.
          </div>
        )}

        {shown.map((o) => {
          const items = mine(o);
          const total = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
          const st = statusOf(o);
          const isOpen = !!open[o.id];
          return (
            <div key={o.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [o.id]: !p[o.id] }))}
                className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-extrabold text-base">{o.name}</span>
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${pill(st)}`}>
                      {st === 'sent' ? 'Delivered' : o.paymentStatus !== 'payment_confirmed' ? 'Check payment' : 'Packaging'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{o.deliveryTime}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className="text-right">
                    <span className="block font-extrabold text-base text-[#0e9f55] whitespace-nowrap">₦{(o.totalAmount || total).toLocaleString()}</span>
                    <span className="block text-[10px] text-slate-400">customer paid</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="space-y-3">
                  {kind === 'food' ? (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs space-y-1">
                      <p className="font-bold text-amber-900 dark:text-amber-200">
                        Write the student's first name and last 4 digits on the bag, so the owner is clear
                      </p>
                      <p className="text-base font-extrabold">
                        {String(o.name || '').trim().split(/\s+/)[0]} · {String(o.phone || '').slice(-4)}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                      <p className="font-bold">Write this on the package</p>
                      <p className="text-sm font-extrabold">
                        {o.name} · {o.phone}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                    {isAdmin && o.operatorName && <p>Operator: <strong>{o.operatorName}</strong></p>}
                    <p>
                      If out of stock: <strong>{OUT_OF_STOCK_LABEL[o.outOfStock || 'refund']}</strong>
                    </p>
                    <p>
                      {o.gatePickup && o.gatePickup.status !== 'refused' && o.gatePickup.status !== 'refunded'
                        ? `An inside runner will collect it at the gate for ${shortLocation(o)}.`
                        : 'The student collects it at the school gate.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {items.map((i, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center text-xl shrink-0">
                          {i.imageUrl && !i.imageUrl.startsWith('data:image/svg') ? (
                            <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{i.emoji}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight">{i.name}</p>
                          <p className="text-xs text-slate-500">
                            {i.quantity} × ₦{(i.unitPrice || 0).toLocaleString()} customer price
                          </p>
                          {maths[o.id]?.lines?.[idx] && (
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Your cost: ₦{Math.round(maths[o.id].lines[idx].cost).toLocaleString()}
                              {maths[o.id].lines[idx].estimated ? ' (estimated)' : ''}
                            </p>
                          )}
                        </div>
                        <span className="text-right whitespace-nowrap">
                          <span className="block text-sm font-bold">₦{(i.totalPrice || 0).toLocaleString()}</span>
                          <span className="block text-[10px] text-slate-400">customer paid</span>
                        </span>
                      </div>
                    ))}
                    {/* The money on this order: what the customer paid, what you keep, what you owe Roomly */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Customer paid (items ₦{total.toLocaleString()} + delivery ₦{(o.deliveryFee || 0).toLocaleString()})</span>
                        <span className="font-bold">₦{(o.totalAmount || 0).toLocaleString()}</span>
                      </div>
                      {maths[o.id] ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">
                              You keep: your cost ₦{Math.round(maths[o.id].itemsCost).toLocaleString()} + ₦{maths[o.id].deliveryKeep.toLocaleString()} delivery
                            </span>
                            <span className="font-bold">₦{Math.round(maths[o.id].keep).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 text-sm">
                            <span className="font-extrabold">Owed to Roomly</span>
                            <span className="font-extrabold text-amber-700 dark:text-amber-300">₦{Math.round(maths[o.id].owed).toLocaleString()}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Roomly's margin on the items ₦{Math.round(maths[o.id].owed - maths[o.id].deliveryOwe).toLocaleString()} + ₦{maths[o.id].deliveryOwe.toLocaleString()} of the delivery fee. You pay this in your daily settlement.
                            {maths[o.id].estimated ? ' Some costs are estimated because a cost price is missing.' : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400">Working out your cost and what you owe…</p>
                      )}
                    </div>
                  </div>

                  {o.paymentStatus !== 'payment_confirmed' && st !== 'sent' ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-slate-500">
                        The student says they paid ₦{(o.totalAmount || 0).toLocaleString()} (items + delivery) into your account. Check it, then confirm. The student sees "Confirmed & Packaging".
                      </p>
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => confirmPaid(o)}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-white disabled:opacity-40 cursor-pointer"
                      >
                        Confirm payment (₦{(o.totalAmount || 0).toLocaleString()} received)
                      </button>
                    </div>
                  ) : (
                  <button
                    type="button"
                    disabled={busy === o.id || st === 'sent'}
                    onClick={() => {
                      if (window.confirm(`Mark ${o.name}'s order as delivered? The student sees it will be at the school gate in under 15 minutes, so only tap this as it leaves.`)) setStatus(o, 'sent');
                    }}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-[#0e9f55] text-white disabled:opacity-40 cursor-pointer"
                  >
                    {st === 'sent' ? 'Delivered' : 'Order delivered'}
                  </button>
                  )}
                  <a
                    href={`tel:${o.phone}`}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call {o.name}</span>
                  </a>
                  <p className="text-[11px] text-slate-400 text-center">Status now: {st === 'sent' ? 'Delivered (the student sees the 15-minute countdown)' : o.paymentStatus === 'payment_confirmed' ? 'Confirmed & Packaging' : 'Waiting for you to confirm payment'}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
