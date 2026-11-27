import React, { useEffect, useMemo, useState } from 'react';
import { subscribeAllProductRequests, subscribeOpenRequestCount, dismissProductRequest } from '../api.js';
import { waTo } from '../hub.js';

/** The number of requests still waiting for a price, for the badge on the Requests tab */
export function useWaitingRequestCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => subscribeOpenRequestCount(setN), []);
  return n;
}

const naira = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
const SIDE_NAME: Record<string, string> = { inside: 'School canteen', store: 'Outside store', food: 'Outside food' };
type Status = 'open' | 'quoted' | 'closed' | 'dismissed';
const STATUS_NAME: Record<Status, string> = { open: 'Waiting', quoted: 'Answered', closed: 'Already in store', dismissed: 'Dismissed' };
const statusOf = (r: any): Status =>
  r.status === 'quoted' ? 'quoted' : r.status === 'closed' ? (r.closedReason === 'dismissed' ? 'dismissed' : 'closed') : 'open';

const when = (iso?: string) => {
  const d = new Date(iso || '');
  return Number.isFinite(d.getTime()) ? d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
};

/** The WhatsApp message for a request, written for its status */
const messageFor = (r: any): string => {
  const first = String(r.name || '').trim().split(' ')[0] || 'there';
  const hi = `Hi ${first}, it's Roomly Caritas.`;
  const names = (r.items || []).map((i: any) => i.name).join(', ');
  const s = statusOf(r);
  if (s === 'quoted') {
    const quotes: any[] = Array.isArray(r.quotes) ? r.quotes : [];
    const yes = quotes.filter((q) => q.available).map((q) => `${q.name} is now in the store at ${naira(q.price)}`);
    const no = quotes.filter((q) => !q.available).map((q) => q.name);
    const parts = [] as string[];
    if (yes.length) parts.push(`${yes.join('. ')}. Search for it on Roomly and order.`);
    if (no.length) parts.push(`We could not get ${no.join(', ')} for now. We will tell you if that changes.`);
    return `${hi} We have an answer to your request. ${parts.join(' ')}`;
  }
  if (s === 'closed') return `${hi} ${names} is already in the store. Search for it on Roomly and order.`;
  return `${hi} We are still checking on ${names}. We will message you as soon as we have a price.`;
};

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer whitespace-nowrap ${on ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`;

/** Admin > Requests: every product request students have sent, past and current, answered and not */
export const AdminRequests: React.FC = () => {
  const [list, setList] = useState<any[] | null>(null);
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [side, setSide] = useState<string>('all');
  const [q, setQ] = useState('');
  useEffect(() => subscribeAllProductRequests(setList), []);

  const everything = list || [];
  // Dismissed requests stay out of the main lists; they sit under their own chip
  const all = status === 'dismissed' ? everything : everything.filter((r) => statusOf(r) !== 'dismissed');
  const count = (s: Status) => everything.filter((r) => statusOf(r) === s).length;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== 'all' && statusOf(r) !== status) return false;
      if (side !== 'all' && r.side !== side) return false;
      if (!term) return true;
      const hay = `${r.name || ''} ${r.phone || ''} ${(r.items || []).map((i: any) => i.name).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
  }, [all, status, side, q]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">Product requests</h3>
        <p className="text-[11px] text-slate-500">Everything students have asked for, newest first. The latest 300 show here.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setStatus('all')} className={chip(status === 'all')}>
          All {everything.length - count('dismissed')}
        </button>
        {(['open', 'quoted', 'closed', 'dismissed'] as Status[]).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)}>
            {STATUS_NAME[s]} {count(s)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setSide('all')} className={chip(side === 'all')}>
          Every section
        </button>
        {Object.keys(SIDE_NAME).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)} className={chip(side === s)}>
            {SIDE_NAME[s]}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a product, name or number"
        className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
      />
      {list === null && <p className="text-xs text-slate-400">Loading...</p>}
      {list !== null && shown.length === 0 && <p className="text-xs text-slate-400">No requests match.</p>}
      {shown.map((r) => {
        const s = statusOf(r);
        const quotes: any[] = Array.isArray(r.quotes) ? r.quotes : [];
        return (
          <div key={r.id} className={`p-3 rounded-2xl text-xs space-y-2 ${s === 'open' ? 'bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{r.name || 'No name'}</p>
                <p className="text-[11px] text-slate-500">
                  {when(r.createdAt)} · {SIDE_NAME[r.side] || r.side}
                  {r.movedBy ? ` · moved by ${r.movedBy}` : ''}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  s === 'open' ? 'bg-amber-200 text-amber-900' : s === 'quoted' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {STATUS_NAME[s]}
              </span>
            </div>
            <ul className="space-y-0.5">
              {(r.items || []).map((it: any, i: number) => {
                const quote = quotes[i];
                return (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">{it.name}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {quote ? (quote.available ? `Price ${naira(quote.price)}` : 'Not available') : it.estimate ? `Student's guess ${naira(it.estimate)}` : 'No price guess'}
                    </span>
                  </li>
                );
              })}
            </ul>
            {r.note && <p className="text-[11px] text-slate-500">Note: {r.note}</p>}
            {s === 'quoted' && (
              <p className="text-[11px] text-slate-500">
                Answered by {r.quotedBy?.name || 'staff'} · {when(r.quotedAt)}
                {r.reply ? ` · "${r.reply}"` : ''}
              </p>
            )}
            {s === 'closed' && <p className="text-[11px] text-slate-500">Closed by {r.closedBy || 'staff'}: already in the store.</p>}
            {s === 'dismissed' && <p className="text-[11px] text-slate-500">Dismissed by {r.closedBy || 'admin'} · {when(r.closedAt)}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {r.phone ? (
                <>
                  <a href={waTo(r.phone, messageFor(r))} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold">
                    WhatsApp
                  </a>
                  <a href={`tel:${r.phone}`} className="text-[11px] font-semibold text-[#0e9f55] underline">
                    {r.phone}
                  </a>
                </>
              ) : (
                <span className="text-[11px] text-slate-400">No number left</span>
              )}
              {s !== 'dismissed' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Remove this request? It leaves the list and the student is not told.')) return;
                    try {
                      await dismissProductRequest(r.id);
                    } catch (e: any) {
                      window.alert(e?.message || 'Could not dismiss. Try again.');
                    }
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
