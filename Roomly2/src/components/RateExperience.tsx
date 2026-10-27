import React, { useEffect, useState } from 'react';
import { getRating, submitRating, providerOf, sendMessage } from '../api.js';
import { RATING_REASONS, RATING_GOOD, ratingScore } from '../config';
import { OrderRecord } from '../types';

/**
 * After delivery: the student ticks what happened (one or more), and can always add a note.
 * It goes straight to Roomly, and the note is also posted in this order's chat so the runner or operator sees it.
 * A hidden score (as expected = 5, each problem lowers it) keeps the runner and operator ratings working.
 */
export const RateExperience: React.FC<{ order: OrderRecord }> = ({ order }) => {
  const [done, setDone] = useState<any | null | undefined>(undefined); // undefined = checking
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const who = providerOf(order).name;
  const outside = order.cart === 'store' || order.cart === 'food';

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
        Thanks for your feedback on this order. It helps us keep the service good.
      </div>
    );
  }

  const toggle = (r: string) =>
    setReasons((list) => {
      if (list.includes(r)) return list.filter((x) => x !== r);
      // "Arrived as expected" doesn't go with a problem
      if (r === RATING_GOOD) return [RATING_GOOD];
      return [...list.filter((x) => x !== RATING_GOOD), r];
    });

  const needsNote = reasons.includes('Other') && !comment.trim();

  const send = async () => {
    if (!reasons.length) return window.alert('Tick at least one option.');
    if (needsNote) return window.alert('Tell us what happened in a few words.');
    setBusy(true);
    try {
      await submitRating(order, ratingScore(reasons), reasons, comment);
      // Problems and notes also go into the order chat, so the runner or operator and Roomly see them in one place
      const note = comment.trim();
      const problems = reasons.filter((r) => r !== RATING_GOOD);
      if (note || problems.length) {
        const text = `Feedback: ${reasons.join(', ')}.${note ? ` ${note}` : ''}`;
        sendMessage(order.id, 'customer', order.name || 'Customer', text).catch(() => {});
      }
      setDone({ reasons });
    } catch (e: any) {
      window.alert(e?.message || 'Could not send. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3 text-xs">
      <div>
        <p className="font-extrabold text-slate-900 dark:text-white">How was this order?</p>
        <p className="text-[11px] text-slate-500">Tick everything that applies for {who}.</p>
      </div>

      <div className="space-y-1.5">
        {RATING_REASONS.map((r) => {
          const on = reasons.includes(r);
          return (
            <label
              key={r}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${
                on ? 'border-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(r)} className="w-4 h-4 accent-[#0e9f55]" />
              <span className={`font-bold ${on ? 'text-[#0e9f55]' : 'text-slate-700 dark:text-slate-200'}`}>{r}</span>
            </label>
          );
        })}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-slate-500 leading-snug">
          Your feedback helps us check that our {outside ? 'operators' : 'runners'} are serving you well, and replace them if they're not.
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder={reasons.includes('Other') ? 'Tell us what happened (needed for Other)' : 'Tell us more (optional)'}
          className={`w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border text-slate-900 dark:text-white placeholder:text-slate-400 ${
            needsNote ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'
          }`}
        />
        <p className="text-[10px] text-slate-400">Your note is also added to this order's chat.</p>
      </div>

      <button
        type="button"
        disabled={busy || !reasons.length || needsNote}
        onClick={send}
        className="w-full py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white font-bold disabled:opacity-50 cursor-pointer"
      >
        {busy ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  );
};
