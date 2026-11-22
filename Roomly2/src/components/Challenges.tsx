import React, { useMemo, useState } from 'react';
import { Loader2, Trophy, Clock, Users } from 'lucide-react';
import { gameLabel } from '../hub.js';
import { type Season } from '../season';
import {
  type ChallengeView,
  settingsLine,
  canApply,
  activeEntryFor,
  pickableDays,
  applyChallenge,
  rescheduleApp,
  withdrawApp,
  lagosDayStart,
} from '../challenges';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const whenFull = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayName = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** The description editor's output: **bold**, lines starting with "- " as a list, line breaks kept. No HTML is ever inserted. */
export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const bold = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={`${k}${i}`} className="font-black">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={`${k}${i}`}>{part}</React.Fragment>
      )
    );
  const lines = String(text || '').split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul${k}`} className="list-disc pl-5 space-y-0.5">
          {list.map((l, i) => (
            <li key={i}>{bold(l, `li${k}-${i}`)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((ln, i) => {
    if (/^\s*-\s+/.test(ln)) list.push(ln.replace(/^\s*-\s+/, ''));
    else {
      flush(i);
      out.push(ln.trim() ? <p key={`p${i}`}>{bold(ln, `p${i}`)}</p> : <div key={`b${i}`} className="h-1" />);
    }
  });
  flush(lines.length);
  return <div className={`space-y-1 ${className}`}>{out}</div>;
};

const PHASE_LABEL: Record<string, { text: string; cls: string }> = {
  upcoming: { text: 'Opens soon', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  running: { text: 'Open', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  closed: { text: 'Winner found, under review', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  ended: { text: 'Ended', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  paused: { text: 'Paused', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  cancelled: { text: 'Cancelled', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  over: { text: 'Time is up', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

const STATE_TEXT: Record<string, string> = {
  notstarted: 'Your count has not started yet.',
  playing: 'In progress. Log your wins the normal way.',
  waiting: 'You reached the target. Waiting for your opponents to confirm.',
  finished: 'You reached the target. Roomly is checking your matches.',
  out: 'You can no longer reach the target in this challenge.',
  over: 'Your time ran out before you reached the target.',
};

const ChallengeCard: React.FC<{
  view: ChallengeView;
  all: ChallengeView[];
  me: any;
  member: boolean;
  isOpen: boolean;
  nowMs: number;
  onJoin: () => void;
}> = ({ view, all, me, member, isOpen, nowMs, onJoin }) => {
  const c = view.challenge;
  const mine = me ? view.entries.find((e) => e.app.gid === me.id) || null : null;
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const days = useMemo(() => pickableDays(c, nowMs), [c.id, c.startMs, c.endMs, Math.floor(nowMs / 3600000)]);
  const label = PHASE_LABEL[view.phase] || PHASE_LABEL.running;
  const others = view.entries.filter((e) => !me || e.app.gid !== me.id);
  const spotsLeft = c.spots > 0 ? Math.max(0, c.spots - view.entries.length) : null;
  const apply = async () => {
    setErr('');
    setBusy(true);
    try {
      await applyChallenge(view, all, me, c.dayMode === 'pick' ? day : 0);
      setPicking(false);
    } catch (e: any) {
      setErr(e?.message || 'Could not apply.');
    }
    setBusy(false);
  };
  const reschedule = async () => {
    if (!mine || !day) return;
    setErr('');
    setBusy(true);
    try {
      await rescheduleApp(mine.app, day);
      setPicking(false);
    } catch (e: any) {
      setErr(e?.message || 'Could not change the day.');
    }
    setBusy(false);
  };
  const withdraw = async () => {
    if (!mine || !window.confirm('Withdraw from this challenge?')) return;
    try {
      await withdrawApp(mine.app);
    } catch (e: any) {
      setErr(e?.message || 'Could not withdraw.');
    }
  };
  const started = mine ? nowMs >= Number(mine.progress.from) : false;
  const canReschedule = Boolean(mine && c.dayMode === 'pick' && !mine.app.rescheduled && !started);
  const clash = me ? activeEntryFor(all, me.id, c.game) : null;
  const blocked = clash && clash.challenge.id !== c.id ? clash.challenge.title : '';

  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#0e9f55] flex items-center gap-1">
            <Trophy className="w-3 h-3" /> Challenge
          </span>
          <p className="text-base font-black text-slate-900 dark:text-white leading-snug">{c.title}</p>
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black ${label.cls}`}>{label.text}</span>
      </div>

      <div className="text-xs text-slate-600 dark:text-slate-300">
        <RichText text={c.desc} />
      </div>
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{settingsLine(c)}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950">
          <p className="text-[10px] text-slate-500">Prize</p>
          <p className="text-sm font-black text-[#0e9f55]">{naira(c.prize)}</p>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950">
          <p className="text-[10px] text-slate-500">{spotsLeft === null ? 'Players in' : 'Spots left'}</p>
          <p className="text-sm font-black text-slate-900 dark:text-white">{spotsLeft === null ? view.entries.length : spotsLeft}</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {c.dayMode === 'fixed' && c.fixedDayMs ? `Everyone plays on ${dayName(lagosDayStart(c.fixedDayMs))}` : `${whenFull(c.startMs)} to ${whenFull(c.endMs)}`}
      </p>

      {view.phase === 'ended' && c.winner && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
          <p className="text-sm font-black text-slate-900 dark:text-white">{c.winner.names} won this challenge</p>
          <p className="text-[11px] text-slate-500">The prize is food credit issued by Roomly.</p>
        </div>
      )}

      {mine && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
          <p className="text-xs font-black text-slate-900 dark:text-white">My application</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            {c.dayMode === 'pick' && mine.app.dayMs ? `Your day: ${dayName(mine.app.dayMs)}. ` : ''}
            {mine.app.review === 'rejected' ? 'Roomly could not approve this attempt.' : mine.app.review === 'approved' ? 'Approved. Roomly issues the credit.' : STATE_TEXT[mine.progress.state]}
          </p>
          {mine.progress.rows.length > 0 && (
            <ul className="space-y-1">
              {mine.progress.rows.map((r, i) => (
                <li key={r.id} className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200">
                  <span>
                    Match {i + 1}: {r.oppName}
                  </span>
                  <span className="font-bold">
                    {r.result} {r.score}
                    {r.recorded ? '' : ' (waiting)'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] font-bold text-slate-500">
            {mine.progress.wins} of {c.winsReq} wins
          </p>
          <div className="flex gap-2">
            {canReschedule && (
              <button type="button" onClick={() => setPicking((x) => !x)} className="px-3 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer">
                Change my day (once)
              </button>
            )}
            {!started && (
              <button type="button" onClick={withdraw} className="px-3 h-8 rounded-lg text-[11px] font-bold text-rose-600 cursor-pointer">
                Withdraw
              </button>
            )}
          </div>
          {picking && canReschedule && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <button key={d} type="button" onClick={() => setDay(d)} className={`px-2.5 h-8 rounded-lg text-[11px] font-bold cursor-pointer ${day === d ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}>
                    {dayName(d)}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!day || busy} onClick={reschedule} className="w-full h-9 rounded-xl bg-[#0e9f55] text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
                Save the new day
              </button>
            </div>
          )}
        </div>
      )}

      {!mine && canApply(view, nowMs) && (
        <div className="space-y-2">
          {blocked && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">You are already in "{blocked}". Finish it before joining another {gameLabel(c.game)} challenge.</p>}
          {picking && c.dayMode === 'pick' && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Pick your day. Your count starts that day.</p>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <button key={d} type="button" onClick={() => setDay(d)} className={`px-2.5 h-8 rounded-lg text-[11px] font-bold cursor-pointer ${day === d ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                    {dayName(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={busy || Boolean(blocked) || (picking && c.dayMode === 'pick' && !day)}
            onClick={() => {
              if (!me || !member) return onJoin();
              if (c.dayMode === 'pick' && !picking) return setPicking(true);
              apply();
            }}
            className="w-full h-11 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {!me || !member ? `Join ${gameLabel(c.game)} to apply` : !isOpen ? 'Applications open when the league starts' : c.dayMode === 'pick' && !picking ? 'Apply and pick my day' : 'Confirm my application'}
          </button>
        </div>
      )}
      {!mine && !canApply(view, nowMs) && ['running', 'upcoming'].includes(view.phase) && <p className="text-[11px] font-semibold text-slate-500">No spots left.</p>}
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}

      {others.length > 0 && (
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
          <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Trying: {others.map((e) => e.app.name).join(', ')}</span>
        </p>
      )}
    </div>
  );
};

/** The Challenges tab content for one game: every challenge that is open or recently ended, with Apply and My application */
export const ChallengesSection: React.FC<{
  game: string;
  views: ChallengeView[];
  me: any;
  season: Season | null;
  member: boolean;
  isOpen: boolean;
  nowMs: number;
  onJoin: () => void;
}> = ({ game, views, me, member, isOpen, nowMs, onJoin }) => {
  const mineViews = views
    .filter((v) => v.challenge.game === game && v.phase !== 'cancelled' && !(v.phase === 'ended' && nowMs - Number(v.challenge.winner?.atMs || 0) > 14 * 86400000) && !(v.phase === 'over' && nowMs - Number(v.challenge.endMs) > 7 * 86400000))
    .sort((a, b) => {
      const rank = (v: ChallengeView) => (['running', 'upcoming'].includes(v.phase) ? 0 : v.phase === 'closed' ? 1 : 2);
      return rank(a) - rank(b) || Number(b.challenge.startMs) - Number(a.challenge.startMs);
    });
  if (mineViews.length === 0) return null;
  return (
    <div className="space-y-3">
      {mineViews.map((v) => (
        <ChallengeCard key={v.challenge.id} view={v} all={views} me={me} member={member} isOpen={isOpen} nowMs={nowMs} onJoin={onJoin} />
      ))}
    </div>
  );
};

/** The small green number on the Challenges tab and on the game card */
export const GreenBadge: React.FC<{ n: number; className?: string }> = ({ n, className = '' }) =>
  n > 0 ? (
    <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-[#0e9f55] text-white text-[10px] font-black inline-flex items-center justify-center ${className}`} aria-label={`${n} challenge${n === 1 ? '' : 's'} available`}>
      {n}
    </span>
  ) : null;
