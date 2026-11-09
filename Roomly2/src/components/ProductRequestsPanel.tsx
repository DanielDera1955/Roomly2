import React, { useEffect, useState } from 'react';
import { subscribeSideRequests, quoteProductRequest, mySide, getCategories, getCurrentStaff, moveProductRequest, closeProductRequestListed } from '../api.js';
import { sellingPrice, categoriesForStore, requestReplyInfo, arrivalText, minsLeftText } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

/**
 * Runners (inside) and operators (store / food): students' requests for products not in the store.
 * The first to send a price wins; the products then go live in the store with the margin added.
 */
const SIDE_NAME: Record<string, string> = { inside: 'Inside runners', store: 'Outside store', food: 'Outside food' };

export const ProductRequestsPanel: React.FC<{ side?: 'inside' | 'store' | 'food' }> = ({ side: forSide }) => {
  const isAdmin = getCurrentStaff()?.role === 'admin';
  const side = forSide || mySide();
  const source = side === 'store' ? 'outside' : side === 'food' ? 'food' : 'school';
  const me = getCurrentStaff()?.name || '';
  const [list, setList] = useState<any[]>([]);
  const [costs, setCosts] = useState<Record<string, string[]>>({});
  const [cats, setCats] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  // Ticks so the "Reply by" countdowns stay current
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(true);

  useEffect(() => subscribeSideRequests(side, setList), [side]);
  useEffect(() => {
    // Only this store's categories (Inside, Outside Store, or Outside Food)
    getCategories().then((l: any[]) => setCategories(categoriesForStore(l, side).map((c: any) => c.name)));
  }, [side]);

  // Only requests still waiting for a price. Once any store answers, it disappears for everyone
  // (the admin sees who answered, and the price, in the Activity log).
  const shown = list.filter((r) => r.status === 'open');
  const openCount = shown.filter((r) => r.status === 'open').length;

  // Not this side's product: send it where it belongs, or close it when it's already in the store
  const moveTo = async (r: any, to: 'inside' | 'store' | 'food') => {
    if (!window.confirm(`Send this request to ${SIDE_NAME[to]}? The student sees it has moved and waits for their price there.`)) return;
    setBusy(r.id);
    try {
      await moveProductRequest(r.id, to);
    } catch (e: any) {
      window.alert(e?.message || 'Could not move the request.');
    }
    setBusy('');
  };
  const closeListed = async (r: any) => {
    if (!window.confirm('Close this request because the product is already in the store? The student is told to search for it.')) return;
    setBusy(r.id);
    try {
      await closeProductRequestListed(r.id);
    } catch (e: any) {
      window.alert(e?.message || 'Could not close the request.');
    }
    setBusy('');
  };

  const send = async (r: any) => {
    const c = costs[r.id] || [];
    if (!c.some((v) => Number(v) > 0) && !window.confirm("Tell the student this is not available? Their request closes and the item leaves their cart.")) return;
    setBusy(r.id);
    try {
      await quoteProductRequest(r.id, r.items.map((_: any, i: number) => Number(c[i]) || 0), cats[r.id] ?? r.category, replies[r.id] || '');
    } catch (e: any) {
      window.alert(e?.message || 'Could not send the price.');
    }
    setBusy('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">
          {isAdmin ? `${SIDE_NAME[side]}: product requests (${openCount})` : `Product requests from students (${openCount})`}
        </span>
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
                    You sent the price quote to the customer.
                  </p>
                </div>
              );
            }
            const c = costs[r.id] || [];
            return (
              <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                <p className="text-[11px] text-slate-500">
                  From {r.name || 'a student'} · {new Date(r.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {r.movedBy ? ` · moved here from ${SIDE_NAME[r.movedFrom] || 'another side'} by ${r.movedBy}` : ''}
                </p>
                <ReplyBy r={r} now={now} />
                {/* Only the admin sees the student's number; providers get it once there is a paid order */}
                {isAdmin && (
                  <p className="text-[11px] font-semibold">
                    {r.phone ? (
                      <>
                        Student: {r.name || 'no name'} ·{' '}
                        <a href={`tel:${r.phone}`} className="text-[#0e9f55] underline">
                          {r.phone}
                        </a>
                      </>
                    ) : (
                      <span className="text-slate-400">The student didn't leave a number</span>
                    )}
                  </p>
                )}
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
                  <option value="">No category (shows under All)</option>
                  {categories.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <textarea
                  value={replies[r.id] || ''}
                  onChange={(e) => setReplies((p) => ({ ...p, [r.id]: e.target.value.slice(0, 140) }))}
                  rows={2}
                  className={input}
                  placeholder="Message to the student (optional)"
                />
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => send(r)}
                  className={`w-full py-2 rounded-lg text-white font-bold disabled:opacity-40 cursor-pointer ${c.some((v) => Number(v) > 0) ? 'bg-[#0e9f55]' : 'bg-slate-500'}`}
                >
                  {c.some((v) => Number(v) > 0) ? 'Send price to the student' : "Tell the student it's not available"}
                </button>
                <p className="text-[10px] text-slate-400">The first price sent wins. Priced products are added to the store for everyone.</p>
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-500">Not yours?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['inside', 'store', 'food'] as const)
                      .filter((x) => x !== side)
                      .map((x) => (
                        <button
                          key={x}
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => moveTo(r, x)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                        >
                          Move to {SIDE_NAME[x].toLowerCase()}
                        </button>
                      ))}
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => closeListed(r)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Already in the store
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

/** "Reply by 4:30pm · 42 min left": red in the last 10 minutes and once it has passed */
function ReplyBy({ r, now }: { r: any; now: Date }) {
  const { replyBy, closeAt, late } = requestReplyInfo(r.side, r.movedAt || r.createdAt || now);
  const target = late ? closeAt : replyBy;
  const left = target.getTime() - now.getTime();
  const urgent = left <= 10 * 60000;
  const text =
    left > 0
      ? `Reply by ${arrivalText(target.getTime(), now)} · ${minsLeftText(target, now)} left${late ? ' (sent late)' : ''}`
      : `Reply overdue (was due ${arrivalText(target.getTime(), now)})`;
  return <p className={`text-[11px] font-bold ${urgent ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>{text}</p>;
}
