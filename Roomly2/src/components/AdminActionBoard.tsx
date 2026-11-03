import React, { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, ChevronDown } from 'lucide-react';
import {
  subscribeOrders,
  getRunners,
  getAllOperatorStatus,
  getStaffSeen,
  getAdminNextInside,
  girlsSideInUse,
  contactPhoneFor,
} from '../api.js';
import { playChime } from '../sound';
import { OrderRecord } from '../types';

/**
 * Admin: what needs you right now, before students are affected.
 * Red and amber come first (with call buttons); greens below show what is working.
 * Nothing here has an "I've dealt with it" button: an alert only goes when the real problem is fixed.
 */

type Level = 'red' | 'amber' | 'grey' | 'green';
interface Contact {
  name: string;
  phone: string;
}
interface Item {
  id: string;
  level: Level;
  title: string;
  detail?: string;
  contacts?: Contact[];
}

const MIN = 60000;
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
const ago = (ms: number, now: number) => {
  if (!ms) return 'not seen yet';
  const m = Math.max(0, Math.round((now - ms) / MIN));
  if (m < 1) return 'active just now';
  if (m < 60) return `active ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `active ${h}h ${m % 60}m ago`;
  return `last active ${new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const sameDay = (ms: number, ymd: string) => Boolean(ms) && ymdOf(new Date(ms)) === ymd;
const waNumber = (phone: string) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.startsWith('0') ? '234' + d.slice(1) : d;
};
const atMin = (now: Date, h: number, m = 0) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const AdminActionBoard: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [runners, setRunners] = useState<any[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showGreens, setShowGreens] = useState(true);
  const lastRed = useRef<number | null>(null);

  useEffect(() => subscribeOrders((list: OrderRecord[]) => setOrders(list || [])), []);
  useEffect(() => {
    getRunners().then((l: any[]) => setRunners(l || []));
    const tick = () => setNowMs(Date.now());
    window.addEventListener('roomly-batches', tick);
    const id = window.setInterval(tick, 30000);
    return () => {
      window.removeEventListener('roomly-batches', tick);
      window.clearInterval(id);
    };
  }, []);

  const now = new Date(nowMs);
  const today = ymdOf(now);
  const items: Item[] = [];
  const seen: Record<string, number> = getStaffSeen() as any;
  const runnerContacts = (hs: string): Contact[] =>
    runners
      .filter((r) => (r.hostelSide === 'girls' ? 'girls' : 'boys') === hs && r.phone)
      .map((r) => ({ name: r.name || 'Runner', phone: r.phone }));

  // ---------- Inside: is the next batch covered by a runner who is really around? ----------
  const sides = ['boys', ...(girlsSideInUse() ? ['girls'] : [])];
  sides.forEach((hs) => {
    const nb = getAdminNextInside(hs, now);
    if (!nb) return;
    const label = `${nb.opt.window}${nb.opt.date === today ? '' : ' tomorrow'}`;
    const sideName = hs === 'girls' ? "Girls' hostels: " : sides.length > 1 ? "Boys' hostels: " : '';
    const left = nb.start.getTime() - nowMs;
    if (!nb.live) {
      items.push({
        id: `nobody-${hs}`,
        level: left <= 90 * MIN ? 'red' : left <= 120 * MIN ? 'amber' : 'grey',
        title: `${sideName}No runner has confirmed the ${label} batch`,
        detail: 'Students can order but cannot pay until a runner confirms. Reach a runner to switch it on.',
        contacts: runnerContacts(hs),
      });
      return;
    }
    const sw = nb.sw || {};
    const lastSeen = Math.max(Number(seen[sw.byUid] || 0), Number(sw.at || 0));
    const activeToday = sameDay(lastSeen, nb.opt.date);
    const who = sw.by || 'The runner';
    const contact = sw.byPhone ? [{ name: who, phone: sw.byPhone }] : [];
    if (!activeToday && left <= 120 * MIN) {
      items.push({
        id: `quiet-${hs}`,
        level: left <= 90 * MIN ? 'red' : 'amber',
        title: `${sideName}${who} confirmed the ${label} batch but hasn't opened Roomly today`,
        detail: 'Students are paying into their account. Make sure they are coming, or ask them to switch the batch off.',
        contacts: contact,
      });
      return;
    }
    items.push({
      id: `ok-${hs}`,
      level: 'green',
      title: `${sideName}Next batch ${label}: ${who} confirmed, ${ago(lastSeen, nowMs)}`,
    });
  });

  // ---------- Outside: an operator with orders today who hasn't had their portal open recently ----------
  const ops = getAllOperatorStatus() as any[];
  (['store', 'food'] as const).forEach((kind) => {
    const due = orders.filter(
      (o) =>
        o.cart === kind &&
        (o as any).payReady &&
        (o.deliveryDate || today) === today &&
        o.status !== 'Cancelled' &&
        o.status !== 'Delivered' &&
        (kind === 'food' ? o.foodStatus : o.storeStatus) !== 'sent' &&
        !o.paymentNotReceived
    );
    const name = kind === 'food' ? 'Food' : 'Store';
    if (!due.length) {
      items.push({ id: `${kind}-none`, level: 'green', title: `${name}: no orders waiting today` });
      return;
    }
    // Store parcels must reach the gate by 6pm: amber from 4pm, red from 5pm. Food comes 4:30-6pm: amber from 2:30pm, red from 4:30pm.
    const amberAt = kind === 'food' ? atMin(now, 14, 30) : atMin(now, 16);
    const redAt = kind === 'food' ? atMin(now, 16, 30) : atMin(now, 17);
    const byOp = new Map<string, number>();
    due.forEach((o) => byOp.set(o.operatorId || '', (byOp.get(o.operatorId || '') || 0) + 1));
    byOp.forEach((count, uid) => {
      const op = ops.find((x) => x.id === uid) || {};
      const opName = op.name || (due.find((o) => (o.operatorId || '') === uid) as any)?.operatorName || 'The operator';
      const last = Number(op.seenAt || 0);
      const quiet = nowMs - last > 120 * MIN;
      const orderWord = `${count} ${kind === 'food' ? 'food' : 'store'} ${count === 1 ? 'order' : 'orders'}`;
      if (quiet && nowMs >= amberAt) {
        items.push({
          id: `${kind}-${uid}`,
          level: nowMs >= redAt ? 'red' : 'amber',
          title: `${opName} has ${orderWord} today and hasn't opened Roomly in 2 hours`,
          detail: `${ago(last, nowMs)}. ${kind === 'food' ? 'Food goes out from 4:30pm.' : 'Store parcels must reach the gate before 6pm.'}`,
          contacts: op.phone ? [{ name: opName, phone: op.phone }] : [],
        });
      } else {
        items.push({ id: `${kind}-${uid}`, level: 'green', title: `${name}: ${opName} has ${orderWord} today, ${ago(last, nowMs)}` });
      }
    });
  });

  // ---------- Payments: a student tapped paid and nobody answered ----------
  const waiting = orders.filter(
    (o) =>
      o.paymentStatus === 'payment_sent' &&
      !o.paymentNotReceived &&
      o.status !== 'Cancelled' &&
      o.paymentSentAt &&
      nowMs - Date.parse(o.paymentSentAt) >= 30 * MIN
  );
  waiting.forEach((o) => {
    const mins = Math.round((nowMs - Date.parse(o.paymentSentAt || '')) / MIN);
    const who = o.operatorName || o.runnerName || o.turnRunner || 'the runner';
    const phone = contactPhoneFor(o);
    items.push({
      id: `pay-${o.id}`,
      level: mins >= 60 ? 'red' : 'amber',
      title: `${o.name} tapped paid ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`} ago and is still waiting`,
      detail: `₦${(o.totalAmount || 0).toLocaleString()} to ${who}, tapped at ${clock(Date.parse(o.paymentSentAt || ''))}. ${who} should confirm it or mark Payment not received.`,
      contacts: phone ? [{ name: who, phone }] : [],
    });
  });
  if (!waiting.length) items.push({ id: 'pay-ok', level: 'green', title: 'Payments: every student who tapped paid was answered within 30 minutes' });

  const rank: Record<Level, number> = { red: 0, amber: 1, grey: 2, green: 3 };
  items.sort((a, b) => rank[a.level] - rank[b.level]);
  const alerts = items.filter((i) => i.level !== 'green');
  const greens = items.filter((i) => i.level === 'green');
  const reds = items.filter((i) => i.level === 'red').length;

  // A new red alert makes a sound (while admin is open)
  useEffect(() => {
    if (lastRed.current !== null && reds > lastRed.current) playChime('order');
    lastRed.current = reds;
  }, [reds]);

  const tone: Record<Level, string> = {
    red: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200',
    grey: 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
    green: '',
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Action needed</p>
        <span
          className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
            reds ? 'bg-rose-600 text-white' : alerts.some((a) => a.level === 'amber') ? 'bg-amber-500 text-white' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {reds ? `${reds} urgent` : alerts.length ? `${alerts.length} to watch` : 'All good'}
        </span>
      </div>

      {alerts.length === 0 && <p className="text-xs text-slate-500">All batches covered. Nothing needs you right now.</p>}

      {alerts.map((a) => (
        <div key={a.id} className={`p-3 rounded-2xl border-2 text-xs space-y-1.5 ${tone[a.level]}`}>
          <p className="font-extrabold leading-snug">{a.title}</p>
          {a.detail && <p className="leading-snug opacity-90">{a.detail}</p>}
          {a.contacts && a.contacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {a.contacts.map((c) => (
                <span key={c.phone} className="flex items-center gap-1">
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 font-bold">
                    <Phone className="w-3 h-3" /> {c.name}
                  </a>
                  <a
                    href={`https://wa.me/${waNumber(c.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80"
                    aria-label={`WhatsApp ${c.name}`}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </a>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {greens.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowGreens(!showGreens)}
            className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            <span>{greens.length} working fine</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGreens ? 'rotate-180' : ''}`} />
          </button>
          {showGreens && (
            <ul className="mt-2 space-y-1">
              {greens.map((g) => (
                <li key={g.id} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>{g.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[10px] text-slate-400 leading-snug">
        Updates live while admin is open. Alerts clear on their own once the runner or operator does what's needed.
      </p>
    </div>
  );
};
