/**
 * Roomly - Central Data Access Layer (api.js) - FIREBASE VERSION
 *
 * Same exported functions as the old localStorage version, now backed by
 * Firebase (Firestore + Auth, free Spark plan).
 *
 * - Customers: no accounts. Saved by phone + 6-digit PIN (hashed document id).
 * - Runners and admin: email/password login (a phone number becomes phone@roomly.app).
 * - Orders: customers create and track them; staff see the full list in real time.
 */

import {
  INITIAL_PRODUCTS,
  INITIAL_CATEGORIES,
  STORE_CONFIG,
  DELIVERY_BATCHES,
  deliveryFeeFor,
  isBagOfWater,
  nextBatchId,
  getBookableSlots,
  slotsForDay,
  timeLabel,
  SWITCH_CUTOFF_MIN,
  PRICING,
  GATE_PICKUP_FEE,
  GATE_PICKUP_ROOMLY,
  EXPRESS_FEE,
  EXPRESS_RUNNER_SHARE,
  EXPRESS_ROOMLY_SHARE,
  EXPRESS_REFUND,
  EXPRESS_CONFIRM_MINUTES,
  SETTLE_BY_HOUR,
  RUNNER_SHARE,
  sellingPrice,
  CATEGORY_SETUP,
  STORE_SOURCE,
} from './config.ts';
import { db, auth } from './firebase.ts';
import { CLOUDINARY } from './cloudinary.ts';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  increment,
  addDoc,
  where,
  deleteField,
  runTransaction,
  documentId,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

export const ADMIN_EMAIL = 'chideraugwu75@gmail.com';

/* ---------------------------- helpers ---------------------------- */

// Firestore rejects `undefined`, so clean everything we write
function slim(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const phoneKey = (phone) => sha256('roomly-phone:' + normalizePhone(phone));
const profileKey = (phone, pin) => sha256('roomly-profile:' + normalizePhone(phone) + ':' + pin);

export function isValidNigerianPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s-]/g, '');
  return /^(070|080|081|090|091)\d{8}$/.test(cleaned);
}

export function normalizePhone(phone) {
  return phone ? phone.replace(/[\s-]/g, '') : '';
}

/* ------------------- staff login (runners + admin) ------------------- */

let staffState = { ready: false, staff: null, denied: false };
const staffSubs = new Set();
function pushStaff(s) {
  staffState = s;
  staffSubs.forEach((f) => f(s));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopOrdersListener();
    pushStaff({ ready: true, staff: null, denied: false });
    return;
  }
  const email = (user.email || '').toLowerCase();
  if (email === ADMIN_EMAIL) {
    pushStaff({ ready: true, staff: { id: email, email, role: 'admin', name: 'Admin' }, denied: false });
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'staff', email));
    if (snap.exists()) {
      const d = snap.data();
      pushStaff({
        ready: true,
        staff: {
          id: email,
          email,
          role: d.role === 'store' || d.role === 'food' ? d.role : 'runner',
          name: d.name || 'Runner',
          phone: d.phone || '',
          payAccount: d.payAccount || null,
        },
        denied: false,
      });
      return;
    }
  } catch (e) {
    /* not staff */
  }
  await signOut(auth);
  pushStaff({ ready: true, staff: null, denied: true });
});

export function subscribeStaff(cb) {
  staffSubs.add(cb);
  cb(staffState);
  return () => {
    staffSubs.delete(cb);
  };
}

/** @returns {any} */
export function getCurrentStaff() {
  return staffState.staff;
}

/** identifier can be an email or a phone number */
/** @returns {Promise<any>} */
export async function loginStaff(identifier, password) {
  const id = String(identifier || '').trim().toLowerCase();
  const email = id.includes('@') ? id : normalizePhone(id) + '@roomly.app';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Wrong phone/email or password.' };
  }
}

/** @returns {Promise<any>} */
export async function logoutStaff() {
  try {
    sessionStorage.removeItem('roomly_admin_auth');
  } catch (e) {
    /* ignore */
  }
  await signOut(auth);
}

// The old client-side admin PIN is gone (real login replaces it)
export function getAdminPin() {
  return '';
}
/** @param {any} [pin] */
export function verifyAdminPin(pin) {
  return false;
}

/* ------------------- home announcement (one at a time, admin writes, everyone reads) ------------------- */

export function subscribeAnnouncement(cb) {
  try {
    return onSnapshot(
      doc(db, 'announcements', 'current'),
      (s) => cb(s.exists() ? s.data() : null),
      () => cb(null)
    );
  } catch (e) {
    cb(null);
    return () => {};
  }
}

export async function saveAnnouncement(a) {
  await setDoc(doc(db, 'announcements', 'current'), { ...a, on: true, updatedAt: new Date().toISOString() });
}

export async function clearAnnouncement() {
  await setDoc(doc(db, 'announcements', 'current'), { on: false, updatedAt: new Date().toISOString() });
}

/* ------------------- store open/closed (shared) ------------------- */

let storeOverride = null;
try {
  onSnapshot(
    doc(db, 'settings', 'store'),
    (s) => {
      const v = s.exists() ? s.data().override : null;
      storeOverride = v === true || v === false ? v : null;
      window.dispatchEvent(new Event('roomly-settings'));
    },
    () => {}
  );
} catch (e) {
  /* ignore */
}

export function getStoreStatus() {
  if (storeOverride !== null) {
    return { isOpen: storeOverride, isOverride: true, openHour: STORE_CONFIG.openHour, closeHour: STORE_CONFIG.closeHour };
  }
  const hour = new Date().getHours();
  return {
    isOpen: hour >= STORE_CONFIG.openHour && hour < STORE_CONFIG.closeHour,
    isOverride: false,
    openHour: STORE_CONFIG.openHour,
    closeHour: STORE_CONFIG.closeHour,
  };
}

export function setStoreOverride(isOpen) {
  storeOverride = isOpen === null ? null : Boolean(isOpen);
  // Only staff can write this; for anyone else the write is rejected and ignored
  setDoc(doc(db, 'settings', 'store'), { override: storeOverride }).catch(() => {});
  return getStoreStatus();
}

/* ---------------- delivery batches switched off for a day ---------------- */

let batchOff = new Set();
try {
  onSnapshot(
    doc(db, 'settings', 'batches'),
    (s) => {
      batchOff = new Set(s.exists() ? s.data().off || [] : []);
      window.dispatchEvent(new Event('roomly-batches'));
    },
    () => {}
  );
} catch (e) {
  /* ignore */
}

export function getBatchOff() {
  return batchOff;
}

/** Batches students can still order into right now (respects runner and admin switches) */
export function getBookableBatches(hasOutside = false) {
  return getBookableSlots(new Date(), hasOutside, batchOff);
}

/** Staff only: switch a batch (key like "2026-10-20|afternoon") on or off */
/** @returns {Promise<void>} */
export async function setBatchOff(key, off) {
  const next = new Set(batchOff);
  if (off) next.add(key);
  else next.delete(key);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const keep = [...next].filter((k) => String(k).split('|')[0] >= todayKey);
  batchOff = new Set(keep);
  window.dispatchEvent(new Event('roomly-batches'));
  await setDoc(doc(db, 'settings', 'batches'), { off: keep });
}

/* ---------------- availability switches (Phase 2) ----------------
 * availability/inside           runners + admin: one switch per inside batch
 * operatorStatus/{auth uid}     each store or food operator: one switch per batch, plus adminOff
 * A switch: { on, start (minutes after midnight), note, by, at (ms) }
 * A batch accepts orders while its switch is on, the night cut-off has not passed,
 * and the "start sending" time has not arrived. Customers only ever see the next one.
 */

let insideSwitches = {};
let runnerUnsettled = {}; // runner uid -> dates not yet settled
let runnerPay = {}; // runner uid -> payment account students pay into
let expressRunners = {}; // runner uid -> { on, name, phone, email, payTo, at }: runners taking express runs now
let operatorDocs = {};
let runnerOff = {}; // runner login email (lower case) -> true when the admin has switched them off
const emailKey = (e) => String(e || '').trim().toLowerCase();
/** Has the admin switched this runner off? (by login email) */
export function isRunnerOff(email) {
  return Boolean(email && runnerOff[emailKey(email)]);
}
const fireBatches = () => window.dispatchEvent(new Event('roomly-batches'));
try {
  onSnapshot(
    doc(db, 'availability', 'inside'),
    (s) => {
      insideSwitches = s.exists() ? s.data().slots || {} : {};
      runnerUnsettled = s.exists() ? s.data().runnerUnsettled || {} : {};
      runnerPay = s.exists() ? s.data().runnerPay || {} : {};
      expressRunners = s.exists() ? s.data().express || {} : {};
      fireBatches();
    },
    () => {}
  );
  onSnapshot(
    collection(db, 'operatorStatus'),
    (snap) => {
      const next = {};
      snap.forEach((d) => {
        next[d.id] = { ...d.data(), id: d.id };
      });
      operatorDocs = next;
      fireBatches();
    },
    () => {}
  );
  // The admin's switch-off for runners. Only the admin can write it, so a runner cannot switch themselves back on.
  onSnapshot(
    doc(db, 'adminControl', 'runners'),
    (s) => {
      runnerOff = s.exists() ? s.data().off || {} : {};
      fireBatches();
    },
    () => {}
  );
} catch (e) {
  /* ignore */
}

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** On, and not yet turned off by the night cut-off (10pm inside, 6pm outside). Switching on after the cut-off lasts until the next night. */
export function switchIsLive(sw, side, now = new Date()) {
  if (!sw || !sw.on) return false;
  const at = new Date(sw.at || 0);
  const cut = new Date(at);
  cut.setHours(0, 0, 0, 0);
  cut.setMinutes(side === 'inside' ? SWITCH_CUTOFF_MIN.inside : SWITCH_CUTOFF_MIN.outside);
  if (at.getTime() >= cut.getTime()) cut.setDate(cut.getDate() + 1);
  return now.getTime() < cut.getTime();
}

/** The moment a batch stops accepting: the day of the batch at the start time the runner or operator set */
export function switchStartDate(opt, sw) {
  const day = new Date(opt.date + 'T00:00:00');
  const min = sw && Number.isFinite(sw.start) ? sw.start : opt.startMin;
  return new Date(day.getTime() + min * 60000);
}

/**
 * A batch keeps taking late orders after its start time until the runner / operator switches it OFF.
 * The last moment it can: the next batch's start the same day, or the night cut-off.
 */
export function batchCloseDate(opt, side) {
  const day = new Date(opt.date + 'T00:00:00');
  const cut = side === 'inside' ? SWITCH_CUTOFF_MIN.inside : SWITCH_CUTOFF_MIN.outside;
  const later = slotsForDay(side, day, 0)
    .map((o) => o.startMin)
    .filter((m) => m > opt.startMin)
    .sort((a, b) => a - b)[0];
  return new Date(day.getTime() + Math.min(later ?? cut, cut) * 60000);
}

/** Switched ON and not past the batch's last moment. side: 'inside' | 'store' | 'food' */
export function batchOpen(opt, sw, side, now = new Date()) {
  return switchIsLive(sw, side === 'inside' ? 'inside' : 'outside', now) && now.getTime() < batchCloseDate(opt, side).getTime();
}
const accepting = (opt, sw, side, now) => batchOpen(opt, sw, side, now);

/** Past the start time: still open, but the student gets 15 minutes to pay */
const LATE_PAY_MS = 15 * 60000;
const payDeadline = (start, now) => (start.getTime() > now.getTime() ? start : new Date(now.getTime() + LATE_PAY_MS));

/** Someone opened this batch and has since switched it OFF: it is done for the day */
function closedByStaff(opt, side) {
  if (side === 'inside') {
    const sw = insideSwitches[opt.key];
    return Boolean(sw && sw.on === false && sw.at);
  }
  return activeOperators(side).some((op) => {
    const sw = (op.slots || {})[opt.key];
    return sw && sw.on === false && sw.at;
  });
}

/** A day must be cleared before 6am the next morning; after that the provider is hidden from checkout */
export function isOverdue(dates, now = new Date()) {
  return (dates || []).some((d) => {
    const due = new Date(d + 'T00:00:00');
    due.setDate(due.getDate() + 1);
    due.setHours(SETTLE_BY_HOUR, 0, 0, 0);
    return now.getTime() >= due.getTime();
  });
}

/** Operators of one kind that the admin has not switched off */
function activeOperators(kind) {
  return Object.values(operatorDocs).filter((o) => o.kind === kind && !o.adminOff && !isOverdue(o.unsettled));
}

/**
 * Next batch still taking orders for 'inside', 'store' or 'food'.
 * Returns { next: { batch, start, startText, by }, note } — next is null when ordering is paused.
 */
export function getNextBatch(side, now = new Date()) {
  const notes = [];
  for (let d = 0; d < 3; d++) {
    for (const opt of slotsForDay(side, now, d)) {
      if (side === 'inside') {
        const sw = insideSwitches[opt.key];
        const blocked = sw && ((sw.byUid && isOverdue(runnerUnsettled[sw.byUid], now)) || isRunnerOff(sw.byEmail));
        if (!blocked && accepting(opt, sw, 'inside', now)) {
          const start = switchStartDate(opt, sw);
          return {
            next: { batch: opt, start: payDeadline(start, now), startText: startTextOf(start), late: start <= now, by: sw.by || '', payTo: runnerPay[sw.byUid] || sw.payTo || null },
            note: '',
          };
        }
        if (sw && sw.note) notes.push(sw.note);
      } else {
        // Any one operator accepting makes the batch open. The earliest start is the safe deadline.
        let best = null;
        for (const op of activeOperators(side)) {
          const sw = (op.slots || {})[opt.key];
          if (accepting(opt, sw, side, now)) {
            const start = switchStartDate(opt, sw);
            if (!best || start < best.start) best = { start, by: op.name || '' };
          } else if (sw && sw.note) notes.push(sw.note);
        }
        if (best)
          return {
            next: { batch: opt, start: payDeadline(best.start, now), startText: startTextOf(best.start), late: best.start <= now, by: best.by },
            note: '',
          };
      }
    }
  }
  // Nobody has opened a batch: students can still order. The order joins the next scheduled batch
  // and goes to a runner / operator who can take it; the student is told it is not opened yet.
  const fb = scheduledNext(side, now);
  if (!fb) return { next: null, note: notes[0] || '' };
  const who = side === 'inside' ? fallbackRunner(now) : fallbackOperators(side)[0];
  // Even with nobody available the student can order: it is scheduled and the account shows once someone takes the batch
  return {
    next: {
      batch: fb.opt,
      start: payDeadline(fb.start, now),
      startText: startTextOf(fb.start),
      late: fb.start <= now,
      by: who ? who.name || '' : '',
      payTo: who ? who.payTo || null : null,
      unconfirmed: true,
      noProvider: !who,
    },
    note: notes[0] || '',
  };
}

