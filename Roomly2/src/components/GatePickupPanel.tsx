import React, { useEffect, useState } from 'react';
import { subscribeGatePickups, updateGatePickup, getCurrentStaff } from '../api.js';
import { OrderRecord, shortLocation, partLabel } from '../types';
import { GATE_PICKUP_FEES } from '../config';

/**
 * Runners: requests to bring an outside parcel from the school gate to a room.
 * Read the items, tick heavy if needed (₦1,000 instead of ₦600), then accept or refuse.
 */
export const GatePickupPanel: React.FC = () => {
  const [list, setList] = useState<OrderRecord[]>([]);
  const [heavy, setHeavy] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(true);
  const me = getCurrentStaff()?.name || '';

  useEffect(() => subscribeGatePickups((l: OrderRecord[]) => setList(l)), []);

  // Only paid orders, and only what still needs a decision or is in progress (last 2 days)
  const cutoff = Date.now() - 2 * 86400000;
  const shown = list.filter(
    (o) =>
      o.gatePickup &&
      o.paymentStatus !== 'unpaid' &&
      Date.parse(o.createdAt) > cutoff &&
      (o.gatePickup.status === 'pending' || o.gatePickup.status === 'accepted')
  );

  const act = async (o: OrderRecord, action: 'accept' | 'refuse' | 'delivered' | 'refund') => {
    setBusy(o.id);
    const res = await updateGatePickup(o.id, action, Boolean(heavy[o.id]));
    if (!res) window.alert('Could not update. Check your connection and try again.');
    setBusy('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 cursor-pointer"
      >
        <span>Gate pickups ({shown.length})</span>
        <span className="text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {shown.length === 0 && <p className="text-xs text-slate-400">No gate pickup requests right now.</p>}
          {shown.map((o) => {
            const gp = o.gatePickup!;
            const mine = gp.status === 'accepted' && gp.runnerName === me;
            const part = o.cart === 'food' ? o.foodStatus : o.storeStatus;
            return (
              <div key={o.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {o.name} · {shortLocation(o)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {o.cart === 'food' ? 'Food' : 'Store'} parcel · {partLabel(part)}
                    </p>
                  </div>
                  <span className="font-bold whitespace-nowrap">
                    {gp.status === 'accepted' ? `₦${gp.fee.toLocaleString()}` : 'New'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                </p>

                {gp.status === 'pending' && (
                  <>
                    <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(heavy[o.id])}
                        onChange={(e) => setHeavy((p) => ({ ...p, [o.id]: e.target.checked }))}
                        className="w-4 h-4 accent-[#0e9f55]"
                      />
                      Heavy or bulky (₦{GATE_PICKUP_FEES.heavy.toLocaleString()} instead of ₦{GATE_PICKUP_FEES.normal.toLocaleString()})
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => act(o, 'accept')}
                        className="py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => act(o, 'refuse')}
                        className="py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                      >
                        Refuse
                      </button>
                    </div>
                  </>
                )}

                {gp.status === 'accepted' && (
                  <>
                    <p className="text-[11px] text-slate-500">
                      Accepted by {gp.runnerName}
                      {gp.heavy ? ' (heavy)' : ''}. The student pays the runner ₦{gp.fee.toLocaleString()}.
                    </p>
                    {mine && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => act(o, 'delivered')}
                          className="py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Brought to room
                        </button>
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => {
                            if (window.confirm('Refund this pickup? The student will be told to collect at the gate.')) act(o, 'refund');
                          }}
                          className="py-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Refund (too small)
                        </button>
                      </div>
                    )}
                    <a href={`tel:${o.phone}`} className="block text-center font-bold text-[#0e9f55]">
                      Call {o.name}
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
