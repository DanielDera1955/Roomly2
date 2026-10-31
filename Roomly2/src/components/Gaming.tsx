import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Camera, Loader2, Users, Calendar, MessageCircle, Gamepad2, ChevronRight, ArrowLeft, Plus, Check, X, MapPin, Lock, Share2 } from 'lucide-react';
import { HOSTELS } from '../config';
import {
  GAMES,
  READY_CHOICES,
  AUTO_CONFIRM_HOURS,
  isScored,
  gameLabel,
  playsGame,
  readyFor,
  knownHubUid,
  myGamer,
  subscribeGamers,
  registerGamer,
  setReady,
  challengeOnWhatsApp,
  getRecentOpponents,
  subscribeAllMatches,
  logResult,
  confirmMatch,
  disputeMatch,
  cancelMatch,
  addMatchProof,
  matchCounts,
  resultText,
  winnerOf,
  shareWinLink,
  inviteLink,
  subscribeTournaments,
  subscribeEntries,
  subscribeHubSettings,
  gamesOpensAt,
  joinTournament,
  markEntryPaid,
  leaveTournament,
  computeBoard,
} from '../hub.js';

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

export const Gaming: React.FC<{ session: { name?: string; phone?: string; pin?: string } }> = ({ session }) => {
  const [game, setGame] = useState<string>(GAMES.some((g) => g.id === linkParams.game) ? linkParams.game : '');
  const [focusMatch, setFocusMatch] = useState(linkParams.match);
  const [uid, setUid] = useState('');
  const [gamers, setGamers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [registering, setRegistering] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    knownHubUid().then(setUid);
    if (linkParams.game || linkParams.match) {
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
    }
  }, []);
  useEffect(() => subscribeGamers(setGamers), []);
  useEffect(() => subscribeAllMatches(setMatches), []);
  useEffect(() => subscribeTournaments(setTournaments), []);
  useEffect(() => subscribeHubSettings(setSettings), []);
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
  const boards = useMemo(() => {
    const out: Record<string, any[]> = {};
    GAMES.forEach((g) => (out[g.id] = computeBoard(g.id, gamers, matches, tournaments, nowMs)));
    return out;
  }, [gamers, matches, tournaments, nowMs]);

  const openRegister = () => setRegistering(true);

  return (
    <div className="space-y-4">
      {game ? (
        <GamePage
          game={game}
          me={me}
          board={boards[game]}
          matches={matches.filter((m) => m.game === game)}
          tournaments={tournaments.filter((t) => t.game === game && t.status !== 'cancelled')}
          isOpen={isOpen}
          opensAt={opensAt}
          nowMs={nowMs}
          focusMatch={focusMatch}
          onFocusDone={() => setFocusMatch('')}
          onBack={() => setGame('')}
          onRegister={openRegister}
        />
      ) : (
        <GamesHome me={me} gamers={gamers} boards={boards} isOpen={isOpen} opensAt={opensAt} nowMs={nowMs} onPick={setGame} onRegister={openRegister} />
      )}
      {registering && (
        <RegisterSheet
          me={me}
          session={session}
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

const GamesHome: React.FC<{
  me: any;
  gamers: any[];
  boards: Record<string, any[]>;
  isOpen: boolean;
  opensAt: number;
  nowMs: number;
  onPick: (g: string) => void;
  onRegister: () => void;
}> = ({ me, gamers, boards, isOpen, opensAt, nowMs, onPick, onRegister }) => {
  const registered = gamers.filter((g) => !g.banned).length;
  const myBest = me
    ? GAMES.filter((g) => playsGame(me, g.id))
        .map((g) => ({ g, row: boards[g.id].find((r) => r.id === me.id) }))
        .filter((x) => x.row)
        .sort((a, b) => a.row.rank - b.row.rank)[0]
    : null;
  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e9f55] to-emerald-700 text-white p-5 shadow-lg shadow-emerald-900/20">
        <div className="absolute top-4 right-4 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
          <Trophy className="w-6 h-6" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Roomly hostel league</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight">Best in Caritas</h2>
        <p className="text-xs text-emerald-50/90 mt-1">Your hostel. Your game. Your chance to lead.</p>
        <div className="mt-4 flex gap-2">
          <div className="px-3 py-2 rounded-xl bg-white/15">
            <p className="text-[10px] text-emerald-50/90">{isOpen ? 'Challenges' : 'Challenges open in'}</p>
            <p className="text-lg font-black leading-tight">{isOpen ? 'Open now' : countdown(opensAt - nowMs)}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/15">
            <p className="text-[10px] text-emerald-50/90">Registered players</p>
            <p className="text-lg font-black leading-tight flex items-center gap-1.5">
              <Users className="w-4 h-4" /> {registered}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-emerald-50/90">
          {isOpen
            ? me && myBest
              ? `You're #${myBest.row.rank} in ${myBest.g.label}. Keep climbing.`
              : 'Register, go Ready to play and start climbing the table.'
            : `Registration week. Challenges open ${openDay(opensAt)}. Get your profile ready before then.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onRegister} className="h-11 rounded-xl bg-white text-[#0e9f55] text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            {me ? 'Edit profile' : <><Plus className="w-4 h-4" /> Register</>}
          </button>
          <button
            type="button"
            onClick={() => go(inviteLink(me, opensAt))}
            className="h-11 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" /> Invite friends
          </button>
        </div>
      </div>

      {/* Game cards */}
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Choose your game</h3>
          <p className="text-[11px] text-slate-500">See the leader and who is ready now.</p>
        </div>
        <span className="text-[11px] text-slate-400">{GAMES.length} games</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g) => {
          const b = boards[g.id];
          const leader = b.find((r) => r.crown);
          const ready = b.filter((r) => r.ready).length;
          return (
            <button key={g.id} type="button" onClick={() => onPick(g.id)} className={`${card} p-3.5 text-left cursor-pointer hover:border-[#0e9f55]/50 transition-colors`}>
              <div className="flex items-start justify-between">
                <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] flex items-center justify-center">
                  <Gamepad2 className="w-4.5 h-4.5" />
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
              <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{g.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1 truncate">
                <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="truncate">{leader ? `${leader.name} leads` : 'No leader yet'}</span>
              </p>
              <div className="mt-3 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">{b.length} players</span>
                <span className="font-bold text-[#0e9f55]">{isOpen ? `${ready} ready now` : ''}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
};

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
}> = ({ game, me, board, matches, tournaments, isOpen, opensAt, nowMs, focusMatch, onFocusDone, onBack, onRegister }) => {
  const [tab, setTab] = useState<'table' | 'tournaments'>('table');
  const [logging, setLogging] = useState(false);
  const plays = playsGame(me, game);
  const myRow = me ? board.find((r) => r.id === me.id) : null;
  const champ = board.find((r) => r.crown);
  const ready = board.filter((r) => r.ready && r.id !== me?.id);
  const toConfirm = me
    ? matches.filter((m) => m.bUid === me.id && m.status === 'pending').sort((a) => (a.id === focusMatch ? -1 : 0))
    : [];
  const mineOpen = me ? matches.filter((m) => (m.aUid === me.id || m.bUid === me.id) && (m.status === 'disputed' || (m.aUid === me.id && m.status === 'pending' && !matchCounts(m, nowMs)))) : [];
  const recent = matches
    .filter((m) => matchCounts(m, nowMs))
    .sort((a, b) => (b.loggedAtMs || 0) - (a.loggedAtMs || 0))
    .slice(0, 8);

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to games" className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0e9f55]">Best in Caritas</p>
          <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{gameLabel(game)}</h2>
        </div>
      </div>

      {/* My profile */}
      {plays ? (
        <MyProfileCard me={me} row={myRow} game={game} isOpen={isOpen} opensAt={opensAt} nowMs={nowMs} onEdit={onRegister} />
      ) : (
        <div className={`${card} p-4 flex items-center justify-between gap-3`}>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{me ? `Add ${gameLabel(game)} to your games` : 'Join the league'}</p>
            <p className="text-[11px] text-slate-500">{me ? 'Then you show on this table.' : 'Free. Your WhatsApp number stays private.'}</p>
          </div>
          <button type="button" onClick={onRegister} className="shrink-0 h-10 px-4 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
            {me ? 'Edit' : 'Register'}
          </button>
        </div>
      )}

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

      {/* Champion spotlight */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e9f55] to-emerald-700 text-white p-5">
        <div className="absolute top-4 right-4 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
          <Trophy className="w-6 h-6" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100 flex items-center gap-1.5">
          <Crown className="w-3.5 h-3.5" /> Best in Caritas
        </p>
        {champ ? (
          <>
            <h3 className="mt-1 text-2xl font-black">{champ.name}</h3>
            <p className="text-xs text-emerald-50/90 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" /> {champ.hostel}
            </p>
            <p className="mt-3 text-xs font-bold">
              {champ.pts} points <span className="font-medium text-emerald-50/90 ml-2">{isScored(game) ? `${champ.w}W · ${champ.d}D · ${champ.l}L` : `${champ.w}W · ${champ.l}L`}</span>
            </p>
            <div className="mt-4">
              {champ.id === me?.id ? (
                <span className="inline-flex h-10 items-center px-4 rounded-xl bg-white/15 text-sm font-bold">That's you. Defend it.</span>
              ) : champ.ready && isOpen && plays ? (
                <ChallengeButton game={game} me={me} row={champ} myRank={myRow?.rank} big />
              ) : (
                <span className="inline-flex h-10 items-center gap-1.5 px-4 rounded-xl bg-white/15 text-sm font-bold text-emerald-50/90">
                  <MessageCircle className="w-4 h-4" /> {!isOpen ? `Opens ${openDay(opensAt)}` : 'Not ready now'}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <h3 className="mt-1 text-xl font-black">No champion yet</h3>
            <p className="text-xs text-emerald-50/90 mt-1">{isOpen ? 'Win the first matches and the crown is yours.' : `The race starts ${openDay(opensAt)}.`}</p>
          </>
        )}
      </div>

      {/* Ready to play now */}
      {isOpen && (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Ready to play now</h3>
              <p className="text-[11px] text-slate-500">Challenge anyone in Caritas.</p>
            </div>
            <span className="text-[11px] font-bold text-[#0e9f55]">{ready.length} ready</span>
          </div>
          {ready.length === 0 ? (
            <div className={`${card} p-4 text-center text-xs text-slate-400`}>Nobody is ready yet. Switch yours on so others can find you.</div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-3 px-3 pb-1 snap-x">
              {ready.map((r) => (
                <div key={r.id} className={`${card} p-3 w-36 shrink-0 snap-start`}>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{r.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {r.pts} pts · {r.hostel}
                  </p>
                  {r.freeNote && <p className="text-[10px] text-slate-400 truncate mt-0.5">{r.freeNote}</p>}
                  <div className="mt-2.5">
                    {plays ? (
                      <ChallengeButton game={game} me={me} row={r} myRank={myRow?.rank} />
                    ) : (
                      <button type="button" onClick={onRegister} className="w-full h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-xs font-bold cursor-pointer">
                        Register
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Log a result */}
      {plays && (
        <button
          type="button"
          disabled={!isOpen}
          onClick={() => setLogging(true)}
          className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {isOpen ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {isOpen ? 'Log a match result' : `Results open ${openDay(opensAt)}`}
        </button>
      )}

      {/* Table / Tournaments */}
      <div className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-2 gap-1 p-1 border-b border-slate-100 dark:border-slate-800">
          {(['table', 'tournaments'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-10 rounded-xl text-sm font-bold cursor-pointer ${tab === t ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55]' : 'text-slate-500'}`}
            >
              {t === 'table' ? 'Table' : `Tournaments${tournaments.length ? ` (${tournaments.length})` : ''}`}
            </button>
          ))}
        </div>
        {tab === 'table' ? <LeagueTable game={game} board={board} meId={me?.id} /> : <Tournaments list={tournaments} me={me} onRegister={onRegister} />}
      </div>

      {/* Recent results */}
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Recent results</h3>
          <span className="text-[11px] text-slate-400">Confirmed matches</span>
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
                    <Check className="w-4 h-4 text-slate-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{resultText(m)}</p>
                    <p className="text-[11px] text-slate-400">{ago(m.loggedAtMs)}</p>
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

      {logging && <LogResultSheet game={game} me={me} board={board} onClose={() => setLogging(false)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */

const MyProfileCard: React.FC<{ me: any; row: any; game: string; isOpen: boolean; opensAt: number; nowMs: number; onEdit: () => void }> = ({
  me,
  row,
  game,
  isOpen,
  opensAt,
  nowMs,
  onEdit,
}) => {
  const [choice, setChoice] = useState('1w');
  const [busy, setBusy] = useState(false);
  const on = readyFor(me, game, nowMs);
  const toggle = async () => {
    setBusy(true);
    try {
      await setReady(me, game, on ? null : choice);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy(false);
  };
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#0e9f55] font-black flex items-center justify-center">
          {String(me.name || 'R')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">My profile</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {me.name} <span className="font-normal text-slate-400">· {me.hostel}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {row ? `${row.pts} pts · #${row.rank} in ${gameLabel(game)}` : ''}
          </p>
        </div>
        <button type="button" onClick={onEdit} className="text-xs font-bold text-[#0e9f55] cursor-pointer">
          Edit
        </button>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button type="button" disabled={busy || !isOpen} onClick={toggle} className="flex items-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-default" aria-pressed={on}>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Ready to play</span>
          <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-700'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
          </span>
        </button>
        {!isOpen ? (
          <span className="text-[11px] text-slate-400">From {openDay(opensAt)}</span>
        ) : on ? (
          <span className="text-[11px] text-slate-500">Until {new Date(Number(me.ready?.[game])).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        ) : (
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white">
            {READY_CHOICES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

const ChallengeButton: React.FC<{ game: string; me: any; row: any; myRank?: number; big?: boolean }> = ({ game, me, row, myRank, big }) => {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      go(await challengeOnWhatsApp(game, me, row, myRank));
    } catch (e: any) {
      window.alert(e?.message || 'Could not open WhatsApp.');
    }
    setBusy(false);
  };
  return big ? (
    <button type="button" disabled={busy} onClick={click} className="inline-flex h-10 items-center gap-1.5 px-4 rounded-xl bg-white text-[#0e9f55] text-sm font-bold cursor-pointer">
      <MessageCircle className="w-4 h-4" /> Challenge
    </button>
  ) : (
    <button type="button" disabled={busy} onClick={click} className="w-full h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-xs font-bold cursor-pointer">
      Challenge
    </button>
  );
};

const LeagueTable: React.FC<{ game: string; board: any[]; meId?: string }> = ({ game, board, meId }) => {
  const scored = isScored(game);
  if (!board.length) return <p className="p-5 text-center text-xs text-slate-400">No players yet. Register and be the first on the table.</p>;
  const head = 'text-[10px] font-bold text-slate-400 text-center';
  const cell = 'text-xs text-slate-700 dark:text-slate-300 text-center tabular-nums';
  const cols = scored ? 'grid-cols-[22px_1fr_22px_22px_22px_22px_32px_30px]' : 'grid-cols-[22px_1fr_26px_26px_26px_32px]';
  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-sm font-black text-slate-900 dark:text-white">League table</p>
        <span className="text-[11px] text-slate-400">{board.length} players</span>
      </div>
      <div className={`grid ${cols} gap-1 px-1 py-1.5 border-b border-slate-100 dark:border-slate-800`}>
        <span className={head}>#</span>
        <span className={`${head} text-left`}>Player</span>
        <span className={head}>P</span>
        <span className={head}>W</span>
        {scored && <span className={head}>D</span>}
        <span className={head}>L</span>
        {scored && <span className={head}>GD</span>}
        <span className={head}>Pts</span>
      </div>
      {board.map((r) => (
        <div
          key={r.id}
          className={`grid ${cols} gap-1 items-center px-1 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${
            r.id === meId ? 'bg-emerald-50 dark:bg-emerald-950/40 rounded-lg' : ''
          }`}
        >
          <span className="text-xs font-bold text-slate-500 text-center flex items-center justify-center">
            {r.crown ? <Crown className="w-3.5 h-3.5 text-amber-500" /> : r.rank}
          </span>
          <span className="min-w-0 flex items-center gap-1">
            <span className={`text-xs truncate ${r.id === meId ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>{r.name}</span>
            {r.titles > 0 && <Trophy className="w-3 h-3 text-amber-500 shrink-0" />}
            {r.ready && <span className="w-1.5 h-1.5 rounded-full bg-[#0e9f55] shrink-0" title="Ready to play" />}
          </span>
          <span className={cell}>{r.p}</span>
          <span className={cell}>{r.w}</span>
          {scored && <span className={cell}>{r.d}</span>}
          <span className={cell}>{r.l}</span>
          {scored && <span className={cell}>{r.gd > 0 ? `+${r.gd}` : r.gd}</span>}
          <span className="text-xs font-black text-[#0e9f55] text-center tabular-nums">{r.pts}</span>
        </div>
      ))}
      <p className="mt-2 px-1 text-[10px] text-slate-400 flex items-center gap-1">
        <Crown className="w-3 h-3 text-amber-500" /> #1 wears the Best in Caritas crown. Win 3, draw 1, loss 0.
      </p>
    </div>
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
        <p className="text-[11px] text-slate-500">{m.aName} logged a result. {hoursLeft > 0 ? `It counts by itself in ${hoursLeft}h.` : 'It already counts. You can still say it is wrong.'}</p>
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
          : `Waiting for ${m.bName} to confirm. Counts by itself after ${AUTO_CONFIRM_HOURS} hours.`}
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

const RegisterSheet: React.FC<{ me: any; session: { name?: string; phone?: string; pin?: string }; onClose: () => void; onSaved: () => void }> = ({
  me,
  session,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(me?.name || session.name || '');
  const [hostel, setHostel] = useState(me?.hostel || '');
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
      await registerGamer({ name, hostel, phone, pin, games, ids, freeNote });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <Sheet title={me ? 'Your player profile' : 'Register for Hostel Games'} onClose={onClose}>
      <p className="text-xs text-slate-500">One profile for the games you play, tied to your Roomly account. Your WhatsApp number stays private.</p>
      <div>
        <label className={label}>Gamer name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={input} placeholder="e.g. Tobi" />
      </div>
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
      <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {me ? 'Save profile' : 'Save registration'}
      </button>
    </Sheet>
  );
};

const LogResultSheet: React.FC<{ game: string; me: any; board: any[]; onClose: () => void }> = ({ game, me, board, onClose }) => {
  const [opps, setOpps] = useState<any[] | null>(null);
  const [opp, setOpp] = useState('');
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [winner, setWinner] = useState<'me' | 'them' | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scored = isScored(game);

  useEffect(() => {
    getRecentOpponents(me, game)
      .then((ids) => setOpps(board.filter((r) => ids.includes(r.id))))
      .catch(() => setOpps([]));
  }, [game]);

  const submit = async () => {
    setError('');
    const o = board.find((r) => r.id === opp);
    if (!o) return setError('Pick your opponent.');
    let a = 0;
    let b = 0;
    if (scored) {
      if (mine === '' || theirs === '') return setError('Enter both scores.');
      a = Number(mine);
      b = Number(theirs);
    } else {
      if (!winner) return setError('Pick who won.');
      a = winner === 'me' ? 1 : 0;
      b = winner === 'me' ? 0 : 1;
    }
    setBusy(true);
    try {
      const link = await logResult(game, me, o, a, b, file);
      onClose();
      go(link);
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <Sheet title={`Log a ${gameLabel(game)} result`} onClose={onClose}>
      {opps === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : opps.length === 0 ? (
        <p className="text-sm text-slate-500">
          You can log a result against players you challenged on WhatsApp through Roomly (or who challenged you) in the last 3 days.
        </p>
      ) : (
        <>
          <div>
            <label className={label}>Opponent</label>
            <select value={opp} onChange={(e) => setOpp(e.target.value)} className={input}>
              <option value="">Choose your opponent</option>
              {opps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.hostel})
                </option>
              ))}
            </select>
          </div>
          {scored ? (
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
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(['me', 'them'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWinner(w)}
                  className={`h-12 rounded-xl text-sm font-bold border cursor-pointer ${
                    winner === w ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {w === 'me' ? 'I won' : 'They won'}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <Camera className="w-4 h-4 text-[#0e9f55]" />
            <span>{file ? file.name : 'Screenshot of the final score (optional)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <button type="button" disabled={busy} onClick={submit} className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save and send on WhatsApp
          </button>
          <p className="text-[11px] text-slate-400 text-center">Your opponent confirms it. No answer in {AUTO_CONFIRM_HOURS} hours and it counts.</p>
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
