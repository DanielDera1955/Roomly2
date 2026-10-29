import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { getActivityPage } from '../api.js';

/**
 * Admin: who did what and when (operators, runners and the admin), newest first.
 * Loads 50 at a time. Filters work on what is loaded; "Show more" loads older entries.
 */
const TYPES: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'price', label: 'Prices' },
  { id: 'order', label: 'Orders' },
  { id: 'money', label: 'Money' },
  { id: 'product', label: 'Products' },
  { id: 'stock', label: 'On / off' },
  { id: 'days', label: 'Days' },
  { id: 'request', label: 'Requests' },
  { id: 'staff', label: 'Staff' },
];
const ROLE_LABEL: Record<string, string> = { store: 'Store', food: 'Food', runner: 'Runner', admin: 'Admin' };
const ROLE_STYLE: Record<string, string> = {
  store: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
  food: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200',
  runner: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  admin: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
};

const when = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

export const ActivityLog: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [person, setPerson] = useState('all');

  const load = async (older = false) => {
    setLoading(true);
    setError('');
    try {
      const before = older && entries.length ? entries[entries.length - 1].atMs : 0;
      const page = await getActivityPage(before, 50);
      setEntries((cur) => (older ? [...cur, ...page] : page));
      setMore(page.length === 50);
    } catch (e: any) {
      setError('Could not load the activity log. If this is the first time, publish the latest firestore.rules in Firebase.');
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const people = useMemo(() => Array.from(new Set(entries.map((e) => e.who).filter(Boolean))).sort(), [entries]);
  const shown = entries.filter((e) => (type === 'all' || e.type === type) && (person === 'all' || e.who === person));

  const chip = (on: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
      on ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Activity log</h3>
        <button type="button" onClick={() => load()} className="flex items-center gap-1 text-xs font-bold text-[#0e9f55] cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Every price change, order step, payment and switch by your operators, runners and you. Nobody can edit or delete these entries.
      </p>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {TYPES.map((t) => (
          <button key={t.id} type="button" onClick={() => setType(t.id)} className={chip(type === t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <select
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
      >
        <option value="all">Everyone</option>
        {people.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {!loading && !error && shown.length === 0 && <p className="text-xs text-slate-400">Nothing here yet.</p>}

      <div className="space-y-1.5">
        {shown.map((e) => (
          <div key={e.id} className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <strong className="truncate text-slate-900 dark:text-white">{e.who}</strong>
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${ROLE_STYLE[e.role] || ROLE_STYLE.admin}`}>
                  {ROLE_LABEL[e.role] || e.role}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">{when(e.at)}</span>
            </div>
            <p className="mt-1 text-slate-700 dark:text-slate-300 leading-snug">{e.text}</p>
          </div>
        ))}
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
        </p>
      )}
      {!loading && more && entries.length > 0 && (
        <button
          type="button"
          onClick={() => load(true)}
          className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
        >
          Show more
        </button>
      )}
    </div>
  );
};
