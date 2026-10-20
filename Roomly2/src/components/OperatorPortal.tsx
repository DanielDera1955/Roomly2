import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Package, Phone } from 'lucide-react';
import { subscribeOperatorOrders, updatePartStatus, getCurrentStaff, logoutStaff } from '../api.js';
import { OrderRecord, partLabel } from '../types';
import { playChime } from '../sound';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle } from './ThemeToggle';

type Kind = 'store' | 'food';

interface OperatorPortalProps {
  onBack: () => void;
}

/** Store and food operators: they only see PAID orders, and only their own items. */
export const OperatorPortal: React.FC<OperatorPortalProps> = ({ onBack }) => {
  const staff = getCurrentStaff();
  const isAdmin = staff?.role === 'admin';
  const [kind, setKind] = useState<Kind>(staff?.role === 'food' ? 'food' : 'store');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'packed' | 'sent'>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setLoading(true);
    seen.current = null;
    return subscribeOperatorOrders(kind, (list: OrderRecord[]) => {
      const ids = new Set(list.map((o) => o.id));
      if (seen.current && list.some((o) => !seen.current!.has(o.id))) playChime('order');
      seen.current = ids;
      setOrders(list);
      setLoading(false);
    });
  }, [kind]);

  const mine = (o: OrderRecord) => (o.items || []).filter((i) => (kind === 'food' ? i.source === 'food' : i.source === 'outside'));
  const statusOf = (o: OrderRecord) => (kind === 'food' ? o.foodStatus : o.storeStatus) || 'pending';
  const count = (s: string) => orders.filter((o) => statusOf(o) === s).length;
  const shown = orders.filter((o) => filter === 'all' || statusOf(o) === filter);

  const setStatus = async (o: OrderRecord, status: 'packed' | 'sent') => {
    setBusy(o.id);
    await updatePartStatus(o.id, kind, status, staff?.name || 'Operator');
    setBusy('');
  };

  const pill = (s: string) =>
    s === 'sent'
      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
      : s === 'packed'
      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';

  const tabs: [typeof filter, string][] = [
    ['all', `All orders (${orders.length})`],
    ['pending', `To pack (${count('pending')})`],
    ['packed', `Packed (${count('packed')})`],
    ['sent', `Sent (${count('sent')})`],
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight">{kind === 'food' ? 'Food orders' : 'Store orders'}</h1>
            <p className="text-xs text-slate-500">Paid orders only</p>
          </div>
          <div className="flex items-center gap-1">
            <SoundToggle className="hover:bg-slate-100 dark:hover:bg-slate-800" />
            <ThemeToggle className="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" />
            {isAdmin ? (
              <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 px-2 py-1.5 cursor-pointer">
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => logoutStaff()}
                className="text-xs font-bold text-slate-500 hover:text-rose-500 px-2 py-1.5 cursor-pointer whitespace-nowrap"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(['store', 'food'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  kind === k ? 'bg-white dark:bg-slate-900 shadow-xs text-[#0e9f55]' : 'text-slate-500'
                }`}
              >
                {k === 'store' ? 'Store view' : 'Food view'}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                filter === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-xs text-center text-slate-400 py-6">Loading orders…</p>}
        {!loading && shown.length === 0 && (
          <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            <Package className="w-7 h-7 mx-auto mb-2 opacity-40" />
            Nothing here. Orders appear once the student has paid.
          </div>
        )}

        {shown.map((o) => {
          const items = mine(o);
          const total = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
          const st = statusOf(o);
          const isOpen = !!open[o.id];
          return (
            <div key={o.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [o.id]: !p[o.id] }))}
                className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-extrabold text-base">{o.name}</span>
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${pill(st)}`}>
                      {st === 'pending' ? 'To pack' : st === 'packed' ? 'Packed' : 'Sent'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{o.deliveryTime}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className="font-extrabold text-base text-[#0e9f55] whitespace-nowrap">₦{total.toLocaleString()}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                    <p className="font-bold">Write this on the package</p>
                    <p className="text-sm font-extrabold">
                      {o.name} · {o.phone}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {items.map((i, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center text-xl shrink-0">
                          {i.imageUrl && !i.imageUrl.startsWith('data:image/svg') ? (
                            <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{i.emoji}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight">{i.name}</p>
                          <p className="text-xs text-slate-500">
                            {i.quantity} × ₦{(i.unitPrice || 0).toLocaleString()}
                          </p>
                        </div>
                        <span className="text-sm font-bold whitespace-nowrap">₦{(i.totalPrice || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Paid for these items</span>
                      <span className="text-[#0e9f55]">₦{total.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy === o.id || st !== 'pending'}
                      onClick={() => setStatus(o, 'packed')}
                      className="py-2.5 rounded-xl text-xs font-bold bg-blue-600 text-white disabled:opacity-40 cursor-pointer"
                    >
                      Mark packed
                    </button>
                    <button
                      type="button"
                      disabled={busy === o.id || st === 'sent'}
                      onClick={() => setStatus(o, 'sent')}
                      className="py-2.5 rounded-xl text-xs font-bold bg-[#0e9f55] text-white disabled:opacity-40 cursor-pointer"
                    >
                      Sent to school gate
                    </button>
                  </div>
                  <a
                    href={`tel:${o.phone}`}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call {o.name}</span>
                  </a>
                  <p className="text-[11px] text-slate-400 text-center">Status now: {partLabel(st)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
