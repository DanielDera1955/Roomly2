import React, { useEffect, useMemo, useState } from 'react';
import { GAMES, gameLabel, playsGame, subscribeGamers, timeAgo, waTo } from '../hub.js';
import { computeRows, matchCounts, weekPhase, creditState, rewardConfigFor, rewardSlots, rewardRegsFor, contestOf, specialSeries, CREDIT_HOURS } from '../boardCore.js';
import { farmSignals, opponentsOf, STREAK_FLAG, STREAK_REMOVE } from '../farmSignals.js';
import {
  subscribeSeasons,
  subscribeSeasonJoins,
  subscribeRewardWeeks,
  subscribeRewardJoins,
  subscribePointAdjust,
  subscribeGamesConfig,
  subscribeSeasonMatches,
  subscribeSpecialEvents,
  subscribeSpecialBookings,
  subscribeGameWinners,
  type Season,
} from '../season';
import {
  loadPhones,
  loadCredits,
  loadTaps,
  loadReports,
  setReportHandled,
  markContacted,
  markNoWhatsapp,
  markNumberChecked,
  removeFarmAccount,
  setRewardBlocked,
  adjustPoints,
  voidCredit,
  issueCredit,
  saveGameSettings,
  addAllToSeason,
  saveGroupLink,
  saveSlots,
  postDailyNotice,
  createSpecialEvent,
  setSpecialStatus,
  removeSpecialEvent,
  confirmSpecialWinner,
  reopenSpecial,
  removeWinnerLine,
  issueSpecialCredit,
  removeBooking,
  undoAdjust,
} from '../adminGames';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const input =
  'w-full h-10 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50';
const h = 'text-xs font-black uppercase tracking-wider text-slate-500';
const DAY = 86400000;
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const when = (ms: number) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const day = (ms: number) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const open = (url: string) => window.open(url, '_blank', 'noopener');

type Tab = 'players' | 'reports' | 'credits' | 'weeks' | 'taps' | 'settings' | 'announce' | 'special';
const TABS_LEAGUE: [Tab, string][] = [
  ['players', 'Players'],
  ['special', 'Special 1v1'],
  ['reports', 'Reports'],
  ['taps', 'Challenge log'],
  ['announce', 'Announcements'],
];
const TABS_CONTEST: [Tab, string][] = [
  ['weeks', 'Week review'],
  ['credits', 'Credits'],
  ['settings', 'Reward settings'],
];

