import React, { useMemo, useState } from 'react';
import { Loader2, Trophy, Clock, Users, ChevronDown, Crown } from 'lucide-react';
import { gameLabel, GAMES } from '../hub.js';
import { type Season } from '../season';
import {
  type ChallengeView,
  type Challenge,
  type Leader,
  settingsLine,
  targetOf,
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
const PLAY_STATE_TEXT: Record<string, string> = {
  ...STATE_TEXT,
  playing: 'In progress. Play different Caritas players and log every match, win or lose.',
  waiting: 'You met the number of players. Waiting for your opponents to confirm.',
  finished: 'You met the number of players. Roomly is checking your matches.',
};
const stateText = (c: Challenge, state: string) => (c.template === 'play' ? PLAY_STATE_TEXT : STATE_TEXT)[state] || '';

const GAME_COLORS: Record<string, string> = { efootball: '#0e9f55', fifa: '#3b82f6', dls: '#f59e0b', freefire: '#ef4444', codm: '#8b5cf6' };

/** One progress bar. Always drawn, even at 0, so players see how far the target is. */
const Bar: React.FC<{ title: string; color: string; count: number; target: number; who?: string; strong?: boolean; crown?: boolean }> = ({ title, color, count, target, who, strong, crown }) => {
  const left = Math.max(0, target - count);
  const pct = count <= 0 ? 0 : Math.min(100, Math.max(4, Math.round((count / Math.max(1, target)) * 100)));
  return (
    <div className={`rounded-xl p-2.5 ${strong ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900' : 'bg-slate-50 dark:bg-slate-950/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0 text-[12px] font-black text-slate-900 dark:text-white">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="truncate">{title}</span>
        </span>
        <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 shrink-0">
          {count}/{target}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}bb)`, boxShadow: pct > 0 ? `0 0 8px ${color}88` : 'none' }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
        <span className="flex items-center gap-1 min-w-0 text-slate-500 dark:text-slate-400">
          {crown && <Crown className="w-3 h-3 shrink-0 text-amber-500" />}
          <span className="truncate">{who || 'No one yet'}</span>
        </span>
        <span className="font-black shrink-0" style={{ color }}>
          {count >= target ? 'Target reached' : `${left} to go`}
        </span>
      </div>
    </div>
  );
};

/** One bar for each game when the challenge covers all games (all five, even with no leader yet), otherwise one bar */
const LeaderBars: React.FC<{ c: Challenge; leaders: Leader[]; myCount: number | null; meId?: string }> = ({ c, leaders, myCount, meId }) => {
  // Who is shown as the leader: "You" when the player leads or is level with the leader, so they can see they are in
  const whoOf = (l?: Leader) => {
    if (!l) return undefined;
    if (meId && l.gid === meId) return l.tiedNames.length ? `You, tied with ${l.tiedNames.join(', ')}` : 'You lead';
    if (meId && l.tiedGids.includes(meId)) return `You, tied with ${l.name}`;
    return l.tiedNames.length ? `${l.name} +${l.tiedNames.length} tied` : l.name;
  };
  const target = targetOf(c);
  const rows = c.game === 'all' ? (GAMES as any[]).map((g: any) => ({ game: g.id as string, leader: leaders.find((l) => l.game === g.id) })) : [{ game: c.game, leader: leaders[0] }];
  return (
    <div className="space-y-2">
      {myCount !== null && <Bar title="You" color="#0e9f55" count={myCount} target={target} who={c.game === 'all' ? 'Your total, all games' : 'Your progress'} strong />}
      {rows.map((r) => (
        <Bar key={r.game} title={gameLabel(r.game)} color={GAME_COLORS[r.game] || '#0e9f55'} count={r.leader ? r.leader.count : 0} target={target} who={whoOf(r.leader)} crown={Boolean(r.leader)} />
      ))}
    </div>
  );
};

/** The player's own place in the play challenge: that they are in, who they are level with or behind, and what they still need */
const MyStatus: React.FC<{ view: ChallengeView; me: any; inLeague: boolean; nowMs: number }> = ({ view, me, inLeague, nowMs }) => {
  const c = view.challenge;
  if (!['upcoming', 'running', 'closed', 'over'].includes(view.phase)) return null;
  if (!inLeague) {
    return <p className="text-[12px] font-bold text-slate-600 dark:text-slate-300 px-1">Join a game with the green button below to enter. Everyone in the league is in automatically.</p>;
  }
  const target = targetOf(c);
  const mine = view.entries.find((e) => e.app.gid === me.id) || null;
  const mc = mine ? mine.progress.wins : 0;
  const left = Math.max(0, target - mc);
  const live = view.entries.filter((e) => e.app.review !== 'rejected');
  const topN = live.reduce((m, e) => Math.max(m, e.progress.wins), 0);
  const ahead = live.filter((e) => e.progress.wins === topN && e.app.gid !== me.id).map((e) => e.app.name);
  let text: string;
  if (view.phase === 'upcoming') text = `You are in. Counting starts ${dayName(c.startMs)}. Play ${target} different Caritas students to win ${naira(c.prize)}.`;
  else if (mine && mc >= target) text = stateText(c, mine.progress.state);
  else if (topN === 0) text = `You are in. Play ${target} different Caritas students to win ${naira(c.prize)}.`;
  else if (mc >= topN) text = ahead.length ? `You are tied for the lead with ${ahead.join(', ')} on ${mc}/${target}. ${left} more different players to win.` : `You are leading on ${mc}/${target}. ${left} more different players to win.`;
  else text = `${ahead[0]}${ahead.length > 1 ? ` and ${ahead.length - 1} more are` : ' is'} ahead on ${topN}/${target}. You have ${mc}. You need ${left} more different players to win ${naira(c.prize)}.`;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3">
      <span className="w-10 h-10 shrink-0 rounded-full bg-[#0e9f55] text-white text-base font-black flex items-center justify-center">{String(me.name || '?').trim().charAt(0).toUpperCase()}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-black text-slate-900 dark:text-white">
          {me.name} <span className="text-[#0e9f55]">is in this challenge</span>
        </p>
        <p className="text-[11px] text-slate-600 dark:text-slate-300">{text}</p>
      </div>
    </div>
  );
};

