import React, { useEffect, useState } from 'react';
import { Ticket, X } from 'lucide-react';
import { getMyCredits, timeLeft, type Credit } from '../credits';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const dt = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Small pill: shows "Credits" or the balance. Opens the credits panel. */
export const CreditsPill: React.FC<{ phone?: string; onOpenGames?: () => void; inGames?: boolean }> = ({ phone, onOpenGames, inGames }) => {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Credit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (!phone) return;
    let live = true;
    getMyCredits(phone)
      .then((l) => live && (setList(l), setLoaded(true)))
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [phone, open]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  if (!phone) return null;
  const now = tick;
  const live = list.filter((c) => c.status === 'active' && Number(c.expiresAtMs) > now);
  const balance = live.filter((c) => Number(c.validFromMs) <= now).reduce((t, c) => t + Number(c.value || 0), 0);
  const history = list.filter((c) => !live.includes(c));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
      >
        <Ticket className="w-3.5 h-3.5" /> {loaded && balance > 0 ? `Credits ${naira(balance)}` : 'Credits'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Your Games credits</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {live.length === 0 ? (
              <p className="text-sm text-slate-500">You have no credit right now. Win a weekly reward on the Games tables to earn a food credit.</p>
            ) : (
              <div className="space-y-2">
                {live.map((c) => {
                  const locked = Number(c.validFromMs) > now;
                  return (
                    <div key={c.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{naira(Number(c.value))} food credit</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {locked ? `Held until ${dt(Number(c.validFromMs))} while results are checked. Then you have 24 hours.` : `Order before it expires: ${timeLeft(Number(c.expiresAtMs) - now)} left.`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-black text-slate-900 dark:text-white text-sm">How it works</p>
              <p>Finish in the top 3 of a game's reward week with at least the minimum points set for that game and a credit is issued when the week closes. It opens straight away if all your matches are confirmed, otherwise after a short check of up to 24 hours.</p>
              <p>It works on Outside Food and Canteen Items, toward a full plate of food. Tick "Use my Games credit" at checkout. You still pay delivery.</p>
              <p>Your order must be placed before the credit expires.</p>
            </div>
            {history.length > 0 && (
              <div className="space-y-1">
                <p className="font-black text-slate-900 dark:text-white text-sm">History</p>
                {history.slice(0, 10).map((c) => (
                  <p key={c.id} className="text-xs text-slate-500">
                    {naira(Number(c.value))}: {c.status === 'used' ? 'Used' : c.status === 'void' ? 'Cancelled' : 'Expired'}
                  </p>
                ))}
              </div>
            )}
            {!inGames && onOpenGames && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenGames();
                }}
                className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer"
              >
                Go to Games
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
