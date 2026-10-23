import React, { useState } from 'react';
import { Plus, Minus, X, RotateCcw } from 'lucide-react';
import { Product } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

/** The product's group (e.g. Soft Drinks). Empty or 'All' falls back to the category. */
export const groupOf = (p: Product): string => {
  const g = String(p.subcategory || '').trim();
  return g && g.toLowerCase() !== 'all' ? g : String(p.category || '').trim();
};

const Thumb: React.FC<{ p: Product; big?: boolean }> = ({ p, big }) => {
  const [err, setErr] = useState(false);
  const cls = big ? 'w-full aspect-[4/3] rounded-2xl' : 'w-12 h-12 rounded-xl';
  return p.imageUrl && !err ? (
    <img src={p.imageUrl} alt={p.name} onError={() => setErr(true)} referrerPolicy="no-referrer" className={`${cls} object-cover shrink-0`} />
  ) : (
    <div className={`${cls} shrink-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/70 flex items-center justify-center`}>
      <span className={big ? 'text-5xl' : 'text-xl'}>{p.emoji}</span>
    </div>
  );
};

const Stepper: React.FC<{ qty: number; onAdd: () => void; onRemove: () => void; small?: boolean }> = ({ qty, onAdd, onRemove, small }) =>
  qty > 0 ? (
    <div className="flex items-center bg-[#0e9f55] text-white rounded-xl p-0.5 shrink-0">
      <button type="button" onClick={onRemove} className={`${small ? 'w-6 h-6' : 'w-8 h-8'} flex items-center justify-center rounded-lg hover:bg-black/15 cursor-pointer`} aria-label="Remove one">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className={`${small ? 'min-w-[18px] text-xs' : 'min-w-[24px] text-sm'} text-center font-bold`}>{qty}</span>
      <button type="button" onClick={onAdd} className={`${small ? 'w-6 h-6' : 'w-8 h-8'} flex items-center justify-center rounded-lg hover:bg-black/15 cursor-pointer`} aria-label="Add one">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={onAdd}
      className={`shrink-0 flex items-center gap-1 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl font-bold cursor-pointer ${small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
    >
      <Plus className="w-3.5 h-3.5" /> Add
    </button>
  );

interface SheetProps {
  product: Product | null;
  /** Products students can see on this side, for "More …" */
  pool: Product[];
  qtyOf: (id: string) => number;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onOpen: (p: Product) => void;
  onClose: () => void;
}

/** Tap a product: its details, quantity, and similar products from the same group */
export const ProductSheet: React.FC<SheetProps> = ({ product, pool, qtyOf, onAdd, onRemove, onOpen, onClose }) => {
  if (!product) return null;
  const group = groupOf(product);
  const similar = pool.filter((p) => p.id !== product.id && !p.isFood && groupOf(p).toLowerCase() === group.toLowerCase()).slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl border-t border-slate-200/80 dark:border-slate-800">
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />
        <button type="button" onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
          <div className="max-w-[260px] mx-auto">
            <Thumb p={product} big />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">{product.name}</h3>
              {product.unit && <p className="text-xs text-slate-500">{product.unit}</p>}
              <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{naira(product.price)}</p>
            </div>
            <Stepper qty={qtyOf(product.id)} onAdd={() => onAdd(product)} onRemove={() => onRemove(product.id)} />
          </div>
          {product.description && <p className="text-xs text-slate-500 dark:text-slate-400">{product.description}</p>}

          {similar.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">More {group}</p>
              {similar.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <button type="button" onClick={() => onOpen(p)} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
                    <Thumb p={p} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        {naira(p.price)}
                        {p.unit ? ` · ${p.unit}` : ''}
                      </span>
                    </span>
                  </button>
                  <Stepper small qty={qtyOf(p.id)} onAdd={() => onAdd(p)} onRemove={() => onRemove(p.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Returning students: their most-bought items on this side, one tap to add */
export const OrderAgainRow: React.FC<{
  items: Product[];
  qtyOf: (id: string) => number;
  onAdd: (p: Product) => void;
  onOpen: (p: Product) => void;
}> = ({ items, qtyOf, onAdd, onOpen }) => {
  if (!items.length) return null;
  const missing = items.filter((p) => qtyOf(p.id) === 0);
  return (
    <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(15,60,40,0.15)] space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-[#0e9f55]" /> Order again
        </p>
        {missing.length > 0 && (
          <button
            type="button"
            onClick={() => missing.forEach((p) => onAdd(p))}
            className="text-xs font-bold text-[#0e9f55] px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
          >
            Add all
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3">
        {items.map((p) => {
          const q = qtyOf(p.id);
          return (
            <div key={p.id} className="shrink-0 w-28 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1.5">
              <button type="button" onClick={() => onOpen(p)} className="block w-full text-left cursor-pointer">
                <Thumb p={p} />
                <span className="block mt-1 text-[11px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2">{p.name}</span>
                <span className="block text-[11px] text-slate-500">{naira(p.price)}</span>
              </button>
              <button
                type="button"
                onClick={() => onAdd(p)}
                className={`w-full py-1 rounded-lg text-[11px] font-bold cursor-pointer ${q > 0 ? 'bg-[#0e9f55] text-white' : 'bg-[#0e9f55]/10 text-[#0e9f55]'}`}
              >
                {q > 0 ? `In cart (${q}) +` : '+ Add'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
