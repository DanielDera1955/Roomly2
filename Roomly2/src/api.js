/**
 * Roomly - Central Data Access Layer (api.js) - FIREBASE VERSION
 *
 * Same exported functions as the old localStorage version, now backed by
 * Firebase (Firestore + Auth, free Spark plan).
 *
 * - Customers: no accounts. Saved by phone + 4-digit PIN (older ones 6) (hashed document id).
 * - Runners and admin: email/password login (a phone number becomes phone@roomly.app).
 * - Orders: customers create and track them; staff see the full list in real time.
 */

import { getRef, getHeardFrom } from './tracking.js';
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
  isOldPayOrder,
  runnerPayFor,
  sellingPrice,
  hostelSideOf,
  CATEGORY_SETUP,
  STORE_SOURCE,
  storeOfSource,
  OUTSIDE_DAYS_AHEAD,
  outsideDeliveryText,
  longDayLabel,
  INSIDE_ARRIVAL_MINUTES,
  NOT_RECEIVED_WINDOW_HOURS,
  insideTimerOrder,
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

/** New students create a 4-digit PIN. Students who signed up earlier with 6 digits keep using theirs. */
export function isValidPin(pin) {
  return /^(\d{4}|\d{6})$/.test(pin || '');
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
          // Runners serve either the boys' or the girls' hostels (only girls can enter the girls' hostels)
          hostelSide: d.hostelSide === 'girls' ? 'girls' : 'boys',
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
// Girls' hostel batches are switched separately: their keys end in "|girls" ("2026-11-04|afternoon|girls")
const GIRLS_SUFFIX = '|girls';
const switchKey = (key, hs) => (hs === 'girls' && !String(key).endsWith(GIRLS_SUFFIX) ? key + GIRLS_SUFFIX : key);
const isGirlsKey = (key) => String(key).endsWith(GIRLS_SUFFIX);
/** The signed-in runner's side ('boys' for everyone else) */
const myHostelSide = () => {
  const st = getCurrentStaff();
  return st && st.hostelSide === 'girls' ? 'girls' : 'boys';
};
let runnerUnsettled = {}; // runner uid -> dates not yet settled
// Weekly availability, keyed by runner login email:
// { uid, name, phone, payTo, hs, days: { "1": ["afternoon", "late"], ... }, skip: { "2026-11-05|late": true } }
// A runner's ticked batches are ON every week by themselves; "skip" switches one date's batch OFF.
let weeklyRoster = {};
let runnerPay = {}; // runner uid -> payment account students pay into
let expressRunners = {}; // runner uid -> { on, name, phone, email, payTo, at }: runners taking express runs now
let operatorDocs = {};
let staffSeen = {}; // runner uid -> last time they had their portal open (ms)
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
      staffSeen = s.exists() ? s.data().seen || {} : {};
      weeklyRoster = s.exists() ? s.data().weekly || {} : {};
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
  // How students pay: 'direct' (the runner's / operator's own account) or 'paystack' (Roomly, confirmed automatically)
  onSnapshot(
    doc(db, 'adminControl', 'payments'),
    (s) => {
      paySettings = { ...PAY_DEFAULTS, ...(s.exists() ? s.data() : {}) };
      window.dispatchEvent(new Event('roomly-payments'));
    },
    () => {}
  );
} catch (e) {
  /* ignore */
}

/* ===================== PAYSTACK PAYMENTS ===================== */
// Express delivery is hidden while the admin assigns orders by hand (a 20-minute promise can't be kept)
export const EXPRESS_ENABLED = false;

const PAY_DEFAULTS = { mode: 'direct', testPhones: [], roomlyAccount: null };
/** Roomly's support line on every order the admin handles (WhatsApp and calls) */
export const ROOMLY_SUPPORT_PHONE = '08141850484';
let paySettings = { ...PAY_DEFAULTS };
export function getPaymentSettings() {
  return paySettings;
}
/** Does this student pay through Paystack? Everyone once the mode is 'paystack'; before that only the admin's test numbers. */
export function paystackFor(phone) {
  if (paySettings.mode === 'paystack') return true;
  const p = normalizePhone(phone || '');
  return Boolean(p) && (paySettings.testPhones || []).map(normalizePhone).includes(p);
}
/** Roomly collects the money and the admin assigns orders: 'paystack' (normal) or 'manual' (Paystack down: Roomly's bank account) */
export function collectsAsRoomly() {
  return paySettings.mode === 'paystack' || paySettings.mode === 'manual';
}
/** Roomly's own account, shown to students only in manual mode */
function roomlyPayTo() {
  const a = paySettings.roomlyAccount;
  return paySettings.mode === 'manual' && a && a.accountNumber ? a : null;
}
/** An order whose money went to Roomly (not a runner / operator): no settlement, the admin pays the provider out */
export function isRoomlyOrder(o) {
  return Boolean(o && (o.paidVia === 'paystack' || o.collectedBy === 'roomly'));
}
/** What Roomly pays the runner / store for one order: item cost + ₦500 (runner delivery fee / store transport) */
export async function roomlyPayoutOf(order) {
  if (!order) return { amount: 0, items: 0, delivery: 0, estimated: false };
  if (order.cart === 'store' || order.cart === 'food') {
    const products = (await readCatalog()).products || [];
    const m = operatorCartMaths(order, order.cart, products, order.operatorId || '');
    return { amount: m.keep, items: m.itemsCost, delivery: m.deliveryKeep, estimated: m.estimated };
  }
  const { spent, fee, estimated } = await insideProfitOf(order);
  return { amount: spent + fee, items: spent, delivery: fee, estimated };
}
/** Who Roomly pays for an order: { key, name, phone, kind } (runner for inside, store / food vendor for outside) */
export function payeeOf(o) {
  if (!o) return null;
  if (o.cart === 'store' || o.cart === 'food') {
    if (!o.operatorId) return { key: `${o.cart}:none`, name: o.operatorName || 'No store set', phone: '', kind: o.cart, uid: '' };
    const op = operatorDocs[o.operatorId] || {};
    return { key: `${o.cart}:${o.operatorId}`, name: op.name || o.operatorName || 'Store', phone: op.phone || '', kind: o.cart, uid: o.operatorId, payTo: op.payTo || null };
  }
  if (!o.runnerId) return { key: 'runner:none', name: 'No runner recorded', phone: '', kind: 'runner', uid: '' };
  return { key: `runner:${o.runnerId}`, name: o.runnerName || 'Runner', phone: o.runnerPhone || '', kind: 'runner', uid: o.runnerId };
}
/** Delivered Roomly orders the runner / store hasn't been paid for yet */
export function payoutPending(o) {
  return Boolean(isRoomlyOrder(o) && o.paymentStatus === 'payment_confirmed' && o.status === 'Delivered' && !(o.payout && o.payout.paidAt));
}
/** Admin: record that Roomly paid these orders out. entries: [{ orderId, amount }] */
export async function markPayoutPaid(entries, note = '') {
  const at = new Date().toISOString();
  let done = 0;
  for (const e of entries || []) {
    const updated = await patchOrder(e.orderId, (o) => {
      o.payout = { amount: Math.max(0, Math.round(Number(e.amount) || 0)), paidAt: at, by: 'Roomly admin', note: String(note || '').slice(0, 200) };
    });
    if (updated) done++;
  }
  if (done) logActivity('money', `paid out ${done} ${done === 1 ? 'order' : 'orders'} (${naira((entries || []).reduce((t, e) => t + (Number(e.amount) || 0), 0))})`);
  return done;
}
/**
 * Admin: record a refund on a Roomly order (the money itself is sent back from the Paystack dashboard or a bank app).
 * cancel = the whole order is off: it is cancelled and leaves the payouts.
 */
export async function recordRefund(orderId, amount, reason, cancel = false) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!amt) throw new Error('Enter the amount refunded.');
  const at = new Date().toISOString();
  const updated = await patchOrder(orderId, (o) => {
    o.refunds = [...(o.refunds || []), { amount: amt, reason: String(reason || '').slice(0, 200), at, by: 'Roomly admin' }];
    o.history.push({
      status: cancel ? 'Cancelled' : o.status,
      timestamp: at,
      note: `Roomly refunded ${naira(amt)}${reason ? `: ${reason}` : ''}.${cancel ? ' The order was cancelled.' : ''}`,
      updatedBy: 'Roomly',
    });
    if (cancel) {
      o.status = 'Cancelled';
      o.cancelledAt = at;
    }
  });
  if (updated) logActivity('money', `refunded ${naira(amt)} on ${orderLabel(updated)}${cancel ? ' and cancelled it' : ''}`, orderId);
  return updated;
}
/** "08012345678" -> "2348012345678" for WhatsApp links */
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.startsWith('234') ? d : d.startsWith('0') ? '234' + d.slice(1) : d;
}
export async function savePaymentSettings(patch) {
  await setDoc(doc(db, 'adminControl', 'payments'), { ...patch, updatedAt: Date.now() }, { merge: true });
}

