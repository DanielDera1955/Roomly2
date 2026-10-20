import React from 'react';
import { Clock } from 'lucide-react';

export const DeliveryPromiseBanner: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-4 shadow-md shadow-emerald-950/10">
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="relative z-10 space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Delivery to your room
          </p>
          <h2 className="text-base font-extrabold tracking-tight mt-1">Three delivery batches every day</h2>
          <p className="text-xs text-emerald-100/90 mt-0.5">
            Morning 8 to 9am · Afternoon 1 to 2pm · Evening 7 to 8pm
          </p>
        </div>
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
