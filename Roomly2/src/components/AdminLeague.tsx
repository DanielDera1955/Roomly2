import React, { useEffect, useState } from 'react';
import { subscribeHubSettings, saveHubSettings } from '../hub.js';
import {
  subscribeSeasons,
  subscribeSeasonJoins,
  adminCreateSeason,
  adminUpdateSeasonDates,
  adminRenameSeason,
  adminEndSeasonNow,
  SEMESTER_NAMES,
  rulesAccepted,
  type Season,
} from '../season';
import { AdminGames } from './AdminGames';
import { GamesOpenDate, Disputes, Schools, ResetPlayer, AdminTournaments, toLocal } from './AdminHub';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50';
const h = 'text-xs font-black uppercase tracking-wider text-slate-500';
const DAY = 86400000;
const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Create a league. It is one league for all the games: every game gets its own table in it. */
const CreateLeague: React.FC = () => {
  const [name, setName] = useState(SEMESTER_NAMES[0]);
  const [year, setYear] = useState('');
  const [auto, setAuto] = useState(true);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const s = new Date(start);
      if (s.getDay() !== 1 || s.getHours() !== 0 || s.getMinutes() !== 0) {
        if (!window.confirm('A league should start on a Monday at 12:00AM so reward weeks line up. Create it with this start anyway?')) {
          setBusy(false);
          return;
        }
      }
      await adminCreateSeason(name, s.getTime(), new Date(end).getTime(), year, auto);
      setName(SEMESTER_NAMES[0]);
      setYear('');
      setStart('');
      setEnd('');
    } catch (e: any) {
      window.alert(e?.message || 'Could not create the league.');
    }
    setBusy(false);
  };
  return (
    <div className={card}>
      <p className={h}>Create a league</p>
      <p className="text-[11px] text-slate-500">One league covers all the games. Every game gets its own table in it, so you create it once.</p>
      <select value={name} onChange={(e) => setName(e.target.value)} className={input}>
        {SEMESTER_NAMES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <input value={year} onChange={(e) => setYear(e.target.value)} maxLength={20} className={input} placeholder="Year, for example 2026/2027" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Starts (a Monday, 12:00AM)</p>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Expected end (you can move it later)</p>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#0e9f55]" />
        Players join automatically (use for the 1st Semester League). Off means they tap "Join the league" and tick the rules.
      </label>
      <button type="button" disabled={busy || !start || !end || !year.trim()} onClick={create} className={`${btn} bg-[#0e9f55] text-white`}>
        Create league
      </button>
    </div>
  );
};

