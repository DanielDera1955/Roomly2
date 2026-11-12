import React, { useEffect, useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight, Gamepad2, UtensilsCrossed, ShoppingBasket, Store } from 'lucide-react';
import { getNextBatch, getOutsideChoices, storeGraceOpen, storeRunLeftToday } from '../api.js';
import { dayWord, timeLabel, timeLabelFull, outsideArriveByFor, INSIDE_ORDER_BY_MIN, INSIDE_ARRIVE_BY_MIN, openDateText, BEHIND_EVERY_ORDER, OUTSIDE_STORE_GRACE_END_MIN, isOutsideSource } from '../config';
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
  if (target === 'store' && storeGraceOpen(now)) return `Late orders open until ${timeLabelFull(OUTSIDE_STORE_GRACE_END_MIN)}, at the gate before ${gate}`;
  const label = target === 'food' ? (b.id === 'midday' ? 'Lunch: ' : 'Dinner: ') : '';
  return `${label}order before ${timeLabelFull(b.startMin)}, at the gate before ${gate}`;
}

/** The card's lines: "Orders end" and "Arrives before" for the batch now taking orders (today or the next day).
 *  The status above already says which day, so the lines carry only the times. */
export function cardLines(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): string[] {
  if (target === 'hub') return ['Games, Buy & Sell, Services, Lost & Found'];
  if (target === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return ['Check back soon'];
    return [`Orders end: ${timeLabelFull(INSIDE_ORDER_BY_MIN)}`, `Arrives before: ${timeLabelFull(INSIDE_ARRIVE_BY_MIN)}`];
  }
  if (target === 'store' && storeOpensAtMs > now.getTime()) return [`Opens ${openDateText(storeOpensAtMs)}`];
  const b = getOutsideChoices(target, now).batch;
  if (!b) return ['Check back soon'];
  const today = dayWord(b.date, now) === 'today';
  const gate = timeLabelFull(outsideArriveByFor(b.id));
  // Store grace: late orders until 6:00pm (or until the run leaves)
  const ends = target === 'store' && today && storeGraceOpen(now) ? OUTSIDE_STORE_GRACE_END_MIN : b.startMin;
  const lines = [`Orders end: ${timeLabelFull(ends)}`, `Arrives before: ${gate}`];
  // Today's store run has left: say so on its own line
  if (target === 'store' && !today && storeRunLeftToday(now)) lines.unshift("Today's run: Sent ✓");
  return lines;
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

/** One short status line per card: "Open · gate before 7pm", "Closed · order for tomorrow", etc. */
export function shortStatus(id: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): { text: string; open: boolean } {
  if (id === 'hub') return { text: 'Games · Buy and Sell · Services · Lost and Found', open: true };
  const forWord = (date?: string) => (date ? dayWord(date, now).replace(/^on /, '') : 'later');
  if (id === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return { text: 'Closed for now', open: false };
    if (next.batch.dayLabel === 'Today') return { text: `Tonight · room by ${timeLabel(INSIDE_ARRIVE_BY_MIN)}`, open: true };
    return { text: `Closed · order for ${forWord(next.batch.date)}`, open: false };
  }
  if (id === 'store' && storeOpensAtMs > now.getTime()) return { text: `Opens ${openDateText(storeOpensAtMs)}`, open: false };
  const b = getOutsideChoices(id, now).batch;
  if (!b) return { text: 'Back soon', open: false };
  if (dayWord(b.date, now) !== 'today') return { text: `Closed · order for ${forWord(b.date)}`, open: false };
  if (id === 'store' && storeGraceOpen(now)) return { text: `Late orders till ${timeLabel(OUTSIDE_STORE_GRACE_END_MIN)}`, open: true };
  return { text: `Open · gate before ${timeLabel(outsideArriveByFor(b.id))}`, open: true };
}

/** The card photo: a featured product with a photo from that section, else any product with a photo */
function photoFor(id: QuickTarget, products: any[]): string {
  if (id === 'hub') return '';
  const inSection = (p: any) =>
    p && p.imageUrl && p.isAvailable !== false &&
    (id === 'food' ? p.source === 'food' : id === 'store' ? p.source === 'outside' : !isOutsideSource(p.source));
  const list = products.filter(inSection);
  return (list.find((p) => p.featured) || list[0])?.imageUrl || '';
}

const FALLBACK_ICON: Record<QuickTarget, React.FC<{ className?: string }>> = {
  food: UtensilsCrossed,
  store: ShoppingBasket,
  room: Store,
  hub: Gamepad2,
};

/** Home: four photo cards (everyone): photo, name with an arrow, and one short status line */
export const HomeQuickCards: React.FC<{
  onOpen: (t: QuickTarget) => void;
  storeOpensAtMs?: number;
  /** Products, for each card's photo */
  products?: any[];
  /** New visitors see the trust strip under the cards; returning students see it at the bottom of the page */
  showBehind?: boolean;
}> = ({ onOpen, storeOpensAtMs = 0, products = [], showBehind = true }) => {
  const [, setTick] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
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
    { id: 'room', title: 'Canteen Items' },
    { id: 'hub', title: 'Hostel Hub' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map(({ id, title }) => {
          const { text, open } = shortStatus(id, now, storeOpensAtMs);
          const photo = broken[id] ? '' : photoFor(id, products);
          const Icon = FALLBACK_ICON[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              className="h-full flex flex-col items-stretch rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left cursor-pointer active:scale-[0.98] transition-transform"
            >
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setBroken((b) => ({ ...b, [id]: true }))}
                  className="w-full h-24 object-cover bg-slate-100 dark:bg-slate-800"
                />
              ) : (
                <div className={`w-full h-24 flex items-center justify-center ${id === 'hub' ? 'bg-violet-100 dark:bg-violet-950/50' : 'bg-emerald-50 dark:bg-emerald-950/40'}`}>
                  <Icon className={`w-9 h-9 ${id === 'hub' ? 'text-violet-600 dark:text-violet-300' : 'text-[#0e9f55]'}`} />
                </div>
              )}
              <span className="flex flex-col px-3 py-2.5">
                <span className="flex items-center gap-1 text-sm font-extrabold text-slate-900 dark:text-white">
                  <span className="min-w-0 truncate">{title}</span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                </span>
                <span
                  className={`mt-1 flex items-start gap-1.5 text-[11px] leading-snug font-semibold ${
                    id === 'hub' ? 'text-slate-500 dark:text-slate-400' : open ? 'text-[#0b8044] dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {id !== 'hub' && (
                    <span className="relative flex w-2 h-2 mt-1 shrink-0" aria-hidden="true">
                      {open && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
                      <span className={`relative inline-flex w-2 h-2 rounded-full ${open ? 'bg-[#0e9f55]' : 'bg-amber-400'}`} />
                    </span>
                  )}
                  <span className="min-w-0">{text}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {showBehind && <BehindEveryOrder />}
    </div>
  );
};

/** Behind every order: the real people who make the promise happen */
export const BehindEveryOrder: React.FC = () => (
  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-3.5">
    <p className="text-center text-xs font-bold text-slate-600 dark:text-slate-300">The team behind every order</p>
    <div className="mt-3 grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
      {BEHIND_EVERY_ORDER.map((x) => (
        <div key={x.label} className="min-w-0 px-1 flex flex-col items-center justify-center text-center">
          <p className="text-lg font-black leading-none text-slate-900 dark:text-white tabular-nums">{x.count}</p>
          <p className="mt-1.5 w-full text-[10px] leading-tight font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
            {x.label}
          </p>
        </div>
      ))}
    </div>
  </div>
);

/**
 * "My last order: Order again", folded by default (near the Featured row). Open: the last paid order's items
 * with photos in a sideways-scrolling row, each with + Add, plus Add all (puts the whole order back in its cart).
 */
export const LastOrderStrip: React.FC<{
  order: OrderRecord;
  products: any[];
  onReorder: (o: OrderRecord) => void;
  onAddOne: (p: any) => void;
  storeOpensAtMs?: number;
}> = ({ order, products, onReorder, onAddOne, storeOpensAtMs = 0 }) => {
  const [open, setOpen] = useState(false);
  const target: QuickTarget = order.cart === 'food' ? 'food' : order.cart === 'store' ? 'store' : 'room';
  // One card per product (the same item twice in the order shows once), only items still on sale
  const seen = new Set<string>();
  const items = (order.items || [])
    .map((i: any) => ({ i, p: products.find((x) => x.id === i.productId) }))
    .filter(({ i, p }) => p && p.isAvailable !== false && !seen.has(i.productId) && seen.add(i.productId));
  if (!(order.items || []).length) return null;
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer">
          <RotateCcw className="w-4 h-4 text-[#0e9f55] shrink-0" />
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">My last order: Order again</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && items.length > 0 && (
          <button type="button" onClick={() => onReorder(order)} className="shrink-0 text-xs font-bold text-[#0e9f55] cursor-pointer">
            Add all
          </button>
        )}
      </div>
      {open && (
        <div className="pb-3.5 border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-2">
          <p className="px-3.5 text-[11px] text-slate-500 dark:text-slate-400">
            ₦{Number(order.subtotal || 0).toLocaleString()} items · {promiseLine(target, new Date(), storeOpensAtMs)}
          </p>
          {items.length === 0 ? (
            <p className="px-3.5 text-xs text-slate-400">The items from your last order are not available right now.</p>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-3.5 pb-0.5 snap-x">
              {items.map(({ p }) => (
                <div key={p.id} className="snap-start shrink-0 w-[112px] p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex flex-col">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-16 rounded-lg object-cover bg-white" />
                  ) : (
                    <div className="w-full h-16 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center text-lg font-black text-slate-300">
                      {String(p.name).charAt(0)}
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2">{p.name}</p>
                  <p className="text-[10px] text-slate-500">₦{Number(p.price || 0).toLocaleString()}</p>
                  <button
                    type="button"
                    onClick={() => onAddOne(p)}
                    className="mt-auto pt-1.5 w-full py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-[11px] font-bold cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
