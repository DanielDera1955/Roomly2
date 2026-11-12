import React, { useEffect, useRef, useState } from 'react';
import { outOfStockSummary } from '../config';
import {
  getRunners,
  startPackagingOrder,
  confirmPayment,
  markPaymentNotReceived,
  updatePartStatus,
  moveOrderToNextDay,
  addPackagePhoto,
  contactPhoneFor,
  isRoomlyOrder,
  roomlyPayoutOf,
  waNumber,
  recordRefund,
  vendorBreakdownOf,
} from '../api.js';
import { OrderRecord, locationText } from '../types';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const btn = 'px-3 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const primary = `${btn} bg-[#0e9f55] text-white`;
const plain = `${btn} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100`;

/** What Roomly pays out for this order: shown to the admin and to the runner it is assigned to */
export const RoomlyPayoutLine: React.FC<{ order: OrderRecord; who: 'runner' | 'admin' }> = ({ order, who }) => {
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    let live = true;
    roomlyPayoutOf(order)
      .then((r: any) => live && setP(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [order.id, order.items?.length]);
  if (!p) return null;
  const outside = order.cart === 'store' || order.cart === 'food';
  // Outside: transport is paid once per batch, so each order shows items only
  if (outside && who === 'admin')
    return (
      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        Items for the store {naira(p.items)}
        {p.estimated ? ' est.' : ''}
      </p>
    );
  return (
    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
      {who === 'runner' ? "You'll receive" : outside ? 'Pay the store' : 'Pay the runner'} {naira(p.amount)}
      <span className="font-normal text-slate-500 dark:text-slate-400">
        {' '}
        (items {naira(p.items)}{p.estimated ? ' est.' : ''} + {outside ? 'transport' : 'delivery'} {naira(p.delivery)})
        {who === 'runner' ? '. The student paid Roomly, so collect nothing from them.' : ''}
      </span>
    </p>
  );
};

/** Refunds Roomly has recorded on this order, and a button to add one */
const RefundRow: React.FC<{ o: OrderRecord }> = ({ o }) => {
  const [busy, setBusy] = useState(false);
  const refunds: any[] = (o as any).refunds || [];
  const total = refunds.reduce((t, r) => t + (r.amount || 0), 0);
  const add = async () => {
    const amt = window.prompt(`Amount refunded to ${o.name} (₦)?\n\nSend the money first: Paystack dashboard > Transactions > this payment > Refund.`, '');
    if (amt === null) return;
    const reason = window.prompt('Reason (shown to the student), e.g. "Out of stock: 1x Peak milk"', '') || '';
    const cancel = Number(amt) >= (o.totalAmount || 0) && window.confirm('That is the whole order. Cancel the order too?');
    setBusy(true);
    try {
      await recordRefund(o.id, amt, reason, cancel);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save the refund.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-rose-600">{total > 0 ? `Refunded ${naira(total)} (${refunds.map((r) => r.reason).filter(Boolean).join('; ') || 'no reason'})` : ''}</span>
      <button type="button" disabled={busy} onClick={add} className="text-slate-500 underline cursor-pointer shrink-0">
        {busy ? 'Saving...' : 'Record refund'}
      </button>
    </div>
  );
};

let runnerCache: any[] | null = null;

/** Admin actions on an order Roomly collected: confirm a manual transfer, assign a runner, or run an outside order */
export const AdminOrderActions: React.FC<{ o: OrderRecord }> = ({ o }) => {
  const [runners, setRunners] = useState<any[]>(runnerCache || []);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [vb, setVb] = useState<any>(null);

  const outside = o.cart === 'store' || o.cart === 'food';
  const kind = o.cart === 'food' ? 'food' : 'store';
  // The vendor's own prices for each line, for the WhatsApp message
  useEffect(() => {
    if (!outside) return;
    let live = true;
    vendorBreakdownOf(o)
      .then((r: any) => live && setVb(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [o.id, o.items?.length, outside]);
  useEffect(() => {
    if (outside || runnerCache) return;
    getRunners()
      .then((r: any[]) => {
        runnerCache = r || [];
        setRunners(runnerCache);
      })
      .catch(() => {});
  }, [outside]);

  if (!isRoomlyOrder(o) || o.status === 'Cancelled') return null;

  const run = async (key: string, fn: () => Promise<any>, ask = '') => {
    if (ask && !window.confirm(ask)) return;
    setBusy(key);
    try {
      const r = await fn();
      if (r === null) window.alert('That did not save. Check your connection and try again.');
    } catch (e: any) {
      window.alert(e?.message || 'Something went wrong.');
    } finally {
      setBusy('');
    }
  };

  // Manual mode (Paystack down): the student says they paid Roomly's account
  if (o.paymentStatus === 'payment_sent' && !o.paymentNotReceived) {
    return (
      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2">
        <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
          Student says they sent {naira(o.totalAmount)} to Roomly's account. Check your bank app.
        </p>
        <div className="flex gap-1.5">
          <button type="button" disabled={!!busy} className={primary} onClick={() => run('confirm', () => confirmPayment(o.id, 'Roomly'))}>
            Money received
          </button>
          <button
            type="button"
            disabled={!!busy}
            className={plain}
            onClick={() => run('notpaid', () => markPaymentNotReceived(o.id, 'Roomly'), 'Mark as not received? The student will see it was not paid.')}
          >
            Not received
          </button>
        </div>
      </div>
    );
  }
  if (o.paymentStatus !== 'payment_confirmed') return null;

  const done = o.status === 'Delivered';
  const header = <RoomlyPayoutLine order={o} who="admin" />;

  if (!outside) {
    const side = (o as any).hostelSide || 'boys';
    const list = runners.filter((r) => !r.hostelSide || r.hostelSide === side);
    const assigned = Boolean(o.runnerId);
    const assign = () => {
      const r = list.find((x) => x.id === pick);
      if (!r) return;
      run('assign', () => startPackagingOrder(o.id, r.id, r.name, r.phone || ''));
      setPick('');
    };
    return (
      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
        {header}
        {assigned && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            Assigned to <strong>{o.runnerName}</strong>
            {(o as any).runnerPhone && (
              <>
                {' · '}
                <a className="text-[#0e9f55] font-bold" href={`tel:${(o as any).runnerPhone}`}>
                  Call
                </a>
              </>
            )}
          </p>
        )}
        {!done && o.status !== 'On the way' && (
          <div className="flex gap-1.5">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            >
              <option value="">{assigned ? 'Change runner...' : 'Choose a runner...'}</option>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!pick || !!busy} className={primary} onClick={assign}>
              {busy === 'assign' ? 'Saving...' : assigned ? 'Reassign' : 'Assign'}
            </button>
          </div>
        )}
        {!assigned && !done && <p className="text-[11px] text-slate-500">Call the runner first, then assign. They'll see it in their portal.</p>}
        <RefundRow o={o} />
      </div>
    );
  }

  // Outside: the admin relays the order to the store and runs it to the gate
  const storePhone = contactPhoneFor(o);
  const lineText = (l: any, n: number) => {
    const head = l.isFood
      ? `${n}) ${l.plates > 0 ? `${l.name} x ${l.plates} ${l.plates === 1 ? 'plate' : 'plates'}` : `${l.name}, extras only`}`
      : `${n}) ${l.name} x ${l.quantity}${l.unitCost ? `: ${naira(l.unitCost * l.quantity)}` : ''}`;
    const rows = [head];
    if (l.isFood && l.plates > 0) rows.push(`   - Plates: ${l.plateCost ? `${naira(l.plateCost)} x ${l.plates} = ${naira(l.plateCost * l.plates)}` : l.plates}`);
    l.options.forEach((e: any) => {
      const q = e.quantity * (l.quantity || 1);
      rows.push(`   - ${e.name}${q > 1 ? ` x ${q}` : ''}${typeof e.cost === 'number' && e.cost > 0 ? `: ${naira(e.cost)}${q > 1 ? ` x ${q} = ${naira(e.cost * q)}` : ''}` : ''}`);
    });
    if (l.note) rows.push(`   - Note: ${l.note}`);
    return rows.join('\n');
  };
  const when = (o as any).deliveryDate
    ? `${new Date((o as any).deliveryDate + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}, ${o.deliveryTime || ''}`
    : o.deliveryTime || '';
  const msg = [
    `New Roomly order: ${o.id}`,
    when ? `For: ${when}` : '',
    '',
    ...(vb ? vb.lines.map((l: any, k: number) => lineText(l, k + 1)) : (o.items || []).map((i: any) => `- ${i.quantity}x ${i.name}`)),
    o.outOfStock ? outOfStockSummary(o) : '',
    '',
    vb && vb.items > 0 ? `Items total: ${naira(vb.items)}${vb.estimated ? ' (estimate, please confirm)' : ''}` : '',
    `Customer: ${o.name}, ${locationText(o)}`,
    'Please pack it and send me a photo before sending to the gate.',
  ]
    .filter((x, k, a) => x !== '' || (k > 0 && a[k - 1] !== ''))
    .join('\n');
  const wa = `https://wa.me/${storePhone ? waNumber(storePhone) : ''}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
      {header}
      {o.packPhoto && (
        <a href={o.packPhoto} target="_blank" rel="noopener noreferrer" className="block">
          <img src={o.packPhoto} alt="Packed order" className="w-full max-h-40 object-cover rounded-lg" />
        </a>
      )}
      {done ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] text-slate-500 mr-1">Sent to the gate.</p>
          <a href={wa} target="_blank" rel="noopener noreferrer" className={plain}>
            Resend to {o.operatorName || 'store'}
          </a>
          {/* A photo can still be added after delivery: it helps the student find the package at the gate */}
          <button type="button" disabled={!!busy} className={plain} onClick={() => fileRef.current?.click()}>
            {busy === 'photo' ? 'Uploading...' : o.packPhoto ? 'Change photo' : 'Add packed photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) run('photo', () => addPackagePhoto(o.id, f));
            }}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <a href={wa} target="_blank" rel="noopener noreferrer" className={primary}>
            Send to {o.operatorName || 'store'} on WhatsApp
          </a>
          <button type="button" disabled={!!busy} className={plain} onClick={() => fileRef.current?.click()}>
            {busy === 'photo' ? 'Uploading...' : o.packPhoto ? 'Change photo' : 'Add packed photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) run('photo', () => addPackagePhoto(o.id, f));
            }}
          />
          <button
            type="button"
            disabled={!!busy}
            className={primary}
            onClick={() => {
              // An order for a later day must not be closed early: it would leave Payments Confirmed before it is delivered
              const forDay = (o as any).deliveryDate || '';
              const now = new Date();
              const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const early = forDay && forDay > today;
              const ask = early
                ? `This order is for ${new Date(forDay + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}, not today. Mark it as sent to the gate NOW anyway? It will move to Completed.`
                : 'Mark as sent to the gate? The student sees it will arrive in under 15 minutes.';
              run('gate', () => updatePartStatus(o.id, kind, 'sent', 'Roomly'), ask);
            }}
          >
            Sent to gate
          </button>
          <button
            type="button"
            disabled={!!busy}
            className={plain}
            onClick={() => run('move', () => moveOrderToNextDay(o.id), 'Move this order to tomorrow? The student will be told.')}
          >
            Move to tomorrow
          </button>
        </div>
      )}
      {!storePhone && !done && <p className="text-[11px] text-slate-500">No store on this order yet: WhatsApp opens without a contact, so pick the store yourself.</p>}
      <RefundRow o={o} />
    </div>
  );
};
