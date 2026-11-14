import React, { useEffect, useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight, Users, UtensilsCrossed, ShoppingBasket, Store, Crown, Wrench, Tag, Search, Gamepad2, Trophy } from 'lucide-react';
import { GAMES, fetchLeaders, isRegisteredGamer } from '../hub.js';
import { getNextBatch, getOutsideChoices, storeGraceOpen, storeRunLeftToday } from '../api.js';
import { dayWord, timeLabel, timeLabelFull, outsideArriveByFor, INSIDE_ORDER_BY_MIN, INSIDE_ARRIVE_BY_MIN, openDateText, BEHIND_EVERY_ORDER, OUTSIDE_STORE_GRACE_END_MIN, isOutsideSource, foodLateOrderByMin, OUTSIDE_STORE_GRACE_END_MIN as STORE_LATE_MIN } from '../config';
import type { OrderRecord } from '../types';

export type QuickTarget = 'room' | 'food' | 'store' | 'hub';

/** One line per section: the live promise of the batch now taking orders */
export function promiseLine(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): string {
  if (target === 'hub') return 'Vendors, Services, Buy & Sell, Lost & Found';
  if (target === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return 'Closed for now';
    const today = next.batch.dayLabel === 'Today';
    return today
      ? `Tonight: order before ${timeLabelFull(INSIDE_ORDER_BY_MIN)}, in your room before ${timeLabelFull(INSIDE_ARRIVE_BY_MIN)}`
      : `Closed. Next: ${next.batch.dayLabel.toLowerCase()} 8:30pm`;
  }
  if (target === 'store' && storeOpensAtMs > now.getTime()) return `Opens ${openDateText(storeOpensAtMs)}`;
  const c: any = getOutsideChoices(target, now);
  const b = c.batch;
  if (!b) return 'Back soon';
  const gate = timeLabelFull(outsideArriveByFor(b.id));
  if (target === 'food' && c.lateFood && dayWord(b.date, now) === 'today')
    return `Late order: before ${timeLabelFull(foodLateOrderByMin(b.id))}, at the gate before ${timeLabelFull(outsideArriveByFor(b.id, true))}`;
  if (dayWord(b.date, now) !== 'today') return `Order now for ${dayWord(b.date, now).replace(/^on /, '')}, gate before ${gate}`;
  if (target === 'store' && storeGraceOpen(now)) return `Late orders open until ${timeLabelFull(OUTSIDE_STORE_GRACE_END_MIN)}, at the gate before ${gate}`;
  const label = target === 'food' ? (b.id === 'midday' ? 'Lunch: ' : 'Dinner: ') : '';
  return `${label}order before ${timeLabelFull(b.startMin)}, at the gate before ${gate}`;
}

/** The card's lines: "Orders end" and "Arrives before" for the batch now taking orders (today or the next day).
 *  The status above already says which day, so the lines carry only the times. */
