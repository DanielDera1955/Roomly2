import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Loader2, Users, MessageCircle, X, Search, Flag, EyeOff, BookOpen, Check, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
import { gameLabel, isScored } from '../hub.js';
import { weekPhase } from '../boardCore.js';
import {
  GAME_RULES,
  RULES_VERSION,
  REPORT_REASONS_GAMES,
  joinSeason,
  acceptRules,
  rulesAccepted,
  joinRewardWeek,
  tapChallenge,
  reportPlayer,
  hideFromPlayer,
  type Season,
} from '../season';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const go = (url: string) => {
  window.location.href = url;
};
const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
const countdown = (ms: number) => {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};
const ago = (ms: number) => {
  if (!ms) return 'No activity yet';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 2) return 'Active just now';
  if (m < 60) return `Active ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Active ${h}h ago`;
  return h < 48 ? 'Active yesterday' : `Active ${Math.round(h / 24)} days ago`;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60">
    <div className="absolute inset-0" onClick={onClose} />
    <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Game rules                                                          */
/* ------------------------------------------------------------------ */

export const RulesBody: React.FC = () => (
  <div className="space-y-4">
    {GAME_RULES.map((r) => (
      <div key={r.title}>
        <p className="text-sm font-black text-slate-900 dark:text-white">{r.title}</p>
        <ul className="mt-1 space-y-1.5">
          {r.lines.map((l, i) => (
            <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {l}
            </li>
          ))}
        </ul>
      </div>
    ))}
    <p className="text-[11px] text-slate-400">Rules version {RULES_VERSION}. Roomly can update them. Changes to rewards apply from the next reward week.</p>
  </div>
);

export const RulesSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="Game rules" onClose={onClose}>
    <RulesBody />
  </Modal>
);

/* ------------------------------------------------------------------ */
/* Season and rules: one card on the Games home                        */
/* ------------------------------------------------------------------ */

