/**
 * Hostel Hub and Gaming: data layer.
 *
 * Students have no accounts, so Hub and Gaming use a separate, private Firebase app instance that signs
 * each phone in anonymously. That gives every phone its own id, so only the phone that posted a listing
 * (or joined the leaderboard) can change it. Staff logins on the main app are never touched by this.
 *
 * Needs: Firebase console > Authentication > Sign-in method > Anonymous switched ON.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { app, db } from './firebase.ts';
import { uploadProductImage, getCustomerByPhone, normalizePhone, isValidNigerianPhone, isValidPin } from './api.js';

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const HUB_TYPES = [
  { id: 'service', label: 'Services', emoji: '💈', hint: 'Barbing, hair braiding, laundry, typing and more' },
  { id: 'item', label: 'Pre-owned', emoji: '📦', hint: 'Your own used items: stove, bucket, power bank, phone, books' },
  { id: 'wanted', label: 'Looking for', emoji: '🔎', hint: 'Tell everyone what you need' },
  { id: 'rent', label: 'Rent or lend', emoji: '🔁', hint: 'Lend your stove or other items per day' },
  { id: 'charging', label: 'Charging', emoji: '🔋', hint: 'Charge phones when there is no light' },
  { id: 'water', label: 'Water', emoji: '🪣', hint: 'Fetch water for students during scarcity' },
];
/** These never expire; the poster confirms every 30 days that they are still available */
export const LONG_LIVED = ['service', 'charging', 'water'];
export const EXPIRY_DAYS = [1, 3, 7, 14];
export const CONFIRM_DAYS = 30;
export const MAX_ITEMS = 3;
export const REPORT_HIDE_AT = 3;
export const REPORT_REASONS = [
  { id: 'stolen', label: 'Stolen item' },
  { id: 'scam', label: 'Scam' },
  { id: 'fake', label: 'Fake photo or details' },
  { id: 'other', label: 'Other' },
];
/** Things Roomly already delivers: they can't be listed in the Hub (plus every product name in the store) */
const CORE_WORDS = [
  'bread', 'egg', 'eggs', 'gala', 'pure water', 'sachet water', 'bag of water', 'indomie', 'noodles',
  'provision', 'provisions', 'jollof', 'fried rice', 'spaghetti', 'garri', 'egg roll', 'buns',
];

export const GAMES = [
  { id: 'efootball', label: 'eFootball' },
  { id: 'fifa', label: 'FIFA' },
  { id: 'dls', label: 'DLS' },
  { id: 'freefire', label: 'Free Fire' },
  { id: 'codm', label: 'CODM' },
];
export const CHALLENGE_ACCEPT_HOURS = 48;
export const POINTS = { win: 10, upset: 15, loss: 5, duck: 10, podium: [50, 30, 15] };

const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* Anonymous identity (a separate app instance)                        */
/* ------------------------------------------------------------------ */

const hubApp = getApps().find((a) => a.name === 'roomly-hub') || initializeApp(app.options, 'roomly-hub');
const hubAuth = getAuth(hubApp);
const hubDb = getFirestore(hubApp);

