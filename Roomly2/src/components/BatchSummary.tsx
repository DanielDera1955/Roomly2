import React, { useEffect, useMemo, useState } from 'react';
import { orderStage, vendorBreakdownOf, contactPhoneFor, waNumber } from '../api.js';
import { OrderRecord } from '../types';

/** Admin: outside orders grouped by batch and vendor. Transport is paid ONCE per batch, not per order.
 * Shows what each vendor is owed, transport, delivery collected and the batch profit, plus one WhatsApp message per batch. */

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const input = 'w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

// Transport prices: editable here, remembered on this device
const KEY = 'roomly_batch_transport';
type Transport = { vendor: number; keke: number };
const DEFAULT_T: Transport = { vendor: 1000, keke: 2000 };
const loadT = (): Transport => {
  try {
    return { ...DEFAULT_T, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULT_T;
  }
};
const saveT = (t: Transport) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: the prices still work for this visit */
  }
};

const isOutside = (o: OrderRecord) => o.cart === 'store' || o.cart === 'food';

export const BatchSummary: React.FC<{ orders: OrderRecord[] }> = ({ orders }) => {
  const [t, setT] = useState<Transport>(loadT);
  const [mode, setMode] = useState<Record<string, 'vendor' | 'keke'>>({});
  const [costs, setCosts] = useState<Record<string, any>>({});
  const today = ymd(new Date());

  // Paid outside orders for today or later, grouped by day + batch + vendor
  const groups = useMemo(() => {
    const g: Record<string, { key: string; day: string; time: string; vendor: string; orders: OrderRecord[] }> = {};
    orders
      .filter((o) => isOutside(o) && ['confirmed', 'completed'].includes(orderStage(o)) && ((o as any).deliveryDate || today) >= today)
      .forEach((o) => {
        const day = (o as any).deliveryDate || today;
        const vendor = o.operatorName || 'No vendor yet';
        const key = `${day}|${o.deliveryBatch || ''}|${vendor}`;
        if (!g[key]) g[key] = { key, day, time: o.deliveryTime || '', vendor, orders: [] };
        g[key].orders.push(o);
      });
    return Object.values(g).sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, today]);

  const ids = groups.flatMap((g) => g.orders.map((o) => o.id)).join(',');
  useEffect(() => {
    let live = true;
    groups.forEach((g) =>
      g.orders.forEach((o) => {
        if (costs[o.id]) return;
        vendorBreakdownOf(o)
          .then((r: any) => live && setCosts((c) => ({ ...c, [o.id]: r })))
          .catch(() => {});
      })
    );
    return () => {
      live = false;
    };
  }, [ids]);

  if (groups.length === 0) return null;

  const setPrice = (k: keyof Transport, v: string) => {
    const next = { ...t, [k]: Math.max(0, Number(v) || 0) };
    setT(next);
    saveT(next);
  };

  return (
    <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 text-[11px]">Batch summary (transport paid once)</p>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
          Vendor ₦<input className={input} inputMode="numeric" value={t.vendor} onChange={(e) => setPrice('vendor', e.target.value)} />
          Keke ₦<input className={input} inputMode="numeric" value={t.keke} onChange={(e) => setPrice('keke', e.target.value)} />
        </div>
      </div>
      {groups.map((g) => {
        const m = mode[g.key] || 'vendor';
        const transport = m === 'keke' ? t.keke : t.vendor;
        const items = g.orders.reduce((s, o) => s + (costs[o.id]?.items || 0), 0);
        const estimated = g.orders.some((o) => !costs[o.id] || costs[o.id].estimated);
        const paid = g.orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const delivery = g.orders.reduce((s, o) => s + (o.deliveryFee || 0), 0);
        const profit = paid - items - transport;
        const dayLabel = new Date(g.day + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });

        // One combined message for the whole batch
        const msg = [
          `Roomly batch: ${dayLabel}${g.time ? `, ${g.time}` : ''}`,
          `${g.orders.length} ${g.orders.length === 1 ? 'order' : 'orders'}`,
          '',
          ...g.orders.map((o, n) => {
            const vb = costs[o.id];
            const rows = [`Order ${n + 1} (${o.id}) for ${o.name}`];
            (vb?.lines || []).forEach((l: any) => {
              rows.push(l.isFood && l.plates > 0 ? `- ${l.name} x ${l.plates} ${l.plates === 1 ? 'plate' : 'plates'}${l.plateCost ? ` (${naira(l.plateCost)} each)` : ''}` : `- ${l.name} x ${l.quantity}`);
              l.options.forEach((e: any) => {
                const q = e.quantity * (l.quantity || 1);
                rows.push(`   + ${e.name}${q > 1 ? ` x ${q}` : ''}${e.cost ? ` (${naira(e.cost)} each)` : ''}`);
              });
              if (l.note) rows.push(`   Note: ${l.note}`);
            });
            if (!vb) (o.items || []).forEach((i: any) => rows.push(`- ${i.quantity}x ${i.name}`));
            return rows.join('\n');
          }),
          '',
          `Items: ${naira(items)}${estimated ? ' (estimate, please confirm)' : ''}`,
          m === 'vendor' ? `Transport: ${naira(transport)} (once for the batch)` : 'Transport: Roomly is sending a keke to pick up',
          m === 'vendor' ? `Total: ${naira(items + transport)}` : `Total: ${naira(items)}`,
          'Please pack each order separately with the name on it and send me a photo.',
        ].join('\n');
        const phone = contactPhoneFor(g.orders[0]);
        const wa = `https://wa.me/${phone ? waNumber(phone) : ''}?text=${encodeURIComponent(msg)}`;

        return (
          <div key={g.key} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex justify-between gap-2">
              <p className="font-bold text-slate-900 dark:text-white">
                {g.vendor} · {dayLabel}
              </p>
              <p className="text-slate-500 shrink-0">
                {g.orders.length} {g.orders.length === 1 ? 'order' : 'orders'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-slate-500">Students paid</span>
              <span className="text-right font-mono">{naira(paid)}</span>
              <span className="text-slate-500">Delivery collected</span>
              <span className="text-right font-mono">{naira(delivery)}</span>
              <span className="text-slate-500">Owe {g.vendor} (items)</span>
              <span className="text-right font-mono">
                {naira(items)}
                {estimated ? ' est.' : ''}
              </span>
              <span className="text-slate-500">Transport (once)</span>
              <span className="text-right font-mono">{naira(transport)}</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">Batch profit</span>
              <span className={`text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{naira(profit)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['vendor', 'keke'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode((x) => ({ ...x, [g.key]: k }))}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    m === k ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {k === 'vendor' ? `Vendor transport ${naira(t.vendor)}` : `Keke ${naira(t.keke)}`}
                </button>
              ))}
              <a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold">
                Send whole batch on WhatsApp
              </a>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500">Pay the vendor the items total plus transport once per batch. Batches for today and later show here.</p>
    </div>
  );
};
