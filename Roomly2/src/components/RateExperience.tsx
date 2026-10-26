import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { getRating, submitRating, providerOf } from '../api.js';
import { RATING_REASONS } from '../config';
import { OrderRecord } from '../types';

/**
 * Rate your experience: one quick rating per delivered cart.
 * It goes straight to Roomly, and helps us keep good runners and operators (or change them).
 */
export const RateExperience: React.FC<{ order: OrderRecord }> = ({ order }) => {
  const [done, setDone] = useState<any | null | undefined>(undefined); // undefined = checking
  const [score, setScore] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const who = providerOf(order).name;

  useEffect(() => {
    let live = true;
    setDone(undefined);
    getRating(order.id).then((r: any) => live && setDone(r));
    return () => {
      live = false;
    };
  }, [order.id]);

  if (done === undefined) return null;

  if (done) {
    return (
      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
        Thanks for rating this order ({done.score}/5). It helps us keep the service good.
      </div>
    );
  }

  const toggle = (r: string) =>
    setReasons((list) => {
      if (list.includes(r)) return list.filter((x) => x !== r);
      // "All good" doesn't go with a complaint
      if (r === 'All good') return ['All good'];
      return [...list.filter((x) => x !== 'All good'), r];
    });

  const send = async () => {
    setBusy(true);
    try {
      await submitRating(order, score, reasons, comment);
      setDone({ score });
    } catch (e: any) {
      window.alert(e?.message || 'Could not send. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3 text-xs">
      <div>
        <p className="font-extrabold text-slate-900 dark:text-white">Rate your experience</p>
        <p className="text-[11px] text-slate-500">
          How did {who} do? It goes straight to Roomly so we know our {order.cart === 'store' || order.cart === 'food' ? 'operators' : 'runners'} are serving
          you well, or change them if they're not.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setScore(n);
              if (n >= 4 && reasons.length === 0) setReasons(['All good']);
            }}
            aria-label={`${n} out of 5`}
            className="p-1 cursor-pointer"
          >
            <Star className={`w-7 h-7 ${n <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
          </button>
        ))}
      </div>

      {score > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {RATING_REASONS.map((r) => {
              const on = reasons.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-bold cursor-pointer ${
                    on ? 'border-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55]' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
          {(reasons.includes('Other') || score <= 3) && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder={reasons.includes('Other') ? 'Tell us what happened' : 'Anything else? (optional)'}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="w-full py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white font-bold disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Sending…' : 'Send rating'}
          </button>
        </>
      )}
    </div>
  );
};
