import React, { useEffect, useState } from 'react';
import { Loader2, Bell } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none';
const h = 'text-xs font-black uppercase tracking-wider text-slate-500';

type Alert = { on: boolean; hour?: number; min?: number; title: string; body: string };
// Defaults must match api/_push.js
const DEFAULTS: Record<string, Alert & { label: string; hint: string; timed: boolean }> = {
  lunch: { label: 'Lunch closes soon', hint: 'Every day except Monday', timed: true, on: true, hour: 11, min: 30, title: 'Lunch closes in 1 hour', body: 'Order before 12:30pm and it reaches the school gate before 1:30pm.' },
  dinner: { label: 'Dinner closes soon', hint: 'Every day except Sunday', timed: true, on: true, hour: 17, min: 0, title: 'Dinner closes in 1 hour', body: 'Order before 6:00pm and it reaches the school gate before 7:00pm.' },
  room: { label: 'Room delivery closes soon', hint: 'Every day', timed: true, on: true, hour: 19, min: 50, title: 'Room delivery closes in 1 hour', body: 'Order before 8:50pm and it reaches your room before 9:30pm.' },
  credit: { label: 'Credit ready', hint: 'To the top 3 when credits are issued, right after the week closes. You can use {game} and {value}.', timed: false, on: true, title: 'Your {value} {game} credit is ready', body: 'Open your credits to see when it opens. Once open it lasts 24 hours, so order food and use it.' },
  rewardStart: { label: 'Reward week started', hint: 'To players registered for that game, once the week has started (it starts at 12:00AM). {game} {value}', timed: false, on: true, title: 'The {game} reward week has started', body: 'The top 3 players win {value} food credit each. Play your matches now.' },
  rewardEnd: { label: 'Reward week ends tonight', hint: 'To registered players, the morning of the last day. {game} {rank} {pts} {need}', timed: false, on: true, title: '{game} reward week ends tonight', body: 'You are #{rank} with {pts} points. The top 3 need at least {need} points to win.' },
};
const pad = (n: number) => String(n).padStart(2, '0');

async function call(body: any) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/push-broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const AdminAlerts: React.FC = () => {
  const [vals, setVals] = useState<Record<string, Alert> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');

  const loadStats = () => call({ action: 'stats' }).then(setStats).catch((e) => setNote(e.message));
  useEffect(() => {
    getDoc(doc(db, 'settings', 'alerts')).then((s) => {
      const saved: any = s.data() || {};
      const out: Record<string, Alert> = {};
      Object.keys(DEFAULTS).forEach((k) => {
        const { label, hint, timed, ...d } = DEFAULTS[k];
        out[k] = { ...d, ...(saved[k] || {}) };
      });
      setVals(out);
    });
    loadStats();
  }, []);

  if (!vals) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  const set = (k: string, patch: Partial<Alert>) => setVals({ ...vals, [k]: { ...vals[k], ...patch } });

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await setDoc(doc(db, 'settings', 'alerts'), vals);
      setMsg('Saved. New wording and times apply from the next run.');
    } catch (e: any) {
      setMsg(e?.message || 'Could not save.');
    }
    setSaving(false);
  };

  const send = async () => {
    if (!window.confirm(`Send this to ${stats?.subscribers ?? 'all'} phones now?\n\n${title}\n${body}`)) return;
    setSending(true);
    setNote('');
    try {
      const r = await call({ action: 'send', title, body });
      setNote(`Sent to ${r.sent} of ${r.total} phones.`);
      setTitle('');
      setBody('');
      loadStats();
    } catch (e: any) {
      setNote(e?.message || 'Could not send.');
    }
    setSending(false);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={h}>Send a message to everyone</p>
        <p className="text-xs text-slate-500">
          {stats ? `${stats.subscribers} phones have alerts on. ` : ''}
          {stats ? `${stats.broadcastsToday} of ${stats.max} messages used today.` : ''} Keep it rare: too many and people switch alerts off.
        </p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={input} placeholder="Title, e.g. Jollof is back today" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={160} rows={2} className={input} placeholder="Message (up to 160 letters)" />
        <button type="button" disabled={sending || !title.trim() || !body.trim()} onClick={send} className="px-4 py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />} Send to everyone
        </button>
        {note && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{note}</p>}
      </div>

      <div className={card}>
        <p className={h}>Automatic alerts</p>
        <p className="text-xs text-slate-500">Switch each one on or off, and change its time and wording. Batch times round to the scheduler's 10 minute steps.</p>
        <div className="space-y-4">
          {Object.keys(DEFAULTS).map((k) => {
            const d = DEFAULTS[k];
            const v = vals[k];
            return (
              <div key={k} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{d.label}</p>
                    <p className="text-[11px] text-slate-500">{d.hint}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0">
                    <input type="checkbox" checked={v.on !== false} onChange={(e) => set(k, { on: e.target.checked })} className="h-4 w-4 accent-[#0e9f55]" /> {v.on !== false ? 'On' : 'Off'}
                  </label>
                </div>
                {d.timed && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Send at</span>
                    <input
                      type="time"
                      value={`${pad(Number(v.hour))}:${pad(Number(v.min))}`}
                      onChange={(e) => {
                        const [hh, mm] = e.target.value.split(':').map(Number);
                        if (!Number.isNaN(hh)) set(k, { hour: hh, min: mm || 0 });
                      }}
                      className={`${input} !w-32`}
                    />
                  </div>
                )}
                <input value={v.title} onChange={(e) => set(k, { title: e.target.value })} maxLength={60} className={input} />
                <textarea value={v.body} onChange={(e) => set(k, { body: e.target.value })} maxLength={160} rows={2} className={input} />
              </div>
            );
          })}
        </div>
        <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-50">
          {saving ? 'Saving...' : 'Save alerts'}
        </button>
        {msg && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{msg}</p>}
      </div>

      <div className={card}>
        <p className={h}>Sent today</p>
        {stats && stats.today.length ? (
          <ul className="space-y-1.5">
            {stats.today
              .sort((a: any, b: any) => b.atMs - a.atMs)
              .map((t: any, i: number) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-200">
                  <b>{t.title || t.kind}</b>: {t.sent ?? 0} of {t.total ?? 0} phones
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Nothing sent yet today.</p>
        )}
      </div>
    </div>
  );
};