/** The next batch on the timetable still open: not closed by staff and not past its last moment */
function scheduledNext(side, now = new Date()) {
  for (let d = 0; d < 3; d++) {
    for (const opt of slotsForDay(side, now, d)) {
      if (now.getTime() >= batchCloseDate(opt, side).getTime()) continue;
      if (closedByStaff(opt, side)) continue;
      return { opt, start: switchStartDate(opt, null) };
    }
  }
  return null;
}

/** Inside: the runner who most recently opened a batch (settled up, with a payment account) */
function fallbackRunner(now = new Date()) {
  const seen = new Set();
  const list = Object.values(insideSwitches)
    .filter((sw) => sw && sw.byUid)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const sw of list) {
    if (seen.has(sw.byUid)) continue;
    seen.add(sw.byUid);
    if (isOverdue(runnerUnsettled[sw.byUid], now) || isRunnerOff(sw.byEmail)) continue;
    const payTo = runnerPay[sw.byUid] || sw.payTo;
    if (payTo) return { uid: sw.byUid, name: sw.by || 'Runner', payTo };
  }
  return null;
}

/** Outside: operators who can take orders (not switched off by you, settled, with an account), fewest orders first */
function fallbackOperators(kind) {
  const today = ymdOf(new Date());
  return activeOperators(kind)
    .filter((o) => o.payTo)
    .map((o) => ({ uid: o.id, name: o.name || 'Operator', payTo: o.payTo, load: o.load && o.load.date === today ? o.load.count || 0 : 0 }))
    .sort((a, b) => a.load - b.load);
}

/**
 * Outside checkout: every store (or food vendor) of this kind, with where they stand against "this batch".
 * "This batch" = the next batch on the timetable that has not closed yet.
 * Each operator: { uid, name, status, batch, start, startText, late, load, payTo }
 *   status 'now'  = taking orders for this batch
 *          'next' = not taking this batch, but switched on for a later one (batch = that later one)
 *          'off'  = no batch switched on yet (shown, not selectable)
 * The student picks one; the order joins that operator's batch.
 * When nobody has switched anything on, students can still order into the next scheduled batch (as before).
 */
export function getOutsideChoices(kind, now = new Date()) {
  const today = ymdOf(now);
  // "This batch": the first timetable batch today or later that has not passed its last moment
  let current = null;
  for (let d = 0; d < 3 && !current; d++) {
    for (const opt of slotsForDay(kind, now, d)) {
      if (now.getTime() < batchCloseDate(opt, kind).getTime()) {
        current = opt;
        break;
      }
    }
  }
  const ops = activeOperators(kind).map((op) => {
    const load = op.load && op.load.date === today ? op.load.count || 0 : 0;
    const base = { uid: op.id, name: op.name || 'Operator', load, payTo: op.payTo || null };
    for (let d = 0; d < 3; d++) {
      for (const opt of slotsForDay(kind, now, d)) {
        const sw = (op.slots || {})[opt.key];
        if (accepting(opt, sw, kind, now)) {
          const start = switchStartDate(opt, sw);
          return {
            ...base,
            status: current && opt.key === current.key ? 'now' : 'next',
            batch: opt,
            start: payDeadline(start, now),
            startText: startTextOf(start),
            late: start <= now,
          };
        }
      }
    }
    return { ...base, status: 'off', batch: null, start: null, startText: '', late: false };
  });
  const rank = { now: 0, next: 1, off: 2 };
  ops.sort((a, b) => rank[a.status] - rank[b.status] || (a.start && b.start ? a.start - b.start : 0) || a.load - b.load);
  const anyOn = ops.some((o) => o.status !== 'off');
  const anyNow = ops.some((o) => o.status === 'now');
  if (anyOn) {
    const first = ops.find((o) => o.status !== 'off');
    return { batch: anyNow ? current : first.batch, current, operators: ops, anyNow, note: '' };
  }
  // Nobody has opened a batch yet: still let the student order into the next scheduled batch
  const { note } = getNextBatch(kind, now);
  const fb = scheduledNext(kind, now);
  const fallback = fallbackOperators(kind).map((o) => ({
    ...o,
    status: 'scheduled',
    batch: fb ? fb.opt : null,
    start: fb ? payDeadline(fb.start, now) : null,
    startText: fb ? startTextOf(fb.start) : '',
    late: fb ? fb.start <= now : false,
  }));
  if (fb && fallback.length) return { batch: fb.opt, current, operators: fallback, others: ops, note, unconfirmed: true };
  // Nobody to take it yet: the order is still allowed and scheduled for the next batch
  if (fb)
    return {
      batch: fb.opt,
      current,
      operators: [],
      others: ops,
      note,
      unconfirmed: true,
      noProvider: true,
      start: payDeadline(fb.start, now),
      startText: startTextOf(fb.start),
      late: fb.start <= now,
    };
  return { batch: null, current, operators: [], others: ops, note };
}

/**
 * Who a student should pay for an order that was placed while nobody was available.
 * Returns { payTo, operatorId, operatorName, turnRunner } or null when nobody has taken the batch yet.
 */
export function getPayProvider(order, now = new Date()) {
  const side = order && (order.cart === 'store' || order.cart === 'food') ? order.cart : 'inside';
  if (side === 'inside') {
    const n = getNextBatch('inside', now).next;
    return n && n.payTo ? { payTo: n.payTo, operatorId: '', operatorName: '', turnRunner: n.by || '' } : null;
  }
  const op = (getOutsideChoices(side, now).operators || []).find((o) => o.payTo && o.status !== 'off');
  return op ? { payTo: op.payTo, operatorId: op.uid, operatorName: op.name, turnRunner: '' } : null;
}

/** Count today's orders per operator, so the next student is pointed at the one with fewer. Best effort. */
async function bumpOperatorLoad(uid) {
  const today = ymdOf(new Date());
  const cur = operatorDocs[uid]?.load;
  const count = cur && cur.date === today ? (cur.count || 0) + 1 : 1;
  try {
    await setDoc(doc(db, 'operatorStatus', uid), { load: { date: today, count } }, { merge: true });
  } catch (e) {
    /* someone else counted at the same moment; not important */
  }
}

const startTextOf = (d) => {
  const min = d.getHours() * 60 + d.getMinutes();
  return timeLabel(min);
};

/** Switches for runners (inside) — today and later only */
export function getInsideSwitches() {
  return insideSwitches;
}

/** Login uid of the signed-in staff member */
export function getMyUid() {
  return auth.currentUser?.uid || '';
}

/** The signed-in operator's own switches */
export function getMyOperatorStatus() {
  const uid = auth.currentUser?.uid;
  return uid ? operatorDocs[uid] || null : null;
}

/** Every operator, for the admin override panel */
export function getAllOperatorStatus() {
  return Object.values(operatorDocs);
}

/**
 * Why students can't see the signed-in runner or operator right now, even if their switches are ON.
 * Returns { reason: 'admin' | 'overdue', text } or null when students can see them.
 */
export function getMyHiddenReason(now = new Date()) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!staff || !uid) return null;
  if (staff.role === 'runner') {
    if (isRunnerOff(auth.currentUser?.email || staff.email))
      return { reason: 'admin', text: 'The admin has switched you off. Students cannot order from you until the admin switches you back on. Finish the orders you already have.' };
    if (isOverdue(runnerUnsettled[uid], now))
      return { reason: 'overdue', text: "A past day's settlement is not confirmed yet, so students cannot see you, even with your switches ON. Send what you owe, tap \"I have sent\", and you show again once Roomly confirms it." };
    return null;
  }
  if (staff.role === 'store' || staff.role === 'food') {
    const mine = operatorDocs[uid] || {};
    if (mine.adminOff) return { reason: 'admin', text: 'The admin has switched you off. Students cannot order from you until the admin allows you again.' };
    if (isOverdue(mine.unsettled, now))
      return { reason: 'overdue', text: "A past day's settlement is not confirmed yet, so students cannot see you, even with your switches ON. Send what you owe, tap \"I have sent\", and you show again once Roomly confirms it." };
  }
  return null;
}

/** Admin: the runners currently switched off (email -> true) */
export function getRunnerOffMap() {
  return { ...runnerOff };
}

/** Admin only: switch a runner off (or allow them again), by their login email */
/** @returns {Promise<void>} */
export async function setRunnerAdminOff(email, off) {
  const key = emailKey(email);
  if (!key) return;
  runnerOff = { ...runnerOff, [key]: Boolean(off) };
  fireBatches();
  await setDoc(doc(db, 'adminControl', 'runners'), { off: { [key]: Boolean(off) }, updatedAt: Date.now() }, { merge: true });
}

function staleKeys(map) {
  const today = ymdOf(new Date());
  const out = {};
  Object.keys(map || {}).forEach((k) => {
    if (String(k).split('|')[0] < today) out[k] = deleteField();
  });
  return out;
}

/** Runners and admin: set one inside batch. patch = { on, start, note } */
/** @returns {Promise<void>} */
export async function setInsideSwitch(key, patch) {
  const staff = getCurrentStaff();
  // Only runners switch inside batches, so students always pay the runner taking the batch
  if (!staff || staff.role !== 'runner') throw new Error('Only runners can switch inside batches.');
  if (patch.on && isRunnerOff(auth.currentUser?.email)) throw new Error('The admin has switched you off. You cannot open a batch until the admin switches you back on.');
  const prev = insideSwitches[key] || {};
  const sw = slim({ ...prev, ...patch, by: staff?.name || 'Runner', byPhone: staff?.phone || '', byUid: auth.currentUser?.uid || '', byEmail: emailKey(auth.currentUser?.email || staff?.email), payTo: staff?.payAccount || null, at: Date.now() });
  insideSwitches = { ...insideSwitches, [key]: sw };
  fireBatches();
  await setDoc(doc(db, 'availability', 'inside'), { slots: { ...staleKeys(insideSwitches), [key]: sw } }, { merge: true });
}

/* ---------------- express runs (inside school) ----------------
 * A runner switches "Express available" on when they can deliver anywhere in school right now.
 * Express shows at checkout only while at least one such runner is on (settled up, with a payment account).
 * The switch turns itself off at the night cut-off, like the batch switches.
 */

/** Runners taking express runs right now: [{ uid, name, phone, email, payTo }] */
export function getExpressRunners(now = new Date()) {
  return Object.entries(expressRunners)
    .filter(([uid, sw]) => sw && sw.on && sw.payTo && switchIsLive(sw, 'inside', now) && !isOverdue(runnerUnsettled[uid], now) && !isRunnerOff(sw.email))
    .map(([uid, sw]) => ({ uid, name: sw.name || 'Runner', phone: sw.phone || '', email: sw.email || '', payTo: sw.payTo }));
}

/** Is the signed-in runner's express switch on? */
export function getMyExpress(now = new Date()) {
  const uid = auth.currentUser?.uid;
  const sw = uid ? expressRunners[uid] : null;
  return Boolean(sw && sw.on && switchIsLive(sw, 'inside', now));
}

/** Runner: switch "Express available" on or off */
/** @returns {Promise<void>} */
export async function setMyExpress(on) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || staff.role !== 'runner') throw new Error('Runners only');
  if (on && !staff.payAccount?.accountNumber) throw new Error('Save your bank account first. Express students pay you directly.');
  if (on && isRunnerOff(auth.currentUser?.email)) throw new Error('The admin has switched you off. You cannot take express runs until the admin switches you back on.');
  const sw = slim({ on: Boolean(on), name: staff.name || 'Runner', phone: staff.phone || '', email: staff.email, payTo: staff.payAccount || null, at: Date.now() });
  expressRunners = { ...expressRunners, [uid]: sw };
  fireBatches();
  await setDoc(doc(db, 'availability', 'inside'), { express: { [uid]: sw } }, { merge: true });
}

/** Store and food operators: set one of their own batches. patch = { on, start, note } */
/** @returns {Promise<void>} */
export async function setOperatorSwitch(key, patch) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || (staff.role !== 'store' && staff.role !== 'food')) throw new Error('Operators only');
  const mine = operatorDocs[uid] || {};
  const prev = (mine.slots || {})[key] || {};
  const sw = slim({ ...prev, ...patch, at: Date.now() });
  operatorDocs = { ...operatorDocs, [uid]: { ...mine, id: uid, kind: staff.role, name: staff.name, slots: { ...(mine.slots || {}), [key]: sw } } };
  fireBatches();
  await setDoc(
    doc(db, 'operatorStatus', uid),
    { kind: staff.role, name: staff.name || 'Operator', payTo: staff.payAccount || null, slots: { ...staleKeys(mine.slots), [key]: sw }, updatedAt: Date.now() },
    { merge: true }
  );
}

