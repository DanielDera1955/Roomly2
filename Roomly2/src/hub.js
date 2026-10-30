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
  { id: 'service', label: 'Service', hint: 'Barbing, hair braiding, laundry, typing and more' },
  { id: 'charging', label: 'Phone charging', hint: 'Charge phones when there is no light' },
  { id: 'water', label: 'Water fetching', hint: 'Fetch water for students during scarcity' },
  { id: 'item', label: 'For sale', hint: 'Your own used items: stove, bucket, power bank, phone, books' },
  { id: 'rent', label: 'For rent', hint: 'Lend your stove or other items per day' },
  { id: 'wanted', label: 'Wanted', hint: 'Tell everyone what you need' },
];
/** Hostel Hub has three sections. Each listing type lives in one of them. */
export const HUB_SECTIONS = [
  { id: 'services', label: 'Services', types: ['service', 'charging', 'water'] },
  { id: 'buysell', label: 'Buy & Sell', types: ['item', 'rent', 'wanted'] },
  { id: 'games', label: 'Games', types: [] },
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
/** Football games are scored (draws possible); the others are win or lose */
export const SCORED_GAMES = ['efootball', 'fifa', 'dls'];
export const READY_CHOICES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '3d', label: '3 days', days: 3 },
  { id: '1w', label: '1 week', days: 7 },
];
/** Rating: everyone starts at 1,000. K decides how much one match moves it. */
export const RATING = { start: 1000, k: 32, idleDecayPerWeek: 10, crownActiveDays: 14, podium: [40, 25, 15] };
/** A logged result counts by itself after 24 hours; the opponent can dispute for 3 days */
export const AUTO_CONFIRM_HOURS = 24;
export const DISPUTE_HOURS = 72;
/** You can log a result only against someone you contacted (or who contacted you) through Roomly in this time */
export const CONTACT_VALID_DAYS = 3;

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
  return hit
    ? `The school doesn't allow selling "${hit.trim()}" in the hostel. Roomly delivers it to your room: order it from Store Items or Food.`
    : '';
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
 * input: { type, title, price, price2, note, days, photoFile, name, phone, pin, hostel, productNames }
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
  const phone = await checkPoster(input.phone, input.pin);
  const uid = await hubUid();

  if (type === 'item') {
    const mine = await getDocs(query(collection(hubDb, 'hubListings'), where('ownerUid', '==', uid)));
    const live = mine.docs.map((d) => d.data()).filter((l) => l.type === 'item' && isLive(l));
    if (live.length >= MAX_ITEMS) throw new Error(`You can have ${MAX_ITEMS} pre-owned items up at a time. Mark one as sold first.`);
  }

  const photo = input.photoFile ? await uploadProductImage(input.photoFile) : '';
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
    isPhone: false,
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
/*                                                                     */
/* 1. Join once: name, hostel, phone (private), the games you play.    */
/* 2. Go "Ready to play": you show with a WhatsApp Challenge button.   */
/* 3. Play, then one player logs the result. The other confirms, or    */
/*    it counts by itself after 24 hours (they can dispute for 3 days). */
/* 4. Ratings are worked out from confirmed results, never stored.     */
/* ------------------------------------------------------------------ */

const HOUR = 3600000;
export const isScored = (game) => SCORED_GAMES.includes(game);
export const gameLabel = (id) => GAMES.find((g) => g.id === id)?.label || id;
export const playsGame = (g, game) => Boolean(g && !g.banned && (g.games || []).includes(game));
/** Ready for this game right now? */
export const readyFor = (g, game, nowMs = Date.now()) => playsGame(g, game) && Number(g.ready?.[game] || 0) > nowMs;
const appLink = (params) => `${window.location.origin}/?${new URLSearchParams(params).toString()}`;
export const waShare = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const waTo = (phone, text) => `https://wa.me/234${String(phone).replace(/\D/g, '').replace(/^0/, '')}?text=${encodeURIComponent(text)}`;

