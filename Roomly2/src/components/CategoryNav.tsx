import React from 'react';
import { Sparkles, ShoppingBasket, UtensilsCrossed, Users } from 'lucide-react';
import { ShopGroup, shopGroupLabel } from '../config';

/** 'hub' = Hostel Hub (inside school only) */
export type ShopTab = ShopGroup | 'Request' | 'hub';

interface CategoryNavProps {
  side: 'inside' | 'outside';
  selected: ShopTab;
  onSelect: (tab: ShopTab) => void;
  /** Product types inside the chosen category (e.g. Drinks, Toiletries), used as quick filters */
  filters: string[];
  selectedFilter: string;
  onSelectFilter: (f: string) => void;
  requestCount?: number;
  /** Search box shown right under the Store/Food toggle */
  searchSlot?: React.ReactNode;
  /** While the student is searching, hide the chips and request button */
  searching?: boolean;
  /** The open section's content: shown inside the panel that hangs from the active tab */
  children?: React.ReactNode;
}

/** Short tab names so three fit on one line on any phone */
const shortLabel = (g: ShopGroup, side: 'inside' | 'outside') => (g === 'food' && side === 'inside' ? 'Food' : shopGroupLabel(g, side));

/** Two categories per side: Store Items, and Cooked Food (inside and outside). */
export const CategoryNav: React.FC<CategoryNavProps> = ({
  side,
  selected,
  onSelect,
  filters,
  selectedFilter,
  onSelectFilter,
  requestCount = 0,
  searchSlot,
  searching = false,
  children,
}) => {
  const tabs = [
    { id: 'store' as ShopTab, label: shortLabel('store', side), Icon: ShoppingBasket },
    { id: 'food' as ShopTab, label: shortLabel('food', side), Icon: UtensilsCrossed },
    ...(side === 'inside' ? [{ id: 'hub' as ShopTab, label: 'Hostel Hub', Icon: Users }] : []),
  ];
  // The notch under the open tab (Request belongs to Store Items)
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.id === (selected === 'Request' ? 'store' : selected)));
  const notchLeft = `calc(${((activeIdx + 0.5) / tabs.length) * 100}% - 9px)`;

  return (
    <div>
      <p className="px-1 mb-2 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">What do you need?</p>

      {/* Main sections: the "main door", in a green frame. The open one is solid green. */}
      <div
        role="tablist"
        className={`grid gap-1.5 p-1.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border-2 border-[#0e9f55]/40 ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {tabs.map(({ id, label, Icon }) => {
          const isSelected = selected === id || (id === 'store' && selected === 'Request');
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                onSelect(id);
                onSelectFilter('All');
              }}
              className={`h-[60px] px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#0e9f55] text-white shadow-lg shadow-[#0e9f55]/30'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[12px] font-bold leading-none truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Everything for the open tab hangs from it: green top line and a notch under the active tab */}
      <div className="relative mt-3 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 border-t-2 border-t-[#0e9f55] p-3 space-y-3">
        <span
          aria-hidden
          className="absolute -top-[10px] w-[18px] h-[18px] rotate-45 bg-white dark:bg-slate-950 border-l-2 border-t-2 border-[#0e9f55] rounded-tl-[3px] transition-all duration-300"
          style={{ left: notchLeft }}
        />

      {selected !== 'hub' && searchSlot}

      {!searching && selected !== 'Request' && selected !== 'hub' && filters.length > 1 && (
        <div className="relative -mx-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 pb-0.5">
            {['All', ...filters].map((f) => {
              const on = selectedFilter.toLowerCase() === f.toLowerCase();
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSelectFilter(f)}
                  aria-pressed={on}
                  className={`shrink-0 whitespace-nowrap h-9 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    on
                      ? 'border-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] font-bold'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              );
            })}
            <span className="shrink-0 w-6" aria-hidden />
          </div>
          {/* Fade on the right: there are more categories to scroll to */}
          <span aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white dark:from-slate-950 to-transparent" />
        </div>
      )}

      {!searching && selected !== 'hub' && (
      <button
        type="button"
        onClick={() => onSelect(selected === 'Request' ? 'store' : 'Request')}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-[#0e9f55] border border-dashed border-emerald-300 dark:border-emerald-800 cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>{selected === 'Request' ? 'Back to items' : "Can't find it? Request an item"}</span>
        {requestCount > 0 && selected !== 'Request' && <span className="w-2 h-2 rounded-full bg-amber-400" />}
      </button>
      )}
        {children}
      </div>
    </div>
  );
};
