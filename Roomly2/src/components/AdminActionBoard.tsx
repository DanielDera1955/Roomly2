import React, { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Check } from 'lucide-react';
import {
  subscribeOrders,
  getRunners,
  getAllOperatorStatus,
  getStaffSeen,
  getAdminNextInside,
  girlsSideInUse,
  contactPhoneFor,
  subscribeOpenSettlements,
  settlementState,
  subscribeSideRequests,
  subscribeAllRatings,
  subscribeFeedbackMessages,
  setFeedbackStatus,
  collectsAsRoomly,
  isRoomlyOrder,
  payoutPending,
} from '../api.js';
import { slotsForDay, outsideArriveByFor, INSIDE_ORDER_BY_MIN, INSIDE_ARRIVE_BY_MIN, foodLateOrderByMin } from '../config';
import { playChime } from '../sound';
import { subscribeShopApplications, subscribeShopReports, dismissShopReport } from '../shopsAdmin.js';
import { OrderRecord } from '../types';

/**
 * Admin: two tabs.
 * Action needed: red and amber first (what's wrong, what to do, who to call), grey ones to keep an eye on.
 * All good: one green line per area that was checked and is fine.
 * Alerts clear on their own once the runner or operator does what's needed. Feedback is the only thing
 * you clear yourself, because nobody else can.
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
  todo?: string;
  contacts?: Contact[];
  clear?: { label: string; run: () => void };
}

const MIN = 60000;
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
const mins = (t: number) => {
  const m = Math.max(0, Math.round(t / MIN));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};
const ago = (t: number, now: number) => {
  if (!t) return 'not seen yet';
  const m = Math.max(0, Math.round((now - t) / MIN));
  if (m < 1) return 'active just now';
  if (m < 60) return `active ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `active ${h}h ${m % 60}m ago`;
  return `last active ${new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const sameDay = (t: number, ymd: string) => Boolean(t) && ymdOf(new Date(t)) === ymd;
const waNumber = (phone: string) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.startsWith('0') ? '234' + d.slice(1) : d;
};
const atMin = (now: Date, h: number, m = 0) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const isOutside = (o: any) => o.cart === 'store' || o.cart === 'food';
const ms = (iso?: string) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
};

/** When an inside order's batch was due to start (0 if the batch can't be found) */
function insideBatchStart(o: any): number {
  if (!o.deliveryDate || !o.deliveryBatch) return 0;
  const day = new Date(o.deliveryDate + 'T00:00:00');
  if (!Number.isFinite(day.getTime())) return 0;
  const opt = slotsForDay('inside', day, 0).find((s: any) => s.id === o.deliveryBatch);
  return opt ? day.getTime() + opt.startMin * MIN : 0;
}

// Ratings you've already read (kept on this device only; ratings can't be edited)
const SEEN_KEY = 'roomly_admin_seen_ratings';
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  } catch (e) {
    return [];
  }
};
const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-300)));
  } catch (e) {
    /* storage blocked: it just shows again next time */
  }
};

