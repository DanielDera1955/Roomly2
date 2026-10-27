import React, { useEffect, useState } from 'react';
import {
  subscribeMyTodaySummary,
  subscribeMyOpenSettlements,
  sendSettlement,
  subscribeOpenSettlements,
  adminConfirmSettlement,
  savePayAccount,
  getCurrentStaff,
  isOverdue,
  clearMyDay,
  objectToCart,
  isDoneForToday,
} from '../api.js';
import { STORE_CONFIG, SETTLE_BY_HOUR, RUNNER_SHARE, GATE_PICKUP_ROOMLY, EXPRESS_ROOMLY_SHARE } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const dayText = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const deadlineText = (d: string) => {
  const due = new Date(d + 'T00:00:00');
  due.setDate(due.getDate() + 1);
  return `${SETTLE_BY_HOUR}am ${due.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

/** One open day: the carts with their maths, objections, All cleared, then "I have sent" */
const OpenDay: React.FC<{ d: any }> = ({ d }) => {
  const remaining = Math.max(0, Math.round((d.due || 0) - (d.sentTotal || 0)));
  const [amount, setAmount] = useState(String(remaining || ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCarts, setShowCarts] = useState(false);
  const overdue = isOverdue([d.date]);
  const objections = d.objections || {};
  const openObj = Object.values(objections).filter((x: any) => x && x.status === 'open').length;
  const carts: any[] = d.carts || [];

  useEffect(() => setAmount(String(remaining || '')), [remaining]);

  const run = async (f: () => Promise<any>) => {
    setBusy(true);
    try {
      await f();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save. Try again.');
    }
    setBusy(false);
  };

  const object = (orderId: string) => {
    const reason = window.prompt('Why is this cart wrong? (e.g. price changed, item out of stock)');
    if (reason && reason.trim()) run(() => objectToCart(d.id, orderId, reason));
  };

  return (
    <div className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{dayText(d.date)}</p>
          <p className="text-[11px] text-slate-500">
            {carts.length || d.orders || 0} cart(s) · {overdue ? 'Overdue: you are hidden from checkout until Roomly confirms' : `Clear before ${deadlineText(d.date)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-extrabold text-amber-700 dark:text-amber-300">{naira(d.due)}</p>
          <p className="text-[10px] text-slate-400">owed</p>
        </div>
      </div>

      {carts.length > 0 && (
        <button type="button" onClick={() => setShowCarts(!showCarts)} className="text-[11px] font-bold text-[#0e9f55] cursor-pointer">
          {showCarts ? 'Hide carts' : `See the ${carts.length} cart(s) and the maths`}
          {openObj ? ` · ${openObj} objection(s) open` : ''}
        </button>
      )}
      {showCarts && (
        <div className="space-y-2">
          {carts.map((c) => {
            const ob = objections[c.orderId];
            // Operators: what they keep is their cost + ₦600 delivery. Older records only saved the total.
            const isOp = d.kind !== 'runner' && !c.gate;
            const delivery = isOp ? (c.delivery ?? 600) : 0;
            const cost = isOp ? (c.cost ?? Math.max(0, (c.keep || 0) - delivery)) : 0;
            return (
              <div key={c.orderId} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 space-y-1">
                <p className="font-bold text-slate-900 dark:text-white truncate">{c.customer || c.orderId}</p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid</span>
                  <span className="font-mono">{naira(c.paid)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{isOp ? `Your cost ${naira(cost)} + ${naira(delivery)} delivery` : 'You keep'}</span>
                  <span className="font-mono">{naira(c.keep)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-bold">Owed to Roomly</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">{naira(c.owed)}</span>
                </div>
                {ob ? (
                  <p className={`text-[11px] ${ob.status === 'open' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
                    Your objection: {ob.reason}.{' '}
                    {ob.status === 'open' ? 'Waiting for Roomly.' : `Roomly ${ob.status === 'corrected' ? 'corrected it' : 'kept the amount'}${ob.reply ? `: ${ob.reply}` : ''}.`}
                  </p>
                ) : (
                  !d.cleared && (
                    <button type="button" disabled={busy} onClick={() => object(c.orderId)} className="text-[11px] font-bold text-rose-600 cursor-pointer">
                      Object to this cart
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {!d.cleared ? (
        <button
          type="button"
          disabled={busy || openObj > 0}
          onClick={() => run(() => clearMyDay(d.id))}
          className="w-full py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold disabled:opacity-40 cursor-pointer"
        >
          {openObj > 0 ? 'All cleared (locked while an objection is open)' : 'All cleared: the amounts are right'}
        </button>
      ) : (
        <p className="text-[11px] font-bold text-[#0e9f55]">You cleared this day. Now send the money and tap "I have sent".</p>
      )}

      {(d.payments || []).length > 0 && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          {(d.payments || []).map((p: any, i: number) => (
            <p key={i}>
              Sent {naira(p.amount)}
              {p.note ? `: ${p.note}` : ''}
            </p>
          ))}
          <p className="font-semibold">
            {d.confirmed > 0 ? `Roomly confirmed ${naira(d.confirmed)}. ` : 'Waiting for Roomly to confirm. '}
            {remaining > 0 ? `${naira(remaining)} still to send.` : ''}
          </p>
        </div>
      )}
      {d.cleared && remaining > 0 && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} placeholder="Amount" />
            <button
              type="button"
              disabled={busy || !Number(amount)}
              onClick={() =>
                run(async () => {
                  await sendSettlement(d.id, Number(amount), note);
                  setNote('');
                })
              }
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
            >
              I have sent
            </button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={input} placeholder="Note (e.g. part payment, rest by 9am)" />
        </div>
      )}
    </div>
  );
};

/** Runners and operators: today's statement (runners) and the days they still need to clear */
/**
 * placement: the portal renders this twice, under the overview ('top') and below orders ('bottom').
 * It shows at the top when a past day is still unsettled, or when today owes money and the person is done
 * for the day (last batch switched OFF, or 10pm runners / 8pm operators). Otherwise it shows at the bottom.
 */
export const ProviderSettlement: React.FC<{ kind: 'runner' | 'operator'; placement?: 'top' | 'bottom' }> = ({ kind, placement }) => {
  const [today, setToday] = useState<any | null>(null);
  const [open, setOpen] = useState<any[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => subscribeMyTodaySummary(setToday), []);
  useEffect(() => subscribeMyOpenSettlements(setOpen), []);
  // Re-check when a switch changes and every minute, so it comes up at the cut-off time by itself
  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    const id = window.setInterval(h, 60000);
    return () => {
      window.removeEventListener('roomly-batches', h);
      window.clearInterval(id);
    };
  }, []);
  const owing = open.filter((d) => (d.due || 0) > 0 || (d.sentTotal || 0) > 0);
  const bank = STORE_CONFIG.bankDetails;

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const left = (d: any) => Math.max(0, Math.round((d.due || 0) - (d.sentTotal || 0)));
  const pastOpen = owing.some((d) => d.date < todayKey);
  const todayLeft = owing.filter((d) => d.date === todayKey).reduce((t, d) => t + left(d), 0);
  const doneToday = todayLeft > 0 && isDoneForToday(now);
  const atTop = pastOpen || doneToday;
  if (placement && (placement === 'top') !== atTop) return null;

  return (
    <div className={`${card} ${atTop && placement === 'top' ? 'ring-2 ring-amber-400 dark:ring-amber-600' : ''}`}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Money: today and settlement</p>

      {doneToday && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 leading-snug">
          <p className="font-black">You're done for today. Settle {naira(todayLeft)} before {SETTLE_BY_HOUR}am tomorrow.</p>
          <p className="font-semibold">
            If you don't, students won't see you at checkout from {SETTLE_BY_HOUR}am until Roomly confirms your payment. Check the carts below, tap All cleared, send the money, then tap "I have sent".
          </p>
        </div>
      )}

      {/* Today's totals live in the Overview above; helpers still need to know what to hand over */}
      {kind === 'runner' && today?.owedToHelpers > 0 && (
        <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300">Hand {naira(today.owedToHelpers)} to your helper(s) today.</p>
      )}

      {/* Gate pickups and express runs are settled on their own lines */}
      {kind === 'runner' && (today?.gatePickups > 0 || today?.expressOrders > 0 || today?.expressRefunds > 0) && (
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
          {today?.gatePickups > 0 && (
            <p className="flex justify-between">
              <span>Gate pickups: {today.gatePickups} × ₦{GATE_PICKUP_ROOMLY.toLocaleString()} to Roomly</span>
              <strong>{naira(today.gateOwed)}</strong>
            </p>
          )}
          {today?.expressOrders > 0 && (
            <p className="flex justify-between">
              <span>Express runs: {today.expressOrders} × ₦{EXPRESS_ROOMLY_SHARE.toLocaleString()} to Roomly</span>
              <strong>{naira(today.expressOwed)}</strong>
            </p>
          )}
          {today?.expressRefunds > 0 && (
            <p className="flex justify-between">
              <span>Late express refunds you paid to students (doesn't change what you owe)</span>
              <strong>{naira(today.expressRefunds)}</strong>
            </p>
          )}
        </div>
      )}

      <div className="text-[11px] text-slate-600 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        Send what you owe to <strong>{bank.bankName} · {bank.accountNumber}</strong> ({bank.accountName}) before {SETTLE_BY_HOUR}am the next
        morning. First check each day's carts and tap All cleared (or object to a cart), then send and tap "I have sent". Part
        payments are fine; add a note.
      </div>

      {owing.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing to clear. Days with no orders need nothing.</p>
      ) : (
        owing.map((d) => <OpenDay key={d.id} d={d} />)
      )}
      {today?.estimated && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">Some amounts are estimated because an item has no cost price yet.</p>
      )}
    </div>
  );
};

/** Runners and operators: the account students pay into */
export const PayAccountForm: React.FC = () => {
  const staff = getCurrentStaff();
  const cur = staff?.payAccount;
  const [editing, setEditing] = useState(!cur);
  const [bankName, setBank] = useState(cur?.bankName || '');
  const [accountNumber, setNumber] = useState(cur?.accountNumber || '');
  const [accountName, setName] = useState(cur?.accountName || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await savePayAccount({ bankName, accountNumber, accountName });
      setEditing(false);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Where students pay you</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-bold text-[#0e9f55] cursor-pointer">
            Change
          </button>
        )}
      </div>
      {!editing && cur ? (
        <p className="text-xs">
          {cur.bankName} · <strong>{cur.accountNumber}</strong> · {cur.accountName}
        </p>
      ) : (
        <div className="space-y-1.5">
          <input value={bankName} onChange={(e) => setBank(e.target.value)} className={input} placeholder="Bank name, e.g. Opay" />
          <input
            value={accountNumber}
            inputMode="numeric"
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className={input}
            placeholder="10-digit account number"
          />
          <input value={accountName} onChange={(e) => setName(e.target.value)} className={input} placeholder="Account name" />
          <button type="button" disabled={busy} onClick={save} className="w-full py-2 rounded-lg bg-[#0e9f55] text-white text-xs font-bold disabled:opacity-40 cursor-pointer">
            Save account
          </button>
          <p className="text-[11px] text-slate-400">
            Students on your orders see this account. Until you add one, they see Roomly's account. Runners: after saving, switch your batch off and on once so new orders pick it up.
          </p>
        </div>
      )}
    </div>
  );
};

/** Admin: every open day on one screen. Confirm what arrived, or mark settled if paid outside the app. */
export const AdminSettlementsPanel: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => subscribeOpenSettlements(setList), []);

  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const rows = list.filter((d) => (d.due || 0) > 0 || (d.sentTotal || 0) > 0);
  const totalOpen = rows.reduce((t, d) => t + Math.max(0, (d.due || 0) - (d.confirmed || 0)), 0);

  const act = async (d: any, override: boolean) => {
    const amt = override ? 0 : Number(amounts[d.id] ?? Math.max(0, (d.sentTotal || 0) - (d.confirmed || 0)));
    if (!override && !(amt > 0)) {
      window.alert('Enter the amount you received.');
      return;
    }
    if (override && !window.confirm(`Mark ${d.name}'s ${dayText(d.date)} as settled? Use this when they paid you outside the app.`)) return;
    setBusy(d.id);
    try {
      await adminConfirmSettlement(d.id, amt, override);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Daily settlement</p>
        <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{naira(totalOpen)} open</span>
      </div>
      {rows.length === 0 && <p className="text-xs text-slate-400">Everyone is settled.</p>}
      {rows.map((d) => {
        const overdue = isOverdue([d.date]);
        const unconfirmed = Math.max(0, (d.sentTotal || 0) - (d.confirmed || 0));
        return (
          <div
            key={d.id}
            className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white">
                  {d.name || 'Provider'} <span className="font-normal text-slate-500">· {d.kind === 'runner' ? 'Runner' : d.kind === 'food' ? 'Food' : 'Store'}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {dayText(d.date)}
                  {d.date === ymd ? ' (today, still open)' : ''} · {d.orders || 0} order(s)
                  {d.sharedOrders ? ` · ${d.sharedOrders} shared` : ''}
                  {overdue ? ' · OVERDUE, hidden from checkout' : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold">{naira(d.due)}</p>
                <p className="text-[10px] text-slate-400">
                  sent {naira(d.sentTotal)} · confirmed {naira(d.confirmed)}
                </p>
              </div>
            </div>
            {(d.payments || []).map((p: any, i: number) => (
              <p key={i} className="text-[11px] text-slate-500">
                {naira(p.amount)}
                {p.note ? `: ${p.note}` : ''}
              </p>
            ))}
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={amounts[d.id] ?? String(unconfirmed || '')}
                onChange={(e) => setAmounts((a) => ({ ...a, [d.id]: e.target.value }))}
                className={input}
                placeholder="Amount received"
              />
              <button
                type="button"
                disabled={busy === d.id}
                onClick={() => act(d, false)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
              >
                Confirm
              </button>
            </div>
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => act(d, true)}
              className="w-full py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
            >
              Mark settled (paid outside the app)
            </button>
          </div>
        );
      })}
    </div>
  );
};
