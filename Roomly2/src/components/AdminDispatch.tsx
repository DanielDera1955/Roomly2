import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  subscribeOrders,
  orderStage,
  deleteOrder,
  subscribeSettlementsByDate,
  adminConfirmSettlement,
  adminResolveObjection,
  getSettlementsRange,
  isOverdue,
  getRunners,
  getAllOperatorStatus,
} from '../api.js';
import { OrderRecord, locationText } from '../types';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';

type Section = 'inside' | 'store' | 'food';
type Tab = 'active' | 'confirmed' | 'completed' | 'settlement';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';
const SECTION_LABEL: Record<Section, string> = { inside: 'Inside Orders', store: 'Outside Store Orders', food: 'Food Orders' };
const KIND_OF: Record<Section, string> = { inside: 'runner', store: 'store', food: 'food' };

/** Which section an order belongs to (older mixed orders count as inside) */
const sectionOf = (o: OrderRecord): Section =>
  o.cart === 'store' || o.cart === 'food' ? o.cart : o.cart === 'inside' ? 'inside' : o.hasStore && !o.hasFood ? 'store' : o.hasFood && !o.hasStore ? 'food' : 'inside';

const providerOf = (o: OrderRecord) =>
  o.operatorName || o.runnerName || o.turnRunner || (sectionOf(o) === 'inside' ? 'No runner yet' : 'Any operator');

