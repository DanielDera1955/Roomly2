import React, { useEffect, useMemo, useState } from 'react';
import { GAMES, gameLabel, playsGame, subscribeGamers, subscribeAllMatches, timeAgo, waTo } from '../hub.js';
import { computeRows, matchCounts, weekPhase, creditState, rewardConfigFor } from '../boardCore.js';
import {
  subscribeSeasons,
  subscribeSeasonJoins,
  subscribeRewardWeeks,
  subscribeRewardJoins,
  subscribePointAdjust,
  subscribeGamesConfig,
  type Season,
} from '../season';
import {
  loadPhones,
  loadCredits,
  loadTaps,
  markContacted,
  setRewardBlocked,
  adjustPoints,
  voidCredit,
  issueCredit,
  saveGameSettings,
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

type Tab = 'players' | 'credits' | 'weeks' | 'taps' | 'settings';
const TABS: [Tab, string][] = [
  ['players', 'Players'],
  ['credits', 'Credits'],
  ['weeks', 'Week review'],
  ['taps', 'Challenge log'],
  ['settings', 'Settings'],
];

export const AdminGames: React.FC = () => {
  const [tab, setTab] = useState<Tab>('players');
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
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => subscribeSeasons(setSeasons), []);
  useEffect(() => subscribeGamers(setGamers), []);
  useEffect(() => subscribeAllMatches(setMatches), []);
  useEffect(() => subscribeGamesConfig(setConfig), []);
  const now = Date.now();
  const season = seasons.find((s) => s.id === seasonId) || seasons.find((s) => Number(s.startMs) <= now && now < Number(s.endMs)) || [...seasons].sort((a, b) => Number(b.startMs) - Number(a.startMs))[0] || null;
  const sid = season?.id || '';
  useEffect(() => subscribeSeasonJoins(sid, setJoins), [sid]);
  useEffect(() => subscribeRewardWeeks(sid, setWeeks), [sid]);
  useEffect(() => subscribeRewardJoins(sid, setRewardJoins), [sid]);
  useEffect(() => subscribePointAdjust(sid, setAdjusts), [sid]);

  const refresh = async () => {
    setLoadErr('');
    try {
      const [p, c, t] = await Promise.all([loadPhones(), loadCredits(), loadTaps(sid)]);
      setPhones(p);
      setCredits(c);
      setTaps(t);
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
        <p className={h}>Games</p>
        <select value={sid} onChange={(e) => setSeasonId(e.target.value)} className="h-8 px-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700">
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {!season && <p className="text-xs text-slate-400">Create a season first (Seasons box above).</p>}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`${btn} ${tab === id ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {label}
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
      {season && tab === 'taps' && <TapsTab taps={taps} />}
      {tab === 'settings' && <SettingsTab config={config} />}
    </div>
  );
};

/* ------------------------------ Players ------------------------------ */

type Seg = 'never' | 'low' | 'active';
const SEG_LABEL: Record<Seg, string> = { never: 'Never played', low: 'Low activity', active: 'Active' };

const PlayersTab: React.FC<any> = ({ season, gamers, matches, joins, taps, phones, config }) => {
  const [game, setGame] = useState<string>(GAMES[0].id);
  const [seg, setSeg] = useState<Seg | 'all'>('all');
  const [q, setQ] = useState('');
  const nowMs = Date.now();
  const joined = new Set(joins.map((j: any) => j.gid));
  const cfg = rewardConfigFor(config, game);

  const rows = useMemo(() => {
    const list = gamers
      .filter((g: any) => playsGame(g, game))
      .map((g: any) => {
        const mine = matches.filter((m: any) => m.game === game && m.seasonId === season.id && matchCounts(m) && (m.aUid === g.id || m.bUid === g.id));
        const last = mine.reduce((t: number, m: any) => Math.max(t, Number(m.loggedAtMs || 0)), 0);
        const sent = taps.filter((t: any) => t.game === game && t.from === g.id).length;
        const segment: Seg = mine.length === 0 ? 'never' : nowMs - last > 7 * DAY ? 'low' : 'active';
        return { g, played: mine.length, sent, last, segment, contacted: Number(g.contacted?.[game] || 0), joined: joined.has(g.id) };
      });
    return list.sort((a: any, b: any) => Number(Boolean(a.contacted)) - Number(Boolean(b.contacted)) || a.contacted - b.contacted || (a.segment === b.segment ? a.last - b.last : a.segment === 'never' ? -1 : b.segment === 'never' ? 1 : a.segment === 'low' ? -1 : 1));
  }, [gamers, matches, taps, game, season.id, joins]);

  const count = (s: Seg) => rows.filter((r: any) => r.segment === s).length;
  const shown = rows.filter((r: any) => (seg === 'all' || r.segment === seg) && (!q.trim() || String(r.g.name).toLowerCase().includes(q.trim().toLowerCase())));

  const message = (r: any) => {
    const name = r.g.name;
    const gl = gameLabel(game);
    if (r.segment === 'never') return `Hi ${name}, it's Roomly Caritas. You signed up for ${gl} but you have not played a match yet. Open Games, pick someone from Players to challenge and play your first one. The weekly reward is a ${naira(cfg.creditValue)} food credit.`;
    if (r.segment === 'low') return `Hi ${name}, it's Roomly Caritas. We have not seen a ${gl} match from you in over a week. You have ${r.played} played so far this season. Come back and challenge someone, the weekly ${naira(cfg.creditValue)} food credit is still up for grabs.`;
    return `Hi ${name}, it's Roomly Caritas. You are doing well in ${gl} with ${r.played} matches this season. Keep going, the top 3 with at least ${cfg.minPoints} points win a ${naira(cfg.creditValue)} food credit each reward week.`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {GAMES.map((g: { id: string; label: string }) => (
          <button key={g.id} type="button" onClick={() => setGame(g.id)} className={`${btn} ${game === g.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {([['all', 'All', rows.length], ['never', 'Never played', count('never')], ['low', 'Low activity', count('low')], ['active', 'Active', count('active')]] as [Seg | 'all', string, number][]).map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setSeg(id)} className={`p-2 rounded-xl ${seg === id ? 'bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-[#0e9f55]' : 'bg-slate-50 dark:bg-slate-800/60'} cursor-pointer`}>
            <p className="text-base font-black text-slate-900 dark:text-white">{n}</p>
            <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={input} />
      <p className="text-[10px] text-slate-400">Not contacted first. Low activity means no match in the last 7 days.</p>
      {shown.length === 0 && <p className="text-xs text-slate-400">Nobody here.</p>}
      {shown.slice(0, 80).map((r: any) => {
        const phone = phones.get(r.g.id);
        const blocked = Boolean(r.g.rewardBlocked?.[game]);
        return (
          <div key={r.g.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-900 dark:text-white truncate">
                {r.g.name} <span className="font-normal text-slate-400">{SEG_LABEL[r.segment as Seg]}{r.joined ? '' : ', not in season'}</span>
              </p>
              <span className="text-[10px] text-slate-400 shrink-0">{r.g.lastActiveMs ? `Active ${timeAgo(Number(r.g.lastActiveMs))}` : 'No activity'}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Matches {r.played} · Taps sent {r.sent} · {r.contacted ? `Contacted ${day(r.contacted)}` : 'Not contacted'}
              {blocked ? ' · Blocked from rewards' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!phone} onClick={() => open(waTo(phone, message(r)))} className={`${btn} bg-[#0e9f55] text-white`}>
                {phone ? 'WhatsApp' : 'No number'}
              </button>
              <button type="button" onClick={() => markContacted(r.g.id, game, !r.contacted)} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                {r.contacted ? 'Clear contacted' : 'Mark contacted'}
              </button>
              <button type="button" onClick={() => setRewardBlocked(r.g.id, game, !blocked)} className={`${btn} text-rose-600`}>
                {blocked ? 'Allow rewards' : 'Block rewards'}
              </button>
            </div>
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
        const text = `Congratulations ${c.name}. You finished #${c.rank} in the ${gameLabel(c.game)} reward week and won a ${naira(c.value)} food credit on Roomly Caritas. It opens ${when(Number(c.validFromMs))} and lasts 24 hours. Order before it expires and tick "Use my Games credit" at checkout.`;
        return (
          <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              {c.name} <span className="font-normal text-slate-400">{gameLabel(c.game)}, #{c.rank}, {naira(c.value)}</span>
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

/* ------------------------------ Week review (disputes: points and credits) ------------------------------ */

const WeeksTab: React.FC<any> = ({ season, gamers, matches, weeks, rewardJoins, adjusts, config, phones, credits, refresh }) => {
  const [weekId, setWeekId] = useState('');
  const list = [...weeks].sort((a: any, b: any) => Number(b.startMs) - Number(a.startMs));
  const week = list.find((w: any) => w.id === weekId) || list[0] || null;
  const nowMs = Date.now();
  if (!week) return <p className="text-xs text-slate-400">No reward weeks yet. A week starts once a game has enough players.</p>;

  const joined = new Set(rewardJoins.filter((r: any) => r.weekKey === week.id).map((r: any) => r.gid));
  const base = { seasonId: season.id, joined, fromMs: Number(week.startMs), toMs: Number(week.endMs), weekKey: week.id };
  const table = computeRows(week.game, gamers, matches, { ...base, adjusts });
  const disputed = matches.filter((m: any) => m.game === week.game && m.seasonId === season.id && m.status === 'disputed' && Number(m.loggedAtMs) >= Number(week.startMs) && Number(m.loggedAtMs) < Number(week.endMs));
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

const SettingsTab: React.FC<{ config: any }> = ({ config }) => (
  <div className="space-y-3">
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
