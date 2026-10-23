import React, { useEffect, useState } from 'react';
import { slotsForDay, timeLabel, SwitchSide, BatchOption } from '../config';
import {
  getInsideSwitches,
  getMyOperatorStatus,
  getCurrentStaff,
  getAllOperatorStatus,
  setInsideSwitch,
  setOperatorSwitch,
  setOperatorAdminOff,
  switchIsLive,
  switchStartDate,
} from '../api.js';

const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fromHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

function useBatchTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', refresh);
    const id = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('roomly-batches', refresh);
      window.clearInterval(id);
    };
  }, []);
}

const acceptLine = (side: SwitchSide, o: BatchOption, time: string) =>
  side === 'food'
    ? `Still accepting food orders, and will start sending by ${time}`
    : side === 'store'
    ? `Still accepting ${o.name.replace(' store batch', '').toLowerCase()} batch, and will start sending by ${time}`
    : `Still accepting the ${o.window} batch, and will start sending by ${time}`;

const SwitchRow: React.FC<{ side: SwitchSide; o: BatchOption; sw: any; adminOff?: boolean }> = ({ side, o, sw, adminOff }) => {
  const now = new Date();
  const live = switchIsLive(sw, side === 'inside' ? 'inside' : 'outside', now);
  const startMin = sw && Number.isFinite(sw.start) ? sw.start : o.startMin;
  // Only a live batch can be "sending"; an Off batch can still be given a later time and switched on
  const started = live && switchStartDate(o, sw).getTime() <= now.getTime();
  const [time, setTime] = useState(toHHMM(startMin));
  const [note, setNote] = useState(sw?.note || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => setTime(toHHMM(startMin)), [startMin]);
  useEffect(() => setNote(sw?.note || ''), [sw?.note]);

  const save = async (patch: Record<string, any>) => {
    setBusy(true);
    try {
      if (side === 'inside') await setInsideSwitch(o.key, patch);
      else await setOperatorSwitch(o.key, patch);
    } catch (e) {
      window.alert('Could not save. Check your connection and try again.');
    }
    setBusy(false);
  };

  const startNum = fromHHMM(time);
  const turnOn = () => {
    // Students must always see the runner's or operator's own account, so it has to be saved first
    const staff = getCurrentStaff();
    if (staff && staff.role !== 'admin' && !staff.payAccount) {
      window.alert('Add your payment account first, under "Where students pay you", then switch on.');
      return;
    }
    const start = Number.isFinite(startNum) ? startNum : o.startMin;
    if (switchStartDate(o, { start }).getTime() <= Date.now()) {
      window.alert('That start time has already passed. Set a later "will start sending by" time, then switch on.');
      return;
    }
    save({ on: true, start, note: note.trim().slice(0, 120) });
  };
  const turnOff = () => save({ on: false, note: note.trim().slice(0, 120) });

  return (
    <div
      className={`p-3 rounded-2xl text-xs space-y-2 border-2 ${
        started
          ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
          : live
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-[#0e9f55]'
          : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-bold text-slate-900 dark:text-white">{side === 'food' ? 'Food batch' : o.window}</span>
          <span className={`block text-[11px] font-bold ${started ? 'text-slate-500' : live ? 'text-[#0e9f55]' : 'text-rose-600 dark:text-rose-400'}`}>
            {started
              ? 'Sending now. New orders go to the next batch.'
              : live
              ? 'ON: you are taking orders for this batch'
              : 'OFF: students can still order, but they are told it is not opened yet'}
          </span>
        </div>
        {/* Clear two-position switch: the highlighted side is the current state */}
        <div className="shrink-0 grid grid-cols-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
          <button
            type="button"
            disabled={busy || started || !live}
            onClick={turnOff}
            aria-pressed={!live}
            className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
              !live ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
            }`}
          >
            OFF
          </button>
          <button
            type="button"
            disabled={busy || started || live || adminOff}
            onClick={turnOn}
            aria-pressed={live}
            className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
              live ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
            }`}
          >
            ON
          </button>
        </div>
      </div>

      {!started && (
        <>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Will start sending by</span>
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                const m = fromHHMM(e.target.value);
                if (live && Number.isFinite(m)) save({ start: m });
              }}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
            />
          </label>
          <input
            type="text"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((sw?.note || '') !== note.trim()) save({ note: note.trim() });
            }}
            placeholder="Optional note, e.g. Back at 5pm"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
          {live && (
            <p className="text-[11px] text-[#0e9f55] font-semibold">{acceptLine(side, o, timeLabel(Number.isFinite(startNum) ? startNum : startMin))}</p>
          )}
        </>
      )}
    </div>
  );
};

interface BatchSwitchesProps {
  /** inside = runners and admin; store / food = the signed-in operator's own switches */
  side?: SwitchSide;
}

/** Availability switches for today and tomorrow. Each batch: on/off, a start time, and an optional note. */
export const BatchSwitches: React.FC<BatchSwitchesProps> = ({ side = 'inside' }) => {
  useBatchTick();
  const [open, setOpen] = useState(true);
  const now = new Date();
  const mine = side === 'inside' ? null : getMyOperatorStatus();
  const switches: Record<string, any> = side === 'inside' ? getInsideSwitches() : mine?.slots || {};
  const days = [slotsForDay(side, now, 0), slotsForDay(side, now, 1)];
  const cutoff = side === 'inside' ? '10pm' : '8pm';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 cursor-pointer"
      >
        <span>{side === 'inside' ? 'Inside batches: my availability' : side === 'food' ? 'Food orders: my availability' : 'Store batches: my availability'}</span>
        <span className="text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {mine?.adminOff && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-semibold">
              The admin has switched you off. Students cannot order from you until the admin allows you again.
            </div>
          )}
          {days.map((slots, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{i === 0 ? 'Today' : 'Tomorrow'}</p>
              {slots
                .filter((o) => i > 0 || switchStartDate(o, switches[o.key]).getTime() > now.getTime() - 3600000)
                .map((o) => (
                  <SwitchRow key={o.key} side={side} o={o} sw={switches[o.key]} adminOff={mine?.adminOff} />
                ))}
            </div>
          ))}
          <p className="text-[11px] text-slate-400 leading-snug">
            Tap ON when you are ready to take a batch, and set the time you will start sending. Students can order even while it is OFF; they
            are told the batch is not opened yet. Switches turn OFF by themselves after {cutoff}; switch back ON if you are still working.
          </p>
        </div>
      )}
    </div>
  );
};

/** Admin: store or food operators (filtered by view) with a clear OFF / ON override */
export const OperatorOverridePanel: React.FC<{ kind?: 'store' | 'food' }> = ({ kind }) => {
  useBatchTick();
  const [busy, setBusy] = useState('');
  const ops = getAllOperatorStatus()
    .filter((op: any) => !kind || op.kind === kind)
    .sort((a: any, b: any) => String(a.kind).localeCompare(String(b.kind)));
  const now = new Date();
  const title = kind === 'food' ? 'Food operators' : kind === 'store' ? 'Store operators' : 'Store and food operators';

  const liveCount = (op: any) =>
    Object.entries(op.slots || {}).filter(([key, sw]: [string, any]) => {
      const o = slotsForDay(op.kind, now, 0).concat(slotsForDay(op.kind, now, 1)).find((x) => x.key === key);
      return o && switchIsLive(sw, 'outside', now) && switchStartDate(o, sw).getTime() > now.getTime();
    }).length;

  const set = async (op: any, off: boolean) => {
    if (Boolean(op.adminOff) === off) return;
    setBusy(op.id);
    try {
      await setOperatorAdminOff(op.id, off);
    } catch (e) {
      window.alert('Could not update this operator.');
    }
    setBusy('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</p>
      {ops.length === 0 && (
        <p className="text-xs text-slate-400">Operators appear here after they sign in to their portal once.</p>
      )}
      {ops.map((op: any) => {
        const n = liveCount(op);
        const off = Boolean(op.adminOff);
        return (
          <div
            key={op.id}
            className={`flex items-center justify-between gap-2 p-3 rounded-2xl text-xs border-2 ${
              off ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50' : 'bg-emerald-50 dark:bg-emerald-950/30 border-[#0e9f55]'
            }`}
          >
            <div className="min-w-0">
              <span className="font-bold text-slate-900 dark:text-white">
                {op.name || 'Operator'}
                {!kind && <span className="font-normal text-slate-500"> · {op.kind === 'food' ? 'Food' : 'Store'}</span>}
              </span>
              <span className={`block text-[11px] font-bold ${off ? 'text-rose-600 dark:text-rose-400' : 'text-[#0e9f55]'}`}>
                {off
                  ? 'OFF: hidden from students until you switch ON'
                  : n > 0
                  ? `ON: taking orders (${n} batch${n === 1 ? '' : 'es'} on)`
                  : "ON, but they haven't opened a batch"}
              </span>
            </div>
            <div className="shrink-0 grid grid-cols-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
              <button
                type="button"
                disabled={busy === op.id || off}
                onClick={() => set(op, true)}
                aria-pressed={off}
                className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
                  off ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
                }`}
              >
                OFF
              </button>
              <button
                type="button"
                disabled={busy === op.id || !off}
                onClick={() => set(op, false)}
                aria-pressed={!off}
                className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
                  !off ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
                }`}
              >
                ON
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400 leading-snug">
        Your OFF overrides the operator. They cannot take orders until you switch them back ON.
      </p>
    </div>
  );
};
