import React, { useEffect, useState } from 'react';
import { listDaySlots } from '../config';
import { getBatchOff, setBatchOff } from '../api.js';

/** Runners and admin switch each delivery batch on or off for today and tomorrow. */
export const BatchSwitches: React.FC = () => {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', refresh);
    return () => window.removeEventListener('roomly-batches', refresh);
  }, []);

  const off = getBatchOff();
  const now = new Date();
  const days = [listDaySlots(now, 0), listDaySlots(now, 1)];

  const toggle = async (key: string, isOff: boolean) => {
    setBusy(key);
    try {
      await setBatchOff(key, !isOff);
    } catch (e) {
      window.alert('Could not update this batch. Check your connection and try again.');
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
        <span>Delivery batches (switch on or off)</span>
        <span className="text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {days.map((slots, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{i === 0 ? 'Today' : 'Tomorrow'}</p>
              {slots.map((o) => {
                const isOff = off.has(o.key);
                const closed = o.orderBy.getTime() <= now.getTime();
                return (
                  <div
                    key={o.key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white">{o.window}</span>
                      <span className="block text-[11px] text-slate-500">
                        {o.name}
                        {closed ? ' · orders closed' : ` · order by ${o.orderBy.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busy === o.key}
                      onClick={() => toggle(o.key, isOff)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer ${
                        isOff ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-[#0e9f55] text-white'
                      }`}
                    >
                      {isOff ? 'Off' : 'On'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <p className="text-[11px] text-slate-400">A batch that is off does not show to students.</p>
        </div>
      )}
    </div>
  );
};