/** Create the operator's status record on first visit, so the admin can see them */
/** @returns {Promise<void>} */
export async function ensureOperatorStatus() {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || (staff.role !== 'store' && staff.role !== 'food')) return;
  if (operatorDocs[uid]) return;
  try {
    await setDoc(doc(db, 'operatorStatus', uid), { kind: staff.role, name: staff.name || 'Operator', updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    /* ignore */
  }
}

/** Admin only: switch an operator off (or allow them again) */
/** @returns {Promise<void>} */
export async function setOperatorAdminOff(uid, off) {
  operatorDocs = { ...operatorDocs, [uid]: { ...(operatorDocs[uid] || {}), adminOff: Boolean(off) } };
  fireBatches();
  await setDoc(doc(db, 'operatorStatus', uid), { adminOff: Boolean(off), adminAt: Date.now() }, { merge: true });
}

/* ---------- catalog (one document: categories + products) ---------- */

let catalogCache = null;
let catalogAt = 0;

// catalog/main holds your catalog. catalog/extra holds products runners and operators added by quoting
// a student's request; they go live at once. Reads merge both. Any admin save folds them into main.
async function readCatalog(force = false) {
  if (!force && catalogCache && Date.now() - catalogAt < 60000) return catalogCache;
  try {
    const [snap, extraSnap, ovSnap] = await Promise.all([
      getDoc(doc(db, 'catalog', 'main')),
      getDoc(doc(db, 'catalog', 'extra')).catch(() => null),
      getDoc(doc(db, 'catalog', 'overrides')).catch(() => null),
    ]);
    const d = snap.exists() ? snap.data() : {};
    const main = d.products || INITIAL_PRODUCTS;
    const ids = new Set(main.map((p) => p.id));
    const extra = (extraSnap && extraSnap.exists() ? extraSnap.data().products || [] : []).filter((p) => p && !ids.has(p.id));
    // Operators' price changes and runners' out-of-stock switches win over the saved catalog
    const ov = ovSnap && ovSnap.exists() ? ovSnap.data() : {};
    const prices = ov.prices || {};
    const stock = ov.stock || {};
    const food = ov.food || {};
    const optStock = ov.optStock || {};
    const products = [...main, ...extra].map((p) => {
      let q = p;
      if (prices[p.id]) {
        q = { ...q, costPrice: prices[p.id].cost, price: prices[p.id].price };
        const ops = prices[p.id].ops;
        if (ops && typeof ops === 'object') {
          q.opCosts = Object.fromEntries(Object.entries(ops).map(([uid, o]) => [uid, Number(o && o.cost) || 0]).filter(([, c]) => c > 0));
        }
      }
      if (typeof stock[p.id] === 'boolean') q = { ...q, isAvailable: stock[p.id] };
      // Food: extras and swallow set by operators (each keeps their own cost; students pay from the highest)
      const f = food[p.id];
      if (f && typeof f === 'object') {
        const toOpts = (list) =>
          (Array.isArray(list) ? list : []).map((o) => {
            const costs = Object.entries(o.ops || {}).map(([u, v]) => [u, Number(v && v.cost) || 0]);
            const max = Math.max(0, ...costs.map((c) => c[1]));
            return { id: o.id, name: o.name, cost: max, price: max > 0 ? sellingPrice(max, q.source) : 0, opCosts: Object.fromEntries(costs) };
          });
        q = { ...q, extras: toOpts(f.extras), choices: toOpts(f.choices), choiceTitle: f.choiceTitle || undefined };
      }
      // Today's menu: an extra or swallow switched off is hidden from students
      const mark = (list) => (Array.isArray(list) ? list.map((o) => ({ ...o, off: optStock[`${p.id}:${o.id}`] === false })) : list);
      if (q.extras || q.choices) q = { ...q, extras: mark(q.extras), choices: mark(q.choices) };
      return q;
    });
    catalogCache = { categories: d.categories || INITIAL_CATEGORIES, products, extraCount: extra.length, overrideIds: new Set([...Object.keys(prices), ...Object.keys(stock)]) };
  } catch (e) {
    console.error('Catalog read failed:', e);
    catalogCache = catalogCache || { categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS, extraCount: 0 };
  }
  catalogAt = Date.now();
  return catalogCache;
}

async function writeCatalog(cat) {
  const data = slim({ categories: cat.categories, products: cat.products });
  if (JSON.stringify(data).length > 900000) {
    const msg = 'The catalog is too big to save. Use photo links or connect Cloudinary for photos (see src/cloudinary.ts).';
    window.alert(msg);
    throw new Error(msg);
  }
  await setDoc(doc(db, 'catalog', 'main'), data);
  // Products from quotes are now part of main: keep in extra only any added in the meantime
  if (cat.extraCount) {
    try {
      const ids = new Set(data.products.map((p) => p.id));
      const ex = await getDoc(doc(db, 'catalog', 'extra'));
      const left = (ex.exists() ? ex.data().products || [] : []).filter((p) => p && !ids.has(p.id));
      await setDoc(doc(db, 'catalog', 'extra'), { products: left });
    } catch (e) {
      console.error(e);
    }
  }
  catalogCache = { ...data, extraCount: 0, overrideIds: cat.overrideIds };
  catalogAt = Date.now();
}

/** @returns {Promise<any>} */
export async function getCategories() {
  return (await readCatalog()).categories;
}

/** @returns {Promise<any>} */
export async function addCategory(name, emoji = '📦', initialSubcategories = ['All'], stores = []) {
  const cat = await readCatalog(true);
  const trimmed = name.trim();
  if (!trimmed) return cat.categories;
  if (cat.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return cat.categories;
  cat.categories = [
    ...cat.categories,
    {
      id: `cat-${Date.now()}`,
      name: trimmed,
      emoji: emoji || '📦',
      subcategories: initialSubcategories.includes('All') ? initialSubcategories : ['All', ...initialSubcategories],
      stores,
    },
  ];
  await writeCatalog(cat);
  return cat.categories;
}

/** @returns {Promise<any>} */
export async function addSubcategory(categoryName, subcategoryName) {
  const cat = await readCatalog(true);
  const c = cat.categories.find((x) => x.name.toLowerCase() === categoryName.toLowerCase());
  const sub = subcategoryName.trim();
  if (!c || !sub) return cat.categories;
  if (!c.subcategories.includes(sub)) {
    c.subcategories = [...c.subcategories, sub];
    await writeCatalog(cat);
  }
  return cat.categories;
}

/** Remove a main category. Refused while any product still uses it (move those products first). */
/** @returns {Promise<any>} */
export async function deleteCategory(categoryName) {
  const cat = await readCatalog(true);
  const name = String(categoryName).toLowerCase();
  const inUse = cat.products.filter((p) => String(p.category).toLowerCase() === name).length;
  if (inUse > 0) throw new Error(`${inUse} product(s) still use "${categoryName}". Move them to another category first.`);
  cat.categories = cat.categories.filter((c) => c.name.toLowerCase() !== name);
  await writeCatalog(cat);
  return cat.categories;
}

/** @returns {Promise<any>} */
export async function deleteSubcategory(categoryName, subcategoryName) {
  const cat = await readCatalog(true);
  const c = cat.categories.find((x) => x.name.toLowerCase() === categoryName.toLowerCase());
  if (!c) return cat.categories;
  c.subcategories = c.subcategories.filter((s) => s !== subcategoryName && s !== '');
  if (!c.subcategories.includes('All')) c.subcategories.unshift('All');
  await writeCatalog(cat);
  return cat.categories;
}

/** @returns {Promise<any>} */
export async function getProducts() {
  return (await readCatalog()).products;
}

/** @returns {Promise<any>} */
export async function saveProduct(productData) {
  const cat = await readCatalog(true);
  const products = [...cat.products];
  const index = products.findIndex((p) => p.id === productData.id);
  if (index >= 0) {
    products[index] = { ...products[index], ...productData };
  } else {
    products.unshift({
      ...productData,
      id: productData.id || `prod-${Date.now()}`,
      isAvailable: productData.isAvailable !== false,
      emoji: productData.emoji || '🛍️',
      gradient: productData.gradient || 'from-slate-400/20 to-zinc-500/20',
    });
  }
  cat.products = products;
  await writeCatalog(cat);
  // Your edit is now the price and stock for this product
  if (productData.id && cat.overrideIds && cat.overrideIds.has(productData.id)) {
    try {
      await setDoc(
        doc(db, 'catalog', 'overrides'),
        { prices: { [productData.id]: deleteField() }, stock: { [productData.id]: deleteField() } },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
    }
  }
  return products;
}

/** @returns {Promise<any>} */
export async function deleteProduct(productId) {
  const cat = await readCatalog(true);
  cat.products = cat.products.filter((p) => p.id !== productId);
  await writeCatalog(cat);
  return cat.products;
}

/* ------------- customers (no accounts: phone + 6-digit PIN) ------------- */

/** @returns {Promise<any>} */
export async function getCustomerByPhone(phone, pin) {
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p)) return null;
  try {
    const ps = await getDoc(doc(db, 'phones', await phoneKey(p)));
    const known = ps.exists() ? ps.data() : null;

    let profile = null;
    if (/^\d{6}$/.test(pin || '')) {
      const cs = await getDoc(doc(db, 'customers', await profileKey(p, pin)));
      if (cs.exists()) profile = cs.data();
    }

    if (profile) {
      return {
        ...profile,
        phone: p,
        ordersCount: known?.ordersCount ?? 1,
        deliveredOrdersCount: known?.deliveredCount ?? 0,
        isReturning: true,
      };
    }
    if (known) {
      // This number has ordered before, but no saved profile matches the PIN
      return {
        phone: p,
        name: '',
        area: 'Hostels',
        building: '',
        room: '',
        ordersCount: known.ordersCount || 1,
        deliveredOrdersCount: known.deliveredCount || 0,
        isReturning: true,
        lastOrder: null,
        wrongPin: true,
      };
    }
    return null;
  } catch (err) {
    console.error('Error fetching customer:', err);
    return null;
  }
}

// Profiles are written inside createOrder now. Kept so old imports do not break.
/** @returns {Promise<any>} */
export async function saveCustomer() {
  return null;
}

/** @returns {Promise<any>} */
export async function getAllCustomers() {
  try {
    const [snap, orders] = await Promise.all([getDocs(collection(db, 'customers')), getOrders()]);
    const byPhone = {};
    snap.docs.forEach((d) => {
      const c = d.data();
      if (!byPhone[c.phone] || (c.updatedAt || '') > (byPhone[c.phone].updatedAt || '')) byPhone[c.phone] = c;
    });
    return Object.values(byPhone).map((c) => {
      const mine = orders.filter((o) => o.phone === c.phone);
      const delivered = mine.filter((o) => o.status === 'Delivered');
      return { ...c, ordersCount: mine.length || 1, deliveredOrdersCount: delivered.length, isReturning: true };
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

/* ------------- runners (documents in /staff, id = login email) ------------- */

/** @returns {Promise<any>} */
export async function getRunners() {
  try {
    const snap = await getDocs(collection(db, 'staff'));
    return snap.docs
      .map((d) => ({ isOnline: true, currentZone: 'Campus Runner', ...d.data(), id: d.id }))
      .filter((r) => !r.role || r.role === 'runner');
  } catch (e) {
    return [];
  }
}

/** @returns {Promise<any>} */
export async function updateRunnerStatus(runnerId, isOnline) {
  try {
    await updateDoc(doc(db, 'staff', runnerId), { isOnline });
  } catch (e) {
    console.error(e);
  }
  return getRunners();
}

/** Admin helper: register a runner who already has a login in Firebase Authentication */
/** @returns {Promise<any>} */
export async function addRunner({ email, name, phone, currentZone = 'Campus Runner' }) {
  await setDoc(doc(db, 'staff', String(email).trim().toLowerCase()), { name, phone, currentZone, isOnline: true });
}

/* ------------------------------ orders ------------------------------ */

let ordersCache = null;
let ordersUnsub = null;
const ordersListeners = new Set();

function ensureOrdersListener() {
  if (ordersUnsub || !auth.currentUser) return;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(300));
  ordersUnsub = onSnapshot(
    q,
    (snap) => {
      ordersCache = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      ordersListeners.forEach((f) => f(ordersCache));
    },
    (err) => {
      console.error('Orders listener error:', err);
      ordersCache = ordersCache || [];
      ordersListeners.forEach((f) => f(ordersCache));
    }
  );
}

function stopOrdersListener() {
  if (ordersUnsub) ordersUnsub();
  ordersUnsub = null;
  ordersCache = null;
}

/** Staff only: the latest 300 orders, kept live */
/** @returns {Promise<any>} */
export async function getOrders() {
  if (!auth.currentUser) return [];
  ensureOrdersListener();
  if (ordersCache) return ordersCache;
  return new Promise((resolve) => {
    const f = (o) => {
      ordersListeners.delete(f);
      resolve(o);
    };
    ordersListeners.add(f);
  });
}

/** Staff only: runs the callback whenever any order changes */
/** @returns {() => void} */
export function subscribeOrders(cb) {
  ensureOrdersListener();
  ordersListeners.add(cb);
  return () => {
    ordersListeners.delete(cb);
  };
}

/** @returns {Promise<any>} */
export async function getOrderById(orderId) {
  if (!orderId) return null;
  try {
    const snap = await getDoc(doc(db, 'orders', orderId.trim().toUpperCase()));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch (e) {
    return null;
  }
}

/** Live updates for one order (customer or staff) */
/** @returns {() => void} */
export function subscribeOrder(orderId, cb) {
  return onSnapshot(
    doc(db, 'orders', orderId),
    (s) => {
      if (s.exists()) cb({ ...s.data(), id: s.id });
    },
    () => {}
  );
}

async function patchOrder(orderId, mutate) {
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const order = { ...snap.data(), id: snap.id };
  if (!order.history) order.history = [];
  mutate(order);
  await setDoc(ref, slim(order));
  return order;
}

/** @returns {Promise<any>} */
export async function createOrder(orderPayload) {
  const phone = normalizePhone(orderPayload.phone);
  const pin = orderPayload.pin;
  if (!isValidNigerianPhone(phone)) throw new Error('Invalid phone number');
  if (!/^\d{6}$/.test(pin || '')) throw new Error('A 6-digit PIN is required');

  const pk = await phoneKey(phone);
  const prk = await profileKey(phone, pin);
  const phoneRef = doc(db, 'phones', pk);
  const ps = await getDoc(phoneRef);
  const known = ps.exists() ? ps.data() : null;
  const isRepeatCustomer = Boolean(known && known.ordersCount > 0);

  // One phone number belongs to one customer: a used number needs its original PIN
  const profileRef = doc(db, 'customers', prk);
  const profSnap = await getDoc(profileRef);
  const existingProfile = profSnap.exists() ? profSnap.data() : null;
  if (known && !existingProfile) {
    throw new Error('This phone number is already registered. Enter the correct PIN, or ask Roomly to reset it.');
  }

  const suffix = (Math.random().toString(36) + '0000').slice(2, 6).toUpperCase();
  const orderId = `RM-${Math.floor(1000 + Math.random() * 9000)}-${suffix}`;

  const subtotal = Number(orderPayload.subtotal || 0);
  const batchId = orderPayload.deliveryBatch && orderPayload.deliveryBatch !== 'premium' ? orderPayload.deliveryBatch : nextBatchId();
  const cart = ['inside', 'store', 'food'].includes(orderPayload.cart) ? orderPayload.cart : '';
  const hasStore = cart ? cart === 'store' : (orderPayload.items || []).some((i) => i.source === 'outside');
  const hasFood = cart ? cart === 'food' : (orderPayload.items || []).some((i) => i.source === 'food');
  const hasOutside = hasStore || hasFood;
  // Express (inside only, while a runner has it on): ₦1,200 replaces the normal delivery fee
  const isExpress = Boolean(orderPayload.express) && !hasOutside && getExpressRunners().length > 0;
  if (orderPayload.express && !isExpress) throw new Error('Express is not available right now. Please choose normal delivery.');
  const deliveryFee = isExpress ? EXPRESS_FEE : deliveryFeeFor(subtotal, hasOutside, (orderPayload.items || []).some((i) => isBagOfWater(i.name)));
  const totalAmount = subtotal + deliveryFee;

  // Everyone pays first (pay on delivery has been removed)
  const paymentMethod = 'pay_now';

  const now = new Date();
  const createdAtIso = now.toISOString();
  // Payment deadline follows the switch: the moment the batch stops accepting (falls back to 15 minutes)
  const askedDeadline = Date.parse(orderPayload.paymentDeadline || '');
  // Express: a runner accepts first, then the student pays; give them an hour before the order counts as missed
  const deadline = isExpress
    ? new Date(now.getTime() + 60 * 60 * 1000)
    : Number.isFinite(askedDeadline) && askedDeadline > now.getTime() && askedDeadline < now.getTime() + 3 * 86400000
      ? new Date(askedDeadline)
      : new Date(now.getTime() + 15 * 60 * 1000);
  const deadlineText = deadline.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const batchMeta = DELIVERY_BATCHES.find((b) => b.id === batchId);

  const newOrder = {
    id: orderId,
    phone,
    name: orderPayload.name,
    area: orderPayload.area,
    building: orderPayload.building,
    room: orderPayload.room,
    items: orderPayload.items || [],
    customRequest: orderPayload.customRequest || '',
    hasStore,
    hasFood,
    cart,
    operatorId: orderPayload.operatorId || '',
    operatorName: orderPayload.operatorName || '',
    turnRunner: isExpress ? '' : orderPayload.turnRunner || '',
    lateBatch: isExpress ? false : Boolean(orderPayload.lateBatch),
    // Express: the account shows once a runner accepts
    payTo: isExpress ? null : orderPayload.payTo || null,
    express: isExpress ? { status: 'requested', requestedAt: createdAtIso } : null,
    outOfStock: orderPayload.outOfStock || 'refund',
    gateReq: Boolean(orderPayload.gatePickup && (cart === 'store' || cart === 'food')),
    gatePickup:
      orderPayload.gatePickup && (cart === 'store' || cart === 'food')
        ? { status: 'pending', fee: GATE_PICKUP_FEE, heavy: false, updatedAt: createdAtIso }
        : null,
    payReady: false,
    storeStatus: hasStore ? 'pending' : '',
    foodStatus: hasFood ? 'pending' : '',
    paymentMethod,
    paymentStatus: paymentMethod === 'pay_on_delivery' ? 'pay_on_delivery' : 'unpaid',
    paymentDeadline: deadline.toISOString(),
    isFirstTimeCustomer: !isRepeatCustomer,
    deliveryBatch: batchId,
    deliveryTime: isExpress
      ? 'Express: within 20 minutes of your payment'
      : orderPayload.deliveryTime || (batchMeta ? `${batchMeta.name} (${batchMeta.timeWindow})` : 'Next delivery batch'),
    deliveryDate: orderPayload.deliveryDate || '',
    subtotal,
    deliveryFee,
    totalAmount,
    status: 'Received',
    createdAt: createdAtIso,
    estimatedDeliveryTime: batchMeta?.timeWindow || 'Next delivery batch',
    runnerId: '',
    runnerName: '',
    runnerPhone: '',
    runnerCurrentLocation:
      paymentMethod === 'pay_now' ? `Awaiting student bank transfer (pay before ${deadlineText})` : 'Unassigned. Ready for packaging',
    runnerLocationUpdatedAt: createdAtIso,
    history: [
      {
        status: 'Received',
        timestamp: createdAtIso,
        note: isExpress
          ? 'Express order received. Waiting for an express runner to accept before payment.'
          : paymentMethod === 'pay_now'
            ? `Order received. Pay before ${deadlineText} to join this batch.`
            : 'Order placed by first-time customer (Pay on Delivery). Ready for runner packaging.',
        updatedBy: 'System',
      },
    ],
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'orders', orderId), slim(newOrder));
  // A one-off custom delivery spot must not overwrite the saved room
  const savedLoc =
    orderPayload.isCustomLocation && existingProfile
      ? { area: existingProfile.area, building: existingProfile.building, room: existingProfile.room }
      : { area: orderPayload.area, building: orderPayload.building, room: orderPayload.room };
  batch.set(
    profileRef,
    slim({
      phone,
      name: orderPayload.name,
      ...savedLoc,
      orderIds: [orderId, ...(existingProfile?.orderIds || [])].slice(0, 40),
      updatedAt: createdAtIso,
    })
  );
  batch.set(
    phoneRef,
    known
      ? { ordersCount: (known.ordersCount || 0) + 1, deliveredCount: known.deliveredCount || 0 }
      : { ordersCount: 1, deliveredCount: 0 }
  );
  try {
    await batch.commit();
  } catch (err) {
    console.error('Failed to create order:', err);
    throw new Error('Could not place order');
  }
  if (newOrder.operatorId) bumpOperatorLoad(newOrder.operatorId);
  return newOrder;
}

/**
 * Unpaid orders: 'open' until the batch deadline, then 'missed' (paying now joins the next batch),
 * then 'expired' once the day the order was placed has ended.
 */
export function paymentState(o, now = new Date()) {
  if (!o || o.paymentStatus !== 'unpaid') return 'paid';
  if (o.createdAt && ymdOf(new Date(o.createdAt)) < ymdOf(now)) return 'expired';
  if (o.paymentDeadline && Date.parse(o.paymentDeadline) <= now.getTime()) return 'missed';
  return 'open';
}

/** @returns {Promise<any>} */
export async function markPaymentSent(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      if (paymentState(o) === 'expired') throw new Error('This order expired at the end of the day it was placed.');
      if (o.express && o.express.status === 'requested') throw new Error('Wait for an express runner to accept before you pay.');
      if (o.express && o.express.status === 'accepted') {
        // Express: the runner who accepted is who the student pays; the 20 minutes start from this tap
        if (!o.payTo && o.express.payTo) o.payTo = o.express.payTo;
      } else if (paymentState(o) === 'missed') {
        // Missed the batch: the order joins the next batch that is taking orders
        const side = o.cart === 'store' || o.cart === 'food' ? o.cart : 'inside';
        const { next } = getNextBatch(side);
        if (next) {
          o.deliveryBatch = next.batch.id;
          o.deliveryTime = next.batch.label;
          o.deliveryDate = next.batch.date;
          o.paymentDeadline = next.start.toISOString();
        }
      }
      // Placed while nobody was available: attach the runner / operator whose account the student just saw
      if (!o.payTo) {
        const p = getPayProvider(o);
        if (!p) throw new Error('Nobody has taken this batch yet. The payment account will show on your order once someone does.');
        o.payTo = p.payTo;
        if (p.operatorId) {
          o.operatorId = p.operatorId;
          o.operatorName = p.operatorName;
        }
        if (p.turnRunner) o.turnRunner = p.turnRunner;
      }
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_sent';
      o.paymentSentAt = now;
      o.payReady = true; // store and food operators only see the order from this point
      o.history.push({
        status: o.status,
        timestamp: now,
        note: o.express
          ? 'Student marked payment as sent. The 20-minute express clock starts now.'
          : 'Student marked payment as sent via bank transfer. Awaiting runner/admin verification.',
        updatedBy: o.name || 'Customer',
      });
    });
  } catch (err) {
    console.error('Failed to mark payment sent:', err);
    return null;
  }
}

/**
 * Runner / admin: the student's money arrived.
 * txAt (express only, ISO time) = when the money actually reached the account, read from the bank app.
 * If it is later than the student's "I've paid" tap, the 20 minutes start from it instead.
 */
/** @returns {Promise<any>} */
export async function confirmPayment(orderId, confirmedBy = 'Runner / Admin', txAt = '') {
  try {
    return await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_confirmed';
      o.paymentConfirmedAt = now;
      o.paymentConfirmedBy = confirmedBy;
      let moved = '';
      if (o.express && o.express.status === 'accepted' && txAt && Number.isFinite(Date.parse(txAt))) {
        o.express = { ...o.express, txAt };
        if (o.paymentSentAt && Date.parse(txAt) > Date.parse(o.paymentSentAt)) {
          moved = ` The money arrived at ${new Date(txAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, so the 20 minutes start from then.`;
        }
      }
      o.history.push({
        status: o.status,
        timestamp: now,
        note: `Bank transfer payment confirmed received by ${confirmedBy}. Order attended to!${moved}`,
        updatedBy: confirmedBy,
      });
    });
  } catch (err) {
    console.error('Failed to confirm payment:', err);
    return null;
  }
}

