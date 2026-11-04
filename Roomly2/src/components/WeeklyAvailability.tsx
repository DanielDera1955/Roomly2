import React, { useEffect, useState } from 'react';
import { WEEKLY_BATCHES, timeLabel } from '../config';
import { getMyWeekly, getWeeklyRoster, saveWeekly, getRunners, getCurrentStaff } from '../api.js';

/**
 * "My week": the batches a runner works every week. Ticked batches are ON by themselves every week;
 * the runner only switches one OFF (for that day) when they can't make it.
 * The admin can open any runner's week from the Team tab.
 */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const batchText = (s: any) => `${timeLabel(s.startMin)} to ${timeLabel(s.endMin)}`;

function useRosterTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    return () => window.removeEventListener('roomly-batches', h);
  }, []);
}

const WeekEditor: React.FC<{ runner?: any; startOpen?: boolean }> = ({ runner, startOpen = true }) => {
  useRosterTick();
  const email = runner ? String(runner.email || runner.id || '').toLowerCase() : '';
  const saved = runner ? getWeeklyRoster()[email] || { days: {} } : getMyWeekly();
  const savedDays: Record<string, string[]> = saved.days || {};
  const [days, setDays] = useState<Record<string, string[]>>(savedDays);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(startOpen);
  const savedKey = JSON.stringify(savedDays);
  useEffect(() => setDays(JSON.parse(savedKey)), [savedKey]);
  const changed = JSON.stringify(days) !== savedKey;
  const count = Object.values(days).reduce((n, a) => n + (a?.length || 0), 0);

  const toggle = (wd: number, id: string) => {
    const cur = days[wd] || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setDays({ ...days, [wd]: next });
    setMsg('');
  };
  const save = async () => {
    if (!runner) {
      const st = getCurrentStaff();
      if (!st?.payAccount) {
        setMsg('Add your payment account first, under "Where students pay you".');
        return;
      }
    }
    setBusy(true);
    try {
      await saveWeekly(days, runner ? { ...runner, email } : undefined);
      setMsg('Saved. These batches are ON every week.');
    } catch (e) {
      setMsg('Could not save. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
          {runner ? runner.name || email : 'My week'} <span className="font-semibold text-slate-400">· {count} batches a week</span>
        </span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && (
        <>
          {ORDER.map((wd) => (
            <div key={wd} className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500">{DAYS[wd]}</p>
              <div className="flex flex-wrap gap-1.5">
                {(WEEKLY_BATCHES[wd] || []).map((s: any) => {
                  const on = (days[wd] || []).includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(wd, s.id)}
                      aria-pressed={on}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        on ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      {batchText(s)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!changed || busy}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${changed ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
            >
              {busy ? 'Saving...' : changed ? 'Save my week' : 'Saved'}
            </button>
            {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
          </div>
          {!runner && (
            <p className="text-[11px] text-slate-400 leading-snug">
              Tick only batches you can really do. Students pay you as soon as they order for them. If you can't make one, switch it OFF below
              for that day, as early as you can.
            </p>
          )}
        </>
      )}
    </div>
  );
};

/** Runner portal */
export const WeeklyAvailability: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4">
    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Inside batches: my week</p>
    <WeekEditor startOpen={Object.keys(getMyWeekly().days || {}).length === 0} />
  </div>
);

/** Admin > Team: every runner's week */
export const AdminWeeklyPanel: React.FC = () => {
  const [runners, setRunners] = useState<any[]>([]);
  useEffect(() => {
    getRunners().then((r: any[]) => setRunners(r || []));
  }, []);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Runners' weekly batches</p>
      {runners.length === 0 && <p className="text-xs text-slate-400">No runners yet.</p>}
      {runners.map((r) => (
        <div key={r.id} className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <WeekEditor runner={r} startOpen={false} />
        </div>
      ))}
      <p className="text-[10px] text-slate-400 leading-snug">Ticked batches are ON for that runner every week. They switch a single day OFF from their portal.</p>
    </div>
  );
};
