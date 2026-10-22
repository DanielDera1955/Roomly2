import React from 'react';
import { X, Package, ChevronRight } from 'lucide-react';
import { OrderRecord, locationText } from '../types';

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Already filtered to paid orders and sorted newest first */
  orders: OrderRecord[];
  loading: boolean;
  signedIn?: boolean;
  onSelect: (order: OrderRecord) => void;
}

const isActive = (o: OrderRecord) => o.status !== 'Delivered' && o.status !== 'Cancelled';

const statusText = (o: OrderRecord) => {
  if (o.paymentStatus === 'unpaid') return 'Waiting for payment';
  if (o.paymentStatus === 'payment_sent' && o.status === 'Received') return 'Payment being confirmed';
  return o.status === 'Packing' ? 'Being packaged' : o.status;
};

/** Active Orders & History: any active order and its status first, then earlier orders, newest first. */
export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({ isOpen, onClose, orders, loading, signedIn = true, onSelect }) => {
  if (!isOpen) return null;
  const active = orders.filter(isActive);
  const past = orders.filter((o) => !isActive(o));

  const Row = ({ o, highlight }: { o: OrderRecord; highlight?: boolean }) => (
    <button
      type="button"
      onClick={() => onSelect(o)}
      className={`w-full text-left p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer ${
        highlight
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{o.id}</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              o.paymentStatus === 'unpaid'
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {statusText(o)}
          </span>
        </div>
        {highlight && o.deliveryTime && (
          <p className="text-[11px] font-bold text-[#0e9f55] mt-0.5 truncate">{o.deliveryTime}</p>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ') || (o.customRequest ? 'Custom request' : '')}
        </p>
        <p className="text-[11px] text-slate-400">
          {new Date(o.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ₦
          {(o.totalAmount || 0).toLocaleString()} · {locationText(o)}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl max-h-[90vh] flex flex-col border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Active Orders &amp; History</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {loading && <p className="text-xs text-center text-slate-400 py-2">Loading your orders…</p>}

          {!loading && orders.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {signedIn
                ? 'No orders yet. Orders show here once you tap "I have made payment".'
                : 'Enter your phone number and PIN on the home screen to see your orders.'}
            </div>
          )}

          {active.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active</h3>
              {active.map((o) => (
                <Row key={o.id} o={o} highlight />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">History</h3>
              {past.map((o) => (
                <Row key={o.id} o={o} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