/** @returns {Promise<any>} */
export async function startPackagingOrder(orderId, runnerId, runnerName, runnerPhone) {
  try {
    return await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      o.runnerId = runnerId;
      o.runnerName = runnerName;
      o.runnerPhone = runnerPhone || '';
      o.status = 'Packing';
      o.runnerCurrentLocation = 'At Campus Store / Kitchen (Packaging items)';
      o.runnerLocationUpdatedAt = now;
      o.history.push({
        status: 'Packing',
        timestamp: now,
        note: `Order accepted and is being packaged by ${runnerName}`,
        updatedBy: runnerName,
      });
    });
  } catch (err) {
    console.error('Failed to accept and package order:', err);
    return null;
  }
}

/** @returns {Promise<any>} */
export async function updateOrderStatus(orderId, newStatus, updatedBy = 'Admin', note = '') {
  try {
    let becameDelivered = false;
    let phone = '';
    const updated = await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      becameDelivered = newStatus === 'Delivered' && o.status !== 'Delivered';
      phone = o.phone;
      o.status = newStatus;
      o.updatedAt = now;
      o.history.push({ status: newStatus, timestamp: now, note: note || `Status updated to ${newStatus}`, updatedBy });

      if (newStatus === 'Delivered') {
        o.deliveredAt = now;
        // Express: the runner's time stands if the student forgets to tap "Received"
        if (o.express && o.express.status === 'accepted' && !o.express.runnerDeliveredAt) {
          o.express = { ...o.express, runnerDeliveredAt: now };
        }
        o.runnerCurrentLocation = 'Package Handed over & Delivered';
        o.runnerLocationUpdatedAt = now;
        if (o.paymentMethod === 'pay_on_delivery') {
          o.paymentStatus = 'payment_confirmed';
          o.paymentConfirmedAt = now;
          o.paymentConfirmedBy = updatedBy;
        }
      } else if (newStatus === 'On the way') {
        o.runnerCurrentLocation = 'En route to student hostel/lodge';
        o.runnerLocationUpdatedAt = now;
      } else if (newStatus === 'Packing') {
        o.runnerCurrentLocation = 'At Campus Store / Kitchen (Packaging items)';
        o.runnerLocationUpdatedAt = now;
      }
    });
    if (updated && becameDelivered) {
      recordRunnerDelivery(updated).catch((e) => console.error('Runner summary not saved:', e));
    }
    if (updated && becameDelivered && phone) {
      try {
        await updateDoc(doc(db, 'phones', await phoneKey(phone)), { deliveredCount: increment(1) });
      } catch (e) {
        console.error('Could not update delivered count', e);
      }
    }
    return updated;
  } catch (err) {
    console.error('Failed to update status:', err);
    return null;
  }
}

/** @returns {Promise<any>} */
export async function updateRunnerLocation(orderId, checkpointLocation, runnerName = '') {
  try {
    return await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      o.runnerCurrentLocation = checkpointLocation;
      o.runnerLocationUpdatedAt = now;
      if (runnerName) o.runnerName = runnerName;
      o.history.push({
        status: o.status,
        timestamp: now,
        note: `Runner checkpoint: ${checkpointLocation}`,
        updatedBy: runnerName || 'Delivery Runner',
      });
    });
  } catch (err) {
    console.error('Failed to update runner location:', err);
    return null;
  }
}

/** @returns {Promise<any>} */
export async function assignRunnerToOrder(orderId, runnerId) {
  try {
    const runners = await getRunners();
    const runner = runners.find((r) => r.id === runnerId);
    if (!runner) return null;
    return await patchOrder(orderId, (o) => {
      o.runnerId = runner.id;
      o.runnerName = runner.name;
      o.runnerPhone = runner.phone || '';
      o.history.push({
        status: o.status,
        timestamp: new Date().toISOString(),
        note: `Assigned to ${runner.name}`,
        updatedBy: 'Admin',
      });
    });
  } catch (e) {
    return null;
  }
}

/** @returns {Promise<any>} */
export async function advanceOrderStatus(orderId) {
  const steps = ['Received', 'Packing', 'On the way', 'Delivered'];
  const order = await getOrderById(orderId);
  if (!order) return null;
  const i = steps.indexOf(order.status);
  const next = i >= 0 && i < steps.length - 1 ? steps[i + 1] : 'Received';
  return updateOrderStatus(orderId, next, 'Staff');
}

/** @returns {Promise<any>} */
export async function deleteOrder(orderId) {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------------- customer order history ---------------------- */

/** @returns {Promise<any[]>} */
export async function getMyOrders(phone, pin) {
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p) || !/^\d{6}$/.test(pin || '')) return [];
  try {
    const cs = await getDoc(doc(db, 'customers', await profileKey(p, pin)));
    if (!cs.exists()) return [];
    const d = cs.data();
    let ids = (d.orderIds || []).slice(0, 20);
    if (!ids.length && d.lastOrder && d.lastOrder.id) ids = [d.lastOrder.id];
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'orders', id))));
    return snaps
      .filter((x) => x.exists())
      .map((x) => ({ ...x.data(), id: x.id }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch (e) {
    console.error(e);
    return [];
  }
}

/* ---------------------------- order chat ---------------------------- */

/** @returns {() => void} */
export function subscribeMessages(orderId, cb) {
  const q = query(collection(db, 'orders', orderId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    () => cb([])
  );
}

/** @returns {Promise<any>} */
export async function sendMessage(orderId, sender, name, text) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return null;
  return addDoc(collection(db, 'orders', orderId, 'messages'), {
    sender,
    name: String(name || '').slice(0, 60),
    text: t,
    createdAt: new Date().toISOString(),
  });
}

/** Admin only: free a phone number so the owner can register it again with a new PIN */
/** @returns {Promise<boolean>} */
export async function resetCustomerPhone(phone) {
  const p = normalizePhone(phone);
  const snap = await getDocs(query(collection(db, 'customers'), where('phone', '==', p)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'phones', await phoneKey(p)));
  await batch.commit();
  return true;
}

/* ---------------------------- product photos ---------------------------- */

function compressToDataUrl(file, maxSide = 320, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/**
 * Uploads a product photo and returns its address.
 * With Cloudinary set up (src/cloudinary.ts) the photo is hosted for free and only a link is saved.
 * Without it, a tiny compressed copy is stored in the database (works, but only for a few photos).
 * @returns {Promise<string>}
 */
export async function uploadProductImage(file) {
  if (CLOUDINARY.cloudName && CLOUDINARY.uploadPreset) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY.uploadPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new Error('Photo upload failed. Check the Cloudinary cloud name and preset.');
    const data = await res.json();
    return String(data.secure_url).replace('/upload/', '/upload/w_500,c_limit,q_auto,f_auto/');
  }
  return compressToDataUrl(file);
}

/* ------------------- store and food operators ------------------- */

/** Live list of PAID orders (payment marked as sent) that contain this operator's items. kind: 'store' | 'food' */
export function subscribeOperatorOrders(kind, cb) {
  const field = kind === 'food' ? 'hasFood' : 'hasStore';
  const q = query(collection(db, 'orders'), where(field, '==', true), where('payReady', '==', true), limit(100));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      ),
    (err) => {
      console.error('Operator orders error:', err);
      cb([]);
    }
  );
}

