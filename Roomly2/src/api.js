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
  nextBatchId,
  getBookableSlots,
  slotsForDay,
  timeLabel,
  SWITCH_CUTOFF_MIN,
  PRICING,
  GATE_PICKUP_FEES,
  SETTLE_BY_HOUR,
  RUNNER_SHARE,
  sellingPrice,
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
let operatorDocs = {};
const fireBatches = () => window.dispatchEvent(new Event('roomly-batches'));
try {
  onSnapshot(
    doc(db, 'availability', 'inside'),
    (s) => {
      insideSwitches = s.exists() ? s.data().slots || {} : {};
      runnerUnsettled = s.exists() ? s.data().runnerUnsettled || {} : {};
      runnerPay = s.exists() ? s.data().runnerPay || {} : {};
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
} catch (e) {
  /* ignore */
}

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** On, and not yet turned off by the night cut-off (10pm inside, 8pm outside). Switching on after the cut-off lasts until the next night. */
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

function accepting(opt, sw, side, now) {
  return switchIsLive(sw, side, now) && switchStartDate(opt, sw).getTime() > now.getTime();
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
        const blocked = sw && sw.byUid && isOverdue(runnerUnsettled[sw.byUid], now);
        if (!blocked && accepting(opt, sw, 'inside', now)) {
          const start = switchStartDate(opt, sw);
          return { next: { batch: opt, start, startText: startTextOf(start), by: sw.by || '', payTo: runnerPay[sw.byUid] || sw.payTo || null }, note: '' };
        }
        if (sw && sw.note) notes.push(sw.note);
      } else {
        // Any one operator accepting makes the batch open. The earliest start is the safe deadline.
        let best = null;
        for (const op of activeOperators(side)) {
          const sw = (op.slots || {})[opt.key];
          if (accepting(opt, sw, 'outside', now)) {
            const start = switchStartDate(opt, sw);
            if (!best || start < best.start) best = { start, by: op.name || '' };
          } else if (sw && sw.note) notes.push(sw.note);
        }
        if (best) return { next: { batch: opt, start: best.start, startText: startTextOf(best.start), by: best.by }, note: '' };
      }
    }
  }
  return { next: null, note: notes[0] || '' };
}

/**
 * Outside checkout: the next batch any operator of this kind is accepting, and every operator accepting it.
 * Each operator: { uid, name, start, startText, load } where load = orders today (fewer = suggested).
 */
export function getOutsideChoices(kind, now = new Date()) {
  const today = ymdOf(now);
  for (let d = 0; d < 3; d++) {
    for (const opt of slotsForDay(kind, now, d)) {
      const ops = [];
      for (const op of activeOperators(kind)) {
        const sw = (op.slots || {})[opt.key];
        if (accepting(opt, sw, 'outside', now)) {
          const start = switchStartDate(opt, sw);
          const load = op.load && op.load.date === today ? op.load.count || 0 : 0;
          ops.push({ uid: op.id, name: op.name || 'Operator', start, startText: startTextOf(start), load, payTo: op.payTo || null });
        }
      }
      if (ops.length) return { batch: opt, operators: ops.sort((a, b) => a.load - b.load) };
    }
  }
  const { note } = getNextBatch(kind, now);
  return { batch: null, operators: [], note };
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
  const prev = insideSwitches[key] || {};
  const sw = slim({ ...prev, ...patch, by: staff?.name || 'Runner', byPhone: staff?.phone || '', byUid: auth.currentUser?.uid || '', payTo: staff?.payAccount || null, at: Date.now() });
  insideSwitches = { ...insideSwitches, [key]: sw };
  fireBatches();
  await setDoc(doc(db, 'availability', 'inside'), { slots: { ...staleKeys(insideSwitches), [key]: sw } }, { merge: true });
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
    const [snap, extraSnap] = await Promise.all([getDoc(doc(db, 'catalog', 'main')), getDoc(doc(db, 'catalog', 'extra')).catch(() => null)]);
    const d = snap.exists() ? snap.data() : {};
    const main = d.products || INITIAL_PRODUCTS;
    const ids = new Set(main.map((p) => p.id));
    const extra = (extraSnap && extraSnap.exists() ? extraSnap.data().products || [] : []).filter((p) => p && !ids.has(p.id));
    catalogCache = { categories: d.categories || INITIAL_CATEGORIES, products: [...main, ...extra], extraCount: extra.length };
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
  catalogCache = { ...data, extraCount: 0 };
  catalogAt = Date.now();
}