/** One league on the timeline: status, days left, postpone the end, end it now */
const LeagueCard: React.FC<{ s: Season }> = ({ s }) => {
  const [joins, setJoins] = useState<any[]>([]);
  const [a, setA] = useState(toLocal(Number(s.startMs)));
  const [b, setB] = useState(toLocal(Number(s.endMs)));
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeSeasonJoins(s.id, setJoins), [s.id]);
  useEffect(() => setA(toLocal(Number(s.startMs))), [s.startMs]);
  useEffect(() => setB(toLocal(Number(s.endMs))), [s.endMs]);
  const now = Date.now();
  const status = now < Number(s.startMs) ? 'Upcoming' : now < Number(s.endMs) ? 'Running' : 'Ended';
  const left = Math.ceil((Number(s.endMs) - now) / DAY);
  const accepted = joins.filter((j) => rulesAccepted(j)).length;
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy(false);
  };
  const postpone = (days: number) => run(() => adminUpdateSeasonDates(s.id, Number(s.startMs), Number(s.endMs) + days * DAY));
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <select
          value={SEMESTER_NAMES.includes(s.name) ? s.name : ''}
          onChange={(e) => run(() => adminRenameSeason(s.id, e.target.value))}
          className={`${input} !w-auto`}
        >
          {!SEMESTER_NAMES.includes(s.name) && <option value="">{s.name} (rename)</option>}
          {SEMESTER_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${status === 'Running' ? 'bg-emerald-100 text-emerald-700' : status === 'Upcoming' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{status}</span>
      </div>
      <p className="text-[11px] text-slate-500">
        {s.session ? `${s.session} · ` : ''}
        {dayText(Number(s.startMs))} to about {dayText(Number(s.endMs))}
        {status === 'Running' ? ` · ${Math.max(0, left)} day(s) left` : ''} · {accepted} players in the league
        {joins.length > accepted ? ` (${joins.length - accepted} added, not accepted yet)` : ''}
      </p>
      {status === 'Running' && left > 0 && left <= 3 && (
        <p className="text-[11px] font-semibold text-amber-600">Closes in {left} day(s). Postpone if school is still on.</p>
      )}
      {status !== 'Ended' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" value={a} onChange={(e) => setA(e.target.value)} className={input} />
            <input type="datetime-local" value={b} onChange={(e) => setB(e.target.value)} className={input} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={busy} onClick={() => run(() => adminUpdateSeasonDates(s.id, new Date(a).getTime(), new Date(b).getTime()))} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
              Save dates
            </button>
            {status === 'Running' && (
              <>
                <button type="button" disabled={busy} onClick={() => postpone(7)} className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
                  Postpone end 1 week
                </button>
                <button type="button" disabled={busy} onClick={() => postpone(14)} className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
                  Postpone 2 weeks
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('End this semester now? Champions are recorded and the tables are archived. This cannot be undone.')) run(() => adminEndSeasonNow(s.id, Number(s.startMs)));
                  }}
                  className={`${btn} bg-rose-600 text-white`}
                >
                  End semester now
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Timeline: React.FC = () => {
  const [list, setList] = useState<Season[]>([]);
  useEffect(() => subscribeSeasons(setList), []);
  const sorted = [...list].sort((x, y) => Number(y.startMs) - Number(x.startMs));
  return (
    <div className={card}>
      <p className={h}>League timeline</p>
      {sorted.length === 0 && <p className="text-xs text-slate-400">No league yet. Create one above and players can join.</p>}
      {sorted.map((s) => (
        <LeagueCard key={s.id} s={s} />
      ))}
    </div>
  );
};

/** The account students pay tournament entry fees to */
const TourneyAccount: React.FC = () => {
  const [settings, setSettings] = useState<any>({});
  useEffect(() => subscribeHubSettings(setSettings), []);
  const acc = settings.tourneyAccount || {};
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    setBank(acc.bank || '');
    setNumber(acc.number || '');
    setName(acc.name || '');
  }, [acc.bank, acc.number, acc.name]);
  const save = async () => {
    await saveHubSettings({ tourneyAccount: { bank: bank.trim(), number: number.replace(/\D/g, ''), name: name.trim() } });
    setSaved('Saved');
    window.setTimeout(() => setSaved(''), 2000);
  };
  return (
    <div className={card}>
      <p className={h}>Tournament entry account</p>
      <p className="text-[11px] text-slate-500">Students see this when they join a paid tournament. Use an account only for tournaments.</p>
      <div className="grid grid-cols-3 gap-2">
        <input value={bank} onChange={(e) => setBank(e.target.value)} className={input} placeholder="Bank" />
        <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" className={input} placeholder="Number" />
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Name" />
      </div>
      <button type="button" onClick={save} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
        {saved || 'Save account'}
      </button>
    </div>
  );
};

/** Admin > League Games & Contest: the league and its timeline, and the weekly reward contest */
export const AdminLeague: React.FC = () => {
  const [section, setSection] = useState<'league' | 'contest'>('league');
  const [settings, setSettings] = useState<any>({});
  useEffect(() => subscribeHubSettings(setSettings), []);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
        {([['league', 'League Games'], ['contest', 'Weekly Contest']] as ['league' | 'contest', string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`h-10 rounded-xl text-sm font-bold cursor-pointer ${section === id ? 'bg-white dark:bg-slate-950 text-[#0e9f55] shadow-sm' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {section === 'league' ? (
        <>
          <CreateLeague />
          <Timeline />
          <GamesOpenDate settings={settings} />
          <AdminGames section="league" />
          <Disputes />
          <AdminTournaments />
          <TourneyAccount />
          <Schools settings={settings} />
          <ResetPlayer />
        </>
      ) : (
        <AdminGames section="contest" />
      )}
    </div>
  );
};