/** Operator marks their part of an order as 'packed' or 'sent' */
/** @returns {Promise<any>} */
export async function updatePartStatus(orderId, kind, status, who = 'Operator') {
  const field = kind === 'food' ? 'foodStatus' : 'storeStatus';
  const label = kind === 'food' ? 'Food' : 'Store';
  try {
    let wasSent = false;
    const updated = await patchOrder(orderId, (o) => {
      wasSent = o[field] === 'sent';
      o[field] = status;
      // An outside cart is finished once it reaches the school gate
      if (status === 'sent' && o.cart === kind && o.status !== 'Delivered') {
        o.status = 'Delivered';
        o.deliveredAt = new Date().toISOString();
      }
      o.history.push({
        status: o.status,
        timestamp: new Date().toISOString(),
        note:
          status === 'sent'
            ? `${label} order delivered by ${who}. It will be at the school gate in under 15 minutes.`
            : `${label} items packed by ${who}`,
        updatedBy: who,
      });
    });
    // A completed order goes into this operator's small daily summary (counted once)
    if (updated && status === 'sent' && !wasSent) {
      recordOperatorDelivery(updated, kind).catch((e) => console.error('Daily summary not saved:', e));
    }
    return updated;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* ---------------- daily statements and settlement (Phases 3 + 5) ----------------
 * settlements/{uid}_{yyyy-mm-dd}: one small record per provider (store, food or runner) per day.
 *   Operators keep the standard (cost) price + ₦600 per cart; they owe the margin + ₦200 per cart.
 *   Runners keep what they spent on items + 30% of the day's profit (item margin + delivery fees);
 *   they owe the other 70%. Gate pickup fees are shown but kept by the runner.
 * due = what the provider owes for that day. They tap "I have sent"; the admin confirms or overrides.
 * A day not settled by 6am next morning hides that provider from checkout.
 */

const OP_KEEP_PER_CART = 600;
const OP_OWE_PER_CART = 200;

/** Cost (standard price) of one cart line. Uses the cost price you entered; otherwise works it back from the margin. */
function costOf(item, products, inside = false, opId = '') {
  const found = products.find((x) => x.id === item.productId);
  // Outside: use the cost of the operator who served this order (students paid from the highest cost)
  const own = found && opId && found.opCosts ? found.opCosts[opId] : 0;
  const p = found && own > 0 ? { ...found, costPrice: own } : found;
  if (p && p.costPrice > 0 && !item.isFood) return { cost: p.costPrice * item.quantity, estimated: false };
  if (p && item.isFood) {
    // Food: plates at the dish's cost + each extra (and swallow choice) at the cost you entered for it
    const opts = [...(p.extras || []), ...(p.choices || []).map((c) => ({ ...c, id: `choice-${c.id}` }))];
    const extras = (item.extras || []).map((e) => {
      const o = opts.find((x) => x.id === e.id);
      const mine = o && opId && o.opCosts ? o.opCosts[opId] : 0;
      return { ...e, cost: mine > 0 ? mine : o?.cost };
    });
    const platesKnown = !(item.plates > 0) || p.costPrice > 0;
    if (platesKnown && extras.every((e) => typeof e.cost === 'number')) {
      const per = (item.plates > 0 ? p.costPrice * item.plates : 0) + extras.reduce((s, e) => s + e.cost * (e.quantity || 0), 0);
      if (per > 0) return { cost: per * (item.quantity || 1), estimated: false };
    }
  }
  const price = item.totalPrice || 0;
  const per = item.quantity > 0 ? price / item.quantity : price;
  const rate = inside
    ? PRICING.schoolMargin
    : per / (1 + PRICING.outsideMargin) >= PRICING.outsideBigFrom
    ? PRICING.outsideBigMargin
    : PRICING.outsideMargin;
  return { cost: Math.round(price / (1 + rate)), estimated: true };
}

const dayId = (uid, day) => `${uid}_${day}`;

/** Add one delivered order (or gate fee) to the signed-in provider's record for today. Counted once per key. */
async function addToMyDay(kind, key, add, estimated, day = ymdOf(new Date()), cart = null) {
  const uid = auth.currentUser?.uid;
  const staff = getCurrentStaff();
  if (!uid || !staff) return;
  const ref = doc(db, 'settlements', dayId(uid, day));
  let created = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists()
      ? snap.data()
      : {
          uid,
          kind,
          name: staff.name || '',
          date: day,
          orders: 0,
          paid: 0,
          keep: 0,
          due: 0,
          sentTotal: 0,
          confirmed: 0,
          settled: false,
          payments: [],
          keys: [],
          carts: [],
          objections: {},
          cleared: false,
          estimated: false,
        };
    if ((d.keys || []).includes(key)) return;
    created = !snap.exists();
    const next = { ...d, keys: [...(d.keys || []), key], estimated: Boolean(d.estimated || estimated), updatedAt: Date.now() };
    // One line per completed cart, so the provider and the admin see the maths cart by cart
    if (cart) {
      next.carts = [...(d.carts || []), slim(cart)];
      next.cleared = false; // a new cart needs clearing again
    }
    Object.entries(add).forEach(([k, v]) => {
      next[k] = Math.round(((next[k] || 0) + v) * 100) / 100;
    });
    tx.set(ref, next);
  });
  // Remember the open day publicly so checkout can hide a provider who has not cleared it.
  // Only when money is owed: a day that owes nothing (gate fees, help shares) must never block anyone.
  if ((add.due || 0) > 0) {
    try {
      if (kind === 'runner') {
        await setDoc(doc(db, 'availability', 'inside'), { runnerUnsettled: { [uid]: arrayUnion(day) } }, { merge: true });
      } else {
        await setDoc(doc(db, 'operatorStatus', uid), { unsettled: arrayUnion(day) }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * One outside cart's maths, the same for the operator's order card and the daily settlement:
 *   paid  = what the student paid (items + ₦800 delivery)
 *   keep  = the operator's cost for the items + ₦600 delivery
 *   owed  = Roomly's margin on the items + ₦200 delivery
 */
function operatorCartMaths(order, kind, products, opId = order.operatorId || '') {
  const source = kind === 'food' ? 'food' : 'outside';
  const items = (order.items || []).filter((i) => i.source === source);
  let paid = 0;
  let cost = 0;
  let estimated = false;
  const lines = items.map((i) => {
    const c = costOf(i, products, false, opId);
    paid += i.totalPrice || 0;
    cost += c.cost;
    estimated = estimated || c.estimated;
    return { name: i.name, quantity: i.quantity, paid: i.totalPrice || 0, cost: c.cost, estimated: c.estimated };
  });
  const share = order.hasStore && order.hasFood ? 0.5 : 1; // only older mixed orders
  const deliveryKeep = OP_KEEP_PER_CART * share;
  const deliveryOwe = OP_OWE_PER_CART * share;
  return {
    lines,
    itemsPaid: paid,
    itemsCost: cost,
    deliveryKeep,
    deliveryOwe,
    paid: paid + deliveryKeep + deliveryOwe,
    keep: cost + deliveryKeep,
    owed: Math.max(0, paid - cost) + deliveryOwe,
    estimated,
  };
}

/** Operator: the maths for one order card (cost per item, what they keep, what they owe Roomly) */
/** @returns {Promise<any>} */
export async function getOperatorOrderMaths(order, kind) {
  const products = (await readCatalog()).products || [];
  return operatorCartMaths(order, kind, products, order.operatorId || auth.currentUser?.uid || '');
}

/** Operator: their part of an outside order reached the gate */
/** @returns {Promise<void>} */
async function recordOperatorDelivery(order, kind) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== kind) return;
  const products = (await readCatalog()).products || [];
  const m = operatorCartMaths(order, kind, products, order.operatorId || auth.currentUser?.uid || '');
  await addToMyDay(
    kind,
    order.id,
    {
      orders: 1,
      paid: m.paid,
      itemsPaid: m.itemsPaid,
      itemsCost: m.itemsCost,
      deliveryKeep: m.deliveryKeep,
      keep: m.keep,
      due: m.owed,
    },
    m.estimated,
    undefined,
    { orderId: order.id, customer: order.name || '', paid: m.paid, keep: m.keep, cost: m.itemsCost, delivery: m.deliveryKeep, owed: m.owed, estimated: m.estimated }
  );
}

/** Profit on an inside order: item margin + delivery fee */
async function insideProfitOf(order) {
  const items = (order.items || []).filter((i) => !i.source || i.source === 'school');
  const products = (await readCatalog()).products || [];
  let paid = 0;
  let spent = 0;
  let estimated = false;
  for (const i of items) {
    const c = costOf(i, products, true);
    paid += i.totalPrice || 0;
    spent += c.cost;
    estimated = estimated || c.estimated;
  }
  const fee = order.deliveryFee || 0;
  return { paid, spent, fee, profit: Math.max(0, paid - spent) + fee, estimated };
}

/**
 * Runner: an inside order was delivered. 30% of the profit is the runners', 70% is owed to Roomly.
 * Shared delivery (Phase 6): with a helper, the 30% splits 50/50; the 70% does not change.
 */
/** @returns {Promise<void>} */
async function recordRunnerDelivery(order) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner') return; // admin taps are not a runner's delivery
  if (order.cart && order.cart !== 'inside') return;
  const { paid, spent, fee, profit, estimated } = await insideProfitOf(order);
  // Express: the item margin still splits 70/30, but the ₦1,200 fee splits 50/50 (₦600 each)
  const express = Boolean(order.express && order.express.status === 'accepted');
  const itemProfit = Math.max(0, paid - spent);
  const share = express ? itemProfit * RUNNER_SHARE + EXPRESS_RUNNER_SHARE : profit * RUNNER_SHARE;
  const owed = express ? itemProfit * (1 - RUNNER_SHARE) + EXPRESS_ROOMLY_SHARE : profit * (1 - RUNNER_SHARE);
  const helperShare = order.helperEmail ? Math.round(share / 2) : 0;
  await addToMyDay(
    'runner',
    order.id,
    {
      orders: 1,
      paid: paid + fee,
      itemsPaid: paid,
      itemsCost: spent,
      deliveryFees: fee,
      profit,
      keep: spent + share - helperShare,
      due: owed,
      owedToHelpers: helperShare,
      sharedOrders: order.helperEmail ? 1 : 0,
      expressOrders: express ? 1 : 0,
      expressOwed: express ? EXPRESS_ROOMLY_SHARE : 0,
    },
    estimated,
    undefined,
    {
      orderId: order.id,
      customer: (order.name || '') + (express ? ' (express)' : ''),
      paid: paid + fee,
      keep: spent + share - helperShare,
      owed: Math.round(owed * 100) / 100,
      helper: order.helperName || '',
      express,
      estimated,
    }
  );
  // Keep the numbers on the order, so the helper's share and a later helper can be worked out exactly
  try {
    await updateDoc(doc(db, 'orders', order.id), { runnerProfit: profit, helperShare });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Runner on the order records who helped (max two runners per order). No acceptance step.
 * helper = { email, name } or null. Before delivery it can be changed; after delivery it can be set once.
 */
/** @returns {Promise<void>} */
export async function setOrderHelper(orderId, helper) {
  const staff = getCurrentStaff();
  if (!staff || (staff.role !== 'runner' && staff.role !== 'admin')) throw new Error('Runners only');
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found');
  const o = { ...snap.data(), id: snap.id };
  if (helper && helper.email === o.runnerId) throw new Error('The helper must be a different runner');
  const delivered = o.status === 'Delivered';
  if (delivered && o.helperEmail) throw new Error('A helper is already recorded on this delivery');
  if (delivered && !helper) return;
  if (delivered && staff.id !== o.runnerId) throw new Error('Only the runner who delivered it can add a helper now');
  const now = new Date().toISOString();
  const patch = {
    helperEmail: helper ? helper.email : '',
    helperName: helper ? helper.name : '',
    history: [
      ...(o.history || []),
      {
        status: o.status,
        timestamp: now,
        note: helper ? `${helper.name} helped with this delivery (30% share split 50/50)` : 'Helper removed',
        updatedBy: staff.name || 'Runner',
      },
    ],
  };
  // Helper added after delivery: move half of the delivering runner's 30% to the helper
  if (delivered && helper) {
    const profit = Number.isFinite(o.runnerProfit) ? o.runnerProfit : (await insideProfitOf(o)).profit;
    const half = Math.round((profit * RUNNER_SHARE) / 2);
    patch.helperShare = half;
    patch.runnerProfit = profit;
    if (staff.role === 'runner' && staff.id === o.runnerId) {
      const day = ymdOf(new Date(o.deliveredAt || now));
      await addToMyDay('runner', 'helpadj-' + o.id, { keep: -half, owedToHelpers: half, sharedOrders: 1 }, false, day);
    }
  }
  await updateDoc(ref, slim(patch));
}

/**
 * Helper's side: deliveries this runner helped with are added to their own record (on the delivery day).
 * They owe nothing on these; the delivering runner hands over the share.
 */
/** @returns {() => void} */
export function syncMyHelpCredits() {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner' || !staff.email) return () => {};
  const done = new Set();
  const q = query(collection(db, 'orders'), where('helperEmail', '==', staff.email), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const since = Date.now() - 3 * 86400000;
      snap.docs.forEach((d) => {
        const o = d.data();
        if (o.status !== 'Delivered' || !(o.helperShare > 0) || done.has(d.id)) return;
        if (Date.parse(o.deliveredAt || '') < since) return;
        done.add(d.id);
        const day = ymdOf(new Date(o.deliveredAt));
        addToMyDay('runner', 'help-' + d.id, { helpShare: o.helperShare, keep: o.helperShare, helpedOrders: 1 }, false, day).catch((e) =>
          console.error(e)
        );
      });
    },
    () => {}
  );
}

/** Runner: a gate pickup they brought to a room. Flat ₦1,000: they keep ₦800 and owe Roomly ₦200. */
async function recordGateFee(order) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner' || !order.gatePickup) return;
  const fee = order.gatePickup.fee || GATE_PICKUP_FEE;
  const owed = Math.min(fee, GATE_PICKUP_ROOMLY);
  await addToMyDay(
    'runner',
    'gate-' + order.id,
    { gatePickups: 1, gateFees: fee, gateOwed: owed, paid: fee, keep: fee - owed, due: owed },
    false,
    undefined,
    { orderId: 'gate-' + order.id, customer: `${order.name || ''} (gate pickup)`, paid: fee, keep: fee - owed, owed, gate: true, estimated: false }
  );
}

/** Runner: they paid ₦600 back to the student of a late express order (it comes out of their own ₦600) */
async function recordExpressRefund(order) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner') return;
  const day = ymdOf(new Date(order.deliveredAt || Date.now()));
  await addToMyDay('runner', 'exrefund-' + order.id, { expressRefunds: EXPRESS_REFUND, keep: -EXPRESS_REFUND }, false, day);
}

/** Live record for today (one document). cb(record | null) */
/** @returns {() => void} */
export function subscribeMyTodaySummary(cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'settlements', dayId(uid, ymdOf(new Date()))),
    (s) => cb(s.exists() ? s.data() : null),
    () => cb(null)
  );
}

