import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { getBookableBatches } from '../api.js';
import { formatRemaining } from '../config';

/** Shows when the next delivery reaches the hostel and how long the student has to order. */
export const DeliveryPromiseBanner: React.FC = () => {
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

  const options = getBookableBatches(false);
  const next = options[0];
  const later = options.slice(1, 3);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10">
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-3">
        {next ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Next delivery to your room
            </p>
            <h2 className="text-lg font-extrabold tracking-tight mt-1">
              {next.dayLabel}, {next.window}
            </h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">
              Order within <strong className="text-white">{formatRemaining(next.orderBy.getTime() - Date.now())}</strong> to
              get it in this batch
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Delivery to your room</p>
            <h2 className="text-base font-extrabold mt-1">No delivery batch is open right now</h2>
            <p className="text-xs text-emerald-100/90 mt-0.5">Check back soon for the next one.</p>
          </div>
        )}

        {later.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {later.map((o) => (
              <span key={o.key} className="px-2 py-1 rounded-full bg-white/15">
                Then {o.dayLabel === 'Today' ? '' : o.dayLabel + ' '}
                {o.window}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <span className="block text-emerald-100/90">Under ₦1,600</span>
            <span className="font-extrabold text-sm">₦300 delivery</span>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <span className="block text-emerald-100/90">₦1,600 and above</span>
            <span className="font-extrabold text-sm">₦500 delivery</span>
          </div>
        </div>
      </div>
    </div>
  );
};
