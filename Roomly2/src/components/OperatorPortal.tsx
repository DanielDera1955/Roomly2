import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Package, Phone, Camera, Loader2, X } from 'lucide-react';
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
  subscribeSideRequests,
  mySide,
  gateCanAskAgain,
  moveOrderToNextDay,
  addPackagePhoto,
} from '../api.js';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';
import { ProviderSettlement, PayAccountForm } from './SettlementPanel';
import { OperatorProductsPanel, TodaysMenuPanel } from './StoreProducts';
import { ProductRequestsPanel } from './ProductRequestsPanel';
import { MyRatingsPanel } from './FeedbackPanels';
import { OperatorGuide } from './OperatorGuide';
import { OrderRecord, partLabel, shortLocation } from '../types';
import { OUT_OF_STOCK_LABEL, RUNNER_SHARE, dayWord, longDayLabel } from '../config';
import { playChime } from '../sound';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle } from './ThemeToggle';

type Kind = 'store' | 'food';

type Range = 'today' | 'week' | 'month' | 'year' | 'custom';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

/** week = last 7 days, month = last 30 days, year = this year (both ends included) */
function rangeDates(r: Range): [string, string] {
  const now = new Date();
  const start = new Date(now);
  if (r === 'week') start.setDate(now.getDate() - 6);
  if (r === 'month') start.setDate(now.getDate() - 29);
  if (r === 'year') start.setMonth(0, 1);
  return [ymd(start), ymd(now)];
}

function addUp(days: any[]) {
  const n = (v: any) => Number(v) || 0;
  return days.reduce(
    (t, d) => ({
      orders: t.orders + n(d.orders),
      paid: t.paid + n(d.itemsPaid),
      earnings: t.earnings + n(d.keep),
      sales: t.sales + n(d.paid),
      owed: t.owed + n(d.due),
      delivery: t.delivery + n(d.deliveryKeep),
      deliveryFees: t.deliveryFees + n(d.deliveryFees),
      itemsCost: t.itemsCost + n(d.itemsCost),
      profit: t.profit + n(d.profit),
      gateKeep: t.gateKeep + n(d.gateFees) - n(d.gateOwed),
      gatePickups: t.gatePickups + n(d.gatePickups),
      helpShare: t.helpShare + n(d.helpShare),
      estimated: t.estimated || Boolean(d.estimated),
    }),
    { orders: 0, paid: 0, earnings: 0, sales: 0, owed: 0, delivery: 0, deliveryFees: 0, itemsCost: 0, profit: 0, gateKeep: 0, gatePickups: 0, helpShare: 0, estimated: false }
  );
}

const Tile: React.FC<{ label: string; value: string | number; sub: string; tone?: 'plain' | 'green' | 'amber' }> = ({ label, value, sub, tone = 'plain' }) => (
  <div
    className={`rounded-2xl p-2.5 ${
      tone === 'green' ? 'bg-emerald-50 dark:bg-emerald-950/30' : tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-800/60'
    }`}
  >
    <span
      className={`block text-[10px] font-bold uppercase ${
        tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'
      }`}
    >
      {label}
    </span>
    <span
      className={`block text-base font-extrabold ${tone === 'green' ? 'text-[#0e9f55]' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : ''}`}
    >
      {value}
    </span>
    <span className="block text-[10px] text-slate-400">{sub}</span>
  </div>
);

/**
 * Live overview for runners and operators: Today, last 7 days, last 30 days, this year or picked dates.
 * Built from the same daily records as settlement, so the numbers always match it.
 */