export const SeasonRulesCard: React.FC<{
  season: Season | null;
  upcoming: Season | null;
  me: any;
  join: any;
  joinsCount: number;
  nowMs: number;
  onRegister: () => void;
}> = ({ season, upcoming, me, join, joinsCount, nowMs, onRegister }) => {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = season || upcoming;
  const auto = target ? target.autoJoin !== false : true;
  const hasGames = Boolean(me && (me.games || []).length);
  const accepted = rulesAccepted(join);
  // Players who still have to tick the rules: added by Roomly or registered before, or a new season that needs a Join tap
  const needsRules = Boolean(target && hasGames && !accepted);

  // First open: show the rules screen once per visit for players who still have to tick
  useEffect(() => {
    if (!needsRules || !target || !me) return;
    const key = `roomly_rules_gate_${target.id}_${me.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    setSheet(true);
  }, [needsRules, target?.id, me?.id]);

  const confirm = async () => {
    if (!target || !me) return;
    setBusy(true);
    try {
      if (join) await acceptRules(join, target, me);
      else await joinSeason(target, me);
      setSheet(false);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save. Try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <div className={`${card} overflow-hidden`}>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Roomly Caritas League</p>
              {target ? (
                <>
                  <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">{target.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {season ? `Ends ${dayText(target.endMs)}` : `Starts ${dayText(target.startMs)}`} · <Users className="inline w-3 h-3 -mt-0.5" /> {joinsCount} {joinsCount === 1 ? 'player' : 'players'}
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No season is running yet. Check back soon.</p>
              )}
            </div>
          </div>
          {target && !me && (
            <button type="button" onClick={onRegister} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Register for a game to enter
            </button>
          )}
          {target && me && !hasGames && (
            <button type="button" onClick={onRegister} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Add a game to your profile
            </button>
          )}
          {target && hasGames && accepted && <p className="text-xs font-bold text-[#0e9f55] flex items-center gap-1.5"><Check className="w-4 h-4" /> You are in the league.</p>}
          {needsRules && (
            <button type="button" onClick={() => setSheet(true)} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              {auto ? 'Read the rules to enter the league' : `Join ${target?.name || 'the league'}`}
            </button>
          )}
        </div>
        <button type="button" onClick={() => setRulesOpen(!rulesOpen)} aria-expanded={rulesOpen} className="w-full px-4 py-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 cursor-pointer">
          <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-500" /> Game rules
          </span>
          {rulesOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {rulesOpen && (
          <div className="px-4 pb-4">
            <RulesBody />
          </div>
        )}
      </div>
      {sheet && target && (
        <JoinRulesSheet
          canJoin
          title={auto ? 'Read the rules' : `Join ${target.name}`}
          cta={auto ? 'Enter the league' : 'Join the league'}
          busy={busy}
          onClose={() => setSheet(false)}
          onJoin={confirm}
        />
      )}
    </>
  );
};

const JoinRulesSheet: React.FC<{ canJoin: boolean; title: string; cta: string; busy: boolean; onClose: () => void; onJoin: () => void }> = ({ canJoin, title, cta, busy, onClose, onJoin }) => {
  const [read, setRead] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <RulesBody />
      {canJoin && (
        <>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0e9f55]" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">I have read the game rules and agree to follow them.</span>
          </label>
          <button
            type="button"
            disabled={!read || busy}
            onClick={onJoin}
            className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {cta}
          </button>
        </>
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Official announcements: Roomly's notice of the day and the WhatsApp group */
/* ------------------------------------------------------------------ */

export const AnnouncementsCard: React.FC<{ config: any; nowMs: number }> = ({ config, nowMs }) => {
  const link = String(config?.groupLink || '');
  const n = config?.notice && Number(config.notice.endMs) > nowMs ? String(config.notice.text || '') : '';
  if (!link && !n) return null;
  return (
    <div className={`${card} p-4 space-y-2`}>
      <p className="text-sm font-black text-slate-900 dark:text-white">Official announcements</p>
      {n && <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{n}</p>}
      <p className="text-[11px] text-slate-500">Rewards, results and rule updates are posted in the official Roomly Games WhatsApp group.</p>
      {link && (
        <button type="button" onClick={() => window.open(link, '_blank', 'noopener')} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
          <MessageCircle className="w-4 h-4" /> Join the WhatsApp group
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Reward card: the prize and who is winning it right now              */
/* ------------------------------------------------------------------ */

export const RewardCard: React.FC<{
  game: string;
  week: any | null;
  /** Another game's reward week that is running or next in line */
  otherWeek: any | null;
  rewardRows: any[];
  config: { minPlayers: number; minPoints: number; creditValue: number };
  me: any;
  season: Season | null;
  join: any;
  rewardJoined: boolean;
  tableCount: number;
  nowMs: number;
}> = ({ game, week, otherWeek, rewardRows, config, me, season, join, rewardJoined, tableCount, nowMs }) => {
  const [busy, setBusy] = useState(false);
  const phase = weekPhase(week, nowMs);
  const minPoints = week ? Number(week.minPoints) : config.minPoints;
  const value = week ? Number(week.creditValue) : config.creditValue;
  const slots = [0, 1, 2].map((i) => rewardRows[i] || null);
  const closed = phase === 'closed' || phase === 'issued' || phase === 'none';
  const canJoin = Boolean(week && me && rulesAccepted(join) && !rewardJoined && (phase === 'running' || phase === 'scheduled') && (me.games || []).includes(game) && !(me.rewardBlocked && me.rewardBlocked[game]));
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="relative h-36 bg-slate-200 dark:bg-slate-800">
        <img src="/images/reward-plate.webp" alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Reward table</p>
            <p className="text-lg font-black text-white leading-tight">{naira(value)} food credit</p>
          </div>
          <span className="text-[10px] font-semibold text-white/80">Example plate</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-[11px] text-slate-500">The top 3 each win a credit for a full plate of food of their choice. It works on Outside Food and Canteen Items.</p>

        {!season ? (
          <p className="text-xs font-bold text-slate-500">Reward weeks start once a season is running.</p>
        ) : phase === 'running' || phase === 'scheduled' ? (
          <>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {phase === 'running'
                ? `This week's reward is running. The table closes in ${countdown(Number(week.endMs) - nowMs)}.`
                : `Reward week starts ${dayText(week.startMs)} at 12:00AM (in ${countdown(Number(week.startMs) - nowMs)}).`}
            </p>
            {phase === 'running' && (
              <div className="space-y-1.5">
                {slots.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-xl ${r && r.id === me?.id ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-slate-950'}`}>
                    <span className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    {r ? (
                      <>
                        <span className="min-w-0 flex-1 text-sm font-bold text-slate-900 dark:text-white truncate">{r.name}</span>
                        <span className="text-xs font-black text-[#0e9f55] tabular-nums">{r.pts} pts</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.pts >= minPoints ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {r.pts >= minPoints ? 'Winning' : `Needs ${minPoints - r.pts} more`}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Open spot. Win matches to take it.</span>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-slate-400">A credit is only paid to a player with at least {minPoints} points.</p>
              </div>
            )}
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Users className="w-3 h-3" /> {rewardJoined ? 'You joined this reward week.' : 'Tap below to take part. Late joiners are welcome.'}
            </p>
            {canJoin && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!season) return;
                  setBusy(true);
                  try {
                    await joinRewardWeek(week, me, season, join);
                  } catch (e: any) {
                    window.alert(e?.message || 'Could not join.');
                  }
                  setBusy(false);
                }}
                className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Join this week's reward
              </button>
            )}
            {me && !rulesAccepted(join) && <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">Accept the league rules first to take part.</p>}
          </>
        ) : (
          <>
            {closed && week ? (
              <p className="text-xs text-slate-500">The last reward week for this table has closed. Credits are issued the next morning.</p>
            ) : null}
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {tableCount} of {config.minPlayers} players have joined this table
              </p>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-[#0e9f55]" style={{ width: `${Math.min(100, Math.round((tableCount / Math.max(1, config.minPlayers)) * 100))}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {tableCount >= config.minPlayers
                  ? 'This table has enough players. Its reward week starts on the next Monday it gets a slot.'
                  : `A reward week starts the next Monday after ${config.minPlayers} players join the ${gameLabel(game)} table.`}
              </p>
              {otherWeek && otherWeek.game !== game && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Reward weeks take turns. {gameLabel(otherWeek.game)} has the current slot, so this table is queued.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Table with a Challenge button on every row                          */
/* ------------------------------------------------------------------ */

export const ChallengeTable: React.FC<{
  game: string;
  rows: any[];
  me: any;
  season: Season | null;
  join: any;
  hiddenFromMe: Set<string>;
  rewardRunning: boolean;
  isOpen: boolean;
  title: string;
  note?: string;
  emptyText?: string;
}> = ({ game, rows, me, season, join, hiddenFromMe, rewardRunning, isOpen, title, note, emptyText }) => {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const [menu, setMenu] = useState('');
  const [reporting, setReporting] = useState<any | null>(null);
  const [busyId, setBusyId] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const scored = isScored(game);
  const member = Boolean(me && season && (me.games || []).includes(game) && rulesAccepted(join));
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => rows.filter((r) => !needle || String(r.name).toLowerCase().includes(needle)), [rows, needle]);

  const challenge = async (r: any) => {
    if (!season) return;
    setBusyId(r.id);
    try {
      go(await tapChallenge(game, me, r, season.id, rewardRunning));
    } catch (e: any) {
      window.alert(e?.message || 'Could not open WhatsApp.');
    }
    setBusyId('');
  };

  return (
    <div className={`${card} p-3`}>
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-sm font-black text-slate-900 dark:text-white">{title}</p>
        <span className="text-[11px] text-slate-400">{rows.length} {rows.length === 1 ? 'player' : 'players'}</span>
      </div>
      {note && <p className="px-1 mb-2 text-[10px] text-slate-400">{note}</p>}
      {rows.length > 8 && (
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={`${input} pl-9`} />
        </div>
      )}
      {list.length === 0 ? (
        <p className="p-4 text-center text-xs text-slate-400">{q ? 'Nobody matches that name.' : emptyText || 'No players yet. Register for this game to be the first on the table.'}</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.slice(0, limit).map((r) => {
            const self = Boolean(me && r.id === me.id);
            const canTap = member && !self && r.ready && isOpen && !hiddenFromMe.has(r.id);
            return (
              <div key={r.id} className={`py-2.5 px-1 ${self ? 'bg-emerald-50 dark:bg-emerald-950/40 rounded-lg' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-500 flex items-center justify-center">
                    {r.crown ? <Crown className="w-4 h-4 text-amber-500" /> : r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${self ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                      {r.name}
                      {r.tag && <span className="ml-1.5 px-1.5 py-px rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 dark:text-slate-400 align-middle">{r.tag}</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {scored ? `P${r.p} · ${r.w}W ${r.d}D ${r.l}L · GD ${r.gd > 0 ? `+${r.gd}` : r.gd}` : `P${r.p} · ${r.w}W ${r.l}L`} · {ago(r.lastActiveMs)}
                    </p>
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-black text-[#0e9f55] tabular-nums">{r.pts}</span>
                  <div className="w-[88px] shrink-0 flex items-center justify-end gap-1">
                    {canTap && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => challenge(r)}
                        className="h-8 px-2.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Challenge
                      </button>
                    )}
                    {member && !self && (
                      <button type="button" onClick={() => setMenu(menu === r.id ? '' : r.id)} aria-label="More" className="w-7 h-8 rounded-lg text-slate-400 flex items-center justify-center cursor-pointer">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {menu === r.id && (
                  <div className="mt-1.5 ml-8 flex gap-3">
                    <button type="button" onClick={() => { setMenu(''); setReporting(r); }} className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 cursor-pointer">
                      <Flag className="w-3 h-3" /> Report
                    </button>
                    <button
                      type="button"
                      disabled={hidden.has(r.id)}
                      onClick={async () => {
                        if (!window.confirm(`Hide you from ${r.name}? They will no longer be able to challenge you.`)) return;
                        try {
                          await hideFromPlayer(me, r);
                          setHidden(new Set([...hidden, r.id]));
                        } catch (e: any) {
                          window.alert(e?.message || 'Could not save.');
                        }
                      }}
                      className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                    >
                      <EyeOff className="w-3 h-3" /> {hidden.has(r.id) ? 'Hidden from them' : 'Hide me from this player'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {list.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 30)} className="mt-2 w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
          Show more players
        </button>
      )}
      {reporting && <ReportSheet game={game} me={me} target={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
};

const ReportSheet: React.FC<{ game: string; me: any; target: any; onClose: () => void }> = ({ game, me, target, onClose }) => {
  const [reason, setReason] = useState('harassing');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Modal title={`Report ${target.name}`} onClose={onClose}>
      {done ? (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200">Thank you. Roomly will look into it.</p>
          <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
            Close
          </button>
        </>
      ) : (
        <>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
            {REPORT_REASONS_GAMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} placeholder="What happened? (optional)" className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reportPlayer(game, me, target, reason, note);
                setDone(true);
              } catch (e: any) {
                window.alert(e?.message || 'Could not send.');
              }
              setBusy(false);
            }}
            className="w-full h-12 rounded-2xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send report
          </button>
        </>
      )}
    </Modal>
  );
};

export { Trophy };