let signingIn = null;
/** This phone's Hub id (signs in anonymously the first time) */
export async function hubUid() {
  await hubAuth.authStateReady();
  if (hubAuth.currentUser) return hubAuth.currentUser.uid;
  if (!signingIn) {
    signingIn = signInAnonymously(hubAuth)
      .then((c) => c.user.uid)
      .catch((e) => {
        console.error(e);
        throw new Error('Could not connect. Check your network and try again.');
      })
      .finally(() => {
        signingIn = null;
      });
  }
  return signingIn;
}
/** The id if this phone already has one (never signs in) */
export async function knownHubUid() {
  await hubAuth.authStateReady();
  return hubAuth.currentUser?.uid || '';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

export function priceLabel(l) {
  const p = Number(l.price) || 0;
  const p2 = Number(l.price2) || 0;
  switch (l.type) {
    case 'service':
      return p2 > p ? `${naira(p)} to ${naira(p2)}` : p ? naira(p) : 'Ask for price';
    case 'wanted':
      return p ? `Budget ${naira(p)}` : 'Open budget';
    case 'rent':
      return p ? `${naira(p)} per day` : 'Ask for price';
    case 'charging':
      return [p ? `to 50%: ${naira(p)}` : '', p2 ? `to 100%: ${naira(p2)}` : ''].filter(Boolean).join(' · ') || 'Ask for price';
    case 'water':
      return p ? `${naira(p)} per bucket` : 'Ask for price';
    default:
      return p ? naira(p) : 'Ask for price';
  }
}

export function timeAgo(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Still showing to students? (not sold, not hidden, not expired, not left unconfirmed for 30 days) */
export function isLive(l, nowMs = Date.now(), waterOn = true) {
  if (!l || l.status !== 'active' || l.hidden) return false;
  if (l.type === 'water' && !waterOn) return false;
  if (LONG_LIVED.includes(l.type)) return nowMs - Number(l.confirmedAtMs || l.createdAtMs || 0) < CONFIRM_DAYS * DAY;
  return nowMs < Number(l.expiresAtMs || 0);
}
/** Long-lived listing that needs a "Still available?" tap soon (last 5 days) or already went quiet */
export function needsConfirm(l, nowMs = Date.now()) {
  if (!LONG_LIVED.includes(l.type) || l.status !== 'active') return false;
  return nowMs - Number(l.confirmedAtMs || l.createdAtMs || 0) > (CONFIRM_DAYS - 5) * DAY;
}

/** Why a listing can't be posted because Roomly already delivers it ('' when fine) */
export function blockedReason(type, title, productNames = []) {
  if (type === 'charging' || type === 'water' || type === 'rent') return '';
  const t = norm(title);
  const word = CORE_WORDS.find((w) => t.includes(` ${w} `));
  const prod = productNames.find((n) => {
    const p = norm(n).trim();
    return p.length >= 4 && t.includes(` ${p} `);
  });
  const hit = word || prod;
  return hit ? `Roomly already delivers "${hit.trim()}" to your room. Order it from Store Items or Food instead.` : '';
}

/* ------------------------------------------------------------------ */
/* Settings doc (water switch, tournament account)                     */
/* ------------------------------------------------------------------ */

export function subscribeHubSettings(cb) {
  return onSnapshot(
    doc(hubDb, 'settings', 'hub'),
    (s) => cb(s.exists() ? s.data() : {}),
    () => cb({})
  );
}
/** Admin (signed in on the main app) */
export async function saveHubSettings(patch) {
  await setDoc(doc(db, 'settings', 'hub'), patch, { merge: true });
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export function subscribeListings(cb) {
  return onSnapshot(
    query(collection(hubDb, 'hubListings'), where('status', '==', 'active')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}

export async function getMyListings() {
  const uid = await knownHubUid();
  if (!uid) return [];
  const snap = await getDocs(query(collection(hubDb, 'hubListings'), where('ownerUid', '==', uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.status !== 'removed')
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

/** Checks the poster: banned phone, wrong PIN for a known number */
async function checkPoster(phone, pin) {
  const p = normalizePhone(phone);
  if (!isValidNigerianPhone(p)) throw new Error('Enter a valid 11-digit phone number.');
  if (!isValidPin(pin)) throw new Error('Enter your Roomly PIN (the one you use at checkout).');
  const ban = await getDoc(doc(hubDb, 'hubBans', p));
  if (ban.exists()) throw new Error('This phone number can no longer post in Hostel Hub.');
  const cust = await getCustomerByPhone(p, pin);
  if (cust && cust.wrongPin) throw new Error('Wrong PIN for this phone number. Use the PIN you set at checkout.');
  return p;
}

/**
 * input: { type, title, price, price2, note, days, photoFile, isPhone, proofFile, imei, name, phone, pin, hostel, productNames }
 */
export async function createListing(input) {
  const type = input.type;
  if (!HUB_TYPES.some((t) => t.id === type)) throw new Error('Choose a section.');
  const title = String(input.title || '').trim().slice(0, 60);
  if (title.length < 2) throw new Error('Add a short title.');
  const blocked = blockedReason(type, title, input.productNames || []);
  if (blocked) throw new Error(blocked);
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('Add your name.');
  if (!input.hostel) throw new Error('Choose your hostel.');
  if (type !== 'wanted' && !input.photoFile) throw new Error('Add a real photo.');
  if (input.isPhone && (!input.proofFile || String(input.imei || '').replace(/\D/g, '').length < 14)) {
    throw new Error('Selling a phone needs a photo of the box or receipt and the IMEI (dial *#06#).');
  }
  const phone = await checkPoster(input.phone, input.pin);
  const uid = await hubUid();

  if (type === 'item') {
    const mine = await getDocs(query(collection(hubDb, 'hubListings'), where('ownerUid', '==', uid)));
    const live = mine.docs.map((d) => d.data()).filter((l) => l.type === 'item' && isLive(l));
    if (live.length >= MAX_ITEMS) throw new Error(`You can have ${MAX_ITEMS} pre-owned items up at a time. Mark one as sold first.`);
  }

  const photo = input.photoFile ? await uploadProductImage(input.photoFile) : '';
  const proof = input.isPhone ? await uploadProductImage(input.proofFile) : '';
  const now = Date.now();
  const days = EXPIRY_DAYS.includes(Number(input.days)) ? Number(input.days) : 7;
  const ref = doc(collection(hubDb, 'hubListings'));
  const listing = {
    type,
    title,
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    price2: Math.max(0, Math.round(Number(input.price2) || 0)),
    note: String(input.note || '').trim().slice(0, 300),
    photo,
    isPhone: Boolean(input.isPhone),
    ownerUid: uid,
    name,
    phone,
    hostel: String(input.hostel).slice(0, 30),
    createdAtMs: now,
    updatedAtMs: now,
    confirmedAtMs: now,
    expiresAtMs: LONG_LIVED.includes(type) ? 0 : now + days * DAY,
    status: 'active',
    chargingNow: false,
    reportCount: 0,
    contacts: 0,
    hidden: false,
    stolenFlag: false,
  };
  const batch = writeBatch(hubDb);
  batch.set(ref, listing);
  if (input.isPhone) {
    batch.set(doc(hubDb, 'hubPrivate', ref.id), {
      ownerUid: uid,
      imei: String(input.imei).replace(/\D/g, '').slice(0, 17),
      proof,
      phone,
      atMs: now,
    });
  }
  await batch.commit();
  return { id: ref.id, ...listing };
}

/** Owner: Sold / Remove / Renew / Still available / Charging now */
export async function updateMyListing(id, action, days = 7) {
  await hubUid();
  const now = Date.now();
  const patch = { updatedAtMs: now };
  if (action === 'sold') patch.status = 'sold';
  else if (action === 'remove') patch.status = 'removed';
  else if (action === 'confirm') {
    patch.status = 'active';
    patch.confirmedAtMs = now;
  } else if (action === 'renew') {
    patch.status = 'active';
    patch.expiresAtMs = now + (EXPIRY_DAYS.includes(Number(days)) ? Number(days) : 7) * DAY;
  } else if (action === 'chargingOn') patch.chargingNow = true;
  else if (action === 'chargingOff') patch.chargingNow = false;
  else return;
  await updateDoc(doc(hubDb, 'hubListings', id), patch);
}

/** Anyone: counts a tap on Call / WhatsApp (for the admin's weekly numbers) */
export function countContact(id) {
  hubUid()
    .then(() => updateDoc(doc(hubDb, 'hubListings', id), { contacts: increment(1) }))
    .catch(() => {});
}

/** One report per phone per listing. 3 reports or any "Stolen item" report hides it until the admin checks. */
export async function reportListing(listing, reason, note = '') {
  const uid = await hubUid();
  const rid = `${listing.id}_${uid}`;
  const existing = await getDoc(doc(hubDb, 'hubReports', rid));
  if (existing.exists()) throw new Error('You have already reported this listing. Thank you.');
  const batch = writeBatch(hubDb);
  batch.set(doc(hubDb, 'hubReports', rid), {
    listingId: listing.id,
    uid,
    reason,
    note: String(note || '').slice(0, 300),
    title: String(listing.title || '').slice(0, 60),
    atMs: Date.now(),
  });
  const patch = { reportCount: increment(1) };
  if (reason === 'stolen' || Number(listing.reportCount || 0) + 1 >= REPORT_HIDE_AT) patch.hidden = true;
  if (reason === 'stolen') patch.stolenFlag = true;
  batch.update(doc(hubDb, 'hubListings', listing.id), patch);
  await batch.commit();
}

/* ---------------------------- admin ---------------------------- */

export function adminSubscribeAllListings(cb) {
  return onSnapshot(
    collection(db, 'hubListings'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))),
    (e) => {
      console.error(e);
      cb([]);
    }
  );
}
export function adminSubscribeReports(cb) {
  return onSnapshot(
    collection(db, 'hubReports'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.atMs || 0) - (a.atMs || 0))),
    () => cb([])
  );
}
export async function adminGetPrivate(id) {
  const s = await getDoc(doc(db, 'hubPrivate', id));
  return s.exists() ? s.data() : null;
}
export async function adminRestoreListing(id) {
  await updateDoc(doc(db, 'hubListings', id), { hidden: false, stolenFlag: false, reportCount: 0, status: 'active', updatedAtMs: Date.now() });
}
export async function adminRemoveListing(id) {
  await updateDoc(doc(db, 'hubListings', id), { hidden: true, status: 'removed', updatedAtMs: Date.now() });
}
export async function adminBanPhone(phone, reason = '') {
  const p = normalizePhone(phone);
  await setDoc(doc(db, 'hubBans', p), { phone: p, reason: String(reason).slice(0, 200), atMs: Date.now() });
  // Take down everything this number has up
  const snap = await getDocs(query(collection(db, 'hubListings'), where('phone', '==', p)));
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { hidden: true, status: 'removed', updatedAtMs: Date.now() })));
}
export async function adminUnbanPhone(phone) {
  await deleteDoc(doc(db, 'hubBans', normalizePhone(phone)));
}
export function adminSubscribeBans(cb) {
  return onSnapshot(collection(db, 'hubBans'), (snap) => cb(snap.docs.map((d) => d.data())), () => cb([]));
}

/* ------------------------------------------------------------------ */
/* Gaming                                                              */
/* ------------------------------------------------------------------ */

export function subscribeGamers(cb) {
  return onSnapshot(
    collection(hubDb, 'gamers'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}
/** name, hostel, phone, ids: { efootball: 'id', ... } */
export async function saveGamer(input) {
  const uid = await hubUid();
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('Add the name other players will see.');
  if (!input.hostel) throw new Error('Choose your hostel.');
  const p = normalizePhone(input.phone);
  if (!isValidNigerianPhone(p)) throw new Error('Enter a valid 11-digit phone number.');
  const ids = {};
  GAMES.forEach((g) => {
    const v = String(input.ids?.[g.id] || '').trim().slice(0, 40);
    if (v) ids[g.id] = v;
  });
  if (!Object.keys(ids).length) throw new Error('Add your player ID for at least one game.');
  const ref = doc(hubDb, 'gamers', uid);
  const existing = await getDoc(ref);
  // The phone stays private (admin only); other players see the name, hostel and player IDs
  const data = { name, hostel: String(input.hostel).slice(0, 30), ids, updatedAtMs: Date.now() };
  if (existing.exists()) await updateDoc(ref, data);
  else await setDoc(ref, { ...data, createdAtMs: Date.now(), banned: false });
  await setDoc(doc(hubDb, 'gamerPrivate', uid), { phone: p, atMs: Date.now() });
  try {
    localStorage.setItem('roomly_gamer_phone', p);
  } catch {}
  return { id: uid, ...data };
}
/** Admin: a player's private phone number */
export async function adminGamerPhone(uid) {
  const s = await getDoc(doc(db, 'gamerPrivate', uid));
  return s.exists() ? String(s.data().phone || '') : '';
}
export async function adminSetGamerBan(uid, banned) {
  await updateDoc(doc(db, 'gamers', uid), { banned: Boolean(banned) });
}

export function subscribeChallenges(game, cb) {
  return onSnapshot(
    query(collection(hubDb, 'challenges'), where('game', '==', game)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}
export function adminSubscribeDisputes(cb) {
  return onSnapshot(
    query(collection(db, 'challenges'), where('status', '==', 'disputed')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export const challengeExpired = (c, nowMs = Date.now()) =>
  c.status === 'pending' && nowMs - Number(c.createdAtMs || 0) >= CHALLENGE_ACCEPT_HOURS * 3600000;

/** Winner of a finished challenge, or '' (not finished, disputed or void) */
export function challengeWinner(c) {
  if (c.status === 'void' || c.status === 'cancelled' || c.status === 'declined') return '';
  if (c.status === 'done' && c.winnerUid) return c.winnerUid;
  if (c.claimFrom && c.claimFrom === c.claimTo) return c.claimFrom;
  return '';
}
export const challengeDisputed = (c) => c.status === 'disputed' || (c.claimFrom && c.claimTo && c.claimFrom !== c.claimTo && c.status !== 'done' && c.status !== 'void');

export async function sendChallenge(game, me, opponent) {
  const uid = await hubUid();
  if (uid === opponent.id) throw new Error("You can't challenge yourself.");
  await setDoc(doc(collection(hubDb, 'challenges')), {
    game,
    fromUid: uid,
    toUid: opponent.id,
    fromName: me.name,
    toName: opponent.name,
    status: 'pending',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    respondedAtMs: 0,
    claimFrom: '',
    claimTo: '',
    proofFrom: '',
    proofTo: '',
    winnerUid: '',
  });
}
export async function answerChallenge(c, accept) {
  await hubUid();
  const now = Date.now();
  await updateDoc(doc(hubDb, 'challenges', c.id), { status: accept ? 'accepted' : 'declined', respondedAtMs: now, updatedAtMs: now });
}
export async function cancelChallenge(c) {
  await hubUid();
  await updateDoc(doc(hubDb, 'challenges', c.id), { status: 'cancelled', updatedAtMs: Date.now() });
}
/**
 * Both players say who won. Same answer: done. Different answers: disputed, the admin decides.
 * @param {any} c
 * @param {string} winnerUid
 * @param {File | null} [proofFile]
 */
export async function reportResult(c, winnerUid, proofFile = null) {
  const uid = await hubUid();
  const fresh = await getDoc(doc(hubDb, 'challenges', c.id));
  if (!fresh.exists()) throw new Error('Challenge not found.');
  const cur = { id: c.id, ...fresh.data() };
  const mineIsFrom = uid === cur.fromUid;
  if (!mineIsFrom && uid !== cur.toUid) throw new Error('This is not your match.');
  const theirs = mineIsFrom ? cur.claimTo : cur.claimFrom;
  const proof = proofFile ? await uploadProductImage(proofFile) : '';
  const patch = { updatedAtMs: Date.now() };
  patch[mineIsFrom ? 'claimFrom' : 'claimTo'] = winnerUid;
  patch[mineIsFrom ? 'proofFrom' : 'proofTo'] = proof;
  if (!theirs) {
    patch.status = 'accepted';
    patch.winnerUid = '';
  } else if (theirs === winnerUid) {
    patch.status = 'done';
    patch.winnerUid = winnerUid;
  } else {
    patch.status = 'disputed';
    patch.winnerUid = '';
  }
  await updateDoc(doc(hubDb, 'challenges', c.id), patch);
}
export async function addDisputeProof(c, file) {
  const uid = await hubUid();
  const url = await uploadProductImage(file);
  const key = uid === c.fromUid ? 'proofFrom' : 'proofTo';
  await updateDoc(doc(hubDb, 'challenges', c.id), { [key]: url, updatedAtMs: Date.now() });
}
/** Admin: winnerUid, or '' to void the match */
export async function adminResolveChallenge(c, winnerUid, note = '') {
  await updateDoc(doc(db, 'challenges', c.id), {
    status: winnerUid ? 'done' : 'void',
    winnerUid: winnerUid || '',
    resolvedNote: String(note).slice(0, 200),
    updatedAtMs: Date.now(),
  });
}

/* ---------------------------- tournaments ---------------------------- */

export function subscribeTournaments(cb) {
  return onSnapshot(
    collection(hubDb, 'tournaments'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.startAtMs || 0) - (a.startAtMs || 0))),
    () => cb([])
  );
}
export function subscribeEntries(tid, cb) {
  return onSnapshot(
    collection(hubDb, 'tournaments', tid, 'entries'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.atMs || 0) - (b.atMs || 0))),
    () => cb([])
  );
}
export async function joinTournament(t, gamer) {
  const uid = await hubUid();
  const gameId = gamer?.ids?.[t.game];
  if (!gameId) throw new Error('Add your player ID for this game first.');
  await setDoc(doc(hubDb, 'tournaments', t.id, 'entries', uid), {
    uid,
    name: gamer.name,
    hostel: gamer.hostel || '',
    gameId,
    paid: false,
    paidAtMs: 0,
    confirmed: Number(t.fee) === 0,
    atMs: Date.now(),
  });
}
export async function markEntryPaid(tid) {
  const uid = await hubUid();
  await updateDoc(doc(hubDb, 'tournaments', tid, 'entries', uid), { paid: true, paidAtMs: Date.now() });
}
export async function leaveTournament(tid) {
  const uid = await hubUid();
  await deleteDoc(doc(hubDb, 'tournaments', tid, 'entries', uid));
}

/* admin */
export async function adminSaveTournament(t) {
  const ref = t.id ? doc(db, 'tournaments', t.id) : doc(collection(db, 'tournaments'));
  const data = {
    game: t.game,
    title: String(t.title || '').trim().slice(0, 80),
    format: String(t.format || '').trim().slice(0, 80),
    startAtMs: Number(t.startAtMs) || Date.now(),
    slots: Math.max(2, Math.round(Number(t.slots) || 16)),
    fee: Math.max(0, Math.round(Number(t.fee) || 0)),
    prizeText: String(t.prizeText || '').slice(0, 400),
    whatsapp: String(t.whatsapp || '').trim().slice(0, 200),
    bracketText: String(t.bracketText || '').slice(0, 2000),
    status: t.status || 'open',
    results: t.results || null,
    updatedAtMs: Date.now(),
  };
  if (!t.id) data.createdAtMs = Date.now();
  await setDoc(ref, data, { merge: true });
  return ref.id;
}
export async function adminSetTournament(tid, patch) {
  await updateDoc(doc(db, 'tournaments', tid), { ...patch, updatedAtMs: Date.now() });
}
export async function adminConfirmEntry(tid, uid, confirmed = true) {
  await updateDoc(doc(db, 'tournaments', tid, 'entries', uid), { confirmed });
}
export async function adminRemoveEntry(tid, uid) {
  await deleteDoc(doc(db, 'tournaments', tid, 'entries', uid));
}

/* ---------------------------- leaderboard ---------------------------- */

/**
 * Points per game, worked out from finished challenges and tournament results (nothing is stored,
 * so nobody can edit their own points):
 * - Challenge win +10, or +15 when the loser had more points at the time. Loser -5 (never below 0).
 * - Tournament: 1st +50, 2nd +30, 3rd +15.
 * - Declining or ignoring (48 hours) 2 challenges in a row costs 10 points.
 */
export function computeBoard(game, gamers, challenges, tournaments, nowMs = Date.now()) {
  const players = gamers.filter((g) => !g.banned && g.ids && g.ids[game]);
  const pts = {};
  const wins = {};
  const losses = {};
  const streak = {};
  players.forEach((p) => {
    pts[p.id] = 0;
    wins[p.id] = 0;
    losses[p.id] = 0;
    streak[p.id] = 0;
  });
  const has = (id) => Object.prototype.hasOwnProperty.call(pts, id);
  const events = [];
  challenges
    .filter((c) => c.game === game)
    .forEach((c) => {
      const w = challengeWinner(c);
      if (w) {
        const l = w === c.fromUid ? c.toUid : c.fromUid;
        events.push({ at: Number(c.updatedAtMs || c.createdAtMs || 0), kind: 'match', w, l });
      } else if (c.status === 'declined') {
        events.push({ at: Number(c.respondedAtMs || c.updatedAtMs || 0), kind: 'duck', who: c.toUid });
      } else if (challengeExpired(c, nowMs)) {
        events.push({ at: Number(c.createdAtMs || 0) + CHALLENGE_ACCEPT_HOURS * 3600000, kind: 'duck', who: c.toUid });
      }
    });
  tournaments
    .filter((t) => t.game === game && t.status === 'done' && t.results)
    .forEach((t) => {
      ['first', 'second', 'third'].forEach((k, i) => {
        const uid = t.results?.[k]?.uid;
        if (uid) events.push({ at: Number(t.startAtMs || 0), kind: 'podium', who: uid, add: POINTS.podium[i], first: i === 0 });
      });
    });
  events.sort((a, b) => a.at - b.at);
  const titles = {};
  events.forEach((e) => {
    if (e.kind === 'match') {
      if (!has(e.w) || !has(e.l)) return;
      pts[e.w] += pts[e.l] > pts[e.w] ? POINTS.upset : POINTS.win;
      pts[e.l] = Math.max(0, pts[e.l] - POINTS.loss);
      wins[e.w] += 1;
      losses[e.l] += 1;
      streak[e.w] = 0;
      streak[e.l] = 0;
    } else if (e.kind === 'duck') {
      if (!has(e.who)) return;
      streak[e.who] += 1;
      if (streak[e.who] >= 2) {
        pts[e.who] = Math.max(0, pts[e.who] - POINTS.duck);
        streak[e.who] = 0;
      }
    } else if (e.kind === 'podium') {
      if (!has(e.who)) return;
      pts[e.who] += e.add;
      if (e.first) titles[e.who] = (titles[e.who] || 0) + 1;
    }
  });
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      hostel: p.hostel,
      gameId: p.ids[game],
      points: pts[p.id],
      wins: wins[p.id],
      losses: losses[p.id],
      titles: titles[p.id] || 0,
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
