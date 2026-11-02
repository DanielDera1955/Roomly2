import React, { useEffect, useMemo, useState } from 'react';
import { subscribeRunnerApplications, setRunnerApplicationStatus } from '../api.js';

/**
 * Admin > Applications: students who applied on the "Become a Roomly Runner" page (yourlink/#join).
 * Newest first. Message the applicant on WhatsApp, then move them along: New, Contacted, Accepted, Rejected.
 */

const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
type Status = 'new' | 'contacted' | 'accepted' | 'rejected';
const LABEL: Record<Status, string> = { new: 'New', contacted: 'Contacted', accepted: 'Accepted', rejected: 'Rejected' };
const TONE: Record<Status, string> = {
  new: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  contacted: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  accepted: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};
const when = (ms: number) => new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const waNumber = (phone: string) => (phone.startsWith('0') ? '234' + phone.slice(1) : phone);

/** Count of new applications, for the badge on the admin tab */
export function useNewApplicationCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => subscribeRunnerApplications((list: any[]) => setN(list.filter((a) => (a.status || 'new') === 'new').length)), []);
  return n;
}

const AppCard: React.FC<{ a: any }> = ({ a }) => {
  const [note, setNote] = useState(a.note || '');
  const [busy, setBusy] = useState(false);
  const status: Status = a.status || 'new';
  const first = String(a.name || '').split(' ')[0] || '';
  const greeting = encodeURIComponent(`Hi ${first}, this is Daniel from Roomly. Thanks for applying to be a Roomly runner.`);

  const move = async (s: Status) => {
    setBusy(true);
    try {
      await setRunnerApplicationStatus(a.id, s, note);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not update. Try again.');
    }
    setBusy(false);
  };

  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold truncate">{a.name}</p>
          <p className="text-slate-500">
            {a.hostel} · {a.level === 'Other' ? 'Other level' : `${a.level} level`} · {a.phone}
          </p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${TONE[status]}`}>{LABEL[status]}</span>
      </div>
      <p>
        <span className="font-bold">Can usually do:</span> {(a.batches || []).join(', ')}
      </p>
      {a.message && <p className="p-2 rounded-xl bg-white dark:bg-slate-900 whitespace-pre-wrap">{a.message}</p>}
      <p className="text-[10px] text-slate-400">Applied {when(a.atMs)}</p>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Private note (e.g. vouched for by Divine, sent ID)"
        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      />

      <div className="flex flex-wrap gap-1.5">
        <a
          href={`https://wa.me/${waNumber(a.phone)}?text=${greeting}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => status === 'new' && move('contacted')}
          className="px-3 py-1.5 rounded-xl bg-[#0e9f55] text-white font-bold"
        >
          WhatsApp
        </a>
        {(['contacted', 'accepted', 'rejected'] as Status[])
          .filter((s) => s !== status)
          .map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => move(s)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer disabled:opacity-50"
            >
              {LABEL[s]}
            </button>
          ))}
        {note !== (a.note || '') && (
          <button type="button" disabled={busy} onClick={() => move(status)} className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
            Save note
          </button>
        )}
      </div>
    </div>
  );
};

export const AdminRunnerApplications: React.FC = () => {
  const [list, setList] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('new');
  useEffect(() => subscribeRunnerApplications(setList), []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, new: 0, contacted: 0, accepted: 0, rejected: 0 };
    (list || []).forEach((a) => {
      c.all++;
      c[a.status || 'new']++;
    });
    return c;
  }, [list]);
  const shown = (list || []).filter((a) => filter === 'all' || (a.status || 'new') === filter);
  const tabs: (Status | 'all')[] = ['new', 'contacted', 'accepted', 'rejected', 'all'];

  return (
    <div className={card}>
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Runner applications</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          From the Become a Roomly Runner page. Before creating a runner login, get their room number and a photo of their student ID.
        </p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
              filter === k ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {k === 'all' ? 'All' : LABEL[k]} ({counts[k] || 0})
          </button>
        ))}
      </div>
      {list === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => (
            <AppCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
};
