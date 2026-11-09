import React, { useEffect, useState } from 'react';
import { Clock, UtensilsCrossed, Store, Users, RotateCcw } from 'lucide-react';
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

/**
 * Home: four quick cards (everyone) and, for a returning student, an "order again" strip
 * with their last paid order, its price and the promise of the batch it would join now.
 */
export const HomeQuickCards: React.FC<{
  onOpen: (t: QuickTarget) => void;
  lastOrder?: OrderRecord | null;
  onReorder?: (o: OrderRecord) => void;
  storeOpensAtMs?: number;
}> = ({ onOpen, lastOrder, onReorder, storeOpensAtMs = 0 }) => {
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
  const cards: { id: QuickTarget; title: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'room', title: 'Room delivery', Icon: Clock },
    { id: 'food', title: 'Cooked food', Icon: UtensilsCrossed },
    { id: 'store', title: 'Outside store', Icon: Store },
    { id: 'hub', title: 'Hostel Hub', Icon: Users },
  ];
  const lastTarget: QuickTarget | null = lastOrder ? (lastOrder.cart === 'food' ? 'food' : lastOrder.cart === 'store' ? 'store' : 'room') : null;
  const names = lastOrder ? (lastOrder.items || []).map((i: any) => i.name).filter(Boolean) : [];

  return (
    <div className="space-y-3">
      {lastOrder && onReorder && lastTarget && names.length > 0 && (
        <button
          type="button"
          onClick={() => onReorder(lastOrder)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 text-left cursor-pointer"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
            <RotateCcw className="w-4 h-4 text-[#0e9f55]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#0e9f55]">Order again</span>
            <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
              {names.slice(0, 3).join(', ')}
              {names.length > 3 ? ` +${names.length - 3}` : ''}
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
              ₦{Number(lastOrder.subtotal || 0).toLocaleString()} items · {promiseLine(lastTarget, now, storeOpensAtMs)}
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-[#0e9f55]">Add ›</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ id, title, Icon }) => {
          const open = isOpenNow(id, now, storeOpensAtMs);
          return (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(id)}
            className={`p-3 rounded-2xl bg-white dark:bg-slate-900 border text-left cursor-pointer active:scale-[0.98] transition-transform ${
              open && id !== 'hub' ? 'border-[#0e9f55]/60' : 'border-slate-200/80 dark:border-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
              <Icon className="w-4 h-4 text-[#0e9f55] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {/* Live dot: green and pulsing while taking orders now, amber when closed */}
              <span className="relative flex w-2.5 h-2.5 shrink-0" aria-label={open ? 'Taking orders now' : 'Closed now'}>
                {open && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
                <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${open ? 'bg-[#0e9f55]' : 'bg-amber-400'}`} />
              </span>
            </span>
            <span className={`block mt-0.5 text-[10px] font-bold uppercase tracking-wide ${open ? 'text-[#0e9f55]' : 'text-amber-600 dark:text-amber-400'}`}>
              {id === 'hub' ? 'Open anytime' : open ? 'Taking orders now' : 'Closed now'}
            </span>
            <span className="block mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{promiseLine(id, now, storeOpensAtMs)}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
};
