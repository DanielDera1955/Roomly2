/**
 * Hostel Hub shops: Vendors (sell items) and Services (offer a skill).
 *
 * Collections (see firestore.rules):
 *   shops/{id}          public listing: kind, name, hostel, room, showRoom, photo, cover, items, deliveryOn, deliveryFee, status
 *   shopContacts/{id}   { phone }  the vendor's WhatsApp number. Read one document at a time, never listed, never shown in the app.
 *   shopOrders/{id}     every order and service request a student sends (saved before WhatsApp opens)
 *   shopReports/{id}    "Report this listing"
 *
 * Students are signed in anonymously (one id per phone, the same Hub app instance), so each phone can read its own orders.
 */
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, setDoc, writeBatch, increment } from 'firebase/firestore';
import { hubDb, hubUid, knownHubUid } from './hub.js';
import { BOYS_HOSTELS, GIRLS_HOSTELS, hostelSideOf } from './config.ts';
import { normalizePhone, isValidNigerianPhone, isBannedFromRoomly, BANNED_MESSAGE } from './api.js';

export { BOYS_HOSTELS, GIRLS_HOSTELS };

export const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
const DAY = 86400000;
export const NEW_DAYS = 3;

/* ------------------------------------------------------------------ */
/* Names and places                                                    */
/* ------------------------------------------------------------------ */

/** "Kene Obi" -> "Kene" */
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Vendor';
/** "[First name]'s Items" or "[First name]'s Services" */
export const shopTitle = (shop) => `${firstName(shop.name)}'s ${shop.kind === 'service' ? 'Services' : 'Items'}`;
/** "JV" -> "JV Hostel", "New Hostel" stays as it is */
export const hostelLabel = (h) => (/hostel$/i.test(String(h || '')) ? String(h) : `${h} Hostel`);
export const sideLabel = (side) => (side === 'girls' ? "girls' hostel" : "boys' hostel");
export const sideOf = (hostel) => hostelSideOf(hostel);
const cleanRoom = (r) => String(r || '').replace(/^\s*room\s*/i, '').trim();
/** Pin line: "JV Hostel" or "JV Hostel · Room B12" (room only when the vendor chose to show it) */
export const placeLine = (shop) => `${hostelLabel(shop.hostel)}${shop.showRoom && shop.room ? ` · Room ${cleanRoom(shop.room)}` : ''}`;

/** Price text: "₦700" or "from ₦8,000" */
export const priceText = (item) => `${item.priceFrom ? 'from ' : ''}${naira(item.price)}`;

/** Tag on a card: a tag set on the listing wins, otherwise "New" for the first few days */
export function shopTag(shop, nowMs = Date.now()) {
  if (shop.tag === 'most_visited') return 'Most visited';
  if (shop.tag === 'new') return 'New';
  const t = Number(shop.approvedAtMs || shop.createdAtMs || 0);
  return t && nowMs - t < NEW_DAYS * DAY ? 'New' : '';
}

/* ------------------------------------------------------------------ */
/* Reading shops                                                       */
/* ------------------------------------------------------------------ */

const clean = (id, d) => ({
  id,
  ...d,
  items: (Array.isArray(d.items) ? d.items : []).filter((i) => i && i.name),
});

