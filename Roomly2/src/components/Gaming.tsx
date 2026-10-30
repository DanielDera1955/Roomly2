import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Camera, Loader2, Users, Calendar, MessageCircle } from 'lucide-react';
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
  subscribeGamers,
  saveGamer,
  setReady,
  challengeOnWhatsApp,
  getRecentOpponents,
  subscribeMatches,
  logResult,
  confirmMatch,
  disputeMatch,
  cancelMatch,
  addMatchProof,
  matchCounts,
  canDispute,
  subscribeTournaments,
  subscribeEntries,
  subscribeHubSettings,
  joinTournament,
  markEntryPaid,
  leaveTournament,
  computeBoard,
} from '../hub.js';

const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const btnGreen = 'rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer disabled:opacity-50';
const btnDark = 'rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-50';
const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const goTo = (url: string) => {
  window.location.href = url;
};

type View = 'board' | 'challenges' | 'tournaments';

/** Read ?game= / ?match= once (from a WhatsApp link), then clean the address bar */
const linkParams = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    return { game: p.get('game') || '', match: p.get('match') || '' };
  } catch {
    return { game: '', match: '' };
  }
})();

/** Gaming: leaderboard per game, "Ready to play" challenges over WhatsApp, and hosted tournaments */
export const Gaming: React.FC<{ session: { name?: string; phone?: string } }> = ({ session }) => {
  const [game, setGame] = useState<string>(() => {
    if (GAMES.some((g) => g.id === linkParams.game)) return linkParams.game;
    try {
      return localStorage.getItem('roomly_game') || 'efootball';
    } catch {
      return 'efootball';
    }
  });
  const [view, setView] = useState<View>(linkParams.game || linkParams.match ? 'challenges' : 'board');
  const [focusMatch, setFocusMatch] = useState(linkParams.match);
  const [uid, setUid] = useState('');
  const [gamers, setGamers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
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
  useEffect(() => subscribeTournaments(setTournaments), []);
  useEffect(() => subscribeMatches(game, setMatches), [game]);
  // A confirm link names the match, not the game: switch to that match's game once it is known
  useEffect(() => {
    if (!focusMatch) return;
    const unsub = GAMES.map((g) =>
      subscribeMatches(g.id, (list: any[]) => {
        if (list.some((m) => m.id === focusMatch)) setGame(g.id);
      })
    );
    return () => unsub.forEach((u) => u());
  }, [focusMatch]);
  useEffect(() => {
    try {
      localStorage.setItem('roomly_game', game);
    } catch {}
  }, [game]);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const me = gamers.find((g) => g.id === uid) || null;
  const board = useMemo(() => computeBoard(game, gamers, matches, tournaments, nowMs), [game, gamers, matches, tournaments, nowMs]);
  const myRow = board.ranked.find((r: any) => r.id === uid) || board.fresh.find((r: any) => r.id === uid);
  const toConfirm = matches.filter((m) => m.bUid === uid && m.status === 'pending');
  const gameTourneys = tournaments.filter((t) => t.game === game && t.status !== 'cancelled');

  return (
    <div className="space-y-3">
      {/* Games */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGame(g.id)}
            className={`shrink-0 whitespace-nowrap h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${
              game === g.id ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* My player card */}
      {!me || editing ? (
        <GamerForm
          me={me}
          session={session}
          onSaved={(id) => {
            setUid(id);
            setEditing(false);
          }}
          onCancel={me ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className={`${card} p-3 flex items-center justify-between gap-2`}>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {me.name}
              {myRow && playsGame(me, game) ? <span className="font-bold text-[#0e9f55]"> · {myRow.rating}</span> : null}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{(me.games || []).map(gameLabel).join(', ')}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[11px] font-bold text-[#0e9f55] cursor-pointer">
            Edit
          </button>
        </div>
      )}

      {/* Views */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70">
        {(
          [
            ['board', 'Leaderboard'],
            ['challenges', `Challenges${toConfirm.length ? ` (${toConfirm.length})` : ''}`],
            ['tournaments', 'Tournaments'],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`h-9 rounded-xl text-[12px] font-bold truncate cursor-pointer ${
              view === v ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'board' && <Leaderboard game={game} board={board} me={me} uid={uid} myRating={myRow?.rating} />}
      {view === 'challenges' && (
        <Challenges game={game} me={me} uid={uid} board={board} matches={matches} nowMs={nowMs} focusMatch={focusMatch} onFocusDone={() => setFocusMatch('')} />
      )}
      {view === 'tournaments' && <Tournaments list={gameTourneys} me={me} uid={uid} game={game} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const GamerForm: React.FC<{ me: any; session: { name?: string; phone?: string }; onSaved: (uid: string) => void; onCancel?: () => void }> = ({
  me,
  session,
  onSaved,
  onCancel,
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
  const [games, setGames] = useState<string[]>(me?.games || []);
  const [ids, setIds] = useState<Record<string, string>>(me?.ids || {});
  const [freeNote, setFreeNote] = useState(me?.freeNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (g: string) => setGames(games.includes(g) ? games.filter((x) => x !== g) : [...games, g]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await saveGamer({ name, hostel, phone, games, ids, freeNote });
      onSaved(saved.id);
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className={`${card} p-4 space-y-2.5`}>
      <div>
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{me ? 'Your player profile' : 'Join the leaderboard'}</h3>
        <p className="text-[11px] text-slate-500">Free. Other players only reach your WhatsApp while you are Ready to play.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={input} placeholder="Gamer name" />
        <select value={hostel} onChange={(e) => setHostel(e.target.value)} className={input}>
          <option value="">Hostel</option>
          {HOSTELS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
          <option value="Lodge">Lodge</option>
        </select>
      </div>
      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={input} placeholder="WhatsApp number" />
      <div>
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">Games you play</p>
        <div className="flex flex-wrap gap-1.5">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${
                games.includes(g.id) ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {games.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {games.map((g) => (
            <input
              key={g}
              value={ids[g] || ''}
              onChange={(e) => setIds({ ...ids, [g]: e.target.value })}
              maxLength={40}
              className={input}
              placeholder={`${gameLabel(g)} ID (optional)`}
            />
          ))}
        </div>
      )}
      <input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} maxLength={60} className={input} placeholder="Usually free (optional), e.g. evenings after 8pm" />
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`flex-1 h-10 ${btnGreen} flex items-center justify-center gap-1.5`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 h-10 rounded-xl text-xs font-bold text-slate-500 cursor-pointer">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ */

const ChallengeButton: React.FC<{ game: string; me: any; row: any; myRating?: number }> = ({ game, me, row, myRating }) => {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      goTo(await challengeOnWhatsApp(game, me, row, myRating));
    } catch (e: any) {
      window.alert(e?.message || 'Could not open WhatsApp.');
    }
    setBusy(false);
  };
  return (
    <button type="button" disabled={busy} onClick={go} className={`shrink-0 h-8 px-2.5 ${btnGreen} flex items-center gap-1 text-[11px]`}>
      <MessageCircle className="w-3.5 h-3.5" /> Challenge
    </button>
  );
};

const PlayerRow: React.FC<{ r: any; game: string; me: any; uid: string; myRating?: number; ranked: boolean }> = ({ r, game, me, uid, myRating, ranked }) => {
  const canChallenge = r.ready && r.id !== uid && playsGame(me, game);
  return (
    <div className={`flex items-center gap-2.5 p-2.5 ${r.id === uid ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}`}>
      {ranked && (
        <span className={`w-6 text-center text-xs font-black ${r.crown ? 'text-amber-500' : 'text-slate-400'}`}>
          {r.crown ? <Crown className="w-4 h-4 inline" /> : r.rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-1">
          <span className="truncate">{r.name}</span>
          {r.titles > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
              <Trophy className="w-3 h-3" />
              {r.titles > 1 ? `x${r.titles}` : ''}
            </span>
          )}
          {r.ready && <span className="shrink-0 text-[9px] font-bold uppercase text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">Ready</span>}
        </p>
        <p className="text-[10px] text-slate-500 truncate">
          {r.hostel}
          {ranked ? ` · ${r.wins}W ${r.draws}D ${r.losses}L` : ''}
          {r.gameId ? ` · ID ${r.gameId}` : ''}
          {r.ready && r.freeNote ? ` · ${r.freeNote}` : ''}
        </p>
      </div>
      {ranked && <span className="text-xs font-black text-[#0e9f55] w-11 text-right">{r.rating}</span>}
      {canChallenge && <ChallengeButton game={game} me={me} row={r} myRating={myRating} />}
    </div>
  );
};

const Leaderboard: React.FC<{ game: string; board: any; me: any; uid: string; myRating?: number }> = ({ game, board, me, uid, myRating }) => {
  if (!board.ranked.length && !board.fresh.length)
    return <div className={`${card} text-center py-8 text-xs text-slate-400`}>No {gameLabel(game)} players yet. Join and be the first.</div>;
  return (
    <div className="space-y-3">
      {board.ranked.length > 0 ? (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden`}>
          {board.ranked.map((r: any) => (
            <PlayerRow key={r.id} r={r} game={game} me={me} uid={uid} myRating={myRating} ranked />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">No results yet. The first confirmed match puts players on the board.</p>
      )}
      {board.fresh.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">New players (no matches yet)</p>
          <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden`}>
            {board.fresh.map((r: any) => (
              <PlayerRow key={r.id} r={r} game={game} me={me} uid={uid} myRating={myRating} ranked={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Challenges: React.FC<{
  game: string;
  me: any;
  uid: string;
  board: any;
  matches: any[];
  nowMs: number;
  focusMatch: string;
  onFocusDone: () => void;
}> = ({ game, me, uid, board, matches, nowMs, focusMatch, onFocusDone }) => {
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState('');
  const plays = playsGame(me, game);
  const all = [...board.ranked, ...board.fresh];
  const myRating = all.find((r: any) => r.id === uid)?.rating;
  const ready = all.filter((r: any) => r.ready && r.id !== uid).sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  const isReady = readyFor(me, game, nowMs);
  const toConfirm = matches.filter((m) => m.bUid === uid && m.status === 'pending').sort((a, b) => (a.id === focusMatch ? -1 : b.id === focusMatch ? 1 : 0));
  const mine = matches
    .filter((m) => (m.aUid === uid || m.bUid === uid) && !(m.bUid === uid && m.status === 'pending'))
    .sort((a, b) => (b.loggedAtMs || 0) - (a.loggedAtMs || 0))
    .slice(0, 15);

  const run = async (id: string, fn: () => Promise<any>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  if (!uid || !me) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>Join the leaderboard above to challenge players.</div>;
  if (!plays) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>Add {gameLabel(game)} to your games (tap Edit) to play it.</div>;

  return (
    <div className="space-y-3">
      {/* My ready switch */}
      <div className={`${card} p-3 space-y-2`}>
        {isReady ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold text-[#0e9f55]">You're ready to play {gameLabel(game)}</p>
              <p className="text-[11px] text-slate-500">Until {when(Number(me.ready?.[game]))}. Players can challenge you on WhatsApp.</p>
            </div>
            <button type="button" disabled={busy === 'ready'} onClick={() => run('ready', () => setReady(game, null))} className="shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold text-rose-600 border border-rose-200 dark:border-rose-900 cursor-pointer">
              Turn off
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-extrabold text-slate-900 dark:text-white">Ready to play {gameLabel(game)}?</p>
              <p className="text-[11px] text-slate-500">Show up as ready so players can challenge you on WhatsApp.</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {READY_CHOICES.map((c) => (
                <button key={c.id} type="button" disabled={busy === 'ready'} onClick={() => run('ready', () => setReady(game, c.id))} className={`h-9 ${c.id === '1w' ? btnGreen : 'rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Results waiting for me */}
      {toConfirm.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-500">Confirm these results</p>
          {toConfirm.map((m) => (
            <ConfirmCard key={m.id} m={m} game={game} highlight={m.id === focusMatch} onDone={onFocusDone} />
          ))}
        </div>
      )}

      {/* Log a result */}
      {logging ? (
        <LogResultForm game={game} me={me} all={all} onClose={() => setLogging(false)} />
      ) : (
        <button type="button" onClick={() => setLogging(true)} className={`w-full h-10 ${btnDark}`}>
          Log a match result
        </button>
      )}

      {/* Ready players */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-slate-500">Ready to play now ({ready.length})</p>
        {ready.length === 0 ? (
          <div className={`${card} text-center py-6 text-xs text-slate-400`}>Nobody is ready yet. Turn yours on so others can find you.</div>
        ) : (
          <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden`}>
            {ready.map((r: any) => (
              <PlayerRow key={r.id} r={r} game={game} me={me} uid={uid} myRating={myRating} ranked={Boolean(r.rank)} />
            ))}
          </div>
        )}
      </div>

      {/* My results */}
      {mine.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">My results</p>
          {mine.map((m) => {
            const iLogged = m.aUid === uid;
            const counted = matchCounts(m, nowMs);
            const state =
              m.status === 'cancelled'
                ? 'Taken back'
                : m.status === 'void'
                ? 'Cancelled by Roomly'
                : m.status === 'disputed'
                ? 'Disputed: Roomly will decide'
                : m.status === 'confirmed'
                ? 'Confirmed'
                : counted
                ? 'Counted (not answered in 24 hours)'
                : `Waiting for ${iLogged ? m.bName : 'you'} to confirm`;
            return (
              <div key={m.id} className={`${card} p-3 space-y-1.5`}>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{resultText(m, game)}</p>
                <p className="text-[11px] text-slate-500">
                  {state} · {when(m.loggedAtMs)}
                </p>
                {iLogged && m.status === 'pending' && !counted && (
                  <button type="button" disabled={busy === m.id} onClick={() => run(m.id, () => cancelMatch(m))} className="text-[11px] font-bold text-rose-600 cursor-pointer">
                    Take it back
                  </button>
                )}
                {m.status === 'disputed' && (
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <Camera className="w-3.5 h-3.5 text-[#0e9f55]" />
                    <span>{(iLogged ? m.proofA : m.proofB) ? 'Screenshot sent. Replace it' : 'Add a screenshot of the final score for Roomly'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) run(m.id, () => addMatchProof(m, f));
                      }}
                    />
                  </label>
                )}
                {!iLogged && canDispute(m, nowMs) && m.status !== 'disputed' && m.status !== 'pending' && (
                  <DisputeButton m={m} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const resultText = (m: any, game: string) =>
  isScored(game) ? `${m.aName} ${m.scoreA} - ${m.scoreB} ${m.bName}` : `${m.scoreA > m.scoreB ? m.aName : m.bName} beat ${m.scoreA > m.scoreB ? m.bName : m.aName}`;

const DisputeButton: React.FC<{ m: any }> = ({ m }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-bold text-rose-600 cursor-pointer">
        That's not the result
      </button>
    );
  return (
    <div className="space-y-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={input} placeholder="What was the real result?" />
      <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
        <Camera className="w-3.5 h-3.5 text-rose-600" />
        <span>{file ? file.name : 'Screenshot of the final score (recommended)'}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await disputeMatch(m, note, file);
          } catch (e: any) {
            window.alert(e?.message || 'Could not send.');
          }
          setBusy(false);
        }}
        className="w-full h-9 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
      >
        Send to Roomly
      </button>
    </div>
  );
};

const ConfirmCard: React.FC<{ m: any; game: string; highlight: boolean; onDone: () => void }> = ({ m, game, highlight, onDone }) => {
  const [busy, setBusy] = useState(false);
  const hoursLeft = Math.max(0, Math.ceil((AUTO_CONFIRM_HOURS * 3600000 - (Date.now() - (m.loggedAtMs || 0))) / 3600000));
  return (
    <div className={`${card} p-3 space-y-2 ${highlight ? 'ring-2 ring-[#0e9f55]' : ''}`}>
      <p className="text-xs font-extrabold text-slate-900 dark:text-white">{resultText(m, game)}</p>
      <p className="text-[11px] text-slate-500">
        {m.aName} logged this. It counts by itself in {hoursLeft}h if you don't answer.
      </p>
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
        className={`w-full h-9 ${btnGreen}`}
      >
        Confirm
      </button>
      <DisputeButton m={m} />
    </div>
  );
};

const LogResultForm: React.FC<{ game: string; me: any; all: any[]; onClose: () => void }> = ({ game, me, all, onClose }) => {
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
    getRecentOpponents(game)
      .then((ids) => setOpps(all.filter((r) => ids.includes(r.id))))
      .catch(() => setOpps([]));
  }, [game]);

  const submit = async () => {
    setError('');
    const o = all.find((r) => r.id === opp);
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
      goTo(link);
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <div className={`${card} p-4 space-y-2.5`}>
      <div>
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Log a {gameLabel(game)} result</h3>
        <p className="text-[11px] text-slate-500">Then send the confirm link to your opponent on WhatsApp.</p>
      </div>
      {opps === null ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : opps.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          You can log a result against players you challenged on WhatsApp through Roomly (or who challenged you) in the last 3 days.
        </p>
      ) : (
        <>
          <select value={opp} onChange={(e) => setOpp(e.target.value)} className={input}>
            <option value="">Opponent</option>
            {opps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.hostel})
              </option>
            ))}
          </select>
          {scored ? (
            <div className="grid grid-cols-2 gap-2">
              <input value={mine} onChange={(e) => setMine(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={input} placeholder="Your goals" />
              <input value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={input} placeholder="Their goals" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['me', 'them'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWinner(w)}
                  className={`h-9 rounded-xl text-xs font-bold cursor-pointer ${winner === w ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  {w === 'me' ? 'I won' : 'They won'}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <Camera className="w-3.5 h-3.5 text-[#0e9f55]" />
            <span>{file ? file.name : 'Screenshot of the final score (optional)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </>
      )}
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <div className="flex gap-2">
        {opps && opps.length > 0 && (
          <button type="button" disabled={busy} onClick={submit} className={`flex-1 h-10 ${btnGreen} flex items-center justify-center gap-1.5`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save and send on WhatsApp
          </button>
        )}
        <button type="button" onClick={onClose} className="px-4 h-10 rounded-xl text-xs font-bold text-slate-500 cursor-pointer">
          Close
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Tournaments: React.FC<{ list: any[]; me: any; uid: string; game: string }> = ({ list, me, uid, game }) => {
  const [account, setAccount] = useState<any>(null);
  useEffect(() => subscribeHubSettings((s: any) => setAccount(s?.tourneyAccount || null)), []);
  if (!list.length) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>No {gameLabel(game)} tournament yet. Watch this space.</div>;
  const order: Record<string, number> = { open: 0, closed: 1, done: 2 };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.startAtMs || 0) - (b.startAtMs || 0));
  return (
    <div className="space-y-3">
      {sorted.map((t) => (
        <TournamentCard key={t.id} t={t} me={me} uid={uid} account={account} />
      ))}
    </div>
  );
};

const TournamentCard: React.FC<{ t: any; me: any; uid: string; account: any }> = ({ t, me, uid, account }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => subscribeEntries(t.id, setEntries), [t.id]);

  const mine = entries.find((e) => e.id === uid);
  const confirmed = entries.filter((e) => e.confirmed);
  const full = entries.length >= t.slots;
  const fee = Number(t.fee) || 0;
  const hasAccount = Boolean(account?.number);

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
    <div className={`${card} p-4 space-y-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">{t.title}</p>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(t.startAtMs).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            {t.format ? ` · ${t.format}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            t.status === 'open' ? 'bg-emerald-50 text-[#0e9f55]' : t.status === 'done' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {t.status === 'open' ? (full ? 'Full' : 'Open') : t.status === 'done' ? 'Finished' : 'Entries closed'}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="font-black text-[#0e9f55]">{fee ? `${naira(fee)} entry` : 'Free entry'}</span>
        <span className="flex items-center gap-1 text-slate-500">
          <Users className="w-3 h-3" /> {entries.length}/{t.slots} joined · {confirmed.length} confirmed
        </span>
      </div>
      {t.prizeText && <p className="text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-line bg-amber-50/60 dark:bg-amber-950/20 rounded-xl p-2.5"><strong>Prizes</strong>
{t.prizeText}</p>}

      {t.status === 'done' && t.results && (
        <div className="text-[11px] space-y-0.5">
          {t.results.first?.name && <p><strong>1st:</strong> {t.results.first.name}</p>}
          {t.results.second?.name && <p><strong>2nd:</strong> {t.results.second.name}</p>}
          {t.results.third?.name && <p><strong>3rd:</strong> {t.results.third.name}</p>}
        </div>
      )}

      {t.bracketText && <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line border-t border-slate-100 dark:border-slate-800 pt-2">{t.bracketText}</p>}

      {/* Join / pay */}
      {t.status === 'open' && !mine && (
        <button
          type="button"
          disabled={busy || full || !playsGame(me, t.game)}
          onClick={() => run(() => joinTournament(t, me))}
          className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-black cursor-pointer disabled:opacity-50"
        >
          {full ? 'Full' : !playsGame(me, t.game) ? `Add ${gameLabel(t.game)} to your games to join` : 'Join tournament'}
        </button>
      )}
      {mine && !mine.confirmed && fee > 0 && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 space-y-2 text-[11px]">
          {hasAccount ? (
            <>
              <p className="text-blue-900 dark:text-blue-200">
                Send <strong>{naira(fee)}</strong> to {account.bank} <strong>{account.number}</strong> ({account.name}), then tap below.
              </p>
              {mine.paid ? (
                <p className="font-bold text-blue-900 dark:text-blue-200">Payment sent. Waiting for Roomly to confirm.</p>
              ) : (
                <button type="button" disabled={busy} onClick={() => run(() => markEntryPaid(t.id))} className="w-full py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer">
                  I've paid
                </button>
              )}
            </>
          ) : (
            <p className="text-blue-900 dark:text-blue-200">Payment details will show here soon. Your slot is held.</p>
          )}
          {!mine.paid && (
            <button type="button" disabled={busy} onClick={() => run(() => leaveTournament(t.id))} className="text-rose-600 font-bold cursor-pointer">
              Leave
            </button>
          )}
        </div>
      )}
      {mine?.confirmed && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1">
          <p className="font-bold">You're in. Good luck!</p>
          {t.whatsapp && (
            <a href={t.whatsapp} target="_blank" rel="noreferrer" className="font-bold text-[#0e9f55] underline">
              Join the players' WhatsApp group
            </a>
          )}
        </div>
      )}
      {err && <p className="text-[11px] font-semibold text-rose-600">{err}</p>}

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
