import React, { useEffect, useState } from 'react';
import { RotateCcw, ChevronDown } from 'lucide-react';
import { getNextBatch, getOutsideChoices } from '../api.js';
import { dayWord, timeLabelFull, outsideArriveByFor, INSIDE_ORDER_BY_MIN, INSIDE_ARRIVE_BY_MIN, openDateText } from '../config';
import type { OrderRecord } from '../types';

export type QuickTarget = 'room' | 'food' | 'store' | 'hub';

/** One line per section: the live promise of the batch now taking orders */
export function promiseLine(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): string {
  if (target === 'hub') return 'Games, Buy & Sell, Services, Lost & Found';
  if (target === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return 'Closed for now';
    const today = next.batch.dayLabel === 'Today';
    return today
      ? `Tonight: order before ${timeLabelFull(INSIDE_ORDER_BY_MIN)}, in your room before ${timeLabelFull(INSIDE_ARRIVE_BY_MIN)}`
      : `Closed. Next: ${next.batch.dayLabel.toLowerCase()} 8:30pm`;
  }
  if (target === 'store' && storeOpensAtMs > now.getTime()) return `Opens ${openDateText(storeOpensAtMs)}`;
  const b = getOutsideChoices(target, now).batch;
  if (!b) return 'Back soon';
  const gate = timeLabelFull(outsideArriveByFor(b.id));
  if (dayWord(b.date, now) !== 'today') return `Closed. Order now for ${dayWord(b.date, now).replace(/^on /, '')}, gate before ${gate}`;
  const label = target === 'food' ? (b.id === 'midday' ? 'Lunch: ' : 'Dinner: ') : '';
  return `${label}order before ${timeLabelFull(b.startMin)}, at the gate before ${gate}`;
}

/** The card's two lines: when current orders end, and when they are delivered ("tomorrow" etc. when closed today) */
export function cardLines(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): string[] {
  if (target === 'hub') return ['Games, Buy & Sell, Services, Lost & Found'];
  const when = (date: string) => {
    const w = dayWord(date, now);
    return w === 'today' ? '' : ` ${w.replace(/^on /, '')}`;
  };
  if (target === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return ['Closed for now'];
    const w = when(next.batch.date);
    return [`Orders end: ${timeLabelFull(INSIDE_ORDER_BY_MIN)}${w}`, `Delivered before: ${timeLabelFull(INSIDE_ARRIVE_BY_MIN)}${w}`];
  }
  if (target === 'store' && storeOpensAtMs > now.getTime()) return [`Opens ${openDateText(storeOpensAtMs)}`];
  const b = getOutsideChoices(target, now).batch;
  if (!b) return ['Back soon'];
  const w = when(b.date);
  return [`Orders end: ${timeLabelFull(b.startMin)}${w}`, `Delivered before: ${timeLabelFull(outsideArriveByFor(b.id))}${w}`];
}

/** Is this section taking orders right now (a batch today that hasn't closed)? */
export function isOpenNow(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): boolean {
  if (target === 'hub') return true;
  if (target === 'room') {
    const { next } = getNextBatch('inside', now);
    return Boolean(next && next.batch.dayLabel === 'Today');
  }
  if (target === 'store' && storeOpensAtMs > now.getTime()) return false;
  const b = getOutsideChoices(target, now).batch;
  return Boolean(b && dayWord(b.date, now) === 'today');
}

/** Home: four quick cards (everyone): the live dot, the name and the promise of each section */
export const HomeQuickCards: React.FC<{
  onOpen: (t: QuickTarget) => void;
  storeOpensAtMs?: number;
}> = ({ onOpen, storeOpensAtMs = 0 }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    const id = window.setInterval(h, 30000);
    return () => {
      window.removeEventListener('roomly-batches', h);
      window.clearInterval(id);
    };
  }, []);
  const now = new Date();
  const cards: { id: QuickTarget; title: string }[] = [
    { id: 'food', title: 'Outside Food' },
    { id: 'store', title: 'Outside Items' },
    { id: 'hub', title: 'Hostel Hub' },
    { id: 'room', title: 'Canteen Items' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ id, title }) => {
          const open = isOpenNow(id, now, storeOpensAtMs);
          return (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(id)}
            className={`h-full flex flex-col justify-start items-stretch p-3 rounded-2xl bg-white dark:bg-slate-900 border text-left cursor-pointer active:scale-[0.98] transition-transform ${
              open && id !== 'hub' ? 'border-[#0e9f55]/60' : 'border-slate-200/80 dark:border-slate-800'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
              {/* Live dot first: pulsing green while taking orders, amber when closed, steady green for Hostel Hub */}
              <span className="relative flex w-2.5 h-2.5 shrink-0" aria-label={id === 'hub' ? 'Open anytime' : open ? 'Taking orders now' : 'Closed now'}>
                {open && id !== 'hub' && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
                <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${open ? 'bg-[#0e9f55]' : 'bg-amber-400'}`} />
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
            </span>
            <span className={`block mt-0.5 text-[10px] font-bold uppercase tracking-wide ${open ? 'text-[#0e9f55]' : 'text-amber-600 dark:text-amber-400'}`}>
              {id === 'hub' ? 'Open anytime' : open ? 'Taking orders now' : 'Closed now'}
            </span>
            {cardLines(id, now, storeOpensAtMs).map((line) => (
              <span key={line} className="block mt-1 first-of-type:mt-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                {line}
              </span>
            ))}
          </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * "My last order: Order again", folded by default (near the Featured row): the last paid order,
 * its price and the promise of the batch it would join now. One tap puts it back in its own cart.
 */
export const LastOrderStrip: React.FC<{ order: OrderRecord; onReorder: (o: OrderRecord) => void; storeOpensAtMs?: number }> = ({
  order,
  onReorder,
  storeOpensAtMs = 0,
}) => {
  const [open, setOpen] = useState(false);
  const target: QuickTarget = order.cart === 'food' ? 'food' : order.cart === 'store' ? 'store' : 'room';
  const names = (order.items || []).map((i: any) => i.name).filter(Boolean);
  if (!names.length) return null;
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <RotateCcw className="w-4 h-4 text-[#0e9f55]" /> My last order: Order again
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{names.join(', ')}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            ₦{Number(order.subtotal || 0).toLocaleString()} items · {promiseLine(target, new Date(), storeOpensAtMs)}
          </p>
          <button type="button" onClick={() => onReorder(order)} className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
            Add to cart
          </button>
        </div>
      )}
    </div>
  );
};
