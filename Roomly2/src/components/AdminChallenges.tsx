import React, { useEffect, useMemo, useState } from 'react';
import { GAMES, gameLabel, playsGame } from '../hub.js';
import { matchCounts, proofOf, winnerOf, contestOf } from '../boardCore.js';
import {
  type Challenge,
  type ChallengeView,
  type TemplateKey,
  TEMPLATES,
  targetOf,
  challengeGameLabel,
  numbersSig,
  autoDescription,
  settingsLine,
  viewChallenge,
  subscribeChallenges,
  subscribeChallengeApps,
  saveChallenge,
  setChallengeStatus,
  removeChallenge,
  reviewApp,
  voidFromChallenge,
  unvoidFromChallenge,
  voidMatch,
  issueChallengeCredit,
  lagosDayStart,
} from '../challenges';
import { RichText } from './Challenges';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const input = 'w-full h-10 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white disabled:opacity-60';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50';
const lab = 'block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const when = (ms: number) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const toInput = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const fromInput = (s: string) => (s ? new Date(s).getTime() : 0);

type Form = Partial<Challenge> & { id?: string };

const blank = (game: string): Form => {
  const now = Date.now();
  const d = lagosDayStart(now) + 86400000;
  return { ...TEMPLATES.xofn.defaults, game, title: '', desc: '', startMs: d, endMs: d + 86400000 - 60000 };
};

