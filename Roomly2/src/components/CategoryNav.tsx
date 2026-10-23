import React from 'react';
import { Sparkles } from 'lucide-react';
import { ShopGroup, shopGroupLabel } from '../config';

export type ShopTab = ShopGroup | 'Request';

interface CategoryNavProps {
  side: 'inside' | 'outside';
  selected: ShopTab;
  onSelect: (tab: ShopTab) => void;
  /** Product types inside the chosen category (e.g. Drinks, Toiletries), used as quick filters */
  filters: string[];
  selectedFilter: string;
  onSelectFilter: (f: string) => void;
  requestCount?: number;
}

const EMOJI: Record<ShopGroup, string> = { store: '🛒', food: '🍛' };

/** Two categories per side: Store Items, and Cooked Food (inside and outside). */
export const CategoryNav: React.FC<CategoryNavProps> = ({
  side,
  selected,
  onSelect,
  filters,
  selectedFilter,
  onSelectFilter,
  requestCount = 0,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {(['store', 'food'] as ShopGroup[]).map((g) => {
          const isSelected = selected === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => {
                onSelect(g);
                onSelectFilter('All');
              }}
              className={`flex items-center justify-center gap-2 p-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer text-center ${
                isSelected
                  ? 'bg-[#0e9f55] text-white shadow-md shadow-[#0e9f55]/20 ring-2 ring-[#0e9f55]'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="text-lg leading-none select-none">{EMOJI[g]}</span>
              <span className="leading-tight">{shopGroupLabel(g, side)}</span>
            </button>
          );
        })}
      </div>

      {selected !== 'Request' && filters.length > 1 && (
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

      <button
        type="button"
        onClick={() => onSelect(selected === 'Request' ? 'store' : 'Request')}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-[#0e9f55] border border-dashed border-emerald-300 dark:border-emerald-800 cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>{selected === 'Request' ? 'Back to items' : "Can't find it? Request an item"}</span>
        {requestCount > 0 && selected !== 'Request' && <span className="w-2 h-2 rounded-full bg-amber-400" />}
      </button>
    </div>
  );
};
