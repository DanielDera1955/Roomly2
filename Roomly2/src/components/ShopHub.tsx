import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { NoPhoto } from './NoPhoto';
import {
  BOYS_HOSTELS,
  GIRLS_HOSTELS,
  subscribeShops,
  getShopStats,
  rankShops,
  shopTitle,
  shopTag,
  placeLine,
  priceText,
  sideOf,
} from '../shops.js';

export type ShopKind = 'vendor' | 'service';
export interface Shop {
  id: string;
  kind: ShopKind;
  name: string;
  hostel: string;
  room?: string;
  showRoom?: boolean;
  photo?: string;
  cover?: string;
  tag?: string;
  deliveryOn?: boolean;
  deliveryFee?: number;
  approvedAtMs?: number;
  createdAtMs?: number;
  items: { id: string; name: string; price: number; priceFrom?: boolean; photo?: string; soldOut?: boolean }[];
}

const chip = (on: boolean) =>
  `shrink-0 whitespace-nowrap h-10 px-4 rounded-full text-xs font-bold border transition-all cursor-pointer ${
    on
      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]'
      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
  }`;

const countText = (n: number, kind: ShopKind) => `${n} ${kind === 'service' ? 'service' : 'vendor'}${n === 1 ? '' : 's'}`;

/** One vendor or service card: photo, name, pin, tag, three rows and a bottom bar */
export const ShopCard: React.FC<{ shop: Shop; onOpen: () => void; top?: boolean }> = ({ shop, onOpen, top }) => {
  const tag = top ? 'Most visited' : shopTag(shop);
  const isService = shop.kind === 'service';
  const rows = shop.items.slice(0, 3);
  const photo = shop.photo || shop.cover || '';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex gap-3">
        <div className="w-[84px] h-[84px] shrink-0 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {photo ? <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" /> : <NoPhoto name={shop.name} className="text-3xl" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 dark:text-white truncate">{shopTitle(shop)}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{placeLine(shop)}</span>
          </p>
          {tag && (
            <span
              className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                tag === 'New'
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
              }`}
            >
              {tag}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-slate-100 dark:border-slate-800">
        {rows.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            <span className="text-sm text-slate-800 dark:text-slate-100 truncate">{i.name}</span>
            <span className="shrink-0 text-sm font-bold text-[#0e9f55]">{priceText(i)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl px-3.5 h-11 bg-slate-50 dark:bg-slate-800/60">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {shop.items.length} {isService ? (shop.items.length === 1 ? 'service' : 'services') : shop.items.length === 1 ? 'item' : 'items'}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-[#0e9f55]">
          {isService ? 'View services' : 'View items'} <ChevronRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
};

/**
 * Vendors and Services in the Hub: Boys / Girls buttons with counts, hostel chips, then the cards.
 * startHostel: the student's own hostel, so the list opens on their side.
 */
export const ShopHub: React.FC<{ kind: ShopKind; startHostel?: string; onOpen: (shop: Shop) => void; onList: () => void }> = ({ kind, startHostel, onOpen, onList }) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState<'boys' | 'girls'>(startHostel && sideOf(startHostel) === 'girls' ? 'girls' : 'boys');
  const [hostel, setHostel] = useState('All');
  // Visits in the last 7 days decide the order. The numbers are never shown here (admin only).
  const [stats, setStats] = useState<Record<string, { visits: number; orders: number }>>({});

  useEffect(
    () =>
      subscribeShops(kind, (list: Shop[]) => {
        setShops(list);
        setLoaded(true);
      }),
    [kind]
  );
  useEffect(() => setHostel('All'), [side]);
  useEffect(() => {
    getShopStats()
      .then(setStats)
      .catch(() => {});
  }, [kind]);
  const ranked = useMemo(() => rankShops(shops, stats), [shops, stats]);

  const count = useMemo(
    () => ({
      boys: shops.filter((s) => sideOf(s.hostel) === 'boys').length,
      girls: shops.filter((s) => sideOf(s.hostel) === 'girls').length,
    }),
    [shops]
  );
  const chips = ['All', ...(side === 'boys' ? BOYS_HOSTELS : GIRLS_HOSTELS)];
  const shown = ranked.list.filter((s: Shop) => sideOf(s.hostel) === side && (hostel === 'All' || s.hostel === hostel));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {(['boys', 'girls'] as const).map((s) => {
          const on = side === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`text-left rounded-2xl px-4 py-3.5 border cursor-pointer transition-all ${
                on
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55]'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <span className={`block text-base font-black ${on ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                {s === 'boys' ? 'Boys hostels' : 'Girls hostels'}
              </span>
              <span className={`block text-sm font-semibold ${on ? 'text-[#0e9f55]' : 'text-slate-400 dark:text-slate-500'}`}>{countText(count[s], kind)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-0.5">
        {chips.map((c) => (
          <button key={c} type="button" onClick={() => setHostel(c)} className={chip(hostel === c)}>
            {c}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="py-10 text-center text-xs text-slate-400">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-center py-10 px-4 text-xs text-slate-400">
          {kind === 'service' ? 'No services here yet.' : 'No vendors here yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((s: Shop) => (
            <ShopCard key={s.id} shop={s} top={s.id === ranked.topId} onOpen={() => onOpen(s)} />
          ))}
        </div>
      )}

      <div className="rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/70 dark:border-emerald-900">
        <p className="text-base font-black text-slate-900 dark:text-white">Sell or offer a service in your hostel?</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-snug">Get your own shop page where students pick items and send you the order on WhatsApp. Free to list.</p>
        <button type="button" onClick={onList} className="mt-3 h-11 px-6 rounded-xl bg-white dark:bg-white text-slate-900 text-sm font-black cursor-pointer border border-slate-200">
          List your business
        </button>
      </div>
    </div>
  );
};
