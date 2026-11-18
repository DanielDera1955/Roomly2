import React, { useEffect, useMemo, useState } from 'react';
import { History, X, Crown, ArrowLeft, Loader2 } from 'lucide-react';
import { GAMES, gameLabel, isScored } from '../hub.js';
import { subscribeArchives, loadArchiveTable } from '../season';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const yearOf = (s: any) => String(s.session || '').trim() || String(new Date(Number(s.startMs)).getFullYear());

/** Button on the Games home that opens the history of finished seasons */
export const HistoryButton: React.FC<{ meId?: string }> = ({ meId }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${card} w-full p-3.5 flex items-center gap-3 text-left cursor-pointer hover:border-[#0e9f55]/50`}>
        <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
          <History className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-slate-900 dark:text-white">History</span>
          <span className="block text-[11px] text-slate-500">Past seasons, champions and final tables</span>
        </span>
      </button>
      {open && <HistorySheet meId={meId} onClose={() => setOpen(false)} />}
    </>
  );
};

const HistorySheet: React.FC<{ meId?: string; onClose: () => void }> = ({ meId, onClose }) => {
  const [list, setList] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<any | null>(null);
  useEffect(() => subscribeArchives((l) => setList(l)), []);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    (list || []).forEach((s) => m.set(yearOf(s), [...(m.get(yearOf(s)) || []), s]));
    return [...m.entries()];
  }, [list]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            {picked && (
              <button type="button" onClick={() => setPicked(null)} aria-label="Back" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="text-base font-black text-slate-900 dark:text-white truncate">{picked ? `${picked.name} ${yearOf(picked)}` : 'History'}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {list === null ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : picked ? (
            <SeasonView season={picked} meId={meId} />
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-500">No finished seasons yet. When a season ends, its champions and final tables are kept here.</p>
          ) : (
            groups.map(([year, seasons]) => (
              <div key={year} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">{year}</p>
                {seasons.map((s) => (
                  <button key={s.id} type="button" onClick={() => setPicked(s)} className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-left cursor-pointer">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {day(Number(s.startMs))} to {day(Number(s.endMs))}
                    </p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const SeasonView: React.FC<{ season: any; meId?: string }> = ({ season, meId }) => {
  const [game, setGame] = useState<string>(GAMES[0].id);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(null);
    loadArchiveTable(season.id, game)
      .then(setRows)
      .catch(() => setRows([]));
  }, [season.id, game]);
  const champs = Object.entries(season.champions || {}) as [string, any][];
  const weeks = (season.weeks || []).filter((w: any) => w.game === game);
  const scored = isScored(game);
  return (
    <div className="space-y-4">
      {champs.length > 0 && (
        <div className={`${card} p-3.5 space-y-1.5`}>
          <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-500" /> Champions
          </p>
          {champs.map(([g, c]) => (
            <p key={g} className="text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold">{gameLabel(g)}:</span> {c.name} ({c.pts} pts{c.origin && c.origin !== 'Caritas' ? `, ${c.origin}` : ''})
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {GAMES.map((g: { id: string; label: string }) => (
          <button key={g.id} type="button" onClick={() => setGame(g.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${game === g.id ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div>
        <p className="text-sm font-black text-slate-900 dark:text-white mb-1">Final table: {gameLabel(game)}</p>
        {rows === null ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400">No players on this table.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 py-2 px-1 text-xs ${r.id === meId ? 'bg-emerald-50 dark:bg-emerald-950/40 rounded-lg' : ''}`}>
                <span className="w-6 text-center font-bold text-slate-500">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-200">{r.name}</span>
                <span className="text-slate-400 tabular-nums">
                  {scored ? `${r.w}W ${r.d}D ${r.l}L` : `${r.w}W ${r.l}L`}
                </span>
                <span className="w-8 text-right font-black text-[#0e9f55] tabular-nums">{r.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-black text-slate-900 dark:text-white mb-1">Weekly reward winners: {gameLabel(game)}</p>
        {weeks.length === 0 ? (
          <p className="text-xs text-slate-400">No reward week was played for this game.</p>
        ) : (
          <div className="space-y-2">
            {weeks.map((w: any) => (
              <div key={`${w.game}${w.startMs}`} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-0.5">
                <p className="text-[11px] font-bold text-slate-500">
                  {day(Number(w.startMs))} to {day(Number(w.endMs) - 1)} · {naira(Number(w.creditValue))} credit
                </p>
                {(w.results || []).map((r: any) => (
                  <p key={r.gid} className="text-xs text-slate-700 dark:text-slate-300">
                    #{r.rank} {r.name}, {r.pts} pts{r.rewarded ? '' : ' (not rewarded)'}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
