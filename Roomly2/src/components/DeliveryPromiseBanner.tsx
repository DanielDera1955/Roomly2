import React, { useEffect, useState } from 'react';
import { Clock, Store, UtensilsCrossed } from 'lucide-react';
import { getNextBatch, getOutsideChoices, storeGraceOpen, storeRunLeftToday, batchCloseDate } from '../api.js';
import {
  SwitchSide,
  dayWord,
  openDateText,
  INSIDE_LAUNCH_MS,
  timeLabelFull,
  outsideArriveByFor,
  INSIDE_ORDER_BY_MIN,
  INSIDE_ARRIVE_BY_MIN,
  slotsForDay,
} from '../config';

interface DeliveryPromiseBannerProps {
  mode: 'inside' | 'outside';
  /** Which outside section is open: store items or cooked food and drinks */
  tab?: 'store' | 'food' | 'Request' | 'hub';
  /** Outside store items not open yet: when they open (ms), or 0 when open */
  storeOpensAtMs?: number;
}

/**
 * "Today's batch" card under the Inside / Outside toggle: the batch now taking orders, when it closes,
 * and when it arrives. It sets the promise Roomly keeps. No fees (shown at checkout).
 */
export const DeliveryPromiseBanner: React.FC<DeliveryPromiseBannerProps> = ({ mode, tab, storeOpensAtMs = 0 }) => {
  const [, setTick] = useState(0);
  // Compact by default: the headline only; the details open on tap
  const [more, setMore] = useState(false);

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
  const now = new Date();
  const Icon = side === 'inside' ? Clock : side === 'food' ? UtensilsCrossed : Store;
  const label = side === 'inside' ? 'Room delivery' : side === 'food' ? 'Cooked Food' : 'Outside Store Items';

  // Which section the student is in, named the way the home cards name it
  const section = side === 'inside' ? 'Canteen Items' : side === 'food' ? 'Outside Food' : 'Outside Items';
  type Tag = 'OPEN NOW' | 'NEXT' | 'CLOSED' | string;
  type Row = { name: string; orderEnd: string; arrive: string; tag: Tag };

  let badge = '';
  let headline = '';
  let rows: Row[] = [];
  let notes: string[] = [];
  const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

  if (side === 'inside') {
    const { next, note } = getNextBatch('inside', now);
    const orderBy = timeLabelFull(INSIDE_ORDER_BY_MIN);
    const arrive = timeLabelFull(INSIDE_ARRIVE_BY_MIN);
    badge = 'To your room';
    if (now.getTime() < INSIDE_LAUNCH_MS) {
      headline = `Starting ${openDateText(INSIDE_LAUNCH_MS)}`;
      notes = ['Delivery to your room starts then. You can add items to your cart now.'];
    } else if (!next) {
      headline = 'Closed right now';
      rows = [{ name: 'Night batch', orderEnd: orderBy, arrive, tag: 'CLOSED' }];
      if (note) notes = [note];
    } else {
      const today = next.batch.dayLabel === 'Today';
      const when = next.batch.dayLabel.toLowerCase();
      headline = today ? 'Taking orders now' : `Closed for today. Order now for ${when}`;
      rows = [{ name: 'Night batch', orderEnd: orderBy, arrive, tag: today ? 'OPEN NOW' : when.toUpperCase() }];
      if (next.unconfirmed) notes.push('No runner has confirmed this batch yet. You pay once a runner confirms.');
      if (note) notes.push(note);
    }
  } else {
    badge = 'To the school gate';
    const c = getOutsideChoices(side, now);
    const b = c.batch;
    const notOpenYet = side === 'store' && storeOpensAtMs > now.getTime();
    const gateOf = (id?: string) => timeLabelFull(outsideArriveByFor(id));
    const nameOf = (id?: string) => (side === 'store' ? 'Daily run' : id === 'midday' ? 'Lunch' : id === 'evening' ? 'Dinner' : 'Batch');
    if (notOpenYet) {
      headline = `Opens on ${openDateText(storeOpensAtMs)}`;
      notes = ["Browse what's coming. Orders open on launch day, delivered to the school gate."];
    } else if (!b) {
      headline = 'Paused right now';
      notes = ['Check back soon, or send a request for what you need.'];
    } else {
      const word = dayWord(b.date, now);
      const today = word === 'today';
      // Every batch on the day of the batch now taking orders (Monday has no lunch, Sunday no store run)
      let slots: any[] = [];
      for (let d = 0; d < 8 && !slots.length; d++) {
        const list = slotsForDay(side, now, d);
        if (list.length && list[0].date === b.date) slots = list;
      }
      if (!slots.length) slots = [b];
      rows = slots.map((o: any) => {
        const end = o.orderBy instanceof Date ? minOf(o.orderBy) : o.startMin;
        let tag: Tag;
        if (!today) tag = word.replace(/^on /, '').toUpperCase();
        else if (o.id === b.id) tag = 'OPEN NOW';
        else if (now.getTime() >= batchCloseDate(o, side).getTime()) tag = 'CLOSED';
        else tag = 'NEXT';
        return { name: nameOf(o.id), orderEnd: timeLabelFull(end), arrive: gateOf(o.id), tag };
      });
      if (!today) {
        headline = `Closed for today. Order now for ${word.replace(/^on /, '')}`;
        if (side === 'store' && storeRunLeftToday(now)) notes = ["Today's run has been sent."];
      } else if (side === 'store' && storeGraceOpen(now)) {
        headline = 'Late orders still open';
        notes = ["Today's run hasn't left yet. If it leaves before you pay, your order comes tomorrow."];
      } else {
        headline = 'Taking orders now';
      }
    }
  }

  const tagClass = (t: Tag) =>
    t === 'OPEN NOW' ? 'bg-white text-emerald-700' : t === 'NEXT' ? 'bg-white/20 text-white' : t === 'CLOSED' ? 'bg-black/20 text-emerald-100/70' : 'bg-amber-300 text-amber-950';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white px-3.5 py-3 shadow-md shadow-emerald-950/10">
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>You're in: {section}</span>
          </p>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white whitespace-nowrap">{badge}</span>
        </div>
        <h2 className="text-[15px] font-extrabold tracking-tight leading-snug">{headline}</h2>
        {rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.name} className="rounded-xl bg-black/15 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold">
                    <span className={`w-2 h-2 rounded-full ${r.tag === 'OPEN NOW' ? 'bg-white' : 'border border-white/70'}`} />
                    {r.name}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wide ${tagClass(r.tag)}`}>{r.tag}</span>
                </div>
                <p className="mt-0.5 pl-3.5 text-[11px] text-emerald-50/90">
                  Order ends by {r.orderEnd} · Arrives before {r.arrive}
                </p>
              </div>
            ))}
          </div>
        )}
        {notes.map((l) => (
          <p key={l} className="text-[11px] text-emerald-100/90">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
};
