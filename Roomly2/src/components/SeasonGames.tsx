import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Loader2, Users, MessageCircle, X, Search, Flag, EyeOff, BookOpen, Check, ChevronDown, ChevronUp, ChevronRight, MoreHorizontal } from 'lucide-react';
import { gameLabel, isScored } from '../hub.js';
import { weekPhase, lagosWeek, contestOf, matchCounts, winnerOf, proofOf, specialSeries, MAX_PAIR_LEAGUE_WEEK, MAX_PAIR_REWARD_WEEK } from '../boardCore.js';
import ProofThumb from './ProofThumb';
import {
  GAME_RULES,
  RULES_VERSION,
  REPORT_REASONS_GAMES,
  joinSeason,
  acceptRules,
  leagueMainRulesFor,
  rulesAccepted,
  registerReward,
  leagueRulesFor,
  rewardRulesFor,
  rewardHeadlineFor,
  rewardShortRulesFor,
  tapChallenge,
  bookSpecial,
  cancelBooking,
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
  const [busy, setBusy] = useState(false);
  const target = season || upcoming;
  const auto = target ? target.autoJoin !== false : true;
  const hasGames = Boolean(me && (me.games || []).length);
  const accepted = rulesAccepted(join);
  // Players who still have to tick the rules: added by Roomly or registered before, or a new season that needs a Join tap
  const needsRules = Boolean(target && hasGames && !accepted);
  // Rules stay open until the player accepts, then fold away
  useEffect(() => {
    setRulesOpen(needsRules);
  }, [needsRules]);

  const confirm = async () => {
    if (!target || !me) return;
    setBusy(true);
    try {
      if (join) await acceptRules(join, target, me);
      else await joinSeason(target, me);
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
                    {season ? `Ends around ${dayText(target.endMs)}` : `Starts ${dayText(target.startMs)}`} · <Users className="inline w-3 h-3 -mt-0.5" /> {joinsCount} {joinsCount === 1 ? 'player' : 'players'}
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No season is running yet. Check back soon.</p>
              )}
            </div>
          </div>
          {needsRules && (
            <div className={`rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/70 p-3.5 space-y-2.5 ${busy ? 'opacity-60' : ''}`}>
              <p className="text-sm font-black text-amber-900 dark:text-amber-200">One step left. Accept the rules to play.</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={busy} disabled={busy} onChange={confirm} className="mt-0.5 h-6 w-6 shrink-0 accent-[#0e9f55]" />
                <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                  I have read the game rules and accept them. {auto ? 'Other players can challenge me once I tick.' : `This joins me to ${target?.name || 'the league'}.`}
                </span>
              </label>
              <button type="button" onClick={() => setRulesOpen(true)} className="text-xs font-bold text-amber-800 dark:text-amber-300 underline underline-offset-2 cursor-pointer">
                Read the rules first
              </button>
            </div>
          )}
          {target && !me && (
            <button type="button" onClick={onRegister} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Join a game to enter
            </button>
          )}
          {target && me && !hasGames && (
            <button type="button" onClick={onRegister} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Add a game to your profile
            </button>
          )}
          {target && hasGames && accepted && <p className="text-xs font-bold text-[#0e9f55] flex items-center gap-1.5"><Check className="w-4 h-4" /> You are in the league.</p>}
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
    </>
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

type RewardCfg = { minPlayers: number; minPoints: number; creditValue: number };

/** A tap-to-open rules block for one game (or the general reward rules). Shows only the lines it is given. */
export const GameRulesToggle: React.FC<{ title: string; lines: string[]; fullLines?: string[]; className?: string }> = ({ title, lines, fullLines, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const shown = full && fullLines ? fullLines : lines;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 text-left cursor-pointer">
        <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
          <BookOpen className="w-3.5 h-3.5 text-slate-500" /> {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <>
          <ul className="mt-3 space-y-3 list-disc pl-5 marker:text-[#0e9f55]">
            {shown.map((l, i) => (
              <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {l}
              </li>
            ))}
          </ul>
          {fullLines && (
            <button type="button" onClick={() => setFull((v) => !v)} className="mt-3 text-xs font-bold text-[#0e9f55] cursor-pointer">
              {full ? 'Show the short version' : 'Read all the rules'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

/** A short rules list, open when the page opens, with a button to the full rules. The full rules are not embedded. */
export const MainRulesDropdown: React.FC<{ title: string; lines: string[]; defaultOpen?: boolean; onToggle?: (open: boolean) => void; className?: string }> = ({ title, lines, defaultOpen = true, onToggle, className = '' }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [full, setFull] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          const v = !open;
          setOpen(v);
          onToggle?.(v);
        }}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <BookOpen className="w-3.5 h-3.5 text-slate-500" /> {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <>
          <ul className="mt-3 space-y-3 list-disc pl-5 marker:text-[#0e9f55]">
            {lines.map((l, i) => (
              <li key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {l}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setFull(true)} className="mt-3 text-xs font-bold text-[#0e9f55] cursor-pointer">
            Read all the rules
          </button>
        </>
      )}
      {full && <RulesSheet onClose={() => setFull(false)} />}
    </div>
  );
};

/** What the reward is, written out, plus the Main Rule list */
export const RewardIntro: React.FC<{ cfg: RewardCfg; game?: string; showImage?: boolean }> = ({ cfg, showImage = true }) => (
  <>
    {showImage && (
      <div className="relative h-32 bg-slate-200 dark:bg-slate-800">
        <img src="/images/reward-plate.webp" alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Weekly reward</p>
            <p className="text-lg font-black text-white leading-tight">{naira(cfg.creditValue)} food credit</p>
          </div>
          <span className="text-[10px] font-semibold text-white/80">Example plate</span>
        </div>
      </div>
    )}
    <div className="p-4 space-y-3">
      <p className="text-sm font-black text-slate-900 dark:text-white">{rewardHeadlineFor(cfg)}</p>
      <MainRulesDropdown
        title="Main Rule"
        lines={rewardShortRulesFor(cfg)}
        defaultOpen={false}
        className="pt-3 border-t border-slate-100 dark:border-slate-800"
      />
    </div>
  </>
);

/** Register once for a game's reward contest: its rules, one tick */
export const RewardRegisterSheet: React.FC<{ game: string; cfg: RewardCfg; me: any; season: Season; join: any; week: any | null; acceptedGame?: string; onClose: () => void }> = ({ game, cfg, me, season, join, week, acceptedGame = '', onClose }) => {
  // A player who has not accepted the league rules yet (added by Roomly, or no join) accepts both in one tick
  const needLeague = !rulesAccepted(join);
  const skipTick = Boolean(acceptedGame) && !needLeague;
  const [ticked, setTicked] = useState(skipTick);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Join the ${gameLabel(game)} reward contest`} onClose={onClose}>
      {needLeague && (
        <>
          <p className="text-sm font-black text-slate-900 dark:text-white">League rules</p>
          <ul className="space-y-1.5">
            {leagueMainRulesFor(game).map((l: string, i: number) => (
              <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {l}
              </li>
            ))}
          </ul>
          <p className="text-sm font-black text-slate-900 dark:text-white">Reward contest rules</p>
        </>
      )}
      <ul className="space-y-1.5">
        {rewardRulesFor(game, cfg).map((l, i) => (
          <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {l}
          </li>
        ))}
      </ul>
      {skipTick ? (
        <p className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200">
          You accepted the reward contest rules on {gameLabel(acceptedGame)}. They apply here too.
        </p>
      ) : (
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 cursor-pointer">
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0e9f55]" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {needLeague ? `I have read and accept the league rules and the ${gameLabel(game)} reward contest rules.` : `I have read and accept the ${gameLabel(game)} reward contest rules.`}
          </span>
        </label>
      )}
      <button
        type="button"
        disabled={!ticked || busy}
        onClick={async () => {
          setBusy(true);
          try {
            let j = join;
            if (needLeague) {
              if (join) await acceptRules(join, season, me);
              else await joinSeason(season, me);
              j = { ...(join || { off: {} }), rulesVersion: RULES_VERSION };
            }
            await registerReward(season, me, j, game, week);
            onClose();
          } catch (e: any) {
            window.alert(e?.message || 'Could not join.');
          }
          setBusy(false);
        }}
        className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {needLeague ? 'Join the league and reward contest' : 'Join the reward contest'}
      </button>
    </Modal>
  );
};

const joinedAgo = (ms: number) => {
  if (!ms) return '';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return h < 48 ? 'yesterday' : `${Math.round(h / 24)}d ago`;
};

export const RewardCard: React.FC<{
  game: string;
  week: any | null;
  /** Another game's reward week that is running or next in line */
  otherWeek: any | null;
  rewardRows: any[];
  config: RewardCfg;
  me: any;
  season: Season | null;
  join: any;
  /** This player is registered for this game's reward contest */
  rewardJoined: boolean;
  /** A game where this player already accepted the current reward rules ('' if none) */
  acceptedGame?: string;
  /** Opens the full registration form for a player with no profile yet */
  onNewPlayer?: () => void;
  /** Players registered for this game's reward contest */
  tableCount: number;
  /** Players registered for this game's reward contest, in join order */
  registeredList?: { id: string; name: string; atMs: number }[];
  nowMs: number;
}> = ({ game, week, otherWeek, rewardRows, config, me, season, join, rewardJoined, acceptedGame = '', onNewPlayer, tableCount, registeredList = [], nowMs }) => {
  const [sheet, setSheet] = useState(false);
  const phase = weekPhase(week, nowMs);
  const minPoints = week ? Number(week.minPoints) : config.minPoints;
  const slots = [0, 1, 2].map((i) => rewardRows[i] || null);
  const closed = phase === 'closed' || phase === 'issued' || phase === 'none';
  const plays = Boolean(me && (me.games || []).includes(game));
  const blocked = Boolean(me && me.rewardBlocked && me.rewardBlocked[game]);
  const canRegister = Boolean(season && me && plays && !rewardJoined && !blocked);
  const cfg = week ? { minPlayers: Number(week.minPlayers) || config.minPlayers, minPoints, creditValue: Number(week.creditValue) || config.creditValue } : config;
  return (
    <div className={`${card} overflow-hidden`}>
      <RewardIntro cfg={cfg} game={game} />
      <div className="px-4 pb-4 space-y-3 -mt-1">
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
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
                </div>
              )}
            </>
          ) : (
            <>
              {closed && week ? <p className="text-xs text-slate-500">The last reward week for this game has closed. Credits are issued when a week closes.</p> : null}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {tableCount} of {config.minPlayers} players registered for {gameLabel(game)}
                </p>
                {tableCount < config.minPlayers && (
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-[#0e9f55]" style={{ width: `${Math.min(100, Math.round((tableCount / Math.max(1, config.minPlayers)) * 100))}%` }} />
                  </div>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  {tableCount >= config.minPlayers
                    ? 'Enough players. Its reward week starts when it gets a turn.'
                    : `${config.minPlayers - tableCount} more to start its reward week.`}
                </p>
                {otherWeek && otherWeek.game !== game && (
                  <p className="mt-1 text-[11px] text-slate-500">{gameLabel(otherWeek.game)} has the current turn, so this game is waiting.</p>
                )}
              </div>
            </>
          )}
          {season && (
            <>
              {rewardJoined ? (
                <p className="text-[11px] font-semibold text-[#0e9f55] flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> You are registered for the {gameLabel(game)} reward contest.
                </p>
              ) : !me ? (
                <p className="text-[11px] text-slate-500">New here? Fill in your player details once, accept the rules, and you are in the league and the reward contest.</p>
              ) : !plays ? (
                <p className="text-[11px] text-slate-500">Join {gameLabel(game)} here and you are in its reward contest too. One tick, once.</p>
              ) : blocked ? (
                <p className="text-[11px] text-slate-500">You cannot join this reward contest. Roomly can tell you why.</p>
              ) : null}
              {(!me || !plays) && season && onNewPlayer && (
                <button type="button" onClick={onNewPlayer} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
                  {!me ? 'Join the reward contest' : `Join ${gameLabel(game)} League and the reward contest`}
                </button>
              )}
              {canRegister && (
                <button type="button" onClick={() => setSheet(true)} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
                  Join the reward contest
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {sheet && season && <RewardRegisterSheet game={game} cfg={cfg} me={me} season={season} join={join} week={week} acceptedGame={acceptedGame} onClose={() => setSheet(false)} />}
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
  matches?: any[];
  /** Before the week starts: join order, no medals, rows are not tappable */
  preStart?: boolean;
  /** Points earned inside the running weekly reward, by player id. When given, a Wk column shows next to Pts. */
  weekly?: Map<string, any> | null;
}> = ({ game, rows, me, season, join, hiddenFromMe, rewardRunning, isOpen, title, note, emptyText, matches = [], preStart = false, weekly = null }) => {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const [picked, setPicked] = useState<any | null>(null);
  const scored = isScored(game);
  // The first columns stay on screen: rank, name, points. The other stats scroll sideways.
  const stats: { k: string; h: string }[] = scored
    ? [{ k: 'p', h: 'P' }, { k: 'w', h: 'W' }, { k: 'd', h: 'D' }, { k: 'l', h: 'L' }, { k: 'gf', h: 'GF' }]
    : [{ k: 'p', h: 'P' }, { k: 'w', h: 'W' }, { k: 'l', h: 'L' }, { k: 'kills', h: 'K' }];
  const member = Boolean(me && season && (me.games || []).includes(game) && rulesAccepted(join));
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => rows.filter((r) => !needle || String(r.name).toLowerCase().includes(needle)), [rows, needle]);
  const nameW = 'w-[44vw] max-w-[190px] min-w-[120px]';

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
        <p className="p-4 text-center text-xs text-slate-400">{q ? 'Nobody matches that name.' : emptyText || 'No players yet. Join this game to be the first on the table.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="min-w-max">
            {/* Header */}
            <div className="flex items-stretch bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <div className="sticky left-0 z-10 flex items-center bg-slate-50 dark:bg-slate-950">
                <span className="w-8 py-2 text-center">#</span>
                <span className={`${nameW} py-2`}>Player</span>
                <span className="w-10 py-2 text-center text-slate-500">Pts</span>
              </div>
              {weekly && <span className="w-10 py-2 text-center text-[#0e9f55]">Wk</span>}
              {stats.map((c) => (
                <span key={c.k} className="w-10 py-2 text-center">{c.h}</span>
              ))}
            </div>
            {list.slice(0, limit).map((r, idx) => {
              const self = Boolean(me && r.id === me.id);
              const bg = self ? 'bg-emerald-50 dark:bg-emerald-950' : idx % 2 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900';
              const medal = preStart ? 'text-slate-500' : r.rank === 1 ? 'bg-amber-400 text-amber-950' : r.rank === 2 ? 'bg-slate-300 text-slate-800' : r.rank === 3 ? 'bg-orange-300 text-orange-950' : 'text-slate-500';
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => !self && !preStart && setPicked(r)}
                  className={`w-full flex items-stretch text-left border-b last:border-b-0 border-slate-100 dark:border-slate-800 ${bg} ${self || preStart ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className={`sticky left-0 z-10 flex items-center ${bg}`}>
                    <span className="w-8 py-2.5 flex items-center justify-center">
                      <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${medal}`}>{r.rank}</span>
                    </span>
                    <div className={`${nameW} py-2 pr-2 min-w-0`}>
                      <p className={`text-[13px] leading-tight flex items-center gap-1 ${self ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                        {r.crown && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="truncate">{r.name}</span>
                        {self && <span className="shrink-0 px-1 rounded bg-[#0e9f55] text-white text-[8px] font-black">YOU</span>}
                        {!self && r.ready === false && <span className="shrink-0 px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[8px] font-black">RULES PENDING</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {r.tag ? `${r.tag} · ` : ''}
                        {preStart ? `Joined ${joinedAgo(r.lastActiveMs)}` : ago(r.lastActiveMs)}
                      </p>
                    </div>
                    <span className="w-10 text-center text-sm font-black text-[#0e9f55] tabular-nums">{r.pts}</span>
                  </div>
                  {weekly && <span className="w-10 flex items-center justify-center text-xs font-black tabular-nums text-[#0e9f55]">{Number(weekly.get(r.id)?.pts || 0)}</span>}
                  {stats.map((c) => (
                    <span key={c.k} className="w-10 flex items-center justify-center text-xs tabular-nums text-slate-600 dark:text-slate-300">{r[c.k] || 0}</span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {list.length > 0 && !preStart && <p className="mt-2 px-1 text-[10px] text-slate-400">Swipe the table sideways for more stats.</p>}
      {list.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 30)} className="mt-2 w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
          Show more players
        </button>
      )}
      {picked && (
        <PlayerSheet
          game={game}
          row={picked}
          me={me}
          season={season}
          member={member}
          isOpen={isOpen}
          hidden={hiddenFromMe.has(picked.id)}
          rewardRunning={rewardRunning}
          matches={matches}
          stats={stats}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Weekly reward banner (inside the league page)                        */
/* ------------------------------------------------------------------ */

/** The weekly reward for a game: countdown before it starts, the top 3 while it runs, a short note after it ends */
const whenText = (ms: number) => `${new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}, 12:00AM`;

const MEDAL = [
  'bg-amber-400 text-amber-950',
  'bg-slate-300 text-slate-800',
  'bg-orange-300 text-orange-950',
];

/** The weekly reward for a game: the prize, when it starts and ends, and the top 3 while it runs */
export const WeeklyBanner: React.FC<{
  game: string;
  week: any | null;
  rows: any[];
  me: any;
  playersReady: number;
  nowMs: number;
  onInvite?: () => void;
}> = ({ week, rows, me, playersReady, nowMs, onInvite }) => {
  if (!week) return null;
  const phase = weekPhase(week, nowMs);
  const minPts = Number(week.minPoints) || 25;
  const credit = naira(Number(week.creditValue) || 3500);
  const top = rows.slice(0, 3);
  const mine = me ? rows.find((r) => r.id === me.id) : null;
  const pill =
    phase === 'running' ? `Ends in ${countdown(Number(week.endMs) - nowMs)}` : phase === 'scheduled' ? `Starts in ${countdown(Number(week.startMs) - nowMs)}` : 'Ended';
  return (
    <div className={`${card} overflow-hidden`}>
      {/* The prize */}
      <div className="relative h-36 bg-slate-200 dark:bg-slate-800">
        <img src="/images/reward-plate.webp" alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black ${phase === 'running' ? 'bg-[#0e9f55] text-white' : 'bg-white/90 text-slate-800'}`}>{pill}</span>
        <div className="absolute left-4 bottom-3 right-4 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Weekly reward</p>
            <p className="text-2xl font-black text-white leading-tight">{credit} food credit</p>
          </div>
          <span className="text-[10px] font-semibold text-white/80">Example plate</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          Top 3 with at least {minPts} points win {credit} each.
        </p>

        {/* When */}
        <div className="grid grid-cols-2 gap-2">
          {[['Starts', Number(week.startMs)], ['Ends', Number(week.endMs)]].map(([label, ms]) => (
            <div key={String(label)} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="text-[13px] font-black text-slate-900 dark:text-white leading-tight">{whenText(Number(ms))}</p>
            </div>
          ))}
        </div>

        {phase === 'scheduled' && (
          <p className="text-xs text-slate-500">
            {playersReady} {playersReady === 1 ? 'player is' : 'players are'} ready. Your weekly points start from zero when it begins, and your normal league points are not affected.
          </p>
        )}
        {phase === 'closed' && <p className="text-xs text-slate-500">The week is over. Roomly is checking the matches before the credits go out.</p>}

        {/* Top 3 */}
        {phase === 'running' && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2].map((i) => {
                const r = top[i];
                const has = Boolean(r && r.pts > 0);
                const qualified = has && r.pts >= minPts;
                const isMe = Boolean(has && me && r.id === me.id);
                return (
                  <div key={i} className={`min-w-0 ${has ? '' : 'opacity-60'}`}>
                    <div className={`rounded-xl py-2 px-1.5 text-center border ${isMe ? 'border-[#0e9f55]/70 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}>
                      <span className={`mx-auto w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${MEDAL[i]}`}>{i + 1}</span>
                      <p className={`mt-1.5 text-base font-semibold leading-none tabular-nums ${has ? 'text-slate-900 dark:text-white' : 'text-slate-300'}`}>{has ? r.pts : '-'}</p>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400 mt-0.5">pts</p>
                      <p className={`mt-1 text-[10px] font-medium min-h-[12px] ${qualified ? 'text-[#0e9f55]' : 'text-slate-500'}`}>{has ? (qualified ? 'Qualified' : `${minPts - r.pts} to qualify`) : ''}</p>
                    </div>
                    <p className="mt-1 text-center text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">{has ? r.name : 'Open spot'}</p>
                  </div>
                );
              })}
            </div>
            {me && (
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center">
                {mine && mine.pts > 0 ? `You have ${mine.pts} pts this week${mine.pts >= minPts ? '.' : `, ${minPts - mine.pts} more to qualify.`}` : 'You have no points yet this week. Win a match to get on the board.'}
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-slate-500 text-center">Only 2 matches per opponent count for the weekly reward (1 home, 1 away), so play more people to earn more points. All your matches still count in the league table.</p>
        {onInvite && phase !== 'closed' && (
          <button type="button" onClick={onInvite} className="w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            Invite friends to play
          </button>
        )}
      </div>
    </div>
  );
};

/** One line on the league page when a Special 1v1 exists for this game */
export const SpecialStrip: React.FC<{ game: string; events: any[]; nowMs: number; onOpen: () => void }> = ({ game, events, nowMs, onOpen }) => {
  const e = events
    .filter((x) => x.game === game && x.status !== 'done' && nowMs < Number(x.endMs))
    .sort((a, b) => Number(a.startMs) - Number(b.startMs))[0];
  if (!e) return null;
  const live = nowMs >= Number(e.startMs);
  return (
    <button type="button" onClick={onOpen} className={`${card} w-full p-3.5 flex items-center gap-3 text-left cursor-pointer`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-[#0e9f55] shrink-0">Special 1v1</span>
      <span className="min-w-0 flex-1 text-sm font-bold text-slate-900 dark:text-white truncate">
        {live ? `Live now: beat ${e.xName}` : `${dateShort(Number(e.startMs))}: beat ${e.xName}`}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Special 1v1 card and Latest winner card (above the log button)       */
/* ------------------------------------------------------------------ */

const PARTS: { id: 'morning' | 'afternoon' | 'evening'; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];
const MAX_BOOKINGS = 8;
const dateShort = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

const Dots: React.FC<{ results: string[]; of: number }> = ({ results, of }) => (
  <div className="flex gap-1 shrink-0">
    {Array.from({ length: of }).map((_, i) => {
      const r = results[i];
      const cls = r === 'W' ? 'bg-[#0e9f55] text-white' : r === 'L' ? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : r === 'D' ? 'bg-amber-300 text-amber-950' : 'border border-dashed border-slate-300 dark:border-slate-600 text-slate-400';
      return (
        <span key={i} className={`w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center ${cls}`}>
          {r || i + 1}
        </span>
      );
    })}
  </div>
);

/** The card for a game's Special 1v1: before the day (book a spot), on the day (who played X), after it (waiting for Roomly's check) */
export const SpecialCard: React.FC<{
  game: string;
  events: any[];
  bookings: any[];
  matches: any[];
  me: any;
  season: Season | null;
  join: any;
  board: any[];
  hiddenFromMe: Set<string>;
  isOpen: boolean;
  nowMs: number;
  onJoin: () => void;
}> = ({ game, events, bookings, matches, me, season, join, board, hiddenFromMe, isOpen, nowMs, onJoin }) => {
  const [busy, setBusy] = useState(false);
  const [part, setPart] = useState<'morning' | 'afternoon' | 'evening'>('evening');
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);
  const [err, setErr] = useState('');
  // The next or current event for this game that is not closed; an event that ended a few hours ago still shows until Roomly closes it
  const e = events
    .filter((x) => x.game === game && x.status !== 'done' && nowMs < Number(x.endMs) + 12 * 3600000)
    .sort((a, b) => Number(a.startMs) - Number(b.startMs))[0];
  if (!e) return null;
  const scored = isScored(game);
  const stats: { k: string; h: string }[] = scored
    ? [{ k: 'p', h: 'P' }, { k: 'w', h: 'W' }, { k: 'd', h: 'D' }, { k: 'l', h: 'L' }, { k: 'gf', h: 'GF' }]
    : [{ k: 'p', h: 'P' }, { k: 'w', h: 'W' }, { k: 'l', h: 'L' }, { k: 'kills', h: 'K' }];
  const plays = Boolean(me && (me.games || []).includes(game));
  const member = Boolean(me && season && plays && rulesAccepted(join));
  const paused = e.status === 'paused';
  const before = nowMs < Number(e.startMs);
  const live = !before && nowMs < Number(e.endMs);
  const ended = nowMs >= Number(e.endMs);
  const isX = Boolean(me && me.id === e.xId);
  const xRow = board.find((r) => r.id === e.xId) || null;
  const ser = specialSeries(e, matches);
  const list = showAll ? ser.rows : ser.rows.slice(0, 5);
  const booked = bookings.filter((b) => b.eventId === e.id);
  const mine = me ? booked.find((b) => b.gid === me.id) : null;
  const full = booked.length >= MAX_BOOKINGS;
  const prizeC = naira(Number(e.prizeChallenger));
  const prizeX = naira(Number(e.prizeX));

  const book = async () => {
    if (!me) return;
    setBusy(true);
    setErr('');
    try {
      await bookSpecial(e, me, part);
    } catch (x: any) {
      setErr(x?.message || 'Could not book. Try again.');
    }
    setBusy(false);
  };
  const unbook = async () => {
    if (!me) return;
    setBusy(true);
    try {
      await cancelBooking(e, me);
    } catch {}
    setBusy(false);
  };

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#0e9f55]">Special 1v1</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${paused ? 'bg-amber-100 text-amber-800' : live ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {paused ? 'PAUSED' : live ? 'LIVE NOW' : ended ? 'ENDED' : dateShort(Number(e.startMs)).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">Beat {e.xName}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {paused
              ? 'Roomly has paused this for now. Check back soon.'
              : live
              ? `${dateShort(Number(e.startMs))}. Ends in ${countdown(Number(e.endMs) - nowMs)}.`
              : ended
              ? 'The day is over. Roomly is checking the matches before the winner is announced.'
              : `${dateShort(Number(e.startMs))}. Starts in ${countdown(Number(e.startMs) - nowMs)}.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950">
            <p className="text-base font-black text-[#0e9f55]">{prizeC}</p>
            <p className="text-[10px] text-slate-500">Win 3 of 5 matches against {e.xName}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950">
            <p className="text-base font-black text-amber-500">{prizeX}</p>
            <p className="text-[10px] text-slate-500">{e.xName} beats 5 challengers</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Play {e.xName} up to 5 times on the day and log every match with a screenshot. The first challenger to win ends the run.</p>

        {before && !paused && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {booked.length === 0 ? 'Nobody has booked yet.' : `${booked.length} booked: ${booked.slice(0, 4).map((b) => b.name).join(', ')}${booked.length > 4 ? ` and ${booked.length - 4} more` : ''}`}
            </p>
            {isX ? (
              <p className="text-[11px] text-slate-500">You are the special player.</p>
            ) : !me || !plays || !rulesAccepted(join) ? (
              <button type="button" onClick={onJoin} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
                Join {gameLabel(game)} to book a spot
              </button>
            ) : mine ? (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> You are booked ({mine.part})
                </p>
                <button type="button" disabled={busy} onClick={unbook} className="text-[11px] font-bold text-slate-500 cursor-pointer">Cancel</button>
              </div>
            ) : full ? (
              <p className="text-[11px] text-slate-500">Booking is full. You can still challenge {e.xName} on the day.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {PARTS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPart(p.id)} className={`flex-1 h-9 rounded-lg text-[11px] font-bold cursor-pointer ${part === p.id ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={busy} onClick={book} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer disabled:opacity-60">
                  {busy ? 'Booking...' : 'Book my spot'}
                </button>
                <p className="text-[10px] text-slate-400">Booking is optional. Anyone can still challenge {e.xName} on the day.</p>
              </div>
            )}
            {err && <p className="text-[11px] font-semibold text-rose-600">{err}</p>}
          </div>
        )}
      </div>

      {(live || ended) && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <p className="px-4 pt-3 pb-1 text-xs font-bold text-slate-900 dark:text-white">
            {ser.rows.length === 0 ? `Nobody has played ${e.xName} yet.` : `${ser.rows.length} ${ser.rows.length === 1 ? 'player has' : 'players have'} challenged ${e.xName}`}
          </p>
          {list.map((r) => (
            <div key={r.id} className={`px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 ${me && r.id === me.id ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''}`}>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">
                {e.xName} vs {r.name}
                {me && r.id === me.id && <span className="ml-1 px-1 rounded bg-[#0e9f55] text-white text-[8px] font-black align-middle">YOU</span>}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400 min-w-0">{r.state === 'won' ? 'Challenger won' : r.state === 'lost' ? `${e.xName} won the series` : 'Series in progress'}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <Dots results={r.results} of={ser.of} />
                  <span className="w-9 text-right text-sm font-black text-slate-900 dark:text-white tabular-nums">{r.xw}-{r.cw}</span>
                </div>
              </div>
            </div>
          ))}
          {ser.rows.length > 5 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="w-full py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 cursor-pointer">
              {showAll ? 'Show fewer' : `Show all ${ser.rows.length}`}
            </button>
          )}
          {live && !paused && !isX && (
            <div className="p-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              {xRow && member && isOpen && !hiddenFromMe.has(e.xId) && xRow.ready !== false ? (
                <button type="button" onClick={() => setPicked(xRow)} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
                  Challenge {e.xName}
                </button>
              ) : !me || !plays || !rulesAccepted(join) ? (
                <button type="button" onClick={onJoin} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
                  Join {gameLabel(game)} to challenge {e.xName}
                </button>
              ) : (
                <p className="text-[11px] text-slate-500">{e.xName} is not open to challenges right now.</p>
              )}
              <p className="mt-2 text-[10px] text-slate-400">After the match, the winner logs it with the normal log button below.</p>
            </div>
          )}
        </div>
      )}
      {picked && (
        <PlayerSheet game={game} row={picked} me={me} season={season} member={member} isOpen={isOpen} hidden={hiddenFromMe.has(picked.id)} rewardRunning={false} matches={matches} stats={stats} onClose={() => setPicked(null)} />
      )}
    </div>
  );
};

/** The latest winner of a game's Special 1v1 and of its weekly reward */
export const WinnerCard: React.FC<{ game: string; winners: any[]; nowMs: number }> = ({ game, winners, nowMs }) => {
  const mine = winners.filter((w) => w.game === game && nowMs - Number(w.atMs || 0) < 30 * 86400000);
  const special = mine.find((w) => w.kind === 'special');
  const weeklyAll = mine.filter((w) => w.kind === 'weekly');
  const ref = weeklyAll[0]?.ref;
  const weekly = weeklyAll.filter((w) => w.ref === ref).sort((a, b) => Number(a.rank) - Number(b.rank));
  if (!special && weekly.length === 0) return null;
  return (
    <div className={`${card} p-4 space-y-2.5`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Latest winners</span>
      {special && (
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{special.text}</p>
          <p className="text-[11px] text-slate-500">Special 1v1, {dateShort(Number(special.atMs))}.{special.value ? ` ${naira(special.value)} food credit.` : ''}</p>
        </div>
      )}
      {weekly.length > 0 && (
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{weekly.map((w) => w.name).join(', ')}</p>
          <p className="text-[11px] text-slate-500">
            Won the last weekly reward.{weekly[0].value ? ` ${naira(weekly[0].value)} food credit${weekly.length > 1 ? ' each' : ''}.` : ''}
          </p>
        </div>
      )}
    </div>
  );
};

/** A player's matches in this contest, and the button to schedule a 1v1 with them */
const PlayerSheet: React.FC<{
  game: string;
  row: any;
  me: any;
  season: Season | null;
  member: boolean;
  isOpen: boolean;
  hidden: boolean;
  rewardRunning: boolean;
  matches: any[];
  stats: { k: string; h: string }[];
  onClose: () => void;
}> = ({ game, row, me, season, member, isOpen, hidden, rewardRunning, matches, stats, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [hid, setHid] = useState(false);
  const scored = isScored(game);
  const contest = rewardRunning ? 'reward' : 'league';
  const cap = rewardRunning ? MAX_PAIR_REWARD_WEEK : MAX_PAIR_LEAGUE_WEEK;
  const mine = matches.filter((m) => matchCounts(m) && contestOf(m) === contest && (m.aUid === row.id || m.bUid === row.id)).sort((a, b) => Number(b.loggedAtMs || 0) - Number(a.loggedAtMs || 0));
  const thisWeek = lagosWeek(Date.now());
  const vsMe = me
    ? mine.filter((m) => (m.aUid === me.id || m.bUid === me.id) && lagosWeek(Number(m.loggedAtMs || 0)) === thisWeek).length
    : 0;
  const canTap = member && row.ready !== false && isOpen && !hidden;
  const reason = !me ? 'Join this game to schedule a 1v1.' : !member ? 'Join this game and accept the rules to schedule a 1v1.' : row.ready === false ? `${row.name} has not accepted the rules yet. You can challenge them once they open Games and tap Accept the rules.` : !isOpen ? 'Challenges open when the league starts.' : hidden ? `${row.name} is not available to challenge.` : '';
  const outcome = (m: any) => {
    const w = winnerOf(m);
    return !w ? 'D' : w === row.id ? 'W' : 'L';
  };
  const opp = (m: any) => (m.aUid === row.id ? m.bName : m.aName);
  const score = (m: any) => (scored ? (m.aUid === row.id ? `${m.scoreA}-${m.scoreB}` : `${m.scoreB}-${m.scoreA}`) : '');
  const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <Modal title={row.name} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950">
          <p className="text-[10px] text-slate-500">Rank</p>
          <p className="text-base font-black text-slate-900 dark:text-white">#{row.rank}</p>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950">
          <p className="text-[10px] text-slate-500">Points</p>
          <p className="text-base font-black text-[#0e9f55]">{row.pts}</p>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950">
          <p className="text-[10px] text-slate-500">Played</p>
          <p className="text-base font-black text-slate-900 dark:text-white">{row.p}</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{stats.filter((c) => c.k !== 'p').map((c) => `${c.h} ${row[c.k] || 0}`).join(' · ')}</p>

      <div>
        <p className="text-sm font-black text-slate-900 dark:text-white mb-1.5">Logged matches</p>
        {mine.length === 0 ? (
          <p className="text-xs text-slate-400">No matches logged yet.</p>
        ) : (
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {mine.slice(0, 10).map((m) => {
              const o = outcome(m);
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                  <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${o === 'W' ? 'bg-emerald-100 text-emerald-700' : o === 'L' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{o}</span>
                  <span className="min-w-0 flex-1 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">vs {opp(m)}</span>
                  <span className="text-xs font-black tabular-nums text-slate-700 dark:text-slate-200">{score(m)}</span>
                  <ProofThumb url={proofOf(m)} size={32} />
                  <span className="text-[10px] text-slate-400 w-12 text-right">{dayOf(Number(m.loggedAtMs || 0))}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {member && (
        <p className="text-[11px] text-slate-500">
          You vs {row.name} this week: {vsMe} of {cap} matches count.
        </p>
      )}
      {canTap ? (
        <button
          type="button"
          disabled={busy || !season}
          onClick={async () => {
            if (!season) return;
            setBusy(true);
            try {
              go(await tapChallenge(game, me, row, season.id, rewardRunning));
            } catch (e: any) {
              window.alert(e?.message || 'Could not open WhatsApp.');
            }
            setBusy(false);
          }}
          className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Schedule 1v1
        </button>
      ) : (
        <p className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500">{reason}</p>
      )}
      {member && (
        <div className="flex gap-4 pt-1">
          <button type="button" onClick={() => setReporting(true)} className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 cursor-pointer">
            <Flag className="w-3 h-3" /> Report
          </button>
          <button
            type="button"
            disabled={hid || hidden}
            onClick={async () => {
              if (!window.confirm(`Hide you from ${row.name}? They will no longer be able to challenge you.`)) return;
              try {
                await hideFromPlayer(me, row);
                setHid(true);
              } catch (e: any) {
                window.alert(e?.message || 'Could not save.');
              }
            }}
            className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <EyeOff className="w-3 h-3" /> {hid ? 'Hidden from them' : 'Hide me from this player'}
          </button>
        </div>
      )}
      {reporting && <ReportSheet game={game} me={me} target={row} onClose={() => setReporting(false)} />}
    </Modal>
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
