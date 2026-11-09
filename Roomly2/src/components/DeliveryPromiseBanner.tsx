import React, { useEffect, useState } from 'react';
import { Clock, Store, UtensilsCrossed } from 'lucide-react';
import { getNextBatch, getOutsideChoices, storeGraceOpen, storeRunLeftToday } from '../api.js';
import {
  SwitchSide,
  dayWord,
  openDateText,
  INSIDE_LAUNCH_MS,
  timeLabelFull,
  outsideArriveByFor,
  INSIDE_ORDER_BY_MIN,
  INSIDE_ARRIVE_BY_MIN,
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

  let badge = '';
  let headline = '';
  let lines: string[] = [];

  if (side === 'inside') {
    const { next, note } = getNextBatch('inside', now);
    const orderBy = timeLabelFull(INSIDE_ORDER_BY_MIN);
    const arrive = timeLabelFull(INSIDE_ARRIVE_BY_MIN);
    badge = 'To your room';
    if (now.getTime() < INSIDE_LAUNCH_MS) {
      headline = `Starting ${openDateText(INSIDE_LAUNCH_MS)}`;
      lines = ['Delivery to your room starts then. You can add items to your cart now.'];
    } else if (!next) {
      headline = 'Currently closed';
      lines = [note || 'Check back soon for the next batch.'];
    } else {
      const today = next.batch.dayLabel === 'Today';
      const when = today ? '' : ` ${next.batch.dayLabel.toLowerCase()}`;
      headline = today ? 'Order now and get it in your room before ' + arrive : `Ordering for${when}`;
      lines = today
        ? [`Current batch ends by ${orderBy} and is delivered to your room before ${arrive}.`]
        : [`Tonight's batch has closed. Order now and get it in your room${when} before ${arrive}.`, `Order before ${orderBy} for same-day delivery.`];
      if (next.unconfirmed) lines.push("No runner has confirmed this batch yet. You pay once a runner confirms.");
      if (note) lines.push(note);
    }
  } else {
    badge = 'To the school gate';
    const c = getOutsideChoices(side, now);
    const b = c.batch;
    const notOpenYet = side === 'store' && storeOpensAtMs > now.getTime();
    const gateOf = (id?: string) => timeLabelFull(outsideArriveByFor(id));
    if (notOpenYet) {
      headline = `Store items will open on ${openDateText(storeOpensAtMs)}`;
      lines = ["Browse what's coming. Orders open on launch day, delivered to the school gate."];
    } else if (!b) {
      headline = 'Paused right now';
      lines = ['Check back soon, or send a request for what you need.'];
    } else {
      const today = dayWord(b.date, now) === 'today';
      const closesAt = timeLabelFull(b.startMin);
      if (!today) {
        const w = dayWord(b.date, now).replace(/^on /, '');
        headline = `Ordering for ${w}`;
        lines = [
          side === 'store' && storeRunLeftToday(now) ? "Today's run has been sent." : "Today's orders have closed.",
          `Order now and get it ${dayWord(b.date, now)} before ${gateOf(b.id)}. Order before ${closesAt} for same-day delivery.`,
        ];
      } else if (side === 'store' && storeGraceOpen(now)) {
        headline = `Late orders still open. Get it at the gate before ${gateOf(b.id)}`;
        lines = ["Today's run hasn't left yet. If it leaves before you pay, your order comes tomorrow."];
      } else if (side === 'store') {
        headline = `Order anytime before ${closesAt} and get it at the gate before ${gateOf(b.id)}`;
      } else if (b.id === 'midday') {
        headline = `Order now and get it at the gate before ${gateOf('midday')}`;
        lines = [`Current batch stops taking orders at ${closesAt}.`];
        // A dinner batch later today: is any dinner vendor cooking once lunch closes?
        const afterLunch = new Date(new Date(b.date + 'T00:00:00').getTime() + (b.startMin + 1) * 60000);
        const later = getOutsideChoices('food', afterLunch).batch;
        if (later && later.date === b.date && later.id === 'evening') {
          lines.push(`Next batch: order from ${closesAt} to ${timeLabelFull(later.startMin)}, arrives before ${gateOf('evening')}.`);
        }
      } else {
        headline = `Order now and get it at the gate before ${gateOf(b.id)}`;
        lines = [`Orders close at ${closesAt}. This is the last batch today.`];
      }
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10">
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{side === 'inside' ? 'Night Batch Only' : `Today's Batch: ${label}`}</span>
          </p>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white whitespace-nowrap">{badge}</span>
        </div>
        <h2 className="text-lg font-extrabold tracking-tight leading-snug">{headline}</h2>
        {lines.map((l) => (
          <p key={l} className="text-xs text-emerald-100/90">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
};
