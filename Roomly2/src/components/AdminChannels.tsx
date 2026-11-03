import React, { useEffect, useState } from 'react';
import { subscribeOrders } from '../api.js';
import { subscribeGamers } from '../hub.js';
import { channelOf } from '../tracking.js';
import { OrderRecord } from '../types';

/**
 * Admin: where students come from. Each promotion gets its own link, e.g.
 *   roomly2-inky.vercel.app/?ref=breadegg   roomly2-inky.vercel.app/?ref=hallgroup
 * The tag is saved with the student's orders and Games registration. Students with no tag are grouped by
 * what they answered for "How did you hear about Roomly?" at their first checkout.
 */
const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 0, label: 'All time' },
];
const DAY = 86400000;
const isPaid = (o: OrderRecord) => o.paymentStatus === 'payment_confirmed' || o.status === 'Delivered';

export const AdminChannels: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [gamers, setGamers] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState(true);

  useEffect(() => subscribeOrders((list: OrderRecord[]) => setOrders(list || [])), []);
  useEffect(() => subscribeGamers((list: any[]) => setGamers(list || [])), []);

  const from = days ? Date.now() - days * DAY : 0;
  const rows = new Map<string, { newCustomers: number; paidOrders: number; gamers: number }>();
  const row = (k: string) => {
    if (!rows.has(k)) rows.set(k, { newCustomers: 0, paidOrders: 0, gamers: 0 });
    return rows.get(k)!;
  };
  // Phones seen before the range are not new customers in it
  const firstOrder = new Map<string, number>();
  orders.forEach((o) => {
    const t = Date.parse(o.createdAt || '');
    if (!o.phone || !Number.isFinite(t)) return;
    if (!firstOrder.has(o.phone) || t < firstOrder.get(o.phone)!) firstOrder.set(o.phone, t);
  });
  orders.forEach((o) => {
    const t = Date.parse(o.createdAt || '');
    if (!Number.isFinite(t) || t < from || o.status === 'Cancelled') return;
    const r = row(channelOf(o));
    if (isPaid(o)) r.paidOrders += 1;
    if (o.phone && firstOrder.get(o.phone) === t) r.newCustomers += 1;
  });
  gamers.forEach((g) => {
    if (Number(g.createdAtMs || 0) < from) return;
    row(channelOf(g)).gamers += 1;
  });
  const list = [...rows.entries()].sort((a, b) => b[1].paidOrders - a[1].paidOrders || b[1].newCustomers - a[1].newCustomers);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Where students come from</span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDays(r.id)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  days === r.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="text-xs text-slate-400">No orders or Games sign-ups in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 text-left">
                    <th className="py-1.5 pr-2 font-bold">Channel</th>
                    <th className="py-1.5 px-2 font-bold text-right">New customers</th>
                    <th className="py-1.5 px-2 font-bold text-right">Paid orders</th>
                    <th className="py-1.5 pl-2 font-bold text-right">Games sign-ups</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-2 font-semibold">{k}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v.newCustomers}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v.paidOrders}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{v.gamers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-slate-400 leading-snug">
            Give each group its own link, e.g. roomly2-inky.vercel.app/?ref=hallgroup. "Said" rows are students with no tag who answered "How did
            you hear about Roomly?". Visitors who never ordered or signed up are in Vercel Analytics.
          </p>
        </>
      )}
    </div>
  );
};
