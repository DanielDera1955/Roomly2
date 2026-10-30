import React from 'react';
import { Sparkles } from 'lucide-react';
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
}) => {
  return (
    <div className="space-y-2.5">
      {/* One slim segmented bar: equal widths, short labels, fits small phones */}
      <div
        role="tablist"
        className={`grid gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 ${side === 'inside' ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {[
          ...(['store', 'food'] as ShopGroup[]).map((g) => ({ id: g as ShopTab, label: shortLabel(g, side) })),
          ...(side === 'inside' ? [{ id: 'hub' as ShopTab, label: 'Hostel Hub' }] : []),
        ].map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                onSelect(t.id);
                onSelectFilter('All');
              }}
              className={`h-10 px-1 rounded-xl text-[13px] font-bold truncate transition-all cursor-pointer ${
                isSelected ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {selected !== 'hub' && searchSlot}

      {!searching && selected !== 'Request' && selected !== 'hub' && filters.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
          {['All', ...filters].map((f) => {
            const on = selectedFilter.toLowerCase() === f.toLowerCase();
            return (
              <button
                key={f}
                type="button"
                onClick={() => onSelectFilter(f)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  on
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 shadow-xs hover:border-[#0e9f55]'
                }`}
              >
                {f}
              </button>
            );
          })}
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
    </div>
  );
};
