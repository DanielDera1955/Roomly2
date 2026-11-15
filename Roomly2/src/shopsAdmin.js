/**
 * Hostel Hub shops: admin side. These use the staff login (the main app), never a student's anonymous phone id,
 * so only the admin can read applications, vendor phone numbers and edit links.
 */
import { collection, doc, getDoc, onSnapshot, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from './firebase.ts';
import { editLink, getShopStats } from './shops.js';
import { uploadProductImage, normalizePhone, isValidNigerianPhone } from './api.js';

const byNewest = (a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0);

/** 64 random hex characters (256 bits) */
function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function subscribeShopApplications(cb) {
  return onSnapshot(
    collection(db, 'shopApplications'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest)),
    () => cb([])
  );
}
export function subscribeAllShops(cb) {
  return onSnapshot(
    collection(db, 'shops'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => Number(b.approvedAtMs || 0) - Number(a.approvedAtMs || 0))),
    () => cb([])
  );
}
/** { [shopId]: token } for the "Copy edit link" button (admin only) */
export function subscribeShopTokens(cb) {
  return onSnapshot(
    collection(db, 'shopAdmin'),
    (snap) => {
      const out = {};
      snap.docs.forEach((d) => (out[d.id] = d.data().token));
      cb(out);
    },
    () => cb({})
  );
}
export function subscribeShopReports(cb) {
  return onSnapshot(
    collection(db, 'shopReports'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest)),
    () => cb([])
  );
}
export const dismissShopReport = (id) => updateDoc(doc(db, 'shopReports', id), { status: 'done' });
export const getAdminShopStats = () => getShopStats(7, db);

/**
 * One tap: the application becomes a live listing. The vendor's WhatsApp number goes to its own private document,
 * and a private edit link is created. Returns the link.
 */
export async function approveShopApplication(app) {
  const token = newToken();
  const keyHash = await sha256(token);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'shops', app.id), {
    kind: app.kind,
    status: 'live',
    name: app.name,
    hostel: app.hostel,
    room: app.room || '',
    showRoom: Boolean(app.showRoom),
    photo: (app.photos || [])[0] || '',
    cover: (app.photos || [])[1] || (app.photos || [])[0] || '',
    deliveryOn: false,
    deliveryFee: 0,
    items: (app.items || []).map((i) => ({ id: i.id, name: i.name, price: i.price, priceFrom: Boolean(i.priceFrom), soldOut: false, photo: '' })),
    createdAtMs: app.createdAtMs || now,
    approvedAtMs: now,
    confirmedAtMs: now,
    lastEditedAtMs: 0,
  });
  batch.set(doc(db, 'shopContacts', app.id), { phone: app.phone });
  batch.set(doc(db, 'shopEditKeys', keyHash), { shopId: app.id, active: true, createdAtMs: now });
  batch.set(doc(db, 'shopAdmin', app.id), { token, keyHash, createdAtMs: now });
  batch.update(doc(db, 'shopApplications', app.id), { status: 'approved', approvedAtMs: now });
  await batch.commit();
  return editLink(token);
}

/** Name changes are kept as a short history on the shop: { from, to, atMs, by: 'vendor' | 'admin' } */
const withHistory = (shop, from, to, by) => [...(Array.isArray(shop.nameHistory) ? shop.nameHistory.slice(-9) : []), { from, to, atMs: Date.now(), by }];

/** Admin: change a shop's name straight away (no limit) */
export async function adminRenameShop(shop, newName) {
  const name = String(newName || '').trim().slice(0, 60);
  if (name.length < 2) throw new Error('The name must be at least 2 letters.');
  if (name === shop.name) return;
  await updateDoc(doc(db, 'shops', shop.id), { name, nameHistory: withHistory(shop, shop.name, name, 'admin') });
}

/** Admin: put the name from before the last change back, and lock the name so the vendor can't change it again */
export async function adminRevertShopName(shop) {
  const history = Array.isArray(shop.nameHistory) ? shop.nameHistory : [];
  const last = history[history.length - 1];
  if (!last || !last.from) throw new Error('There is no earlier name to go back to.');
  await updateDoc(doc(db, 'shops', shop.id), {
    name: last.from,
    nameLocked: true,
    nameHistory: withHistory(shop, shop.name, last.from, 'admin'),
  });
}

