import React, { useEffect, useState } from 'react';
import { subscribeGatePickups, updateGatePickup, getCurrentStaff, getMyUid, gateExpired } from '../api.js';
import { OrderRecord, shortLocation, partLabel } from '../types';
import { GATE_PICKUP_FEE, GATE_PICKUP_ROOMLY } from '../config';

type Action = 'accept' | 'refuse' | 'confirm' | 'delivered' | 'release';

/**
 * Runners: requests to bring an outside parcel from the school gate to a room.
 * Flat ₦1,000. Read the items, then accept or say you can't. The student pays you only after you accept,
 * and you confirm the money arrived before you go. You keep ₦800; ₦200 goes to Roomly in your daily settlement.
 */
export const GatePickupPanel: React.FC = () => {
  const [list, setList] = useState<OrderRecord[]>([]);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(true);
  const [, setTick] = useState(0);
  const me = getCurrentStaff()?.name || '';
  const myUid = getMyUid();
  const hasAccount = Boolean((getCurrentStaff() as any)?.payAccount?.accountNumber);

  useEffect(() => subscribeGatePickups((l: OrderRecord[]) => setList(l)), []);
  // Requests drop off by themselves after 30 minutes with no runner
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const isMine = (gp: any) => gp.status === 'accepted' && (gp.runnerUid ? gp.runnerUid === myUid : gp.runnerName === me);

  // Paid orders from the last 2 days: new requests I haven't turned down, and accepted ones in progress
  const cutoff = Date.now() - 2 * 86400000;
  const shown = list.filter((o) => {
    const gp: any = o.gatePickup;
    if (!gp || o.paymentStatus === 'unpaid' || Date.parse(o.createdAt) <= cutoff) return false;
    if (gp.status === 'pending') return !gateExpired(gp) && !(gp.refusedBy || []).includes(myUid);
    return gp.status === 'accepted';
  });

  const act = async (o: OrderRecord, action: Action) => {
    setBusy(o.id);
    const res = await updateGatePickup(o.id, action);
    if (!res) window.alert('Could not update. Check your connection and try again.');
    setBusy('');
  };

  const fee = `₦${GATE_PICKUP_FEE.toLocaleString()}`;
  const btn = 'py-2 rounded-xl font-bold disabled:opacity-40 cursor-pointer';

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
            const gp: any = o.gatePickup!;
            const mine = isMine(gp);
            const part = o.cart === 'food' ? o.foodStatus : o.storeStatus;
            const tag =
              gp.status === 'pending' ? 'New' : !gp.paid ? 'Waiting for payment' : !gp.payConfirmed ? 'Check your account' : 'Paid · go to the gate';
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
                  <span className="font-bold whitespace-nowrap">{tag}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                </p>

                {gp.status === 'pending' && (
                  <>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Flat {fee}: you keep ₦{(GATE_PICKUP_FEE - GATE_PICKUP_ROOMLY).toLocaleString()}, ₦{GATE_PICKUP_ROOMLY.toLocaleString()} goes to Roomly
                      in your settlement. Check the items first. Once you accept, the pickup is yours to deliver.
                    </p>
                    {!hasAccount && (
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Save your bank account first. The student pays you directly into it.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={busy === o.id || !hasAccount} onClick={() => act(o, 'accept')} className={`${btn} bg-[#0e9f55] text-white`}>
                        Accept
                      </button>
                      <button type="button" disabled={busy === o.id} onClick={() => act(o, 'refuse')} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                        I can't take it
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">"I can't take it" only hides it from you. Other runners still see it.</p>
                  </>
                )}

                {gp.status === 'accepted' && !mine && <p className="text-[11px] text-slate-500">Accepted by {gp.runnerName}.</p>}

                {mine && (
                  <>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {!gp.paid ? (
                        <strong className="text-amber-700 dark:text-amber-300">Waiting for the student to pay {fee} into your account.</strong>
                      ) : !gp.payConfirmed ? (
                        <strong className="text-amber-700 dark:text-amber-300">
                          The student says they paid {fee}. Check your account, then confirm before you go to the gate.
                        </strong>
                      ) : (
                        <strong className="text-[#0e9f55]">Payment confirmed. Collect it from the gate and bring it to {shortLocation(o)}.</strong>
                      )}
                    </p>
                    {gp.paid && !gp.payConfirmed && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => {
                          if (window.confirm(`Confirm that ${fee} from ${o.name} reached your account?`)) act(o, 'confirm');
                        }}
                        className={`${btn} w-full bg-amber-500 text-white`}
                      >
                        Confirm {fee} received
                      </button>
                    )}
                    {gp.payConfirmed && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => {
                          if (window.confirm(`Brought ${o.name}'s parcel to ${shortLocation(o)}?`)) act(o, 'delivered');
                        }}
                        className={`${btn} w-full bg-[#0e9f55] text-white`}
                      >
                        Brought to room
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => {
                        const msg = gp.paid
                          ? `Can't do this pickup after all?\n\nSend the ${fee} back to ${o.name} yourself. The pickup goes back to the other runners.`
                          : `Can't do this pickup after all? It goes back to the other runners.`;
                        if (window.confirm(msg)) act(o, 'release');
                      }}
                      className={`${btn} w-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300`}
                    >
                      {gp.paid ? `Refund ${fee} and hand it back` : "I can't do it, hand it back"}
                    </button>
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