const ChallengeCard: React.FC<{
  view: ChallengeView;
  all: ChallengeView[];
  me: any;
  member: boolean;
  isOpen: boolean;
  nowMs: number;
  tabGame: string;
  onJoin: () => void;
}> = ({ view, all, me, member, isOpen, nowMs, tabGame, onJoin }) => {
  const c = view.challenge;
  const mine = me ? view.entries.find((e) => e.app.gid === me.id) || null : null;
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openCard, setOpenCard] = useState(false); // the details stay closed until the player opens them
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

  const showBars = !['ended', 'cancelled'].includes(view.phase);
  const isPlay = c.template === 'play';
  // The play challenge has no sign-up: a registered player is in as soon as they play (any game for an all-games challenge)
  const inLeague = Boolean(me && (c.game === 'all' ? (me.games || []).length > 0 : (me.games || []).includes(c.game)));
  const winnersN = Math.max(1, Number(c.winners) || 1);
  const firstLine = winnersN === 1 ? 'First to finish wins' : `First ${winnersN} to finish win`;
  const daysLeft = Math.max(0, Math.ceil((Number(c.endMs) - nowMs) / 86400000));
  const timeChip = view.phase === 'upcoming' ? `Starts ${dayName(c.startMs)}` : view.phase === 'running' ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : '';
  const myCount = isPlay && inLeague ? (mine ? mine.progress.wins : 0) : mine ? mine.progress.wins : null;

  return (
    <div className={`${card} p-3 space-y-3`}>
      <div className="relative overflow-hidden rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #0e9f55 0%, #0b7a4a 55%, #0f766e 100%)' }}>
        <Trophy className="absolute -right-4 -top-4 w-28 h-28 opacity-10" />
        <div className="relative flex items-start justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100 flex items-center gap-1">
            <Trophy className="w-3 h-3" /> Challenge
          </span>
          <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black ${label.cls}`}>{label.text}</span>
        </div>
        <p className="relative mt-1.5 text-[15px] font-black leading-snug">{c.title}</p>
        <div className="relative mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-emerald-100/80">Prize</p>
            <p className="text-3xl font-black leading-none">{naira(c.prize)}</p>
            <p className="mt-1.5 text-[11px] font-bold text-emerald-50">{firstLine}</p>
          </div>
          {timeChip && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-black/20 text-[10px] font-black flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeChip}
            </span>
          )}
        </div>
      </div>

      {isPlay && showBars && <MyStatus view={view} me={me} inLeague={inLeague} nowMs={nowMs} />}

      {showBars && <LeaderBars c={c} leaders={view.leaders} myCount={myCount} meId={me?.id} />}

      {view.phase === 'ended' && c.winner && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
          <p className="text-sm font-black text-slate-900 dark:text-white">{c.winner.names} won this challenge</p>
          <p className="text-[11px] text-slate-500">The prize is food credit issued by Roomly.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpenCard((x) => !x)}
        aria-expanded={openCard}
        className="w-full h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
      >
        {openCard ? 'Hide details' : 'Read details'}
        <ChevronDown className={`w-4 h-4 transition-transform ${openCard ? 'rotate-180' : ''}`} />
      </button>

      {openCard && (
        <div className="space-y-3">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <RichText text={c.desc} />
          </div>
          {!isPlay && <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{settingsLine(c)}</p>}
          {spotsLeft !== null && !isPlay && <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Spots left: {spotsLeft}</p>}
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {c.dayMode === 'fixed' && c.fixedDayMs ? `Everyone plays on ${dayName(lagosDayStart(c.fixedDayMs))}` : `${whenFull(c.startMs)} to ${whenFull(c.endMs)}`}
          </p>

          {mine && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
              <p className="text-xs font-black text-slate-900 dark:text-white">{isPlay ? 'My matches' : 'My application'}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {!isPlay && c.dayMode === 'pick' && mine.app.dayMs ? `Your day: ${dayName(mine.app.dayMs)}. ` : ''}
                {mine.app.review === 'rejected' ? 'Roomly could not approve this attempt.' : mine.app.review === 'approved' ? 'Approved. Roomly issues the credit.' : stateText(c, mine.progress.state)}
              </p>
              {mine.progress.rows.length > 0 && (
                <ul className="space-y-1">
                  {mine.progress.rows.map((r, i) => (
                    <li key={r.id} className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200">
                      <span>
                        Match {i + 1}: {r.oppName}
                        {c.game === 'all' ? ` (${gameLabel(r.game)})` : ''}
                      </span>
                      <span className="font-bold">
                        {r.result} {r.score}
                        {r.recorded ? '' : ' (waiting)'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!isPlay && (
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
              )}
              {!isPlay && picking && canReschedule && (
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

          {!isPlay && !mine && canApply(view, nowMs) && (
            <div className="space-y-2">
              {blocked && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">You are already in "{blocked}". Finish it before joining another challenge.</p>}
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
                {!me || !member ? `Join ${gameLabel(tabGame)} to apply` : !isOpen ? 'Applications open when the league starts' : c.dayMode === 'pick' && !picking ? 'Apply and pick my day' : 'Confirm my application'}
              </button>
            </div>
          )}
          {!isPlay && !mine && !canApply(view, nowMs) && ['running', 'upcoming'].includes(view.phase) && <p className="text-[11px] font-semibold text-slate-500">No spots left.</p>}
          {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}

          {!isPlay && others.length > 0 && (
            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Trying: {others.map((e) => e.app.name).join(', ')}</span>
            </p>
          )}
        </div>
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
    .filter((v) => (v.challenge.game === game || v.challenge.game === 'all') && v.phase !== 'cancelled' && !(v.phase === 'ended' && nowMs - Number(v.challenge.winner?.atMs || 0) > 14 * 86400000) && !(v.phase === 'over' && nowMs - Number(v.challenge.endMs) > 7 * 86400000))
    .sort((a, b) => {
      const rank = (v: ChallengeView) => (['running', 'upcoming'].includes(v.phase) ? 0 : v.phase === 'closed' ? 1 : 2);
      return rank(a) - rank(b) || Number(b.challenge.startMs) - Number(a.challenge.startMs);
    });
  if (mineViews.length === 0) return null;
  return (
    <div className="space-y-3">
      {mineViews.map((v) => (
        <ChallengeCard key={v.challenge.id} view={v} all={views} me={me} member={member} isOpen={isOpen} nowMs={nowMs} tabGame={game} onJoin={onJoin} />
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
