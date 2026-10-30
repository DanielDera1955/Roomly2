import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  subscribeOrders,
  orderStage,
  deleteOrder,
  adminConfirmSettlement,
  adminResolveObjection,
  getSettlementsRange,
  isOverdue,
  getRunners,
  getAllOperatorStatus,
  subscribeAdminOwing,
  settlementState,
  getRunnerOffMap,
  setRunnerAdminOff,
  autoDeliverOverdue,
  resolveNotReceived,
} from '../api.js';
import { OrderRecord, locationText } from '../types';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';

type Section = 'inside' | 'store' | 'food';
type View = 'all' | Section;
type Tab = 'active' | 'confirmed' | 'completed';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';
const SECTION_LABEL: Record<View, string> = { all: 'All Orders', inside: 'Inside Orders', store: 'Outside Store Orders', food: 'Food Orders' };
const SHORT_LABEL: Record<Section, string> = { inside: 'Inside', store: 'Store', food: 'Food' };
const KIND_OF: Record<View, string> = { all: '', inside: 'runner', store: 'store', food: 'food' };
const KIND_LABEL: Record<string, string> = { runner: 'Runner', store: 'Store', food: 'Food' };
const received = (r: any) => (r.settled && r.override ? r.due || 0 : r.confirmed || 0);
const dayText = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

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
const OrderRow: React.FC<{ o: OrderRecord; showSection?: boolean }> = ({ o, showSection }) => {
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
            {showSection ? `${SHORT_LABEL[sectionOf(o)]} · ` : ''}
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

/** One provider's day: status, carts and maths, objections, and the buttons to confirm money received */
const SettleDayCard: React.FC<{ r: any; showDate?: boolean }> = ({ r, showDate }) => {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<Record<string, string>>({});
  const [reply, setReply] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const run = async (key: string, f: () => Promise<any>) => {
    setBusy(key);
    try {
      await f();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

        const objections = r.objections || {};
        const openObj = Object.values(objections).filter((x: any) => x && x.status === 'open').length;
        const status = r.settled ? 'Settled' : openObj ? `Objected (${openObj})` : r.cleared ? 'All cleared' : 'Waiting';
        const overdue = !r.settled && isOverdue([r.date]);
        const unconfirmed = Math.max(0, (r.sentTotal || 0) - (r.confirmed || 0));
        return (
          <div key={r.id} className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
            <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{showDate ? dayText(r.date) : r.name}</p>
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

            {open && (
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
};

/** Admin Orders & Dispatch: live orders only. All, Inside, Outside Store or Food, each with Active, Payments Confirmed and Completed.
 * Settlement lives in the Money tab, across every section and date. */
export const AdminDispatch: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [section, setSection] = useState<View>('all');
  const [tab, setTab] = useState<Tab>('active');
  const [day, setDay] = useState(ymd(new Date()));
  const [search, setSearch] = useState('');

  useEffect(() => subscribeOrders((list: OrderRecord[]) => setOrders(list || [])), []);

  // Backup for the runner's 15-minute timer: if the runner's app is closed, admin marks overdue inside orders delivered
  useEffect(() => {
    const run = () => autoDeliverOverdue(orders).catch(() => 0);
    run();
    const id = window.setInterval(run, 60000);
    return () => window.clearInterval(id);
  }, [orders]);

  // Students who tapped "I haven't received it"
  const notReceived = orders.filter((o) => o.notReceived && !o.notReceived.resolvedAt);
  const resolveFlag = async (o: OrderRecord) => {
    const note = window.prompt('How was it sorted? (optional, e.g. delivered late, refunded)') ?? null;
    if (note === null) return;
    const done = await resolveNotReceived(o.id, note.trim());
    if (!done) window.alert('Could not save. Please try again.');
  };

  const inSection = useMemo(() => (section === 'all' ? orders : orders.filter((o) => sectionOf(o) === section)), [orders, section]);
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
      {notReceived.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-2">
          <p className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
            Not received ({notReceived.length})
          </p>
          <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
            These students say their order never reached their room. Call the student and the runner, then mark it resolved.
          </p>
          {notReceived.map((o) => (
            <div key={o.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 text-xs space-y-1.5">
              <p className="font-bold text-slate-900 dark:text-white">
                {o.name} <span className="font-mono font-normal text-slate-400">{o.id}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {locationText(o)} · Student {o.phone} · Runner {o.runnerName || 'none'}
                {o.runnerPhone ? ` (${o.runnerPhone})` : ''}
                {o.autoDelivered ? ' · Marked delivered by the 15-minute timer' : ' · Runner tapped Delivered'}
              </p>
              <button
                type="button"
                onClick={() => resolveFlag(o)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-bold cursor-pointer"
              >
                Mark resolved
              </button>
            </div>
          ))}
        </div>
      )}
      <Pills value={section} onChange={setSection} options={[['all', 'All'], ['inside', 'Inside'], ['store', 'Outside Store'], ['food', 'Food']]} />
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">{SECTION_LABEL[section]}</p>
        <Pills
          value={tab}
          onChange={setTab}
          options={[
            ['active', `Active (${counts.active})`],
            ['confirmed', `Payments Confirmed (${counts.confirmed})`],
            ['completed', 'Completed'],
          ]}
        />
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
          <OrderRow key={o.id} o={o} showSection={section === 'all'} />
        ))}
        <p className="text-[11px] text-slate-400">Settlement and who owes you are in the Money tab.</p>
      </div>
    </div>
  );
};

/** Admin: switch each runner off or back on. OFF hides them from checkout, express and gate pickups. */
const RunnerOverridePanel: React.FC<{ runners: any[] }> = ({ runners }) => {
  const [busy, setBusy] = useState('');
  const off: Record<string, boolean> = getRunnerOffMap();
  const set = async (email: string, v: boolean) => {
    setBusy(email);
    try {
      await setRunnerAdminOff(email, v);
    } catch (e) {
      window.alert('Could not update this runner. Check that the new database rules are published.');
    }
    setBusy('');
  };
  return (
    <div className={card}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Runners: switch on or off</p>
      {runners.length === 0 && <p className="text-xs text-slate-400">No runners yet.</p>}
      {runners.map((r) => {
        const email = String(r.email || r.id || '').toLowerCase();
        const isOff = Boolean(off[email]);
        return (
          <div
            key={r.id}
            className={`flex items-center justify-between gap-2 p-3 rounded-2xl text-xs border-2 ${
              isOff ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50' : 'bg-emerald-50 dark:bg-emerald-950/30 border-[#0e9f55]'
            }`}
          >
            <div className="min-w-0">
              <span className="font-bold text-slate-900 dark:text-white">{r.name || email}</span>
              <span className={`block text-[11px] font-bold ${isOff ? 'text-rose-600 dark:text-rose-400' : 'text-[#0e9f55]'}`}>
                {isOff ? 'OFF: hidden from students, no new batches, express or gate pickups' : 'ON: can take batches'}
              </span>
            </div>
            <div className="shrink-0 grid grid-cols-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
              <button
                type="button"
                disabled={busy === email || isOff}
                onClick={() => {
                  if (window.confirm(`Switch ${r.name || 'this runner'} off? They finish orders already paid to them, but take no new ones.`)) set(email, true);
                }}
                className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${isOff ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-400'}`}
              >
                OFF
              </button>
              <button
                type="button"
                disabled={busy === email || !isOff}
                onClick={() => set(email, false)}
                className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${!isOff ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 text-slate-400'}`}
              >
                ON
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400 leading-snug">
        Your OFF overrides the runner. Orders already paid to them stay with them to finish.
      </p>
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
      <RunnerOverridePanel runners={runners} />
      <OperatorOverridePanel />
      <BatchSwitches />
    </div>
  );
};

type MoneyRange = 'today' | 'week' | 'month' | 'year' | 'custom';

function moneyRange(r: MoneyRange): [string, string] {
  const now = new Date();
  const start = new Date(now);
  if (r === 'week') start.setDate(now.getDate() - 6);
  if (r === 'month') start.setDate(now.getDate() - 29);
  if (r === 'year') start.setMonth(0, 1);
  return [ymd(start), ymd(now)];
}

const sumOf = (list: any[], f: (r: any) => number) => list.reduce((t, r) => t + (Number(f(r)) || 0), 0);

const Stat: React.FC<{ label: string; value: string | number; tone?: 'plain' | 'green' | 'amber' | 'rose' }> = ({ label, value, tone = 'plain' }) => (
  <div
    className={`rounded-2xl p-2.5 ${
      tone === 'green'
        ? 'bg-emerald-50 dark:bg-emerald-950/30'
        : tone === 'amber'
        ? 'bg-amber-50 dark:bg-amber-950/30'
        : tone === 'rose'
        ? 'bg-rose-50 dark:bg-rose-950/30'
        : 'bg-slate-50 dark:bg-slate-800/60'
    }`}
  >
    <span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span>
    <span
      className={`block text-base font-extrabold ${
        tone === 'green' ? 'text-[#0e9f55]' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : tone === 'rose' ? 'text-rose-700 dark:text-rose-300' : ''
      }`}
    >
      {value}
    </span>
  </div>
);

/** Admin: live list of days not yet settled. Also drives the red count on the Money tab. */
export function useOpenSettlements() {
  const [open, setOpen] = useState<any[]>([]);
  useEffect(() => subscribeAdminOwing(setOpen), []);
  return open;
}

/** Days that need you: money sent and waiting for your confirmation, or overdue and hiding someone from checkout */
export const needsAction = (open: any[]) => open.filter((r) => settlementState(r) !== 'due');

const STATE_ORDER: Record<string, number> = { waiting: 0, overdue: 1, due: 2 };
const STATE_TEXT: Record<string, string> = {
  waiting: 'Sent, waiting for you to confirm',
  overdue: 'Overdue, not sent: hidden from checkout',
  due: 'Due, not overdue yet',
};

/**
 * Admin Money: one place for settlement across every section and date.
 * 1. Overview for a range  2. Needs your action (all dates)  3. People, each with their numbers and open days
 */
export const AdminMoney: React.FC = () => {
  const [view, setView] = useState<View>('all');
  const [range, setRange] = useState<MoneyRange>('today');
  const def = moneyRange('week');
  const [from, setFrom] = useState(def[0]);
  const [to, setTo] = useState(def[1]);
  const [span, setSpan] = useState<[string, string]>(moneyRange('today'));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [person, setPerson] = useState('');
  const open = useOpenSettlements();

  useEffect(() => {
    if (range === 'custom') return;
    setSpan(moneyRange(range));
  }, [range]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getSettlementsRange(span[0], span[1]).then((r) => {
      if (!live) return;
      setRows(r);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [span[0], span[1], open.length]);

  const kind = KIND_OF[view];
  const inView = (r: any) => !kind || r.kind === kind;
  const ranged = rows.filter(inView);
  const openInView = open.filter(inView);
  const owed = sumOf(ranged, (r) => r.due);
  const got = sumOf(ranged, received);

  // Needs your action, grouped by person: every unsettled day across all dates
  const byPerson = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; kind: string; days: any[]; owed: number; state: string }>();
    openInView.forEach((r) => {
      const st = settlementState(r);
      const g = m.get(r.uid) || { uid: r.uid, name: r.name || 'Unnamed', kind: r.kind, days: [] as any[], owed: 0, state: 'due' as string };
      g.days.push(r);
      g.owed += Math.max(0, (r.due || 0) - received(r));
      if (STATE_ORDER[st] < STATE_ORDER[g.state]) g.state = st;
      m.set(r.uid, g);
    });
    return [...m.values()]
      .map((g) => ({ ...g, days: g.days.sort((x, y) => (STATE_ORDER[settlementState(x)] - STATE_ORDER[settlementState(y)]) || x.date.localeCompare(y.date)) }))
      .sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || y.owed - x.owed);
  }, [openInView]);

  // People with orders in the range, or money still owed
  const people = useMemo(() => {
    const m = new Map<string, any>();
    const add = (r: any) => {
      if (!m.has(r.uid)) m.set(r.uid, { uid: r.uid, name: r.name || 'Unnamed', kind: r.kind, days: [] });
      return m.get(r.uid);
    };
    ranged.forEach((r) => add(r).days.push(r));
    openInView.forEach((r) => add(r));
    return [...m.values()]
      .map((p) => ({
        ...p,
        orders: sumOf(p.days, (r) => r.orders),
        paid: sumOf(p.days, (r) => r.paid),
        due: sumOf(p.days, (r) => r.due),
        got: sumOf(p.days, received),
        openDays: openInView.filter((r) => r.uid === p.uid),
      }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
  }, [ranged, openInView]);

  const groups: [string, string][] = [
    ['runner', 'Inside (runners)'],
    ['store', 'Outside store'],
    ['food', 'Food'],
  ];
  const rangeLabel = range === 'today' ? 'today' : range === 'custom' ? `${dayText(span[0])} to ${dayText(span[1])}` : range === 'week' ? 'the last 7 days' : range === 'month' ? 'the last 30 days' : 'this year';

  return (
    <div className="space-y-3">
      <Pills value={view} onChange={setView} options={[['all', 'All'], ['inside', 'Inside'], ['store', 'Store'], ['food', 'Food']]} />

      {/* 1. Overview */}
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Overview</p>
        <Pills
          value={range}
          onChange={setRange}
          options={[
            ['today', 'Today'],
            ['week', '7 days'],
            ['month', '30 days'],
            ['year', 'This year'],
            ['custom', 'Pick dates'],
          ]}
        />
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
            <button
              type="button"
              onClick={() => setSpan(from <= to ? [from, to] : [to, from])}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-xs font-bold cursor-pointer"
            >
              Show
            </button>
          </div>
        )}
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Orders completed" value={sumOf(ranged, (r) => r.orders)} />
              <Stat label="Students paid" value={naira(sumOf(ranged, (r) => r.paid))} />
              <Stat label="Owed to Roomly" value={naira(owed)} />
              <Stat label="Received" value={naira(got)} tone="green" />
            </div>
            <Stat label="Still outstanding" value={naira(Math.max(0, owed - got))} tone="amber" />
            {view === 'all' &&
              groups.map(([k, label]) => {
                const g = ranged.filter((r) => r.kind === k);
                return (
                  <div key={k} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span>
                      <strong>{label}</strong>
                      <span className="block text-[11px] text-slate-500">
                        {sumOf(g, (r) => r.orders)} orders · students paid {naira(sumOf(g, (r) => r.paid))}
                      </span>
                    </span>
                    <span className="text-right">
                      <strong>{naira(sumOf(g, (r) => r.due))}</strong>
                      <span className="block text-[10px] text-slate-400">owed · {naira(sumOf(g, received))} received</span>
                    </span>
                  </div>
                );
              })}
            <p className="text-[11px] text-slate-400">
              Counted from completed carts for {rangeLabel}. Received = amounts you confirmed, plus days you marked settled.
            </p>
          </>
        )}
      </div>

      {/* 2. Needs your action: every unsettled day, whatever the date */}
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Who owes you ({byPerson.length})</p>
        {byPerson.length === 0 && <p className="text-xs text-slate-400">Nobody owes you anything right now.</p>}
        {byPerson.map((g) => (
          <OwingGroup key={g.uid} g={g} />
        ))}
        <p className="text-[11px] text-slate-400 leading-snug">
          Every unsettled day, from any date. Confirm what reached your account, or mark a day settled if they paid you another way. An overdue
          day hides that person from checkout until you confirm it.
        </p>
      </div>

      {/* 3. People: each runner and operator, with their numbers for the range above */}
      <div className={card}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">People ({rangeLabel})</p>
        {people.length === 0 && <p className="text-xs text-slate-400">No completed orders in this range.</p>}
        {people.map((p) => {
          const isOpen = person === p.uid;
          return (
            <div key={p.uid} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
              <button type="button" onClick={() => setPerson(isOpen ? '' : p.uid)} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {p.name} <span className="font-normal text-slate-500">· {KIND_LABEL[p.kind] || p.kind}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {p.orders} orders · students paid {naira(p.paid)}
                    {p.openDays.length ? ` · ${p.openDays.length} unsettled day(s)` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-extrabold text-amber-700 dark:text-amber-300">{naira(p.due)}</p>
                  <p className="text-[10px] text-slate-400">owed · {naira(p.got)} received</p>
                </div>
              </button>
              {isOpen && (
                <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Orders" value={p.orders} />
                    <Stat label="Students paid" value={naira(p.paid)} />
                    <Stat label="Owed to Roomly" value={naira(p.due)} />
                    <Stat label="Received" value={naira(p.got)} tone="green" />
                  </div>
                  <p className="text-[11px] text-slate-500">Change the range in the Overview above to see Today, 7 days, 30 days, this year or picked dates.</p>
                  {p.openDays.length > 0 && <p className="font-bold text-slate-700 dark:text-slate-200">Unsettled days (any date)</p>}
                  {p.openDays.map((r: any) => (
                    <SettleDayCard key={r.id} r={r} showDate />
                  ))}
                  {p.days.filter((r: any) => r.settled).length > 0 && <p className="font-bold text-slate-700 dark:text-slate-200">Settled in this range</p>}
                  {p.days
                    .filter((r: any) => r.settled)
                    .sort((a: any, b: any) => b.date.localeCompare(a.date))
                    .map((r: any) => (
                      <SettleDayCard key={r.id} r={r} showDate />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** One person in "Who owes you": total, worst state, and each unsettled day with its confirm buttons */
const OwingGroup: React.FC<{ g: { uid: string; name: string; kind: string; days: any[]; owed: number; state: string } }> = ({ g }) => {
  const [open, setOpen] = useState(g.state !== 'due');
  const tone =
    g.state === 'waiting'
      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30'
      : g.state === 'overdue'
      ? 'border-rose-300 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60';
  return (
    <div className={`p-3 rounded-2xl border text-xs space-y-2 ${tone}`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">
            {g.name} <span className="font-normal text-slate-500">· {KIND_LABEL[g.kind] || g.kind}</span>
          </p>
          <p className={`text-[11px] font-bold ${g.state === 'overdue' ? 'text-rose-600 dark:text-rose-400' : g.state === 'waiting' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
            {STATE_TEXT[g.state]} · {g.days.length} day(s)
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-extrabold text-amber-700 dark:text-amber-300">{naira(g.owed)}</p>
          <ChevronDown className={`w-4 h-4 text-slate-400 inline transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="space-y-2">
          {g.days.map((r) => (
            <div key={r.id} className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-500">{STATE_TEXT[settlementState(r)]}</p>
              <SettleDayCard r={r} showDate />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