export function subscribeGamers(cb) {
  return onSnapshot(
    collection(hubDb, 'gamers'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

/** name, hostel, phone, games: ['efootball', ...], ids: { efootball: 'optional id' }, freeNote */
export async function saveGamer(input) {
  const uid = await hubUid();
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('Add the name other players will see.');
  if (!input.hostel) throw new Error('Choose your hostel.');
  const p = normalizePhone(input.phone);
  if (!isValidNigerianPhone(p)) throw new Error('Enter your WhatsApp number (11 digits).');
  const games = GAMES.map((g) => g.id).filter((id) => (input.games || []).includes(id));
  if (!games.length) throw new Error('Tap at least one game you play.');
  const ids = {};
  games.forEach((g) => {
    const v = String(input.ids?.[g] || '').trim().slice(0, 40);
    if (v) ids[g] = v;
  });
  const ref = doc(hubDb, 'gamers', uid);
  const existing = await getDoc(ref);
  const data = {
    name,
    hostel: String(input.hostel).slice(0, 30),
    games,
    ids,
    freeNote: String(input.freeNote || '').trim().slice(0, 60),
    updatedAtMs: Date.now(),
  };
  if (existing.exists()) await updateDoc(ref, data);
  else await setDoc(ref, { ...data, ready: {}, createdAtMs: Date.now(), banned: false });
  const ready = existing.exists() ? existing.data().ready || {} : {};
  // Phone: readable by other players only while you are "Ready to play" (enforced by the security rules)
  await setDoc(doc(hubDb, 'gamerContact', uid), { phone: p, readyUntil: maxReady(ready), atMs: Date.now() });
  try {
    localStorage.setItem('roomly_gamer_phone', p);
  } catch {}
  return { id: uid, ...data };
}
const maxReady = (ready) => Math.max(0, ...Object.values(ready || {}).map((v) => Number(v) || 0));

/** Go ready for a game (days 0 = until midnight), or switch it off */
export async function setReady(game, choice) {
  const uid = await hubUid();
  const ref = doc(hubDb, 'gamers', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Join the leaderboard first.');
  const ready = { ...(snap.data().ready || {}) };
  if (!choice) delete ready[game];
  else {
    const c = READY_CHOICES.find((x) => x.id === choice) || READY_CHOICES[2];
    const end = new Date();
    if (c.days === 0) end.setHours(23, 59, 0, 0);
    else end.setTime(end.getTime() + c.days * 86400000);
    ready[game] = end.getTime();
  }
  await updateDoc(ref, { ready, updatedAtMs: Date.now() });
  await updateDoc(doc(hubDb, 'gamerContact', uid), { readyUntil: maxReady(ready), atMs: Date.now() });
}

/**
 * Challenge a ready player: records the contact (needed later to log a result) and returns the
 * WhatsApp link with the message already written.
 */
export async function challengeOnWhatsApp(game, me, opp, myRating) {
  const uid = await hubUid();
  if (uid === opp.id) throw new Error("That's you.");
  const c = await getDoc(doc(hubDb, 'gamerContact', opp.id));
  if (!c.exists() || !c.data().phone) throw new Error(`${opp.name} is no longer ready to play.`);
  await setDoc(doc(hubDb, 'gameContacts', `${uid}_${opp.id}_${game}`), { from: uid, to: opp.id, game, atMs: Date.now() });
  const text =
    `Hi ${opp.name}, I saw you're ready for ${gameLabel(game)} on Roomly Caritas. ` +
    `I'm ${me.name}${myRating ? ` (rating ${myRating})` : ''}. Let's play? ` +
    `After the match, one of us logs the score here: ${appLink({ game })}`;
  return waTo(c.data().phone, text);
}

/** People you can log a result against for this game: contacted through Roomly in the last 3 days, either way */
export async function getRecentOpponents(game) {
  const uid = await knownHubUid();
  if (!uid) return [];
  const since = Date.now() - CONTACT_VALID_DAYS * 86400000;
  const [a, b] = await Promise.all([
    getDocs(query(collection(hubDb, 'gameContacts'), where('from', '==', uid))),
    getDocs(query(collection(hubDb, 'gameContacts'), where('to', '==', uid))),
  ]);
  const ids = new Set();
  [...a.docs, ...b.docs].forEach((d) => {
    const c = d.data();
    if (c.game === game && Number(c.atMs) >= since) ids.add(c.from === uid ? c.to : c.from);
  });
  return [...ids];
}

/* ---------------------------- results ---------------------------- */

export function subscribeMatches(game, cb) {
  return onSnapshot(
    query(collection(hubDb, 'matches'), where('game', '==', game)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

/**
 * Log a result. myScore / theirScore: goals for football games, or 1 and 0 (who won) for the others.
 * Returns the WhatsApp share link that asks the opponent to confirm.
 * @param {string} game
 * @param {any} me
 * @param {any} opp
 * @param {number} myScore
 * @param {number} theirScore
 * @param {File | null} [proofFile]
 */
export async function logResult(game, me, opp, myScore, theirScore, proofFile = null) {
  const uid = await hubUid();
  const a = Math.max(0, Math.min(99, Math.round(Number(myScore) || 0)));
  const b = Math.max(0, Math.min(99, Math.round(Number(theirScore) || 0)));
  if (!isScored(game) && a === b) throw new Error('Pick who won.');
  const proof = proofFile ? await uploadProductImage(proofFile) : '';
  const ref = doc(collection(hubDb, 'matches'));
  await setDoc(ref, {
    game,
    aUid: uid,
    bUid: opp.id,
    aName: me.name,
    bName: opp.name,
    scoreA: a,
    scoreB: b,
    status: 'pending',
    loggedAtMs: Date.now(),
    confirmedAtMs: 0,
    proofA: proof,
    proofB: '',
    disputeNote: '',
  });
  const result = isScored(game) ? `${me.name} ${a} - ${b} ${opp.name}` : `${a > b ? me.name : opp.name} won`;
  return waShare(
    `${opp.name}, I logged our ${gameLabel(game)} match on Roomly Caritas: ${result}. ` +
      `Confirm it here: ${appLink({ match: ref.id })} (it counts by itself after ${AUTO_CONFIRM_HOURS} hours).`
  );
}

export async function confirmMatch(m) {
  await hubUid();
  await updateDoc(doc(hubDb, 'matches', m.id), { status: 'confirmed', confirmedAtMs: Date.now() });
}
/** @param {any} m @param {string} note @param {File | null} [proofFile] */
export async function disputeMatch(m, note, proofFile = null) {
  await hubUid();
  const proof = proofFile ? await uploadProductImage(proofFile) : '';
  await updateDoc(doc(hubDb, 'matches', m.id), { status: 'disputed', disputeNote: String(note || '').slice(0, 200), proofB: proof });
}
export async function cancelMatch(m) {
  await hubUid();
  await updateDoc(doc(hubDb, 'matches', m.id), { status: 'cancelled' });
}
/** Either player adds a screenshot while the admin looks at a dispute */
export async function addMatchProof(m, file) {
  const uid = await hubUid();
  const url = await uploadProductImage(file);
  await updateDoc(doc(hubDb, 'matches', m.id), { [uid === m.aUid ? 'proofA' : 'proofB']: url });
}

/** Does this result count towards ratings now? */
export function matchCounts(m, nowMs = Date.now()) {
  if (m.status === 'confirmed') return true;
  return m.status === 'pending' && nowMs - Number(m.loggedAtMs || 0) >= AUTO_CONFIRM_HOURS * HOUR;
}
/** Can the opponent still dispute it? */
export const canDispute = (m, nowMs = Date.now()) =>
  (m.status === 'pending' || m.status === 'confirmed') && nowMs - Number(m.loggedAtMs || 0) < DISPUTE_HOURS * HOUR;

/* admin */
export function adminSubscribeDisputes(cb) {
  return onSnapshot(
    query(collection(db, 'matches'), where('status', '==', 'disputed')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}
/** Admin: keep as logged, set the right score, or void */
export async function adminResolveMatch(m, action, scoreA = 0, scoreB = 0) {
  const patch =
    action === 'void'
      ? { status: 'void' }
      : action === 'score'
      ? { status: 'confirmed', scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0, confirmedAtMs: Date.now() }
      : { status: 'confirmed', confirmedAtMs: Date.now() };
  await updateDoc(doc(db, 'matches', m.id), patch);
}
export async function adminGamerPhone(uid) {
  const s = await getDoc(doc(db, 'gamerContact', uid));
  return s.exists() ? String(s.data().phone || '') : '';
}
export async function adminSetGamerBan(uid, banned) {
  await updateDoc(doc(db, 'gamers', uid), { banned: Boolean(banned) });
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
  if (!playsGame(gamer, t.game)) throw new Error(`Add ${gameLabel(t.game)} to your games first.`);
  await setDoc(doc(hubDb, 'tournaments', t.id, 'entries', uid), {
    uid,
    name: gamer.name,
    hostel: gamer.hostel || '',
    gameId: gamer.ids?.[t.game] || '',
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
 * Rating per game, worked out from results that count and tournament places (nothing stored, so
 * nobody can edit their own rating):
 * - Everyone starts at 1,000. Beat a stronger player and you gain a lot; beat a weaker one, a little.
 *   Lose to a weaker player and you lose a lot. A draw moves both a little towards each other.
 * - Tournament places add a bonus: 1st +40, 2nd +25, 3rd +15.
 * - No match for a week: -10 per idle week (from the last match).
 * - The crown goes to the top player who played in the last 14 days.
 */
export function computeBoard(game, gamers, matches, tournaments, nowMs = Date.now()) {
  const players = gamers.filter((g) => playsGame(g, game));
  const rating = {};
  const w = {};
  const d = {};
  const l = {};
  const last = {};
  const played = {};
  const titles = {};
  players.forEach((p) => {
    rating[p.id] = RATING.start;
    w[p.id] = d[p.id] = l[p.id] = 0;
    last[p.id] = 0;
    played[p.id] = 0;
    titles[p.id] = 0;
  });
  const has = (id) => Object.prototype.hasOwnProperty.call(rating, id);
  const events = [];
  matches
    .filter((m) => m.game === game && matchCounts(m, nowMs))
    .forEach((m) => events.push({ at: Number(m.loggedAtMs || 0), kind: 'match', m }));
  tournaments
    .filter((t) => t.game === game && t.status === 'done' && t.results)
    .forEach((t) =>
      ['first', 'second', 'third'].forEach((k, i) => {
        const uid = t.results?.[k]?.uid;
        if (uid) events.push({ at: Number(t.startAtMs || 0), kind: 'podium', uid, add: RATING.podium[i], first: i === 0 });
      })
    );
  events.sort((x, y) => x.at - y.at);
  events.forEach((e) => {
    if (e.kind === 'podium') {
      if (!has(e.uid)) return;
      rating[e.uid] += e.add;
      last[e.uid] = Math.max(last[e.uid], e.at);
      if (e.first) titles[e.uid] += 1;
      return;
    }
    const { aUid, bUid, scoreA, scoreB } = e.m;
    if (!has(aUid) || !has(bUid) || aUid === bUid) return;
    const sa = scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5;
    const ea = 1 / (1 + Math.pow(10, (rating[bUid] - rating[aUid]) / 400));
    const change = RATING.k * (sa - ea);
    rating[aUid] += change;
    rating[bUid] -= change;
    if (sa === 1) {
      w[aUid]++;
      l[bUid]++;
    } else if (sa === 0) {
      w[bUid]++;
      l[aUid]++;
    } else {
      d[aUid]++;
      d[bUid]++;
    }
    played[aUid]++;
    played[bUid]++;
    last[aUid] = Math.max(last[aUid], e.at);
    last[bUid] = Math.max(last[bUid], e.at);
  });
  const WEEK = 7 * 86400000;
  const rows = players.map((p) => {
    const idleWeeks = last[p.id] ? Math.floor((nowMs - last[p.id]) / WEEK) : 0;
    const shown = Math.round(rating[p.id] - idleWeeks * RATING.idleDecayPerWeek);
    return {
      id: p.id,
      name: p.name,
      hostel: p.hostel,
      gameId: p.ids?.[game] || '',
      freeNote: p.freeNote || '',
      rating: shown,
      wins: w[p.id],
      draws: d[p.id],
      losses: l[p.id],
      played: played[p.id],
      titles: titles[p.id],
      lastMs: last[p.id],
      active: last[p.id] > 0 && nowMs - last[p.id] <= RATING.crownActiveDays * 86400000,
      ready: readyFor(p, game, nowMs),
      readyUntil: Number(p.ready?.[game] || 0),
    };
  });
  const ranked = rows
    .filter((r) => r.lastMs > 0)
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const crownId = ranked.find((r) => r.active)?.id || '';
  const fresh = rows.filter((r) => r.lastMs === 0).sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
  return { ranked: ranked.map((r) => ({ ...r, crown: r.id === crownId })), fresh };
}