export const AdminGames: React.FC<{ section?: 'league' | 'contest' }> = ({ section = 'league' }) => {
  const TABS = section === 'contest' ? TABS_CONTEST : TABS_LEAGUE;
  const [tab, setTab] = useState<Tab>(TABS[0][0]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [gamers, setGamers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [joins, setJoins] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [rewardJoins, setRewardJoins] = useState<any[]>([]);
  const [adjusts, setAdjusts] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [phones, setPhones] = useState<Map<string, string>>(new Map());
  const [credits, setCredits] = useState<any[]>([]);
  const [taps, setTaps] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => subscribeSeasons(setSeasons), []);
  useEffect(() => subscribeGamers(setGamers), []);
  useEffect(() => subscribeGamesConfig(setConfig), []);
  useEffect(() => subscribeSpecialEvents(setEvents), []);
  useEffect(() => subscribeSpecialBookings(setBookings), []);
  useEffect(() => subscribeGameWinners(setWinners), []);
  const now = Date.now();
  const season = seasons.find((s) => s.id === seasonId) || seasons.find((s) => Number(s.startMs) <= now && now < Number(s.endMs)) || [...seasons].sort((a, b) => Number(b.startMs) - Number(a.startMs))[0] || null;
  const sid = season?.id || '';
  useEffect(() => subscribeSeasonJoins(sid, setJoins), [sid]);
  useEffect(() => subscribeSeasonMatches(sid, setMatches), [sid]);
  useEffect(() => subscribeRewardWeeks(sid, setWeeks), [sid]);
  useEffect(() => subscribeRewardJoins(sid, setRewardJoins), [sid]);
  useEffect(() => subscribePointAdjust(sid, setAdjusts), [sid]);

  const refresh = async () => {
    setLoadErr('');
    try {
      const [p, c, t, r] = await Promise.all([loadPhones(), loadCredits(), loadTaps(sid), loadReports().catch(() => [])]);
      setPhones(p);
      setCredits(c);
      setTaps(t);
      setReports(r);
    } catch (e: any) {
      setLoadErr(e?.message || 'Could not load. Check that you are signed in as admin and the new rules are published.');
    }
  };
  useEffect(() => {
    refresh();
  }, [sid]);

  const shared = { season, gamers, matches, joins, weeks, rewardJoins, adjusts, config, phones, credits, taps, refresh };

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className={h}>{section === 'contest' ? 'Weekly contest' : 'League players'}</p>
        <select value={sid} onChange={(e) => setSeasonId(e.target.value)} className="h-8 px-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700">
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {!season && <p className="text-xs text-slate-400">Create a league first (League games section above).</p>}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`${btn} ${tab === id ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {label}
            {id === 'reports' && reports.some((r) => !r.handledMs) ? ` (${reports.filter((r) => !r.handledMs).length})` : ''}
          </button>
        ))}
        <button type="button" onClick={refresh} className={`${btn} text-slate-500`}>
          Reload
        </button>
      </div>
      {loadErr && <p className="text-xs font-semibold text-rose-600">{loadErr}</p>}
      {season && tab === 'players' && <PlayersTab {...shared} season={season} />}
      {season && tab === 'credits' && <CreditsTab {...shared} />}
      {season && tab === 'weeks' && <WeeksTab {...shared} season={season} />}
      {season && tab === 'special' && <SpecialTab {...shared} season={season} events={events} bookings={bookings} winners={winners} />}
      {tab === 'reports' && <ReportsTab reports={reports} refresh={refresh} />}
      {season && tab === 'taps' && <TapsTab taps={taps} />}
      {tab === 'announce' && <AnnounceBox config={config} />}
      {tab === 'settings' && <SettingsTab config={config} />}
    </div>
  );
};

/* ------------------------------ Players ------------------------------ */

type Seg = 'never' | 'low' | 'active';
const SEG_LABEL: Record<Seg, string> = { never: 'Never played', low: 'Low activity', active: 'Active' };
type View = 'all' | 'league' | 'reward';
const VIEW_LABEL: Record<View, string> = { all: 'All players', league: 'League table', reward: 'Weekly reward' };

const PlayersTab: React.FC<any> = ({ season, gamers, matches, joins, taps, phones, config, weeks, rewardJoins, credits, refresh }) => {
  const [game, setGame] = useState<string>(GAMES[0].id);
  const [view, setView] = useState<View>('all');
  const [seg, setSeg] = useState<Seg | 'all'>('all');
  const [q, setQ] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openPanel, setOpenPanel] = useState('');
  const [removed, setRemoved] = useState<any>(null);
  const nowMs = Date.now();
  // "All games" only makes sense for the weekly reward list
  const activeGame = game === 'all' && view !== 'reward' ? GAMES[0].id : game;
  const joined = new Set(joins.map((j: any) => j.gid));
  const seasonMatches = useMemo(() => matches.filter((m: any) => m.seasonId === season.id), [matches, season.id]);
  const signals = useMemo(() => farmSignals(gamers, seasonMatches, phones), [gamers, seasonMatches, phones]);
  const regSets = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    GAMES.forEach((g: { id: string }) => (out[g.id] = new Set(rewardRegsFor(rewardJoins, gamers, g.id).map((r: any) => r.gid))));
    return out;
  }, [rewardJoins, gamers]);

  const rewardPhase = (gm: string): { kind: 'running' | 'scheduled' | 'full' | 'near' | 'open'; week?: any; n: number; min: number; left: number } => {
    const c = rewardConfigFor(config, gm);
    const n = regSets[gm]?.size || 0;
    const mine = weeks.filter((w: any) => w.game === gm);
    const running = mine.find((w: any) => weekPhase(w, nowMs) === 'running');
    const sched = mine.filter((w: any) => weekPhase(w, nowMs) === 'scheduled').sort((a: any, b: any) => Number(a.startMs) - Number(b.startMs))[0];
    const left = Math.max(0, c.minPlayers - n);
    if (running) return { kind: 'running', week: running, n, min: c.minPlayers, left };
    if (sched) return { kind: 'scheduled', week: sched, n, min: c.minPlayers, left };
    if (n >= c.minPlayers) return { kind: 'full', n, min: c.minPlayers, left };
    if (left <= 5) return { kind: 'near', n, min: c.minPlayers, left };
    return { kind: 'open', n, min: c.minPlayers, left };
  };

  const entries = useMemo(() => {
    const ids = activeGame === 'all' ? GAMES.map((x: { id: string }) => x.id) : [activeGame];
    const list: { g: any; game: string }[] = [];
    ids.forEach((gm: string) => {
      if (view === 'reward') {
        (regSets[gm] ? [...regSets[gm]] : []).forEach((gid) => {
          const g = gamers.find((x: any) => x.id === gid);
          if (g) list.push({ g, game: gm });
        });
      } else {
        gamers.filter((g: any) => playsGame(g, gm) && (view === 'all' || joined.has(g.id))).forEach((g: any) => list.push({ g, game: gm }));
      }
    });
    return list;
  }, [gamers, activeGame, view, regSets, joins]);

  const rows = useMemo(() => {
    const list = entries.map(({ g, game: gm }) => {
      const mine = seasonMatches.filter((m: any) => m.game === gm && matchCounts(m) && (m.aUid === g.id || m.bUid === g.id) && (view !== 'reward' || contestOf(m) === 'reward'));
      const last = mine.reduce((t: number, m: any) => Math.max(t, Number(m.loggedAtMs || 0)), 0);
      const sent = taps.filter((t: any) => t.game === gm && t.from === g.id).length;
      const segment: Seg = mine.length === 0 ? 'never' : nowMs - last > 7 * DAY ? 'low' : 'active';
      return { g, game: gm, played: mine.length, sent, last, segment, contacted: Number(g.contacted?.[gm] || 0), joined: joined.has(g.id), rewardReg: Boolean(regSets[gm]?.has(g.id)), sig: signals.get(g.id) };
    });
    return list.sort((a: any, b: any) => {
      if (flaggedOnly) return (b.sig?.score || 0) - (a.sig?.score || 0);
      return Number(Boolean(a.contacted)) - Number(Boolean(b.contacted)) || a.contacted - b.contacted || (a.segment === b.segment ? a.last - b.last : a.segment === 'never' ? -1 : b.segment === 'never' ? 1 : a.segment === 'low' ? -1 : 1);
    });
  }, [entries, seasonMatches, taps, view, signals, regSets, flaggedOnly, joins]);

  const count = (sg: Seg) => rows.filter((r: any) => r.segment === sg).length;
  const flaggedCount = rows.filter((r: any) => r.sig?.flagged).length;
  const shown = rows.filter(
    (r: any) => (seg === 'all' || r.segment === seg) && (!flaggedOnly || r.sig?.flagged) && (!q.trim() || String(r.g.name).toLowerCase().includes(q.trim().toLowerCase()))
  );
  const viewCount = (v: View) => {
    if (v === 'reward') return activeGame === 'all' ? GAMES.reduce((t: number, g: { id: string }) => t + (regSets[g.id]?.size || 0), 0) : regSets[activeGame]?.size || 0;
    return gamers.filter((g: any) => playsGame(g, activeGame === 'all' ? GAMES[0].id : activeGame) && (v === 'all' || joined.has(g.id))).length;
  };

  const leagueMessage = (r: any) => {
    const cfg = rewardConfigFor(config, r.game);
    const name = r.g.name;
    const gl = gameLabel(r.game);
    if (r.segment === 'never') return `Hi ${name}, it's Roomly Caritas. You signed up for ${gl} but you have not played a match yet. Open Games, pick someone from Players to challenge and play your first one. The weekly reward is a ${naira(cfg.creditValue)} food credit.`;
    if (r.segment === 'low') return `Hi ${name}, it's Roomly Caritas. We have not seen a ${gl} match from you in over a week. You have ${r.played} played so far this season. Come back and challenge someone, the weekly ${naira(cfg.creditValue)} food credit is still up for grabs.`;
    return `Hi ${name}, it's Roomly Caritas. You are doing well in ${gl} with ${r.played} matches this season. Keep going, the top 3 with at least ${cfg.minPoints} points win a ${naira(cfg.creditValue)} food credit each reward week.`;
  };
  /** The reward message depends on where that game's reward stands, and on whether the player has joined it */
  const rewardMessage = (r: any, asRegistered = r.rewardReg) => {
    const cfg = rewardConfigFor(config, r.game);
    const ph = rewardPhase(r.game);
    const name = r.g.name;
    const gl = gameLabel(r.game);
    const prize = `The top 3 with at least ${cfg.minPoints} points win a ${naira(cfg.creditValue)} food credit each.`;
    const hi = `Hi ${name}, it's Roomly Caritas.`;
    if (asRegistered) {
      if (ph.kind === 'running') return `${hi} The ${gl} reward week is running now and closes ${when(Number(ph.week.endMs))}. ${prize} Open Games, tap ${gl} and log your reward matches before it closes.`;
      if (ph.kind === 'scheduled') return `${hi} The ${gl} reward week starts ${when(Number(ph.week.startMs))} and runs 7 days. ${prize} You are registered, so be ready to play your reward matches.`;
      if (ph.kind === 'full') return `${hi} The ${gl} reward has ${ph.n} registered players and is next in line to start. ${prize} You are registered, so be ready.`;
      if (ph.kind === 'near') return `${hi} You are registered for the ${gl} reward. ${ph.n} of ${ph.min} players are in, only ${ph.left} more and the week starts. Tell your friends who play ${gl} to join so it starts sooner.`;
      return `${hi} You are registered for the ${gl} reward. ${ph.n} of ${ph.min} players are in so far. The week starts once ${ph.min} players have registered, so invite the ${gl} players you know.`;
    }
    if (ph.kind === 'running') return `${hi} The ${gl} reward week is running now. ${prize} You play ${gl} but have not joined the reward contest. Open Games, tap ${gl} and tap Join the reward contest. You can join late.`;
    if (ph.kind === 'scheduled') return `${hi} The ${gl} reward week starts ${when(Number(ph.week.startMs))}. ${prize} You play ${gl} but have not joined the reward contest. Open Games, tap ${gl} and tap Join the reward contest.`;
    if (ph.kind === 'full') return `${hi} The ${gl} reward has ${ph.n} players registered and is next in line to start. You play ${gl} but have not joined. Open Games, tap ${gl} and tap Join the reward contest so you are on the table when the week starts.`;
    if (ph.kind === 'near') return `${hi} The ${gl} reward needs only ${ph.left} more players to start (${ph.n} of ${ph.min}). You play ${gl}. Join the reward contest in Games and help it start.`;
    return `${hi} ${ph.n} of ${ph.min} players have joined the ${gl} reward contest. You play ${gl}, so join it in Games and invite others. The week starts once ${ph.min} are in.`;
  };

  const run = async (fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
  };

  const remove = async (r: any) => {
    const opps = opponentsOf(r.g.id, seasonMatches, gamers);
    const total = seasonMatches.filter((m: any) => matchCounts(m) && (m.aUid === r.g.id || m.bUid === r.g.id)).length;
    const pts = opps.reduce((t: number, o: any) => t + o.pts, 0);
    if (!window.confirm(`Remove ${r.g.name}?\n\nThe account is blocked and its ${total} counted matches this season are voided in the league and the reward contest. ${opps.length} opponents lose ${pts} points in total. This cannot be undone.`)) return;
    try {
      const reward = seasonMatches.filter((m: any) => matchCounts(m) && contestOf(m) === 'reward' && (m.aUid === r.g.id || m.bUid === r.g.id));
      const weekKeys = new Set(reward.map((m: any) => m.weekKey));
      const oppIds = new Set(opps.map((o: any) => o.id));
      const toCheck = credits.filter((c: any) => weekKeys.has(c.weekKey) && oppIds.has(c.gid) && c.status !== 'void').map((c: any) => `${c.name} (${gameLabel(c.game)})`);
      const n = await removeFarmAccount(r.g.id, season.id, seasonMatches);
      setRemoved({ name: r.g.name, voided: n, opps, toCheck });
      setOpenPanel('');
      refresh();
    } catch (e: any) {
      window.alert(e?.message || 'Could not remove the account.');
    }
  };

  const views: View[] = ['all', 'league', 'reward'];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {GAMES.map((g: { id: string; label: string }) => {
          const c = rewardConfigFor(config, g.id);
          return (
            <button key={g.id} type="button" onClick={() => setGame(g.id)} className={`${btn} ${activeGame === g.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
              {g.label} {regSets[g.id]?.size || 0}/{c.minPlayers}
            </button>
          );
        })}
        {view === 'reward' && (
          <button type="button" onClick={() => setGame('all')} className={`${btn} ${activeGame === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            All games
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400">The numbers are players registered for each game's reward contest, and how many it needs to start.</p>
      <div className="grid grid-cols-3 gap-1.5">
        {views.map((v) => (
          <button key={v} type="button" onClick={() => { setView(v); setSeg('all'); }} className={`py-2 rounded-xl text-[11px] font-bold cursor-pointer ${view === v ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {VIEW_LABEL[v]} {viewCount(v)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400">
        {view === 'all' ? 'Everyone who has an account in this game.' : view === 'league' ? `Players on the ${season.name} league table for this game.` : activeGame === 'all' ? 'Players registered for a reward contest, across all games. A player appears once for each game.' : (() => { const ph = rewardPhase(activeGame); return ph.kind === 'running' ? 'The reward week is running now.' : ph.kind === 'scheduled' ? `The reward week starts ${when(Number(ph.week.startMs))}.` : `Collecting players: ${ph.n} of ${ph.min} registered.`; })()}
      </p>
      {removed && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs space-y-1.5">
          <p className="font-bold text-rose-700 dark:text-rose-300">{removed.name} removed. {removed.voided} matches voided.</p>
          {removed.opps.length > 0 && <p className="text-[11px] text-slate-600 dark:text-slate-300">Points taken from: {removed.opps.map((o: any) => `${o.name} (${o.pts})`).join(', ')}.</p>}
          {removed.toCheck.length > 0 ? (
            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Credits already issued to these players for the affected weeks: {removed.toCheck.join(', ')}. Check them in Credits and void any that no longer qualify.</p>
          ) : (
            <p className="text-[11px] text-slate-500">No credits were issued to these opponents for the affected weeks.</p>
          )}
          <button type="button" onClick={() => setRemoved(null)} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
            Close
          </button>
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {([['all', 'All', rows.length], ['never', 'Never played', count('never')], ['low', 'Low activity', count('low')], ['active', 'Active', count('active')]] as [Seg | 'all', string, number][]).map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setSeg(id)} className={`p-2 rounded-xl ${seg === id ? 'bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-[#0e9f55]' : 'bg-slate-50 dark:bg-slate-800/60'} cursor-pointer`}>
            <p className="text-base font-black text-slate-900 dark:text-white">{n}</p>
            <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
          </button>
        ))}
      </div>
      {view === 'league' && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1.5">
          <p className="text-[11px] text-slate-600 dark:text-slate-300">Put everyone already registered on {season.name}. They appear in the tables of their own games and tick the rules the first time they open Games.</p>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Add all registered players to ${season.name}?`)) return;
              try {
                const n = await addAllToSeason(season, gamers, new Set(joins.map((j: any) => j.gid)));
                window.alert(`${n} players added.`);
              } catch (e: any) {
                window.alert(e?.message || 'Could not add them.');
              }
            }}
            className={`${btn} bg-[#0e9f55] text-white`}
          >
            Add all registered players
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={input} />
        <button type="button" onClick={() => setFlaggedOnly(!flaggedOnly)} className={`${btn} shrink-0 ${flaggedOnly ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
          Flagged {flaggedCount}
        </button>
      </div>
      <p className="text-[10px] text-slate-400">{flaggedOnly ? 'Highest suspicion first. The score only points you at a player, nobody is blocked automatically.' : 'Not contacted first. Low activity means no match in the last 7 days.'}</p>
      {shown.length === 0 && <p className="text-xs text-slate-400">Nobody here.</p>}
      {shown.slice(0, 80).map((r: any) => {
        const phone = phones.get(r.g.id);
        const blocked = Boolean(r.g.rewardBlocked?.[r.game]);
        const sig = r.sig;
        const checked = Number(r.g.contacted?.numberChecked || 0) > 0;
        const noWa = Number(r.g.contacted?.noWa || 0) > 0;
        const streakish = Boolean(sig && sig.streak >= STREAK_FLAG);
        const rowKey = `${r.g.id}_${r.game}`;
        const opps = streakish && openPanel === rowKey ? opponentsOf(r.g.id, seasonMatches, gamers) : [];
        return (
          <div key={rowKey} className={`p-3 rounded-xl text-xs space-y-1.5 ${sig?.flagged ? 'bg-rose-50 dark:bg-rose-950/20 ring-1 ring-rose-200 dark:ring-rose-900' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-900 dark:text-white truncate">
                {r.g.name}
                {activeGame === 'all' ? <span className="font-normal text-slate-500"> · {gameLabel(r.game)}</span> : null}{' '}
                <span className="font-normal text-slate-400">{SEG_LABEL[r.segment as Seg]}{view !== 'reward' && !r.joined ? ', not in season' : ''}</span>
              </p>
              <span className="text-[10px] text-slate-400 shrink-0">{r.g.lastActiveMs ? `Active ${timeAgo(Number(r.g.lastActiveMs))}` : 'No activity'}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Matches {r.played} · Taps sent {r.sent} · {r.contacted ? `Contacted ${day(r.contacted)}` : 'Not contacted'}
              {blocked ? ' · Blocked from rewards' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.rewardReg ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                Reward {r.rewardReg ? 'registered' : 'not registered'}
              </span>
              {checked && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">Number checked</span>}
              {noWa && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">Not on WhatsApp</span>}
              {sig && sig.score > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">Suspicion {sig.score}</span>}
            </div>
            {sig && sig.flags.length > 0 && (
              <ul className="space-y-0.5">
                {sig.flags.map((f: any) => (
                  <li key={f.key} className={`text-[11px] ${f.level === 'high' ? 'font-bold text-rose-600' : f.level === 'mid' ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                    {f.text}
                    {f.key === 'dup' && sig.dupWith.length ? `: ${sig.dupWith.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!phone} onClick={() => open(waTo(phone, view === 'reward' ? rewardMessage(r) : leagueMessage(r)))} className={`${btn} bg-[#0e9f55] text-white`}>
                {phone ? (view === 'reward' ? 'WhatsApp reward' : 'WhatsApp') : 'No number'}
              </button>
              {view !== 'reward' && !r.rewardReg && (
                <button type="button" disabled={!phone} onClick={() => open(waTo(phone, rewardMessage(r, false)))} className={`${btn} bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55]`}>
                  Invite to reward
                </button>
              )}
              <button type="button" onClick={() => markContacted(r.g.id, r.game, !r.contacted)} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                {r.contacted ? 'Clear contacted' : 'Mark contacted'}
              </button>
              <button type="button" onClick={() => run(() => markNumberChecked(r.g.id, !checked))} className={`${btn} ${checked ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700'}`}>
                {checked ? 'Number checked' : 'Mark number checked'}
              </button>
              {(streakish || noWa) && (
                <button type="button" onClick={() => run(() => markNoWhatsapp(r.g.id, !noWa))} className={`${btn} ${noWa ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  {noWa ? 'Clear not on WhatsApp' : 'Not on WhatsApp'}
                </button>
              )}
              <button type="button" onClick={() => setRewardBlocked(r.g.id, r.game, !blocked)} className={`${btn} text-rose-600`}>
                {blocked ? 'Allow rewards' : 'Block rewards'}
              </button>
              {streakish && (
                <button type="button" onClick={() => setOpenPanel(openPanel === rowKey ? '' : rowKey)} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
                  {openPanel === rowKey ? 'Hide opponents' : 'Opponents and removal'}
                </button>
              )}
            </div>
            {openPanel === rowKey && streakish && (
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {sig.streak} losses in a row in {gameLabel(sig.streakGame)}. Try the number on WhatsApp first. If it does not reach WhatsApp, mark it, warn the opponents below, and remove the account at {STREAK_REMOVE} in a row.
                </p>
                {opps.map((o: any) => {
                  const op = phones.get(o.id);
                  const text = `Hi ${o.name}, it's Roomly Caritas. We are checking the account ${r.g.name} that you played in ${gameLabel(sig.streakGame)}. We cannot reach them on WhatsApp. Your points from matches against this account will be removed unless you give us a WhatsApp number to reach them.`;
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-700 dark:text-slate-200 min-w-0">
                        <span className="font-bold">{o.name}</span> · {o.matches} {o.matches === 1 ? 'match' : 'matches'}, {o.pts} pts at stake
                      </p>
                      <button type="button" disabled={!op} onClick={() => open(waTo(op, text))} className={`${btn} bg-[#0e9f55] text-white shrink-0`}>
                        {op ? 'Warn on WhatsApp' : 'No number'}
                      </button>
                    </div>
                  );
                })}
                <button type="button" disabled={!sig.removable} onClick={() => remove(r)} className={`${btn} bg-rose-600 text-white`}>
                  Remove account and void its matches
                </button>
                {!sig.removable && <p className="text-[10px] text-slate-400">Removal opens at {STREAK_REMOVE} losses in a row with the number marked "Not on WhatsApp".</p>}
              </div>
            )}
          </div>
        );
      })}
      {shown.length > 80 && <p className="text-[11px] text-slate-400">Showing 80. Use search to find others.</p>}
    </div>
  );
};

/* ------------------------------ Credits ------------------------------ */

const STATE_LABEL: Record<string, string> = { locked: 'Issued, opens soon', active: 'Issued, usable', used: 'Used', expired: 'Expired', void: 'Cancelled' };

const CreditsTab: React.FC<any> = ({ credits, phones, refresh }) => {
  const [f, setF] = useState<'all' | 'issued' | 'used' | 'expired'>('all');
  const nowMs = Date.now();
  const list = credits
    .map((c: any) => ({ c, st: creditState(c, nowMs) as string }))
    .filter(({ st }: any) => f === 'all' || (f === 'issued' ? st === 'locked' || st === 'active' : st === f));
  const num = (k: string) => credits.filter((c: any) => (k === 'issued' ? ['locked', 'active'].includes(creditState(c, nowMs)) : creditState(c, nowMs) === k)).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {([['all', `All ${credits.length}`], ['issued', `Issued ${num('issued')}`], ['used', `Used ${num('used')}`], ['expired', `Expired ${num('expired')}`]] as ['all' | 'issued' | 'used' | 'expired', string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setF(id)} className={`${btn} ${f === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-xs text-slate-400">No credits.</p>}
      {list.slice(0, 100).map(({ c, st }: any) => {
        const phone = phones.get(c.gid);
        const text =
          c.kind === 'special'
            ? `Congratulations ${c.name}. You won ${naira(c.value)} food credit in the ${gameLabel(c.game)} Special 1v1 on Roomly Caritas. It is open now and lasts ${CREDIT_HOURS} hours. Order before it expires and tick "Use my Games credit" at checkout.`
            : `Congratulations ${c.name}. You finished #${c.rank} in the ${gameLabel(c.game)} reward week and won a ${naira(c.value)} food credit on Roomly Caritas. It opens ${when(Number(c.validFromMs))} and lasts ${CREDIT_HOURS} hours. Order before it expires and tick "Use my Games credit" at checkout.`;
        return (
          <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              {c.name} <span className="font-normal text-slate-400">{gameLabel(c.game)}, {c.kind === 'special' ? `Special 1v1${c.reason ? `: ${c.reason}` : ''}` : `#${c.rank}`}, {naira(c.value)}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {STATE_LABEL[st] || st} · Issued {when(Number(c.issuedAtMs))} · Opens {when(Number(c.validFromMs))} · Expires {when(Number(c.expiresAtMs))}
              {c.status === 'used' && c.usedAtMs ? ` · Used ${when(Number(c.usedAtMs))}` : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!phone} onClick={() => open(waTo(phone, text))} className={`${btn} bg-[#0e9f55] text-white`}>
                Notify winner
              </button>
              {c.status !== 'void' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(c.status === 'used' ? 'This credit was already used on an order. Cancel it anyway?' : 'Cancel this credit?')) return;
                    await voidCredit(c.id);
                    refresh();
                  }}
                  className={`${btn} text-rose-600`}
                >
                  Void
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------ Special 1v1 ------------------------------ */

/** A Lagos clock time on a date, as a timestamp (Lagos is always UTC+1) */
const lagosMs = (date: string, time: string) => Date.parse(`${date}T${time}:00+01:00`);

const SpecialTab: React.FC<any> = ({ season, gamers, matches, adjusts, phones, credits, events, bookings, winners, refresh }) => {
  const [game, setGame] = useState<string>(GAMES[0].id);
  const [xId, setXId] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('00:00');
  const [to, setTo] = useState('23:59');
  const [prizeC, setPrizeC] = useState('3500');
  const [prizeX, setPrizeX] = useState('5000');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [adjGid, setAdjGid] = useState('');
  const [adjPts, setAdjPts] = useState('');
  const [adjWhy, setAdjWhy] = useState('');
  const nowMs = Date.now();
  const players = useMemo(
    () => gamers.filter((g: any) => playsGame(g, game) && !g.banned).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))),
    [gamers, game]
  );
  const run = async (fn: () => Promise<any>, ok = '') => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
      refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Could not save.');
    }
    setBusy(false);
  };
  const create = () =>
    run(async () => {
      const x = players.find((g: any) => g.id === xId);
      if (!x) throw new Error('Pick the special player.');
      if (!date) throw new Error('Pick the day.');
      await createSpecialEvent({
        seasonId: season.id,
        game,
        xId: x.id,
        xName: x.name,
        startMs: lagosMs(date, from),
        endMs: lagosMs(date, to) + 60000,
        prizeChallenger: Number(prizeC),
        prizeX: Number(prizeX),
      });
      setXId('');
      setDate('');
    }, 'Special 1v1 created. Its card now shows on that game page.');
  const adjust = () =>
    run(async () => {
      const g = gamers.find((x: any) => x.id === adjGid);
      if (!g) throw new Error('Pick the player.');
      if (!adjWhy.trim()) throw new Error('Write a short reason.');
      await adjustPoints({ seasonId: season.id, weekKey: '', game, gid: g.id, name: g.name, pts: Number(adjPts), reason: adjWhy.trim() });
      setAdjPts('');
      setAdjWhy('');
    }, 'Points changed in the league table.');
  const recentAdj = adjusts.filter((a: any) => !a.weekKey && a.game === game).sort((a: any, b: any) => Number(b.atMs) - Number(a.atMs)).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
        <p className={h}>New Special 1v1</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={game} onChange={(e) => { setGame(e.target.value); setXId(''); }} className={input}>
            {GAMES.map((g: { id: string }) => (
              <option key={g.id} value={g.id}>{gameLabel(g.id)}</option>
            ))}
          </select>
          <select value={xId} onChange={(e) => setXId(e.target.value)} className={input}>
            <option value="">Special player (X)</option>
            {players.map((g: any) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} col-span-2`} />
          <label className="text-[10px] text-slate-500">From (Lagos time)<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="text-[10px] text-slate-500">Until<input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
          <label className="text-[10px] text-slate-500">Challenger prize (₦)<input inputMode="numeric" value={prizeC} onChange={(e) => setPrizeC(e.target.value.replace(/\D/g, ''))} className={input} /></label>
          <label className="text-[10px] text-slate-500">X prize (₦)<input inputMode="numeric" value={prizeX} onChange={(e) => setPrizeX(e.target.value.replace(/\D/g, ''))} className={input} /></label>
        </div>
        <p className="text-[10px] text-slate-500">On that day a challenger can log up to 5 matches against X and wins with 3 of 5. The first challenger to win ends the run. X wins by beating 5 different challengers.</p>
        <button type="button" disabled={busy} onClick={create} className={`${btn} bg-[#0e9f55] text-white`}>Create Special 1v1</button>
        {msg && <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{msg}</p>}
      </div>

      {events.length === 0 && <p className="text-xs text-slate-400">No Special 1v1 yet.</p>}
      {events.map((e: any) => {
        const ser = specialSeries(e, matches.filter((m: any) => m.game === e.game));
        const phase = nowMs < Number(e.startMs) ? 'Scheduled' : nowMs < Number(e.endMs) ? 'Live' : 'Ended';
        const bk = bookings.filter((b: any) => b.eventId === e.id);
        const win = ser.challengerWon
          ? { kind: 'challenger' as const, gid: ser.challengerWon.id, name: ser.challengerWon.name, value: Number(e.prizeChallenger), text: `${ser.challengerWon.name} beat ${e.xName} ${ser.challengerWon.cw}-${ser.challengerWon.xw}` }
          : ser.xWon
          ? { kind: 'x' as const, gid: e.xId, name: e.xName, value: Number(e.prizeX), text: `${e.xName} beat 5 challengers` }
          : null;
        const done = e.status === 'done';
        const wphone = e.winner ? phones.get(e.winner.gid) : '';
        const issued = credits.filter((c: any) => c.weekKey === e.id && c.status !== 'void');
        return (
          <div key={e.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-black text-slate-900 dark:text-white">
                {gameLabel(e.game)}: {e.xName} · {when(Number(e.startMs))} to {when(Number(e.endMs))}
              </p>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${e.status === 'paused' ? 'bg-amber-100 text-amber-800' : done ? 'bg-slate-200 text-slate-700' : phase === 'Live' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {e.status === 'paused' ? 'Paused' : done ? 'Closed' : phase}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Prizes: challenger {naira(Number(e.prizeChallenger))}, X {naira(Number(e.prizeX))}. X has beaten {ser.xBeaten} of 5 challengers.</p>
            {ser.rows.length === 0 ? (
              <p className="text-[11px] text-slate-400">No matches against {e.xName} yet.</p>
            ) : (
              <div className="space-y-1">
                {ser.rows.map((r: any) => (
                  <p key={r.id} className="text-[11px] text-slate-700 dark:text-slate-200">
                    <span className="font-bold">{e.xName} vs {r.name}</span> {r.xw}-{r.cw} ({r.results.join(' ')}) {r.state === 'won' ? '· challenger won' : r.state === 'lost' ? '· X won the series' : ''}
                  </p>
                ))}
              </div>
            )}
            {win && !done && (
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 space-y-1.5">
                <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Won, pending your review: {win.text}</p>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Check the matches first. Publish "${win.text}" as the winner?`)) run(() => confirmSpecialWinner(e, win)); }} className={`${btn} bg-[#0e9f55] text-white`}>
                  Confirm winner
                </button>
              </div>
            )}
            {done && e.winner && (
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1.5">
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">Winner: {e.winner.name} ({e.winner.kind === 'x' ? 'X' : 'challenger'})</p>
                {issued.length > 0 && <p className="text-[11px] text-slate-500">Credit issued: {issued.map((c: any) => `${naira(c.value)} to ${c.name}`).join(', ')}. See it in Credits.</p>}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const v = e.winner.kind === 'x' ? Number(e.prizeX) : Number(e.prizeChallenger);
                      if (!window.confirm(`Issue a ${naira(v)} credit to ${e.winner.name}? It opens now and lasts ${CREDIT_HOURS} hours.`)) return;
                      run(() => issueSpecialCredit(e, e.winner.gid, e.winner.name, phones.get(e.winner.gid) || '', v, e.winner.kind === 'x' ? 'Beat 5 challengers' : `Beat ${e.xName}`), 'Credit issued.');
                    }}
                    className={`${btn} bg-[#0e9f55] text-white`}
                  >
                    Issue credit
                  </button>
                  <button type="button" disabled={!wphone} onClick={() => open(waTo(wphone, `Congratulations ${e.winner.name}. You won the ${gameLabel(e.game)} Special 1v1 on Roomly Caritas. Your food credit is on its way and lasts ${CREDIT_HOURS} hours once issued.`))} className={`${btn} text-[#0e9f55]`}>
                    Message winner
                  </button>
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm('Reopen this event and remove the published winner line?')) run(() => reopenSpecial(e)); }} className={`${btn} text-slate-500`}>
                    Reopen
                  </button>
                </div>
              </div>
            )}
            {bk.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Booked ({bk.length})</p>
                {bk.map((b: any) => {
                  const ph = phones.get(b.gid);
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{b.name} <span className="text-slate-400">({b.part})</span></p>
                      <span className="flex gap-1.5">
                        <button type="button" disabled={!ph} onClick={() => open(waTo(ph, `Hi ${b.name}. Your Special 1v1 against ${e.xName} on Roomly Caritas is on ${day(Number(e.startMs))}. Open Games and tap Challenge to play.`))} className={`${btn} text-[#0e9f55]`}>
                          Remind
                        </button>
                        <button type="button" onClick={() => run(() => removeBooking(b.id))} className={`${btn} text-rose-600`}>Remove</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {!done && (
                <button type="button" disabled={busy} onClick={() => run(() => setSpecialStatus(e.id, e.status === 'paused' ? 'on' : 'paused'))} className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
                  {e.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove this event? The card disappears. Matches already logged are not touched.')) run(() => removeSpecialEvent(e.id)); }} className={`${btn} text-rose-600`}>
                Remove event
              </button>
            </div>
          </div>
        );
      })}

      {winners.length > 0 && (
        <div className="space-y-1">
          <p className={h}>Winner lines shown on game pages</p>
          {winners.slice(0, 10).map((w: any) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-[11px]">
              <p className="text-slate-600 dark:text-slate-300 min-w-0 truncate">{gameLabel(w.game)}: {w.kind === 'special' ? w.text : `${w.name}, #${w.rank} weekly`}</p>
              <button type="button" onClick={() => { if (window.confirm('Remove this line from the game page?')) run(() => removeWinnerLine(w.id)); }} className={`${btn} text-rose-600 shrink-0`}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
        <p className={h}>Add or remove league points ({gameLabel(game)})</p>
        <p className="text-[10px] text-slate-500">Changes the league table for the game above. Use a minus to remove points, like -3. Players do not see the change as a match.</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={adjGid} onChange={(e) => setAdjGid(e.target.value)} className={`${input} col-span-2`}>
            <option value="">Player</option>
            {players.map((g: any) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input value={adjPts} onChange={(e) => setAdjPts(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="-3" className={input} />
          <input value={adjWhy} onChange={(e) => setAdjWhy(e.target.value)} placeholder="Reason" className={`${input} col-span-3`} />
        </div>
        <button type="button" disabled={busy} onClick={adjust} className={`${btn} bg-[#0e9f55] text-white`}>Apply</button>
        {recentAdj.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
            <p className="text-slate-600 dark:text-slate-300 min-w-0">{a.name}: {a.pts > 0 ? '+' : ''}{a.pts} · {a.reason} · {when(Number(a.atMs))}</p>
            <button type="button" onClick={() => { if (window.confirm('Undo this change?')) run(() => undoAdjust(a.id)); }} className={`${btn} text-rose-600 shrink-0`}>Undo</button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------ Week review (disputes: points and credits) ------------------------------ */

const WeeksTab: React.FC<any> = ({ season, gamers, matches, weeks, rewardJoins, adjusts, config, phones, credits, refresh }) => {
  const [weekId, setWeekId] = useState('');
  const list = [...weeks].sort((a: any, b: any) => Number(b.startMs) - Number(a.startMs));
  const week = list.find((w: any) => w.id === weekId) || list[0] || null;
  const nowMs = Date.now();
  if (!week) return <p className="text-xs text-slate-400">No reward weeks yet. A week starts once a game has enough players.</p>;

  const joined = new Set(rewardJoins.filter((r: any) => r.game === week.game).map((r: any) => r.gid));
  const base = { seasonId: season.id, contest: 'reward', joined, fromMs: Number(week.startMs), toMs: Number(week.endMs), weekKey: week.id };
  const table = computeRows(week.game, gamers, matches, { ...base, adjusts });
  const disputed = matches.filter((m: any) => m.game === week.game && m.seasonId === season.id && m.status === 'disputed' && m.contest === 'reward' && m.weekKey === week.id && Number(m.loggedAtMs) >= Number(week.startMs) && Number(m.loggedAtMs) < Number(week.endMs));
  const minPoints = Number(week.minPoints) || rewardConfigFor(config, week.game).minPoints;
  const weekAdj = adjusts.filter((a: any) => a.weekKey === week.id);
  const credOf = (gid: string) => credits.filter((c: any) => c.weekKey === week.id && c.gid === gid && c.status !== 'void');

  const adjust = async (r: any) => {
    const v = window.prompt(`Points to add (or remove with a minus) for ${r.name}, for example 3 or -3`);
    if (!v) return;
    const reason = window.prompt('Reason (kept in the record)') || '';
    try {
      await adjustPoints({ seasonId: season.id, weekKey: week.id, game: week.game, gid: r.id, name: r.name, pts: Number(v), reason });
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
  };

  return (
    <div className="space-y-3">
      <select value={week.id} onChange={(e) => setWeekId(e.target.value)} className={input}>
        {list.map((w: any) => (
          <option key={w.id} value={w.id}>
            {gameLabel(w.game)}: {day(Number(w.startMs))} to {day(Number(w.endMs) - 1)} ({weekPhase(w, nowMs)})
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-500">
        Minimum points {minPoints}, credit {naira(Number(week.creditValue))}. {week.disputeFlag ? 'A report affected the top 3 when credits were issued. ' : ''}
        {disputed.length > 0 ? `${disputed.length} open dispute(s) in this week: resolve them in Disputed results above, then check the table here.` : 'No open disputes in this week.'}
      </p>
      {table.slice(0, 5).map((r: any) => {
        const cr = credOf(r.id);
        const qualifies = r.rank <= 3 && r.pts >= minPoints;
        return (
          <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              #{r.rank} {r.name} <span className="font-normal text-slate-500">{r.pts} pts{r.adj ? ` (${r.adj > 0 ? '+' : ''}${r.adj} by Roomly)` : ''}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {qualifies ? 'Qualifies for a credit.' : r.rank <= 3 ? 'Top 3 but below the minimum points.' : 'Outside the top 3.'}{' '}
              {cr.length ? `Credit: ${cr.map((c: any) => STATE_LABEL[creditState(c, nowMs)] || c.status).join(', ')}.` : 'No credit issued.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => adjust(r)} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
                Add or remove points
              </button>
              {cr.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(c.status === 'used' ? 'This credit was already used. Void it anyway?' : 'Void this credit?')) return;
                    await voidCredit(c.id);
                    refresh();
                  }}
                  className={`${btn} text-rose-600`}
                >
                  Void credit
                </button>
              ))}
              {cr.length === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Issue a ${naira(Number(week.creditValue))} credit to ${r.name} for this week?`)) return;
                    try {
                      await issueCredit(week, r.id, r.name, r.rank, phones.get(r.id) || '', Number(week.creditValue));
                      refresh();
                    } catch (e: any) {
                      window.alert(e?.message || 'Could not issue.');
                    }
                  }}
                  className={`${btn} bg-[#0e9f55] text-white`}
                >
                  Issue credit
                </button>
              )}
            </div>
          </div>
        );
      })}
      {weekAdj.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">Point changes made for this week</p>
          {weekAdj.map((a: any) => (
            <p key={a.id} className="text-[11px] text-slate-500">
              {a.name}: {a.pts > 0 ? '+' : ''}
              {a.pts} ({when(Number(a.atMs))}){a.reason ? `, ${a.reason}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------ Challenge log ------------------------------ */

const REASON_LABEL: Record<string, string> = {
  harassing: 'Harassing',
  fake: 'Fake result or screenshot',
  farming: 'Farming or fake points',
  noshow: 'Did not show',
  other: 'Other',
};
const ReportsTab: React.FC<{ reports: any[]; refresh: () => void }> = ({ reports, refresh }) => {
  const [showDone, setShowDone] = useState(false);
  const open = reports.filter((r) => !r.handledMs);
  const list = showDone ? reports : open;
  // How many reports each player has, so repeat names stand out
  const counts: Record<string, number> = {};
  reports.forEach((r) => (counts[r.target] = (counts[r.target] || 0) + 1));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">{open.length} waiting. Check the player's matches and screenshots in Players, then mark it handled.</p>
        <button type="button" onClick={() => setShowDone(!showDone)} className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0`}>
          {showDone ? 'Hide handled' : 'Show handled'}
        </button>
      </div>
      {list.length === 0 && <p className="text-xs text-slate-400">No reports.</p>}
      {list.map((r) => (
        <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
          <p className="text-xs text-slate-800 dark:text-slate-200">
            <span className="font-bold">{r.fromName}</span> reported <span className="font-bold">{r.targetName}</span> · {gameLabel(r.game)} · {when(Number(r.atMs))}
          </p>
          <p className="text-[11px] font-bold text-rose-600">
            {REASON_LABEL[r.reason] || r.reason}
            {counts[r.target] > 1 ? ` · ${counts[r.target]} reports on this player` : ''}
          </p>
          {r.note && <p className="text-[11px] text-slate-600 dark:text-slate-300">{r.note}</p>}
          <button
            type="button"
            onClick={async () => {
              await setReportHandled(r.id, !r.handledMs).catch(() => window.alert('Could not update.'));
              refresh();
            }}
            className={`${btn} ${r.handledMs ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200' : 'bg-[#0e9f55] text-white'}`}
          >
            {r.handledMs ? 'Handled. Undo' : 'Mark handled'}
          </button>
        </div>
      ))}
    </div>
  );
};

const TapsTab: React.FC<{ taps: any[] }> = ({ taps }) => {
  const [q, setQ] = useState('');
  const [limitN, setLimitN] = useState(50);
  const n = q.trim().toLowerCase();
  const list = taps.filter((t) => !n || String(t.fromName).toLowerCase().includes(n) || String(t.toName).toLowerCase().includes(n) || gameLabel(t.game).toLowerCase().includes(n));
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player or game" className={input} />
      <p className="text-[11px] text-slate-500">{taps.length} challenge taps this season.</p>
      {list.slice(0, limitN).map((t) => (
        <p key={t.id} className="text-xs text-slate-700 dark:text-slate-300">
          <span className="font-bold">{t.fromName}</span> challenged <span className="font-bold">{t.toName}</span> · {gameLabel(t.game)} · {t.kind === 'reward' ? 'reward week' : 'league'} · {when(Number(t.atMs))}
        </p>
      ))}
      {list.length > limitN && (
        <button type="button" onClick={() => setLimitN(limitN + 50)} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
          Show more
        </button>
      )}
    </div>
  );
};

/* ------------------------------ Per-game settings ------------------------------ */

const AnnounceBox: React.FC<{ config: any }> = ({ config }) => {
  const [link, setLink] = useState(String(config?.groupLink || ''));
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setLink(String(config?.groupLink || '')), [config?.groupLink]);
  const live = config?.notice && Number(config.notice.endMs) > Date.now() ? String(config.notice.text || '') : '';
  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
    } catch (e: any) {
      setMsg(e?.message || 'Could not save.');
    }
  };
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
      <p className="text-xs font-bold text-slate-900 dark:text-white">Official announcements</p>
      <p className="text-[10px] text-slate-500">WhatsApp group link (button in Games and in the bell)</p>
      <div className="flex gap-2">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." className={input} />
        <button type="button" onClick={() => run(() => saveGroupLink(link), 'Link saved.')} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900 shrink-0`}>
          Save
        </button>
      </div>
      <p className="text-[10px] text-slate-500">Notice of the day. It shows until midnight tonight; a new one replaces it.</p>
      {live && <p className="text-[11px] text-slate-700 dark:text-slate-300">Showing now: {live}</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={2} className="w-full p-3 text-sm bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700" placeholder="Short notice for players" />
      <div className="flex gap-2">
        <button type="button" disabled={!text.trim()} onClick={() => run(async () => { await postDailyNotice(text); setText(''); }, 'Notice posted.')} className={`${btn} bg-[#0e9f55] text-white`}>
          Post notice
        </button>
        {live && (
          <button type="button" onClick={() => run(() => postDailyNotice(''), 'Notice removed.')} className={`${btn} text-rose-600`}>
            Remove it
          </button>
        )}
      </div>
      {msg && <p className="text-[11px] text-slate-500">{msg}</p>}
    </div>
  );
};

const SettingsTab: React.FC<{ config: any }> = ({ config }) => (
  <div className="space-y-3">
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
      <p className="text-xs font-bold text-slate-900 dark:text-white">Games per week</p>
      <p className="text-[11px] text-slate-500">How many games run a reward week at the same time. Applies to weeks not yet scheduled.</p>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => saveSlots(n).catch((e: any) => window.alert(e?.message || 'Could not save.'))}
            className={`h-10 rounded-xl text-xs font-bold cursor-pointer ${rewardSlots(config) === n ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
          >
            {n} {n === 1 ? 'game' : 'games'}
          </button>
        ))}
      </div>
    </div>
    <p className="text-[11px] text-slate-500">Changes apply from the next reward week. A week that has already started keeps the settings it started with.</p>
    {GAMES.map((g: { id: string; label: string }) => (
      <GameSettingsRow key={g.id} game={g.id} label={g.label} cfg={rewardConfigFor(config, g.id)} />
    ))}
  </div>
);

const GameSettingsRow: React.FC<{ game: string; label: string; cfg: { minPlayers: number; minPoints: number; creditValue: number } }> = ({ game, label, cfg }) => {
  const [a, setA] = useState(String(cfg.minPlayers));
  const [b, setB] = useState(String(cfg.minPoints));
  const [c, setC] = useState(String(cfg.creditValue));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setA(String(cfg.minPlayers));
    setB(String(cfg.minPoints));
    setC(String(cfg.creditValue));
  }, [cfg.minPlayers, cfg.minPoints, cfg.creditValue]);
  const field = (lab: string, v: string, set: (x: string) => void) => (
    <div>
      <p className="text-[10px] text-slate-500 mb-0.5">{lab}</p>
      <input value={v} onChange={(e) => { set(e.target.value.replace(/\D/g, '')); setSaved(false); }} inputMode="numeric" className={input} />
    </div>
  );
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
      <p className="text-xs font-bold text-slate-900 dark:text-white">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {field('Min players', a, setA)}
        {field('Min points', b, setB)}
        {field('Credit value', c, setC)}
      </div>
      <button
        type="button"
        onClick={async () => {
          const cfgNew = { minPlayers: Number(a), minPoints: Number(b), creditValue: Number(c) };
          if (!cfgNew.minPlayers || !cfgNew.minPoints || !cfgNew.creditValue) return window.alert('Fill all three with numbers above zero.');
          await saveGameSettings(game, cfgNew);
          setSaved(true);
        }}
        className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}
      >
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  );
};