/** Records between two dates (yyyy-mm-dd, inclusive). One small read per day with orders. */
/** @returns {Promise<any[]>} */
export async function getMySummaries(from, to) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(
      collection(db, 'settlements'),
      where('uid', '==', uid),
      where(documentId(), '>=', dayId(uid, from)),
      where(documentId(), '<=', dayId(uid, to))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

/** Provider: their days not yet settled (oldest first) */
/** @returns {() => void} */
export function subscribeMyOpenSettlements(cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'settlements'), where('uid', '==', uid), where('settled', '==', false), limit(60));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.date).localeCompare(String(b.date)))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

/** Provider: "I have sent" (partial payments allowed, with a note) */
/** @returns {Promise<void>} */
export async function sendSettlement(id, amount, note) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Enter the amount you sent');
  const ref = doc(db, 'settlements', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Record not found');
    const d = snap.data();
    tx.update(ref, {
      sentTotal: (d.sentTotal || 0) + amt,
      payments: [...(d.payments || []), { amount: amt, note: String(note || '').slice(0, 200), at: new Date().toISOString() }],
      updatedAt: Date.now(),
    });
  });
}

/** Admin: every day not yet settled, across all providers */
/** @returns {() => void} */
export function subscribeOpenSettlements(cb) {
  const q = query(collection(db, 'settlements'), where('settled', '==', false), limit(200));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.date).localeCompare(String(b.date)))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

/** Admin: confirm money received. override = mark the day settled (paid outside the app). */
/** @returns {Promise<void>} */
export async function adminConfirmSettlement(id, amount, override = false) {
  const ref = doc(db, 'settlements', id);
  let rec = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Record not found');
    const d = snap.data();
    const confirmed = (d.confirmed || 0) + Math.max(0, Math.round(Number(amount) || 0));
    const settled = override || confirmed >= Math.round(d.due || 0);
    rec = { ...d, confirmed, settled };
    tx.update(ref, {
      confirmed,
      settled,
      override: Boolean(override),
      settledBy: settled ? getCurrentStaff()?.name || 'Admin' : '',
      settledAt: settled ? new Date().toISOString() : '',
      updatedAt: Date.now(),
    });
  });
  // Cleared: the provider shows at checkout again (if no other day is overdue)
  if (rec && rec.settled) {
    if (rec.kind === 'runner') {
      await setDoc(doc(db, 'availability', 'inside'), { runnerUnsettled: { [rec.uid]: arrayRemove(rec.date) } }, { merge: true });
    } else {
      await setDoc(doc(db, 'operatorStatus', rec.uid), { unsettled: arrayRemove(rec.date) }, { merge: true });
    }
  }
}

/** Staff: where students pay them (shown to the student on their order) */
/** @returns {Promise<void>} */
export async function savePayAccount(acc) {
  const staff = getCurrentStaff();
  if (!staff || staff.role === 'admin') throw new Error('Staff only');
  const clean = {
    bankName: String(acc.bankName || '').trim().slice(0, 60),
    accountNumber: String(acc.accountNumber || '').replace(/\D/g, '').slice(0, 10),
    accountName: String(acc.accountName || '').trim().slice(0, 80),
  };
  if (!clean.bankName || clean.accountNumber.length !== 10 || !clean.accountName) {
    throw new Error('Enter the bank name, the 10-digit account number and the account name');
  }
  await updateDoc(doc(db, 'staff', staff.email), { payAccount: clean });
  pushStaff({ ...staffState, staff: { ...staff, payAccount: clean } });
  // Show it on new orders right away (operators: their status record; runners: the inside batches record)
  const uid = auth.currentUser?.uid;
  if (uid && (staff.role === 'store' || staff.role === 'food')) {
    await setDoc(doc(db, 'operatorStatus', uid), { payTo: clean }, { merge: true });
  } else if (uid && staff.role === 'runner') {
    await setDoc(doc(db, 'availability', 'inside'), { runnerPay: { [uid]: clean } }, { merge: true });
  }
}

/* ---------------- gate pickup (Phase 4) ----------------
 * An outside order can ask an inside runner to bring the parcel from the gate to the room.
 * Flat ₦1,000. Runners read the items, then accept or refuse; the student pays only after a runner accepts.
 * After accepting they can mark it delivered, or refund if the job turned out too small.
 */

/** Runners: live list of gate pickup requests (newest first) */
/** @returns {() => void} */
export function subscribeGatePickups(cb) {
  const q = query(collection(db, 'orders'), where('gateReq', '==', true), limit(60));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      ),
    () => cb([])
  );
}

/** Runners: action = 'accept' | 'refuse' | 'delivered' | 'refund'. heavy only matters on accept. */
/** @returns {Promise<any>} */
export async function updateGatePickup(orderId, action, heavy = false) {
  const staff = getCurrentStaff();
  const who = staff?.name || 'Runner';
  const status = { accept: 'accepted', refuse: 'refused', delivered: 'delivered', refund: 'refunded' }[action];
  if (!status) return null;
  if (action === 'accept' && isRunnerOff(auth.currentUser?.email)) {
    window.alert('The admin has switched you off. You cannot take new gate pickups until the admin switches you back on.');
    return { blocked: true };
  }
  let gateDone = null;
  try {
    const res = await patchOrder(orderId, (o) => {
      const gp = o.gatePickup || { status: 'pending', fee: GATE_PICKUP_FEE };
      if (action === 'accept') {
        // Flat fee: the runner checks the parcel and accepts, or declines it if they can't carry it
        gp.heavy = false;
        gp.fee = GATE_PICKUP_FEE;
        gp.runnerName = who;
        gp.runnerPhone = staff?.phone || '';
        gp.runnerPay = staff?.payAccount || null; // the student pays the runner this account
        gp.paid = false;
      }
      gp.status = status;
      gp.updatedAt = new Date().toISOString();
      o.gatePickup = gp;
      gateDone = action === 'delivered' ? o : null;
      o.history.push({
        status: o.status,
        timestamp: gp.updatedAt,
        note: `Gate pickup ${status}${action === 'accept' ? ` (₦${gp.fee.toLocaleString()})` : ''} by ${who}`,
        updatedBy: who,
      });
    });
    if (gateDone) recordGateFee(gateDone).catch((e) => console.error(e));
    return res;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* ---------------- product requests and price changes (Phase 7) ----------------
 * catalogRequests/{id}: an operator asks to change the cost price of one of their products,
 * or to add a new product. The admin approves (the catalog is updated, margin added) or rejects.
 */

/** Operator: send a request. req = { type: 'price' | 'new', productId?, productName, newCost, category?, unit?, imageUrl?, note? } */
/** @returns {Promise<void>} */
export async function sendCatalogRequest(req) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || (staff.role !== 'store' && staff.role !== 'food')) throw new Error('Operators only');
  const newCost = Math.round(Number(req.newCost) || 0);
  if (newCost <= 0) throw new Error('Enter the cost price you pay');
  if (!String(req.productName || '').trim()) throw new Error('Enter the product name');
  const source = staff.role === 'food' ? 'food' : 'outside';
  const products = (await readCatalog()).products || [];
  const current = req.productId ? products.find((p) => p.id === req.productId) : null;
  if (req.type === 'price' && !current) throw new Error('Choose one of your products');
  await addDoc(
    collection(db, 'catalogRequests'),
    slim({
      type: req.type === 'price' ? 'price' : 'new',
      status: 'pending',
      operatorUid: uid,
      operatorName: staff.name || 'Operator',
      kind: staff.role,
      source,
      productId: current ? current.id : '',
      productName: String(req.productName).trim().slice(0, 80),
      currentCost: current ? current.costPrice || 0 : 0,
      currentPrice: current ? current.price || 0 : 0,
      newCost,
      newPrice: sellingPrice(newCost, source),
      category: String(req.category || (current ? current.category : '') || '').slice(0, 60),
      unit: String(req.unit || '').slice(0, 60),
      imageUrl: String(req.imageUrl || '').slice(0, 500),
      note: String(req.note || '').slice(0, 200),
      createdAt: new Date().toISOString(),
    })
  );
}

/** Operator: their own requests, newest first */
/** @returns {() => void} */
export function subscribeMyCatalogRequests(cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'catalogRequests'), where('operatorUid', '==', uid), limit(30));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))),
    () => cb([])
  );
}

/** Admin: requests waiting for a decision */
/** @returns {() => void} */
export function subscribePendingCatalogRequests(cb) {
  const q = query(collection(db, 'catalogRequests'), where('status', '==', 'pending'), limit(50));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))),
    () => cb([])
  );
}

/** Admin: approve (updates the catalog) or reject a request */
/** @returns {Promise<void>} */
export async function decideCatalogRequest(r, approve, adminNote = '') {
  if (approve) {
    if (r.type === 'price') {
      await saveProduct({ id: r.productId, costPrice: r.newCost, price: sellingPrice(r.newCost, r.source) });
    } else {
      const isFoodCat = String(r.category).toLowerCase() === 'food';
      await saveProduct({
        name: r.productName,
        category: r.category || '',
        subcategory: 'All',
        costPrice: r.newCost,
        price: sellingPrice(r.newCost, r.source),
        source: r.source,
        unit: r.unit || '',
        imageUrl: r.imageUrl || '',
        isFood: r.kind === 'food' && isFoodCat,
        description: r.note || '',
        isAvailable: true,
      });
    }
  }
  await updateDoc(doc(db, 'catalogRequests', r.id), {
    status: approve ? 'approved' : 'rejected',
    adminNote: String(adminNote || '').slice(0, 200),
    decidedAt: new Date().toISOString(),
  });
}

/* ---------------- product requests from students (Fix batch 1) ----------------
 * productRequests/{id}: a student asks for products not in the store (name, estimated price, optional photo).
 * It goes to runners (inside), store operators or food operators. The first to reply sets the cost price;
 * the student sees only the price with the margin added, and the products go live in the store at once.
 */

const SIDE_SOURCE = { inside: 'school', store: 'outside', food: 'food' };

/** Student: send a request. items = [{ name, estimate, photoUrl }] */
/** @returns {Promise<string>} the request id */
export async function createProductRequest({ side, items, note, category, phone, name }) {
  const clean = (items || [])
    .map((i) => ({
      name: String(i.name || '').trim().slice(0, 80),
      estimate: Math.max(0, Math.round(Number(i.estimate) || 0)),
      photoUrl: String(i.photoUrl || '').slice(0, 500),
    }))
    .filter((i) => i.name);
  if (!clean.length) throw new Error('Add at least one product name');
  if (clean.length > 15) throw new Error('Up to 15 products per request');
  const p = normalizePhone(phone || '');
  const ref = await addDoc(
    collection(db, 'productRequests'),
    slim({
      side: ['inside', 'store', 'food'].includes(side) ? side : 'inside',
      items: clean,
      note: String(note || '').trim().slice(0, 300),
      category: String(category || '').slice(0, 60),
      phone: isValidNigerianPhone(p) ? p : '',
      name: String(name || '').trim().slice(0, 60),
      status: 'open',
      createdAt: new Date().toISOString(),
    })
  );
  return ref.id;
}

/** Student: live updates for one request (the id is the key, like an order id) */
/** @returns {() => void} */
export function subscribeProductRequest(id, cb) {
  return onSnapshot(
    doc(db, 'productRequests', id),
    (s) => cb(s.exists() ? { ...s.data(), id: s.id } : null),
    () => cb(null)
  );
}

/** Runners / operators: recent requests for their side (open first) */
/** @returns {() => void} */
export function subscribeSideRequests(side, cb) {
  const q = query(collection(db, 'productRequests'), where('side', '==', side), limit(40));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => (a.status === b.status ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.status === 'open' ? -1 : 1))
      ),
    () => cb([])
  );
}

/** Which side the signed-in staff member quotes for */
export function mySide() {
  const r = getCurrentStaff()?.role;
  return r === 'store' ? 'store' : r === 'food' ? 'food' : 'inside';
}

/**
 * Runner / operator: quote a request. costs[i] = cost price for item i (0 = not available), category for the new products.
 * First reply wins. Each priced item becomes a live product with the margin added.
 */
/** @returns {Promise<void>} */
export async function quoteProductRequest(reqId, costs, category) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!staff || !uid) throw new Error('Sign in first');
  const ref = doc(db, 'productRequests', reqId);
  let quoted = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Request not found');
    const r = snap.data();
    if (r.status !== 'open') throw new Error('The price quote for this product has already been sent to the customer.');
    const source = SIDE_SOURCE[r.side] || 'school';
    const quotes = r.items.map((it, i) => {
      const cost = Math.max(0, Math.round(Number(costs[i]) || 0));
      if (!cost) return { name: it.name, available: false, price: 0, productId: '' };
      return { name: it.name, available: true, price: sellingPrice(cost, source), productId: `prod-req-${reqId}-${i}`, cost };
    });
    if (!quotes.some((q) => q.available)) throw new Error('Enter a cost price for at least one product');
    quoted = { r, quotes, source };
    tx.update(ref, {
      status: 'quoted',
      quotes: quotes.map(({ cost, ...q }) => q), // the student never sees cost or margin
      quotedBy: { uid, name: staff.name || '' },
      quotedAt: new Date().toISOString(),
    });
  });
  // The priced products go live for everyone, in the section and category requested
  const { r, quotes, source } = quoted;
  const cat = String(category || r.category || '').trim();
  const fresh = quotes
    .map((q, i) =>
      q.available
        ? slim({
            id: q.productId,
            name: q.name,
            category: cat, // empty = no category (shows under All)
            subcategory: 'All',
            price: q.price,
            costPrice: q.cost,
            source,
            imageUrl: r.items[i].photoUrl || '',
            emoji: '🛍️',
            gradient: 'from-slate-400/20 to-zinc-500/20',
            isAvailable: true,
            addedBy: staff.name || '',
          })
        : null
    )
    .filter(Boolean);
  await setDoc(doc(db, 'catalog', 'extra'), { products: arrayUnion(...fresh) }, { merge: true });
  catalogAt = 0; // next read picks them up
}

