import React, { useEffect, useState } from 'react';
import { Clock, Store, UtensilsCrossed } from 'lucide-react';
import { getNextBatch } from '../api.js';
import { formatRemaining, DELIVERY_FEES, OUTSIDE_DELIVERY_FEE, BatchOption } from '../config';

interface DeliveryPromiseBannerProps {
  mode: 'inside' | 'outside';
}

const naira = (n: number) => `₦${n.toLocaleString()}`;
const when = (o: BatchOption) => `${o.dayLabel}, ${o.window}`;

/** Sits under the Inside / Outside toggle. Shows only the next batch the order will join. */
export const DeliveryPromiseBanner: React.FC<DeliveryPromiseBannerProps> = ({ mode }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', refresh);
    const id = window.setInterval(refresh, 20000);
    return () => {
      window.removeEventListener('roomly-batches', refresh);
      window.clearInterval(id);
    };
  }, []);

  const shell =
    'relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10';

  if (mode === 'outside') {
    const { next: store, note: storeNote } = getNextBatch('store');
    const { next: food, note: foodNote } = getNextBatch('food');
    return (
      <div className={shell}>
        <div className="relative z-10 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              Store items
            </p>
            {store ? (
              <>
                <h2 className="text-lg font-extrabold tracking-tight mt-1">{when(store.batch)}</h2>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Still accepting orders, will start sending by {store.startText}. Order within{' '}
                  <strong className="text-white">{formatRemaining(store.start.getTime() - Date.now())}</strong>.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold mt-1">Store orders are paused right now.</p>
                <p className="text-xs text-emerald-100/90 mt-0.5">{storeNote || 'Check back soon.'}</p>
              </>
            )}
          </div>

          <div className="rounded-xl bg-white/15 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Food and drinks
            </p>
            {food ? (
              <p className="text-xs mt-1">
                Still accepting food orders, will start sending by {food.startText}
                {food.batch.dayLabel === 'Today' ? '' : ` (${food.batch.dayLabel})`}. Order within{' '}
                <strong>{formatRemaining(food.start.getTime() - Date.now())}</strong>.
              </p>
            ) : (
              <p className="text-xs mt-1">Food orders are closed right now. {foodNote}</p>
            )}
          </div>

          <p className="text-xs text-emerald-100/90">
            From our trusted stores and food partners. Delivery is {naira(OUTSIDE_DELIVERY_FEE)} to the school gate, paid for
            first. At checkout you can ask an inside runner to bring it to your room.
          </p>
        </div>
      </div>
    );
  }

  const { next, note } = getNextBatch('inside');

  return (
    <div className={shell}>
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-3">
        {next ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Next delivery to your room
            </p>
            <h2 className="text-lg font-extrabold tracking-tight mt-1">{when(next.batch)}</h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">
              Still accepting orders, will start sending by {next.startText}. Order within{' '}
              <strong className="text-white">{formatRemaining(next.start.getTime() - Date.now())}</strong> to join
              this batch.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Delivery to your room</p>
            <h2 className="text-base font-extrabold mt-1">Ordering is paused right now</h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">{note || 'No runner is taking orders yet. Check back soon.'}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <span className="block text-emerald-100/90">Under {naira(DELIVERY_FEES.threshold)}</span>
            <span className="font-extrabold text-sm">{naira(DELIVERY_FEES.small)} delivery</span>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <span className="block text-emerald-100/90">{naira(DELIVERY_FEES.threshold)} and above</span>
            <span className="font-extrabold text-sm">{naira(DELIVERY_FEES.large)} delivery</span>
          </div>
        </div>
      </div>
    </div>
  );
};
