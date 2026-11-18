import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Camera, Loader2, Users, Calendar, MessageCircle, Gamepad2, ChevronRight, ArrowLeft, Plus, Check, X, MapPin, Lock, Share2 } from 'lucide-react';
import { HOSTELS } from '../config';
import {
  GAMES,
  isScored,
  gameLabel,
  playsGame,
  knownHubUid,
  hubUid,
  restoreGamerFromLogin,
  myGamer,
  subscribeGamers,
  registerGamer,
  getRecentOpponents,
  logResult,
  confirmMatch,
  disputeMatch,
  cancelMatch,
  addMatchProof,
  resultText,
  winnerOf,
  shareWinLink,
  inviteLink,
  gameInviteLink,
  subscribeTournaments,
  subscribeEntries,
  subscribeHubSettings,
  gamesOpensAt,
  schoolsList,
  canonicalSchool,
  joinTournament,
  markEntryPaid,
  leaveTournament,
} from '../hub.js';
import { computeRows, matchCounts, matchRecorded, canDispute, weekPhase, lagosDay, DISPUTE_HOURS, AUTO_CONFIRM_HOURS, rewardConfigFor, rewardRegsFor, qualifiedAtMs } from '../boardCore.js';
import {
  subscribeSeasons,
  currentSeason,
  upcomingSeason,
  subscribeSeasonJoins,
  subscribeRewardWeeks,
  subscribeRewardJoins,
  subscribeGamesConfig,
  subscribeHiddenFromMe,
  subscribePointAdjust,
  subscribeSeasonMatches,
  activeWeekFor,
  queuedWeek,
  isChallengeable,
  rulesAccepted,
  setChallengeable,
  tapChallenge,
  joinSeason,
  pairContext,
  leagueRulesFor,
  rewardRulesFor,
  type Season,
} from '../season';
import { SeasonRulesCard, RewardCard, RewardIntro, GameRulesToggle, ChallengeTable, AnnouncementsCard, RulesSheet } from './SeasonGames';
import { HistoryButton } from './GamesHistory';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const label = 'block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const go = (url: string) => {
  window.location.href = url;
};
const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return m < 1 ? 'just now' : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return h < 48 ? 'Yesterday' : `${Math.round(h / 24)} days ago`;
};
const countdown = (ms: number) => {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};
const openDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** A WhatsApp link (?game= or ?match=) opens straight on that game */
const linkParams = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    return { game: p.get('game') || '', match: p.get('match') || '' };
  } catch {
    return { game: '', match: '' };
  }
})();

/* ================================================================== */

