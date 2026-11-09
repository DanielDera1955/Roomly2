import React, { useEffect, useState } from 'react';
import { INSIDE_LAUNCH_MS, OUTSIDE_FOOD_ORDER_BY_MIN, getBookableSlots, timeLabel } from '../config';

/**
 * Home screen hero for first-time visitors (not signed in). Open layout, no card.
 * Signed-in students see the HomeBanner card instead.
 * Greeting follows the clock; the green word rotates; the four tiles show live status from the real schedule.
 */

/** The rotating word: things Caritas students order most. Edit freely. */
export const HERO_WORDS = ['a stove', 'jollof rice', 'a power bank', 'kerosene', 'Indomie', 'any item'];

type Tone = 'open' | 'soon';
interface Tile {
  key: string;
  title: string;
  status: string;
  tone: Tone;
  note: string;
  onTap: () => void;
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export const GuestHero: React.FC<{
  dayPart: string;
  nowMs: number;
  storeOpensMs: number;
  onStart: () => void;
  onOpenSection: (side: 'inside' | 'outside', tab: 'store' | 'food' | 'hub') => void;
}> = ({ dayPart, nowMs, storeOpensMs, onStart, onOpenSection }) => {
  // Rotating word: slides out, swaps, slides in. Stays still for phones set to reduce motion.
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'shown' | 'out' | 'in'>('shown');
  useEffect(() => {
    let still = false;
    try {
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
    if (still) return;
    let t1 = 0;
    let t2 = 0;
    const id = window.setInterval(() => {
      setPhase('out');
      t1 = window.setTimeout(() => {
        setI((n) => (n + 1) % HERO_WORDS.length);
        setPhase('in');
        t2 = window.setTimeout(() => setPhase('shown'), 30);
      }, 320);
    }, 2200);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  const wordStyle: React.CSSProperties =
    phase === 'out'
      ? { transform: 'translateY(-70%)', opacity: 0, transition: 'transform .32s ease, opacity .32s ease' }
      : phase === 'in'
      ? { transform: 'translateY(70%)', opacity: 0, transition: 'none' }
      : { transform: 'translateY(0)', opacity: 1, transition: 'transform .32s ease, opacity .32s ease' };

  // Live status for each tile
  const now = new Date(nowMs);
  const min = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();

  const food: Pick<Tile, 'status' | 'tone' | 'note'> =
    day === 0
      ? { status: 'Back Monday', tone: 'soon', note: 'Order now for Monday' }
      : min < OUTSIDE_FOOD_ORDER_BY_MIN
      ? { status: 'Open now', tone: 'open', note: `To the gate, order before ${timeLabel(OUTSIDE_FOOD_ORDER_BY_MIN)}` }
      : { status: day === 6 ? 'Next: Monday' : 'Next: tomorrow', tone: 'soon', note: 'To the gate, order now' };

  let room: Pick<Tile, 'status' | 'tone' | 'note'>;
  if (nowMs < INSIDE_LAUNCH_MS) room = { status: shortDate(INSIDE_LAUNCH_MS), tone: 'soon', note: 'Canteen and store items' };
  else {
    const next = getBookableSlots(now)[0];
    const when = !next ? '' : next.dayLabel === 'Today' ? '' : next.dayLabel === 'Tomorrow' ? ' tomorrow' : ` ${next.dayLabel}`;
    room = { status: next ? `Next: ${timeLabel(next.startMin)}${when}` : 'Open now', tone: 'open', note: 'Canteen and store items' };
  }

  const store: Pick<Tile, 'status' | 'tone' | 'note'> =
    storeOpensMs > nowMs
      ? { status: shortDate(storeOpensMs), tone: 'soon', note: 'Restock, no Thursday trip' }
      : { status: 'Open now', tone: 'open', note: 'Restock, no Thursday trip' };

  // Kept for reference; the home page's four cards (HomeQuickCards) now show these sections
  const tiles: Tile[] = [
    { key: 'food', title: 'Outside food', ...food, onTap: () => onOpenSection('outside', 'food') },
    { key: 'room', title: 'Room delivery', ...room, onTap: () => onOpenSection('inside', 'store') },
    { key: 'store', title: 'Outside store', ...store, onTap: () => onOpenSection('outside', 'store') },
    { key: 'hub', title: 'Hostel Hub', status: 'Open now', tone: 'open', note: 'Games, services, buy and sell', onTap: () => onOpenSection('inside', 'hub') },
  ];

  void tiles;
  return (
    <section className="px-1 pt-1 pb-2">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0b8044] dark:text-emerald-400">Hey there, {dayPart.toLowerCase()}</p>

      <h1 className="mt-3 text-[30px] leading-[1.15] font-extrabold tracking-tight text-slate-900 dark:text-white">
        Get
        <br />
        <span className="inline-block h-[38px] overflow-hidden align-bottom">
          <span className="inline-block text-[#0e9f55] dark:text-emerald-400" style={wordStyle}>
            {HERO_WORDS[i]}
          </span>
        </span>
        <br />
        <span className="text-slate-500 dark:text-slate-300">without leaving school.</span>
      </h1>

      <p className="mt-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Food and items from Oye to the school gate, and canteen items to your room at night. Built by a Caritas student.
      </p>

      {/* The four section cards sit under this header (HomeQuickCards), the same for new and returning students */}
      {/* The button, with a faded note on the same line (plain text, not a link) */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="h-11 px-5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white text-sm font-bold cursor-pointer active:scale-[0.98] transition-transform shrink-0"
        >
          Start ordering
        </button>
        <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500 select-none">No account needed</span>
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-[11px] font-bold text-[#0b8044] dark:text-emerald-300">
        <span aria-hidden>✓</span> Just pick, pay, and track your orders
      </span>
    </section>
  );
};
