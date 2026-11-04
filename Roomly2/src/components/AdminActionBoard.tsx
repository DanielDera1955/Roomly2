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
} from '../api.js';
import { slotsForDay, RATING_GOOD, INSIDE_ARRIVAL_MINUTES } from '../config';
import { playChime } from '../sound';
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
  useEffect(() => subscribeOpenSettlements((list: any[]) => setSettlements(list || [])), []);
  useEffect(() => subscribeAllRatings((list: any[]) => setRatings(list || [])), []);
  useEffect(() => subscribeFeedbackMessages((list: any[]) => setMessages(list || [])), []);
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

  // ---------- 1. Batches: is the next inside batch covered by a runner who is really around? ----------
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
        level: left <= 120 * MIN ? 'red' : 'amber',
        title: `${sideName}No runner is scheduled for the ${label} batch`,
        detail: 'Students can order but cannot pay until a runner takes it.',
        todo: 'Ask a runner to add this batch to their week or switch it on for today.',
        contacts: runnerContacts(hs),
      });
      return;
    }
    const sw = nb.sw || {};
    const lastSeen = Math.max(Number(seen[sw.byUid] || 0), Number(sw.at || 0));
    const activeToday = sameDay(lastSeen, nb.opt.date);
    const who = sw.by || 'The runner';
    if (!activeToday && left <= 120 * MIN) {
      items.push({
        id: `quiet-${hs}`,
        level: left <= 60 * MIN ? 'red' : 'amber',
        title: `${sideName}${who} ${sw.auto ? 'is scheduled for' : 'confirmed'} the ${label} batch but hasn't opened Roomly today`,
        detail: 'Students are paying into their account.',
        todo: `Make sure ${who} is coming, or ask them to switch the batch off for today.`,
        contacts: sw.byPhone ? [{ name: who, phone: sw.byPhone }] : [],
      });
      return;
    }
    items.push({ id: `ok-${hs}`, level: 'green', title: `${sideName}Next batch ${label}: ${who} is taking it, ${ago(lastSeen, nowMs)}` });
  });

  // ---------- 2. Outside operators: orders today and the portal hasn't been open recently ----------
  (['store', 'food'] as const).forEach((kind) => {
    const due = orders.filter(
      (o: any) =>
        o.cart === kind &&
        o.payReady &&
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
    due.forEach((o: any) => byOp.set(o.operatorId || '', (byOp.get(o.operatorId || '') || 0) + 1));
    byOp.forEach((count, uid) => {
      const op = ops.find((x) => x.id === uid) || {};
      const opName = op.name || (due.find((o: any) => (o.operatorId || '') === uid) as any)?.operatorName || 'The operator';
      const last = Number(op.seenAt || 0);
      const quiet = nowMs - last > 120 * MIN;
      const orderWord = `${count} ${kind} ${count === 1 ? 'order' : 'orders'}`;
      if (quiet && nowMs >= amberAt) {
        items.push({
          id: `${kind}-${uid}`,
          level: nowMs >= redAt ? 'red' : 'amber',
          title: `${opName} has ${orderWord} today and hasn't opened Roomly in 2 hours`,
          detail: `${ago(last, nowMs)}. ${kind === 'food' ? 'Food goes out from 4:30pm.' : 'Store parcels must reach the gate before 6pm.'}`,
          todo: `Call ${opName} and make sure the orders are being packed.`,
          contacts: op.phone ? [{ name: opName, phone: op.phone }] : [],
        });
      } else {
        items.push({ id: `${kind}-${uid}`, level: 'green', title: `${name}: ${opName} has ${orderWord} today, ${ago(last, nowMs)}` });
      }
    });
  });

  // ---------- 3. Payments: a student tapped paid and nobody answered ----------
  const waiting = orders.filter(
    (o: any) =>
      o.paymentStatus === 'payment_sent' && !o.paymentNotReceived && o.status !== 'Cancelled' && o.paymentSentAt && nowMs - ms(o.paymentSentAt) >= 15 * MIN
  );
  waiting.forEach((o: any) => {
    const sentAt = ms(o.paymentSentAt);
    const who = o.operatorName || o.runnerName || o.turnRunner || 'the runner';
    items.push({
      id: `pay-${o.id}`,
      level: 'red',
      title: `${o.name} tapped paid ${mins(nowMs - sentAt)} ago and is still waiting`,
      detail: `${naira(o.totalAmount)} to ${who}, tapped at ${clock(sentAt)}.`,
      todo: `Ask ${who} to check their account and tap Confirm payment, or mark Payment not received.`,
      contacts: [...providerContact(o), ...studentContact(o)],
    });
  });
  if (!waiting.length) items.push({ id: 'pay-ok', level: 'green', title: 'Payments: every student who tapped paid was answered within 15 minutes' });

  // ---------- 4. Orders: stuck, reported not received, or countdown ended with no word from the student ----------
  let orderProblems = 0;
  orders.forEach((o: any) => {
    if (o.status === 'Cancelled') return;

    // Student says it never came
    if (o.notReceived && !o.notReceived.resolvedAt) {
      orderProblems++;
      items.push({
        id: `nr-${o.id}`,
        level: 'red',
        title: `${o.name} says they haven't received their order`,
        detail: `${naira(o.totalAmount)}, ${o.runnerName || o.turnRunner || 'runner'}. Flagged at ${clock(Number(o.notReceived.atMs) || ms(o.notReceived.at))}.`,
        todo: 'Call the student and the runner, then resolve it in Orders.',
        contacts: [...studentContact(o), ...providerContact(o)],
      });
      return;
    }

    // Inside: paid and confirmed, but the runner hasn't left 30 minutes after the batch started
    if (!isOutside(o) && o.paymentStatus === 'payment_confirmed' && o.status !== 'On the way' && o.status !== 'Delivered') {
      const from = Math.max(insideBatchStart(o), ms(o.paymentConfirmedAt));
      if (from && nowMs - from >= 30 * MIN) {
        orderProblems++;
        const who = o.runnerName || o.turnRunner || 'The runner';
        items.push({
          id: `stuck-${o.id}`,
          level: nowMs - from >= 45 * MIN ? 'red' : 'amber',
          title: `${o.name}'s order is paid but ${who} hasn't left yet`,
          detail: `${mins(nowMs - from)} since the batch started. ${naira(o.totalAmount)} to ${[o.building, o.room].filter(Boolean).join(' ') || 'their room'}.`,
          todo: `Call ${who}. If they can't go, ask another runner to help.`,
          contacts: providerContact(o),
        });
        return;
      }
    }

    // Outside: paid and confirmed, but not sent towards the gate as 6pm gets close
    if (isOutside(o) && o.paymentStatus === 'payment_confirmed' && o.status !== 'Delivered' && (o.deliveryDate || today) === today) {
      const part = o.cart === 'food' ? o.foodStatus : o.storeStatus;
      if (part !== 'sent' && nowMs >= atMin(now, 17, 30)) {
        orderProblems++;
        const who = o.operatorName || 'The operator';
        items.push({
          id: `late-${o.id}`,
          level: nowMs >= atMin(now, 17, 45) ? 'red' : 'amber',
          title: `${o.name}'s ${o.cart} order hasn't left for the gate`,
          detail: `${naira(o.totalAmount)} with ${who}. It must reach the gate before 6pm.`,
          todo: `Call ${who}. If it can't make it, ask them to tap Move to tomorrow so the student is told.`,
          contacts: providerContact(o),
        });
        return;
      }
    }

    // Countdown ended and the student hasn't rated or said anything: worth a glance, not an alarm
    if (o.status === 'Delivered' && !ratedIds.has(o.id)) {
      const end = isOutside(o) ? ms(o.deliveredAt) + 15 * MIN : o.autoDelivered ? Number(o.onTheWayAtMs || 0) + INSIDE_ARRIVAL_MINUTES * MIN : 0;
      if (end > 15 * MIN && nowMs >= end && nowMs - end < 30 * MIN) {
        items.push({
          id: `cd-${o.id}`,
          level: 'grey',
          title: `${o.name}'s countdown ended ${mins(nowMs - end)} ago, no word from them yet`,
          detail: isOutside(o) ? 'Should be at the gate by now.' : 'Marked delivered by the timer, not by the runner.',
          todo: "Nothing needed unless they say it hasn't arrived. Clears in 30 minutes.",
          contacts: studentContact(o),
        });
      }
    }
  });
  if (!orderProblems) items.push({ id: 'orders-ok', level: 'green', title: 'Orders: none stuck, no "not received" reports' });

  // ---------- 5. Settlements ----------
  let dueTotal = 0;
  let settleAlerts = 0;
  const dueFrom = new Set<string>();
  settlements.forEach((s: any) => {
    const owed = Math.max(0, Number(s.due || 0) - Number(s.confirmed || 0));
    const state = settlementState(s, now);
    const sent = Math.max(0, Number(s.sentTotal || 0) - Number(s.confirmed || 0));
    if (!owed && state !== 'waiting') return;
    const person = s.name || 'A runner';
    const r = runners.find((x) => x.name === s.name);
    const op = ops.find((x) => x.id === s.uid);
    const phone = (op && op.phone) || (r && r.phone) || '';
    const contacts = phone ? [{ name: person, phone }] : [];
    const day = new Date(s.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    if (state === 'waiting') {
      settleAlerts++;
      items.push({
        id: `set-w-${s.id}`,
        level: 'amber',
        title: `${person} sent ${naira(sent)} for ${day}. Waiting for you`,
        todo: `Check your account, then confirm ${naira(sent)} from ${person} in Money.`,
        contacts,
      });
    } else if (state === 'overdue') {
      settleAlerts++;
      items.push({
        id: `set-o-${s.id}`,
        level: 'red',
        title: `${person} hasn't settled ${naira(owed)} for ${day}`,
        detail: 'They are hidden from checkout until they settle, so fewer people can take orders.',
        todo: `Ask ${person} to settle in their portal now.`,
        contacts,
      });
    } else {
      dueTotal += owed;
      dueFrom.add(person);
    }
  });
  if (dueTotal > 0)
    items.push({ id: 'set-due', level: 'green', title: `Settlements: ${naira(dueTotal)} due by 6am from ${dueFrom.size} ${dueFrom.size === 1 ? 'person' : 'people'}` });
  else if (!settleAlerts) items.push({ id: 'set-ok', level: 'green', title: 'Settlements: everyone is cleared' });

  // ---------- 6. Product requests waiting over 2 hours for a quote ----------
  let reqWaiting = 0;
  (['inside', 'store', 'food'] as const).forEach((side) => {
    (requests[side] || []).forEach((q: any) => {
      if (q.status !== 'open') return;
      const age = nowMs - ms(q.createdAt);
      if (age < 120 * MIN || age > 3 * 24 * 60 * MIN) return;
      reqWaiting++;
      const what = (q.items || []).map((i: any) => i.name).slice(0, 3).join(', ');
      const who = side === 'inside' ? 'runners' : side === 'store' ? 'store operator' : 'food operator';
      items.push({
        id: `req-${q.id}`,
        level: age >= 6 * 60 * MIN ? 'red' : 'amber',
        title: `${q.name || 'A student'} asked for ${what || 'a product'} ${mins(age)} ago, no quote yet`,
        detail: "Their cart can't check out until it's quoted.",
        todo: `Ask the ${who} to check Product requests and send a price.`,
        contacts: side === 'inside' ? runnerContacts('boys') : opContacts(side),
      });
    });
  });
  if (!reqWaiting) items.push({ id: 'req-ok', level: 'green', title: 'Product requests: none waiting over 2 hours' });

  // ---------- 7. Bad feedback (you clear these yourself once you've read them) ----------
  let badCount = 0;
  const weekAgo = nowMs - 7 * 24 * 60 * MIN;
  ratings.forEach((r: any) => {
    const reasons: string[] = r.reasons || [];
    if (reasons.includes(RATING_GOOD) || seenRatings.includes(r.id) || ms(r.createdAt) < weekAgo) return;
    badCount++;
    const serious = reasons.some((x) => x === 'Wrong or missing item' || x === 'Damaged or spilled' || x === 'Runner or operator attitude');
    items.push({
      id: `rate-${r.id}`,
      level: serious ? 'red' : 'amber',
      title: `${r.customer || 'A student'} rated ${r.providerName || 'a delivery'}: ${reasons.join(', ') || 'problem'}`,
      detail: `${r.comment ? `"${r.comment}" ` : ''}${new Date(ms(r.createdAt)).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`,
      todo: `Talk to ${r.providerName || 'them'} about it. Repeat problems mean replacement.`,
      clear: {
        label: 'Mark as read',
        run: () => {
          const next = [...seenRatings, r.id];
          setSeenRatings(next);
          writeSeen(next);
        },
      },
    });
  });
  messages.forEach((m: any) => {
    if (m.status === 'done' || Number(m.atMs || 0) < weekAgo) return;
    if (m.type !== 'Complaint' && m.type !== 'Problem with an order') return;
    badCount++;
    items.push({
      id: `fb-${m.id}`,
      level: m.type === 'Problem with an order' ? 'red' : 'amber',
      title: `${m.type} from ${m.name || 'a student'}`,
      detail: `"${m.message}"`,
      todo: 'Reply to the student, then mark it done.',
      contacts: m.phone ? [{ name: m.name || 'Student', phone: m.phone }] : [],
      clear: { label: 'Mark done', run: () => void setFeedbackStatus(m.id, 'done').catch(() => window.alert('Could not update. Try again.')) },
    });
  });
  if (!badCount) items.push({ id: 'fb-ok', level: 'green', title: 'Feedback: no complaints or bad ratings this week' });

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
        Updates live while admin is open. Alerts clear on their own once the runner or operator does what's needed. Feedback clears when you mark it.
      </p>
    </div>
  );
};
