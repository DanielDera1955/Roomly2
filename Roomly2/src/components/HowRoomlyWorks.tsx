import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Home page, under the four cards: "How you get your order". A folded headline for first-time visitors
 * (App decides how long it shows). Two tabs of plain steps, no screenshots, so it stays light on data
 * and never goes out of date.
 */
const GUARANTEE = 'Any issue with your order is refunded.';

const TABS: { id: 'outside' | 'canteen'; label: string; steps: string[] }[] = [
  {
    id: 'outside',
    label: 'Outside Food and Stores',
    steps: [
      'Order before the batch time stated.',
      'Pay and tap "I\'ve paid". Your countdown starts, and your order is packed with your name or phone number on it.',
      'Track it from your dashboard when it is on its way and when it arrives at the school gate, before the countdown hits zero.',
    ],
  },
  {
    id: 'canteen',
    label: 'Canteen items',
    steps: [
      'Order before the batch time stated.',
      'Pay and tap "I\'ve paid".',
      'Your order is packed by a student runner and brought to your room.',
      'You can track when the runner is on their way to your hostel and when they have arrived at your room, so you know even if you are not there.',
    ],
  },
];

export const HowRoomlyWorks: React.FC<{ storeOpensMs?: number }> = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'outside' | 'canteen'>('outside');
  const current = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">How you get your order</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Simple steps for food, store items and canteen items</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-1.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold border cursor-pointer whitespace-nowrap ${
                  tab === t.id ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ol className="space-y-2.5">
            {current.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-[#0e9f55] text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs font-bold text-[#0b8044] dark:text-emerald-400">{GUARANTEE}</p>
        </div>
      )}
    </div>
  );
};