export const Gaming: React.FC<{ session: { name?: string; phone?: string; pin?: string }; /** Open straight on this game (from a Home tile) */ initialGame?: string }> = ({ session, initialGame }) => {
  const [game, setGame] = useState<string>(
    GAMES.some((g) => g.id === linkParams.game) ? linkParams.game : GAMES.some((g) => g.id === initialGame) ? String(initialGame) : ''
  );
  const [focusMatch, setFocusMatch] = useState(linkParams.match);
  const [uid, setUid] = useState('');
  const [gamers, setGamers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [registering, setRegistering] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [joins, setJoins] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [rewardJoins, setRewardJoins] = useState<any[]>([]);
  const [adjusts, setAdjusts] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [hiddenFromMe, setHiddenFromMe] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'best' | 'reward'>('best');

  useEffect(() => {
    knownHubUid().then(setUid);
    // Logged in to Roomly but this browser is not recognised as the player: take the profile back quietly
    if (session.phone && session.pin) {
      restoreGamerFromLogin(session.phone, session.pin).then((ok: boolean) => {
        if (ok) hubUid().then(setUid);
      });
    }
    if (linkParams.game || linkParams.match) {
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
    }
  }, []);
  useEffect(() => subscribeGamers(setGamers), []);
  useEffect(() => subscribeTournaments(setTournaments), []);
  useEffect(() => subscribeHubSettings(setSettings), []);
  useEffect(() => subscribeSeasons(setSeasons), []);
  useEffect(() => subscribeGamesConfig(setConfig), []);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  // A confirm link names the match: open its game
  useEffect(() => {
    if (!focusMatch || game) return;
    const m = matches.find((x) => x.id === focusMatch);
    if (m) setGame(m.game);
  }, [focusMatch, matches, game]);

  const me = myGamer(gamers, uid);
  const opensAt = gamesOpensAt(settings);
  const isOpen = nowMs >= opensAt;
  const season = currentSeason(seasons, nowMs);
  const upcoming = upcomingSeason(seasons, nowMs);
  const target = season || upcoming;
  useEffect(() => subscribeSeasonJoins(target?.id || '', setJoins), [target?.id]);
  useEffect(() => subscribeRewardWeeks(season?.id || '', setWeeks), [season?.id]);
  useEffect(() => subscribeRewardJoins(season?.id || '', setRewardJoins), [season?.id]);
  useEffect(() => subscribePointAdjust(season?.id || '', setAdjusts), [season?.id]);
  useEffect(() => subscribeSeasonMatches(season?.id || '', setMatches), [season?.id]);
  useEffect(() => subscribeHiddenFromMe(me?.id || '', setHiddenFromMe), [me?.id]);
  const myJoin = me ? joins.find((j) => j.gid === me.id) || null : null;

  /** The tables: players who joined the season and play the game. "ready" here means open to challenges. */
  const boards = useMemo(() => {
    const out: Record<string, any[]> = {};
    const joinById = new Map(joins.map((j) => [j.gid, j]));
    const joined = new Set(joins.map((j) => j.gid));
    GAMES.forEach((g: { id: string }) => {
      if (!season) {
        out[g.id] = [];
        return;
      }
      const w = activeWeekFor(weeks, g.id, nowMs);
      const rj = new Set(rewardJoins.filter((x) => x.game === g.id).map((x) => x.gid));
      out[g.id] = computeRows(g.id, gamers, matches, { seasonId: season.id, joined, adjusts }).map((r: any) => ({
        ...r,
        ready: isChallengeable(joinById.get(r.id), g.id, rj.has(r.id)),
        accepted: rulesAccepted(joinById.get(r.id)),
      }));
    });
    return out;
  }, [gamers, matches, season?.id, joins, weeks, rewardJoins, adjusts, nowMs]);

  /** The reward tables: only matches inside the running week, from zero, only players who joined that week */
  const rewardBoards = useMemo(() => {
    const out: Record<string, any[]> = {};
    GAMES.forEach((g: { id: string }) => {
      const w = activeWeekFor(weeks, g.id, nowMs);
      if (!season || !w) {
        out[g.id] = [];
        return;
      }
      const rj = new Set(rewardJoins.filter((x) => x.game === g.id).map((x) => x.gid));
      out[g.id] = computeRows(g.id, gamers, matches, { seasonId: season.id, joined: rj, fromMs: Number(w.startMs), toMs: Number(w.endMs), adjusts, weekKey: w.id });
    });
    return out;
  }, [gamers, matches, season?.id, weeks, rewardJoins, adjusts, nowMs]);

  const openRegister = () => setRegistering(true);

  /** Registered players (profiles), per game and overall. The tables list those who joined the season. */
  const counts: Counts = useMemo(() => {
    const byGame: Record<string, number> = {};
    GAMES.forEach((g: { id: string }) => (byGame[g.id] = gamers.filter((x) => playsGame(x, g.id)).length));
    return { all: gamers.filter((x) => GAMES.some((g: { id: string }) => playsGame(x, g.id))).length, byGame };
  }, [gamers]);
  /** Players registered for each game's reward contest (these count toward the players needed to start a reward week) */
  const acceptedCount = useMemo(() => {
    const out: Record<string, number> = {};
    GAMES.forEach((g: { id: string }) => (out[g.id] = rewardRegsFor(rewardJoins, gamers, g.id).length));
    return out;
  }, [gamers, rewardJoins]);
  /** The exact moment each game reached its minimum registered players (decides the order of reward weeks) */
  const qualAt = useMemo(() => {
    const out: Record<string, number> = {};
    GAMES.forEach((g: { id: string }) => (out[g.id] = qualifiedAtMs(rewardJoins, gamers, g.id, rewardConfigFor(config, g.id).minPlayers)));
    return out;
  }, [rewardJoins, gamers, config]);
  const acceptedAll = joins.filter((j) => rulesAccepted(j)).length;

  const gameMatches = (g: string) => matches.filter((m) => m.game === g && season && m.seasonId === season.id);
  const rewardJoinedFor = (g: string) => {
    return Boolean(me && rewardJoins.some((x) => x.game === g && x.gid === me.id));
  };

  return (
    <div className="space-y-4">
      {game ? (
        <GamePage
          game={game}
          me={me}
          board={boards[game]}
          matches={gameMatches(game)}
          tournaments={tournaments.filter((t) => t.game === game && t.status !== 'cancelled')}
          isOpen={isOpen}
          opensAt={opensAt}
          nowMs={nowMs}
          focusMatch={focusMatch}
          onFocusDone={() => setFocusMatch('')}
          onBack={() => setGame('')}
          onRegister={openRegister}
          season={season}
          join={myJoin}
          week={activeWeekFor(weeks, game, nowMs)}
          otherWeek={queuedWeek(weeks, nowMs)}
          rewardRows={rewardBoards[game] || []}
          rewardJoined={rewardJoinedFor(game)}
          config={rewardConfigFor(config, game)}
          hiddenFromMe={hiddenFromMe}
          mode={mode}
          onMode={setMode}
          registered={counts.byGame[game] || 0}
          acceptedCount={acceptedCount[game] || 0}
        />
      ) : (
        <GamesHome
          me={me}
          isCustomer={Boolean(session.phone && session.pin)}
          boards={boards}
          isOpen={isOpen}
          opensAt={opensAt}
          nowMs={nowMs}
          onPick={setGame}
          onRegister={openRegister}
          season={season}
          upcoming={upcoming}
          join={myJoin}
          joinsCount={acceptedAll}
          weeks={weeks}
          rewardJoins={rewardJoins}
          config={config}
          mode={mode}
          onMode={setMode}
          rewardBoards={rewardBoards}
          counts={counts}
          acceptedCount={acceptedCount}
          qualAt={qualAt}
        />
      )}
      {registering && (
        <RegisterSheet
          me={me}
          season={target}
          session={session}
          schools={schoolsList(settings)}
          onClose={() => setRegistering(false)}
          onSaved={() => {
            knownHubUid().then(setUid);
            setRegistering(false);
          }}
        />
      )}
    </div>
  );
};

/* ================================================================== */
/* Games home                                                          */
/* ================================================================== */

const ModeToggle: React.FC<{ mode: 'best' | 'reward'; onMode: (m: 'best' | 'reward') => void }> = ({ mode, onMode }) => (
  <div>
    <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800">
      {([['best', 'Best in Caritas'], ['reward', 'Weekly Reward Contest']] as ['best' | 'reward', string][]).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onMode(id)}
          className={`h-11 rounded-xl text-sm font-bold cursor-pointer ${mode === id ? 'bg-white dark:bg-slate-950 text-[#0e9f55] shadow-sm' : 'text-slate-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
    <p className="mt-1.5 px-1 text-[11px] text-slate-500">
      {mode === 'best'
        ? 'The season table for the whole of Caritas. Every counting match adds to it.'
        : 'One game each week. It starts from zero, and the top 3 with enough points win a food credit.'}
    </p>
  </div>
);

const Switch: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-700'}`}>
    <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
  </span>
);

type Counts = { all: number; byGame: Record<string, number> };

const GamesHome: React.FC<{
  me: any;
  isCustomer?: boolean;
  boards: Record<string, any[]>;
  isOpen: boolean;
  opensAt: number;
  nowMs: number;
  onPick: (g: string) => void;
  onRegister: () => void;
  season: Season | null;
  upcoming: Season | null;
  join: any;
  joinsCount: number;
  weeks: any[];
  rewardJoins: any[];
  config: any;
  mode: 'best' | 'reward';
  onMode: (m: 'best' | 'reward') => void;
  rewardBoards: Record<string, any[]>;
  counts: Counts;
  acceptedCount: Record<string, number>;
  qualAt: Record<string, number>;
}> = ({ me, isCustomer = false, boards, isOpen, opensAt, nowMs, onPick, onRegister, season, upcoming, join, joinsCount, weeks, rewardJoins, config, mode, onMode, rewardBoards, counts, acceptedCount, qualAt }) => {
  const myGames = me ? GAMES.filter((g: { id: string }) => playsGame(me, g.id)) : [];
  const hasAccount = myGames.length > 0;
  const myBest = hasAccount
    ? myGames
        .map((g: { id: string; label: string }) => ({ g, row: boards[g.id].find((r) => r.id === me.id) }))
        .filter((x: any) => x.row)
        .sort((a: any, b: any) => a.row.rank - b.row.rank)[0]
    : null;
  const myReward = hasAccount
    ? myGames
        .map((g: { id: string; label: string }) => {
          const w = activeWeekFor(weeks, g.id, nowMs);
          const row = w && weekPhase(w, nowMs) === 'running' && rewardJoins.some((x) => x.game === g.id && x.gid === me.id) ? (rewardBoards[g.id] || []).find((r) => r.id === me.id) : null;
          return { g, row, min: w ? Number(w.minPoints) : 0 };
        })
        .filter((x: any) => x.row)
        .sort((a: any, b: any) => a.row.rank - b.row.rank)[0]
    : null;

  /** Reward tab order: running, next, then games that are full in the order they filled, then the rest by players */
  const rewardOrder = useMemo(() => {
    const items = GAMES.map((g: { id: string; label: string }) => {
      const cfg = rewardConfigFor(config, g.id);
      const week = activeWeekFor(weeks, g.id, nowMs);
      const ph = week ? weekPhase(week, nowMs) : '';
      const at = qualAt[g.id] || 0;
      const lastEnd = weeks.filter((w) => w.game === g.id).reduce((m, w) => Math.max(m, Number(w.endMs)), 0);
      return { g, week: ph === 'running' || ph === 'scheduled' ? week : null, ph, qualified: Boolean(at), at, lastEnd, count: acceptedCount[g.id] || 0, waitPos: 0 };
    });
    const running = items.filter((x) => x.ph === 'running').sort((a, b) => Number(a.week.startMs) - Number(b.week.startMs));
    const next = items.filter((x) => x.ph === 'scheduled').sort((a, b) => Number(a.week.startMs) - Number(b.week.startMs));
    const waiting = items.filter((x) => !x.week && x.qualified).sort((a, b) => a.lastEnd - b.lastEnd || a.at - b.at);
    waiting.forEach((x, i) => (x.waitPos = next.length + running.length + i + 1));
    const filling = items.filter((x) => !x.week && !x.qualified).sort((a, b) => b.count - a.count);
    return [...running, ...next, ...waiting, ...filling];
  }, [config, weeks, qualAt, nowMs, acceptedCount]);

  return (
    <>
      {/* Summary: who you are in the league, and how you stand */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e9f55] to-emerald-700 text-white p-5 shadow-lg shadow-emerald-900/20">
        <div className="absolute top-4 right-4 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
          <Trophy className="w-6 h-6" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Roomly Caritas League</p>
        {hasAccount ? (
          <>
            <p className="mt-1 text-xs text-emerald-50/90">Playing as {me.name}</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight pr-14">
              {myBest ? `You are #${myBest.row.rank} best in Caritas in ${myBest.g.label}` : 'You are registered'}
            </h2>
            {!myBest && <p className="text-xs text-emerald-50/90 mt-1">Your place appears once the season table has your first match.</p>}
          </>
        ) : (
          <>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Best in Caritas</h2>
            <p className="text-xs text-emerald-50/90 mt-1">Your hostel. Your game. Your chance to lead.</p>
          </>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="px-3 py-2 rounded-xl bg-white/15">
            <p className="text-[10px] text-emerald-50/90">{myBest ? `Players in ${myBest.g.label}` : isOpen ? 'Challenges' : 'Challenges open in'}</p>
            <p className="text-lg font-black leading-tight">{myBest ? counts.byGame[myBest.g.id] || 0 : isOpen ? 'Open now' : countdown(opensAt - nowMs)}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/15">
            <p className="text-[10px] text-emerald-50/90">Players across all games</p>
            <p className="text-lg font-black leading-tight flex items-center gap-1.5">
              <Users className="w-4 h-4" /> {counts.all}
            </p>
          </div>
        </div>
        {myReward && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-white/15 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-emerald-50/90">Weekly reward, {myReward.g.label}</p>
              <p className="text-sm font-black leading-tight">#{myReward.row.rank} with {myReward.row.pts} pts</p>
            </div>
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">{myReward.row.pts >= myReward.min ? 'Winning' : `Needs ${myReward.min - myReward.row.pts} more`}</span>
          </div>
        )}
        {!isOpen && <p className="mt-3 text-[11px] text-emerald-50/90">Registration week. Challenges open {openDay(opensAt)}.</p>}
        {!me && <p className="mt-3 text-[11px] text-emerald-50/80">Registered before on another phone or browser? Tap Register and use the same number and PIN to get your profile back.</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onRegister} className="h-11 rounded-xl bg-white text-[#0e9f55] text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            {hasAccount ? 'Edit profile' : <><Plus className="w-4 h-4" /> {isCustomer ? 'Register as a player' : 'Register'}</>}
          </button>
          <button type="button" onClick={() => go(inviteLink(me, opensAt))} className="h-11 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            <MessageCircle className="w-4 h-4" /> Invite friends
          </button>
        </div>
      </div>

      {/* Two contests, one tap apart */}
      <ModeToggle mode={mode} onMode={onMode} />

      {mode === 'best' && (
        <>
          <SeasonRulesCard season={season} upcoming={upcoming} me={me} join={join} joinsCount={joinsCount} nowMs={nowMs} onRegister={onRegister} />

          <div className={`${card} p-4 space-y-2`}>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Choose your game</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">Compete for the best in Caritas for the featured games below.</p>
            {!hasAccount && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={onRegister} className="h-10 rounded-xl bg-[#0e9f55] text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Register
                </button>
                <button type="button" onClick={() => go(inviteLink(me, opensAt))} className="h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
                  <MessageCircle className="w-3.5 h-3.5" /> Invite
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GAMES.map((g: { id: string; label: string }) => {
              const b = boards[g.id];
              const leader = b.find((r) => r.crown);
              const mine = me && playsGame(me, g.id) ? b.find((r) => r.id === me.id) : null;
              const plays = Boolean(me && playsGame(me, g.id));
              return (
                <div key={g.id} className={`${card} p-3.5 hover:border-[#0e9f55]/50 transition-colors`}>
                  <button type="button" onClick={() => onPick(g.id)} className="w-full text-left cursor-pointer">
                  <div className="flex items-start justify-between">
                    <GameIcon game={g.id} />
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{g.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1 truncate">
                    <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate">{leader ? `${leader.name}, ${leader.pts} pts` : 'No leader yet'}</span>
                  </p>
                  {plays && (
                    <p className="mt-0.5 text-[11px] font-bold text-[#0e9f55] truncate">{mine ? `You: #${mine.rank}, ${mine.pts} pts` : 'You are registered'}</p>
                  )}
                  <p className="mt-2 text-[10px] text-slate-400">{playersText(counts.byGame[g.id] || 0, 'registered')}</p>
                </button>
                  <GameRulesToggle title="Rules" lines={leagueRulesFor(g.id)} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {mode === 'reward' && (
        <>
          <div className={`${card} overflow-hidden`}>
            <RewardIntro cfg={rewardConfigFor(config, 'dls')} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Reward weeks by game</h3>
            <p className="text-[11px] text-slate-500">Games take turns. The first game to reach {rewardConfigFor(config, 'dls').minPlayers} registered players goes first. Tap a game to open it.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {rewardOrder.map((it, idx) => {
              const g = it.g;
              const cfg = rewardConfigFor(config, g.id);
              const w = it.week;
              const ph = w ? weekPhase(w, nowMs) : '';
              const count = acceptedCount[g.id] || 0;
              const top = (rewardBoards[g.id] || [])[0];
              const joinedN = count;
              const tag = ph === 'running' ? 'This week' : ph === 'scheduled' ? 'Next week' : it.qualified ? `Waiting, ${ordinal(it.waitPos)} in line` : 'Filling up';
              const tagCls =
                ph === 'running'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : ph === 'scheduled'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
              return (
                <div key={g.id} className={`${card} p-3.5`}>
                  <button type="button" onClick={() => onPick(g.id)} className="w-full text-left cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                      <GameIcon game={g.id} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{g.label}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tagCls}`}>{tag}</span>
                        </div>
                        {ph === 'running' ? (
                          <>
                            <p className="text-[11px] font-bold text-[#0e9f55]">Closes in {countdown(Number(w.endMs) - nowMs)}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {top && top.pts > 0 ? `${top.name} leads with ${top.pts} pts` : 'No points yet'} · {playersText(joinedN, 'registered')}
                            </p>
                          </>
                        ) : ph === 'scheduled' ? (
                          <p className="text-[11px] font-bold text-amber-600">Starts {openDay(Number(w.startMs))} · {playersText(joinedN, 'registered')}</p>
                        ) : it.qualified ? (
                          <p className="text-[11px] text-slate-500">{playersText(count, 'registered')}. Enough to start, waiting for its turn.</p>
                        ) : (
                          <>
                            <p className="text-[11px] text-slate-500">
                              {count} of {cfg.minPlayers} registered players, {Math.max(0, cfg.minPlayers - count)} more to start
                            </p>
                            <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full bg-[#0e9f55]" style={{ width: `${Math.min(100, Math.round((count / Math.max(1, cfg.minPlayers)) * 100))}%` }} />
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </div>
                  </button>
                  <GameRulesToggle title={`${g.label} reward rules`} lines={rewardRulesFor(g.id, cfg)} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800" />
                </div>
              );
            })}
          </div>
        </>
      )}
      <AnnouncementsCard config={config} nowMs={nowMs} />
      <HistoryButton meId={me?.id} />
      <p className="text-center text-[10px] text-slate-400">Roomly is not affiliated with or endorsed by the makers of these games.</p>
    </>
  );
};

/** The game's own icon (public/images/games/<id>.webp). A game without one shows the gamepad instead. */
const GameIcon: React.FC<{ game: string; className?: string }> = ({ game, className = 'w-11 h-11 rounded-xl' }) => {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className={`${className} shrink-0 bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] flex items-center justify-center`}>
        <Gamepad2 className="w-1/2 h-1/2" />
      </span>
    );
  return <img src={`/images/games/${game}.webp`} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} shrink-0 object-cover bg-slate-200 dark:bg-slate-800`} />;
};
const ordinal = (n: number) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;
const playersText = (n: number, adj = '') => `${n} ${adj ? adj + ' ' : ''}${n === 1 ? 'player' : 'players'}`;

/* ================================================================== */
/* Game page                                                           */
/* ================================================================== */

const GamePage: React.FC<{
  game: string;
  me: any;
  board: any[];
  matches: any[];
  tournaments: any[];
  isOpen: boolean;
  opensAt: number;
  nowMs: number;
  focusMatch: string;
  onFocusDone: () => void;
  onBack: () => void;
  onRegister: () => void;
  season: Season | null;
  join: any;
  week: any | null;
  otherWeek: any | null;
  rewardRows: any[];
  rewardJoined: boolean;
  config: { minPlayers: number; minPoints: number; creditValue: number };
  hiddenFromMe: Set<string>;
  mode: 'best' | 'reward';
  onMode: (m: 'best' | 'reward') => void;
  registered: number;
  acceptedCount: number;
}> = ({ game, me, board, matches, tournaments, isOpen, opensAt, nowMs, focusMatch, onFocusDone, onBack, onRegister, season, join, week, otherWeek, rewardRows, rewardJoined, config, hiddenFromMe, mode, onMode, registered, acceptedCount }) => {
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const plays = playsGame(me, game);
  const accepted = rulesAccepted(join);
  const myRow = me ? board.find((r) => r.id === me.id) : null;
  const champ = board.find((r) => r.crown);
  const best = mode === 'best';
  const rewardRunning = Boolean(week && weekPhase(week, nowMs) === 'running');
  const canLog = Boolean(plays && accepted && season && isOpen);
  const toConfirm = me
    ? matches.filter((m) => m.bUid === me.id && m.status === 'pending' && canDispute(m, nowMs)).sort((a) => (a.id === focusMatch ? -1 : 0))
    : [];
  const mineOpen = me
    ? matches.filter((m) => (m.aUid === me.id || m.bUid === me.id) && (m.status === 'disputed' || (m.aUid === me.id && m.status === 'pending' && !matchRecorded(m, nowMs))))
    : [];
  const recent = matches
    .filter((m) => matchCounts(m))
    .sort((a, b) => (b.loggedAtMs || 0) - (a.loggedAtMs || 0))
    .slice(0, 8);
  const logLabel = !plays ? `Register for ${gameLabel(game)} to log results` : !season ? 'No season is running yet' : !accepted ? 'Accept the league rules to log results' : !isOpen ? `Results open ${openDay(opensAt)}` : 'I won: log my result';

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to games" className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <GameIcon game={game} className="w-10 h-10 rounded-xl" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0e9f55]">Roomly Caritas League</p>
          <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{gameLabel(game)}</h2>
        </div>
      </div>

      {best ? (
        /* The leader, then where you stand, then your two buttons */
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e9f55] to-emerald-700 text-white p-5">
          <div className="absolute top-4 right-4 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" /> Best in Caritas, {gameLabel(game)}
          </p>
          {champ ? (
            <>
              <h3 className="mt-1 text-2xl font-black pr-14">{champ.name}</h3>
              <p className="text-xs text-emerald-50/90 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {champ.origin === 'Caritas' ? champ.hostel : champ.origin === 'Guest' ? 'Guest player' : champ.origin} · {champ.pts} pts
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-1 text-xl font-black">No champion yet</h3>
              <p className="text-xs text-emerald-50/90 mt-0.5">{!season ? 'The race starts when a season begins.' : isOpen ? 'Win the first match and the crown is yours.' : `The race starts ${openDay(opensAt)}.`}</p>
            </>
          )}
          <div className="mt-4 pt-3 border-t border-white/20 space-y-2.5">
            <p className="text-sm font-bold">
              {plays
                ? myRow
                  ? champ && champ.id === me.id
                    ? 'You wear the crown.'
                    : `You: #${myRow.rank} with ${myRow.pts} pts${champ ? `, ${Math.max(0, champ.pts - myRow.pts)} behind the crown` : ''}`
                  : 'You are registered. Your place appears after your first match.'
                : 'Free to join. Your WhatsApp number stays private.'}
            </p>
            <p className="text-[11px] text-emerald-50/90">{playersText(registered, 'registered')} in {gameLabel(game)}</p>
            {plays && accepted && season && isOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await setChallengeable(season, join, me, game, !isChallengeable(join, game, rewardJoined), week);
                  } catch (e: any) {
                    window.alert(e?.message || 'Could not save.');
                  }
                  setBusy(false);
                }}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer disabled:opacity-60"
                aria-pressed={isChallengeable(join, game, rewardJoined)}
              >
                <span className="text-xs font-bold">Open to challenges</span>
                <Switch on={isChallengeable(join, game, rewardJoined)} />
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onRegister} className="h-10 rounded-xl bg-white text-[#0e9f55] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
                {plays ? 'Edit profile' : <><Plus className="w-3.5 h-3.5" /> Register for {gameLabel(game)}</>}
              </button>
              <button
                type="button"
                onClick={() => go(gameInviteLink(game, plays && myRow ? myRow.rank : 0))}
                className="h-10 rounded-xl bg-white/15 border border-white/30 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Invite friends
              </button>
            </div>
          </div>
        </div>
      ) : (
        <RewardCard
          game={game}
          week={week}
          otherWeek={otherWeek}
          rewardRows={rewardRows}
          config={config}
          me={me}
          season={season}
          join={join}
          rewardJoined={rewardJoined}
          tableCount={acceptedCount}
          nowMs={nowMs}
        />
      )}

      {best && (
        <div className={`${card} p-3.5`}>
          <GameRulesToggle title={`${gameLabel(game)} league rules`} lines={leagueRulesFor(game)} />
        </div>
      )}

      <ModeToggle mode={mode} onMode={onMode} />

      {/* Registration week */}
      {!isOpen && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <strong>Challenges open {openDay(opensAt)}</strong> (in {countdown(opensAt - nowMs)}). Register now and invite your rivals so they're on the table.
          </p>
        </div>
      )}

      {/* Results waiting for me */}
      {toConfirm.map((m) => (
        <ConfirmCard key={m.id} m={m} highlight={m.id === focusMatch} onDone={onFocusDone} nowMs={nowMs} />
      ))}
      {mineOpen.map((m) => (
        <MyOpenResult key={m.id} m={m} me={me} nowMs={nowMs} />
      ))}

      {/* Log a result: the only thing above the table. Everyone can see it, members can use it. */}
      <button
        type="button"
        disabled={!canLog}
        onClick={() => setLogging(true)}
        className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-default"
      >
        {canLog ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />} {logLabel}
      </button>

      {/* The table, with a Challenge button on every row */}
      {best ? (
        <ChallengeTable
          game={game}
          rows={board}
          me={me}
          season={season}
          join={join}
          hiddenFromMe={hiddenFromMe}
          rewardRunning={false}
          isOpen={isOpen}
          title={season ? `${season.name} table` : 'League table'}
          note="Win 3, draw 1, loss 0. #1 wears the Best in Caritas crown, whatever their school."
        />
      ) : rewardRunning ? (
        <ChallengeTable
          game={game}
          rows={rewardRows}
          me={me}
          season={season}
          join={join}
          hiddenFromMe={hiddenFromMe}
          rewardRunning
          isOpen={isOpen}
          title="Weekly reward table"
          note="Counts only matches entered this week, from zero. Only players who joined the week are listed."
          emptyText="Nobody has joined this week's reward yet."
        />
      ) : (
        <div className={`${card} p-5 text-center text-xs text-slate-400`}>No reward week is running for this game right now. The table appears here when one starts.</div>
      )}

      {best && tournaments.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <p className="px-4 pt-3 text-sm font-black text-slate-900 dark:text-white">Tournaments ({tournaments.length})</p>
          <Tournaments list={tournaments} me={me} onRegister={onRegister} />
        </div>
      )}

      {/* Recent results */}
      {best && (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Recent results</h3>
            <span className="text-[11px] text-slate-400">Counting matches</span>
          </div>
          {recent.length === 0 ? (
            <div className={`${card} p-4 text-center text-xs text-slate-400`}>No results yet.</div>
          ) : (
            <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
              {recent.map((m) => {
                const iWon = me && winnerOf(m) === me.id;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3">
                    <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Check className={`w-4 h-4 ${matchRecorded(m, nowMs) ? 'text-[#0e9f55]' : 'text-slate-400'}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{resultText(m)}</p>
                      <p className="text-[11px] text-slate-400">
                        {ago(m.loggedAtMs)}
                        {matchRecorded(m, nowMs) ? ' · recorded' : ''}
                      </p>
                    </div>
                    {iWon && (
                      <button
                        type="button"
                        onClick={() => go(shareWinLink(m, me.id, myRow?.rank))}
                        className="shrink-0 h-8 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share your win
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {logging && season && <LogResultSheet game={game} me={me} board={board} matches={matches} season={season} onClose={() => setLogging(false)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

const DisputeForm: React.FC<{ m: any; onClose: () => void }> = ({ m, onClose }) => {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={input} placeholder="What was the real result?" />
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
        <Camera className="w-4 h-4 text-rose-600" />
        <span>{file ? file.name : 'Screenshot of the final score (recommended)'}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await disputeMatch(m, note, file);
              onClose();
            } catch (e: any) {
              window.alert(e?.message || 'Could not send.');
            }
            setBusy(false);
          }}
          className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
        >
          Send to Roomly
        </button>
        <button type="button" onClick={onClose} className="px-4 h-10 text-xs font-bold text-slate-500 cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
};

const ConfirmCard: React.FC<{ m: any; highlight: boolean; onDone: () => void; nowMs: number }> = ({ m, highlight, onDone, nowMs }) => {
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const hoursLeft = Math.max(0, Math.ceil((AUTO_CONFIRM_HOURS * 3600000 - (nowMs - (m.loggedAtMs || 0))) / 3600000));
  return (
    <div className={`p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border ${highlight ? 'border-[#0e9f55]' : 'border-emerald-200 dark:border-emerald-900'} space-y-3`}>
      <div>
        <p className="text-[11px] text-slate-500">{m.aName} logged a result. It already counts. {hoursLeft > 0 ? `It shows as recorded in ${hoursLeft}h.` : 'It is recorded.'} Report it within {DISPUTE_HOURS} hours if it is wrong.</p>
        <p className="text-base font-black text-slate-900 dark:text-white">{resultText(m)}</p>
      </div>
      {disputing ? (
        <DisputeForm m={m} onClose={() => setDisputing(false)} />
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await confirmMatch(m);
                onDone();
              } catch (e: any) {
                window.alert(e?.message || 'Could not confirm.');
              }
              setBusy(false);
            }}
            className="h-10 px-4 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" /> Confirm
          </button>
          <button type="button" onClick={() => setDisputing(true)} className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            That's not the result
          </button>
        </div>
      )}
    </div>
  );
};

/** Results I logged that are still waiting, and disputes */
const MyOpenResult: React.FC<{ m: any; me: any; nowMs: number }> = ({ m, me }) => {
  const [busy, setBusy] = useState(false);
  const iLogged = m.aUid === me.id;
  return (
    <div className={`${card} p-3.5 space-y-2`}>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{resultText(m)}</p>
      <p className="text-[11px] text-slate-500">
        {m.status === 'disputed'
          ? 'Disputed. Roomly will check the screenshots and decide.'
          : `Counts now. ${m.bName} can confirm it, or it shows as recorded after ${AUTO_CONFIRM_HOURS} hours.`}
      </p>
      {m.status === 'pending' && iLogged && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await cancelMatch(m).catch(() => {});
            setBusy(false);
          }}
          className="text-xs font-bold text-rose-600 cursor-pointer"
        >
          Take it back
        </button>
      )}
      {m.status === 'disputed' && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
          <Camera className="w-4 h-4 text-[#0e9f55]" />
          <span>{(iLogged ? m.proofA : m.proofB) ? 'Screenshot sent. Replace it' : 'Add a screenshot of the final score'}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addMatchProof(m, me.id, f).catch(() => window.alert('Could not upload.'));
            }}
          />
        </label>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
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

const RegisterSheet: React.FC<{ me: any; season: Season | null; session: { name?: string; phone?: string; pin?: string }; schools: string[]; onClose: () => void; onSaved: () => void }> = ({
  me,
  season,
  session,
  schools,
  onClose,
  onSaved,
}) => {
  const [rulesRead, setRulesRead] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [name, setName] = useState(me?.name || session.name || '');
  const [hostel, setHostel] = useState(me?.hostel || '');
  const [school, setSchool] = useState<'caritas' | 'other' | 'guest'>(me?.school || 'caritas');
  const [schoolName, setSchoolName] = useState(me?.schoolName || '');
  // "Other school": pick from the list, or "My school isn't listed" and type it
  const [typingSchool, setTypingSchool] = useState(Boolean(me?.schoolName) && !schools.some((x) => canonicalSchool(me.schoolName, schools) === x));
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('roomly_gamer_phone') || session.phone || '';
    } catch {
      return session.phone || '';
    }
  });
  const [pin, setPin] = useState(session.pin || '');
  const [games, setGames] = useState<string[]>(me?.games || []);
  const [ids, setIds] = useState<Record<string, string>>(me?.ids || {});
  const [freeNote, setFreeNote] = useState(me?.freeNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (g: string) => setGames(games.includes(g) ? games.filter((x) => x !== g) : [...games, g]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const auto = Boolean(season && season.autoJoin !== false);
      if (!me && auto && !rulesRead) throw new Error('Tick the box to say you have read the game rules.');
      const created = await registerGamer({ name, school, schoolName: canonicalSchool(schoolName, schools), hostel, phone, pin, games, ids, freeNote });
      // A new player goes straight onto the season tables (the rules tick is stored with the join)
      if (!me && auto && season) await joinSeason(season, created).catch(() => {});
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <Sheet title={me ? 'Your player profile' : 'Join the Roomly Caritas League'} onClose={onClose}>
      <p className="text-xs text-slate-500">One profile for the games you play, tied to your Roomly account. Your WhatsApp number stays private.</p>
      <div>
        <label className={label}>Gamer name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={input} placeholder="e.g. Tobi" />
      </div>
      <div>
        <label className={label}>School</label>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['caritas', 'Caritas'],
            ['other', 'Other school'],
            ['guest', 'Guest'],
          ] as const).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSchool(k)}
              aria-pressed={school === k}
              className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                school === k ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {school === 'guest' && <p className="mt-1 text-[11px] text-slate-400">Not a student? You can still play and challenge anyone.</p>}
      </div>
      {school === 'other' && (
        <div>
          <label className={label}>Your school</label>
          <div className="grid grid-cols-2 gap-1.5">
            {schools.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => {
                  setSchoolName(x);
                  setTypingSchool(false);
                }}
                aria-pressed={!typingSchool && schoolName === x}
                className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer truncate ${
                  !typingSchool && schoolName === x ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {x}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setTypingSchool(true);
                setSchoolName('');
              }}
              aria-pressed={typingSchool}
              className={`col-span-2 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                typingSchool ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
              }`}
            >
              My school isn't listed
            </button>
          </div>
          {typingSchool && (
            <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={30} className={`${input} mt-2`} placeholder="Type your school's name" />
          )}
        </div>
      )}
      {school === 'caritas' && (
      <div>
        <label className={label}>Hostel</label>
        <select value={hostel} onChange={(e) => setHostel(e.target.value)} className={input}>
          <option value="">Choose your hostel</option>
          {HOSTELS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
          <option value="Lodge">Lodge</option>
        </select>
      </div>
      )}
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <div>
          <label className={label}>WhatsApp number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={input} placeholder="080..." />
        </div>
        <div>
          <label className={label}>Roomly PIN</label>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} className={input} placeholder="4 digits" />
        </div>
      </div>
      <p className="-mt-2 text-[10px] text-slate-400">Same number and PIN you use at checkout. New to Roomly? Choose a 4-digit PIN now.</p>
      <div>
        <label className={label}>Which games do you play?</label>
        <div className="flex flex-wrap gap-2">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={`h-10 px-4 rounded-full text-xs font-bold border cursor-pointer ${
                games.includes(g.id)
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {games.length > 0 && (
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 space-y-2.5">
          <p className="text-[11px] font-bold text-slate-500">Player ID is optional</p>
          {games.map((g) => (
            <div key={g}>
              <label className="block text-[11px] text-slate-500 mb-1">{gameLabel(g)} ID</label>
              <input value={ids[g] || ''} onChange={(e) => setIds({ ...ids, [g]: e.target.value })} maxLength={40} className={input} placeholder="Add ID if you use one" />
            </div>
          ))}
        </div>
      )}
      <div>
        <label className={label}>When are you usually free? (optional)</label>
        <input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} maxLength={60} className={input} placeholder="e.g. Evenings after 8pm" />
      </div>
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      {!me && season && season.autoJoin !== false && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={rulesRead} onChange={(e) => setRulesRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0e9f55]" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            I have read the <button type="button" onClick={() => setRulesOpen(true)} className="underline text-[#0e9f55]">game rules</button> and agree to follow them. This puts me on the {season.name} table.
          </span>
        </label>
      )}
      {rulesOpen && <RulesSheet onClose={() => setRulesOpen(false)} />}
      <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {me ? 'Save profile' : 'Save registration'}
      </button>
    </Sheet>
  );
};

const LogResultSheet: React.FC<{ game: string; me: any; board: any[]; matches: any[]; season: Season; onClose: () => void }> = ({ game, me, board, matches, season, onClose }) => {
  const [opps, setOpps] = useState<any[] | null>(null);
  const [opp, setOpp] = useState('');
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [kills, setKills] = useState('');
  const [damage, setDamage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ctx, setCtx] = useState<{ challengerId: string } | null>(null);
  const scored = isScored(game);

  useEffect(() => {
    getRecentOpponents(me, game)
      .then((ids: string[]) => setOpps(board.filter((r) => ids.includes(r.id))))
      .catch(() => setOpps([]));
  }, [game]);
  useEffect(() => {
    setCtx(null);
    if (opp) pairContext(me, opp, game).then(setCtx).catch(() => setCtx(null));
  }, [opp]);

  const today = lagosDay(Date.now());
  const playedToday = opp
    ? matches.filter((m) => matchCounts(m) && ((m.aUid === me.id && m.bUid === opp) || (m.aUid === opp && m.bUid === me.id)) && lagosDay(m.loggedAtMs || 0) === today).length
    : 0;
  const o = board.find((r) => r.id === opp);

  const submit = async () => {
    setError('');
    if (!o) return setError('Pick your opponent.');
    if (playedToday >= 2) return setError('You have already logged 2 matches against this player today.');
    let a = 1;
    let b = 0;
    if (scored) {
      if (mine === '' || theirs === '') return setError('Enter both scores.');
      a = Number(mine);
      b = Number(theirs);
      if (a < b) return setError('Only the winner logs the result. Ask your opponent to log it.');
    }
    if (!file) return setError('Add a screenshot of the final score.');
    setBusy(true);
    try {
      const link = await logResult(game, me, o, a, b, file, {
        seasonId: season.id,
        kills: scored ? 0 : Number(kills) || 0,
        damage: scored ? 0 : Number(damage) || 0,
        homeUid: ctx?.challengerId === me.id ? o.id : me.id,
      });
      onClose();
      go(link);
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <Sheet title={`Log a ${gameLabel(game)} win`} onClose={onClose}>
      {opps === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : opps.length === 0 ? (
        <p className="text-sm text-slate-500">You can log a result against players you challenged through Roomly (or who challenged you) in the last 3 days.</p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">Only the winner logs the result. A screenshot of the final score is required.</p>
          <div>
            <label className={label}>Opponent</label>
            <select value={opp} onChange={(e) => setOpp(e.target.value)} className={input}>
              <option value="">Choose your opponent</option>
              {opps.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.school === 'guest' ? 'Guest' : x.school === 'other' ? x.schoolName || 'Other school' : x.hostel})
                </option>
              ))}
            </select>
          </div>
          {scored ? (
            <>
              {o && ctx && <p className="text-[11px] text-slate-500">Home team: {ctx.challengerId === me.id ? o.name : 'you'} (the player who was challenged).</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Your goals</label>
                  <input value={mine} onChange={(e) => setMine(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={`${input} text-center text-lg font-black`} placeholder="0" />
                </div>
                <div>
                  <label className={label}>Their goals</label>
                  <input value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={`${input} text-center text-lg font-black`} placeholder="0" />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Your kills</label>
                <input value={kills} onChange={(e) => setKills(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={`${input} text-center text-lg font-black`} placeholder="0" />
              </div>
              <div>
                <label className={label}>Your damage</label>
                <input value={damage} onChange={(e) => setDamage(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" className={`${input} text-center text-lg font-black`} placeholder="0" />
              </div>
              <p className="col-span-2 text-[11px] text-slate-500">You are logging that you won this match.</p>
            </div>
          )}
          {playedToday >= 2 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">You already played this person twice today. A third match will not be accepted.</p>}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <Camera className="w-4 h-4 text-[#0e9f55]" />
            <span>{file ? file.name : 'Screenshot of the final score (required)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <button type="button" disabled={busy} onClick={submit} className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save and send on WhatsApp
          </button>
          <p className="text-[11px] text-slate-400 text-center">It counts now. Your opponent can report it within {DISPUTE_HOURS} hours.</p>
        </>
      )}
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */

const Tournaments: React.FC<{ list: any[]; me: any; onRegister: () => void }> = ({ list, me, onRegister }) => {
  const [account, setAccount] = useState<any>(null);
  useEffect(() => subscribeHubSettings((s: any) => setAccount(s?.tourneyAccount || null)), []);
  if (!list.length) return <p className="p-5 text-center text-xs text-slate-400">No tournament for this game yet. Watch this space.</p>;
  const order: Record<string, number> = { open: 0, closed: 1, done: 2 };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.startAtMs || 0) - (b.startAtMs || 0));
  return (
    <div className="p-3 space-y-3">
      {sorted.map((t) => (
        <TournamentCard key={t.id} t={t} me={me} account={account} onRegister={onRegister} />
      ))}
    </div>
  );
};

const TournamentCard: React.FC<{ t: any; me: any; account: any; onRegister: () => void }> = ({ t, me, account, onRegister }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => subscribeEntries(t.id, setEntries), [t.id]);
  const mine = me ? entries.find((e) => e.id === me.id) : null;
  const confirmed = entries.filter((e) => e.confirmed);
  const full = entries.length >= t.slots;
  const fee = Number(t.fee) || 0;
  const pct = Math.min(100, Math.round((entries.length / Math.max(1, t.slots)) * 100));
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white">{t.title}</p>
          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
            <Calendar className="w-3 h-3" />
            {new Date(t.startAtMs).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            {t.format ? ` · ${t.format}` : ''}
          </p>
        </div>
        <span className="shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[10px] font-bold text-[#0e9f55]">
          {fee ? `${naira(fee)} entry` : 'Free entry'}
        </span>
      </div>

      {t.status === 'done' && t.results ? (
        <div className="text-xs space-y-0.5 text-slate-700 dark:text-slate-200">
          {t.results.first?.name && <p><strong>1st:</strong> {t.results.first.name}</p>}
          {t.results.second?.name && <p><strong>2nd:</strong> {t.results.second.name}</p>}
          {t.results.third?.name && <p><strong>3rd:</strong> {t.results.third.name}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {entries.length}/{t.slots} slots filled
            </span>
            {t.prizeText && <span className="font-bold text-slate-700 dark:text-slate-200 truncate ml-2">Prize: {t.prizeText.split('\n')[0]}</span>}
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-[#0e9f55] rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      {t.prizeText && t.prizeText.includes('\n') && <p className="text-[11px] text-slate-500 whitespace-pre-line">{t.prizeText}</p>}
      {t.bracketText && <p className="text-[11px] text-slate-500 whitespace-pre-line border-t border-slate-100 dark:border-slate-800 pt-2">{t.bracketText}</p>}

      {t.status === 'open' && !mine && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{full ? 'Full' : `${t.slots - entries.length} slots left`}</span>
          {!me || !playsGame(me, t.game) ? (
            <button type="button" onClick={onRegister} className="h-10 px-4 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
              {me ? `Add ${gameLabel(t.game)}` : 'Register to join'}
            </button>
          ) : (
            <button type="button" disabled={busy || full} onClick={() => run(() => joinTournament(t, me))} className="h-10 px-5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer disabled:opacity-50">
              Join
            </button>
          )}
        </div>
      )}
      {mine && !mine.confirmed && fee > 0 && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 space-y-2 text-xs">
          {account?.number ? (
            <>
              <p className="text-blue-900 dark:text-blue-200">
                Send <strong>{naira(fee)}</strong> to {account.bank} <strong>{account.number}</strong> ({account.name}), then tap below.
              </p>
              {mine.paid ? (
                <p className="font-bold text-blue-900 dark:text-blue-200">Payment sent. Waiting for Roomly to confirm.</p>
              ) : (
                <button type="button" disabled={busy} onClick={() => run(() => markEntryPaid(t.id, me.id))} className="w-full h-10 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer">
                  I've paid
                </button>
              )}
            </>
          ) : (
            <p className="text-blue-900 dark:text-blue-200">Payment details will show here soon. Your slot is held.</p>
          )}
          {!mine.paid && (
            <button type="button" disabled={busy} onClick={() => run(() => leaveTournament(t.id, me.id))} className="text-rose-600 font-bold cursor-pointer">
              Leave
            </button>
          )}
        </div>
      )}
      {mine?.confirmed && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
          <p className="font-bold">You're in. Good luck!</p>
          {t.whatsapp && (
            <a href={t.whatsapp} target="_blank" rel="noreferrer" className="font-bold text-[#0e9f55] underline">
              Join the players' WhatsApp group
            </a>
          )}
        </div>
      )}
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
      {confirmed.length > 0 && (
        <details className="text-[11px]">
          <summary className="font-bold text-slate-600 dark:text-slate-300 cursor-pointer">Confirmed players ({confirmed.length})</summary>
          <p className="mt-1 text-slate-500 leading-relaxed">{confirmed.map((e) => e.name).join(' · ')}</p>
        </details>
      )}
      <details className="text-[10px] text-slate-500">
        <summary className="font-bold cursor-pointer">Rules</summary>
        <ul className="mt-1 space-y-0.5 list-disc pl-4">
          <li>Both players screenshot the final score.</li>
          <li>Each round has a deadline. A no-show loses the match.</li>
          <li>The host's decision is final.</li>
          <li>If the slots aren't full by the start, everyone gets a full refund within 24 hours.</li>
          <li>Skill only. No side bets on matches.</li>
        </ul>
      </details>
    </div>
  );
};