/** Admin: stop (or allow again) the vendor changing their own name */
export const setShopNameLock = (id, locked) => updateDoc(doc(db, 'shops', id), { nameLocked: Boolean(locked) });

/** Admin: the vendor told you on WhatsApp they are still available */
export const confirmShop = (id) => updateDoc(doc(db, 'shops', id), { confirmedAtMs: Date.now() });

export const rejectShopApplication = (id) => updateDoc(doc(db, 'shopApplications', id), { status: 'rejected' });

export const setShopStatus = (id, status) => updateDoc(doc(db, 'shops', id), { status: status === 'live' ? 'live' : 'hidden' });

/** The old link stops working at once; a new one is created */
export async function resetEditLink(shopId, oldToken) {
  const token = newToken();
  const keyHash = await sha256(token);
  const batch = writeBatch(db);
  if (oldToken) batch.delete(doc(db, 'shopEditKeys', await sha256(oldToken)));
  batch.set(doc(db, 'shopEditKeys', keyHash), { shopId, active: true, createdAtMs: Date.now() });
  batch.set(doc(db, 'shopAdmin', shopId), { token, keyHash, createdAtMs: Date.now() });
  await batch.commit();
  return editLink(token);
}

/**
 * Admin: create a vendor or service listing directly, for a person who agreed to be listed (no application needed).
 * Same result as approving an application: a live shop, the number in its own private document, and a private edit link.
 * input: { kind: 'vendor' | 'service', name, hostel, room, showRoom, phone, items: [{ name, price, priceFrom }], photoFile, consent }
 * Returns { id, link }.
 */
export async function createShopDirect(input) {
  const kind = input.kind === 'service' ? 'service' : 'vendor';
  const name = String(input.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new Error('Add the vendor\'s name.');
  if (!input.hostel) throw new Error('Choose the hostel.');
  if (!input.consent) throw new Error('Tick that this person agreed to be listed.');
  const phone = normalizePhone(input.phone);
  if (!isValidNigerianPhone(phone)) throw new Error('Enter a valid 11-digit WhatsApp number.');
  // Checked directly (not isBannedFromRoomly) so the admin's own browser is never flagged as banned
  if ((await getDoc(doc(db, 'hubBans', phone))).exists()) throw new Error('This number is banned from Roomly.');
  const rows = Array.isArray(input.items) ? input.items : [];
  const noPrice = rows.find((i) => i && String(i.name || '').trim() && !(Number(i.price) > 0));
  if (noPrice) throw new Error(`"${String(noPrice.name).trim()}" needs a price, for example: ${String(noPrice.name).trim()} 1500`);
  const items = rows
    .map((i) => ({
      id: Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join(''),
      name: String(i && i.name ? i.name : '').trim().slice(0, 60),
      price: Math.max(0, Math.min(10000000, Math.round(Number(i && i.price) || 0))),
      priceFrom: Boolean(i && i.priceFrom),
      soldOut: false,
      photo: '',
    }))
    .filter((i) => i.name && i.price > 0);
  if (items.length < 1) throw new Error('Add at least one item with a price.');
  if (items.length > 30) throw new Error('Add at most 30 items. The vendor can add more from their edit link.');
  if (!input.photoFile) throw new Error('Add a photo.');
  const photo = await uploadProductImage(input.photoFile);

  const id = doc(collection(db, 'shops')).id;
  const token = newToken();
  const keyHash = await sha256(token);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'shops', id), {
    kind,
    status: 'live',
    name,
    hostel: String(input.hostel).slice(0, 30),
    room: String(input.room || '').trim().slice(0, 20),
    showRoom: Boolean(input.showRoom),
    photo,
    cover: photo,
    deliveryOn: false,
    deliveryFee: 0,
    items,
    createdAtMs: now,
    approvedAtMs: now,
    confirmedAtMs: now,
    lastEditedAtMs: 0,
    addedByAdmin: true,
    consentAtMs: now,
  });
  batch.set(doc(db, 'shopContacts', id), { phone });
  batch.set(doc(db, 'shopEditKeys', keyHash), { shopId: id, active: true, createdAtMs: now });
  batch.set(doc(db, 'shopAdmin', id), { token, keyHash, createdAtMs: now });
  await batch.commit();
  return { id, link: editLink(token) };
}