export const AdminChallenges: React.FC<{ season: any; gamers: any[]; matches: any[]; phones: Map<string, string> }> = ({ season, gamers, matches, phones }) => {
  const [list, setList] = useState<Challenge[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [descTouched, setDescTouched] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState('');
  useEffect(() => subscribeChallenges(setList), []);
  useEffect(() => subscribeChallengeApps(setApps), []);
  const now = Date.now();
  const views = useMemo(() => list.map((c) => viewChallenge(c, apps, matches, gamers, now)), [list, apps, matches, gamers, Math.floor(now / 30000)]);

  const run = async (key: string, fn: () => Promise<any>, ok = '') => {
    setBusy(key);
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e: any) {
      setMsg(e?.message || 'Something went wrong.');
    }
    setBusy('');
  };

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const editing = form?.id ? list.find((c) => c.id === form.id) : null;
  const locked = Boolean(editing && apps.some((a) => a.challengeId === editing.id));

  const isPlay = form?.template === 'play';
  // Play template: Caritas players only, registered at any time. Other templates: registered before the start.
  const players = form?.game
    ? gamers.filter(
        (g) =>
          (form.game === 'all' ? (g.games || []).length > 0 : playsGame(g, form.game as string)) &&
          (isPlay ? (g.school || 'caritas') === 'caritas' : !g.createdAtMs || Number(g.createdAtMs) <= Number(form.startMs || now))
      ).length
    : 0;
  const needPlayers = (Number(form?.nOpp) || 0) + 1;
  const tooFew = Boolean((form?.diffOpp || isPlay) && players < needPlayers);
  const sigNow = form ? numbersSig(form) : '';
  const descStale = Boolean(form && form.desc && form.descSig && form.descSig !== sigNow && !descTouched);

  const applyTemplate = (t: TemplateKey) => set({ ...TEMPLATES[t].defaults, template: t });
  const wrap = (before: string, after = before) => {
    const el = document.getElementById('ch-desc') as HTMLTextAreaElement | null;
    if (!el || !form) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const text = String(form.desc || '');
    const sel = text.slice(s, e) || 'text';
    set({ desc: text.slice(0, s) + before + sel + after + text.slice(e) });
    setDescTouched(true);
  };
  const addList = () => {
    set({ desc: `${String(form?.desc || '').trimEnd()}\n- ` });
    setDescTouched(true);
  };
  const rewrite = () => {
    if (!form) return;
    set({ desc: autoDescription(form), descSig: sigNow });
    setDescTouched(true);
  };
  const save = () =>
    run(
      'save',
      async () => {
        if (!form) return;
        let f = { ...form };
        // The description follows the numbers until the admin writes their own
        if (!String(f.desc || '').trim()) f.desc = autoDescription(f);
        if (descTouched || !f.descSig || !editing) f.descSig = sigNow;
        f.seasonId = season?.id || '';
        await saveChallenge(f, form.id);
        setForm(null);
        setDescTouched(false);
      },
      'Saved.'
    );

  return (
    <div className="space-y-3">
      {msg && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{msg}</p>}

      {!form && (
        <button type="button" onClick={() => { setForm(blank(GAMES[0].id)); setDescTouched(false); }} className={`${btn} bg-[#0e9f55] text-white`}>
          New challenge
        </button>
      )}

      {form && (
        <div className={card}>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">{form.id ? 'Edit challenge' : 'New challenge'}</p>
          {!form.id && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TEMPLATES) as TemplateKey[]).map((t) => (
                <button key={t} type="button" onClick={() => applyTemplate(t)} className={`${btn} ${form.template === t ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  {TEMPLATES[t].label}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className={lab}>Title</label>
            <input className={input} value={form.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="Beat 3 of 5 Challenge" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lab}>Game</label>
              <select className={input} value={form.game} disabled={locked} onChange={(e) => set({ game: e.target.value })}>
                <option value="all">All games</option>
                {GAMES.map((g: { id: string; label: string }) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lab}>Prize (credit, ₦)</label>
              <input className={input} inputMode="numeric" value={form.prize ?? ''} onChange={(e) => set({ prize: Number(e.target.value.replace(/\D/g, '')) })} />
            </div>
            <div>
              <label className={lab}>{isPlay ? 'Different players to play (N)' : 'Opponents to play (N)'}</label>
              <input className={input} inputMode="numeric" disabled={locked} value={form.nOpp ?? ''} onChange={(e) => set({ nOpp: Number(e.target.value.replace(/\D/g, '')) })} />
            </div>
            {!isPlay && (
              <div>
                <label className={lab}>Wins required</label>
                <input className={input} inputMode="numeric" disabled={locked} value={form.winsReq ?? ''} onChange={(e) => set({ winsReq: Number(e.target.value.replace(/\D/g, '')) })} />
              </div>
            )}
            {!isPlay && (
              <div>
                <label className={lab}>Matches that count (0 = all)</label>
                <input className={input} inputMode="numeric" disabled={locked} value={form.matchesCounted ?? ''} onChange={(e) => set({ matchesCounted: Number(e.target.value.replace(/\D/g, '')) })} />
              </div>
            )}
            <div>
              <label className={lab}>Winners</label>
              <input className={input} inputMode="numeric" value={form.winners ?? ''} onChange={(e) => set({ winners: Number(e.target.value.replace(/\D/g, '')) })} />
            </div>
            <div>
              <label className={lab}>Start</label>
              <input type="datetime-local" className={input} value={toInput(Number(form.startMs))} onChange={(e) => set({ startMs: fromInput(e.target.value) })} />
            </div>
            <div>
              <label className={lab}>End</label>
              <input type="datetime-local" className={input} value={toInput(Number(form.endMs))} onChange={(e) => set({ endMs: fromInput(e.target.value) })} />
            </div>
            <div>
              <label className={lab}>Spot limit (0 = none)</label>
              <input className={input} inputMode="numeric" value={form.spots ?? ''} onChange={(e) => set({ spots: Number(e.target.value.replace(/\D/g, '')) })} />
            </div>
            <div>
              <label className={lab}>Who picks the day</label>
              <select className={input} value={form.dayMode} onChange={(e) => set({ dayMode: e.target.value as any })}>
                <option value="window">Play any time in the window</option>
                <option value="pick">Player picks a day in the window</option>
                <option value="fixed">I fix one day for everyone</option>
              </select>
            </div>
          </div>
          {form.dayMode === 'fixed' && (
            <div>
              <label className={lab}>The day for everyone</label>
              <input type="date" className={input} value={form.fixedDayMs ? toInput(Number(form.fixedDayMs)).slice(0, 10) : ''} onChange={(e) => set({ fixedDayMs: e.target.value ? new Date(`${e.target.value}T12:00`).getTime() : 0 })} />
            </div>
          )}
          {!isPlay && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" disabled={locked} checked={Boolean(form.diffOpp)} onChange={(e) => set({ diffOpp: e.target.checked })} className="h-4 w-4 accent-[#0e9f55]" />
              Different opponents required (a repeat opponent does not count)
            </label>
          )}
          {isPlay && <p className="text-[11px] text-slate-500 dark:text-slate-400">Every match counts, win or lose, once per opponent. Only Caritas players count. Opponents may register at any time, and late ones are flagged in the review list.</p>}
          {form.game === 'all' && <p className="text-[11px] text-slate-500 dark:text-slate-400">All games: this challenge shows in every game, matches in any game count, and each opponent counts once overall.</p>}
          {locked && <p className="text-[11px] text-amber-700 dark:text-amber-300">Players have applied, so game, opponents, wins, matches counted and different opponents are locked. You can still change the title, description, prize, winners, spots and times.</p>}
          {!isPlay && Number(form.winsReq) > Number(form.nOpp) && <p className="text-[11px] font-semibold text-rose-600">Wins required is more than the opponents to play.</p>}
          {tooFew && (
            <p className="text-[11px] font-semibold text-rose-600">
              {form.game === 'all' ? 'All games' : gameLabel(form.game as string)} has {players} registered {isPlay ? 'Caritas ' : ''}player{players === 1 ? '' : 's'}
              {isPlay ? '' : ' from before the start'}. This challenge needs at least {needPlayers} so a player can meet {form.nOpp} different opponents.
            </p>
          )}
          <div>
            <label className={lab}>Description</label>
            <div className="flex gap-1.5 mb-1.5">
              <button type="button" onClick={() => wrap('**')} className={`${btn} bg-slate-100 dark:bg-slate-800 font-black`}>
                Bold
              </button>
              <button type="button" onClick={addList} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
                List item
              </button>
              <button type="button" onClick={rewrite} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
                Rewrite from numbers
              </button>
            </div>
            <textarea
              id="ch-desc"
              value={form.desc || ''}
              onChange={(e) => {
                set({ desc: e.target.value });
                setDescTouched(true);
              }}
              rows={6}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              placeholder="Leave empty and it is written from the numbers when you save."
            />
            {descStale && <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Your description may no longer match the rules. Players also see a line built from the numbers under it.</p>}
            {form.desc ? (
              <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Preview</p>
                <RichText text={form.desc} />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy === 'save'} onClick={save} className={`${btn} bg-[#0e9f55] text-white`}>
              {busy === 'save' ? 'Saving...' : 'Save challenge'}
            </button>
            <button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {views.length === 0 && !form && <p className="text-xs text-slate-400">No challenges yet.</p>}
      {views.map((v) => (
        <ChallengeAdminCard
          key={v.challenge.id}
          v={v}
          apps={apps}
          matches={matches}
          gamers={gamers}
          phones={phones}
          open={openId === v.challenge.id}
          onToggle={() => setOpenId(openId === v.challenge.id ? '' : v.challenge.id)}
          busy={busy}
          run={run}
          onEdit={() => {
            setForm({ ...v.challenge });
            setDescTouched(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ))}
    </div>
  );
};

const ChallengeAdminCard: React.FC<{
  v: ChallengeView;
  apps: any[];
  matches: any[];
  gamers: any[];
  phones: Map<string, string>;
  open: boolean;
  onToggle: () => void;
  busy: string;
  run: (key: string, fn: () => Promise<any>, ok?: string) => Promise<void>;
  onEdit: () => void;
}> = ({ v, apps, matches, gamers, phones, open, onToggle, busy, run, onEdit }) => {
  const c = v.challenge;
  const regAt = new Map<string, number>(gamers.map((g: any) => [g.id, Number(g.createdAtMs || 0)]));
  const matchById = new Map<string, any>(matches.map((m: any) => [m.id, m]));
  const pending = v.finishers.slice(0, Math.max(1, c.winners));
  const waiting = v.entries.filter((e) => e.progress.state === 'waiting');
  const phase = { upcoming: 'Opens soon', running: 'Open', closed: 'Winner found, under review', ended: 'Ended', paused: 'Paused', cancelled: 'Cancelled', over: 'Time is up' }[v.phase];

  const entryBlock = (e: { app: any; progress: any }, role: string) => {
    const counted = new Set<string>(e.progress.rows.map((r: any) => r.id));
    const others = matches
      .filter(
        (m) =>
          (c.game === 'all' || m.game === c.game) &&
          matchCounts(m) &&
          contestOf(m) === 'league' &&
          (m.aUid === e.app.gid || m.bUid === e.app.gid) &&
          Number(m.loggedAtMs) >= e.progress.from &&
          Number(m.loggedAtMs) < e.progress.to &&
          !counted.has(m.id)
      )
      .sort((a, b) => Number(a.loggedAtMs) - Number(b.loggedAtMs));
    const voided: string[] = e.app.voided || [];
    return (
      <div key={e.app.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {e.app.name} <span className="text-[11px] font-semibold text-slate-500">{role}</span>
          </p>
          <span className="text-[11px] font-bold text-slate-500">
            {e.progress.wins}/{targetOf(c)} {c.template === 'play' ? 'players' : 'wins'}{e.progress.finishAtMs ? `, finished ${when(e.progress.finishAtMs)}` : ''}
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          Window {when(e.progress.from)} to {when(e.progress.to)}
          {e.progress.skipped ? `. ${e.progress.skipped} match${e.progress.skipped === 1 ? '' : 'es'} did not count (${c.template === 'play' ? 'repeat opponent, not a Caritas player, or over the limit' : 'repeat opponent, over the limit, or opponent registered after the start'}).` : ''}
        </p>
        {c.template === 'play' && e.progress.late > 0 && (
          <p className="text-[11px] font-black text-amber-700 dark:text-amber-300">
            Check: {e.progress.late} counted opponent{e.progress.late === 1 ? '' : 's'} registered after the challenge started.
          </p>
        )}
        {e.progress.rows.map((r: any, i: number) => {
          const m = matchById.get(r.id);
          const reg = regAt.get(r.oppId) || 0;
          const before = !reg || reg <= Number(c.startMs);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-700 dark:text-slate-200">
              <span className="font-bold">
                {i + 1}. {r.result} {r.score} vs {r.oppName}
              </span>
              <span className={r.recorded ? 'text-emerald-600' : 'text-amber-600'}>{r.status === 'confirmed' ? 'confirmed' : r.recorded ? 'auto-confirmed' : 'waiting'}</span>
              <span className={before ? 'text-slate-500' : c.template === 'play' ? 'px-1.5 rounded bg-amber-100 text-amber-800 font-black' : 'text-rose-600'}>{before ? 'registered in time' : c.template === 'play' ? 'LATE REGISTERED' : 'registered late'}</span>
              {m && proofOf(m) && (
                <a href={proofOf(m)} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
                  screenshot
                </a>
              )}
              <button type="button" onClick={() => run(`v${r.id}`, () => voidFromChallenge(e.app, r.id), 'Removed from this challenge.')} className="text-rose-600 font-bold cursor-pointer">
                Remove from challenge
              </button>
              <button
                type="button"
                onClick={() => window.confirm('Void this match everywhere? Its points leave the league and the weekly table too.') && run(`vm${r.id}`, () => voidMatch(r.id), 'Match voided.')}
                className="text-rose-600 font-bold cursor-pointer"
              >
                Void match
              </button>
            </div>
          );
        })}
        {voided.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Removed from this challenge: {voided.length}{' '}
            {voided.map((id) => (
              <button key={id} type="button" onClick={() => run(`u${id}`, () => unvoidFromChallenge(e.app, id), 'Put back.')} className="ml-1 text-[#0e9f55] font-bold cursor-pointer">
                put back {id.slice(0, 4)}
              </button>
            ))}
          </p>
        )}
        {others.length > 0 && (
          <div className="text-[11px] text-slate-500">
            <p className="font-bold">Other league matches of theirs in this window (check for a hidden loss):</p>
            {others.map((m) => {
              const w = winnerOf(m);
              const opp = m.aUid === e.app.gid ? m.bName : m.aName;
              return (
                <p key={m.id}>
                  {!w ? 'D' : w === e.app.gid ? 'W' : 'L'} {m.aUid === e.app.gid ? `${m.scoreA}-${m.scoreB}` : `${m.scoreB}-${m.scoreA}`} vs {opp}, {when(Number(m.loggedAtMs))}
                </p>
              );
            })}
          </div>
        )}
        {e.app.paidAtMs ? <p className="text-[11px] font-bold text-emerald-600">Credit issued {when(e.app.paidAtMs)}.</p> : null}
        {role.startsWith('winner') && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {e.app.review !== 'approved' && (
              <button type="button" disabled={busy.startsWith('rv')} onClick={() => run(`rv${e.app.id}`, () => reviewApp(v, e.app, 'approved'), 'Approved.')} className={`${btn} bg-[#0e9f55] text-white`}>
                Approve
              </button>
            )}
            {e.app.review !== 'rejected' && (
              <button type="button" disabled={busy.startsWith('rv')} onClick={() => window.confirm('Reject this player? The challenge moves on to the next finisher.') && run(`rv${e.app.id}`, () => reviewApp(v, e.app, 'rejected'), 'Rejected.')} className={`${btn} bg-rose-600 text-white`}>
                Reject
              </button>
            )}
            {e.app.review === 'approved' && !e.app.paidAtMs && (
              <button
                type="button"
                disabled={busy === `pay${e.app.id}`}
                onClick={() => window.confirm(`Issue ${naira(c.prize)} credit to ${e.app.name}? It opens now and lasts 48 hours.`) && run(`pay${e.app.id}`, () => issueChallengeCredit(c, e.app, phones.get(e.app.gid) || ''), 'Credit issued.')}
                className={`${btn} bg-amber-500 text-white`}
              >
                Issue {naira(c.prize)} credit
              </button>
            )}
            {e.app.review === 'approved' && (
              <button type="button" onClick={() => run(`rv${e.app.id}`, () => reviewApp(v, e.app, ''), 'Approval taken back.')} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
                Take back approval
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white">{c.title}</p>
          <p className="text-[11px] text-slate-500">
            {challengeGameLabel(c.game)} · {phase} · {v.entries.length} applied
          </p>
          <p className="text-[11px] text-slate-500">{settingsLine(c)}</p>
          <p className="text-[11px] text-slate-500">
            {when(c.startMs)} to {when(c.endMs)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onEdit} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
          Edit
        </button>
        {c.status === 'on' && (
          <button type="button" onClick={() => window.confirm('Pause this challenge? Players cannot apply while it is paused. League points stay.') && run('st', () => setChallengeStatus(c.id, 'paused'))} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
            Pause
          </button>
        )}
        {c.status === 'paused' && (
          <button type="button" onClick={() => run('st', () => setChallengeStatus(c.id, 'on'))} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
            Resume
          </button>
        )}
        {c.status !== 'cancelled' && c.status !== 'ended' && (
          <button type="button" onClick={() => window.confirm('Cancel this challenge? Applications reopen with no penalty and league points stay.') && run('st', () => setChallengeStatus(c.id, 'cancelled'))} className={`${btn} bg-slate-100 dark:bg-slate-800 text-rose-600`}>
            Cancel
          </button>
        )}
        <button type="button" onClick={() => window.confirm('Delete this challenge and its applications for good?') && run('rm', () => removeChallenge(c, apps))} className={`${btn} text-rose-600`}>
          Delete
        </button>
        <button type="button" onClick={onToggle} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
          {open ? 'Hide players' : `Players and review (${v.entries.length})`}
        </button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-600">Pending review</p>
          {pending.map((e, i) => entryBlock(e, `winner ${i + 1}${e.app.review === 'approved' ? ' (approved)' : ''}`))}
        </div>
      )}
      {waiting.length > 0 && <p className="text-[11px] text-slate-500">Reached the target, waiting for confirmations: {waiting.map((e) => e.app.name).join(', ')}</p>}

      {open && (
        <div className="space-y-2">
          {v.entries.length === 0 && <p className="text-xs text-slate-400">Nobody has applied yet.</p>}
          {v.entries
            .filter((e) => !pending.some((p) => p.app.id === e.app.id))
            .map((e) => entryBlock(e, `(${e.progress.state}${e.app.review === 'rejected' ? ', rejected' : ''})`))}
        </div>
      )}
    </div>
  );
};