let paystackScript = null;
function loadPaystack() {
  if (window.PaystackPop) return Promise.resolve();
  if (!paystackScript) {
    paystackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v2/inline.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        paystackScript = null;
        reject(new Error('Could not load Paystack. Check your internet and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return paystackScript;
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error) throw new Error(data.error);
  return data;
}

/**
 * Pay for an order in the Paystack popup.
 * Resolves { status: 'paid', order } | { status: 'cancelled' } | { status: 'checking' } (paid, but the check is still running:
 * the order screen updates by itself once Paystack's message arrives).
 */
export async function payWithPaystack(order) {
  if (!order) throw new Error('No order to pay for.');
  if (paymentState(order) === 'expired') throw new Error('This order expired at the end of the day it was placed. Please place a new order.');
  const side = order.cart === 'store' || order.cart === 'food' ? order.cart : 'inside';
  // Missed its batch: the order joins the next batch once paid (same as paying by transfer)
  let batch = null;
  if (paymentState(order) === 'missed') {
    const { next } = getNextBatch(side, new Date(), order.hostelSide || 'boys');
    if (next) batch = { deliveryBatch: next.batch.id, deliveryTime: next.batch.label, deliveryDate: next.batch.date, paymentDeadline: next.start.toISOString() };
  }
  // Placed while nobody was available: pass on whoever has taken the batch since, so they still see the order
  let provider = null;
  if (!order.operatorId && !order.turnRunner) {
    const p = getPayProvider(order);
    if (p) provider = { operatorId: p.operatorId || '', operatorName: p.operatorName || '', turnRunner: p.turnRunner || '' };
  }
  const [{ accessCode, reference, error }] = await Promise.all([postJson('/api/pay-init', { orderId: order.id, batch, provider }), loadPaystack()]);
  if (!accessCode) throw new Error(error || 'Could not start the payment.');

  const result = await new Promise((resolve) => {
    const popup = new window.PaystackPop();
    popup.resumeTransaction(accessCode, {
      onSuccess: () => resolve('success'),
      onCancel: () => resolve('cancelled'),
      onError: () => resolve('cancelled'),
    });
  });
  if (result !== 'success') return { status: 'cancelled' };

  // Ask the server to confirm with Paystack (a few tries: a bank transfer can take a moment to land)
  for (let i = 0; i < 4; i++) {
    try {
      const r = await postJson('/api/pay-verify', { reference });
      if (r.paid && r.order) return { status: 'paid', order: r.order };
    } catch (e) {
      /* try again */
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { status: 'checking' };
}

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** On, and not yet turned off by the cut-off (10pm inside, 5:10pm store, 5:30pm food). Switching on after the cut-off lasts until the next night. */
export function switchIsLive(sw, side, now = new Date()) {
  if (!sw || !sw.on) return false;
  const at = new Date(sw.at || 0);
  const cut = new Date(at);
  cut.setHours(0, 0, 0, 0);
  // Confirmed at night for tomorrow's batch: it stays on until tomorrow's cut-off, not tonight's
  if (sw.forDate) {
    const f = new Date(String(sw.forDate) + 'T00:00:00');
    if (Number.isFinite(f.getTime()) && f.getTime() > cut.getTime()) cut.setTime(f.getTime());
  }
  cut.setMinutes(side === 'inside' ? SWITCH_CUTOFF_MIN.inside : side === 'food' ? SWITCH_CUTOFF_MIN.food : SWITCH_CUTOFF_MIN.outside);
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
  const cut = side === 'inside' ? SWITCH_CUTOFF_MIN.inside : side === 'food' ? SWITCH_CUTOFF_MIN.food : SWITCH_CUTOFF_MIN.outside;
  const later = slotsForDay(side, day, 0)
    .map((o) => o.startMin)
    .filter((m) => m > opt.startMin)
    .sort((a, b) => a - b)[0];
  return new Date(day.getTime() + Math.min(later ?? cut, cut) * 60000);
}

/**
 * Outside operators switch whole days. A day they never touched counts as ON, so every day starts available
 * and the setting of each day stays as they left it (tomorrow's OFF is still OFF when tomorrow comes).
 */
export function outsideDayOn(sw) {
  return !sw || sw.on !== false;
}

/**
 * An operator's switch for one day. A weekday they don't work (Faith: Sunday) counts as OFF
 * unless they switched that exact day ON themselves.
 */
export function opDaySwitch(op, opt) {
  const sw = ((op && op.slots) || {})[opt.key];
  if (sw) return sw;
  const wd = new Date(opt.date + 'T00:00:00').getDay();
  return ((op && op.offDays) || []).includes(wd) ? { on: false, dayOff: true } : undefined;
}

/** Operator: the weekdays they never work (0 = Sunday ... 6 = Saturday) */
export async function setMyOffDays(days) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || (staff.role !== 'store' && staff.role !== 'food')) throw new Error('Operators only');
  const offDays = [...new Set((days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  const mine = operatorDocs[uid] || {};
  operatorDocs = { ...operatorDocs, [uid]: { ...mine, id: uid, kind: staff.role, name: staff.name, offDays } };
  fireBatches();
  await setDoc(doc(db, 'operatorStatus', uid), { kind: staff.role, name: staff.name || 'Operator', phone: staff.phone || '', offDays, updatedAt: Date.now() }, { merge: true });
  logActivity('days', offDays.length ? `set days off: ${offDays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : 'cleared days off');
}

/** Switched ON and not past the batch's last moment. side: 'inside' | 'store' | 'food' */
/* ---------------- weekly availability ---------------- */
const plainKey = (key) => (isGirlsKey(key) ? String(key).slice(0, -GIRLS_SUFFIX.length) : String(key));
const keyParts = (key) => {
  const [date, id] = plainKey(key).split('|');
  return { date, id, wd: new Date(String(date) + 'T00:00:00').getDay() };
};
/** Runners whose week includes this batch (not skipped that day, not switched off by the admin, settled up) */
function rosterRunners(key, hs = 'boys', now = new Date()) {
  const { id, wd } = keyParts(key);
  const pk = plainKey(key);
  return Object.entries(weeklyRoster)
    .map(([email, r]) => ({ email, ...(r || {}) }))
    .filter(
      (r) =>
        (r.hs === 'girls' ? 'girls' : 'boys') === hs &&
        ((r.days || {})[wd] || []).includes(id) &&
        !(r.skip || {})[pk] &&
        !isRunnerOff(r.email) &&
        !(r.uid && isOverdue(runnerUnsettled[r.uid], now))
    )
    .sort((a, b) => String(a.email).localeCompare(String(b.email)));
}
const hashOf = (t) => [...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const autoSwitch = (r, key) => ({
  on: true,
  auto: true,
  forDate: keyParts(key).date,
  at: 0,
  by: r.name || 'Runner',
  byPhone: r.phone || '',
  byUid: r.uid || '',
  byEmail: r.email,
  payTo: (r.uid && runnerPay[r.uid]) || r.payTo || null,
});
/**
 * The switch that decides an inside batch: a runner who switched it ON by hand, else one of the runners
 * whose week includes it (they take turns batch by batch), else whatever was saved (OFF or nothing).
 */
function insideSw(key, hs = 'boys', now = new Date()) {
  const k = switchKey(plainKey(key), hs);
  const explicit = insideSwitches[k];
  if (explicit && explicit.on) return explicit;
  const list = rosterRunners(k, hs, now).filter((r) => !(explicit && explicit.on === false && explicit.byEmail === r.email));
  if (!list.length) return explicit;
  return autoSwitch(list[hashOf(plainKey(key)) % list.length], plainKey(key));
}
/** The signed-in runner's own view of one batch: ON when it is in their week (and not skipped) or they switched it on */
function myInsideSw(key, now = new Date()) {
  const staff = getCurrentStaff();
  const email = emailKey(auth.currentUser?.email || staff?.email);
  const hs = myHostelSide();
  const k = switchKey(plainKey(key), hs);
  const explicit = insideSwitches[k];
  if (explicit && explicit.byEmail === email) return explicit;
  const mine = rosterRunners(k, hs, now).find((r) => r.email === email);
  if (mine) return autoSwitch(mine, plainKey(key));
  const r = weeklyRoster[email];
  const { id, wd } = keyParts(k);
  if (r && ((r.days || {})[wd] || []).includes(id)) return { on: false, skipped: true, at: 1 };
  return undefined;
}
/** Every runner's weekly availability (admin), keyed by login email */
export function getWeeklyRoster() {
  return JSON.parse(JSON.stringify(weeklyRoster));
}
/** The signed-in runner's weekly availability */
export function getMyWeekly() {
  const email = emailKey(auth.currentUser?.email || getCurrentStaff()?.email);
  return (email && weeklyRoster[email]) || { days: {} };
}
/**
 * Save the batches a runner works each week. days = { "0": ["midday"], "1": ["afternoon", "evening"], ... }
 * The runner saves their own; the admin can save anyone's (by login email).
 */
export async function saveWeekly(days, runner) {
  const staff = getCurrentStaff();
  const self = !runner;
  const email = emailKey(self ? auth.currentUser?.email || staff?.email : runner.email);
  if (!email) throw new Error('No runner email.');
  const clean = {};
  Object.entries(days || {}).forEach(([wd, ids]) => {
    if (Array.isArray(ids) && ids.length) clean[wd] = [...new Set(ids.map(String))];
  });
  const prev = weeklyRoster[email] || {};
  const who = self
    ? { uid: auth.currentUser?.uid || prev.uid || '', name: staff?.name || prev.name || 'Runner', phone: staff?.phone || prev.phone || '', payTo: staff?.payAccount || prev.payTo || null, hs: staff?.hostelSide === 'girls' ? 'girls' : 'boys' }
    : { uid: prev.uid || runner.uid || '', name: runner.name || prev.name || 'Runner', phone: runner.phone || prev.phone || '', payTo: prev.payTo || runner.payAccount || null, hs: runner.hostelSide === 'girls' ? 'girls' : prev.hs || 'boys' };
  const entry = slim({ ...who, days: clean });
  weeklyRoster = { ...weeklyRoster, [email]: { ...prev, ...entry, days: clean } };
  fireBatches();
  // days is replaced whole; skip is kept
  await setDoc(doc(db, 'availability', 'inside'), { weekly: { [email]: { ...entry, days: deleteField() } } }, { merge: true });
  await setDoc(doc(db, 'availability', 'inside'), { weekly: { [email]: { days: clean } } }, { merge: true });
}

export function batchOpen(opt, sw, side, now = new Date()) {
  if (side !== 'inside') return outsideDayOn(sw) && now.getTime() < batchCloseDate(opt, side).getTime();
  return switchIsLive(sw, 'inside', now) && now.getTime() < batchCloseDate(opt, side).getTime();
}
const accepting = (opt, sw, side, now) => batchOpen(opt, sw, side, now);

/** Past the start time: still open, but the student gets 15 minutes to pay */
const LATE_PAY_MS = 15 * 60000;
const payDeadline = (start, now) => (start.getTime() > now.getTime() ? start : new Date(now.getTime() + LATE_PAY_MS));

/**
 * A batch running right now (started, not past its end) whose runner is also the runner of the order's batch:
 * that runner may bring the order early. Returns { endMs, window } or null.
 */
function runningEarly(now, hs, nextSw) {
  if (!nextSw || !nextSw.byEmail) return null;
  for (const opt of slotsForDay('inside', now, 0)) {
    const sw = insideSw(opt.key, hs, now);
    const start = switchStartDate(opt, sw).getTime();
    const day = new Date(opt.date + 'T00:00:00').getTime();
    const end = day + (opt.endMin || opt.startMin + 30) * 60000;
    if (now.getTime() >= start && now.getTime() < end && sw && switchIsLive(sw, 'inside', now) && sw.byEmail === nextSw.byEmail)
      return { endMs: end, window: opt.window };
  }
  return null;
}

/** Someone opened this batch and has since switched it OFF: it is done for the day */
function closedByStaff(opt, side, hs = 'boys') {
  if (side === 'inside') {
    const sw = insideSw(opt.key, hs);
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

/** Operators of one kind that the admin has not switched off, settled up, with a payment account saved (students pay them directly) */
function activeOperators(kind) {
  return Object.values(operatorDocs).filter((o) => o.kind === kind && !o.adminOff && !isOverdue(o.unsettled) && o.payTo);
}

/**
 * Next batch still taking orders for 'inside', 'store' or 'food'.
 * Returns { next: { batch, start, startText, by }, note } — next is null when ordering is paused.
 */
export function getNextBatch(side, now = new Date(), hs = 'boys') {
  // Demo: the next scheduled batch, taken by the demo runner
  if (DEMO && side === 'inside') {
    const slot = getBookableSlots(now)[0];
    if (slot) {
      return {
        next: { batch: slot, start: new Date(now.getTime() + 15 * 60000), startText: timeLabel(slot.startMin), late: false, by: 'Demo Runner', payTo: DEMO_PAY_TO },
        note: '',
      };
    }
  }
  // Roomly collects and assigns: the next scheduled batch is always open, whoever is on it
  if (side === 'inside' && collectsAsRoomly()) {
    const fb = scheduledNext(side, now, hs);
    if (!fb) return { next: null, note: '' };
    return { next: { batch: fb.opt, start: payDeadline(fb.start, now), startText: startTextOf(fb.start), late: fb.start <= now, by: '', payTo: roomlyPayTo() }, note: '' };
  }
  const notes = [];
  for (let d = 0; d < 3; d++) {
    for (const opt of slotsForDay(side, now, d)) {
      if (side === 'inside') {
        const sw = insideSw(opt.key, hs, now);
        const start = switchStartDate(opt, sw);
        // A batch takes no new orders once its start time comes: they join the next batch
        if (now.getTime() >= start.getTime()) continue;
        const blocked = sw && ((sw.byUid && isOverdue(runnerUnsettled[sw.byUid], now)) || isRunnerOff(sw.byEmail));
        if (!blocked && switchIsLive(sw, 'inside', now)) {
          return {
            next: { batch: opt, start, startText: startTextOf(start), late: false, by: sw.by || '', payTo: runnerPay[sw.byUid] || sw.payTo || null, early: runningEarly(now, hs, sw) },
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
  // Outside: every day starts ON, so nobody open means every operator switched all three days OFF. Back soon.
  if (side !== 'inside') return { next: null, note: '' };
  // Nobody has opened a batch: students can still order. The order joins the next scheduled batch
  // and goes to a runner / operator who can take it; the student is told it is not opened yet.
  const fb = scheduledNext(side, now, hs);
  if (!fb) return { next: null, note: notes[0] || '' };
  // Inside: only a runner who confirmed (switched on) the batch is ever shown, so students never pay someone who isn't coming
  const who = side === 'inside' ? null : fallbackOperators(side)[0];
  void fallbackRunner;
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
function scheduledNext(side, now = new Date(), hs = 'boys') {
  for (let d = 0; d < 3; d++) {
    for (const opt of slotsForDay(side, now, d)) {
      // Inside: closed once its start time comes. Outside: open until its cut-off.
      if (side === 'inside' ? now.getTime() >= switchStartDate(opt, insideSw(opt.key, hs, now)).getTime() : now.getTime() >= batchCloseDate(opt, side).getTime()) continue;
      if (closedByStaff(opt, side, hs)) continue;
      return { opt, start: switchStartDate(opt, null) };
    }
  }
  return null;
}

/** Inside: the runner who most recently opened a batch (settled up, with a payment account) */
function fallbackRunner(now = new Date(), hs = 'boys') {
  const seen = new Set();
  // Only runners on the same side: a girls' hostel order never shows a boys' runner's account
  const list = Object.entries(insideSwitches)
    .filter(([k, sw]) => sw && sw.byUid && isGirlsKey(k) === (hs === 'girls'))
    .map(([, sw]) => sw)
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
 * Outside checkout: every store (or food vendor) of this kind and the day their order would come.
 * "This batch" = today's delivery, or tomorrow's once today's orders closed (5:10pm store, 5:30pm food).
 * Each operator: { uid, name, status, batch, start, startText, late, load, payTo }
 *   status 'now'  = delivering on "this batch" day
 *          'next' = fully booked that day; the order goes to their next day that is ON (batch = that day)
 * Operators with all three days OFF are left out (students can't see them).
 * Nobody left: { batch: null, backSoon: true } and that section shows "Back soon".
 */
export function getOutsideChoices(kind, now = new Date()) {
  const today = ymdOf(now);
  // "This batch": the first day's delivery that has not closed yet (today before the cut-off: 5:10pm store, 5:30pm food; else tomorrow)
  let current = null;
  for (let d = 0; d < OUTSIDE_DAYS_AHEAD && !current; d++) {
    for (const opt of slotsForDay(kind, now, d)) {
      if (now.getTime() < batchCloseDate(opt, kind).getTime()) {
        current = opt;
        break;
      }
    }
  }
  // Demo: one demo vendor taking today's delivery (never a real vendor's account)
  if (DEMO) {
    const batch = current || slotsForDay(kind, now, 0)[0];
    if (batch) {
      const demoOp = {
        uid: 'demo-vendor',
        name: 'Roomly Demo Vendor',
        load: 0,
        payTo: DEMO_VENDOR_PAY_TO,
        status: 'now',
        batch,
        start: new Date(now.getTime() + 15 * 60000),
        startText: timeLabel(batch.startMin),
        late: false,
        reason: '',
      };
      return { batch, current: batch, operators: [demoOp], anyNow: true, note: '' };
    }
  }
  const ops = [];
  for (const op of activeOperators(kind)) {
    const load = op.load && op.load.date === today ? op.load.count || 0 : 0;
    const base = { uid: op.id, name: op.name || 'Operator', load, payTo: op.payTo || null };
    let found = null;
    for (let d = 0; d < OUTSIDE_DAYS_AHEAD && !found; d++) {
      for (const opt of slotsForDay(kind, now, d)) {
        const sw = opDaySwitch(op, opt);
        if (accepting(opt, sw, kind, now)) {
          const start = switchStartDate(opt, sw);
          found = {
            ...base,
            status: current && opt.key === current.key ? 'now' : 'next',
            batch: opt,
            start: payDeadline(start, now),
            startText: startTextOf(start),
            late: start <= now,
            // Why not the current day: a weekday they don't work, or switched off (fully booked)
            reason: current && opt.key !== current.key && opDaySwitch(op, current)?.dayOff ? 'dayoff' : 'booked',
          };
          break;
        }
      }
    }
    // All three days OFF: hidden at checkout until one of their days comes back on
    if (found) ops.push(found);
  }
  const rank = { now: 0, next: 1 };
  ops.sort((a, b) => rank[a.status] - rank[b.status] || a.start - b.start || a.load - b.load);
  const anyNow = ops.some((o) => o.status === 'now');
  if (!ops.length) return { batch: null, current, operators: [], anyNow: false, note: '', backSoon: true };
  // Nobody works today because it is their day off (e.g. food on Sunday)
  const dayOff = !anyNow && ops.every((o) => o.reason === 'dayoff');
  return { batch: anyNow ? current : ops[0].batch, current, operators: ops, anyNow, note: '', dayOff };
}

/** The number a student calls about their order: the runner (inside) or the vendor (outside). '' when unknown. */
export function contactPhoneFor(order) {
  if (!order) return '';
  if (order.cart === 'store' || order.cart === 'food') return (operatorDocs[order.operatorId] || {}).phone || '';
  if (order.runnerPhone) return order.runnerPhone;
  const sw = insideSw(`${order.deliveryDate}|${order.deliveryBatch}`, order.hostelSide || 'boys');
  return (sw && (sw.byPhone || sw.phone)) || '';
}

/**
 * Who a student should pay for an order that was placed while nobody was available.
 * Returns { payTo, operatorId, operatorName, turnRunner } or null when nobody has taken the batch yet.
 */
export function getPayProvider(order, now = new Date()) {
  const side = order && (order.cart === 'store' || order.cart === 'food') ? order.cart : 'inside';
  if (collectsAsRoomly() || (order && order.collectedBy === 'roomly')) {
    // The student pays Roomly; an outside order still names the store it goes to
    const op = side === 'inside' ? null : (getOutsideChoices(side, now).operators || []).find((o) => o.status !== 'off');
    const payTo = roomlyPayTo() || (paySettings.mode === 'paystack' ? null : paySettings.roomlyAccount || null);
    return { payTo, operatorId: op ? op.uid : '', operatorName: op ? op.name : '', turnRunner: '' };
  }
  if (side === 'inside') {
    const n = getNextBatch('inside', now, order?.hostelSide || 'boys').next;
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

/**
 * Inside switches for one side, keyed by the plain batch key ("2026-11-04|afternoon").
 * Default: the signed-in runner's own side (boys for the admin and everyone else).
 */
export function getInsideSwitches(hs) {
  const side = hs || myHostelSide();
  const out = {};
  Object.entries(insideSwitches).forEach(([k, sw]) => {
    if (isGirlsKey(k) !== (side === 'girls')) return;
    out[side === 'girls' ? k.slice(0, -GIRLS_SUFFIX.length) : k] = sw;
  });
  // Batches today and tomorrow that runners have in their week count as ON
  const now = new Date();
  [0, 1].forEach((d) =>
    slotsForDay('inside', now, d).forEach((o) => {
      const sw = insideSw(o.key, side, now);
      if (sw) out[o.key] = sw;
    })
  );
  return out;
}

/** The signed-in runner's own batches today and tomorrow (their week, skips and anything they switched on) */
export function getMyInsideSwitches() {
  const now = new Date();
  const out = {};
  [0, 1].forEach((d) =>
    slotsForDay('inside', now, d).forEach((o) => {
      const sw = myInsideSw(o.key, now);
      if (sw) out[o.key] = sw;
    })
  );
  return out;
}

/** Runner uid -> last time they had their portal open (ms) */
export function getStaffSeen() {
  return { ...staffSeen };
}

/**
 * Runners and operators: record that this person has their portal open (at most every 5 minutes).
 * Opening the portal on the day of a batch is how a runner shows they are active.
 */
let lastSeenWrite = 0;
export async function markStaffSeen(force = false) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!staff || !uid || DEMO) return;
  if (!force && Date.now() - lastSeenWrite < 5 * 60000) return;
  lastSeenWrite = Date.now();
  try {
    if (staff.role === 'runner') {
      staffSeen = { ...staffSeen, [uid]: Date.now() };
      const email = emailKey(auth.currentUser?.email || staff.email);
      const patch = { seen: { [uid]: Date.now() } };
      // Keep the weekly entry's account, phone and side up to date (students pay this account)
      if (email && weeklyRoster[email])
        patch.weekly = { [email]: slim({ uid, name: staff.name || 'Runner', phone: staff.phone || '', payTo: staff.payAccount || null, hs: staff.hostelSide === 'girls' ? 'girls' : 'boys' }) };
      await setDoc(doc(db, 'availability', 'inside'), patch, { merge: true });
    } else if (staff.role === 'store' || staff.role === 'food') {
      await setDoc(doc(db, 'operatorStatus', uid), { kind: staff.role, name: staff.name || 'Operator', seenAt: Date.now() }, { merge: true });
    }
  } catch (e) {
    /* best effort */
  }
}

/**
 * Admin: the next inside batch for one side and its switch.
 * Returns { opt, sw, start, live } or null when nothing is scheduled.
 */
export function getAdminNextInside(hs = 'boys', now = new Date()) {
  const fb = scheduledNext('inside', now, hs);
  if (!fb) return null;
  const sw = insideSw(fb.opt.key, hs, now) || null;
  const live = switchIsLive(sw, 'inside', now);
  return { opt: fb.opt, sw, start: switchStartDate(fb.opt, sw), live };
}

/** Admin: has anyone ever opened a girls' hostel batch? (then the girls' side is checked too) */
export function girlsSideInUse() {
  return Object.keys(insideSwitches).some((k) => isGirlsKey(k));
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

/** Latest time settlement comes up on its own: 10pm for runners, 8pm for store and food operators */
const DONE_BY_MIN = { inside: 22 * 60, outside: 20 * 60 };

/**
 * Has the signed-in runner or operator finished for today? True once they switched OFF the last batch
 * of the day, or at 10pm (runners) / 8pm (operators), whichever comes first. Never while one of their batches is ON.
 */
export function isDoneForToday(now = new Date()) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!staff || !uid) return false;
  const side = staff.role === 'runner' ? 'inside' : staff.role === 'store' || staff.role === 'food' ? staff.role : '';
  if (!side) return false;
  const outer = side === 'inside' ? 'inside' : 'outside';
  const all = side === 'inside' ? getInsideSwitches(myHostelSide()) : (operatorDocs[uid] || {}).slots || {};
  // Inside batches are shared: only count the ones this runner opened
  const mineOnly = (sw) => sw && (side !== 'inside' || sw.byUid === uid);
  const slots = slotsForDay(side, now, 0);
  if (slots.some((o) => mineOnly(all[o.key]) && switchIsLive(all[o.key], outer, now))) return false;
  if (now.getHours() * 60 + now.getMinutes() >= DONE_BY_MIN[outer]) return true;
  const last = slots.slice().sort((a, b) => a.startMin - b.startMin).pop();
  const sw = last ? all[last.key] : null;
  return Boolean(last && mineOnly(sw) && sw.on === false && sw.at);
}

/** Admin: the runners currently switched off (email -> true) */
export function getRunnerOffMap() {
  return { ...runnerOff };
}

/** Admin only: switch a runner off (or allow them again), by their login email */
/** @returns {Promise<void>} */
async function setRunnerAdminOff__raw(email, off) {
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
async function setInsideSwitch__raw(key, patch) {
  const staff = getCurrentStaff();
  // Only runners switch inside batches, so students always pay the runner taking the batch
  if (!staff || staff.role !== 'runner') throw new Error('Only runners can switch inside batches.');
  if (patch.on && isRunnerOff(auth.currentUser?.email)) throw new Error('The admin has switched you off. You cannot open a batch until the admin switches you back on.');
  const pk = plainKey(key);
  const { date, id } = keyParts(pk);
  const opt = slotsForDay('inside', new Date(date + 'T00:00:00'), 0).find((o) => o.id === id);
  // A batch that has started can't be switched on: new orders already go to the next batch
  if (patch.on && opt && Date.now() >= switchStartDate(opt, { ...(insideSwitches[key] || {}), ...patch }).getTime())
    throw new Error('This batch has already started. New orders go to the next batch.');
  // A batch in this runner's week: OFF skips that date only, ON brings it back (no hand-made switch needed)
  const myEmail = emailKey(auth.currentUser?.email || staff?.email);
  const week = weeklyRoster[myEmail];
  const inWeek = week && opt && ((week.days || {})[new Date(date + 'T00:00:00').getDay()] || []).includes(id);
  if (inWeek && typeof patch.on === 'boolean' && Object.keys(patch).every((k) => k === 'on' || k === 'note')) {
    const skip = { ...(week.skip || {}) };
    if (patch.on) delete skip[pk];
    else skip[pk] = true;
    weeklyRoster = { ...weeklyRoster, [myEmail]: { ...week, skip } };
    fireBatches();
    const today = ymdOf(new Date());
    const stale = {};
    Object.keys(week.skip || {}).forEach((k) => {
      if (String(k).split('|')[0] < today) stale[k] = deleteField();
    });
    await setDoc(
      doc(db, 'availability', 'inside'),
      { weekly: { [myEmail]: { skip: { ...stale, [pk]: patch.on ? deleteField() : true } } } },
      { merge: true }
    );
    return;
  }
  // Girls' hostel runners open the girls' side of the batch
  key = switchKey(key, staff.hostelSide === 'girls' ? 'girls' : 'boys');
  const prev = insideSwitches[key] || {};
  const sw = slim({ ...prev, ...patch, forDate: String(key).split('|')[0], by: staff?.name || 'Runner', byPhone: staff?.phone || '', byUid: auth.currentUser?.uid || '', byEmail: emailKey(auth.currentUser?.email || staff?.email), payTo: staff?.payAccount || null, at: Date.now() });
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
export function getExpressRunners(now = new Date(), hs) {
  if (!EXPRESS_ENABLED) return [];
  return Object.entries(expressRunners)
    .filter(([uid, sw]) => sw && sw.on && sw.payTo && switchIsLive(sw, 'inside', now) && !isOverdue(runnerUnsettled[uid], now) && !isRunnerOff(sw.email))
    // A girls' hostel order only sees girls' runners, and the other way round
    .filter(([, sw]) => !hs || (sw.hostelSide === 'girls' ? 'girls' : 'boys') === hs)
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
async function setMyExpress__raw(on) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || staff.role !== 'runner') throw new Error('Runners only');
  if (on && !staff.payAccount?.accountNumber) throw new Error('Save your bank account first. Express students pay you directly.');
  if (on && isRunnerOff(auth.currentUser?.email)) throw new Error('The admin has switched you off. You cannot take express runs until the admin switches you back on.');
  const sw = slim({ on: Boolean(on), name: staff.name || 'Runner', phone: staff.phone || '', email: staff.email, payTo: staff.payAccount || null, hostelSide: staff.hostelSide === 'girls' ? 'girls' : 'boys', at: Date.now() });
  expressRunners = { ...expressRunners, [uid]: sw };
  fireBatches();
  await setDoc(doc(db, 'availability', 'inside'), { express: { [uid]: sw } }, { merge: true });
}

/** Store and food operators: set one of their own batches. patch = { on, start, note } */
/** @returns {Promise<void>} */
async function setOperatorSwitch__raw(key, patch) {
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

/**
 * Operator: move one of their outside orders to their next day that is ON (after its current delivery day).
 * Same price, no extra fee. The student sees the new day on their order screen.
 * Returns the new delivery date ("2026-10-30") or '' if the order could not be moved.
 */
/** @returns {Promise<string>} */
async function moveOrderToNextDay__raw(orderId) {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  const isAdm = Boolean(staff && staff.role === 'admin');
  if (!uid || !staff || (!isAdm && staff.role !== 'store' && staff.role !== 'food')) throw new Error('Operators only');
  let kind = staff.role;
  let target = '';
  const updated = await patchOrder(orderId, (o) => {
    // The admin runs Roomly's outside orders: the order's own cart decides store or food
    if (isAdm) kind = o.cart === 'food' ? 'food' : 'store';
    const opUid = isAdm ? o.operatorId || '' : uid;
    const part = kind === 'food' ? o.foodStatus : o.storeStatus;
    if (o.status === 'Delivered' || o.status === 'Cancelled' || part === 'sent') return;
    // Count from the later of today and the order's current day, so it always moves forward
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const cur = new Date((o.deliveryDate || '') + 'T00:00:00');
    if (Number.isFinite(cur.getTime()) && cur.getTime() > base.getTime()) base.setTime(cur.getTime());
    let opt = null;
    for (let d = 1; d <= 7 && !opt; d++) {
      const day = slotsForDay(kind, base, d)[0];
      if (day && outsideDayOn(opDaySwitch(operatorDocs[opUid], day))) opt = day;
    }
    if (!opt) opt = slotsForDay(kind, base, 1)[0];
    if (!opt) return;
    target = opt.date;
    const at = new Date().toISOString();
    o.deliveryDate = opt.date;
    o.deliveryBatch = opt.id;
    o.deliveryTime = outsideDeliveryText(opt.date);
    o.movedAt = at;
    const byName = isAdm ? 'Roomly' : staff.name || 'Operator';
    o.movedBy = byName;
    o.history.push({
      status: o.status,
      timestamp: at,
      note: isAdm
        ? `The store is fully booked today, so your order now comes on ${longDayLabel(opt.date)}. Same price, no extra fee.`
        : `${staff.name || 'The operator'} is fully booked, so your order now comes on ${longDayLabel(opt.date)}. Same price, no extra fee.`,
      updatedBy: byName,
    });
  });
  return updated && target ? target : '';
}

/** Create the operator's status record on first visit, so the admin can see them */
/** @returns {Promise<void>} */
export async function ensureOperatorStatus() {
  const staff = getCurrentStaff();
  const uid = auth.currentUser?.uid;
  if (!uid || !staff || (staff.role !== 'store' && staff.role !== 'food')) return;
  // Also keeps the vendor's phone up to date, so students can call them if an order runs late
  if (operatorDocs[uid] && operatorDocs[uid].phone === (staff.phone || '')) return;
  try {
    await setDoc(doc(db, 'operatorStatus', uid), { kind: staff.role, name: staff.name || 'Operator', phone: staff.phone || '', updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    /* ignore */
  }
}

/** Admin only: switch an operator off (or allow them again) */
/** @returns {Promise<void>} */
async function setOperatorAdminOff__raw(uid, off) {
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
async function addCategory__raw(name, emoji = '📦', initialSubcategories = ['All'], stores = []) {
  const cat = await readCatalog(true);
  const trimmed = name.trim();
  if (!trimmed) return cat.categories;
  // The same name in another store: share that category with this store too (like Drinks).
  // Each product still belongs to one store, so students only see that store's products in it.
  const existing = cat.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    const missing = (stores || []).filter((s) => !(existing.stores || []).includes(s));
    if (!missing.length) throw new Error(`"${existing.name}" already exists in this store.`);
    existing.stores = [...(existing.stores || []), ...missing];
    await writeCatalog(cat);
    return cat.categories;
  }
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
async function deleteCategory__raw(categoryName, store = '') {
  const cat = await readCatalog(true);
  const name = String(categoryName).toLowerCase();
  // Shared with another store: only remove it from this store (the other store keeps it and its products)
  const shared = cat.categories.find((c) => c.name.toLowerCase() === name);
  if (store && shared && (shared.stores || []).includes(store) && shared.stores.length > 1) {
    const here = cat.products.filter((p) => String(p.category).toLowerCase() === name && storeOfSource(p.source) === store).length;
    if (here > 0) throw new Error(`${here} product(s) in this store still use "${categoryName}". Move them to another category first.`);
    shared.stores = shared.stores.filter((s) => s !== store);
    await writeCatalog(cat);
    return cat.categories;
  }
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
async function saveProduct__raw(productData) {
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
async function deleteProduct__raw(productId) {
  const cat = await readCatalog(true);
  cat.products = cat.products.filter((p) => p.id !== productId);
  await writeCatalog(cat);
  return cat.products;
}

/* ------------- customers (no accounts: phone + 4-digit PIN) ------------- */

/** @returns {Promise<any>} */
export async function getCustomerByPhone(phone, pin) {
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p)) return null;
  try {
    const ps = await getDoc(doc(db, 'phones', await phoneKey(p)));
    const known = ps.exists() ? ps.data() : null;

    let profile = null;
    if (isValidPin(pin)) {
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

/**
 * Hostel Hub / Games registration: make sure this phone + PIN has a store profile, so the student
 * is remembered at checkout with the same PIN. Never touches a profile that already exists.
 */
export async function ensureCustomerProfile(phone, pin, name, building) {
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p) || !isValidPin(pin)) return;
  try {
    const ref = doc(db, 'customers', await profileKey(p, pin));
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    const known = await getDoc(doc(db, 'phones', await phoneKey(p)));
    if (known.exists()) return; // a number that has ordered before keeps its original PIN
    await setDoc(ref, { phone: p, name: String(name || '').slice(0, 40), area: 'Hostels', building: String(building || ''), room: '', orderIds: [], updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('Profile not saved', e);
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

/** Admin: set which hostels a runner serves ('boys' or 'girls'). Takes effect the next time they sign in. */
export async function setRunnerHostelSide(runnerId, hs) {
  await updateDoc(doc(db, 'staff', runnerId), { hostelSide: hs === 'girls' ? 'girls' : 'boys' });
  logActivity('team', `set a runner to ${hs === 'girls' ? "girls'" : "boys'"} hostels`);
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
  // A screen opened after the orders loaded gets them straight away (not only on the next change)
  if (ordersCache) Promise.resolve().then(() => ordersListeners.has(cb) && cb(ordersCache));
  return () => {
    ordersListeners.delete(cb);
  };
}

/* ---------------------- demo mode (?demo=1) ---------------------- */
// A demonstration of the full order journey for videos and showing people in person.
// Demo orders live only in this browser tab: nothing is saved, no runner or vendor is notified.
export const DEMO = (() => {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
})();
export const DEMO_PAY_TO = { bankName: 'Demo Bank', accountNumber: '0123456789', accountName: 'Roomly Demo Runner' };
export const DEMO_VENDOR_PAY_TO = { bankName: 'Demo Bank', accountNumber: '0123456789', accountName: 'Roomly Demo Vendor' };
/** Seconds between demo order steps (slow enough to read captions in a video) */
const DEMO_STEP_MS = 6000;
const demoOrders = new Map();
const demoSubs = new Map();
const isDemoId = (id) => DEMO && String(id || '').startsWith('DEMO-');
function demoPush(o) {
  demoOrders.set(o.id, o);
  (demoSubs.get(o.id) || new Set()).forEach((cb) => cb({ ...o }));
}
function demoCreateOrder(p) {
  const now = new Date();
  const cart = ['inside', 'store', 'food'].includes(p.cart) ? p.cart : 'inside';
  const subtotal = Number(p.subtotal || 0);
  const deliveryFee = deliveryFeeFor(subtotal, cart !== 'inside');
  const id = `DEMO-${Math.floor(1000 + Math.random() * 9000)}`;
  const order = {
    ...p,
    id,
    hostelSide: cart === 'inside' && !p.isCustomLocation ? hostelSideOf(p.building) : 'boys',
    cart,
    hasStore: cart === 'store',
    hasFood: cart === 'food',
    pin: undefined,
    status: 'Received',
    paymentStatus: 'unpaid',
    paymentMethod: 'pay_now',
    payTo: cart === 'inside' ? DEMO_PAY_TO : DEMO_VENDOR_PAY_TO,
    runnerId: '',
    runnerName: cart === 'inside' ? 'Demo Runner' : '',
    operatorName: cart !== 'inside' ? 'Roomly Demo Vendor' : '',
    express: null,
    subtotal,
    deliveryFee,
    totalAmount: subtotal + deliveryFee,
    createdAt: now.toISOString(),
    paymentDeadline: new Date(now.getTime() + 15 * 60000).toISOString(),
    history: [{ status: 'Received', timestamp: now.toISOString(), note: 'Demo order: nothing was sent to anyone', updatedBy: 'Roomly' }],
  };
  demoPush(order);
  return { ...order };
}
function demoPaid(id) {
  const o = demoOrders.get(id);
  if (!o) return null;
  const step = (patch, status) => {
    const cur = demoOrders.get(id);
    if (!cur) return;
    const at = new Date().toISOString();
    demoPush({ ...cur, ...patch, history: [...(cur.history || []), { status: status || cur.status, timestamp: at, note: '', updatedBy: 'Demo' }] });
  };
  const sent = { ...o, paymentStatus: 'payment_sent', paymentSentAt: new Date().toISOString(), payReady: true };
  demoPush(sent);
  const outside = o.cart === 'store' || o.cart === 'food';
  // The journey plays by itself, a few seconds per step
  window.setTimeout(() => step({ paymentStatus: 'payment_confirmed', status: outside ? 'Received' : 'Packing' }, outside ? 'Received' : 'Packing'), DEMO_STEP_MS);
  if (outside) {
    window.setTimeout(
      () => step({ [o.cart === 'food' ? 'foodStatus' : 'storeStatus']: 'sent', status: 'Delivered', deliveredAt: new Date().toISOString() }, 'Delivered'),
      DEMO_STEP_MS * 2
    );
  } else {
    window.setTimeout(() => step({ status: 'On the way', onTheWayAtMs: Date.now() }, 'On the way'), DEMO_STEP_MS * 2);
    window.setTimeout(() => step({ status: 'Delivered', deliveredAt: new Date().toISOString() }, 'Delivered'), DEMO_STEP_MS * 3);
  }
  return { ...sent };
}

/** @returns {Promise<any>} */
export async function getOrderById(orderId) {
  if (!orderId) return null;
  if (isDemoId(String(orderId).trim().toUpperCase())) return demoOrders.get(String(orderId).trim().toUpperCase()) || null;
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
  if (isDemoId(orderId)) {
    const set = demoSubs.get(orderId) || new Set();
    set.add(cb);
    demoSubs.set(orderId, set);
    return () => set.delete(cb);
  }
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
export const BANNED_MESSAGE = 'This account has been banned from Roomly. Contact Roomly if you think this is a mistake.';
/**
 * Banned from the whole of Roomly (orders, Hostel Hub and Games): by phone number, and this browser once
 * a banned number has been used on it.
 */
export async function isBannedFromRoomly(phone) {
  try {
    if (localStorage.getItem('roomly_banned') === '1') return true;
  } catch {}
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p)) return false;
  try {
    const s = await getDoc(doc(db, 'hubBans', p));
    if (s.exists()) {
      try {
        localStorage.setItem('roomly_banned', '1');
      } catch {}
      return true;
    }
  } catch {}
  return false;
}

export async function createOrder(orderPayload) {
  if (DEMO) return demoCreateOrder(orderPayload);
  const phone = normalizePhone(orderPayload.phone);
  const pin = orderPayload.pin;
  if (!isValidNigerianPhone(phone)) throw new Error('Invalid phone number');
  if (await isBannedFromRoomly(phone)) throw new Error(BANNED_MESSAGE);
  if (!isValidPin(pin)) throw new Error('A 4-digit PIN is required');

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
  // Inside orders belong to the boys' or girls' side by hostel (custom spots: boys' side)
  const hostelSide = hasOutside || orderPayload.isCustomLocation ? 'boys' : hostelSideOf(orderPayload.building);
  const isExpress = Boolean(orderPayload.express) && !hasOutside && getExpressRunners(new Date(), hostelSide).length > 0;
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

  // Outside orders lock the operator's cost now, so a price change before delivery day doesn't change the settlement
  let orderItems = orderPayload.items || [];
  if (hasOutside) {
    try {
      const products = (await readCatalog()).products || [];
      const opId = orderPayload.operatorId || '';
      orderItems = orderItems.map((i) => {
        if (i.source !== 'outside' && i.source !== 'food') return i;
        const c = costOf(i, products, false, opId);
        return c.estimated ? i : { ...i, lockedCost: c.cost };
      });
    } catch (e) {
      /* no lock: the settlement uses the cost at delivery, as before */
    }
  }

  const newOrder = {
    id: orderId,
    hostelSide,
    phone,
    name: orderPayload.name,
    area: orderPayload.area,
    building: orderPayload.building,
    room: orderPayload.room,
    items: orderItems,
    customRequest: orderPayload.customRequest || '',
    hasStore,
    hasFood,
    cart,
    operatorId: orderPayload.operatorId || '',
    operatorName: orderPayload.operatorName || '',
    turnRunner: isExpress || collectsAsRoomly() ? '' : orderPayload.turnRunner || '',
    lateBatch: isExpress ? false : Boolean(orderPayload.lateBatch),
    // Express: the account shows once a runner accepts
    payTo: isExpress ? null : collectsAsRoomly() ? roomlyPayTo() : orderPayload.payTo || null,
    // Roomly collects the money: the admin assigns it and pays the runner / store out
    collectedBy: collectsAsRoomly() ? 'roomly' : '',
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
    // Where this student first came from (?ref= link) and what they said at their first checkout
    ref: getRef(),
    heardFrom: getHeardFrom(),
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
      // Greeting name: what they typed in "What should we call you?", else the one saved before
      callName: String(orderPayload.callName ?? existingProfile?.callName ?? '').trim().slice(0, 30),
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
  if (isDemoId(orderId)) return demoPaid(orderId);
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
        const { next } = getNextBatch(side, new Date(), o.hostelSide || 'boys');
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
async function confirmPayment__raw(orderId, confirmedBy = 'Runner / Admin', txAt = '') {
  try {
    return await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_confirmed';
      o.paymentConfirmedAt = now;
      o.paymentConfirmedBy = confirmedBy;
      delete o.paymentNotReceived;
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
async function startPackagingOrder__raw(orderId, runnerId, runnerName, runnerPhone) {
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
/** Who the history shows when the 15-minute timer marks an inside order delivered */
export const AUTO_DELIVERED_BY = 'Auto (15-minute timer)';

async function updateOrderStatus__raw(orderId, newStatus, updatedBy = 'Admin', note = '') {
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
        if (updatedBy === AUTO_DELIVERED_BY) o.autoDelivered = true;
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
        // Starts the 15-minute arrival timer the student sees
        o.onTheWayAt = now;
        o.onTheWayAtMs = Date.now();
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
  if (!isValidNigerianPhone(p) || !isValidPin(pin)) return [];
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
  if (isDemoId(orderId)) return null;
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

/* ------------------- activity log ------------------- */
// Who did what and when (operators, runners and the admin). Only the admin can read it, nobody can edit it.
// Logging never blocks the action: if the entry can't be saved, the action still goes through.

const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;

/** type: 'price' | 'product' | 'stock' | 'days' | 'order' | 'money' | 'request' | 'staff' */
export function logActivity(type, text, ref = '') {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const staff = getCurrentStaff();
  addDoc(collection(db, 'activity'), {
    at: new Date().toISOString(),
    atMs: Date.now(),
    uid,
    who: String(staff?.name || auth.currentUser?.email || 'Someone').slice(0, 60),
    role: staff?.role || 'admin',
    type,
    text: String(text).slice(0, 300),
    ref: String(ref || '').slice(0, 80),
  }).catch((e) => console.error('Activity not logged:', e));
}

/** Admin: one page of the activity log, newest first. Pass the last entry's atMs to load the next page. */
export async function getActivityPage(beforeMs = 0, pageSize = 50) {
  const q = beforeMs
    ? query(collection(db, 'activity'), where('atMs', '<', beforeMs), orderBy('atMs', 'desc'), limit(pageSize))
    : query(collection(db, 'activity'), orderBy('atMs', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const orderLabel = (o) => `${o?.name || 'a student'}'s order ${o?.id || ''}`.trim();

/* ------------------- store and food operators ------------------- */

/**
 * Operator: add (or replace) a photo of the packed order. The student sees it large on their order,
 * so they know what to collect at the gate. Allowed after payment is confirmed, until the order is delivered.
 */
export async function addPackagePhoto(orderId, file) {
  if (!CLOUDINARY.cloudName || !CLOUDINARY.uploadPreset) throw new Error('Photo uploads are not set up yet.');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Photo upload failed. Check your connection and try again.');
  const data = await res.json();
  const url = String(data.secure_url).replace('/upload/', '/upload/w_1000,c_limit,q_auto,f_auto/');
  const who = getCurrentStaff()?.name || 'Operator';
  const updated = await patchOrder(orderId, (o) => {
    o.packPhoto = url;
    o.packPhotoAt = new Date().toISOString();
    o.packPhotoBy = who;
  });
  if (!updated) throw new Error('Order not found.');
  logActivity('order', `added a package photo to ${orderLabel(updated)}`, orderId);
  return url;
}

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
async function updatePartStatus__raw(orderId, kind, status, who = 'Operator') {
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
 *   Operators keep the standard (cost) price + ₦500 per cart; they owe the margin + ₦300 per cart.
 *   Runners keep what they spent on items + 30% of the day's profit (item margin + delivery fees);
 *   they owe the other 70%. Gate pickup fees are shown but kept by the runner.
 * due = what the provider owes for that day. They tap "I have sent"; the admin confirms or overrides.
 * A day not settled by 6am next morning hides that provider from checkout.
 */

const OP_KEEP_PER_CART = 500;
const OP_OWE_PER_CART = 300;

/** Cost (standard price) of one cart line. Uses the cost price you entered; otherwise works it back from the margin. */
function costOf(item, products, inside = false, opId = '') {
  // Outside: the cost locked when the order was placed wins over today's price
  if (!inside && typeof item.lockedCost === 'number' && item.lockedCost > 0) return { cost: item.lockedCost, estimated: false };
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
  if (isRoomlyOrder(order)) return; // Roomly holds the money and pays the store out
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
 * Runner: an inside order was delivered.
 * Current rule: the runner keeps the delivery fee (₦600 on express) and owes Roomly the item margin
 * (plus Roomly's ₦600 on express). With a helper, the delivery pay splits 50/50; Roomly's part does not change.
 * Orders placed before the change keep the old rule (30% of the profit to the runner).
 */
/** The runner's pay on one inside order, before any helper split */
function runnerPayOf(order, profit, itemProfit, fee, express) {
  if (isOldPayOrder(order)) return express ? itemProfit * RUNNER_SHARE + EXPRESS_RUNNER_SHARE : profit * RUNNER_SHARE;
  return runnerPayFor(fee, express);
}
/** @returns {Promise<void>} */
async function recordRunnerDelivery(order) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner') return; // admin taps are not a runner's delivery
  if (order.cart && order.cart !== 'inside') return;
  if (isRoomlyOrder(order)) return; // Roomly holds the money and pays the runner out
  const { paid, spent, fee, profit, estimated } = await insideProfitOf(order);
  const express = Boolean(order.express && order.express.status === 'accepted');
  const itemProfit = Math.max(0, paid - spent);
  const share = runnerPayOf(order, profit, itemProfit, fee, express);
  // Everything collected minus what was spent and the runner's pay is Roomly's
  const owed = Math.max(0, paid + fee - spent - share);
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
    await updateDoc(doc(db, 'orders', order.id), { runnerProfit: profit, runnerPay: share, helperShare });
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
        note: helper
          ? `${helper.name} helped with this delivery (${isOldPayOrder(o) ? '30% share' : 'delivery pay'} split 50/50)`
          : 'Helper removed',
        updatedBy: staff.name || 'Runner',
      },
    ],
  };
  // Helper added after delivery: move half of the delivering runner's pay to the helper
  if (delivered && helper) {
    let pay = Number.isFinite(o.runnerPay) ? o.runnerPay : NaN;
    let profit = Number.isFinite(o.runnerProfit) ? o.runnerProfit : NaN;
    if (!Number.isFinite(pay)) {
      const r = await insideProfitOf(o);
      profit = r.profit;
      const exp = Boolean(o.express && o.express.status === 'accepted');
      pay = runnerPayOf(o, r.profit, Math.max(0, r.paid - r.spent), r.fee, exp);
    }
    const half = Math.round(pay / 2);
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
async function sendSettlement__raw(id, amount, note) {
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
async function adminConfirmSettlement__raw(id, amount, override = false) {
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
async function savePayAccount__raw(acc) {
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

/* ---------------- gate to room pickup ----------------
 * 1. After the operator taps "Order delivered", the student asks for a runner (₦1,000 flat). Every runner sees it.
 * 2. A runner who taps Refuse stops seeing it; the others still do.
 * 3. From 10 minutes with no runner, the student may cancel. At 30 minutes it cancels by itself.
 * 4. A runner accepts (first one wins) -> the student pays and taps "I have paid the runner"
 *    -> the runner taps "Confirm ₦1,000 received" -> the runner brings it and taps "Brought to room".
 * 5. A runner who can't do it after accepting releases it: it goes back to New for the other runners.
 *    If the student already paid, the runner sends the ₦1,000 back (the release is recorded as a refund).
 */
export const GATE_CANCEL_AFTER_MS = 10 * 60000;
export const GATE_EXPIRE_MS = 30 * 60000;

/** When the current request started (older requests only have updatedAt) */
const gateAskedAt = (gp) => Number(gp && gp.requestedAt) || Date.parse((gp && gp.updatedAt) || '') || 0;

/** Pending with no runner for 30 minutes: cancelled by itself */
export function gateExpired(gp, now = Date.now()) {
  return Boolean(gp && gp.status === 'pending' && now - gateAskedAt(gp) >= GATE_EXPIRE_MS);
}

/** Minutes until the student may cancel (0 = they can now) */
export function gateCancelIn(gp, now = Date.now()) {
  if (!gp || gp.status !== 'pending') return 0;
  return Math.max(0, Math.ceil((gateAskedAt(gp) + GATE_CANCEL_AFTER_MS - now) / 60000));
}

/** Can the student send a new request? (nothing asked yet, cancelled, expired, or an old refused / refunded one) */
export function gateCanAskAgain(gp, now = Date.now()) {
  return !gp || ['refused', 'refunded', 'cancelled'].includes(gp.status) || gateExpired(gp, now);
}

/**
 * Runners: action = 'accept' | 'refuse' | 'confirm' | 'delivered' | 'release'.
 * refuse  = hide it from me only. confirm = the student's ₦1,000 reached my account.
 * release = I can't do it after all: back to New for the other runners (a refund if the student already paid).
 */
async function updateGatePickup__raw(orderId, action) {
  const staff = getCurrentStaff();
  const who = staff?.name || 'Runner';
  const uid = auth.currentUser?.uid || '';
  if (action === 'refund') action = 'release'; // older button name
  if (!['accept', 'refuse', 'confirm', 'delivered', 'release'].includes(action)) return null;
  if (action === 'accept' && isRunnerOff(auth.currentUser?.email)) {
    window.alert('The admin has switched you off. You cannot take new gate pickups until the admin switches you back on.');
    return { blocked: true };
  }
  const ref = doc(db, 'orders', orderId);
  let result = null;
  let gateDone = null;
  let problem = '';
  try {
    // One transaction, so two runners can't both accept and nothing changes under a runner's feet
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const o = { ...snap.data(), id: snap.id };
      if (!o.history) o.history = [];
      const gp = { ...(o.gatePickup || { status: 'pending', fee: GATE_PICKUP_FEE }) };
      const now = new Date().toISOString();
      const mine = gp.status === 'accepted' && (gp.runnerUid ? gp.runnerUid === uid : gp.runnerName === who);
      let note = '';
      if (action === 'accept') {
        if (gp.status !== 'pending' || gateExpired(gp)) {
          problem = 'Another runner took this pickup, or it was cancelled.';
          return;
        }
        Object.assign(gp, {
          status: 'accepted',
          fee: GATE_PICKUP_FEE,
          heavy: false,
          runnerName: who,
          runnerUid: uid,
          runnerPhone: staff?.phone || '',
          runnerPay: staff?.payAccount || null, // the student pays the runner this account
          paid: false,
          payConfirmed: false,
        });
        note = `Gate pickup accepted (₦${GATE_PICKUP_FEE.toLocaleString()}) by ${who}`;
      } else if (action === 'refuse') {
        if (gp.status !== 'pending') return;
        gp.refusedBy = [...new Set([...(gp.refusedBy || []), uid])];
        note = `${who} can't take the gate pickup`;
      } else if (action === 'confirm') {
        if (!mine || !gp.paid) {
          problem = 'The student has not marked it paid yet.';
          return;
        }
        gp.payConfirmed = true;
        gp.payConfirmedAt = now;
        note = `${who} confirmed the ₦${(gp.fee || GATE_PICKUP_FEE).toLocaleString()} gate pickup payment`;
      } else if (action === 'delivered') {
        if (!mine || !gp.payConfirmed) {
          problem = 'Confirm the payment reached your account first.';
          return;
        }
        gp.status = 'delivered';
        note = `Gate pickup brought to the room by ${who}`;
      } else if (action === 'release') {
        if (!mine) return;
        const refund = Boolean(gp.paid);
        if (refund) gp.refunds = [...(gp.refunds || []), { runnerName: who, amount: gp.fee || GATE_PICKUP_FEE, at: now }];
        gp.refusedBy = [...new Set([...(gp.refusedBy || []), uid])];
        Object.assign(gp, { status: 'pending', requestedAt: Date.now(), runnerName: '', runnerUid: '', runnerPhone: '', runnerPay: null, paid: false, payConfirmed: false });
        note = refund
          ? `${who} couldn't do the gate pickup and is refunding ₦${(gp.fee || GATE_PICKUP_FEE).toLocaleString()}. Back to the other runners.`
          : `${who} couldn't do the gate pickup. Back to the other runners.`;
      }
      gp.updatedAt = now;
      o.gatePickup = gp;
      o.history.push({ status: o.status, timestamp: now, note, updatedBy: who });
      gateDone = action === 'delivered' ? o : null;
      tx.set(ref, slim(o));
      result = o;
    });
  } catch (e) {
    console.error(e);
    return null;
  }
  if (problem) {
    window.alert(problem);
    return { blocked: true };
  }
  if (gateDone) recordGateFee(gateDone).catch((e) => console.error(e));
  return result;
}

/** Student: cancel a gate pickup that no runner has accepted for 10 minutes; they collect it at the gate */
export async function cancelGatePickup(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      const gp = o.gatePickup;
      if (!gp || gp.status !== 'pending' || gateCancelIn(gp) > 0) return;
      const now = new Date().toISOString();
      o.gatePickup = { ...gp, status: 'cancelled', cancelledAt: now, updatedAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student cancelled the gate pickup (no runner accepted)', updatedBy: o.name || 'Customer' });
    });
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
async function decideCatalogRequest__raw(r, approve, adminNote = '') {
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
async function quoteProductRequest__raw(reqId, costs, category) {
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
      if (o.gatePickup && !gateCanAskAgain(o.gatePickup)) return;
      const now = new Date().toISOString();
      // Where the runner should bring it
      if (building && room) {
        o.area = 'Hostels';
        o.building = String(building).slice(0, 40);
        o.room = String(room).replace(/\s+/g, '').toUpperCase().slice(0, 8);
      }
      o.gateReq = true;
      o.gatePickup = { status: 'pending', fee: GATE_PICKUP_FEE, heavy: false, requestedAt: Date.now(), refusedBy: [], updatedAt: now };
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
async function operatorConfirmPayment__raw(orderId) {
  const staff = getCurrentStaff();
  const who = staff?.name || 'Operator';
  try {
    return await patchOrder(orderId, (o) => {
      if (o.paymentStatus !== 'payment_sent') return;
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_confirmed';
      o.paymentConfirmedAt = now;
      o.paymentConfirmedBy = who;
      delete o.paymentNotReceived;
      o.history.push({ status: o.status, timestamp: now, note: `Payment confirmed by ${who}`, updatedBy: who });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Runner or operator: they checked their account and the student's money never arrived.
 * The order keeps its payment status (so "Confirm payment" still works if the money lands late) and is shown as Not paid. */
/** @returns {Promise<any>} */
async function markPaymentNotReceived__raw(orderId, who = '') {
  const staff = getCurrentStaff();
  const by = who || staff?.name || 'Operator';
  try {
    return await patchOrder(orderId, (o) => {
      if (o.paymentStatus !== 'payment_sent' || o.status === 'Cancelled' || o.paymentNotReceived) return;
      const now = new Date().toISOString();
      o.paymentNotReceived = { at: now, by };
      o.history.push({ status: o.status, timestamp: now, note: `${by} checked and did not receive this payment`, updatedBy: by });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Provider: agree with the day's statement. Not allowed while an objection is open. */
/** @returns {Promise<void>} */
async function clearMyDay__raw(id) {
  const ref = doc(db, 'settlements', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Record not found');
  const open = Object.values(snap.data().objections || {}).filter((x) => x && x.status === 'open').length;
  if (open) throw new Error('You have an open objection. Wait for Roomly to answer it first.');
  await updateDoc(ref, { cleared: true, clearedAt: new Date().toISOString() });
}

/** Provider: object to one cart, with the reason */
/** @returns {Promise<void>} */
async function objectToCart__raw(id, orderId, reason) {
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
async function adminResolveObjection__raw(id, orderId, newOwed, reply) {
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
async function setupStoreCategories__raw() {
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
async function operatorSetPrice__raw(productId, cost) {
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
async function operatorAddProduct__raw({ name, category, cost, unit, imageUrl, group = '' }) {
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
async function operatorSaveFoodOptions__raw(productId, extras, choiceTitle, choices) {
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
async function operatorSetStock__raw(productId, inStock) {
  const store = myStore();
  if (store !== 'store' && store !== 'food') throw new Error('Operators only');
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  if (!p || p.source !== STORE_SOURCE[store]) throw new Error("You can only change your own store's products");
  await setDoc(doc(db, 'catalog', 'overrides'), { stock: { [productId]: Boolean(inStock) } }, { merge: true });
  catalogAt = 0;
}

/** Runner (inside food) or food operator: switch one extra or swallow on or off for today */
/** @returns {Promise<void>} */
async function setOptionStock__raw(productId, optId, inStock) {
  const store = myStore();
  const p = (await readCatalog(true)).products.find((x) => x.id === productId);
  const ok = p && ((store === 'inside' && p.source !== 'outside' && p.source !== 'food') || (store === 'food' && p.source === 'food'));
  if (!ok) throw new Error('Not your item');
  await setDoc(doc(db, 'catalog', 'overrides'), { optStock: { [`${productId}:${optId}`]: Boolean(inStock) } }, { merge: true });
  catalogAt = 0;
}

/** Runner: mark an inside product out of stock (false) or back in stock (true) */
/** @returns {Promise<void>} */
async function runnerSetStock__raw(productId, inStock) {
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
    lines.push({ i, m: inside && isOldPayOrder(o) ? m * (1 - RUNNER_SHARE) : m });
  }
  // Inside: Roomly earns the item margin (+ ₦600 on express). Orders before the change: 70% of margin + fee.
  const exp = Boolean(o.express && o.express.status === 'accepted');
  const insideEarn = isOldPayOrder(o) ? (margin + (o.deliveryFee || 0)) * (1 - RUNNER_SHARE) : margin + (exp ? EXPRESS_ROOMLY_SHARE : 0);
  const earnings = store === 'inside' ? insideEarn : margin + (o.cart === store ? OP_OWE_PER_CART : OP_OWE_PER_CART / 2);
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
      // The runner's "Confirm received" is theirs to tap, never set here
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
async function acceptExpress__raw(orderId) {
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
    const { next } = getNextBatch('inside', now, o.hostelSide || 'boys');
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
async function markExpressRefunded__raw(orderId) {
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
  if (isDemoId(orderId)) return null;
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
  if (isDemoId(order?.id)) return true;
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

/* ---------------- activity log: each action below records who did it ----------------
 * The exported functions wrap the originals (the __raw versions): the action runs first, then the entry is saved.
 */
const productOf = async (id) => {
  try {
    return (await readCatalog()).products.find((x) => x.id === id) || null;
  } catch (e) {
    return null;
  }
};
const dayOfKey = (key) => {
  const d = String(key || '').split('|')[0];
  try {
    return longDayLabel(d);
  } catch (e) {
    return d;
  }
};
const settlementDay = (id) => String(id || '').split('_').pop();
const onOff = (on) => (on ? 'ON' : 'OFF');

export async function operatorSetPrice(productId, cost) {
  const p = await productOf(productId);
  const uid = auth.currentUser?.uid || '';
  const before = (p && ((p.opCosts && p.opCosts[uid]) || p.costPrice)) || 0;
  await operatorSetPrice__raw(productId, cost);
  const name = p?.name || productId;
  const text =
    before && Math.round(before) === Math.round(Number(cost))
      ? `confirmed the price of ${name} at ${naira(cost)}`
      : before
        ? `changed the price of ${name} from ${naira(before)} to ${naira(cost)}`
        : `set the price of ${name} to ${naira(cost)}`;
  logActivity('price', text, productId);
}
export async function operatorAddProduct(args) {
  await operatorAddProduct__raw(args);
  logActivity('product', `added a new product: ${args?.name || ''} at ${naira(args?.cost)}`);
}
export async function operatorSaveFoodOptions(productId, extras, choiceTitle, choices) {
  await operatorSaveFoodOptions__raw(productId, extras, choiceTitle, choices);
  const p = await productOf(productId);
  logActivity('price', `updated the extras and choices of ${p?.name || productId}`, productId);
}
export async function operatorSetStock(productId, inStock) {
  await operatorSetStock__raw(productId, inStock);
  const p = await productOf(productId);
  logActivity('stock', `switched ${p?.name || productId} ${onOff(inStock)}`, productId);
}
export async function runnerSetStock(productId, inStock) {
  await runnerSetStock__raw(productId, inStock);
  const p = await productOf(productId);
  logActivity('stock', `switched ${p?.name || productId} ${onOff(inStock)}`, productId);
}
export async function setOptionStock(productId, optId, inStock) {
  await setOptionStock__raw(productId, optId, inStock);
  const p = await productOf(productId);
  const opt = [...(p?.extras || []), ...(p?.choices || [])].find((o) => o.id === optId);
  logActivity('stock', `switched ${opt?.name || optId} on ${p?.name || productId} ${onOff(inStock)}`, productId);
}
export async function setOperatorSwitch(key, patch) {
  await setOperatorSwitch__raw(key, patch);
  if (patch && 'on' in patch) logActivity('days', `switched ${dayOfKey(key)} ${onOff(patch.on)}`, key);
}
export async function setInsideSwitch(key, patch) {
  await setInsideSwitch__raw(key, patch);
  if (patch && 'on' in patch) logActivity('days', `switched the ${String(key).split('|')[1] || ''} batch on ${dayOfKey(key)} ${onOff(patch.on)}`, key);
}
export async function setMyExpress(on) {
  await setMyExpress__raw(on);
  logActivity('days', `switched express runs ${onOff(on)}`);
}
export async function moveOrderToNextDay(orderId) {
  const day = await moveOrderToNextDay__raw(orderId);
  if (day) logActivity('order', `moved order ${orderId} to ${longDayLabel(day)} (fully booked)`, orderId);
  return day;
}
export async function setOperatorAdminOff(uid, off) {
  await setOperatorAdminOff__raw(uid, off);
  logActivity('staff', `switched operator ${(operatorDocs[uid] || {}).name || uid} ${onOff(!off)}`, uid);
}
export async function setRunnerAdminOff(email, off) {
  await setRunnerAdminOff__raw(email, off);
  logActivity('staff', `switched runner ${email} ${onOff(!off)}`, email);
}
export async function saveProduct(productData) {
  const before = productData?.id ? await productOf(productData.id) : null;
  const res = await saveProduct__raw(productData);
  const name = productData?.name || before?.name || productData?.id || 'a product';
  const oldCost = Number(before?.costPrice) || 0;
  const newCost = Number(productData?.costPrice) || 0;
  const priceNote = before && newCost && oldCost !== newCost ? ` (cost ${naira(oldCost)} to ${naira(newCost)})` : '';
  logActivity('product', before ? `edited ${name}${priceNote}` : `added ${name}${newCost ? ` at ${naira(newCost)}` : ''}`, productData?.id || '');
  return res;
}
export async function deleteProduct(productId) {
  const before = await productOf(productId);
  const res = await deleteProduct__raw(productId);
  logActivity('product', `deleted ${before?.name || productId}`, productId);
  return res;
}
export async function addCategory(name, emoji = '📦', initialSubcategories = ['All'], stores = []) {
  const res = await addCategory__raw(name, emoji, initialSubcategories, stores);
  logActivity('product', `added the category ${name}${stores.length ? ` (${stores.join(', ')})` : ''}`);
  return res;
}
export async function deleteCategory(categoryName, store = '') {
  const res = await deleteCategory__raw(categoryName, store);
  logActivity('product', `deleted the category ${categoryName}${store ? ` from ${store}` : ''}`);
  return res;
}
export async function setupStoreCategories() {
  const res = await setupStoreCategories__raw();
  logActivity('product', `ran "Set up Roomly categories"${res?.added?.length ? ` (added ${res.added.join(', ')})` : ''}`);
  return res;
}
export async function operatorConfirmPayment(orderId) {
  const o = await operatorConfirmPayment__raw(orderId);
  if (o) logActivity('order', `confirmed payment on ${orderLabel(o)} (${naira(o.totalAmount)})`, orderId);
  return o;
}
export async function markPaymentNotReceived(orderId, who = '') {
  const o = await markPaymentNotReceived__raw(orderId, who);
  if (o) logActivity('order', `marked payment not received on ${orderLabel(o)} (${naira(o.totalAmount)})`, orderId);
  return o;
}
export async function updatePartStatus(orderId, kind, status, who = 'Operator') {
  const o = await updatePartStatus__raw(orderId, kind, status, who);
  if (o) logActivity('order', status === 'sent' ? `tapped Order delivered on ${orderLabel(o)}` : `marked ${orderLabel(o)} as ${status}`, orderId);
  return o;
}
export async function confirmPayment(orderId, confirmedBy = 'Runner / Admin', txAt = '') {
  const o = await confirmPayment__raw(orderId, confirmedBy, txAt);
  if (o) logActivity('order', `confirmed payment on ${orderLabel(o)} (${naira(o.totalAmount)})`, orderId);
  return o;
}
export async function startPackagingOrder(orderId, runnerId, runnerName, runnerPhone) {
  const o = await startPackagingOrder__raw(orderId, runnerId, runnerName, runnerPhone);
  if (o) logActivity('order', `accepted ${orderLabel(o)} and started packing`, orderId);
  return o;
}
export async function updateOrderStatus(orderId, newStatus, updatedBy = 'Admin', note = '') {
  const o = await updateOrderStatus__raw(orderId, newStatus, updatedBy, note);
  if (o) logActivity('order', `changed ${orderLabel(o)} to ${newStatus}`, orderId);
  return o;
}
export async function savePayAccount(acc) {
  await savePayAccount__raw(acc);
  const num = String(acc?.accountNumber || '').replace(/\D/g, '');
  logActivity('money', `changed their payment account to ${acc?.bankName || ''} ${num} (${acc?.accountName || ''})`);
}
export async function sendSettlement(id, amount, note) {
  await sendSettlement__raw(id, amount, note);
  logActivity('money', `sent ${naira(amount)} to Roomly for ${settlementDay(id)}`, id);
}
export async function adminConfirmSettlement(id, amount, override = false) {
  await adminConfirmSettlement__raw(id, amount, override);
  logActivity('money', override ? `marked ${id} as settled (paid outside the app)` : `confirmed ${naira(amount)} received for ${id}`, id);
}
export async function clearMyDay(id) {
  await clearMyDay__raw(id);
  logActivity('money', `tapped All cleared for ${settlementDay(id)}`, id);
}
export async function objectToCart(id, orderId, reason) {
  await objectToCart__raw(id, orderId, reason);
  logActivity('money', `objected to order ${orderId} on ${settlementDay(id)}: ${String(reason || '').slice(0, 150)}`, orderId);
}
export async function adminResolveObjection(id, orderId, newOwed, reply) {
  await adminResolveObjection__raw(id, orderId, newOwed, reply);
  logActivity('money', newOwed === null ? `dismissed the objection on order ${orderId}` : `corrected order ${orderId} to ${naira(newOwed)} owed`, orderId);
}
const REQUEST_SIDE_LABEL = { inside: 'inside runners', store: 'outside store', food: 'outside food' };
/**
 * Runner or operator: this request isn't for them. Send it to the side that sells it.
 * Only an open request, and only by the side that has it now (or the admin).
 */
export async function moveProductRequest(reqId, toSide) {
  if (!['inside', 'store', 'food'].includes(toSide)) throw new Error('Pick where it goes');
  const staff = getCurrentStaff();
  const ref = doc(db, 'productRequests', reqId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Request not found');
  const r = snap.data();
  if (r.status !== 'open') throw new Error('This request has already been answered.');
  if (r.side === toSide) return;
  const by = staff?.role === 'admin' ? 'Roomly admin' : staff?.name || 'Staff';
  await updateDoc(ref, { side: toSide, movedFrom: r.side, movedBy: by, movedAt: new Date().toISOString() });
  logActivity('request', `moved a request (${(r.items || []).map((i) => i.name).join(', ')}) to the ${REQUEST_SIDE_LABEL[toSide]}`, reqId);
}

/** Runner or operator: the product is already in the store, so the request is closed and the student is told to search for it */
export async function closeProductRequestListed(reqId) {
  const staff = getCurrentStaff();
  const ref = doc(db, 'productRequests', reqId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Request not found');
  const r = snap.data();
  if (r.status !== 'open') throw new Error('This request has already been answered.');
  const by = staff?.role === 'admin' ? 'Roomly admin' : staff?.name || 'Staff';
  await updateDoc(ref, { status: 'closed', closedReason: 'listed', closedBy: by, closedAt: new Date().toISOString() });
  logActivity('request', `closed a request (${(r.items || []).map((i) => i.name).join(', ')}): already in the store`, reqId);
}

export async function quoteProductRequest(reqId, costs, category) {
  await quoteProductRequest__raw(reqId, costs, category);
  let items = '';
  try {
    const snap = await getDoc(doc(db, 'productRequests', reqId));
    const r = snap.exists() ? snap.data() : null;
    items = (r?.items || []).map((it, i) => `${it.name} ${Number(costs[i]) > 0 ? naira(costs[i]) : '(not available)'}`).join(', ');
  } catch (e) {
    /* names are a nice-to-have */
  }
  logActivity('request', `answered a product request${items ? `: ${items}` : ''}`, reqId);
}
export async function updateGatePickup(orderId, action) {
  const o = await updateGatePickup__raw(orderId, action);
  if (o) logActivity('order', `gate pickup on ${orderLabel(o)}: ${action}`, orderId);
  return o;
}
export async function acceptExpress(orderId) {
  const res = await acceptExpress__raw(orderId);
  logActivity('order', `accepted express order ${orderId}`, orderId);
  return res;
}
export async function markExpressRefunded(orderId) {
  const res = await markExpressRefunded__raw(orderId);
  logActivity('money', `refunded the late express fee on order ${orderId}`, orderId);
  return res;
}
export async function decideCatalogRequest(r, approve, adminNote = '') {
  const res = await decideCatalogRequest__raw(r, approve, adminNote);
  logActivity('request', `${approve ? 'approved' : 'declined'} a ${r?.type === 'price' ? 'price change' : 'new product'} request${r?.name ? ` for ${r.name}` : ''}`);
  return res;
}


/* ---------------------- inside 15-minute arrival timer ---------------------- */

/** Staff only (runner portal / admin): mark normal inside orders delivered once their 15 minutes have run out */
/** @returns {Promise<number>} */
export async function autoDeliverOverdue(orders) {
  const limit = INSIDE_ARRIVAL_MINUTES * 60000;
  const due = (orders || []).filter(
    (o) => o && o.status === 'On the way' && insideTimerOrder(o) && Date.now() - Number(o.onTheWayAtMs) >= limit
  );
  let done = 0;
  for (const o of due) {
    try {
      const u = await updateOrderStatus(
        o.id,
        'Delivered',
        AUTO_DELIVERED_BY,
        'Marked delivered automatically: 15 minutes passed since the runner left'
      );
      if (u) done++;
    } catch (e) {
      console.error('Auto delivery failed', o.id, e);
    }
  }
  return done;
}

/** Can the student still tap "I haven't received it" on this inside order? */
export function canFlagNotReceived(o, nowMs = Date.now()) {
  if (!o || o.notReceived || !insideTimerOrder(o)) return false;
  const left = INSIDE_ARRIVAL_MINUTES * 60000 - (nowMs - Number(o.onTheWayAtMs));
  if (o.status === 'On the way') return left <= 0;
  if (o.status !== 'Delivered') return false;
  const del = Date.parse(o.deliveredAt || '');
  return !Number.isFinite(del) || nowMs - del < NOT_RECEIVED_WINDOW_HOURS * 3600000;
}

/** Student: the order was marked delivered (or the timer ran out) but it never reached the room. Flags it to admin. */
/** @returns {Promise<any>} */
export async function markNotReceived(orderId) {
  try {
    const o = await patchOrder(orderId, (ord) => {
      if (!canFlagNotReceived(ord)) return;
      const nowMs = Date.now();
      ord.notReceived = { atMs: nowMs, at: new Date(nowMs).toISOString() };
      ord.history.push({
        status: ord.status,
        timestamp: ord.notReceived.at,
        note: "Student says they haven't received this order",
        updatedBy: ord.name || 'Customer',
      });
    });
    if (o && o.notReceived) logActivity('order', `student flagged ${orderLabel(o)} as not received`, orderId);
    return o;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Admin: close a "not received" flag once it has been sorted out with the student and runner */
/** @returns {Promise<any>} */
export async function resolveNotReceived(orderId, note = '') {
  try {
    return await patchOrder(orderId, (o) => {
      if (!o.notReceived || o.notReceived.resolvedAt) return;
      const now = new Date().toISOString();
      o.notReceived = { ...o.notReceived, resolvedAt: now, resolvedNote: note };
      o.history.push({ status: o.status, timestamp: now, note: `Not received flag resolved${note ? `: ${note}` : ''}`, updatedBy: 'Admin' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}


/* ---------------------- feedback box (suggestions, complaints) ---------------------- */

export const FEEDBACK_TYPES = ['Suggestion', 'Complaint', 'Problem with an order', 'Other'];

/** Student: send a message to Roomly. info: { name, hostel, ordersCount, lastOrderId } when signed in */
export async function sendFeedback(type, message, phone, info = {}) {
  const text = String(message || '').trim().slice(0, 500);
  if (text.length < 3) throw new Error('Write your message first.');
  if (!FEEDBACK_TYPES.includes(type)) throw new Error('Pick what this is about.');
  try {
    const last = Number(localStorage.getItem('roomly_feedback_at') || 0);
    if (Date.now() - last < 2 * 60000) throw new Error('You just sent one. Please wait a couple of minutes before sending another.');
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('You just')) throw e;
  }
  const p = normalizePhone(phone || '');
  await addDoc(collection(db, 'feedback'), {
    type,
    message: text,
    phone: isValidNigerianPhone(p) ? p : '',
    name: String(info.name || '').slice(0, 40),
    hostel: String(info.hostel || '').slice(0, 40),
    ordersCount: Math.max(0, Math.round(Number(info.ordersCount) || 0)),
    lastOrderId: String(info.lastOrderId || '').slice(0, 40),
    status: 'new',
    atMs: Date.now(),
  });
  try {
    localStorage.setItem('roomly_feedback_at', String(Date.now()));
  } catch {}
}

/** Admin: every message, newest first */
export function subscribeFeedbackMessages(cb) {
  return onSnapshot(
    query(collection(db, 'feedback'), orderBy('atMs', 'desc'), limit(200)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}
export async function setFeedbackStatus(id, status) {
  await updateDoc(doc(db, 'feedback', id), { status, doneAtMs: status === 'done' ? Date.now() : 0 });
}

/* ---------------------- runner applications (Become a Roomly Runner page) ---------------------- */

export const RUNNER_APP_LEVELS = ['100', '200', '300', '400', '500', 'Other'];
export const RUNNER_APP_STATUSES = ['new', 'contacted', 'accepted', 'rejected'];

/** Anyone: apply to be a runner. Batches is a list of labels the student ticked. */
export async function submitRunnerApplication(form) {
  const name = String(form.name || '').trim().slice(0, 60);
  const phone = normalizePhone(form.phone || '');
  const hostel = String(form.hostel || '').trim().slice(0, 40);
  const level = String(form.level || '').trim();
  const batches = (form.batches || []).map((b) => String(b).slice(0, 40)).slice(0, 12);
  const message = String(form.message || '').trim().slice(0, 500);
  if (name.length < 2) throw new Error('Enter your full name.');
  if (!isValidNigerianPhone(phone)) throw new Error('Enter a valid WhatsApp number, e.g. 08012345678.');
  if (!hostel) throw new Error('Pick your hostel.');
  if (!RUNNER_APP_LEVELS.includes(level)) throw new Error('Pick your level.');
  if (batches.length === 0) throw new Error('Tick at least one batch you can usually do.');
  try {
    const last = Number(localStorage.getItem('roomly_runner_app_at') || 0);
    if (Date.now() - last < 10 * 60000) throw new Error('Your application was already sent. We will reach you on WhatsApp.');
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Your application')) throw e;
  }
  await addDoc(collection(db, 'runnerApplications'), {
    name,
    phone,
    hostel,
    level,
    batches,
    message,
    status: 'new',
    note: '',
    atMs: Date.now(),
  });
  try {
    localStorage.setItem('roomly_runner_app_at', String(Date.now()));
  } catch {}
}

/** Admin: every application, newest first */
export function subscribeRunnerApplications(cb) {
  return onSnapshot(
    query(collection(db, 'runnerApplications'), orderBy('atMs', 'desc'), limit(200)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

/** Admin: move an application along (new, contacted, accepted, rejected), with an optional private note */
export async function setRunnerApplicationStatus(id, status, note) {
  if (!RUNNER_APP_STATUSES.includes(status)) throw new Error('Unknown status');
  const patch = { status, updatedAtMs: Date.now() };
  if (typeof note === 'string') patch.note = note.slice(0, 300);
  await updateDoc(doc(db, 'runnerApplications', id), patch);
}

/* ---------------------- price lists for suppliers (private links) ---------------------- */
// Each supplier gets a secret link (?prices=<token>). They type their own price for each item; nothing
// reaches the store until the admin applies it. Their page never shows Roomly's prices or margin.

const PRICE_LINK_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const newPriceToken = () => Array.from(crypto.getRandomValues(new Uint8Array(22)), (b) => PRICE_LINK_CHARS[b % PRICE_LINK_CHARS.length]).join('');

/** Admin: make a link for a supplier. categories: [] = every inside-school store category */
export async function createPriceLink(name, categories = []) {
  const token = newPriceToken();
  await setDoc(doc(db, 'priceLinks', token), {
    name: String(name || '').trim().slice(0, 40) || 'Supplier',
    categories: (categories || []).slice(0, 40),
    active: true,
    note: '',
    noteAtMs: 0,
    createdAtMs: Date.now(),
  });
  return token;
}
export function subscribePriceLinks(cb) {
  return onSnapshot(
    collection(db, 'priceLinks'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))),
    () => cb([])
  );
}
export async function setPriceLinkActive(token, active) {
  await updateDoc(doc(db, 'priceLinks', token), { active: Boolean(active) });
}
export async function deletePriceLink(token) {
  await deleteDoc(doc(db, 'priceLinks', token));
}

/* the supplier's page (no login: the token is the key) */
export async function getPriceLink(token) {
  const s = await getDoc(doc(db, 'priceLinks', token));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export function subscribeLinkPrices(token, cb) {
  return onSnapshot(
    collection(db, 'priceLinks', token, 'prices'),
    (snap) => {
      const m = {};
      snap.docs.forEach((d) => (m[d.id] = d.data()));
      cb(m);
    },
    () => cb({})
  );
}
export function subscribeLinkNewItems(token, cb) {
  return onSnapshot(
    collection(db, 'priceLinks', token, 'newItems'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.atMs || 0) - (a.atMs || 0))),
    () => cb([])
  );
}
/** price 0 / empty = remove (she skips it) */
export async function setLinkPrice(token, productId, price) {
  const ref = doc(db, 'priceLinks', token, 'prices', productId);
  const n = Math.round(Number(price) || 0);
  if (n <= 0) await deleteDoc(ref);
  else await setDoc(ref, { price: n, atMs: Date.now() });
}
/** item: { id?, name, price, size, photoFile? , photo? } */
export async function saveLinkNewItem(token, item) {
  const name = String(item.name || '').trim().slice(0, 60);
  const price = Math.round(Number(item.price) || 0);
  if (!name) throw new Error('Type the item name.');
  if (price <= 0) throw new Error('Type the price.');
  const photo = item.photoFile ? await uploadProductImage(item.photoFile) : item.photo || '';
  const ref = item.id ? doc(db, 'priceLinks', token, 'newItems', item.id) : doc(collection(db, 'priceLinks', token, 'newItems'));
  await setDoc(ref, { name, price, size: String(item.size || '').trim().slice(0, 40), photo, atMs: Date.now(), added: false });
}
export async function deleteLinkNewItem(token, id) {
  await deleteDoc(doc(db, 'priceLinks', token, 'newItems', id));
}
export async function saveLinkNote(token, note) {
  await updateDoc(doc(db, 'priceLinks', token), { note: String(note || '').slice(0, 500), noteAtMs: Date.now() });
}

/**
 * Admin: set many products' cost at once (one catalog write). Each: { id, cost }.
 * The selling price is the cost with Roomly's margin, the same rule as everywhere else.
 */
export async function applySupplierCosts(list) {
  const cat = await readCatalog(true);
  const byId = new Map((list || []).filter((x) => x && x.id && Number(x.cost) > 0).map((x) => [x.id, Math.round(Number(x.cost))]));
  if (!byId.size) return 0;
  let n = 0;
  cat.products = cat.products.map((p) => {
    const cost = byId.get(p.id);
    if (!cost) return p;
    n++;
    return { ...p, costPrice: cost, price: sellingPrice(cost, p.source || 'school') };
  });
  await writeCatalog(cat);
  // These prices now win over any older runner or operator change
  try {
    const clear = {};
    byId.forEach((_, id) => (clear[id] = deleteField()));
    await setDoc(doc(db, 'catalog', 'overrides'), { prices: clear }, { merge: true });
  } catch (e) {
    console.error(e);
  }
  logActivity('price', `applied supplier prices to ${n} item${n === 1 ? '' : 's'}`);
  return n;
}
/** Admin: add a supplier's new item to the store (inside school) */
export async function addSupplierItem(token, item, category) {
  const cost = Math.round(Number(item.price) || 0);
  await saveProduct({
    id: `prod-${Date.now()}`,
    name: item.name,
    unit: item.size || '',
    category,
    subcategory: 'All',
    costPrice: cost,
    price: sellingPrice(cost, 'school'),
    imageUrl: item.photo || '',
    emoji: '',
    gradient: 'from-slate-400/20 to-zinc-500/20',
    isAvailable: true,
    source: 'school',
  });
  await updateDoc(doc(db, 'priceLinks', token, 'newItems', item.id), { added: true });
}