/** All live shops of one kind ('vendor' or 'service'), newest first */
export function subscribeShops(kind, cb) {
  return onSnapshot(
    query(collection(hubDb, 'shops'), where('status', '==', 'live')),
    (snap) =>
      cb(
        snap.docs
          .map((d) => clean(d.id, d.data()))
          .filter((s) => s.kind === kind)
          .sort((a, b) => Number(b.approvedAtMs || b.createdAtMs || 0) - Number(a.approvedAtMs || a.createdAtMs || 0))
      ),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

/** One shop, live (a vendor's edits show straight away). cb(null) if it is missing or hidden. */
export function subscribeShop(id, cb) {
  return onSnapshot(
    doc(hubDb, 'shops', id),
    (d) => cb(d.exists() && d.data().status === 'live' ? clean(d.id, d.data()) : null),
    (e) => {
      console.error(e);
      cb(null);
    }
  );
}

/** The vendor's WhatsApp number, only used to build the link when an order is sent. Returns digits starting with 234. */
export async function getShopWhatsApp(id) {
  const d = await getDoc(doc(hubDb, 'shopContacts', id));
  const raw = String(d.exists() ? d.data().phone : '').replace(/\D/g, '');
  if (!raw) throw new Error('This vendor cannot take orders right now. Try another one.');
  return raw.startsWith('234') ? raw : `234${raw.replace(/^0/, '')}`;
}

/* ------------------------------------------------------------------ */
/* Where the student is                                                */
/* ------------------------------------------------------------------ */

const LOC_KEY = 'roomly_shop_loc';

/** The student's hostel and room: their saved Roomly profile first, then what they typed here once */
export function savedLocation(customer) {
  const hostel = String(customer?.building || '').trim();
  if (hostel && customer?.area !== 'Custom') {
    return { name: String(customer?.name || '').trim(), hostel, room: cleanRoom(customer?.room) };
  }
  try {
    const v = JSON.parse(localStorage.getItem(LOC_KEY) || '{}');
    return { name: String(v.name || customer?.name || '').trim(), hostel: String(v.hostel || ''), room: cleanRoom(v.room) };
  } catch {
    return { name: String(customer?.name || '').trim(), hostel: '', room: '' };
  }
}
export function rememberLocation(loc) {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify(loc));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Vendor cart (one vendor at a time, separate from Roomly's carts)    */
/* ------------------------------------------------------------------ */

const CART_KEY = 'roomly_vendor_cart';
/** { shopId, qty: { [itemId]: number } } */
export function loadVendorCart() {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
    if (v && v.shopId && v.qty && typeof v.qty === 'object') return v;
  } catch {}
  return null;
}
export function saveVendorCart(shopId, qty) {
  try {
    const has = Object.values(qty).some((n) => n > 0);
    if (has) localStorage.setItem(CART_KEY, JSON.stringify({ shopId, qty }));
    else localStorage.removeItem(CART_KEY);
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Order maths and the WhatsApp message                                */
/* ------------------------------------------------------------------ */

/** Picked items: [{ id, name, price, qty }] in the shop's own order (sold-out items never count) */
export function pickedItems(shop, qty) {
  return shop.items
    .map((i) => ({ id: i.id, name: i.name, price: Number(i.price) || 0, priceFrom: Boolean(i.priceFrom), soldOut: Boolean(i.soldOut), qty: Number(qty[i.id]) || 0 }))
    .filter((i) => i.qty > 0 && !i.soldOut);
}
export const itemsTotal = (picked) => picked.reduce((s, i) => s + i.price * i.qty, 0);

/** Can this vendor bring the order to this student? Same side only, and only if the vendor delivers. */
export function sameSide(shop, hostel) {
  return Boolean(hostel) && sideOf(shop.hostel) === sideOf(hostel);
}
export const deliveryFeeOf = (shop) => Math.max(0, Math.round(Number(shop.deliveryFee) || 0));

/**
 * delivery: 'pickup' | 'room' | 'handover'
 * (handover = the student is on the opposite side: no room, no fee, the two agree where to meet)
 */
export function buildOrderMessage({ shop, picked, delivery, loc }) {
  const vendor = firstName(shop.name);
  const fee = delivery === 'room' ? deliveryFeeOf(shop) : 0;
  const total = itemsTotal(picked) + fee;
  const lines = [`Hello ${vendor}, I want to order from your Roomly shop.`];
  if (loc.name) lines.push(`My name is ${loc.name}.`);
  lines.push('', 'Order:');
  picked.forEach((i) => lines.push(`${i.qty} x ${i.name} - ${naira(i.price * i.qty)}`));
  lines.push('', `Items: ${naira(itemsTotal(picked))}`);
  if (delivery === 'room') {
    lines.push(`Delivery: ${naira(fee)}, bring to my room (${hostelLabel(loc.hostel)}, Room ${loc.room})`);
  } else if (delivery === 'pickup') {
    lines.push('Delivery: I will pick it up');
  } else {
    lines.push(`Customer is in ${loc.hostel} (${sideLabel(sideOf(loc.hostel))}). Please agree where to hand over.`);
  }
  lines.push(`Total: ${naira(total)}`, '', 'I will pay when I receive it.');
  return lines.join('\n');
}

export function buildRequestMessage({ shop, service, when, loc }) {
  const vendor = firstName(shop.name);
  const lines = [`Hello ${vendor}, I want to request a service from you on Roomly.`];
  if (loc.name) lines.push(`My name is ${loc.name}.`);
  lines.push('', `Service: ${service.name} (${priceText(service)}${service.priceFrom ? ', please confirm the price' : ''})`);
  lines.push(`When: ${when}`);
  if (sameSide(shop, loc.hostel)) lines.push(`Where: ${hostelLabel(loc.hostel)}, Room ${loc.room}`);
  else lines.push(`Customer is in ${loc.hostel} (${sideLabel(sideOf(loc.hostel))}). Please agree where to meet.`);
  lines.push('', 'I will pay after the service is done.');
  return lines.join('\n');
}

export const whatsappUrl = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

/* ------------------------------------------------------------------ */
/* Saving (always before WhatsApp opens)                               */
/* ------------------------------------------------------------------ */

function newId() {
  return doc(collection(hubDb, 'shopOrders')).id;
}

/** Saves an order and returns its id. input: { shop, picked, delivery, loc } */
export async function saveShopOrder({ shop, picked, delivery, loc }) {
  const uid = await hubUid();
  const fee = delivery === 'room' ? deliveryFeeOf(shop) : 0;
  const id = newId();
  const sum = itemsTotal(picked);
  await setDoc(doc(hubDb, 'shopOrders', id), {
    type: 'order',
    uid,
    shopId: shop.id,
    shopName: shopTitle(shop),
    vendorName: firstName(shop.name),
    items: picked.map((i) => ({ id: String(i.id), name: i.name, price: i.price, qty: i.qty })),
    itemsTotal: sum,
    delivery,
    deliveryFee: fee,
    total: sum + fee,
    studentName: String(loc.name || '').slice(0, 60),
    studentHostel: String(loc.hostel || ''),
    studentRoom: String(loc.room || ''),
    sideMismatch: delivery === 'handover',
    createdAtMs: Date.now(),
  });
  countShopOrder(shop.id, id);
  return id;
}

/** Saves a service request and returns its id. input: { shop, service, when, loc } */
export async function saveServiceRequest({ shop, service, when, loc }) {
  const uid = await hubUid();
  const id = newId();
  await setDoc(doc(hubDb, 'shopOrders', id), {
    type: 'request',
    uid,
    shopId: shop.id,
    shopName: shopTitle(shop),
    vendorName: firstName(shop.name),
    serviceId: String(service.id),
    serviceName: service.name,
    price: Number(service.price) || 0,
    priceFrom: Boolean(service.priceFrom),
    whenText: String(when).slice(0, 120),
    studentName: String(loc.name || '').slice(0, 60),
    studentHostel: String(loc.hostel || ''),
    studentRoom: String(loc.room || ''),
    sideMismatch: !sameSide(shop, loc.hostel),
    createdAtMs: Date.now(),
  });
  countShopOrder(shop.id, id);
  return id;
}

/** This phone's orders and requests, newest first */
export async function getMyShopOrders() {
  const uid = await knownHubUid();
  if (!uid) return [];
  const snap = await getDocs(query(collection(hubDb, 'shopOrders'), where('uid', '==', uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))
    .slice(0, 30);
}

/** "Report this listing": goes to the admin. One report per phone per listing. */
export async function reportShop(shop, reason, note = '') {
  const uid = await hubUid();
  await setDoc(doc(hubDb, 'shopReports', `${shop.id}_${uid}`), {
    shopId: shop.id,
    shopName: shopTitle(shop),
    uid,
    reason,
    note: String(note || '').slice(0, 300),
    createdAtMs: Date.now(),
  });
}

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */

/** Every vendor and service has its own link that opens its page */
export const shopLink = (id) => `${window.location.origin}/?shop=${encodeURIComponent(id)}`;

/* ------------------------------------------------------------------ */
/* Visits and orders (Phase 5)                                         */
/* ------------------------------------------------------------------ */

/** Today in Lagos (UTC+1, no daylight saving): "2026-11-14" */
export const lagosDay = (ms = Date.now()) => new Date(ms + 3600000).toISOString().slice(0, 10);
export const RANK_DAYS = 7;

/**
 * Counts one visit: one phone counts once per shop per day. The visit marker document has a fixed id
 * (shop + day + phone), so a second try that day is refused by the rules and the counter never moves twice.
 * Never blocks the page: any failure is ignored.
 */
export async function countShopVisit(shopId) {
  try {
    const day = lagosDay();
    const seen = `roomly_shopvisit_${shopId}_${day}`;
    if (localStorage.getItem(seen)) return;
    const uid = await hubUid();
    const sid = `${shopId}_${day}`;
    const batch = writeBatch(hubDb);
    batch.set(doc(hubDb, 'shopVisits', `${sid}_${uid}`), { shopId, day, uid, atMs: Date.now() });
    batch.set(doc(hubDb, 'shopStats', sid), { shopId, day, visits: increment(1) }, { merge: true });
    await batch.commit();
    localStorage.setItem(seen, '1');
  } catch {
    /* not counted: nothing for the student to see */
  }
}

/** Counts one order or request sent. Runs after the order is saved and never blocks it. */
async function countShopOrder(shopId, orderId) {
  try {
    const day = lagosDay();
    await setDoc(doc(hubDb, 'shopStats', `${shopId}_${day}`), { shopId, day, orders: increment(1), lastOrderId: orderId }, { merge: true });
  } catch {
    /* not counted */
  }
}

/** Visits and orders per shop over the last 7 days: { [shopId]: { visits, orders } } */
export async function getShopStats(days = RANK_DAYS, database = hubDb) {
  const from = lagosDay(Date.now() - (days - 1) * 86400000);
  const snap = await getDocs(query(collection(database, 'shopStats'), where('day', '>=', from)));
  const out = {};
  snap.docs.forEach((d) => {
    const v = d.data();
    const o = (out[v.shopId] = out[v.shopId] || { visits: 0, orders: 0 });
    o.visits += Number(v.visits) || 0;
    o.orders += Number(v.orders) || 0;
  });
  return out;
}

/**
 * Order a list of shops (all vendors, or all services) by visits in the last 7 days.
 * A new listing gets a boost for its first few days so it sits near the top. The shop with the most
 * real visits gets the "Most visited" tag. Returns { list, topId }.
 */
export function rankShops(shops, stats, nowMs = Date.now()) {
  const visits = (s) => (stats[s.id] && stats[s.id].visits) || 0;
  const maxV = Math.max(0, ...shops.map(visits));
  const isNew = (s) => shopTag({ ...s, tag: '' }, nowMs) === 'New';
  const boost = Math.max(3, Math.ceil(maxV / 2));
  const score = (s) => visits(s) + (isNew(s) ? boost : 0);
  const list = [...shops].sort(
    (a, b) => score(b) - score(a) || visits(b) - visits(a) || Number(b.approvedAtMs || b.createdAtMs || 0) - Number(a.approvedAtMs || a.createdAtMs || 0)
  );
  const top = maxV > 0 ? shops.find((s) => visits(s) === maxV) : null;
  return { list, topId: top ? top.id : '' };
}

/* ------------------------------------------------------------------ */
/* "List your business" (Phase 4)                                      */
/* ------------------------------------------------------------------ */

/**
 * input: { kind, name, hostel, room, phone, items: [{ name, price, priceFrom }], photos: [url], showRoom }
 * Lands in the admin console under Applications.
 */
export async function submitShopApplication(input) {
  const kind = input.kind === 'service' ? 'service' : 'vendor';
  const name = String(input.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new Error('Add your name.');
  if (!input.hostel) throw new Error('Choose your hostel.');
  const room = String(input.room || '').trim().slice(0, 20);
  if (!room) throw new Error('Add your room number.');
  const phone = normalizePhone(input.phone);
  if (!isValidNigerianPhone(phone)) throw new Error('Enter your 11-digit WhatsApp number.');
  if (await isBannedFromRoomly(phone)) throw new Error(BANNED_MESSAGE);
  const items = (input.items || [])
    .map((i, n) => ({ id: `i${n + 1}`, name: String(i.name || '').trim().slice(0, 60), price: Math.max(0, Math.round(Number(i.price) || 0)), priceFrom: Boolean(i.priceFrom) }))
    .filter((i) => i.name && i.price > 0);
  if (!items.length) throw new Error(kind === 'service' ? 'Add at least one service with its price.' : 'Add at least one item with its price.');
  const photos = (input.photos || []).filter((u) => typeof u === 'string' && u).slice(0, 3);
  if (!photos.length) throw new Error('Add at least one photo.');
  const uid = await hubUid();
  const id = doc(collection(hubDb, 'shopApplications')).id;
  await setDoc(doc(hubDb, 'shopApplications', id), {
    status: 'new',
    uid,
    kind,
    name,
    hostel: String(input.hostel),
    room,
    showRoom: Boolean(input.showRoom),
    phone,
    items,
    photos,
    createdAtMs: Date.now(),
  });
  return id;
}

/* ------------------------------------------------------------------ */
/* Vendor edit link (talks to /api/vendor-edit)                        */
/* ------------------------------------------------------------------ */

export const editLink = (token) => `${window.location.origin}/?edit=${token}`;

/** action: 'get' | 'save'. The server decides which shop this is from the token alone. */
export async function vendorEditApi(token, action, patch) {
  let res;
  try {
    res = await fetch('/api/vendor-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, patch }),
    });
  } catch {
    throw new Error('No network. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not save. Try again.');
  return data;
}
