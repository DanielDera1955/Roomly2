import React, { useEffect, useState } from 'react';
import { Clock, Store, UtensilsCrossed } from 'lucide-react';
import { getBookableBatches } from '../api.js';
import { formatRemaining, getNextOutsideSlot, startLabel, DELIVERY_FEES, OUTSIDE_DELIVERY_FEE, BatchOption } from '../config';

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
    const store = getNextOutsideSlot('store');
    const food = getNextOutsideSlot('food');
    const foodToday = food?.dayLabel === 'Today';
    return (
      <div className={shell}>
        <div className="relative z-10 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              Next store batch
            </p>
            {store ? (
              <>
                <h2 className="text-lg font-extrabold tracking-tight mt-1">{when(store)}</h2>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Still accepting orders, will start sending by {startLabel(store)}. Order within{' '}
                  <strong className="text-white">{formatRemaining(store.orderBy.getTime() - Date.now())}</strong>.
                </p>
              </>
            ) : (
              <p className="text-sm font-bold mt-1">No store batch is open right now.</p>
            )}
          </div>

          <div className="rounded-xl bg-white/15 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Food and drinks
            </p>
            {food && foodToday ? (
              <p className="text-xs mt-1">
                Still accepting food orders, arrives about {food.window}. Order by{' '}
                {food.orderBy.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
              </p>
            ) : food ? (
              <p className="text-xs mt-1">
                Food orders are closed for today. Next batch: {when(food)}.
              </p>
            ) : (
              <p className="text-xs mt-1">Food orders are closed right now.</p>
            )}
          </div>

          <p className="text-xs text-emerald-100/90">
            From our trusted stores and food partners. Delivery is {naira(OUTSIDE_DELIVERY_FEE)}, and these items are paid
            for first.
          </p>
        </div>
      </div>
    );
  }

  const next = getBookableBatches(false)[0];

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
            <h2 className="text-lg font-extrabold tracking-tight mt-1">{when(next)}</h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">
              Still accepting orders, will start sending by {startLabel(next)}. Order within{' '}
              <strong className="text-white">{formatRemaining(next.orderBy.getTime() - Date.now())}</strong> to join
              this batch.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Delivery to your room</p>
            <h2 className="text-base font-extrabold mt-1">No delivery batch is open right now</h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">Check back soon for the next one.</p>
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
