import React from 'react';
import { ChevronDown, Plus, Check, Timer } from 'lucide-react';

/**
 * Home page: "How Roomly works". Four drawn mini screens (no screenshots, so it stays light on data
 * and never goes out of date), shown until the student's 3rd completed order (App decides).
 */
const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="h-[72px] rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-center px-2">
    {children}
  </div>
);

export const HowRoomlyWorks: React.FC<{ storeOpensMs: number; onStart: () => void; onHub: () => void }> = ({ onStart, onHub }) => {
  const steps: { title: string; note?: string; screen: React.ReactNode }[] = [
    {
      title: 'Pick what you want',
      screen: (
        <div className="w-full flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-2 w-4/5 rounded bg-slate-300 dark:bg-slate-600" />
            <div className="h-2 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <span className="w-6 h-6 rounded-full bg-[#0e9f55] text-white flex items-center justify-center shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </span>
        </div>
      ),
    },
    {
      title: 'Pay and tap "I\'ve paid"',
      screen: (
        <div className="w-full space-y-1.5">
          <div className="h-2 w-3/4 mx-auto rounded bg-slate-300 dark:bg-slate-600" />
          <div className="h-6 rounded-lg bg-[#0e9f55] text-white text-[10px] font-bold flex items-center justify-center">I've paid</div>
        </div>
      ),
    },
    {
      title: 'Your countdown starts',
      screen: (
        <div className="flex items-center gap-1.5 text-[#0b8044] dark:text-emerald-400">
          <Timer className="w-4 h-4" />
          <span className="font-mono tabular-nums text-base font-black">00:45:10</span>
        </div>
      ),
    },
    {
      title: 'Delivered before it hits 0',
      note: 'Outside orders at the gate, canteen orders to your room',
      screen: (
        <div className="flex flex-col items-center gap-1">
          <span className="w-7 h-7 rounded-full bg-[#0e9f55] text-white flex items-center justify-center">
            <Check className="w-4 h-4" />
          </span>
          <span className="text-[10px] font-bold text-[#0b8044] dark:text-emerald-400">Delivered</span>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <div className="px-4 pt-3.5 pb-4">
        <p className="text-sm font-bold text-slate-900 dark:text-white">How Roomly works</p>
        <ol className="mt-3 grid grid-cols-2 gap-2.5">
          {steps.map((s, i) => (
            <li key={s.title} className="min-w-0">
              <Screen>{s.screen}</Screen>
              <p className="mt-1.5 flex gap-1.5 text-xs font-bold text-slate-900 dark:text-white leading-snug">
                <span className="text-[#0e9f55] shrink-0">{i + 1}</span>
                <span className="min-w-0">{s.title}</span>
              </p>
              {s.note && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">{s.note}</p>}
            </li>
          ))}
        </ol>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onStart} className="h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
            Start ordering
          </button>
          <button type="button" onClick={onHub} className="h-11 rounded-xl border border-[#0e9f55] text-[#0e9f55] text-sm font-bold cursor-pointer">
            Hostel Hub
          </button>
        </div>
      </div>
      {/* Runner sign-up: small and always visible, so students who want to earn can find it */}
      <a
        href="#join"
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs font-bold text-[#0b8044] dark:text-[#0e9f55]"
      >
        <span>Earn ₦500 per delivery. Become a Roomly runner</span>
        <ChevronDown className="w-4 h-4 shrink-0 -rotate-90" />
      </a>
    </div>
  );
};
