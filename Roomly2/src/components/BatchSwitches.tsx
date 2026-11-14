import React, { useEffect, useState } from 'react';
import { slotsForDay, timeLabel, SwitchSide, BatchOption, OUTSIDE_DAYS_AHEAD, longDayLabel, weekdayName } from '../config';
import {
  outsideDayOn,
  opDaySwitch,
  setMyOffDays,
  getInsideSwitches,
  getMyInsideSwitches,
  getMyOperatorStatus,
  getCurrentStaff,
  getAllOperatorStatus,
  setInsideSwitch,
  setOperatorSwitch,
  setOperatorAdminOff,
  setOperatorFoodBatch,
  foodBatchOf,
  switchIsLive,
  switchStartDate,
  batchOpen,
  batchCloseDate,
  getMyHiddenReason,
  operatorAccepting,
  operatorLateOn,
  setOperatorAcceptingByAdmin,
  setOperatorLateByAdmin,
} from '../api.js';

const ymdNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
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

const SwitchRow: React.FC<{ side: SwitchSide; o: BatchOption; sw: any; adminOff?: boolean; hiddenNote?: string; readOnly?: boolean }> = ({ side, o, sw, adminOff, hiddenNote, readOnly }) => {
  const now = new Date();
  const live = switchIsLive(sw, side === 'inside' ? 'inside' : 'outside', now);
  const startMin = sw && Number.isFinite(sw.start) ? sw.start : o.startMin;
  // Only a live batch can be "sending"; an Off batch can still be given a later time and switched on
  // Past the batch time but still ON: late orders keep joining this batch until it is switched OFF
  // Inside: a batch closes to new orders at its start time (they join the next batch)
  const started = side === 'inside' && switchStartDate(o, sw).getTime() <= now.getTime();
  const pastTime = live && switchStartDate(o, sw).getTime() <= now.getTime();
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
    if (!staff || staff.role === 'admin') return; // only runners and operators switch batches
    if (!staff.payAccount) {
      window.alert('Add your payment account first, under "Where students pay you", then switch on.');
      return;
    }
    const start = Number.isFinite(startNum) ? startNum : o.startMin;
    if (side === 'inside' ? Date.now() >= switchStartDate(o, { ...(sw || {}), start }).getTime() : Date.now() >= batchCloseDate(o, side).getTime()) {
      window.alert(side === 'inside' ? 'This batch has already started. New orders go to the next batch.' : 'This batch is over for today. Switch on the next batch instead.');
      return;
    }
    // A batch in the runner's week was only skipped: switching it back on needs no promise screen
    if (side === 'inside' && sw?.skipped) {
      save({ on: true });
      return;
    }
    // Runners: switching ON is a promise to students, who pay straight into the runner's account
    if (
      side === 'inside' &&
      !window.confirm(
        `Confirm you'll be active for the ${o.window} batch (${o.date === ymdNow() ? 'today' : 'tomorrow'})?\n\n` +
          "Only confirm if you're sure. Make sure your phone is charged and you won't be in a lecture, asleep or busy at batch time.\n\n" +
          'Students pay into your account once you confirm. If anything changes, switch this batch OFF right away so nobody pays you and waits.' +
          (o.date !== ymdNow() ? '\n\nThis is for tomorrow: open your runner portal tomorrow, early in the day, to show you are active.' : '')
      )
    )
      return;
    save({ on: true, start, note: note.trim().slice(0, 120) });
  };
  const turnOff = () => {
    // Switching OFF only stops new orders. Orders students already paid for are still the runner's
    if (
      side === 'inside' &&
      !window.confirm(
        `Switch OFF the ${o.window} batch${sw?.auto ? ` (${o.date === ymdNow() ? 'today' : 'tomorrow'} only; it stays in your week)` : ''}?\n\nNew orders stop. Any order a student has already paid you for is still yours: deliver it, or if you really can't, hand it to another runner or refund the student.`
      )
    )
      return;
    save({ on: false, note: note.trim().slice(0, 120) });
  };

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
          <span className={`block text-[11px] font-bold ${started ? 'text-slate-500' : live && hiddenNote ? 'text-rose-600 dark:text-rose-400' : live ? 'text-[#0e9f55]' : 'text-rose-600 dark:text-rose-400'}`}>
            {started
              ? 'Closed: this batch has started. New orders go to the next batch.'
              : readOnly
              ? live
                ? `ON${sw?.by ? `: ${sw.by} is taking this batch` : ''}${pastTime ? ' (past the batch time, still taking late orders)' : ''}`
                : 'OFF: no runner has confirmed this batch'
              : live && hiddenNote
              ? hiddenNote
              : live
              ? pastTime
                ? 'ON: past the batch time, still taking late orders. Tap OFF when you stop.'
                : side === 'inside' && sw?.auto
                ? "ON: this batch is in your week. Tap OFF if you can't make it"
                : side === 'inside'
                ? 'ON: you confirmed this batch. Students can order and pay you'
                : 'ON: you are taking orders for this batch'
              : side === 'inside' && sw?.skipped
              ? "OFF for this day only. It's still in your week"
              : side === 'inside'
              ? "OFF: students are told no runner has confirmed this batch yet"
              : 'OFF: students can still order, but they are told it is not opened yet'}
          </span>
        </div>
        {/* Clear two-position switch: the highlighted side is the current state (hidden for the admin) */}
        {readOnly ? null : (
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
        )}
      </div>

      {!started && !readOnly && (
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

/** Inside runners: per-batch switches. Store and food operators: one switch per day (today, tomorrow, the day after). */
export const BatchSwitches: React.FC<BatchSwitchesProps> = ({ side = 'inside' }) =>
  side === 'store' || side === 'food' ? <OutsideDaySwitches side={side} /> : <InsideBatchSwitches side={side} />;

/**
 * Outside operators: is each of the next three days on or off. Every day starts ON and keeps what the operator set.
 * OFF on a day: students see "fully booked" and their order goes to the operator's next day that is ON.
 * All three OFF: students can't see this operator at checkout.
 */
const OutsideDaySwitches: React.FC<{ side: 'store' | 'food' }> = ({ side }) => {
  useBatchTick();
  const [busy, setBusy] = useState('');
  const now = new Date();
  const staff = getCurrentStaff();
  const mine = getMyOperatorStatus();
  // A food vendor switches the days of her own batch (lunch or dinner)
  const myBatch = side === 'food' ? foodBatchOf(mine) : '';
  const days = Array.from({ length: OUTSIDE_DAYS_AHEAD }, (_, d) =>
    slotsForDay(side, now, d).find((x) => side !== 'food' || x.id === myBatch)
  ).filter(Boolean) as BatchOption[];
  const cutText = side === 'store' ? '5:00pm' : myBatch === 'midday' ? '12:30pm' : '6:00pm';
  const gateText = myBatch === 'midday' ? '1:30pm' : '7:00pm';
  const todayClosed = days[0] ? now.getTime() >= batchCloseDate(days[0], side).getTime() : false;
  const hidden = getMyHiddenReason(now);
  const locked = Boolean(mine?.adminOff) || hidden?.reason === 'admin';
  const noAccount = !staff?.payAccount;
  const allOff = days.filter((_, i) => !(i === 0 && todayClosed)).every((o) => !outsideDayOn(opDaySwitch(mine, o)));
  const offDays: number[] = mine?.offDays || [];
  const toggleOffDay = async (d: number) => {
    setBusy(`wd${d}`);
    try {
      await setMyOffDays(offDays.includes(d) ? offDays.filter((x) => x !== d) : [...offDays, d]);
    } catch (e) {
      window.alert('Could not save. Check your connection and try again.');
    }
    setBusy('');
  };
  const [open, setOpen] = useState(true);

  const set = async (o: BatchOption, on: boolean) => {
    if (on && noAccount) {
      window.alert('Add your payment account first, under "Where students pay you", then switch on.');
      return;
    }
    setBusy(o.key);
    try {
      await setOperatorSwitch(o.key, { on });
    } catch (e) {
      window.alert('Could not save. Check your connection and try again.');
    }
    setBusy('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 cursor-pointer"
      >
        <span>My active and inactive days</span>
        <span className="text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {(hidden || noAccount) && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-semibold leading-snug">
              {hidden
                ? `${hidden.reason === 'overdue' ? 'Students cannot see you right now. ' : ''}${hidden.text}`
                : 'Students cannot see you until you add your payment account, under "Where students pay you".'}
            </div>
          )}
          {allOff && !hidden && !noAccount && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 font-semibold leading-snug">
              All three days are OFF, so students cannot see you. Switch a day ON when you can deliver again.
            </div>
          )}
          {days.map((o, i) => {
            const daySw = opDaySwitch(mine, o);
            const on = outsideDayOn(daySw);
            const isDayOff = Boolean(daySw?.dayOff);
            const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : longDayLabel(o.date).split(' ')[0];
            const closed = i === 0 && todayClosed;
            return (
              <div
                key={o.key}
                className={`p-3 rounded-2xl text-xs border-2 flex items-center justify-between gap-2 ${
                  closed
                    ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    : on
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-[#0e9f55]'
                    : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                }`}
              >
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {name} <span className="font-normal text-slate-500">· {longDayLabel(o.date)}</span>
                  </span>
                  <span className={`block text-[11px] font-bold ${closed ? 'text-slate-500' : on ? 'text-[#0e9f55]' : 'text-rose-600 dark:text-rose-400'}`}>
                    {closed
                      ? `Today's orders closed at ${cutText}. New orders are for your next day that is ON.`
                      : on
                      ? 'ON: students can order for this day'
                      : isDayOff
                      ? "Your day off. Students' orders go to your next working day. Switch ON to work this day."
                      : 'OFF: students see you are fully booked, and their order goes to your next day that is ON'}
                  </span>
                </div>
                {!closed && (
                  <div className="shrink-0 grid grid-cols-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
                    <button
                      type="button"
                      disabled={busy === o.key || !on}
                      onClick={() => set(o, false)}
                      aria-pressed={!on}
                      className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
                        !on ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
                      }`}
                    >
                      OFF
                    </button>
                    <button
                      type="button"
                      disabled={busy === o.key || on || locked}
                      onClick={() => set(o, true)}
                      aria-pressed={on}
                      className={`px-3 py-1.5 font-black text-xs cursor-pointer disabled:cursor-default ${
                        on ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 text-slate-400'
                      }`}
                    >
                      ON
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-2 space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Days I don't work (every week)</p>
            <div className="grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const off = offDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={busy === `wd${d}`}
                    onClick={() => toggleOffDay(d)}
                    aria-pressed={off}
                    className={`h-9 rounded-lg text-[11px] font-bold cursor-pointer ${
                      off ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {weekdayName(d).slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {offDays.length
                ? `You don't work on ${offDays.map((d) => weekdayName(d) + 's').join(', ')}. Students see this and their orders go to your next working day.`
                : 'Tap a day you never work (for example Sunday). It stays off every week.'}
            </p>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Every day starts ON. Switch a day OFF only when you can't deliver that day, for example when you are done early. Students can
            still order: their order goes to your next day that is ON.
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
            {side === 'food' ? `You cook for the ${myBatch === 'midday' ? 'lunch' : 'dinner'} batch. ` : ''}Students order before {cutText} to get it the same day. Send by {cutText} so it reaches the school gate before {gateText}. If you can't make it,
            open the order and tap "Move to next available day".
            {side === 'food' &&
              (operatorLateOn(mine)
                ? ` Late orders: until ${myBatch === 'midday' ? '2:30pm' : '7:00pm'}, sent together so they reach the gate before ${myBatch === 'midday' ? '3:30pm' : '8:00pm'}.`
                : ' Roomly has switched late orders off for you, so every order you get is for the normal batch.')}
          </p>
        </div>
      )}
    </div>
  );
};

/** Inside runners: switches for today and tomorrow. Each batch: on/off, a start time, and an optional note. */
const InsideBatchSwitches: React.FC<BatchSwitchesProps> = ({ side = 'inside' }) => {
  useBatchTick();
  const [open, setOpen] = useState(true);
  const now = new Date();
  const mine = side === 'inside' ? null : getMyOperatorStatus();
  // The admin sees who takes each batch; a runner sees their own batches (their week, skips, anything switched on)
  const switches: Record<string, any> = side === 'inside' ? (getCurrentStaff()?.role === 'admin' ? getInsideSwitches() : getMyInsideSwitches()) : mine?.slots || {};
  const days = [slotsForDay(side, now, 0), slotsForDay(side, now, 1)];
  const cutoff = side === 'inside' ? '10pm' : '6pm';
  // The admin only watches: runners and operators switch their own batches
  const readOnly = getCurrentStaff()?.role === 'admin';
  // Switched off by the admin, or an overdue settlement: students can't see this person even with switches ON
  const hidden = readOnly ? null : getMyHiddenReason(now);
  const locked = Boolean(mine?.adminOff) || hidden?.reason === 'admin';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 cursor-pointer"
      >
        <span>
          {readOnly
            ? 'Inside batches: who is taking them'
            : side === 'inside'
            ? 'Inside batches: my availability'
            : side === 'food'
            ? 'Food orders: my availability'
            : 'Store batches: my availability'}
        </span>
        <span className="text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {hidden && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-semibold leading-snug">
              {hidden.reason === 'overdue' ? 'Students cannot see you right now. ' : ''}
              {hidden.text}
            </div>
          )}
          {days.map((slots, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{i === 0 ? 'Today' : 'Tomorrow'}</p>
              {slots
                .filter((o) =>
                  side === 'inside'
                    ? i > 0 || now.getTime() < new Date(o.date + 'T00:00:00').getTime() + o.endMin * 60000
                    : i > 0 || now.getTime() < batchCloseDate(o, side).getTime() || switchIsLive(switches[o.key], 'outside', now)
                )
                .map((o) => (
                  <SwitchRow key={o.key} side={side} o={o} sw={switches[o.key]} adminOff={locked} hiddenNote={hidden ? 'ON, but students cannot see you (see the red note above)' : ''} readOnly={readOnly} />
                ))}
            </div>
          ))}
          {readOnly ? (
            <p className="text-[11px] text-slate-400 leading-snug">
              View only. Runners switch their own batches in the runner portal, so students always pay the runner who is taking the batch.
            </p>
          ) : (
          <p className="text-[11px] text-slate-400 leading-snug">
            {side === 'inside'
              ? `Batches in "My week" are ON by themselves every week. Tap OFF for a day you can't make it. The batch starts at 8:30pm and takes orders until 8:50pm. Every order must be in the student's room before 9:30pm.`
              : `Tap ON when you are ready to take a batch. After the batch time, leave it ON while you still take late orders, and tap OFF when you stop. Students then see the next batch. Switches turn OFF by themselves after ${cutoff}.`}
          </p>
          )}
          {side !== 'inside' && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              The school does not want outside parcels at the gate after 6pm. Outside orders stop at 6pm by default. Anything that reaches the gate
              after 6pm may be turned back by the school, and that is at your own risk.
            </p>
          )}
          {side !== 'inside' && now.getHours() * 60 + now.getMinutes() >= 17 * 60 + 30 && (
            <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg p-2 leading-snug">
              It is almost 6pm. Only send what will reach the gate before 6pm. Late parcels can be refused at the gate and Roomly will not refund them.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/** A small labelled No / Yes switch used on each operator card */
const YesNo: React.FC<{ label: string; yes: boolean; busy: boolean; onChange: (on: boolean) => void }> = ({ label, yes, busy, onChange }) => (
  <span className="mt-1.5 flex items-center gap-2">
    <span className="text-[10px] font-bold text-slate-500 w-[92px] shrink-0">{label}</span>
    <span className="inline-grid grid-cols-2 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(false)}
        aria-pressed={!yes}
        className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${!yes ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
      >
        No
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(true)}
        aria-pressed={yes}
        className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${yes ? 'bg-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
      >
        Yes
      </button>
    </span>
  </span>
);

/** Admin: store or food operators (filtered by view) with a clear OFF / ON override */
export const OperatorOverridePanel: React.FC<{ kind?: 'store' | 'food' }> = ({ kind }) => {
  useBatchTick();
  const [busy, setBusy] = useState('');
  const ops = getAllOperatorStatus()
    .filter((op: any) => !kind || op.kind === kind)
    .sort((a: any, b: any) => String(a.kind).localeCompare(String(b.kind)));
  const now = new Date();
  const title = kind === 'food' ? 'Food operators' : kind === 'store' ? 'Store operators' : 'Store and food operators';

  // Days ON out of the next three (a day never touched counts as ON)
  const liveCount = (op: any) =>
    Array.from({ length: OUTSIDE_DAYS_AHEAD }, (_, d) =>
      slotsForDay(op.kind, now, d).find((o) => op.kind !== 'food' || o.id === foodBatchOf(op))
    )
      .filter(Boolean)
      .filter((o: any) => batchOpen(o, opDaySwitch(op, o), op.kind, now)).length;
  const setBatch = async (op: any, batch: 'midday' | 'evening') => {
    if (foodBatchOf(op) === batch) return;
    setBusy(op.id);
    try {
      await setOperatorFoodBatch(op.id, batch);
    } catch (e) {
      window.alert('Could not update this vendor.');
    }
    setBusy('');
  };

  // Both switches stay exactly as you set them, day after day, until you change them (no daily reset)
  const setAccepting = async (op: any, on: boolean) => {
    if (operatorAccepting(op) === on) return;
    setBusy(op.id);
    try {
      await setOperatorAcceptingByAdmin(op.id, on);
    } catch (e) {
      window.alert('Could not update this operator.');
    }
    setBusy('');
  };

  const setLate = async (op: any, on: boolean) => {
    if (operatorLateOn(op) === on) return;
    setBusy(op.id);
    try {
      await setOperatorLateByAdmin(op.id, on);
    } catch (e) {
      window.alert('Could not update this vendor.');
    }
    setBusy('');
  };

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
        const paused = !off && !operatorAccepting(op);
        const isFood = op.kind === 'food';
        const lateOn = isFood ? operatorLateOn(op) : true;
        const lunch = foodBatchOf(op) === 'midday';
        return (
          <div
            key={op.id}
            className={`flex items-center justify-between gap-2 p-3 rounded-2xl text-xs border-2 ${
              off
                ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                : paused
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-[#0e9f55]'
            }`}
          >
            <div className="min-w-0">
              <span className="font-bold text-slate-900 dark:text-white">
                {op.name || 'Operator'}
                {!kind && <span className="font-normal text-slate-500"> · {op.kind === 'food' ? 'Food' : 'Store'}</span>}
              </span>
              <span
                className={`block text-[11px] font-bold ${
                  off ? 'text-rose-600 dark:text-rose-400' : paused ? 'text-amber-700 dark:text-amber-300' : 'text-[#0e9f55]'
                }`}
              >
                {off
                  ? 'OFF: hidden from students until you switch ON'
                  : paused
                  ? 'PAUSED: not taking orders until you set Accepting orders to Yes'
                  : !op.payTo
                  ? 'ON, but no payment account yet, so students cannot see them'
                  : n > 0
                  ? `ON: taking orders (${n} of the next ${OUTSIDE_DAYS_AHEAD} days on)`
                  : 'ON, but they switched all their days OFF'}
              </span>
              {op.kind === 'food' && (
                <span className="mt-1.5 inline-grid grid-cols-2 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                  {(
                    [
                      ['midday', 'Lunch batch'],
                      ['evening', 'Dinner batch'],
                    ] as const
                  ).map(([b, label]) => (
                    <button
                      key={b}
                      type="button"
                      disabled={busy === op.id}
                      onClick={() => setBatch(op, b)}
                      aria-pressed={foodBatchOf(op) === b}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${
                        foodBatchOf(op) === b ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-slate-900 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
              {!off && (
                <>
                  <YesNo label="Accepting orders" yes={!paused} busy={busy === op.id} onChange={(on) => setAccepting(op, on)} />
                  {isFood && <YesNo label="Late orders" yes={lateOn} busy={busy === op.id} onChange={(on) => setLate(op, on)} />}
                  {paused && (
                    <span className="mt-1.5 block text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-snug">
                      Accepting orders: OFF until you switch it back to Yes. Students cannot order from them on any day.
                    </span>
                  )}
                  {isFood && !lateOn && (
                    <span className="mt-1 block text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-snug">
                      Late orders: OFF until you switch them to Yes. Orders end at {lunch ? '12:30pm' : '6:00pm'}, then students see the next batch.
                    </span>
                  )}
                  {isFood && lateOn && (
                    <span className="mt-1 block text-[10px] text-slate-500 leading-snug">Late orders: ON until {lunch ? '2:30pm' : '7:00pm'}.</span>
                  )}
                </>
              )}
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
        Your OFF overrides the operator. They cannot take orders until you switch them back ON. "Accepting orders: No" takes them off checkout on every day, and "Late orders: No" ends
        their batch at its normal cut-off. Both stay exactly as you set them until you change them, with no daily reset. Set back to Yes, they work again on their normal times by themselves.
      </p>
    </div>
  );
};
