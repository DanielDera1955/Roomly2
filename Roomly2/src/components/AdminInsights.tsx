import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getDaySummaries, getRequestsRange, getSettlementsRange, getProductsFresh, isOverdue } from '../api.js';
import { storeOfSource, STORE_LABEL, StoreKey, SETTLE_BY_HOUR } from '../config';

type Range = 1 | 7 | 30;
type Sel = 'all' | StoreKey;
const STORES: StoreKey[] = ['inside', 'store', 'food'];
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const title = 'text-xs font-black uppercase tracking-wider text-slate-500';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Add up the chosen stores across days */
function aggregate(days: any[], sel: Sel) {
  const t: any = { placed: 0, unpaid: 0, completed: 0, sales: 0, earnings: 0, late: 0, firstTime: 0, products: {}, categories: {}, hours: {}, hostels: {}, batches: {}, customers: {}, oos: {}, team: {}, weekdays: {}, byStore: {} };
  const addMap = (into: any, from: any) => Object.entries(from || {}).forEach(([k, v]: any) => (into[k] = (into[k] || 0) + v));
  for (const d of days) {
    const wd = new Date(d.date + 'T00:00:00').getDay();
    for (const k of STORES) {
      if (sel !== 'all' && sel !== k) continue;
      const s = d.stores?.[k];
      if (!s) continue;
      ['placed', 'unpaid', 'completed', 'sales', 'earnings', 'late', 'firstTime'].forEach((f) => (t[f] += s[f] || 0));
      const bs = (t.byStore[k] = t.byStore[k] || { sales: 0, earnings: 0, completed: 0 });
      bs.sales += s.sales || 0;
      bs.earnings += s.earnings || 0;
      bs.completed += s.completed || 0;
      t.weekdays[wd] = (t.weekdays[wd] || 0) + ((s.placed || 0) - (s.unpaid || 0));
      ['hours', 'hostels', 'batches', 'customers', 'oos'].forEach((f) => addMap(t[f], s[f]));
      Object.entries(s.products || {}).forEach(([key, p]: any) => {
        const c = (t.products[key] = t.products[key] || { name: p.name, category: p.category, qty: 0, sales: 0, earnings: 0 });
        c.qty += p.qty;
        c.sales += p.sales;
        c.earnings += p.earnings;
      });
      Object.entries(s.categories || {}).forEach(([key, p]: any) => {
        const c = (t.categories[key] = t.categories[key] || { qty: 0, sales: 0, earnings: 0 });
        c.qty += p.qty;
        c.sales += p.sales;
        c.earnings += p.earnings;
      });
      Object.entries(s.team || {}).forEach(([key, p]: any) => {
        const c = (t.team[key] = t.team[key] || { orders: 0, confirmMins: 0, confirmed: 0 });
        c.orders += p.orders;
        c.confirmMins += p.confirmMins;
        c.confirmed += p.confirmed;
      });
    }
  }
  return t;
}