export const AdminActionBoard: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [runners, setRunners] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [requests, setRequests] = useState<Record<string, any[]>>({});
  const [ratings, setRatings] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [seenRatings, setSeenRatings] = useState<string[]>(readSeen);
  const [nowMs, setNowMs] = useState(Date.now());
  const [tab, setTab] = useState<'action' | 'good' | null>(null);
  const lastRed = useRef<number | null>(null);

  useEffect(() => subscribeOrders((list: OrderRecord[]) => setOrders(list || [])), []);
  useEffect(() => subscribeFeedbackMessages((list: any[]) => setMessages(list || [])), []);
  // Hostel Hub: new vendor and service applications, and "Report this listing" reports
  const [shopApps, setShopApps] = useState<any[]>([]);
  const [shopReports, setShopReports] = useState<any[]>([]);
  useEffect(() => subscribeShopApplications((l: any[]) => setShopApps(l || [])), []);
  useEffect(() => subscribeShopReports((l: any[]) => setShopReports(l || [])), []);
  useEffect(() => {
    const offs = (['inside', 'store', 'food'] as const).map((side) =>
      subscribeSideRequests(side, (list: any[]) => setRequests((r) => ({ ...r, [side]: list || [] })))
    );
    return () => offs.forEach((f) => f && f());
  }, []);
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
  const ops = getAllOperatorStatus() as any[];
  const runnerContacts = (hs: string): Contact[] =>
    runners
      .filter((r) => (r.hostelSide === 'girls' ? 'girls' : 'boys') === hs && r.phone)
      .map((r) => ({ name: r.name || 'Runner', phone: r.phone }));
  const opContacts = (kind: string): Contact[] =>
    ops.filter((o) => o.kind === kind && o.phone).map((o) => ({ name: o.name || 'Operator', phone: o.phone }));
  const providerContact = (o: any): Contact[] => {
    const phone = contactPhoneFor(o);
    const name = o.operatorName || o.runnerName || o.turnRunner || (isOutside(o) ? 'Operator' : 'Runner');
    return phone ? [{ name, phone }] : [];
  };
  const studentContact = (o: any): Contact[] => (o.phone ? [{ name: o.name || 'Student', phone: o.phone }] : []);
  const ratedIds = new Set(ratings.map((r) => r.orderId || r.id));

  // Only four things: live batch countdowns, payments waiting, product requests, complaints.
  // (Runner and operator checks, settlements and ratings are off while Roomly runs every order itself.)

  // ---------- 1. Batch countdowns: one line per batch with paid orders, until sent + the 15-minute gate countdown ----------
  const GATE_MIN = 15;
  type Group = { key: string; label: string; place: string; closeAt: number; dueAt: number; orders: any[] };
  const groups: Record<string, Group> = {};
  orders.forEach((o: any) => {
    if (o.status === 'Cancelled' || o.paymentStatus !== 'payment_confirmed' || !o.deliveryDate) return;
    const side = isOutside(o) ? o.cart : 'inside';
    const day = new Date(o.deliveryDate + 'T00:00:00');
    if (!Number.isFinite(day.getTime())) return;
    let label = '';
    let closeMin = 0;
    let dueMin = 0;
    if (side === 'inside') {
      label = 'Canteen night batch';
      closeMin = INSIDE_ORDER_BY_MIN;
      dueMin = INSIDE_ARRIVE_BY_MIN;
    } else {
      const opt: any = slotsForDay(side, day, 0).find((x: any) => x.id === o.deliveryBatch) || slotsForDay(side, day, 0)[0];
      const late = side === 'food' && Boolean(o.lateFood);
      closeMin = late
        ? foodLateOrderByMin(opt?.id || o.deliveryBatch)
        : opt
        ? opt.orderBy instanceof Date
          ? opt.orderBy.getHours() * 60 + opt.orderBy.getMinutes()
          : opt.startMin
        : 0;
      dueMin = outsideArriveByFor(opt?.id || o.deliveryBatch, late);
      const meal = (opt?.id || o.deliveryBatch) === 'midday' ? 'Lunch' : 'Dinner';
      label = side === 'store' ? 'Store daily run' : late ? `Food: Late ${meal.toLowerCase()} (one run)` : `Food: ${meal}`;
    }
    // Finished: sent to the gate / delivered and the 15-minute gate countdown is over
    const doneAt = o.status === 'Delivered' ? ms(o.deliveredAt) || 0 : 0;
    const finished = doneAt && (side === 'inside' || nowMs >= doneAt + GATE_MIN * MIN);
    const key = `${side}|${o.deliveryDate}|${label}`;
    if (!groups[key])
      groups[key] = { key, label, place: side === 'inside' ? 'rooms' : 'the gate', closeAt: day.getTime() + closeMin * MIN, dueAt: day.getTime() + dueMin * MIN, orders: [] };
    if (!finished) groups[key].orders.push(o);
  });
  Object.values(groups)
    .filter((g) => g.orders.length > 0)
    .sort((x, y) => x.dueAt - y.dueAt)
    .forEach((g) => {
      const n = g.orders.length;
      const notSent = g.orders.filter((o: any) => o.status !== 'Delivered').length;
      const dayNote = sameDay(g.dueAt, today) ? '' : ` (${new Date(g.dueAt).toLocaleDateString([], { weekday: 'short' })})`;
      const head = `${g.label}${dayNote}: ${n} paid ${n === 1 ? 'order' : 'orders'}`;
      let level: Level = 'grey';
      let title = '';
      if (nowMs < g.closeAt) {
        title = `${head} · orders close in ${mins(g.closeAt - nowMs)}`;
      } else if (nowMs < g.dueAt) {
        title = `${head} · must reach ${g.place} in ${mins(g.dueAt - nowMs)} (by ${clock(g.dueAt)})`;
      } else {
        title = `${head} · deadline ${clock(g.dueAt)} passed`;
      }
      const left = g.dueAt - nowMs;
      if (notSent > 0 && left <= 0) level = 'red';
      else if (notSent > 0 && left <= 45 * MIN) level = 'amber';
      items.push({
        id: `batch-${g.key}`,
        level,
        title,
        detail: notSent ? `${notSent} not sent yet: ${g.orders.filter((o: any) => o.status !== 'Delivered').map((o: any) => o.name).join(', ')}.` : 'All sent. Waiting for the 15-minute gate countdown to finish.',
      });
    });
  if (!Object.values(groups).some((g) => g.orders.length)) items.push({ id: 'batch-ok', level: 'green', title: 'Batches: no active paid orders right now' });

  // ---------- 2. Payments: a student tapped paid and it isn't confirmed yet ----------
  const waiting = orders.filter((o: any) => o.paymentStatus === 'payment_sent' && !o.paymentNotReceived && o.status !== 'Cancelled');
  waiting.forEach((o: any) => {
    const sentAt = ms(o.paymentSentAt) || ms(o.createdAt);
    const long = nowMs - sentAt >= 15 * MIN;
    items.push({
      id: `pay-${o.id}`,
      level: long ? 'red' : 'amber',
      title: `${o.name} says they sent ${naira(o.totalAmount)}${sentAt ? ` (${mins(nowMs - sentAt)} ago)` : ''}`,
      detail: sentAt ? `Tapped paid at ${clock(sentAt)}.` : undefined,
      todo: 'Check your account, then open the order in Orders and tap Money received or Not received.',
      contacts: studentContact(o),
    });
  });
  if (!waiting.length) items.push({ id: 'pay-ok', level: 'green', title: 'Payments: nothing waiting for confirmation' });

  // ---------- 3. Product requests: every open request, as soon as it comes in ----------
  let reqWaiting = 0;
  (['inside', 'store', 'food'] as const).forEach((side) => {
    (requests[side] || []).forEach((q: any) => {
      if (q.status !== 'open') return;
      const age = nowMs - ms(q.createdAt);
      if (age > 3 * 24 * 60 * MIN) return;
      reqWaiting++;
      const what = (q.items || []).map((i: any) => i.name).slice(0, 3).join(', ');
      items.push({
        id: `req-${q.id}`,
        level: age >= 2 * 60 * MIN ? 'red' : 'amber',
        title: `${q.name || 'A student'} requested ${what || 'a product'} (${side === 'inside' ? 'canteen' : side === 'store' ? 'store' : 'food'}, ${mins(age)} ago)`,
        detail: "Their cart can't check out until it's priced.",
        todo: 'Check the price with the vendor, then quote it in Product requests.',
        contacts: q.phone ? [{ name: q.name || 'Student', phone: q.phone }] : [],
      });
    });
  });
  if (!reqWaiting) items.push({ id: 'req-ok', level: 'green', title: 'Product requests: none open' });

  // ---------- 4. Complaints: "I haven't received my order" and complaint messages ----------
  let complaints = 0;
  orders.forEach((o: any) => {
    if (o.status === 'Cancelled' || !o.notReceived || o.notReceived.resolvedAt) return;
    complaints++;
    items.push({
      id: `nr-${o.id}`,
      level: 'red',
      title: `${o.name} says they haven't received their order`,
      detail: `${naira(o.totalAmount)}, ${o.id}. Flagged at ${clock(Number(o.notReceived.atMs) || ms(o.notReceived.at))}.`,
      todo: 'Call the student, check with the vendor, then mark it resolved in Orders.',
      contacts: [...studentContact(o), ...providerContact(o)],
    });
  });
  // Every message a student sends (suggestions too) stays here until you mark it attended
  messages.forEach((m: any) => {
    if (m.status === 'done') return;
    complaints++;
    items.push({
      id: `fb-${m.id}`,
      level: m.type === 'Problem with an order' ? 'red' : m.type === 'Complaint' ? 'amber' : 'grey',
      title: `${m.type} from ${m.name || 'a student'}${m.atMs ? ` (${mins(nowMs - Number(m.atMs))} ago)` : ''}`,
      detail: `"${m.message}"`,
      todo: 'Read it, reply to the student if needed, then tap Mark attended.',
      contacts: m.phone ? [{ name: m.name || 'Student', phone: m.phone }] : [],
      clear: { label: 'Mark attended', run: () => void setFeedbackStatus(m.id, 'done').catch(() => window.alert('Could not update. Try again.')) },
    });
  });
  if (!complaints) items.push({ id: 'fb-ok', level: 'green', title: 'Student messages: all attended' });

  // ---------- Hostel Hub vendors and services ----------
  const newShopApps = shopApps.filter((a: any) => a.status === 'new');
  newShopApps.forEach((a: any) =>
    items.push({
      id: `shopapp-${a.id}`,
      level: 'amber',
      title: `New ${a.kind === 'service' ? 'service' : 'vendor'} application from ${a.name}`,
      detail: `${a.hostel}, room ${a.room}`,
      todo: 'Open Applications and approve or reject it, then send the vendor their edit link.',
      contacts: a.phone ? [{ name: a.name, phone: a.phone }] : [],
    })
  );
  const openShopReports = shopReports.filter((r: any) => r.status !== 'done');
  openShopReports.forEach((r: any) =>
    items.push({
      id: `shoprep-${r.id}`,
      level: 'amber',
      title: `Report on ${r.shopName || 'a listing'}: ${r.reason}${r.createdAtMs ? ` (${mins(nowMs - Number(r.createdAtMs))} ago)` : ''}`,
      detail: r.note ? `"${r.note}"` : undefined,
      todo: 'Open Applications > Listings. Hide the listing if the report is right, then tap Mark attended.',
      clear: { label: 'Mark attended', run: () => void dismissShopReport(r.id).catch(() => window.alert('Could not update. Try again.')) },
    })
  );
  if (!newShopApps.length && !openShopReports.length) items.push({ id: 'shop-ok', level: 'green', title: 'Hostel Hub vendors: nothing waiting' });

  // ---------- sort and split ----------
  const rank: Record<Level, number> = { red: 0, amber: 1, grey: 2, green: 3 };
  items.sort((a, b) => rank[a.level] - rank[b.level]);
  const alerts = items.filter((i) => i.level !== 'green');
  const greens = items.filter((i) => i.level === 'green');
  const reds = alerts.filter((i) => i.level === 'red').length;
  const ambers = alerts.filter((i) => i.level === 'amber').length;
  const shown = tab || (reds + ambers > 0 ? 'action' : 'good');

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
  const actionBadge = reds ? 'bg-rose-600 text-white' : ambers ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  const tabClass = (on: boolean) =>
    `flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black cursor-pointer ${
      on ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
    }`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
        <button type="button" onClick={() => setTab('action')} className={tabClass(shown === 'action')}>
          Action needed
          {alerts.length > 0 && <span className={`min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] ${actionBadge}`}>{alerts.length}</span>}
        </button>
        <button type="button" onClick={() => setTab('good')} className={tabClass(shown === 'good')}>
          All good
          <span className="min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            {greens.length}
          </span>
        </button>
      </div>

      {shown === 'action' && (
        <div className="space-y-2">
          {alerts.length === 0 && <p className="text-xs text-slate-500 py-2">Nothing needs you right now. Everything is in All good.</p>}
          {alerts.map((a) => (
            <div key={a.id} className={`p-3 rounded-2xl border-2 text-xs space-y-1.5 ${tone[a.level]}`}>
              <p className="font-extrabold leading-snug">{a.title}</p>
              {a.detail && <p className="leading-snug opacity-90">{a.detail}</p>}
              {a.todo && (
                <p className="leading-snug">
                  <span className="font-black">Do this: </span>
                  {a.todo}
                </p>
              )}
              {((a.contacts && a.contacts.length > 0) || a.clear) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {(a.contacts || []).map((c, i) => (
                    <span key={`${c.phone}-${i}`} className="flex items-center gap-1">
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
                  {a.clear && (
                    <button
                      type="button"
                      onClick={a.clear.run}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> {a.clear.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {shown === 'good' && (
        <ul className="space-y-1.5">
          {greens.map((g) => (
            <li key={g.id} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>{g.title}</span>
            </li>
          ))}
          {alerts.length > 0 && (
            <li className="pt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
              {alerts.length} {alerts.length === 1 ? 'thing needs' : 'things need'} you in Action needed.
            </li>
          )}
        </ul>
      )}

      <p className="text-[10px] text-slate-400 leading-snug">
        Updates live while admin is open. Batch lines show only while a batch has paid orders. Complaints clear when you mark them done.
      </p>
    </div>
  );
};