/** Student: ask an inside runner to bring an outside order from the gate to the room (flat ₦1,000, asked before paying) */
/** @returns {Promise<any>} */
export async function requestGatePickup(orderId, building = '', room = '') {
  try {
    return await patchOrder(orderId, (o) => {
      if (o.cart !== 'store' && o.cart !== 'food') throw new Error('Only outside orders');
      if (o.gatePickup && o.gatePickup.status !== 'refused' && o.gatePickup.status !== 'refunded') return;
      const now = new Date().toISOString();
      // Where the runner should bring it
      if (building && room) {
        o.area = 'Hostels';
        o.building = String(building).slice(0, 40);
        o.room = String(room).replace(/\s+/g, '').toUpperCase().slice(0, 8);
      }
      o.gateReq = true;
      o.gatePickup = { status: 'pending', fee: GATE_PICKUP_FEE, heavy: false, updatedAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student asked for gate to room pickup', updatedBy: o.name || 'Customer' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* ---------------- Fix batch 2: order stages, clear / object settlement, admin views ----------------
 * Stages: Active (student says paid) -> Payment Confirmed (provider checked their account) -> Completed.
 * Settlement: each provider's day lists its completed carts (paid - keep = owed). The provider taps
 * All cleared, or objects to a cart with a reason; the admin corrects the amount or dismisses it.
 * After clearing, the provider sends the money and taps "I have sent"; the admin confirms receipt.
 */

/** Which stage an order is in: 'unpaid' | 'active' | 'confirmed' | 'completed' | 'cancelled' */
export function orderStage(o) {
  if (!o) return 'unpaid';
  if (o.status === 'Cancelled') return 'cancelled';
  if (o.status === 'Delivered') return 'completed';
  if (o.paymentStatus === 'payment_confirmed') return 'confirmed';
  if (o.paymentStatus === 'payment_sent' || o.paymentStatus === 'pay_on_delivery') return 'active';
  return 'unpaid';
}

/** Store / food operator: they checked their account and the student's money arrived */
/** @returns {Promise<any>} */
export async function operatorConfirmPayment(orderId) {
  const staff = getCurrentStaff();
  const who = staff?.name || 'Operator';
  try {
    return await patchOrder(orderId, (o) => {
      if (o.paymentStatus !== 'payment_sent') return;
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_confirmed';
      o.paymentConfirmedAt = now;
      o.paymentConfirmedBy = who;
      o.history.push({ status: o.status, timestamp: now, note: `Payment confirmed by ${who}`, updatedBy: who });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Provider: agree with the day's statement. Not allowed while an objection is open. */
/** @returns {Promise<void>} */
export async function clearMyDay(id) {
  const ref = doc(db, 'settlements', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Record not found');
  const open = Object.values(snap.data().objections || {}).filter((x) => x && x.status === 'open').length;
  if (open) throw new Error('You have an open objection. Wait for Roomly to answer it first.');
  await updateDoc(ref, { cleared: true, clearedAt: new Date().toISOString() });
}

/** Provider: object to one cart, with the reason */
/** @returns {Promise<void>} */
export async function objectToCart(id, orderId, reason) {
  const r = String(reason || '').trim().slice(0, 300);
  if (!r) throw new Error('Say why this cart is wrong');
  await updateDoc(doc(db, 'settlements', id), {
    [`objections.${orderId}`]: { reason: r, status: 'open', at: new Date().toISOString(), reply: '' },
    cleared: false,
  });
}

/**
 * Admin: answer an objection. newOwed = corrected amount owed on that cart (null = dismiss, amount stays).
 */
/** @returns {Promise<void>} */
export async function adminResolveObjection(id, orderId, newOwed, reply) {
  const ref = doc(db, 'settlements', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Record not found');
    const d = snap.data();
    const obj = (d.objections || {})[orderId];
    if (!obj) throw new Error('No objection on this cart');
    const patch = {
      [`objections.${orderId}`]: {
        ...obj,
        status: newOwed === null ? 'dismissed' : 'corrected',
        reply: String(reply || '').slice(0, 300),
        answeredAt: new Date().toISOString(),
      },
    };
    if (newOwed !== null) {
      const amt = Math.max(0, Math.round(Number(newOwed) || 0));
      const carts = (d.carts || []).map((c) => (c.orderId === orderId ? { ...c, owed: amt, keep: Math.max(0, (c.paid || 0) - amt) } : c));
      const old = (d.carts || []).find((c) => c.orderId === orderId);
      const delta = amt - (old ? old.owed || 0 : 0);
      patch.carts = carts;
      patch.due = Math.max(0, Math.round(((d.due || 0) + delta) * 100) / 100);
      patch.keep = Math.round(((d.keep || 0) - delta) * 100) / 100;
    }
    tx.update(ref, patch);
  });
}

/** Admin: every provider's record for one day */
/** @returns {() => void} */
export function subscribeSettlementsByDate(day, cb) {
  const q = query(collection(db, 'settlements'), where('date', '==', day), limit(200));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

/** Admin: records between two dates (for the Money tab) */
/** @returns {Promise<any[]>} */
/** Admin: every day not yet settled that owes money, across all dates, live. Used for "Who owes you" and the Money badge. */
export function subscribeAdminOwing(cb) {
  try {
    return onSnapshot(
      query(collection(db, 'settlements'), where('settled', '==', false), limit(1000)),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((r) => (r.due || 0) > 0)),
      (e) => {
        console.error(e);
        cb([]);
      }
    );
  } catch (e) {
    cb([]);
    return () => {};
  }
}

/** What a not-yet-settled day needs: 'waiting' (sent, you confirm), 'overdue' (not sent, hidden), 'due' (not overdue yet) */
export function settlementState(r, now = new Date()) {
  if ((r.sentTotal || 0) > (r.confirmed || 0)) return 'waiting';
  return isOverdue([r.date], now) ? 'overdue' : 'due';
}

export async function getSettlementsRange(from, to) {
  try {
    const q = query(collection(db, 'settlements'), where('date', '>=', from), where('date', '<=', to), limit(2000));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

/* ---------------- three stores: categories, operator prices, runner stock (Fix batch 3a) ---------------- */

/**
 * Admin: add Roomly's standard categories and subcategories (CATEGORY_SETUP) to every store.
 * Only adds what is missing. Nothing is deleted and no product is moved.
 */
/** @returns {Promise<{ categories: any[], added: string[], subsAdded: number }>} */
export async function setupStoreCategories() {
  const cat = await readCatalog(true);
  const categories = [...cat.categories];
  const added = [];
  let subsAdded = 0;
  Object.entries(CATEGORY_SETUP).forEach(([store, list]) =>
    list.forEach((c) => {
      const i = categories.findIndex((x) => String(x.name).toLowerCase() === c.name.toLowerCase());
      if (i < 0) {
        categories.push({
          id: `cat-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: c.name,
          emoji: c.emoji,
          subcategories: ['All', ...c.subs],
          stores: [store],
        });
        added.push(c.name);
        subsAdded += c.subs.length;
        return;
      }
      const cur = categories[i];
      const subs = [...(cur.subcategories || ['All'])];
      if (!subs.includes('All')) subs.unshift('All');
      c.subs.forEach((s) => {
        if (!subs.some((x) => String(x).toLowerCase() === s.toLowerCase())) {
          subs.push(s);
          subsAdded++;
        }
      });
      categories[i] = { ...cur, subcategories: subs, stores: Array.from(new Set([...(cur.stores || []), store])) };
    })
  );
  cat.categories = categories;
  await writeCatalog(cat);
  return { categories, added, subsAdded };
}

const myStore = () => {
  const r = getCurrentStaff()?.role;
  return r === 'store' ? 'store' : r === 'food' ? 'food' : r === 'runner' ? 'inside' : '';
};

/** Operator: change the cost price of one of their products. The student price is worked out with your margin. */
/** @returns {Promise<void>} */
export async function operatorSetPrice(productId, cost) {
  const store = myStore();
  // Runners change inside prices; operators change their own store's
  if (store !== 'store' && store !== 'food' && store !== 'inside') throw new Error('Runners and operators only');
  const c = Math.round(Number(cost) || 0);
  if (c <= 0) throw new Error('Enter your cost price');
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  if (!p || p.source !== STORE_SOURCE[store]) throw new Error('You can only change your own store\'s products');
  const uid = auth.currentUser?.uid || '';
  const name = getCurrentStaff()?.name || '';
  const at = new Date().toISOString();
  // Each operator keeps their own cost. Students see one price, worked out from the highest cost.
  const ovSnap = await getDoc(doc(db, 'catalog', 'overrides')).catch(() => null);
  const cur = (ovSnap && ovSnap.exists() && (ovSnap.data().prices || {})[productId]) || {};
  const ops = { ...(cur.ops || {}) };
  if (!Object.keys(ops).length && p.addedByUid && p.addedByUid !== uid && p.costPrice > 0) {
    ops[p.addedByUid] = { cost: p.costPrice, name: p.addedBy || '', at: '' }; // the operator who added it keeps their cost
  }
  ops[uid] = { cost: c, name, at };
  const highest = Math.max(...Object.values(ops).map((o) => Number(o && o.cost) || 0));
  const price = sellingPrice(highest, p.source);
  await setDoc(doc(db, 'catalog', 'overrides'), { prices: { [productId]: { cost: highest, price, ops, by: name, at } } }, { merge: true });
  catalogAt = 0;
}

/** Operator: add a product they sell. It goes live at once in their store. */
/** @returns {Promise<void>} */
export async function operatorAddProduct({ name, category, cost, unit, imageUrl, group = '' }) {
  const store = myStore();
  if (store !== 'store' && store !== 'food' && store !== 'inside') throw new Error('Runners and operators only');
  const n = String(name || '').trim().slice(0, 80);
  const c = Math.round(Number(cost) || 0);
  if (!n) throw new Error('Enter the product name');
  if (c <= 0) throw new Error('Enter your cost price');
  const source = STORE_SOURCE[store];
  const product = slim({
    id: `prod-op-${Date.now()}`,
    name: n,
    category: String(category || ''),
    subcategory: String(group || '').trim().slice(0, 40) || 'All',
    costPrice: c,
    price: sellingPrice(c, source),
    source,
    unit: String(unit || '').slice(0, 60),
    imageUrl: String(imageUrl || '').slice(0, 500),
    emoji: '🛍️',
    gradient: 'from-slate-400/20 to-zinc-500/20',
    isAvailable: true,
    isFood: store === 'food' && String(category).toLowerCase() !== 'drinks',
    addedBy: getCurrentStaff()?.name || '',
    addedByUid: auth.currentUser?.uid || '',
  });
  await setDoc(doc(db, 'catalog', 'extra'), { products: arrayUnion(product) }, { merge: true });
  catalogAt = 0;
}

/** Operator: their food item's extras and pick-one choice. lists = [{ name, cost }] (cost is what THEY pay). */
/** @returns {Promise<void>} */
export async function operatorSaveFoodOptions(productId, extras, choiceTitle, choices) {
  const store = myStore();
  if (store !== 'food') throw new Error('Food operators only');
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  if (!p || p.source !== 'food') throw new Error('You can only change your own food items');
  const uid = auth.currentUser?.uid || '';
  const name = getCurrentStaff()?.name || '';
  const at = new Date().toISOString();
  const ovSnap = await getDoc(doc(db, 'catalog', 'overrides')).catch(() => null);
  const cur = (ovSnap && ovSnap.exists() && (ovSnap.data().food || {})[productId]) || {};
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // The list is shared: other operators keep their own cost on items that stay on it
  const build = (list, prev) =>
    (list || [])
      .map((x) => ({ id: slug(x.name), name: String(x.name).trim().slice(0, 40), cost: Math.max(0, Math.round(Number(x.cost) || 0)) }))
      .filter((x, i, a) => x.id && a.findIndex((y) => y.id === x.id) === i)
      .slice(0, 20)
      .map((x) => {
        const old = (prev || []).find((o) => o.id === x.id);
        return { id: x.id, name: x.name, ops: { ...((old && old.ops) || {}), [uid]: { cost: x.cost, name, at } } };
      });
  const next = slim({
    extras: build(extras, cur.extras),
    choices: build(choices, cur.choices),
    choiceTitle: String(choiceTitle || '').trim().slice(0, 30),
    by: name,
    at,
  });
  await setDoc(doc(db, 'catalog', 'overrides'), { food: { [productId]: next } }, { merge: true });
  catalogAt = 0;
}

/** Operator: switch one of their products on or off for today (off hides it from students) */
/** @returns {Promise<void>} */
export async function operatorSetStock(productId, inStock) {
  const store = myStore();
  if (store !== 'store' && store !== 'food') throw new Error('Operators only');
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  if (!p || p.source !== STORE_SOURCE[store]) throw new Error("You can only change your own store's products");
  await setDoc(doc(db, 'catalog', 'overrides'), { stock: { [productId]: Boolean(inStock) } }, { merge: true });
  catalogAt = 0;
}

/** Runner (inside food) or food operator: switch one extra or swallow on or off for today */
/** @returns {Promise<void>} */
export async function setOptionStock(productId, optId, inStock) {
  const store = myStore();
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  const ok = p && ((store === 'inside' && p.source !== 'outside' && p.source !== 'food') || (store === 'food' && p.source === 'food'));
  if (!ok) throw new Error('Not your item');
  await setDoc(doc(db, 'catalog', 'overrides'), { optStock: { [`${productId}:${optId}`]: Boolean(inStock) } }, { merge: true });
  catalogAt = 0;
}

/** Runner: mark an inside product out of stock (false) or back in stock (true) */
/** @returns {Promise<void>} */
export async function runnerSetStock(productId, inStock) {
  if (myStore() !== 'inside') throw new Error('Runners only');
  await setDoc(doc(db, 'catalog', 'overrides'), { stock: { [productId]: Boolean(inStock) } }, { merge: true });
  catalogAt = 0;
}

/** Fresh product list (skips the 1-minute cache), for staff screens */
/** @returns {Promise<any[]>} */
export async function getProductsFresh() {
  return (await readCatalog(true)).products;
}

/* ---------------- Admin dashboard (Fix batch 3b) ----------------
 * statsDaily/{yyyy-mm-dd}: one small summary per day, built from that day's orders.
 * Days older than 2 days are saved once and then just read; the last 2 days are counted live
 * (orders can still complete). The first open imports past orders the same way.
 */

const STORE_OF_ORDER = (o) =>
  o.cart === 'store' || o.cart === 'food'
    ? o.cart
    : o.cart === 'inside'
    ? 'inside'
    : o.hasStore && !o.hasFood
    ? 'store'
    : o.hasFood && !o.hasStore
    ? 'food'
    : 'inside';

const emptyStore = () => ({
  placed: 0,
  unpaid: 0,
  completed: 0,
  sales: 0,
  earnings: 0,
  late: 0,
  firstTime: 0,
  products: {},
  categories: {},
  hours: {},
  hostels: {},
  batches: {},
  customers: {},
  oos: {},
  team: {},
});

/** Your earnings on one completed order, and per product line (estimated where no cost price is set) */
function orderMoney(o, products) {
  const store = STORE_OF_ORDER(o);
  const lines = [];
  let margin = 0;
  for (const i of o.items || []) {
    const inside = store === 'inside';
    if (!inside && i.source !== (store === 'food' ? 'food' : 'outside')) continue;
    if (inside && i.source && i.source !== 'school') continue;
    const c = costOf(i, products, inside, inside ? '' : o.operatorId || '');
    const m = Math.max(0, (i.totalPrice || 0) - c.cost);
    margin += m;
    lines.push({ i, m: inside ? m * (1 - RUNNER_SHARE) : m });
  }
  const earnings =
    store === 'inside' ? (margin + (o.deliveryFee || 0)) * (1 - RUNNER_SHARE) : margin + (o.cart === store ? OP_OWE_PER_CART : OP_OWE_PER_CART / 2);
  return { store, earnings, lines };
}

/** Pure: turn a list of orders into per-day summaries. Exported so the maths can be tested. */
export function summarizeOrders(orders, products) {
  const days = {};
  for (const o of orders) {
    if (!o || !o.createdAt || o.status === 'Cancelled') continue;
    const d = new Date(o.createdAt);
    const day = ymdOf(d);
    const s = (days[day] = days[day] || { date: day, stores: { inside: emptyStore(), store: emptyStore(), food: emptyStore() } });
    const { store, earnings, lines } = orderMoney(o, products);
    const t = s.stores[store];
    t.placed++;
    if (o.paymentStatus === 'unpaid') {
      t.unpaid++;
      continue;
    }
    if (o.lateBatch) t.late++;
    const batch = (String(o.deliveryTime || '').match(/\(([^)]+)\)/) || [])[1] || 'Other';
    t.batches[batch] = (t.batches[batch] || 0) + 1;
    t.hours[d.getHours()] = (t.hours[d.getHours()] || 0) + 1;
    if (o.area !== 'Custom' && o.building) t.hostels[o.building] = (t.hostels[o.building] || 0) + 1;
    t.customers[o.phone] = (t.customers[o.phone] || 0) + 1;
    if (o.isFirstTimeCustomer) t.firstTime++;
    if (o.outOfStock) t.oos[o.outOfStock] = (t.oos[o.outOfStock] || 0) + 1;
    if (o.status !== 'Delivered') continue;
    // Completed: money, products, team
    t.completed++;
    t.sales += o.totalAmount || 0;
    t.earnings += earnings;
    for (const { i, m } of lines) {
      const key = String(i.productId || i.name).replace(/[.#$/\[\]]/g, '_');
      const p = products.find((x) => x.id === i.productId);
      const name = p ? p.name : String(i.name).replace(/\s*\(\d+ plates?\)$/, '');
      const cur = (t.products[key] = t.products[key] || { name, category: (p && p.category) || '', qty: 0, sales: 0, earnings: 0 });
      cur.qty += i.quantity || 1;
      cur.sales += i.totalPrice || 0;
      cur.earnings += m;
      const ck = (p && p.category) || 'No category';
      const cc = (t.categories[ck] = t.categories[ck] || { qty: 0, sales: 0, earnings: 0 });
      cc.qty += i.quantity || 1;
      cc.sales += i.totalPrice || 0;
      cc.earnings += m;
    }
    const who = store === 'inside' ? o.runnerName || o.turnRunner || 'Unknown runner' : o.operatorName || 'Unknown operator';
    const tm = (t.team[who] = t.team[who] || { orders: 0, confirmMins: 0, confirmed: 0 });
    tm.orders++;
    if (o.paymentSentAt && o.paymentConfirmedAt) {
      const mins = (Date.parse(o.paymentConfirmedAt) - Date.parse(o.paymentSentAt)) / 60000;
      if (mins >= 0 && mins < 24 * 60) {
        tm.confirmMins += mins;
        tm.confirmed++;
      }
    }
  }
  return days;
}

/**
 * Admin: summaries for every day from `from` to `to` (yyyy-mm-dd). Saved days are read; the rest are
 * counted from orders, and days older than 2 days are saved for next time.
 */
/** @returns {Promise<any[]>} */
export async function getDaySummaries(from, to) {
  const saved = {};
  try {
    const snap = await getDocs(query(collection(db, 'statsDaily'), where(documentId(), '>=', from), where(documentId(), '<=', to)));
    snap.forEach((d) => (saved[d.id] = d.data()));
  } catch (e) {
    console.error(e);
  }
  const today = new Date();
  const liveFrom = new Date(today);
  liveFrom.setDate(today.getDate() - 2);
  const liveDay = ymdOf(liveFrom);
  // Days to count from orders: not saved yet, or still live
  const need = [];
  for (let d = new Date(from + 'T00:00:00'); ymdOf(d) <= to; d.setDate(d.getDate() + 1)) {
    const k = ymdOf(d);
    if (!saved[k] || k >= liveDay) need.push(k);
  }
  if (need.length) {
    const start = new Date(need[0] + 'T00:00:00');
    const end = new Date(need[need.length - 1] + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    const snap = await getDocs(
      query(collection(db, 'orders'), where('createdAt', '>=', start.toISOString()), where('createdAt', '<', end.toISOString()), limit(5000))
    );
    const orders = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const products = (await readCatalog()).products || [];
    const counted = summarizeOrders(orders, products);
    for (const k of need) {
      const sum = counted[k] || { date: k, stores: { inside: emptyStore(), store: emptyStore(), food: emptyStore() } };
      saved[k] = sum;
      if (k < liveDay) setDoc(doc(db, 'statsDaily', k), slim(sum)).catch((e) => console.error(e));
    }
  }
  return Object.keys(saved)
    .filter((k) => k >= from && k <= to)
    .sort()
    .map((k) => saved[k]);
}

/** Admin: phone -> name, from saved student profiles (one read per profile) */
/** @returns {Promise<Record<string, string>>} */
export async function getCustomerNames() {
  const names = {};
  try {
    const snap = await getDocs(collection(db, 'customers'));
    snap.forEach((d) => {
      const c = d.data();
      if (c.phone && c.name) names[c.phone] = c.name;
    });
  } catch (e) {
    console.error(e);
  }
  return names;
}

/** Admin: student product requests in a date range (for "demand you're missing") */
/** @returns {Promise<any[]>} */
export async function getRequestsRange(from, to) {
  try {
    const end = new Date(to + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    const snap = await getDocs(
      query(
        collection(db, 'productRequests'),
        where('createdAt', '>=', new Date(from + 'T00:00:00').toISOString()),
        where('createdAt', '<', end.toISOString()),
        limit(1000)
      )
    );
    return snap.docs.map((d) => d.data());
  } catch (e) {
    console.error(e);
    return [];
  }
}

/** Student: they paid the runner for gate to room pickup */
/** @returns {Promise<any>} */
export async function markGatePickupPaid(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      if (!o.gatePickup || o.gatePickup.status !== 'accepted' || o.gatePickup.paid) return;
      const now = new Date().toISOString();
      o.gatePickup = { ...o.gatePickup, paid: true, paidAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student paid the runner for gate to room pickup', updatedBy: o.name || 'Customer' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* ---------------- express runs: accept, switch to normal, received, refund ----------------
 * 1. Student picks Express at checkout (only while a runner has it on). The order waits for a runner.
 * 2. A runner with express on taps "I can do it now": their account is attached, the student pays.
 * 3. The 20 minutes start when the student taps "I've paid" (moved to the bank time if the money came later).
 * 4. The clock stops when the student taps "Received" (or at the runner's Delivered time after 10 minutes).
 * 5. Over 20 minutes: the runner pays ₦600 back to the student.
 */

const EXPRESS_CONFIRM_MS = EXPRESS_CONFIRM_MINUTES * 60000;

/** Runner: "I can do it now" on an express request */
/** @returns {Promise<any>} */
export async function acceptExpress(orderId) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner') throw new Error('Runners only');
  if (!staff.payAccount?.accountNumber) throw new Error('Save your bank account first. The student pays you directly.');
  if (isRunnerOff(auth.currentUser?.email)) throw new Error('The admin has switched you off. You cannot take new express runs.');
  // First runner wins: read and write in one transaction so two runners can't both take it
  const ref = doc(db, 'orders', orderId);
  let result = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Order not found');
    const o = { ...snap.data(), id: snap.id };
    if (!o.history) o.history = [];
    if (!o.express || o.express.status !== 'requested') throw new Error('Another runner has already taken this express order.');
    const now = new Date().toISOString();
    o.express = {
      ...o.express,
      status: 'accepted',
      runnerId: staff.email,
      runnerName: staff.name || 'Runner',
      runnerPhone: staff.phone || '',
      acceptedAt: now,
      payTo: staff.payAccount,
    };
    o.payTo = staff.payAccount;
    o.turnRunner = staff.name || 'Runner';
    o.history.push({ status: o.status, timestamp: now, note: `${staff.name || 'A runner'} accepted this express order. The student can pay now.`, updatedBy: staff.name || 'Runner' });
    tx.set(ref, slim(o));
    result = o;
  });
  return result;
}

/** Student: no runner accepted in time, so switch to normal delivery (normal fee, next batch) */
/** @returns {Promise<any>} */
export async function cancelExpress(orderId) {
  return patchOrder(orderId, (o) => {
    if (!o.express || o.express.status !== 'requested' || o.paymentStatus !== 'unpaid') throw new Error('This order can no longer be changed.');
    const now = new Date();
    const fee = deliveryFeeFor(o.subtotal || 0, false, (o.items || []).some((i) => isBagOfWater(i.name)));
    const { next } = getNextBatch('inside', now);
    o.express = { ...o.express, status: 'cancelled' };
    o.deliveryFee = fee;
    o.totalAmount = (o.subtotal || 0) + fee;
    if (next) {
      o.deliveryBatch = next.batch.id;
      o.deliveryTime = next.batch.label;
      o.deliveryDate = next.batch.date;
      o.paymentDeadline = next.start.toISOString();
    }
    o.history.push({ status: o.status, timestamp: now.toISOString(), note: 'No express runner was free. Switched to normal delivery.', updatedBy: o.name || 'Customer' });
  });
}

/** Student: "Received" on an express order. This stops the 20-minute clock. */
/** @returns {Promise<any>} */
export async function markExpressReceived(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      if (!o.express || o.express.status !== 'accepted' || o.express.receivedAt) return;
      // Too late to stop the clock: the runner's Delivered time already stands after the confirm window
      const del = Date.parse(o.express.runnerDeliveredAt || '');
      if (Number.isFinite(del) && Date.now() - del >= EXPRESS_CONFIRM_MS) return;
      const now = new Date().toISOString();
      o.express = { ...o.express, receivedAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student confirmed they received the express order', updatedBy: o.name || 'Customer' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * Student: the runner tapped Delivered but hasn't arrived. Undoes the runner's Delivered so the express clock keeps running.
 * Only inside the same 10-minute window as "I've received it".
 */
/** @returns {Promise<any>} */
export async function markExpressNotHere(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      if (!o.express || o.express.status !== 'accepted' || o.express.receivedAt || !o.express.runnerDeliveredAt) return;
      const del = Date.parse(o.express.runnerDeliveredAt);
      if (Number.isFinite(del) && Date.now() - del >= EXPRESS_CONFIRM_MS) return;
      const now = new Date().toISOString();
      const { runnerDeliveredAt, ...rest } = o.express;
      o.express = { ...rest, notHereCount: (o.express.notHereCount || 0) + 1, lastNotHereAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student says the runner has not arrived yet (Delivered was tapped early). The clock keeps running.', updatedBy: o.name || 'Customer' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Runner: after a student's "Not here yet", tap again once actually at the room (restarts the 10-minute window) */
/** @returns {Promise<any>} */
export async function markExpressArrived(orderId) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner') return null;
  return patchOrder(orderId, (o) => {
    if (!o.express || o.express.status !== 'accepted' || o.express.receivedAt || o.express.runnerDeliveredAt) return;
    const now = new Date().toISOString();
    o.express = { ...o.express, runnerDeliveredAt: now };
    o.history.push({ status: o.status, timestamp: now, note: 'Runner says they have now arrived with the express order', updatedBy: staff.name || 'Runner' });
  });
}

/** Runner: they paid the ₦600 back on a late express order */
/** @returns {Promise<any>} */
export async function markExpressRefunded(orderId) {
  const staff = getCurrentStaff();
  let done = null;
  const res = await patchOrder(orderId, (o) => {
    if (!o.express || o.express.status !== 'accepted' || o.express.refunded) return;
    const now = new Date().toISOString();
    o.express = { ...o.express, refunded: true, refundedAt: now };
    o.history.push({ status: o.status, timestamp: now, note: `Express was late: ${staff?.name || 'the runner'} refunded ₦${EXPRESS_REFUND.toLocaleString()} to the student`, updatedBy: staff?.name || 'Runner' });
    done = o;
  });
  if (done) recordExpressRefund(done).catch((e) => console.error(e));
  return res;
}

/* ---------------- rate your experience (one rating per cart) ----------------
 * ratings/{orderId}: the student rates the runner or operator who handled that cart.
 * Ratings go straight to the admin. Runners and operators see their own scores and the reasons.
 */

/** Who a cart's rating is about: { key, name } (runner email, or the operator's login uid) */
export function providerOf(o) {
  if (!o) return { key: '', name: '' };
  if (o.cart === 'store' || o.cart === 'food') return { key: o.operatorId || '', name: o.operatorName || 'Operator' };
  const ex = o.express && o.express.status === 'accepted' ? o.express : null;
  return { key: o.runnerId || (ex && ex.runnerId) || '', name: o.runnerName || (ex && ex.runnerName) || o.turnRunner || 'Runner' };
}

/** Student: has this cart been rated already? */
/** @returns {Promise<any>} */
export async function getRating(orderId) {
  try {
    const s = await getDoc(doc(db, 'ratings', orderId));
    return s.exists() ? s.data() : null;
  } catch (e) {
    return null;
  }
}

/** Student: send the rating for one delivered cart */
/** @returns {Promise<void>} */
export async function submitRating(order, score, reasons, comment) {
  const s = Math.round(Number(score) || 0);
  if (s < 1 || s > 5) throw new Error('Tap a score from 1 to 5');
  const p = providerOf(order);
  const clean = (reasons || []).map((r) => String(r).slice(0, 30)).slice(0, 6);
  const text = String(comment || '').trim().slice(0, 300);
  if (clean.includes('Other') && !text) throw new Error('Tell us what happened in a few words');
  await setDoc(
    doc(db, 'ratings', order.id),
    slim({
      orderId: order.id,
      cart: order.cart === 'store' || order.cart === 'food' ? order.cart : 'inside',
      score: s,
      reasons: clean,
      comment: text,
      providerKey: p.key,
      providerName: p.name,
      customer: order.name || '',
      createdAt: new Date().toISOString(),
    })
  );
}

/** Admin: the latest ratings, newest first */
/** @returns {() => void} */
export function subscribeAllRatings(cb) {
  const q = query(collection(db, 'ratings'), orderBy('createdAt', 'desc'), limit(300));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

/** Runner / operator: ratings about them (runners by login email, operators by login uid) */
/** @returns {() => void} */
export function subscribeMyRatings(cb) {
  const staff = getCurrentStaff();
  const key = staff?.role === 'runner' ? staff.email : auth.currentUser?.uid;
  if (!staff || !key) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'ratings'), where('providerKey', '==', key), limit(200));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))),
    () => cb([])
  );
}
