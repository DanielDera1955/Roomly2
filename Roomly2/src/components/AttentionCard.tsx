import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { subscribeMyOpenSettlements, isDoneForToday } from '../api.js';

/**
 * Top of the operator portal: only what needs doing right now, at most 5 short rows (no scrolling).
 * Each row jumps to the part of the page where it is done. Nothing to do: one green line.
 */
interface Props {
  needsAccount: boolean;
  toConfirm: number;
  toSend: number;
  requests: number;
  onOrders: (stage: 'active' | 'confirmed') => void;
  /** Runners: inside orders go to the room, plus express runs and gate pickups waiting for a runner */
  runner?: boolean;
  express?: number;
  gate?: number;
}

type Tone = 'red' | 'amber' | 'blue';
const TONE: Record<Tone, { row: string; badge: string; go: string }> = {
  red: { row: 'bg-rose-50 dark:bg-rose-950/30', badge: 'bg-rose-500', go: 'text-rose-600 dark:text-rose-400' },
  amber: { row: 'bg-amber-50 dark:bg-amber-950/30', badge: 'bg-amber-500', go: 'text-amber-700 dark:text-amber-400' },
  blue: { row: 'bg-blue-50 dark:bg-blue-950/30', badge: 'bg-blue-500', go: 'text-blue-700 dark:text-blue-400' },
};

/** Scroll to the first of these sections that is on the page */
export const jumpTo = (...ids: string[]) => {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
};

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

export const AttentionCard: React.FC<Props> = ({ needsAccount, toConfirm, toSend, requests, onOrders, runner = false, express = 0, gate = 0 }) => {
  // Settlement: money owed for a past day, or for today once they are done for the day
  const [open, setOpen] = useState<any[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => subscribeMyOpenSettlements(setOpen), []);
  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    const id = window.setInterval(h, 60000);
    return () => {
      window.removeEventListener('roomly-batches', h);
      window.clearInterval(id);
    };
  }, []);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const left = (d: any) => Math.max(0, Math.round((d.due || 0) - (d.sentTotal || 0)));
  const pastOwed = open.filter((d) => d.date < todayKey).reduce((t, d) => t + left(d), 0);
  const todayOwed = open.filter((d) => d.date === todayKey).reduce((t, d) => t + left(d), 0);
  const settle = pastOwed + (todayOwed > 0 && isDoneForToday(now) ? todayOwed : 0);

  const rows: { key: string; tone: Tone; badge: string; title: string; note: string; go: string; act: () => void }[] = [];
  if (needsAccount)
    rows.push({ key: 'acc', tone: 'red', badge: '!', title: 'Add your payment account', note: "Students can't pick you at checkout until you do", go: 'Add', act: () => jumpTo('op-account') });
  if (toConfirm > 0)
    rows.push({ key: 'pay', tone: 'red', badge: String(toConfirm), title: `Payment${toConfirm > 1 ? 's' : ''} to confirm`, note: "Students say they've paid", go: 'View', act: () => onOrders('active') });
  if (toSend > 0)
    rows.push({
      key: 'send',
      tone: 'amber',
      badge: String(toSend),
      title: runner ? `Order${toSend > 1 ? 's' : ''} to pack and deliver` : `Order${toSend > 1 ? 's' : ''} to pack and send`,
      note: runner ? 'Deliver to their rooms in your batch' : 'Must reach the gate before 6pm',
      go: 'View',
      act: () => onOrders('confirmed'),
    });
  if (express > 0)
    rows.push({ key: 'exp', tone: 'red', badge: String(express), title: `Express order${express > 1 ? 's' : ''} waiting`, note: 'A student wants it now. 20 minutes once they pay', go: 'View', act: () => jumpTo('op-express') });
  if (gate > 0)
    rows.push({ key: 'gate', tone: 'amber', badge: String(gate), title: `Gate pickup${gate > 1 ? 's' : ''} waiting`, note: 'Bring an outside order from the gate to a room', go: 'View', act: () => jumpTo('op-gate') });
  if (requests > 0)
    rows.push({ key: 'req', tone: 'blue', badge: String(requests), title: `Product request${requests > 1 ? 's' : ''}`, note: 'A student is waiting for your price', go: 'Answer', act: () => jumpTo('op-requests') });
  if (settle > 0)
    rows.push({ key: 'set', tone: 'red', badge: '₦', title: `Settle ${naira(settle)} with Roomly`, note: "Before 6am, or you're hidden from checkout", go: 'Settle', act: () => jumpTo('op-settle-top', 'op-settle-bottom') });

  if (!rows.length) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs font-bold text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        All caught up. New orders and requests will show here.
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1.5">
      <div className="flex items-center justify-between px-0.5 pb-0.5">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Needs your attention</span>
        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center">{rows.length}</span>
      </div>
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={r.act}
          className={`w-full flex items-center gap-2.5 p-2.5 rounded-2xl text-left cursor-pointer ${TONE[r.tone].row}`}
        >
          <span className={`shrink-0 min-w-[26px] h-[26px] px-1 rounded-full text-white text-xs font-extrabold flex items-center justify-center ${TONE[r.tone].badge}`}>{r.badge}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight">{r.title}</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{r.note}</span>
          </span>
          <span className={`shrink-0 flex items-center text-xs font-extrabold ${TONE[r.tone].go}`}>
            {r.go}
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </button>
      ))}
    </div>
  );
};
