import React from 'react';
import { Zap, Clock, ShieldCheck } from 'lucide-react';

export const DeliveryPromiseBanner: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-3.5 shadow-md shadow-emerald-950/10">
      {/* Background soft glow circles */}
      <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -left-4 -top-4 w-20 h-20 bg-emerald-400/20 rounded-full blur-lg pointer-events-none" />

      <div className="relative z-10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
            <Zap className="w-3.5 h-3.5 fill-current text-yellow-300" />
            <span>Campus Fast Delivery</span>
          </div>
          <span className="text-[10px] font-bold bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full text-white">
            Hostels & Lodge Room Door
          </span>
        </div>

        <div>
          <h2 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
            <span>3 Batches + Premium (30–60m)</span>
          </h2>
          <p className="text-[11px] text-emerald-100/90 leading-tight mt-0.5">
            Morning (8-9am) · Afternoon (1-2pm) · Evening (7-8pm) · Premium Instant
          </p>
        </div>

        {/* Clear Price Badges: Batching is ₦1,000 & Premium is ₦1,500 */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2 border border-white/15 flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-emerald-200 block truncate">
                3 Delivery Batches
              </span>
              <span className="text-[9px] text-emerald-100/80 block truncate">
                8-9am · 1-2pm · 7-8pm
              </span>
            </div>
            <div className="text-right shrink-0 ml-1.5">
              <span className="font-extrabold text-xs font-mono bg-white text-emerald-800 px-1.5 py-0.5 rounded-lg shadow-xs">
                ₦1,000
              </span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2 border border-white/15 flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-yellow-200 block truncate flex items-center gap-1">
                <span>Premium Instant</span>
              </span>
              <span className="text-[9px] text-emerald-100/80 block truncate">
                Within 30–60 mins
              </span>
            </div>
            <div className="text-right shrink-0 ml-1.5">
              <span className="font-extrabold text-xs font-mono bg-yellow-300 text-slate-900 px-1.5 py-0.5 rounded-lg shadow-xs">
                ₦1,500
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
