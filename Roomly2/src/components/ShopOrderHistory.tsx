import React, { useEffect, useState } from 'react';
import { getMyShopOrders, naira } from '../shops.js';

/**
 * Orders and requests sent to Hostel Hub vendors and services from this phone, newest first.
 * Reorder opens that vendor with the same items already picked.
 */
export const ShopOrderHistory: React.FC<{ onOpen: (shopId: string, prefill?: Record<string, number>) => void }> = ({ onOpen }) => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    getMyShopOrders()
      .then((r: any[]) => live && setRows(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vendors and services</h3>
      {rows.map((o) => {
        const isOrder = o.type === 'order';
        const summary = isOrder ? (o.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(', ') : `${o.serviceName}${o.whenText ? `, ${o.whenText}` : ''}`;
        return (
          <div key={o.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{o.shopName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{summary}</p>
              <p className="text-[11px] text-slate-400">
                {new Date(o.createdAtMs).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {isOrder ? ` · ${naira(o.total)}` : o.priceFrom ? ` · from ${naira(o.price)}` : ` · ${naira(o.price)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpen(
                  o.shopId,
                  isOrder ? Object.fromEntries((o.items || []).map((i: any) => [String(i.id), Number(i.qty) || 0])) : undefined
                )
              }
              className="shrink-0 h-9 px-3.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer"
            >
              {isOrder ? 'Reorder' : 'Book again'}
            </button>
          </div>
        );
      })}
    </div>
  );
};
