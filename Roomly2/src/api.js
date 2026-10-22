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
let operatorDocs = {};
const fireBatches = () => window.dispatchEvent(new Event('roomly-batches'));
try {
  onSnapshot(
    doc(db, 'availability', 'inside'),
    (s) => {
      insideSwitches = s.exists() ? s.data().slots || {} : {};
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

/** Operators of one kind that the admin has not switched off */
function activeOperators(kind) {
  return Object.values(operatorDocs).filter((o) => o.kind === kind && !o.adminOff);
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
        if (accepting(opt, sw, 'inside', now)) {
          const start = switchStartDate(opt, sw);
          return { next: { batch: opt, start, startText: startTextOf(start), by: sw.by || '' }, note: '' };
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

const startTextOf = (d) => {
  const min = d.getHours() * 60 + d.getMinutes();
  return timeLabel(min);
};

/** Switches for runners (inside) — today and later only */
export function getInsideSwitches() {
  return insideSwitches;
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
  const sw = slim({ ...prev, ...patch, by: staff?.name || 'Runner', at: Date.now() });
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
    { kind: staff.role, name: staff.name || 'Operator', slots: { ...staleKeys(mine.slots), [key]: sw }, updatedAt: Date.now() },
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

async function readCatalog(force = false) {
  if (!force && catalogCache && Date.now() - catalogAt < 60000) return catalogCache;
  try {
    const snap = await getDoc(doc(db, 'catalog', 'main'));
    if (snap.exists()) {
      const d = snap.data();
      catalogCache = { categories: d.categories || INITIAL_CATEGORIES, products: d.products || INITIAL_PRODUCTS };
    } else {
      catalogCache = { categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS };
    }
  } catch (e) {
    console.error('Catalog read failed:', e);
    catalogCache = catalogCache || { categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS };
  }
  catalogAt = Date.now();
  return catalogCache;
}

async function writeCatalog(cat) {
  const data = slim(cat);
  if (JSON.stringify(data).length > 900000) {
    const msg = 'The catalog is too big to save. Use photo links or connect Cloudinary for photos (see src/cloudinary.ts).';
    window.alert(msg);
    throw new Error(msg);
  }
  await setDoc(doc(db, 'catalog', 'main'), data);
  catalogCache = data;
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
  const hasStore = (orderPayload.items || []).some((i) => i.source === 'outside');
  const hasFood = (orderPayload.items || []).some((i) => i.source === 'food');
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
  return newOrder;
}

/** @returns {Promise<any>} */
export async function markPaymentSent(orderId) {
  try {
    return await patchOrder(orderId, (o) => {
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
    return await patchOrder(orderId, (o) => {
      o[field] = status;
      o.history.push({
        status: o.status,
        timestamp: new Date().toISOString(),
        note: `${label} items ${status === 'sent' ? 'sent to the school gate' : 'packed'} by ${who}`,
        updatedBy: who,
      });
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}
