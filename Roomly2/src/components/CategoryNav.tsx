import React, { useState } from 'react';
import { CategoryDefinition } from '../types';
import { LayoutGrid, ListFilter } from 'lucide-react';

interface CategoryNavProps {
  categories: CategoryDefinition[];
  selectedCategory: string;
  onSelectCategory: (catName: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (subcatName: string) => void;
  requestCount?: number;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  requestCount = 0,
}) => {
  // Mobile layout mode: 'grid' displays all categories at once on screen
  const [layoutMode, setLayoutMode] = useState<'grid' | 'scroll'>('grid');

  const currentCategoryDef = categories.find(
    (c) => c.name.toLowerCase() === selectedCategory.toLowerCase()
  );
  const subcategories = currentCategoryDef?.subcategories || ['All'];

  return (
    <div className="space-y-2.5">
      {/* Category Header with Layout Toggle */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Categories ({categories.length})
        </span>

        <button
          type="button"
          onClick={() => setLayoutMode((prev) => (prev === 'grid' ? 'scroll' : 'grid'))}
          className="flex items-center gap-1 text-[10px] font-bold text-[#0e9f55] hover:text-[#0b8044] transition-colors cursor-pointer"
          title="Toggle view: All on screen vs Scroll"
        >
          <LayoutGrid className="w-3 h-3" />
          <span>{layoutMode === 'grid' ? 'Show All on Screen' : 'Compact Scroll'}</span>
        </button>
      </div>

      {/* CATEGORY TILES: GRID (All on Screen) vs SCROLL */}
      {layoutMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => {
            const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();

            return (
              <button
                key={cat.id || cat.name}
                type="button"
                onClick={() => {
                  onSelectCategory(cat.name);
                  onSelectSubcategory('All');
                }}
                className={`relative flex flex-col items-center justify-center p-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer text-center ${
                  isSelected
                    ? 'bg-[#0e9f55] text-white shadow-md shadow-[#0e9f55]/20 ring-2 ring-[#0e9f55] scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-xl leading-none mb-1 select-none">{cat.emoji}</span>
                <span className="truncate w-full text-[11px] font-extrabold leading-tight">
                  {cat.name}
                </span>

                {cat.name === 'Request' && requestCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-4 px-4 scroll-smooth">
          {categories.map((cat) => {
            const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();

            return (
              <button
                key={cat.id || cat.name}
                type="button"
                onClick={() => {
                  onSelectCategory(cat.name);
                  onSelectSubcategory('All');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#0e9f55] text-white shadow-md shadow-[#0e9f55]/20 scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-base leading-none select-none">{cat.emoji}</span>
                <span>{cat.name}</span>
                {cat.name === 'Request' && requestCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Subcategory Filter Pills (cleanly wrapped / scrollable) */}
      {selectedCategory !== 'Request' && subcategories.length > 1 && (
        <div className="p-2 bg-slate-100/80 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            <ListFilter className="w-3 h-3 text-[#0e9f55]" />
            <span>Filter {selectedCategory} by type:</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {subcategories.map((subcat) => {
              const isSubSelected = selectedSubcategory.toLowerCase() === subcat.toLowerCase();
              return (
                <button
                  key={subcat}
                  type="button"
                  onClick={() => onSelectSubcategory(subcat)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSubSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs scale-[1.02]'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {subcat}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
