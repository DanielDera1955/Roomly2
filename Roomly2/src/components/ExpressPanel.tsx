import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { getMyExpress, setMyExpress, acceptExpress, markExpressRefunded, markExpressArrived, getCurrentStaff } from '../api.js';
import { OrderRecord, shortLocation, expressTiming } from '../types';
import { EXPRESS_FEE, EXPRESS_RUNNER_SHARE, EXPRESS_ROOMLY_SHARE, EXPRESS_REFUND, EXPRESS_MINUTES, EXPRESS_CONFIRM_MINUTES } from '../config';
import { playChime } from '../sound';

const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Runners: express runs (inside school).
 * Switch "Express available" on only when you can deliver anywhere in school right now.
 * Accept a request first ("I can do it now"); the student then pays you and the 20 minutes start.
 */
export const ExpressPanel: React.FC<{ orders: OrderRecord[] }> = ({ orders }) => {
  const me = getCurrentStaff();
  const [on, setOn] = useState(getMyExpress());
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const h = () => setOn(getMyExpress());
    window.addEventListener('roomly-batches', h);
    return () => window.removeEventListener('roomly-batches', h);
  }, []);

  const requests = orders.filter((o) => o.express?.status === 'requested' && o.status !== 'Cancelled');
  const mine = orders.filter(
    (o) =>
      o.express?.status === 'accepted' &&
      o.express.runnerId === me?.email &&
      // still in progress, or finished late and not yet refunded (recent ones only)
      (() => {
        const t = expressTiming(o, now, EXPRESS_CONFIRM_MINUTES * 60000, EXPRESS_MINUTES * 60000);
        if (!t || !t.finished) return o.status !== 'Cancelled';
        return t.late && !o.express!.refunded && Date.parse(o.deliveredAt || '') > now - 2 * 86400000;
      })()
  );

  // A new express request: ring once (only for runners with express on)
  const reqKey = requests.map((o) => o.id).join('|');
  const [lastKey, setLastKey] = useState(reqKey);
  useEffect(() => {
    if (on && reqKey && reqKey !== lastKey && requests.some((o) => !lastKey.includes(o.id))) playChime('order');
    setLastKey(reqKey);
  }, [reqKey]);

  const ticking = mine.length > 0 || requests.length > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const run = async (id: string, f: () => Promise<any>) => {
    setBusy(id);
    try {
      await f();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save. Check your connection and try again.');
    }
    setBusy('');
  };

  const toggle = () =>
    run('switch', async () => {
      if (!on && !window.confirm(`Switch express on? Only do this if you can deliver anywhere in school within ${EXPRESS_MINUTES} minutes of payment.`)) return;
      await setMyExpress(!on);
      setOn(!on);
    });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
          <Zap className="w-4 h-4 text-[#0e9f55]" /> Express ({requests.length} new · {mine.length} mine)
        </span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <div className="text-xs">
              <p className="font-bold text-slate-900 dark:text-white">Express available</p>
              <p className="text-[11px] text-slate-500">
                ₦{EXPRESS_FEE.toLocaleString()} per run: you keep ₦{EXPRESS_RUNNER_SHARE.toLocaleString()}, ₦{EXPRESS_ROOMLY_SHARE.toLocaleString()} goes to
                Roomly. Late (over {EXPRESS_MINUTES} min) means you refund ₦{EXPRESS_REFUND.toLocaleString()}.
              </p>
            </div>
            <button
              type="button"
              disabled={busy === 'switch'}
              onClick={toggle}
              aria-pressed={on}
              className={`shrink-0 w-14 h-8 rounded-full p-1 transition-colors cursor-pointer disabled:opacity-50 ${on ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : ''}`} />
            </button>
          </div>
          {!me?.payAccount?.accountNumber && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Save your bank account first. Express students pay you directly.</p>
          )}

          {/* New requests */}
          {requests.length === 0 ? (
            <p className="text-xs text-slate-400">No express requests right now.</p>
          ) : (
            requests.map((o) => (
              <div key={o.id} className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {o.name} · {shortLocation(o)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>
                  <span className="font-bold whitespace-nowrap">₦{(o.totalAmount || 0).toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-slate-500">Waiting {mmss(now - Date.parse(o.express!.requestedAt))}</p>
                <button
                  type="button"
                  disabled={!on || busy === o.id}
                  onClick={() => run(o.id, () => acceptExpress(o.id))}
                  className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  {on ? 'I can do it now' : 'Switch express on to accept'}
                </button>
              </div>
            ))
          )}

          {/* My express orders: the clock and, if late, the refund */}
          {mine.map((o) => {
            const t = expressTiming(o, now, EXPRESS_CONFIRM_MINUTES * 60000, EXPRESS_MINUTES * 60000);
            const ex = o.express!;
            return (
              <div key={o.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {o.name} · {shortLocation(o)}
                  </p>
                  {t && !t.finished && (
                    <span className={`font-mono font-bold px-2 py-0.5 rounded-md text-white ${t.late ? 'bg-rose-600' : 'bg-[#0e9f55]'}`}>
                      {t.late ? `Late +${mmss(-t.leftMs)}` : mmss(t.leftMs)}
                    </span>
                  )}
                </div>
                {o.paymentStatus === 'unpaid' && <p className="text-[11px] text-slate-500">Accepted. Waiting for the student to pay you. The clock starts when they tap "I've paid".</p>}
                {o.paymentStatus === 'payment_sent' && (
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    The student says they paid. Confirm it in the order card below (you'll be asked the time it arrived).
                  </p>
                )}
                {t?.awaitingReceipt && <p className="text-[11px] text-slate-500">You marked it delivered. Waiting for the student to tap "Received".</p>}
                {/* The student tapped "Not here yet": the clock is running again until you are really there */}
                {t && !t.finished && !t.awaitingReceipt && (ex as any).notHereCount > 0 && o.status === 'Delivered' && (
                  <>
                    <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      {o.name} says you haven't arrived yet. The clock is still running. Tap below once you're at the room.
                    </p>
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => run(o.id, () => markExpressArrived(o.id))}
                      className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      I'm at the room now
                    </button>
                  </>
                )}
                {t?.finished && !t.late && <p className="text-[11px] font-bold text-[#0e9f55]">On time ({Math.max(1, Math.round(t.usedMs / 60000))} min).</p>}
                {t?.finished && t.late && !ex.refunded && (
                  <>
                    <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      Late ({Math.round(t.usedMs / 60000)} min). Send ₦{EXPRESS_REFUND.toLocaleString()} back to {o.name}, then tap below.
                    </p>
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => {
                        if (window.confirm(`Confirm you sent ₦${EXPRESS_REFUND.toLocaleString()} back to ${o.name}?`)) run(o.id, () => markExpressRefunded(o.id));
                      }}
                      className="w-full py-2 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      I've refunded ₦{EXPRESS_REFUND.toLocaleString()}
                    </button>
                  </>
                )}
                <a href={`tel:${o.phone}`} className="inline-block font-bold text-[#0e9f55]">
                  Call {o.name}
                </a>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