const Trend: React.FC<{ now: number; before: number }> = ({ now, before }) => {
  if (!before && !now) return <span className="text-[10px] text-slate-400">no change</span>;
  if (!before) return <span className="text-[10px] font-bold text-[#0e9f55]">new</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${pct > 0 ? 'text-[#0e9f55]' : pct < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
      <Icon className="w-3 h-3" />
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
};

const Stat: React.FC<{ label: string; value: string; now: number; before: number; sub?: string }> = ({ label, value, now, before, sub }) => (
  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
    <span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span>
    <span className="block text-base font-extrabold text-slate-900 dark:text-white">{value}</span>
    <span className="flex items-center gap-1">
      <Trend now={now} before={before} />
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </span>
  </div>
);

/** Horizontal bars: rows of [label, value, shown text] */
const Bars: React.FC<{ rows: [string, number, string][]; color?: string; empty?: string }> = ({ rows, color = 'bg-[#0e9f55]', empty = 'Nothing yet.' }) => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v, shown], i) => (
        <div key={i} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate">{label}</span>
            <span className="shrink-0 font-bold">{shown}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** Admin Dashboard: where you make money, what sells, who buys, when, what is missing, and how the team performs */
export const AdminInsights: React.FC = () => {
  const [range, setRange] = useState<Range>(7);
  const [sel, setSel] = useState<Sel>('all');
  const [days, setDays] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (range - 1));
  const prevStart = new Date(start);
  prevStart.setDate(start.getDate() - range);
  const from = ymd(start);
  const to = ymd(today);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getDaySummaries(ymd(prevStart), to), getRequestsRange(from, to), getSettlementsRange(from, to), getProductsFresh()]).then(
      ([d, r, s, p]) => {
        if (!alive) return;
        setDays(d);
        setRequests(r);
        setSettlements(s);
        setCatalog(p);
        setLoading(false);
      }
    );
    return () => {
      alive = false;
    };
  }, [range]);

  const now = useMemo(() => aggregate(days.filter((d) => d.date >= from), sel), [days, sel, from]);
  const before = useMemo(() => aggregate(days.filter((d) => d.date < from), sel), [days, sel, from]);

  const paidOrders = now.placed - now.unpaid;
  const aov = now.completed ? now.sales / now.completed : 0;
  const aovBefore = before.completed ? before.sales / before.completed : 0;
  const customers = Object.values(now.customers) as number[];
  const active = customers.length;
  const repeaters = customers.filter((n) => n > 1).length;

  const products = Object.values(now.products) as any[];
  const topQty = [...products].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topEarn = [...products].sort((a, b) => b.earnings - a.earnings).slice(0, 10);
  const cats = (Object.entries(now.categories) as [string, any][]).sort((a, b) => b[1].earnings - a[1].earnings).slice(0, 8);
  const soldNames = new Set(products.map((p) => p.name));
  const slow = catalog.filter((p) => p.isAvailable !== false && (sel === 'all' || storeOfSource(p.source) === sel) && !soldNames.has(p.name));

  const reqCounts: Record<string, number> = {};
  requests
    .filter((r) => sel === 'all' || r.side === sel)
    .forEach((r) => (r.items || []).forEach((i: any) => {
      const k = String(i.name || '').trim().toLowerCase();
      if (k) reqCounts[k] = (reqCounts[k] || 0) + 1;
    }));
  const topReq = Object.entries(reqCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const kindOf: Record<string, StoreKey> = { runner: 'inside', store: 'store', food: 'food' };
  const teamExtra: Record<string, { objections: number; late: number }> = {};
  settlements
    .filter((s) => sel === 'all' || kindOf[s.kind] === sel)
    .forEach((s) => {
      const e = (teamExtra[s.name] = teamExtra[s.name] || { objections: 0, late: 0 });
      e.objections += Object.keys(s.objections || {}).length;
      const due = new Date(s.date + 'T00:00:00');
      due.setDate(due.getDate() + 1);
      due.setHours(SETTLE_BY_HOUR, 0, 0, 0);
      const lateSettle = s.settled ? s.settledAt && Date.parse(s.settledAt) > due.getTime() : (s.due || 0) > 0 && isOverdue([s.date]);
      if (lateSettle) e.late++;
    });
  const teamNames = Array.from(new Set([...Object.keys(now.team), ...Object.keys(teamExtra)]));

  const hours = (Object.entries(now.hours) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const rangeLabel = range === 1 ? 'today' : `the last ${range} days`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto">
        {([1, 7, 30] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${range === r ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            {r === 1 ? 'Today' : `${r} days`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
        {(['all', ...STORES] as Sel[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSel(k)}
            className={`py-1.5 rounded-xl text-[10px] font-bold cursor-pointer ${sel === k ? 'bg-white dark:bg-slate-900 shadow-xs text-[#0e9f55]' : 'text-slate-500'}`}
          >
            {k === 'all' ? 'All stores' : STORE_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={card}>
          <p className="text-xs text-slate-400">Counting… The first time can take a moment while past orders are imported.</p>
        </div>
      ) : (
        <>
          {/* 1. Money */}
          <div className={card}>
            <p className={title}>Money ({rangeLabel})</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Your earnings" value={naira(now.earnings)} now={now.earnings} before={before.earnings} sub="margin + delivery" />
              <Stat label="Sales" value={naira(now.sales)} now={now.sales} before={before.sales} sub="students paid" />
              <Stat label="Completed orders" value={String(now.completed)} now={now.completed} before={before.completed} />
              <Stat label="Average order" value={naira(aov)} now={aov} before={aovBefore} />
            </div>
            {sel === 'all' && (
              <>
                <p className="text-[11px] font-bold text-slate-500 pt-1">Where your earnings come from</p>
                <Bars
                  rows={STORES.map((k) => [STORE_LABEL[k], now.byStore[k]?.earnings || 0, `${naira(now.byStore[k]?.earnings || 0)} · ${now.byStore[k]?.completed || 0} orders`])}
                />
              </>
            )}
            <p className="text-[10px] text-slate-400">Trend arrows compare with the {range === 1 ? 'day' : `${range} days`} before. Earnings are estimated where a product has no cost price.</p>
          </div>

          {/* 2. Products */}
          <div className={card}>
            <p className={title}>Products</p>
            <p className="text-[11px] font-bold text-slate-500">Most ordered</p>
            <Bars rows={topQty.map((p) => [p.name, p.qty, `${p.qty} sold`])} empty="No completed orders yet." />
            <p className="text-[11px] font-bold text-slate-500 pt-1">Make you the most money</p>
            <Bars rows={topEarn.map((p) => [p.name, p.earnings, naira(p.earnings)])} color="bg-amber-500" empty="No completed orders yet." />
            <p className="text-[11px] font-bold text-slate-500 pt-1">Best categories</p>
            <Bars rows={cats.map(([k, c]) => [k, c.earnings, `${naira(c.earnings)} · ${c.qty} sold`])} color="bg-teal-600" />
            <p className="text-[11px] font-bold text-slate-500 pt-1">Slow movers: no orders in {rangeLabel} ({slow.length})</p>
            <p className="text-[11px] text-slate-500">
              {slow.length ? slow.slice(0, 12).map((p) => p.name).join(', ') + (slow.length > 12 ? '…' : '') : 'Everything sold at least once.'}
            </p>
          </div>

          {/* 3. Customers */}
          <div className={card}>
            <p className={title}>Customers</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Active</span>
                <span className="block text-base font-extrabold">{active}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">New orders</span>
                <span className="block text-base font-extrabold">{now.firstTime}</span>
                <span className="block text-[10px] text-slate-400">returning {Math.max(0, paidOrders - now.firstTime)}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Repeat rate</span>
                <span className="block text-base font-extrabold">{active ? Math.round((repeaters / active) * 100) : 0}%</span>
                <span className="block text-[10px] text-slate-400">ordered 2+ times</span>
              </div>
            </div>
            <p className="text-[11px] font-bold text-slate-500">Orders by hostel</p>
            <Bars rows={(Object.entries(now.hostels) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, `${v}`])} color="bg-blue-500" />
          </div>

          {/* 4. Timing and batches */}
          <div className={card}>
            <p className={title}>Timing and batches</p>
            <p className="text-[11px] font-bold text-slate-500">Busiest days</p>
            <Bars rows={[1, 2, 3, 4, 5, 6, 0].map((d) => [WEEKDAYS[d], now.weekdays[d] || 0, `${now.weekdays[d] || 0}`] as [string, number, string])} color="bg-violet-500" />
            <p className="text-[11px] font-bold text-slate-500 pt-1">Busiest ordering hours</p>
            <Bars rows={hours.map(([h, v]) => [hourLabel(Number(h)), v, `${v}`])} color="bg-violet-500" />
            <p className="text-[11px] font-bold text-slate-500 pt-1">Orders per batch</p>
            <Bars rows={(Object.entries(now.batches) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, `${v}`])} color="bg-teal-600" />
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Late orders</span>
                <span className="block text-base font-extrabold">{now.late}</span>
                <span className="block text-[10px] text-slate-400">accepted the next batch</span>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Payment drop-off</span>
                <span className="block text-base font-extrabold">{now.placed ? Math.round((now.unpaid / now.placed) * 100) : 0}%</span>
                <span className="block text-[10px] text-slate-400">
                  {now.unpaid} of {now.placed} orders never paid
                </span>
              </div>
            </div>
          </div>

          {/* 5. Demand you're missing */}
          <div className={card}>
            <p className={title}>Demand you're missing</p>
            <p className="text-[11px] font-bold text-slate-500">Most requested products</p>
            <Bars rows={topReq.map(([k, v]) => [k, v, `${v} request${v === 1 ? '' : 's'}`])} color="bg-rose-500" empty="No product requests in this period." />
            <p className="text-[11px] font-bold text-slate-500 pt-1">If out of stock, students chose</p>
            <Bars
              rows={[
                ['Refund', now.oos.refund || 0, `${now.oos.refund || 0}`],
                ["Tomorrow's batch", now.oos.tomorrow || 0, `${now.oos.tomorrow || 0}`],
                ['Same-category swap', now.oos.swap || 0, `${now.oos.swap || 0}`],
              ]}
              color="bg-slate-500"
            />
          </div>

          {/* 6. Team */}
          <div className={card}>
            <p className={title}>Team performance</p>
            {teamNames.length === 0 && <p className="text-xs text-slate-400">No completed orders yet.</p>}
            {teamNames.map((n) => {
              const t = now.team[n] || { orders: 0, confirmMins: 0, confirmed: 0 };
              const e = teamExtra[n] || { objections: 0, late: 0 };
              return (
                <div key={n} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <span className="min-w-0">
                    <strong className="truncate block">{n}</strong>
                    <span className="text-[11px] text-slate-500">
                      {t.confirmed ? `confirms payment in ~${Math.round(t.confirmMins / t.confirmed)} min` : 'no confirm time yet'} · {e.objections} objection(s) ·{' '}
                      <span className={e.late ? 'text-rose-600 font-bold' : ''}>{e.late} late settlement(s)</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block">{t.orders}</strong>
                    <span className="text-[10px] text-slate-400">orders</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