const Pills: React.FC<{ value: string; options: [string, string][]; onChange: (v: any) => void }> = ({ value, options, onChange }) => (
  <div className="flex items-center gap-1.5 overflow-x-auto">
    {options.map(([k, label]) => (
      <button
        key={k}
        type="button"
        onClick={() => onChange(k)}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
          value === k ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

/** One order, tap to open */
const OrderRow: React.FC<{ o: OrderRecord }> = ({ o }) => {
  const [open, setOpen] = useState(false);
  const stage = orderStage(o);
  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">
            {o.name} <span className="font-mono font-normal text-slate-400">{o.id}</span>
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {providerOf(o)} · {o.deliveryTime}
          </p>
          <p className="text-[11px] text-slate-500">
            {stage === 'active'
              ? o.paymentStatus === 'pay_on_delivery'
                ? 'Pay on delivery'
                : 'Student says paid, waiting for confirmation'
              : stage === 'confirmed'
              ? `Payment confirmed${o.paymentConfirmedBy ? ` by ${o.paymentConfirmedBy}` : ''} · ${o.status === 'Received' ? 'not started' : o.status}`
              : stage === 'completed'
              ? `Completed ${o.deliveredAt ? new Date(o.deliveredAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}`
              : o.status}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-extrabold text-[#0e9f55]">{naira(o.totalAmount)}</p>
          <ChevronDown className={`w-4 h-4 text-slate-400 inline transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
          <p className="text-[11px] text-slate-500">{locationText(o)} · {o.phone}</p>
          {(o.items || []).map((i, idx) => (
            <div key={idx} className="flex justify-between gap-2">
              <span className="truncate">
                {i.quantity}x {i.name}
              </span>
              <span className="font-mono shrink-0">{naira(i.totalPrice)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Delivery</span>
            <span>{naira(o.deliveryFee)}</span>
          </div>
          {o.outOfStock && <p className="text-[11px] text-slate-500">If out of stock: {o.outOfStock}</p>}
          {o.gatePickup && (
            <p className="text-[11px] text-slate-500">
              Gate pickup: {o.gatePickup.status}
              {o.gatePickup.runnerName ? ` (${o.gatePickup.runnerName}, ${naira(o.gatePickup.fee)})` : ''}
            </p>
          )}
          {(o as any).helperName && <p className="text-[11px] text-violet-600">Shared with {(o as any).helperName}</p>}
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`Delete order ${o.id}? Only do this for test or mistaken orders.`)) await deleteOrder(o.id);
            }}
            className="flex items-center gap-1 text-[11px] font-bold text-rose-600 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete order
          </button>
        </div>
      )}
    </div>
  );
};

/** Admin settlement for one section and day: carts, maths, objections, money received */
const SettlementView: React.FC<{ section: Section }> = ({ section }) => {
  const [day, setDay] = useState(ymd(new Date()));
  const [records, setRecords] = useState<any[]>([]);
  const [who, setWho] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [fix, setFix] = useState<Record<string, string>>({});
  const [reply, setReply] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  useEffect(() => subscribeSettlementsByDate(day, setRecords), [day]);
  const mine = records.filter((r) => r.kind === KIND_OF[section] && ((r.carts || []).length > 0 || (r.due || 0) > 0));
  const shown = who ? mine.filter((r) => r.uid === who) : mine;

  const run = async (key: string, f: () => Promise<any>) => {
    setBusy(key);
    try {
      await f();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={input} />
        <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
          <option value="">Everyone</option>
          {mine.map((r) => (
            <option key={r.uid} value={r.uid}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 && <p className="text-xs text-slate-400">No completed carts for this day.</p>}
      {shown.map((r) => {
        const objections = r.objections || {};
        const openObj = Object.values(objections).filter((x: any) => x && x.status === 'open').length;
        const status = r.settled ? 'Settled' : openObj ? `Objected (${openObj})` : r.cleared ? 'All cleared' : 'Waiting';
        const overdue = !r.settled && isOverdue([r.date]);
        const unconfirmed = Math.max(0, (r.sentTotal || 0) - (r.confirmed || 0));
        return (
          <div key={r.id} className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
            <button type="button" onClick={() => setOpen((p) => ({ ...p, [r.id]: !p[r.id] }))} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{r.name}</p>
                <p className="text-[11px] text-slate-500">
                  {(r.carts || []).length} cart(s) · {status}
                  {overdue ? ' · OVERDUE' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-extrabold text-amber-700 dark:text-amber-300">{naira(r.due)}</p>
                <p className="text-[10px] text-slate-400">
                  sent {naira(r.sentTotal)} · confirmed {naira(r.confirmed)}
                </p>
              </div>
            </button>

            {open[r.id] && (
              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-slate-500">
                  <span>Customer</span>
                  <span className="text-right">Paid</span>
                  <span className="text-right">Keeps</span>
                  <span className="text-right">Owed</span>
                </div>
                {(r.carts || []).map((c: any) => {
                  const ob = objections[c.orderId];
                  const k = `${r.id}|${c.orderId}`;
                  return (
                    <div key={c.orderId} className="space-y-1">
                      <div className="grid grid-cols-4 gap-1">
                        <span className="truncate">{c.customer || c.orderId}</span>
                        <span className="text-right font-mono">{naira(c.paid)}</span>
                        <span className="text-right font-mono">{naira(c.keep)}</span>
                        <span className="text-right font-mono font-bold">{naira(c.owed)}</span>
                      </div>
                      {ob && (
                        <div className={`p-2 rounded-lg ${ob.status === 'open' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-white dark:bg-slate-900'} space-y-1`}>
                          <p>
                            <strong>Objection:</strong> {ob.reason}
                          </p>
                          {ob.status !== 'open' ? (
                            <p className="text-[11px] text-slate-500">
                              {ob.status === 'corrected' ? 'Corrected' : 'Dismissed'}
                              {ob.reply ? `: ${ob.reply}` : ''}
                            </p>
                          ) : (
                            <>
                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={fix[k] ?? ''}
                                  onChange={(e) => setFix((p) => ({ ...p, [k]: e.target.value }))}
                                  className={input}
                                  placeholder="Correct owed amount"
                                />
                                <input value={reply[k] ?? ''} onChange={(e) => setReply((p) => ({ ...p, [k]: e.target.value }))} className={input} placeholder="Reply" />
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy === k || !(Number(fix[k]) >= 0 && fix[k] !== '' && fix[k] !== undefined)}
                                  onClick={() => run(k, () => adminResolveObjection(r.id, c.orderId, Number(fix[k]), reply[k] || ''))}
                                  className="py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                                >
                                  Correct amount
                                </button>
                                <button
                                  type="button"
                                  disabled={busy === k}
                                  onClick={() => run(k, () => adminResolveObjection(r.id, c.orderId, null, reply[k] || ''))}
                                  className="py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-200 dark:border-slate-700 font-bold">
                  <span>Total</span>
                  <span className="text-right font-mono">{naira((r.carts || []).reduce((t: number, c: any) => t + (c.paid || 0), 0))}</span>
                  <span className="text-right font-mono">{naira((r.carts || []).reduce((t: number, c: any) => t + (c.keep || 0), 0))}</span>
                  <span className="text-right font-mono">{naira(r.due)}</span>
                </div>
                {(r.payments || []).map((p: any, i: number) => (
                  <p key={i} className="text-[11px] text-slate-500">
                    Sent {naira(p.amount)}
                    {p.note ? `: ${p.note}` : ''}
                  </p>
                ))}
                {!r.settled && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={amounts[r.id] ?? String(unconfirmed || '')}
                        onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                        className={input}
                        placeholder="Amount received"
                      />
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => {
                          const amt = Number(amounts[r.id] ?? unconfirmed);
                          if (!(amt > 0)) return window.alert('Enter the amount you received.');
                          run(r.id, () => adminConfirmSettlement(r.id, amt, false));
                        }}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                      >
                        Confirm received
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => {
                        if (window.confirm(`Mark ${r.name}'s day as settled? Use this when they paid you outside the app.`)) run(r.id, () => adminConfirmSettlement(r.id, 0, true));
                      }}
                      className="w-full py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Mark settled (paid outside the app)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Admin Orders & Dispatch: three sections, each with Active, Payments Confirmed, Completed and Settlement */
export const AdminDispatch: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [section, setSection] = useState<Section>('inside');
  const [tab, setTab] = useState<Tab>('active');
  const [day, setDay] = useState(ymd(new Date()));
  const [search, setSearch] = useState('');

  useEffect(() => subscribeOrders((list: OrderRecord[]) => setOrders(list || [])), []);

  const inSection = useMemo(() => orders.filter((o) => sectionOf(o) === section), [orders, section]);
  const counts = {
    active: inSection.filter((o) => orderStage(o) === 'active').length,
    confirmed: inSection.filter((o) => orderStage(o) === 'confirmed').length,
  };
  const q = search.trim().toLowerCase();
  const list = inSection
    .filter((o) =>
      tab === 'completed'
        ? orderStage(o) === 'completed' && (q !== '' || ymd(new Date(o.deliveredAt || o.createdAt)) === day) // a search looks across all days
        : orderStage(o) === tab
    )
    .filter((o) => !q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || String(o.phone).includes(q));

  return (
    <div className="space-y-3">
      <Pills value={section} onChange={setSection} options={[['inside', 'Inside'], ['store', 'Outside Store'], ['food', 'Food']]} />
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">{SECTION_LABEL[section]}</p>
        <Pills
          value={tab}
          onChange={setTab}
          options={[
            ['active', `Active (${counts.active})`],
            ['confirmed', `Payments Confirmed (${counts.confirmed})`],
            ['completed', 'Completed'],
            ['settlement', 'Settlement'],
          ]}
        />
        {tab === 'settlement' ? (
          <SettlementView section={section} />
        ) : (
          <>
            {tab === 'completed' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={input} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder="Search name, phone or ID" />
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              {tab === 'active'
                ? 'The student says they have paid. Waiting for the runner or operator to confirm it reached their account.'
                : tab === 'confirmed'
                ? 'Payment confirmed. Being packed and delivered.'
                : 'Delivered to the room (inside) or sent to the school gate (outside).'}
            </p>
            {list.length === 0 && <p className="text-xs text-slate-400">Nothing here.</p>}
            {list.map((o) => (
              <OrderRow key={o.id} o={o} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

/** Admin Team: runners and operators, their payment accounts, switch-off and inside batch switches */
export const AdminTeam: React.FC = () => {
  const [runners, setRunners] = useState<any[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => {
    getRunners().then(setRunners);
    const h = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    return () => window.removeEventListener('roomly-batches', h);
  }, []);
  const ops = getAllOperatorStatus();
  const acct = (a: any) => (a ? `${a.bankName} · ${a.accountNumber} · ${a.accountName}` : 'No payment account yet (cannot switch on)');

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Runners</p>
        {runners.length === 0 && <p className="text-xs text-slate-400">No runners yet.</p>}
        {runners.map((r) => (
          <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
            <p className="font-bold">
              {r.name} <span className="font-normal text-slate-500">· {r.phone}</span>
            </p>
            <p className={`text-[11px] ${r.payAccount ? 'text-slate-500' : 'text-rose-600'}`}>{acct(r.payAccount)}</p>
          </div>
        ))}
        <p className="text-xs font-black uppercase tracking-wider text-slate-500 pt-2">Operators' payment accounts</p>
        {ops.map((o: any) => (
          <div key={o.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
            <p className="font-bold">
              {o.name} <span className="font-normal text-slate-500">· {o.kind === 'food' ? 'Food' : 'Store'}</span>
            </p>
            <p className={`text-[11px] ${o.payTo ? 'text-slate-500' : 'text-rose-600'}`}>{acct(o.payTo)}</p>
          </div>
        ))}
      </div>
      <OperatorOverridePanel />
      <BatchSwitches />
    </div>
  );
};

/** Admin Money: real totals from the daily settlement records */
export const AdminMoney: React.FC = () => {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    if (range === 'week') start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    if (range === 'month') start.setDate(1);
    setLoading(true);
    getSettlementsRange(ymd(start), ymd(now)).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [range]);

  const sum = (list: any[], f: (r: any) => number) => list.reduce((t, r) => t + (f(r) || 0), 0);
  const groups: [string, string][] = [
    ['runner', 'Inside (runners)'],
    ['store', 'Outside store'],
    ['food', 'Food'],
  ];
  const owed = sum(rows, (r) => r.due);
  const received = sum(rows, (r) => (r.settled && r.override ? r.due : r.confirmed));

  return (
    <div className={card}>
      <Pills value={range} onChange={setRange} options={[['today', 'Today'], ['week', 'This week'], ['month', 'This month']]} />
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Owed to you</span>
              <span className="block text-base font-extrabold">{naira(owed)}</span>
            </div>
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Received</span>
              <span className="block text-base font-extrabold text-[#0e9f55]">{naira(received)}</span>
            </div>
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Outstanding</span>
              <span className="block text-base font-extrabold text-amber-700 dark:text-amber-300">{naira(Math.max(0, owed - received))}</span>
            </div>
          </div>
          {groups.map(([k, label]) => {
            const g = rows.filter((r) => r.kind === k);
            return (
              <div key={k} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span>
                  <strong>{label}</strong>
                  <span className="block text-[11px] text-slate-500">
                    {sum(g, (r) => r.orders)} orders · students paid {naira(sum(g, (r) => r.paid))}
                  </span>
                </span>
                <span className="text-right">
                  <strong>{naira(sum(g, (r) => r.due))}</strong>
                  <span className="block text-[10px] text-slate-400">owed</span>
                </span>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">Counted from completed carts. Received = amounts you confirmed, plus days you marked settled.</p>
        </>
      )}
    </div>
  );
};
