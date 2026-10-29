import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Store and food operators: a short "How Roomly works for you" card at the top of the portal.
 * Open until they tap "Got it" (remembered on this phone), then it shrinks to a small "How it works" bar.
 */
type Step = { title: string; text: string };

const steps = (kind: 'store' | 'food'): Step[] => [
  {
    title: 'Add your payment account',
    text: 'Under "Where students pay you". Students pay you directly, so until it is added they cannot pick you at checkout.',
  },
  {
    title: 'Your products and prices',
    text:
      kind === 'food'
        ? 'In "My products and prices" you can change any price and add dishes. In "Today\'s menu", switch off any dish, swallow or extra you are not cooking that day.'
        : 'In "My products and prices" you can change any price and add products you sell that are not listed. Changes go live at once.',
  },
  {
    title: 'Your days',
    text: 'Today, Tomorrow and the next day are ON by default and run by themselves. Switch a day OFF if you cannot deliver that day, so students do not pay and wait.',
  },
  {
    title: 'When an order comes',
    text: 'Check the money is in your account, then tap Confirm payment (the student sees you are packing). Add a photo of the package so they know what to collect. Tap Order delivered only when it leaves: the student sees a 15-minute countdown to the gate.',
  },
  {
    title: 'If something is out of stock',
    text: 'Follow what the student chose on the order: refund, tomorrow, or a similar item at the same price. Use the Call button if you need them. For a refund, ask for their account and send back what they paid for that item.',
  },
  {
    title: 'How Roomly earns',
    text: 'Your price stays your price. Roomly adds its margin on top, and the student pays you everything plus ₦800 delivery. You keep your price and ₦500 for transport, and send Roomly the rest.',
  },
  {
    title: 'Settle at the end of the day',
    text: 'The settlement section shows each order and what you owe, so no maths needed. Send it and tap All cleared. Not settled by 6am the next morning hides you from checkout until it is.',
  },
];

/** Runners: inside orders to the room, batches, gate pickups and express, 30% of the profit */
const runnerSteps: Step[] = [
  { title: 'Add your payment account', text: 'Students pay you directly. Until your account is added, you cannot take orders.' },
  {
    title: 'Your batches',
    text: 'Switch ON the batches you can deliver. Students see the next open batch and pay into your account. Switch a batch OFF if you cannot make it. All switches turn off by themselves at 10pm.',
  },
  {
    title: 'When an order comes',
    text: 'Check the money is in your account, tap Confirm payment & start packaging, buy and pack the items, tap On the way when you leave, then Delivered at their room.',
  },
  {
    title: 'If something is out of stock',
    text: 'Follow what the student chose on the order: refund, next batch, or a similar item at the same price. Use the Call button if you need them.',
  },
  {
    title: 'Extra ways to earn',
    text: 'Gate pickup: bring an outside order from the gate to a room for ₦1,000, you keep ₦800. Express: ₦1,200, you keep ₦600, refunded to the student if it takes over 20 minutes. Shared deliveries split 50/50.',
  },
  { title: 'Products and requests', text: 'You can change inside prices, add products, and send a price when a student requests something not listed.' },
  {
    title: 'How you earn',
    text: 'You keep what you spent on the items plus 30% of the profit (the item margin plus the delivery fee). The other 70% goes to Roomly.',
  },
  {
    title: 'Settle at the end of the day',
    text: 'The settlement section shows what you owe. Send it and tap All cleared. Not settled by 6am the next morning hides you from checkout until it is.',
  },
];

const key = (kind: string) => `roomly_guide_seen_${kind}`;

export const OperatorGuide: React.FC<{ kind: 'store' | 'food' | 'runner' }> = ({ kind }) => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key(kind)) !== '1';
    } catch {
      return true;
    }
  });

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(key(kind), '1');
    } catch {
      /* fine: it just opens again next time */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-[#0e9f55]" /> How Roomly works for you
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="p-4 rounded-3xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-3">
      <button type="button" onClick={close} className="w-full flex items-center justify-between cursor-pointer">
        <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
          <BookOpen className="w-4 h-4 text-[#0e9f55]" /> How Roomly works for you
        </span>
        <ChevronUp className="w-4 h-4 text-slate-500" />
      </button>
      <ol className="space-y-2.5">
        {(kind === 'runner' ? runnerSteps : steps(kind)).map((s, i) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#0e9f55] text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            <span className="text-xs leading-snug text-slate-700 dark:text-slate-200">
              <strong className="text-slate-900 dark:text-white">{s.title}.</strong> {s.text}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={close} className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer">
        Got it
      </button>
    </div>
  );
};
