import React, { useEffect, useState } from 'react';
import { subscribeSideRequests, quoteProductRequest, mySide, getCategories, getCurrentStaff } from '../api.js';
import { sellingPrice, INSIDE_CATEGORIES, OUTSIDE_CATEGORIES } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

/**
 * Runners (inside) and operators (store / food): students' requests for products not in the store.
 * The first to send a price wins; the products then go live in the store with the margin added.
 */
export const ProductRequestsPanel: React.FC = () => {
  const side = mySide();
  const source = side === 'store' ? 'outside' : side === 'food' ? 'food' : 'school';
  const me = getCurrentStaff()?.name || '';
  const [list, setList] = useState<any[]>([]);
  const [costs, setCosts] = useState<Record<string, string[]>>({});
  const [cats, setCats] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(true);

  useEffect(() => subscribeSideRequests(side, setList), [side]);
  useEffect(() => {
    const standard = (side === 'inside' ? INSIDE_CATEGORIES : side === 'store' ? OUTSIDE_CATEGORIES : []).map((c) => c.name);
    getCategories().then((l: any[]) => {
      const names = l.map((c) => c.name).filter((n: string) => n !== 'Request');
      setCategories(Array.from(new Set([...standard, ...names])));
    });
  }, [side]);

  const since = Date.now() - 3 * 86400000;
  const shown = list.filter((r) => r.status === 'open' || Date.parse(r.quotedAt || r.createdAt) > since);
  const openCount = shown.filter((r) => r.status === 'open').length;

  const send = async (r: any) => {
    const c = costs[r.id] || [];
    setBusy(r.id);
    try {
      await quoteProductRequest(r.id, r.items.map((_: any, i: number) => Number(c[i]) || 0), cats[r.id] ?? r.category);
    } catch (e: any) {
      window.alert(e?.message || 'Could not send the price.');
    }
    setBusy('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Product requests from students ({openCount})</span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          {shown.length === 0 && <p className="text-xs text-slate-400">No requests right now.</p>}
          {shown.map((r) => {
            if (r.status !== 'open') {
              return (
                <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                  <p className="font-bold">{r.items.map((i: any) => i.name).join(', ')}</p>
                  <p className="text-[11px] text-[#0e9f55] font-semibold">
                    {r.quotedBy?.name === me ? 'You sent the price quote to the customer.' : 'The price quote for this product has been sent to the customer.'}
                  </p>
                </div>
              );
            }
            const c = costs[r.id] || [];
            return (
              <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                <p className="text-[11px] text-slate-500">
                  From {r.name || 'a student'} · {new Date(r.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </p>
                {r.items.map((it: any, i: number) => {
                  const cost = Math.round(Number(c[i]) || 0);
                  const price = cost > 0 ? sellingPrice(cost, source as any) : 0;
                  return (
                    <div key={i} className="p-2 rounded-xl bg-white dark:bg-slate-900 space-y-1.5">
                      <div className="flex items-start gap-2">
                        {it.photoUrl && <img src={it.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-bold">{it.name}</p>
                          <p className="text-[11px] text-slate-500">{it.estimate ? `Student's guess: ${naira(it.estimate)}` : 'No price guess'}</p>
                        </div>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={c[i] || ''}
                        onChange={(e) =>
                          setCosts((p) => {
                            const arr = [...(p[r.id] || [])];
                            arr[i] = e.target.value;
                            return { ...p, [r.id]: arr };
                          })
                        }
                        className={input}
                        placeholder="Your cost price (₦). Leave empty if you don't have it"
                      />
                      {price > 0 && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          Student pays <strong>{naira(price)}</strong> · margin {naira(price - cost)}
                        </p>
                      )}
                    </div>
                  );
                })}
                {r.note && <p className="text-[11px] text-slate-500">Note: {r.note}</p>}
                <select
                  value={cats[r.id] ?? r.category ?? ''}
                  onChange={(e) => setCats((p) => ({ ...p, [r.id]: e.target.value }))}
                  className={input}
                >
                  <option value="">Category for the store</option>
                  {categories.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy === r.id || !c.some((v) => Number(v) > 0)}
                  onClick={() => send(r)}
                  className="w-full py-2 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  Send price to the student
                </button>
                <p className="text-[10px] text-slate-400">The first price sent wins. Priced products are added to the store for everyone.</p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