export function cardLines(target: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): string[] {
  if (target === 'hub') return ['Vendors, Services, Buy & Sell, Lost & Found'];
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
/**
 * A home card's status: a pill (Open now / Late order open / Order for tomorrow) and two short time lines.
 * tone: 'open' green and pulsing, 'late' amber and pulsing, 'next' grey and still, 'info' plain text (Hostel Hub).
 */
export type CardStatus = { pill: string; tone: 'open' | 'late' | 'next' | 'info'; lines: string[] };
export function shortStatus(id: QuickTarget, now: Date = new Date(), storeOpensAtMs = 0): CardStatus {
  if (id === 'hub') return { pill: '', tone: 'info', lines: ['Vendors · Services · Buy & Sell · Lost & Found'] };
  const t = (min: number) => timeLabelFull(min);
  const dayOf = (date: string) => {
    const w = dayWord(date, now).replace(/^on /, '');
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  if (id === 'room') {
    const { next } = getNextBatch('inside', now);
    if (!next) return { pill: 'Back soon', tone: 'next', lines: ['Room delivery is paused'] };
    if (next.batch.dayLabel === 'Today')
      return { pill: 'Open tonight', tone: 'open', lines: [`Order before ${t(INSIDE_ORDER_BY_MIN)}`, `In your room before ${t(INSIDE_ARRIVE_BY_MIN)}`] };
    return { pill: `Order for ${dayOf(next.batch.date).toLowerCase()}`, tone: 'next', lines: ['Order now', `In your room before ${t(INSIDE_ARRIVE_BY_MIN)}`] };
  }
  if (id === 'store' && storeOpensAtMs > now.getTime())
    return { pill: `Opens ${openDateText(storeOpensAtMs)}`, tone: 'next', lines: [] };
  const c: any = getOutsideChoices(id, now);
  const b = c.batch;
  if (!b) return { pill: 'Back soon', tone: 'next', lines: [] };
  const gate = t(outsideArriveByFor(b.id));
  if (dayWord(b.date, now) !== 'today')
    return { pill: `Order for ${dayOf(b.date).toLowerCase()}`, tone: 'next', lines: ['Order now', `At the gate before ${gate}`] };
  if (id === 'store' && storeGraceOpen(now))
    return { pill: 'Late order open', tone: 'late', lines: [`Order before ${t(STORE_LATE_MIN)}`, `At the gate before ${gate}`] };
  if (id === 'food' && c.lateFood)
    return { pill: 'Late order open', tone: 'late', lines: [`Order before ${t(foodLateOrderByMin(b.id))}`, `At the gate before ${t(outsideArriveByFor(b.id, true))}`] };
  const end = b.orderBy instanceof Date ? b.orderBy.getHours() * 60 + b.orderBy.getMinutes() : b.startMin;
  return { pill: 'Open now', tone: 'open', lines: [`Order before ${t(end)}`, `At the gate before ${gate}`] };
}

/** Fixed card photos (public/images/cards). Swap a file to change a card's photo. */
const CARD_PHOTO: Record<QuickTarget, string> = {
  food: '/images/cards/food.webp',
  store: '/images/cards/store.webp',
  room: '/images/cards/canteen.webp',
  hub: '',
};

/** Backup only, if a fixed photo fails to load: a featured product photo from that section */
function productPhotoFor(id: QuickTarget, products: any[]): string {
  if (id === 'hub') return '';
  const inSection = (p: any) =>
    p && p.imageUrl && p.isAvailable !== false &&
    (id === 'food' ? p.source === 'food' : id === 'store' ? p.source === 'outside' : !isOutsideSource(p.source));
  const list = products.filter(inSection);
  return (list.find((p) => p.featured) || list[0])?.imageUrl || '';
}

/** Hostel Hub's tile: a green scene with the four sections as little icon tiles (Games has its own card below) */
const HubTile: React.FC = () => {
  const chips = [
    { Icon: Store, tilt: '-rotate-6', lift: 'translate-y-1' },
    { Icon: Wrench, tilt: 'rotate-3', lift: '-translate-y-1.5' },
    { Icon: Tag, tilt: '-rotate-3', lift: 'translate-y-1' },
    { Icon: Search, tilt: 'rotate-6', lift: '-translate-y-1' },
  ];
  return (
    <div className="relative w-full h-24 overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#12a45b] via-[#0e8a4a] to-[#0a5f35]">
      <span className="absolute -top-8 -left-6 w-24 h-24 rounded-full bg-white/10" />
      <span className="absolute -bottom-10 -right-4 w-28 h-28 rounded-full bg-white/10" />
      <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-white/70" />
      <span className="absolute bottom-3 left-4 w-1 h-1 rounded-full bg-white/60" />
      <div className="relative flex items-center -space-x-1.5">
        {chips.map(({ Icon, tilt, lift }, i) => (
          <span
            key={i}
            className={`w-10 h-10 rounded-xl bg-white/95 shadow-md shadow-black/20 flex items-center justify-center ${tilt} ${lift}`}
          >
            <Icon className="w-5 h-5 text-[#0a7a41]" />
          </span>
        ))}
      </div>
    </div>
  );
};

const FALLBACK_ICON: Record<QuickTarget, React.FC<{ className?: string }>> = {
  food: UtensilsCrossed,
  store: ShoppingBasket,
  room: Store,
  hub: Users,
};

/** Home: four photo cards (everyone): photo, name with an arrow, and one short status line */
export const HomeQuickCards: React.FC<{
  onOpen: (t: QuickTarget) => void;
  storeOpensAtMs?: number;
  /** Products, for each card's photo */
  products?: any[];
  /** New visitors see the trust strip under the cards; returning students see it at the bottom of the page */
  showBehind?: boolean;
  /** Open the Games page, on one game if a tile was tapped */
  onOpenGames: (game?: string) => void;
}> = ({ onOpen, storeOpensAtMs = 0, products = [], showBehind = true, onOpenGames }) => {
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
      {/* Tells first-timers these four cards are the whole app */}
      <div className="flex items-center gap-3 px-1">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-300 dark:to-emerald-700" />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0b8044] dark:text-emerald-400">Everything on Roomly</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-300 dark:to-emerald-700" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map(({ id, title }) => {
          const { pill, tone, lines } = shortStatus(id, now, storeOpensAtMs);
          const photo = broken[id] ? productPhotoFor(id, products) : CARD_PHOTO[id];
          const Icon = FALLBACK_ICON[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              className="h-full flex flex-col items-stretch rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left cursor-pointer active:scale-[0.98] transition-transform"
            >
              {id === 'hub' ? (
                <HubTile />
              ) : photo && !broken[id + '_backup'] ? (
                <img
                  src={photo}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setBroken((b) => (b[id] ? { ...b, [id + '_backup']: true } : { ...b, [id]: true }))}
                  className="w-full h-24 object-cover bg-slate-100 dark:bg-slate-800"
                />
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40">
                  <Icon className="w-9 h-9 text-[#0e9f55]" />
                </div>
              )}
              <span className="flex flex-col px-3 py-2.5">
                <span className="flex items-center gap-1 text-sm font-extrabold text-slate-900 dark:text-white">
                  <span className="min-w-0 truncate">{title}</span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                </span>
                {tone === 'info' ? (
                  <span className="mt-1 text-[11px] leading-snug font-semibold text-slate-500 dark:text-slate-400">{lines[0]}</span>
                ) : (
                  <>
                    <span
                      className={`mt-1.5 self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap ${
                        tone === 'open'
                          ? 'bg-emerald-100 text-[#0b6b39] dark:bg-emerald-950/60 dark:text-emerald-300'
                          : tone === 'late'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span className="relative flex w-1.5 h-1.5 shrink-0" aria-hidden="true">
                        {tone !== 'next' && (
                          <span className={`absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping ${tone === 'open' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        )}
                        <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${tone === 'open' ? 'bg-[#0e9f55]' : tone === 'late' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      </span>
                      {pill}
                    </span>
                    {lines.map((l) => (
                      <span key={l} className="mt-1 block text-[10.5px] leading-snug font-semibold tracking-tight text-slate-600 dark:text-slate-300">
                        {l}
                      </span>
                    ))}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <HostelLeagueCard onOpen={onOpenGames} />

      {showBehind && <BehindEveryOrder />}
    </div>
  );
};

/**
 * The fifth card: Roomly Hostel League. Only the button (Join, or Play once registered) opens the Games page; a game tile opens that game.
 * One row of game tiles shows who holds each crown. The next tile is left half visible so students know to swipe.
 */
const HostelLeagueCard: React.FC<{ onOpen: (game?: string) => void }> = ({ onOpen }) => {
  const [leaders, setLeaders] = useState<Record<string, { name: string; pts: number } | null> | null>(null);
  const [member, setMember] = useState(false);
  useEffect(() => {
    let live = true;
    isRegisteredGamer().then((m: boolean) => live && setMember(m));
    fetchLeaders()
      .then((l: any) => live && setLeaders(l))
      .catch(() => live && setLeaders({}));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="relative rounded-3xl p-4 overflow-hidden text-white bg-gradient-to-br from-[#12a45b] via-[#0e8a4a] to-[#08502d] shadow-lg shadow-emerald-900/20">
      <span className="pointer-events-none absolute -top-12 -right-10 w-40 h-40 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-16 -left-12 w-44 h-44 rounded-full bg-black/10" />
      <Trophy className="pointer-events-none absolute top-3 right-24 w-16 h-16 text-white/10 -rotate-12" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">
            <Gamepad2 className="w-4 h-4" /> Roomly Hostel League
          </p>
          <h3 className="mt-1 text-xl font-extrabold leading-tight tracking-tight">Best in Caritas</h3>
        </div>
        <button
          type="button"
          onClick={() => onOpen()}
          className="shrink-0 h-10 px-6 rounded-full bg-white text-[#0a5f35] text-sm font-bold shadow-md shadow-black/20 cursor-pointer active:scale-95 transition-transform"
        >
          {member ? 'Play' : 'Join'}
        </button>
      </div>
      <p className="relative mt-1.5 max-w-[85%] text-[13px] font-normal text-emerald-50/90 leading-snug">
        Compete in the game you play and become the best in Caritas.
      </p>
      <p className="relative mt-3.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/90">
        <Crown className="w-3.5 h-3.5" /> Who holds each crown right now
      </p>
      {/* Tiles run off the right edge of the card on purpose */}
      <div className="relative mt-2 -mr-4 flex gap-2.5 overflow-x-auto no-scrollbar pr-4">
        {GAMES.map((g: { id: string; label: string }) => {
          const l = leaders ? leaders[g.id] : null;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onOpen(g.id)}
              className="shrink-0 w-[124px] text-left rounded-2xl px-3 py-2.5 bg-white/12 backdrop-blur-sm border border-white/20 cursor-pointer active:scale-[0.97] transition-transform"
            >
              <span className="flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${l ? 'bg-amber-300 text-amber-900' : 'bg-white/20 text-white/80'}`}>
                  <Crown className="w-3 h-3" />
                </span>
                <span className="text-sm font-semibold">{g.label}</span>
              </span>
              <span className="mt-1 block text-[11px] text-emerald-50/85 truncate">{leaders === null ? ' ' : l ? `${l.name}, ${l.pts} pts` : 'No crown yet'}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onOpen()}
          className="shrink-0 w-[124px] text-left rounded-2xl px-3 py-2.5 bg-white/12 backdrop-blur-sm border border-white/20 cursor-pointer active:scale-[0.97] transition-transform"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-white/20 text-white/80">
              <Trophy className="w-3 h-3" />
            </span>
            <span className="text-sm font-semibold">Full table</span>
          </span>
          <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-50/85">
            See all <ChevronRight className="w-3 h-3" />
          </span>
        </button>
      </div>
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