/** @returns {Promise<any>} */
export async function getCategories() {
  return (await readCatalog()).categories;
}

/** @returns {Promise<any>} */
export async function addCategory(name, emoji = '📦', initialSubcategories = ['All']) {
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
  const deliveryFee = deliveryFeeFor(subtotal, hasOutside);
  const totalAmount = subtotal + deliveryFee;

  let paymentMethod = orderPayload.paymentMethod;
  if ((isRepeatCustomer || hasOutside) && paymentMethod === 'pay_on_delivery') paymentMethod = 'pay_now';

  const now = new Date();
  const createdAtIso = now.toISOString();
  // Payment deadline follows the switch: the moment the batch stops accepting (falls back to 15 minutes)
  const askedDeadline = Date.parse(orderPayload.paymentDeadline || '');
  const deadline =
    Number.isFinite(askedDeadline) && askedDeadline > now.getTime() && askedDeadline < now.getTime() + 3 * 86400000
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
    turnRunner: orderPayload.turnRunner || '',
    payTo: orderPayload.payTo || null,
    outOfStock: orderPayload.outOfStock || 'refund',
    gateReq: Boolean(orderPayload.gatePickup && (cart === 'store' || cart === 'food')),
    gatePickup:
      orderPayload.gatePickup && (cart === 'store' || cart === 'food')
        ? { status: 'pending', fee: GATE_PICKUP_FEES.normal, heavy: false, updatedAt: createdAtIso }
        : null,
    payReady: false,
    storeStatus: hasStore ? 'pending' : '',
    foodStatus: hasFood ? 'pending' : '',
    paymentMethod,
    paymentStatus: paymentMethod === 'pay_on_delivery' ? 'pay_on_delivery' : 'unpaid',
    paymentDeadline: deadline.toISOString(),
    isFirstTimeCustomer: !isRepeatCustomer,
    deliveryBatch: batchId,
    deliveryTime: orderPayload.deliveryTime || (batchMeta ? `${batchMeta.name} (${batchMeta.timeWindow})` : 'Next delivery batch'),
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
        note:
          paymentMethod === 'pay_now'
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
      if (paymentState(o) === 'missed') {
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
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_sent';
      o.paymentSentAt = now;
      o.payReady = true; // store and food operators only see the order from this point
      o.history.push({
        status: o.status,
        timestamp: now,
        note: 'Student marked payment as sent via bank transfer. Awaiting runner/admin verification.',
        updatedBy: o.name || 'Customer',
      });
    });
  } catch (err) {
    console.error('Failed to mark payment sent:', err);
    return null;
  }
}

