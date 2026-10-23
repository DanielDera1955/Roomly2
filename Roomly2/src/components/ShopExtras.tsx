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

/** Returning students: a greeting card whose sky follows the time of day (sunrise, blue sky, night) */
export const GreetingCard: React.FC<{
  dayPart: 'Good morning' | 'Good afternoon' | 'Good evening';
  name: string;
  hasUsuals: boolean;
  activeOrders: number;
  onOpenOrders: () => void;
}> = ({ dayPart, name, hasUsuals, activeOrders, onOpenOrders }) => {
  const morning = dayPart === 'Good morning';
  const afternoon = dayPart === 'Good afternoon';
  const sky = morning
    ? 'linear-gradient(180deg,#fb923c 0%,#fbbf24 45%,#fde68a 100%)'
    : afternoon
    ? 'linear-gradient(180deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)'
    : 'linear-gradient(180deg,#1e1b4b 0%,#312e81 55%,#0e7490 100%)';
  const ink = morning ? 'text-orange-950' : 'text-white';
  const stars = [
    [190, 14],
    [235, 46],
    [262, 10],
    [205, 78],
    [290, 92],
  ];
  return (
    <div className={`relative overflow-hidden rounded-3xl p-[18px] min-h-[176px] shadow-md ${ink}`} style={{ background: sky }}>
      {morning && (
        <div className="absolute right-5 top-5 w-14 h-14 rounded-full bg-orange-50" style={{ boxShadow: '0 0 40px 14px rgba(255,237,213,.8)' }} />
      )}
      {afternoon && (
        <>
          <div className="absolute right-6 top-[18px] w-12 h-12 rounded-full bg-yellow-300" style={{ boxShadow: '0 0 30px 10px rgba(253,224,71,.6)' }} />
          <span className="absolute right-[70px] top-[30px] w-[70px] h-5 rounded-full bg-white/85" />
          <span className="absolute right-5 top-[78px] w-[46px] h-3.5 rounded-full bg-white/85" />
        </>
      )}
      {!morning && !afternoon && (
        <>
          {stars.map(([l, t]) => (
            <span key={`${l}-${t}`} className="absolute w-[3px] h-[3px] rounded-full bg-white/85" style={{ left: l, top: t }} />
          ))}
          <div className="absolute right-[22px] top-4 w-10 h-10 rounded-full bg-amber-200 overflow-hidden" style={{ boxShadow: '0 0 30px 8px rgba(253,230,138,.35)' }}>
            <div className="absolute w-10 h-10 rounded-full left-[11px] -top-1.5" style={{ background: '#262266' }} />
          </div>
        </>
      )}
      {/* hills */}
      <div className="absolute -left-8 -right-8 -bottom-12 h-20 rounded-[50%] bg-[#0e9f55]/55" />
      <div className="absolute left-[120px] -right-16 -bottom-14 h-20 rounded-[50%] bg-[#0b8044]/50" />

      <div className="relative z-10">
        <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${morning ? 'text-orange-800' : 'opacity-90'}`}>{dayPart}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight leading-tight truncate">{name}</h1>
        <p className="text-[13px] opacity-90 max-w-[230px] leading-snug">
          Nice to have you back.{hasUsuals ? ' Your usuals are one tap away.' : ''}
        </p>
        {activeOrders > 0 && (
          <button
            type="button"
            onClick={onOpenOrders}
            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer backdrop-blur-sm ${
              morning ? 'bg-white/45' : 'bg-white/20'
            }`}
          >
            🛍 {activeOrders} {activeOrders === 1 ? 'order' : 'orders'} on the way ›
          </button>
        )}
      </div>
    </div>
  );
};
