import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Swords, Crown, Camera, Loader2, Users, Calendar } from 'lucide-react';
import { HOSTELS } from '../config';
import {
  GAMES,
  CHALLENGE_ACCEPT_HOURS,
  POINTS,
  knownHubUid,
  subscribeGamers,
  saveGamer,
  subscribeChallenges,
  sendChallenge,
  answerChallenge,
  cancelChallenge,
  reportResult,
  addDisputeProof,
  challengeExpired,
  challengeWinner,
  challengeDisputed,
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
const gameLabel = (id: string) => GAMES.find((g) => g.id === id)?.label || id;

type View = 'board' | 'challenges' | 'tournaments';

/** Gaming: leaderboard per game, free 1v1 challenges, and hosted tournaments */
export const Gaming: React.FC<{ session: { name?: string; phone?: string } }> = ({ session }) => {
  const [game, setGame] = useState<string>(() => {
    try {
      return localStorage.getItem('roomly_game') || 'efootball';
    } catch {
      return 'efootball';
    }
  });
  const [view, setView] = useState<View>('board');
  const [uid, setUid] = useState('');
  const [gamers, setGamers] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    knownHubUid().then(setUid);
  }, []);
  useEffect(() => subscribeGamers(setGamers), []);
  useEffect(() => subscribeTournaments(setTournaments), []);
  useEffect(() => subscribeChallenges(game, setChallenges), [game]);
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
  const board = useMemo(() => computeBoard(game, gamers, challenges, tournaments, nowMs), [game, gamers, challenges, tournaments, nowMs]);
  const myChallenges = challenges.filter((c) => uid && (c.fromUid === uid || c.toUid === uid));
  const incoming = myChallenges.filter((c) => c.toUid === uid && c.status === 'pending' && !challengeExpired(c, nowMs));
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
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
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
            <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{me.name}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {me.ids?.[game] ? `${gameLabel(game)} ID: ${me.ids[game]}` : `Add your ${gameLabel(game)} ID to compete`}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[11px] font-bold text-[#0e9f55] cursor-pointer">
            Edit IDs
          </button>
        </div>
      )}

      {/* Views */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70">
        {(
          [
            ['board', 'Leaderboard'],
            ['challenges', `Challenges${incoming.length ? ` (${incoming.length})` : ''}`],
            ['tournaments', 'Tournaments'],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`py-2 rounded-xl text-[11px] font-bold cursor-pointer ${
              view === v ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'board' && <Leaderboard game={game} board={board} me={me} uid={uid} challenges={challenges} nowMs={nowMs} />}
      {view === 'challenges' && <Challenges uid={uid} list={myChallenges} gamers={gamers} game={game} nowMs={nowMs} />}
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
  const [ids, setIds] = useState<Record<string, string>>(me?.ids || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await saveGamer({ name, hostel, phone, ids });
      onSaved(saved.id);
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className={`${card} p-4 space-y-2.5`}>
      <div>
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{me ? 'Your player IDs' : 'Join the leaderboard'}</h3>
        <p className="text-[11px] text-slate-500">Challenges are free. Your phone number stays private.</p>
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
      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={input} placeholder="Phone (for prizes, only Roomly sees it)" />
      <p className="text-[11px] font-bold text-slate-500 pt-1">Player IDs (fill the games you play)</p>
      <div className="grid grid-cols-2 gap-2">
        {GAMES.map((g) => (
          <input
            key={g.id}
            value={ids[g.id] || ''}
            onChange={(e) => setIds({ ...ids, [g.id]: e.target.value })}
            maxLength={40}
            className={input}
            placeholder={`${g.label} ID`}
          />
        ))}
      </div>
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 cursor-pointer">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ */

const Leaderboard: React.FC<{ game: string; board: any[]; me: any; uid: string; challenges: any[]; nowMs: number }> = ({
  game,
  board,
  me,
  uid,
  challenges,
  nowMs,
}) => {
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState('');
  const canChallenge = Boolean(me && me.ids?.[game] && !me.banned);
  const openWith = (id: string) =>
    challenges.some(
      (c) =>
        ((c.fromUid === uid && c.toUid === id) || (c.fromUid === id && c.toUid === uid)) &&
        ((c.status === 'pending' && !challengeExpired(c, nowMs)) || (c.status === 'accepted' && !challengeWinner(c)))
    );

  const challenge = async (row: any) => {
    setBusyId(row.id);
    setMsg('');
    try {
      await sendChallenge(game, me, { id: row.id, name: row.name });
      setMsg(`Challenge sent to ${row.name}. They have ${CHALLENGE_ACCEPT_HOURS} hours to accept.`);
    } catch (e: any) {
      setMsg(e?.message || 'Could not send the challenge.');
    }
    setBusyId('');
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 leading-snug">
        Win a challenge +{POINTS.win} (+{POINTS.upset} if they had more points). Lose −{POINTS.loss}. Tournament 1st +{POINTS.podium[0]}, 2nd +
        {POINTS.podium[1]}, 3rd +{POINTS.podium[2]}. Declining or ignoring 2 challenges in a row costs {POINTS.duck} points.
      </p>
      {msg && <p className="text-[11px] font-semibold text-[#0e9f55]">{msg}</p>}
      {board.length === 0 ? (
        <div className={`${card} text-center py-8 text-xs text-slate-400`}>No {gameLabel(game)} players yet. Add your ID and be number one.</div>
      ) : (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {board.map((r) => (
            <div key={r.id} className={`flex items-center gap-2.5 p-2.5 ${r.id === uid ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}`}>
              <span className={`w-6 text-center text-xs font-black ${r.rank === 1 ? 'text-amber-500' : 'text-slate-400'}`}>
                {r.rank === 1 ? <Crown className="w-4 h-4 inline" /> : r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                  {r.name}
                  {r.titles > 0 && <span className="ml-1 text-[10px] text-amber-600">🏆{r.titles > 1 ? `x${r.titles}` : ''}</span>}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {r.hostel} · {r.wins}W {r.losses}L · ID {r.gameId}
                </p>
              </div>
              <span className="text-xs font-black text-[#0e9f55] w-12 text-right">{r.points}</span>
              {canChallenge && r.id !== uid && (
                <button
                  type="button"
                  disabled={busyId === r.id || openWith(r.id)}
                  onClick={() => challenge(r)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                >
                  <Swords className="w-3 h-3" /> {openWith(r.id) ? 'Open' : 'Challenge'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Challenges: React.FC<{ uid: string; list: any[]; gamers: any[]; game: string; nowMs: number }> = ({ uid, list, gamers, game, nowMs }) => {
  const [busyId, setBusyId] = useState('');
  const [proofs, setProofs] = useState<Record<string, File | null>>({});
  const idOf = (u: string) => gamers.find((g) => g.id === u)?.ids?.[game] || '';

  const run = async (id: string, fn: () => Promise<any>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusyId('');
  };

  if (!uid) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>Join the leaderboard to send and receive challenges.</div>;
  const sorted = [...list].sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0));
  if (!sorted.length) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>No challenges yet. Pick someone on the leaderboard.</div>;

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-slate-500">
        Play, then both of you tap who won. If you disagree, upload a screenshot of the final score and Roomly decides.
      </p>
      {sorted.map((c) => {
        const iAmFrom = c.fromUid === uid;
        const oppUid = iAmFrom ? c.toUid : c.fromUid;
        const oppName = iAmFrom ? c.toName : c.fromName;
        const myClaim = iAmFrom ? c.claimFrom : c.claimTo;
        const winner = challengeWinner(c);
        const expired = challengeExpired(c, nowMs);
        const disputed = challengeDisputed(c);
        const hoursLeft = Math.max(0, Math.ceil((CHALLENGE_ACCEPT_HOURS * 3600000 - (nowMs - (c.createdAtMs || 0))) / 3600000));
        let state = '';
        if (c.status === 'cancelled') state = 'Cancelled';
        else if (c.status === 'declined') state = iAmFrom ? 'Declined by them' : 'You declined';
        else if (c.status === 'void') state = 'Cancelled by Roomly';
        else if (expired) state = iAmFrom ? 'Not accepted in time' : 'You did not answer in time';
        else if (winner) state = winner === uid ? 'You won' : `${oppName} won`;
        else if (disputed) state = 'Disputed: Roomly will decide';
        else if (c.status === 'pending') state = iAmFrom ? `Waiting for them (${hoursLeft}h left)` : `They challenged you (${hoursLeft}h left)`;
        else if (c.status === 'accepted') state = myClaim ? 'Waiting for them to confirm the result' : 'Accepted: play, then report the result';

        return (
          <div key={c.id} className={`${card} p-3 space-y-2`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                  {iAmFrom ? 'You' : oppName} vs {iAmFrom ? oppName : 'You'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {state}
                  {idOf(oppUid) ? ` · Their ID ${idOf(oppUid)}` : ''}
                </p>
              </div>
              {winner && <Trophy className={`w-4 h-4 shrink-0 ${winner === uid ? 'text-amber-500' : 'text-slate-300'}`} />}
            </div>

            {!iAmFrom && c.status === 'pending' && !expired && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => answerChallenge(c, true))} className="py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => window.confirm(`Decline? Declining or ignoring 2 challenges in a row costs ${POINTS.duck} points.`) && run(c.id, () => answerChallenge(c, false))}
                  className="py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Decline
                </button>
              </div>
            )}
            {iAmFrom && c.status === 'pending' && !expired && (
              <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => cancelChallenge(c))} className="text-[11px] font-bold text-rose-600 cursor-pointer">
                Cancel challenge
              </button>
            )}

            {c.status === 'accepted' && !myClaim && !winner && !disputed && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-[#0e9f55]" />
                  <span>{proofs[c.id]?.name || 'Screenshot of the final score (recommended)'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setProofs({ ...proofs, [c.id]: e.target.files?.[0] || null })} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => reportResult(c, uid, proofs[c.id] || null))} className="py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
                    I won
                  </button>
                  <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => reportResult(c, oppUid, proofs[c.id] || null))} className="py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold cursor-pointer">
                    {oppName} won
                  </button>
                </div>
              </div>
            )}

            {disputed && c.status === 'disputed' && (
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                <Camera className="w-3.5 h-3.5 text-[#0e9f55]" />
                <span>{(iAmFrom ? c.proofFrom : c.proofTo) ? 'Screenshot sent. Replace it' : 'Upload your screenshot for Roomly'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) run(c.id, () => addDisputeProof(c, f));
                  }}
                />
              </label>
            )}
          </div>
        );
      })}
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
      {t.prizeText && <p className="text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-line bg-amber-50/60 dark:bg-amber-950/20 rounded-xl p-2.5">🏆 {t.prizeText}</p>}

      {t.status === 'done' && t.results && (
        <div className="text-[11px] space-y-0.5">
          {t.results.first?.name && <p>🥇 {t.results.first.name}</p>}
          {t.results.second?.name && <p>🥈 {t.results.second.name}</p>}
          {t.results.third?.name && <p>🥉 {t.results.third.name}</p>}
        </div>
      )}

      {t.bracketText && <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line border-t border-slate-100 dark:border-slate-800 pt-2">{t.bracketText}</p>}

      {/* Join / pay */}
      {t.status === 'open' && !mine && (
        <button
          type="button"
          disabled={busy || full || !me?.ids?.[t.game]}
          onClick={() => run(() => joinTournament(t, me))}
          className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-black cursor-pointer disabled:opacity-50"
        >
          {full ? 'Full' : !me?.ids?.[t.game] ? `Add your ${gameLabel(t.game)} ID to join` : 'Join tournament'}
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