export const ProviderOverview: React.FC<{ kind: 'runner' | 'operator' }> = ({ kind }) => {
  const [range, setRange] = useState<Range>('today');
  const [today, setToday] = useState<any | null>(null);
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const week = rangeDates('week');
  const [from, setFrom] = useState(week[0]);
  const [to, setTo] = useState(week[1]);
  const [shown, setShown] = useState<[string, string]>(week);

  useEffect(() => subscribeMyTodaySummary(setToday), []);

  const load = async (r: Range, f?: string, t?: string) => {
    if (r === 'today') return;
    const [a, b] = r === 'custom' ? [f || from, t || to] : rangeDates(r);
    const span: [string, string] = a <= b ? [a, b] : [b, a];
    setShown(span);
    setLoading(true);
    setDays(await getMySummaries(span[0], span[1]));
    setLoading(false);
  };

  useEffect(() => {
    if (range !== 'custom') load(range);
  }, [range]);

  // Keep the longer ranges in step with today's live numbers
  const todayKey = ymd(new Date());
  const list = range === 'today' ? (today ? [today] : []) : days.filter((d) => d.date !== todayKey).concat(today ? [today] : []);
  const inRange = range === 'today' ? list : list.filter((d) => d.date >= shown[0] && d.date <= shown[1]);
  const t = addUp(inRange);
  const share = t.earnings - t.itemsCost - t.gateKeep - t.helpShare; // their 30%, after helper splits and late express refunds
  const tabs: [Range, string][] = [
    ['today', 'Today'],
    ['week', '7 days'],
    ['month', '30 days'],
    ['year', 'This year'],
    ['custom', 'Pick dates'],
  ];
  const when = range === 'today' ? 'today' : 'in this period';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Overview</p>
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

      {kind === 'runner' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Deliveries" value={t.orders} sub="completed" />
            <Tile label="Collected" value={naira(t.paid + t.deliveryFees)} sub={`items ${naira(t.paid)} + delivery ${naira(t.deliveryFees)}`} />
            <Tile label="Item cost" value={naira(t.itemsCost)} sub="what you spent buying items" />
            <Tile label="Profit" value={naira(t.profit)} sub="item margin + delivery fees" />
            <Tile label={`Your ${Math.round(RUNNER_SHARE * 100)}% share`} value={naira(share)} sub="of the profit, after helper splits" tone="green" />
            <Tile label="Owed to Roomly" value={naira(t.owed)} sub="settle by 6am the next day" tone="amber" />
          </div>
          {(t.gatePickups > 0 || t.helpShare > 0) && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              On top of your share {when}:{t.gatePickups > 0 ? ` ${naira(t.gateKeep)} from ${t.gatePickups} gate pickup(s)` : ''}
              {t.gatePickups > 0 && t.helpShare > 0 ? ',' : ''}
              {t.helpShare > 0 ? ` ${naira(t.helpShare)} for helping other runners` : ''}.
            </p>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {loading ? 'Loading…' : 'Counted when you mark an order delivered. The order by order breakdown is in "Money: today and settlement".'}
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Completed" value={t.orders} sub="orders" />
            <Tile label="Total sales" value={naira(t.sales)} sub="items + delivery" tone="green" />
            <Tile label={range === 'today' ? 'Owed today' : 'Owed'} value={naira(t.owed)} sub="to Roomly" tone="amber" />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {loading
              ? 'Loading…'
              : `Total sales is everything students paid on your completed carts (items ${naira(t.paid)} plus delivery). You keep ${naira(t.earnings)}. Counted when you tap "Order delivered".`}
          </p>
        </>
      )}
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
  const hasAccount = Boolean(staff?.payAccount?.accountNumber);
  // Requests still waiting for a price: they move up to the top section
  const [openRequests, setOpenRequests] = useState(0);
  useEffect(() => {
    if (isAdmin) return;
    return subscribeSideRequests(mySide(), (list: any[]) => setOpenRequests((list || []).filter((r) => r.status === 'open').length));
  }, [isAdmin]);
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
  // Open orders: soonest delivery day first (today's, then tomorrow's...)
  const shown = orders
    .filter((o) => stageOf(o) === filter)
    .sort((a, b) => (filter === 'completed' ? 0 : String(a.deliveryDate || '').localeCompare(String(b.deliveryDate || ''))));
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

  // Can't make it today: the order goes to this operator's next day that is ON, and the student is told
  const moveOn = async (o: OrderRecord) => {
    if (!window.confirm(`Move ${o.name}'s order to your next available day? The student sees the new day right away. Same price, no extra fee.`)) return;
    setBusy(o.id);
    try {
      const to = await moveOrderToNextDay(o.id);
      if (!to) window.alert('Could not move this order. It may already be delivered.');
    } catch (e) {
      window.alert('Could not move this order. Check your connection and try again.');
    }
    setBusy('');
  };
  // Which day an order is for, e.g. "For today: at the gate before 6pm" / "For tomorrow, Thursday 29 Oct"
  const dayOf = (o: OrderRecord) => {
    if (!o.deliveryDate) return o.deliveryTime;
    const w = dayWord(o.deliveryDate);
    return w === 'today' ? 'For today: at the gate before 6pm' : `For ${w.replace(/^on /, '')}, ${longDayLabel(o.deliveryDate)}`;
  };
  const isFuture = (o: OrderRecord) => Boolean(o.deliveryDate) && Date.parse(o.deliveryDate + 'T00:00:00') > Date.now();

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

        {/* How it works: open until they tap "Got it", then a small bar */}
        {!isAdmin && <OperatorGuide kind={kind} />}

        {/* TOP, always first: the overview */}
        {!isAdmin && <ProviderOverview kind="operator" />}

        {/* Settlement comes up here when they are done for the day with money to send, or a past day is open */}
        {!isAdmin && <ProviderSettlement kind="operator" placement="top" />}

        {/* Payment account first, until it is saved; then it moves to the bottom */}
        {!isAdmin && !hasAccount && <PayAccountForm />}

        {/* Availability: operators set their own batches; the admin sees everyone and can switch them off */}
        {isAdmin ? <OperatorOverridePanel kind={kind} /> : <BatchSwitches side={kind} />}

        {/* A request waiting for a price blocks the student's cart, so it comes up here */}
        {!isAdmin && openRequests > 0 && <ProductRequestsPanel />}

        {/* Orders: the part an operator touches most */}
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 px-1">Orders</p>
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
                  <p className={`text-xs ${isFuture(o) ? 'font-bold text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {dayOf(o)}
                    {o.movedAt ? ' (moved)' : ''}
                  </p>
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
                      {o.gatePickup && !gateCanAskAgain(o.gatePickup)
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
                  <>
                  <PackagePhoto o={o} canEdit={!isAdmin && st !== 'sent'} />
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
                  </>
                  )}
                  {st !== 'sent' && !isAdmin && (
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => moveOn(o)}
                      className="w-full py-2.5 rounded-xl border border-blue-300 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 disabled:opacity-40 cursor-pointer"
                    >
                      Move to next available day
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

        {/* BELOW ORDERS: less frequent */}
        {!isAdmin && openRequests === 0 && <ProductRequestsPanel />}
        {!isAdmin && <ProviderSettlement kind="operator" placement="bottom" />}
        {!isAdmin && <TodaysMenuPanel side={getCurrentStaff()?.role === 'food' ? 'food' : 'store'} />}
        {!isAdmin && <OperatorProductsPanel />}
        {!isAdmin && <MyRatingsPanel />}
        {!isAdmin && hasAccount && <PayAccountForm />}
      </div>
    </div>
  );
};

/**
 * Photo of the packed order: the operator takes or picks one, the student sees it large on their order
 * (so they know what to collect at the gate, no WhatsApp needed). Can be replaced until the order is delivered.
 */
const PackagePhoto: React.FC<{ o: OrderRecord; canEdit: boolean }> = ({ o, canEdit }) => {
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  const url = o.packPhoto;
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      await addPackagePhoto(o.id, f);
    } catch (e: any) {
      window.alert(e?.message || 'Could not add the photo. Check your connection and try again.');
    }
    setBusy(false);
  };
  if (!url && !canEdit) return null;
  return (
    <div className="space-y-1.5">
      {url && (
        <button type="button" onClick={() => setBig(true)} className="block w-full cursor-pointer">
          <img src={url} alt="Package" className="w-full max-h-64 object-cover rounded-2xl border border-slate-200 dark:border-slate-700" />
        </button>
      )}
      {canEdit && (
        <label
          className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
            url ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300' : 'bg-blue-600 text-white'
          } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          <span>{busy ? 'Uploading photo...' : url ? 'Replace package photo' : 'Add photo of package'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] || undefined)} />
        </label>
      )}
      {canEdit && !url && <p className="text-[11px] text-slate-500 text-center">The student sees this photo, so they know exactly what to collect at the gate.</p>}
      {big && url && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3" onClick={() => setBig(false)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <img src={url} alt="Package" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
};
