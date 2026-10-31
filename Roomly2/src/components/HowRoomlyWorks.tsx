import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

/**
 * Home page: "New here? How Roomly works". Folded so it never pushes the products down;
 * shows a small "New here?" label until the student has opened it once.
 */
export const HowRoomlyWorks: React.FC<{ storeOpensMs: number; onStart: () => void; onHub: () => void }> = ({ storeOpensMs, onStart, onHub }) => {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem('roomly_seen_guide') === '1';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    if (!seen) {
      setSeen(true);
      try {
        localStorage.setItem('roomly_seen_guide', '1');
      } catch {}
    }
  };
  const storeOpen = Date.now() >= storeOpensMs;
  const d = new Date(storeOpensMs);
  const opens = `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })}`;

  const points: { title: string; lines: string[] }[] = [
    {
      title: 'Order inside school',
      lines: [
        'Store items and canteen food, brought to your room by a Roomly runner.',
        "Orders go out in batches: 3 a day from Sunday to Friday, and 4 on Saturday. You see the next batch time at checkout, so it's never long until the next one.",
      ],
    },
    {
      title: 'Order from outside school',
      lines: [
        'Cooked food, foodstuffs and everyday items from outside school, delivered to the school gate. Order before 5:10pm to get it the same day.',
        'You can track your order and see when your payment is confirmed, being packed, on its way, and a countdown until it reaches the gate.',
        storeOpen ? 'Outside food and store items are both open.' : `Outside food is open now. Everyday store items start ${opens}.`,
      ],
    },
    { title: 'Track every order', lines: ['Check where any order is, anytime, in My orders.'] },
    { title: "Can't find something?", lines: ["Tap Request and we'll get you a price."] },
    {
      title: 'Hostel Hub (inside school)',
      lines: [
        'Be the best in Caritas at eFootball, FIFA, DLS, Free Fire and CODM. Sell or rent things you no longer use, or post what you need.',
      ],
    },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-2 px-4 py-3 cursor-pointer text-left">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-[#0e9f55]" />
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">How Roomly works</span>
          {!seen && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#0e9f55] text-white text-[10px] font-bold">New here?</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
          <ol className="pt-3 space-y-3">
            {points.map((p, i) => (
              <li key={p.title} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#0e9f55] text-[11px] font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{p.title}</p>
                  {p.lines.map((l) => (
                    <p key={l} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                      {l}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onStart();
              }}
              className="h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer"
            >
              Start ordering
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onHub();
              }}
              className="h-11 rounded-xl border border-[#0e9f55] text-[#0e9f55] text-sm font-bold cursor-pointer"
            >
              Hostel Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
