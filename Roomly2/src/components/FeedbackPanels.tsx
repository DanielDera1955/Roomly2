import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { subscribeMyRatings, subscribeAllRatings, subscribeFeedbackMessages, setFeedbackStatus } from '../api.js';

const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const avg = (list: any[]) => (list.length ? list.reduce((t, r) => t + (r.score || 0), 0) / list.length : 0);
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** How often each complaint came up, most common first (All good left out) */
function reasonCounts(list: any[]) {
  const m: Record<string, number> = {};
  list.forEach((r) => (r.reasons || []).forEach((x: string) => x !== 'All good' && (m[x] = (m[x] || 0) + 1)));
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

const Stars: React.FC<{ n: number }> = ({ n }) => (
  <span className="inline-flex">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(n) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
    ))}
  </span>
);

const RatingRow: React.FC<{ r: any; showWho?: boolean }> = ({ r, showWho }) => (
  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 min-w-0">
        <Stars n={r.score} />
        {showWho && <span className="font-bold truncate">{r.providerName || 'Unknown'}</span>}
      </span>
      <span className="text-[10px] text-slate-400 shrink-0">{when(r.createdAt)}</span>
    </div>
    {(r.reasons || []).length > 0 && <p className="text-[11px] text-slate-600 dark:text-slate-300">{r.reasons.join(' · ')}</p>}
    {r.comment && <p className="text-[11px] italic text-slate-600 dark:text-slate-300">"{r.comment}"</p>}
    {showWho && (
      <p className="text-[10px] text-slate-400">
        {r.customer || 'Student'} · {r.cart === 'store' ? 'Outside store' : r.cart === 'food' ? 'Outside food' : 'Inside'} · {r.orderId}
      </p>
    )}
  </div>
);

/** Runners and operators: their own ratings and what students say */
export const MyRatingsPanel: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeMyRatings(setList), []);
  const counts = reasonCounts(list);
  const recent = list.slice(0, 30);

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">My ratings ({list.length})</span>
        <span className="flex items-center gap-1.5 text-xs font-bold">
          {list.length > 0 && (
            <>
              <Stars n={avg(list)} /> {avg(list).toFixed(1)}
            </>
          )}
          <span className="text-[#0e9f55] ml-1">{open ? 'Hide' : 'Show'}</span>
        </span>
      </button>
      {open && (
        <>
          {list.length === 0 ? (
            <p className="text-xs text-slate-400">No ratings yet. Students rate each delivery after it arrives.</p>
          ) : (
            <>
              {counts.length > 0 && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  What to improve: {counts.map(([k, n]) => `${k} (${n})`).join(', ')}
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Keep your score up. Falling below Roomly's level again and again means being replaced, no matter who you are.
              </p>
              <div className="space-y-1.5">
                {recent.map((r) => (
                  <RatingRow key={r.id} r={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

/** Admin: every rating, per runner / operator, with the most common complaints */
/** Admin: messages from the feedback box, new first */
const FeedbackMessages: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => subscribeFeedbackMessages(setList), []);
  const fresh = list.filter((m) => m.status !== 'done');
  const shown = showDone ? list : fresh;
  const wa = (phone: string) => `https://wa.me/234${String(phone).replace(/^0/, '')}?text=${encodeURIComponent('Hi, this is Roomly about your message: ')}`;
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Messages ({fresh.length} new)</p>
        <button type="button" onClick={() => setShowDone(!showDone)} className="text-[11px] font-bold text-[#0e9f55] cursor-pointer">
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      </div>
      {shown.length === 0 && <p className="text-xs text-slate-400">No messages{showDone ? '' : ' waiting'}.</p>}
      {shown.map((m) => (
        <div key={m.id} className={`p-3 rounded-xl text-xs space-y-1.5 ${m.status === 'done' ? 'bg-slate-50 dark:bg-slate-800/40 opacity-70' : m.type === 'Complaint' || m.type === 'Problem with an order' ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-900 dark:text-white">{m.type}</span>
            <span className="text-[10px] text-slate-400">{new Date(m.atMs).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-line">{m.message}</p>
          <p className="text-[11px] text-slate-500">
            {m.name || (m.phone ? 'Not signed in' : 'Anonymous')}
            {m.phone ? ` · ${m.phone}` : ''}
            {m.hostel ? ` · ${m.hostel}` : ''}
            {m.ordersCount ? ` · ${m.ordersCount} order${m.ordersCount === 1 ? '' : 's'}` : m.name ? ' · no orders yet' : ''}
            {m.lastOrderId ? ` · last order ${m.lastOrderId}` : ''}
          </p>
          <div className="flex gap-2 pt-1">
            {m.phone && (
              <a href={wa(m.phone)} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold">
                Reply on WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => setFeedbackStatus(m.id, m.status === 'done' ? 'new' : 'done')}
              className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-[11px] font-bold cursor-pointer"
            >
              {m.status === 'done' ? 'Mark as new' : 'Mark done'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export const AdminFeedbackPanel: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [who, setWho] = useState('');
  useEffect(() => subscribeAllRatings(setList), []);

  const people = useMemo(() => {
    const m: Record<string, { key: string; name: string; list: any[] }> = {};
    list.forEach((r) => {
      const k = r.providerKey || 'unknown';
      if (!m[k]) m[k] = { key: k, name: r.providerName || 'Unknown', list: [] };
      m[k].list.push(r);
    });
    return Object.values(m).sort((a, b) => avg(a.list) - avg(b.list)); // lowest score first
  }, [list]);

  const shown = who ? list.filter((r) => (r.providerKey || 'unknown') === who) : list;
  const counts = reasonCounts(shown);

  return (
    <div className="space-y-4">
      <FeedbackMessages />
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Feedback from students</p>
          {list.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <Stars n={avg(list)} /> {avg(list).toFixed(1)} · {list.length}
            </span>
          )}
        </div>
        {list.length === 0 && <p className="text-xs text-slate-400">No ratings yet.</p>}
        {people.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-500">By runner and operator (lowest first). Tap one to filter.</p>
            {people.map((p) => {
              const c = reasonCounts(p.list)[0];
              const on = who === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setWho(on ? '' : p.key)}
                  className={`w-full p-2.5 rounded-xl text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                    on ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-[#0e9f55]' : 'bg-slate-50 dark:bg-slate-800/60'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-bold truncate">{p.name}</span>
                    <span className="block text-[10px] text-slate-500">{c ? `Most common: ${c[0]} (${c[1]})` : 'No complaints'}</span>
                  </span>
                  <span className={`shrink-0 font-extrabold ${avg(p.list) < 3 ? 'text-rose-600' : avg(p.list) < 4 ? 'text-amber-600' : 'text-[#0e9f55]'}`}>
                    {avg(p.list).toFixed(1)} <span className="font-normal text-slate-400">({p.list.length})</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {shown.length > 0 && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">{who ? 'Their ratings' : 'Latest ratings'}</p>
            {who && (
              <button type="button" onClick={() => setWho('')} className="text-xs font-bold text-[#0e9f55] cursor-pointer">
                Show everyone
              </button>
            )}
          </div>
          {counts.length > 0 && <p className="text-[11px] text-slate-600 dark:text-slate-300">Complaints: {counts.map(([k, n]) => `${k} (${n})`).join(', ')}</p>}
          <div className="space-y-1.5">
            {shown.slice(0, 100).map((r) => (
              <RatingRow key={r.id} r={r} showWho={!who} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