/** @returns {Promise<any>} */
export async function confirmPayment(orderId, confirmedBy = 'Runner / Admin') {
  try {
    return await patchOrder(orderId, (o) => {
      const now = new Date().toISOString();
      o.paymentStatus = 'payment_confirmed';
      o.paymentConfirmedAt = now;
      o.paymentConfirmedBy = confirmedBy;
      o.history.push({
        status: o.status,
        timestamp: now,
        note: `Bank transfer payment confirmed received by ${confirmedBy}. Order attended to!`,
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
        note: `${label} items ${status === 'sent' ? 'sent to the school gate' : 'packed'} by ${who}`,
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
function costOf(item, products, inside = false) {
  const p = products.find((x) => x.id === item.productId);
  if (p && p.costPrice > 0 && !item.isFood) return { cost: p.costPrice * item.quantity, estimated: false };
  if (p && p.costPrice > 0 && item.isFood && item.plates > 0 && !(item.extras || []).length) {
    return { cost: p.costPrice * item.plates * item.quantity, estimated: false };
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
async function addToMyDay(kind, key, add, estimated, day = ymdOf(new Date())) {
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
          estimated: false,
        };
    if ((d.keys || []).includes(key)) return;
    created = !snap.exists();
    const next = { ...d, keys: [...(d.keys || []), key], estimated: Boolean(d.estimated || estimated), updatedAt: Date.now() };
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

/** Operator: their part of an outside order reached the gate */
/** @returns {Promise<void>} */
async function recordOperatorDelivery(order, kind) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== kind) return;
  const source = kind === 'food' ? 'food' : 'outside';
  const items = (order.items || []).filter((i) => i.source === source);
  const products = (await readCatalog()).products || [];
  let paid = 0;
  let keep = 0;
  let estimated = false;
  for (const i of items) {
    const c = costOf(i, products);
    paid += i.totalPrice || 0;
    keep += c.cost;
    estimated = estimated || c.estimated;
  }
  const share = order.hasStore && order.hasFood ? 0.5 : 1; // only older mixed orders
  const deliveryKeep = OP_KEEP_PER_CART * share;
  const deliveryOwe = OP_OWE_PER_CART * share;
  await addToMyDay(
    kind,
    order.id,
    {
      orders: 1,
      paid: paid + deliveryKeep + deliveryOwe,
      itemsPaid: paid,
      itemsCost: keep,
      deliveryKeep,
      keep: keep + deliveryKeep,
      due: Math.max(0, paid - keep) + deliveryOwe,
    },
    estimated
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
  const share = profit * RUNNER_SHARE;
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
      due: profit * (1 - RUNNER_SHARE),
      owedToHelpers: helperShare,
      sharedOrders: order.helperEmail ? 1 : 0,
    },
    estimated
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

/** Runner: a gate pickup they brought to a room (they keep the whole fee) */
async function recordGateFee(order) {
  const staff = getCurrentStaff();
  if (!staff || staff.role !== 'runner' || !order.gatePickup) return;
  await addToMyDay('runner', 'gate-' + order.id, { gateFees: order.gatePickup.fee || 0, keep: order.gatePickup.fee || 0 }, false);
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
 * Runners read the items, tick heavy (₦1,000) or not (₦600), then accept or refuse.
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
  let gateDone = null;
  try {
    const res = await patchOrder(orderId, (o) => {
      const gp = o.gatePickup || { status: 'pending', fee: GATE_PICKUP_FEES.normal };
      if (action === 'accept') {
        gp.heavy = Boolean(heavy);
        gp.fee = heavy ? GATE_PICKUP_FEES.heavy : GATE_PICKUP_FEES.normal;
        gp.runnerName = who;
        gp.runnerPhone = staff?.phone || '';
      }
      gp.status = status;
      gp.updatedAt = new Date().toISOString();
      o.gatePickup = gp;
      gateDone = action === 'delivered' ? o : null;
      o.history.push({
        status: o.status,
        timestamp: gp.updatedAt,
        note: `Gate pickup ${status}${action === 'accept' ? ` (₦${gp.fee.toLocaleString()}${gp.heavy ? ', heavy' : ''})` : ''} by ${who}`,
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
        category: r.category || (r.kind === 'food' ? 'Food' : 'Everyday'),
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
            category: cat || (r.side === 'food' ? 'Food' : 'Everyday'),
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

/** Student: ask an inside runner to bring an outside order from the gate to the room (₦600, ₦1,000 if heavy) */
/** @returns {Promise<any>} */
export async function requestGatePickup(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
      if (o.cart !== 'store' && o.cart !== 'food') throw new Error('Only outside orders');
      if (o.gatePickup && o.gatePickup.status !== 'refused' && o.gatePickup.status !== 'refunded') return;
      const now = new Date().toISOString();
      o.gateReq = true;
      o.gatePickup = { status: 'pending', fee: GATE_PICKUP_FEES.normal, heavy: false, updatedAt: now };
      o.history.push({ status: o.status, timestamp: now, note: 'Student asked for gate to room pickup', updatedBy: o.name || 'Customer' });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}
