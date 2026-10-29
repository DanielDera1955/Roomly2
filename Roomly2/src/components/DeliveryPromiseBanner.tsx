import React, { useEffect, useState } from 'react';
import { Clock, Store, UtensilsCrossed } from 'lucide-react';
import { getNextBatch } from '../api.js';
import { slotsForDay, SwitchSide, dayWord, OUTSIDE_BANNER, OUTSIDE_ORDER_BY_MIN } from '../config';

interface DeliveryPromiseBannerProps {
  mode: 'inside' | 'outside';
  /** Which outside section is open: store items or cooked food and drinks */
  tab?: 'store' | 'food' | 'Request';
}

/** Sits under the Inside / Outside toggle: how many batches run today and the next one. No fees (shown at checkout). */
export const DeliveryPromiseBanner: React.FC<DeliveryPromiseBannerProps> = ({ mode, tab }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', refresh);
    const id = window.setInterval(refresh, 20000);
    return () => {
      window.removeEventListener('roomly-batches', refresh);
      window.clearInterval(id);
    };
  }, []);

  const side: SwitchSide = mode === 'inside' ? 'inside' : tab === 'food' ? 'food' : 'store';
  const todayCount = slotsForDay(side, new Date(), 0).length;
  const { next, note } = getNextBatch(side);
  const Icon = side === 'inside' ? Clock : side === 'food' ? UtensilsCrossed : Store;
  const title = side === 'inside' ? 'Delivery to your room' : side === 'food' ? 'Cooked food' : 'Outside store items';
  const where = side === 'inside' ? 'to your room' : 'to the school gate';

  // Outside: one delivery a day, ordered before 5:10pm
  if (side !== 'inside') {
    const now = new Date();
    const todayOpt = slotsForDay(side, now, 0)[0];
    const closedToday = !todayOpt || now.getTime() >= new Date(todayOpt.date + 'T00:00:00').getTime() + OUTSIDE_ORDER_BY_MIN * 60000;
    const forToday = Boolean(next && dayWord(next.batch.date, now) === 'today');
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10">
        <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{title}</span>
            </p>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white whitespace-nowrap">To the school gate</span>
          </div>
          {!next ? (
            <>
              <h2 className="text-lg font-extrabold tracking-tight">Back soon</h2>
              <p className="text-xs text-emerald-100/90">
                Every {side === 'food' ? 'food vendor' : 'store'} is fully booked for the next few days. Check back soon.
              </p>
            </>
          ) : forToday ? (
            <>
              <h2 className="text-lg font-extrabold tracking-tight">Order today, get it today</h2>
              <p className="text-xs font-semibold text-amber-200">{OUTSIDE_BANNER}</p>
            </>
          ) : closedToday ? (
            <>
              <h2 className="text-lg font-extrabold tracking-tight">Today's orders have closed</h2>
              <p className="text-xs text-emerald-100/90">Anything you order now will be delivered {dayWord(next.batch.date, now)}.</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-extrabold tracking-tight">Fully booked today</h2>
              <p className="text-xs text-emerald-100/90">Orders placed now will be delivered {dayWord(next.batch.date, now)}.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10">
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{title}</span>
          </p>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white whitespace-nowrap">
            {todayCount} {todayCount === 1 ? 'batch' : 'batches'} today
          </span>
        </div>
        {next && next.batch.dayLabel !== 'Today' ? (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">{todayCount > 0 ? 'Done for today' : 'No batch today'}</h2>
            <p className="text-xs text-emerald-100/90">
              Next batch: {next.batch.dayLabel.toLowerCase()}, {next.batch.window}. You can still order now.
              {note ? ` ${note}` : ''}
            </p>
          </>
        ) : next && next.late ? (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">Today's batch: {next.batch.window}</h2>
            <p className="text-xs text-emerald-100/90">It's past the batch time, but orders are still being accepted. Order now.</p>
          </>
        ) : next && next.unconfirmed ? (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">Today's batch: {next.batch.window}</h2>
            <p className="text-xs text-emerald-100/90">
              Orders are open. Order now to make today's batch ({where}).{note ? ` ${note}` : ''}
            </p>
          </>
        ) : next ? (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">Taking orders now</h2>
            <p className="text-xs text-emerald-100/90">
              Today's batch runs from {next.batch.window} ({where}). Order now to make it.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-extrabold">No delivery scheduled right now</h2>
            <p className="text-xs text-emerald-100/90">{note || 'Check back soon for the next batch.'}</p>
          </>
        )}
      </div>
    </div>
  );
};
