/**
 * Hostel Hub shops: admin side. These use the staff login (the main app), never a student's anonymous phone id,
 * so only the admin can read applications, vendor phone numbers and edit links.
 */
import { collection, doc, onSnapshot, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from './firebase.ts';
import { editLink, getShopStats } from './shops.js';

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
    lastEditedAtMs: 0,
  });
  batch.set(doc(db, 'shopContacts', app.id), { phone: app.phone });
  batch.set(doc(db, 'shopEditKeys', keyHash), { shopId: app.id, active: true, createdAtMs: now });
  batch.set(doc(db, 'shopAdmin', app.id), { token, keyHash, createdAtMs: now });
  batch.update(doc(db, 'shopApplications', app.id), { status: 'approved', approvedAtMs: now });
  await batch.commit();
  return editLink(token);
}

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
