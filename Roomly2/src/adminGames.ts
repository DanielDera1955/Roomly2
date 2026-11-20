/**
 * Games admin: reads and writes for the Players tab, credits, week review, challenge log and per-game settings.
 * Runs with the staff (admin) login, so the security rules decide who can use it.
 */
import { collection, doc, getDocs, addDoc, setDoc, updateDoc, query, where, limit, arrayUnion, writeBatch } from 'firebase/firestore';
import { db } from './firebase.ts';
import { phoneKey, normalizePhone } from './api.js';
import { CREDIT_HOURS, matchCounts } from './boardCore.js';

const HOUR = 3600000;

/** gamer id -> WhatsApp number */
export async function loadPhones(): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, 'gamerContact'));
  const m = new Map<string, string>();
  snap.docs.forEach((d) => {
    const p = String((d.data() as any).phone || '');
    if (p) m.set(d.id, p);
  });
  return m;
}
export async function loadCredits(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'credits'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => Number(b.issuedAtMs) - Number(a.issuedAtMs));
}
export async function loadTaps(seasonId: string): Promise<any[]> {
  if (!seasonId) return [];
  const snap = await getDocs(query(collection(db, 'challengeTaps'), where('seasonId', '==', seasonId), limit(3000)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => Number(b.atMs) - Number(a.atMs));
}

/** Player reports (harassing, fake results, farming points). Newest first. */
export async function loadReports(): Promise<any[]> {
  const snap = await getDocs(query(collection(db, 'gameReports'), limit(500)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => Number(b.atMs) - Number(a.atMs));
}
export async function setReportHandled(id: string, on: boolean) {
  await updateDoc(doc(db, 'gameReports', id), { handledMs: on ? Date.now() : 0 });
}

/** Contacted mark for one player in one game (date kept, so "not contacted" can be listed first) */
export async function markContacted(gid: string, game: string, on: boolean) {
  await updateDoc(doc(db, 'gamers', gid), { [`contacted.${game}`]: on ? Date.now() : 0 });
}
/** "Not on WhatsApp": the admin tried the number and it does not reach WhatsApp. Shown with the losing-streak flag. */
export async function markNoWhatsapp(gid: string, on: boolean) {
  await updateDoc(doc(db, 'gamers', gid), { 'contacted.noWa': on ? Date.now() : 0 });
}
/** "Number checked": the admin tried the number and it works, so the losing-streak flag no longer applies */
export async function markNumberChecked(gid: string, on: boolean) {
  await updateDoc(doc(db, 'gamers', gid), { 'contacted.numberChecked': on ? Date.now() : 0, ...(on ? { 'contacted.noWa': 0 } : {}) });
}
/**
 * Remove an account for farming: block it and void every match of theirs that counts this season (league and reward),
 * so the points their opponents earned against it disappear. Credits already issued are not touched: cancel them in Credits.
 * Returns how many matches were voided.
 */
export async function removeFarmAccount(gid: string, seasonId: string, matches: any[]): Promise<number> {
  const mine = matches.filter((m) => m.seasonId === seasonId && matchCounts(m) && (m.aUid === gid || m.bUid === gid));
  for (let i = 0; i < mine.length; i += 400) {
    const batch = writeBatch(db);
    mine.slice(i, i + 400).forEach((m) => batch.update(doc(db, 'matches', m.id), { status: 'void', voidedFor: 'farming', voidedAtMs: Date.now() }));
    await batch.commit();
  }
  await updateDoc(doc(db, 'gamers', gid), { banned: true, 'contacted.removed': Date.now() });
  return mine.length;
}
export async function setRewardBlocked(gid: string, game: string, on: boolean) {
  await updateDoc(doc(db, 'gamers', gid), { [`rewardBlocked.${game}`]: on });
}

/** Add or remove points for one player. With a week, it only changes that week's table (and the season table too). */
export async function adjustPoints(a: { seasonId: string; weekKey: string; game: string; gid: string; name: string; pts: number; reason: string }) {
  const pts = Math.round(Number(a.pts));
  if (!Number.isFinite(pts) || pts === 0) throw new Error('Enter a number of points, like 3 or -3.');
  if (Math.abs(pts) > 100) throw new Error('That is too many points at once.');
  await addDoc(collection(db, 'pointAdjust'), { ...a, pts, reason: String(a.reason || '').slice(0, 200), atMs: Date.now() });
}

export async function voidCredit(id: string) {
  await updateDoc(doc(db, 'credits', id), { status: 'void', voidedAtMs: Date.now() });
}
/** Give a player a fresh credit for a week (after a settlement). It opens now, because the results are already settled, and lasts 24 hours. */
export async function issueCredit(week: any, gid: string, name: string, rank: number, phone: string, value: number) {
  const p = normalizePhone(phone || '');
  if (!p) throw new Error('No phone number saved for this player.');
  const pk = await phoneKey(p);
  const now = Date.now();
  const validFromMs = now;
  const id = `${week.id}_${gid}_m${now}`;
  await setDoc(doc(db, 'credits', id), {
    pk,
    gid,
    name,
    game: week.game,
    weekKey: week.id,
    seasonId: week.seasonId,
    rank,
    value: Number(value),
    issuedAtMs: now,
    validFromMs,
    expiresAtMs: validFromMs + CREDIT_HOURS * HOUR,
    status: 'active',
    usedOrderId: '',
    usedAtMs: 0,
    manual: true,
  });
  await setDoc(doc(db, 'creditIndex', pk), { ids: arrayUnion(id) }, { merge: true });
}

/** Put every registered player on the season. Their own games decide which tables they appear in. They tick the rules on first open. */
export async function addAllToSeason(season: { id: string }, gamers: any[], existing: Set<string>) {
  let added = 0;
  for (const g of gamers) {
    if (!g.ownerUid || g.banned || !(g.games || []).length || existing.has(g.id)) continue;
    await setDoc(doc(db, 'seasonJoins', `${season.id}_${g.id}`), {
      seasonId: season.id,
      gid: g.id,
      ownerUid: g.ownerUid,
      name: g.name,
      off: {},
      rulesVersion: 0,
      rulesAtMs: 0,
      joinedAtMs: Date.now(),
      addedByAdmin: true,
    });
    added++;
  }
  return added;
}

/** Per-game reward settings. They apply from the next reward week. */
export async function saveGameSettings(game: string, cfg: { minPlayers: number; minPoints: number; creditValue: number }) {
  await setDoc(doc(db, 'settings', 'gamesConfig'), { perGame: { [game]: cfg } }, { merge: true });
}

/** Official WhatsApp group link (shown in Games and in the bell) */
export async function saveGroupLink(link: string) {
  const v = String(link || '').trim();
  if (v && !/^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com)\//i.test(v)) throw new Error('Paste the full WhatsApp group invite link, starting with https://chat.whatsapp.com/');
  await setDoc(doc(db, 'settings', 'gamesConfig'), { groupLink: v }, { merge: true });
}
/** How many games run a reward week at the same time (1 or 2) */
export async function saveSlots(n: number) {
  await setDoc(doc(db, 'settings', 'gamesConfig'), { slots: Number(n) === 2 ? 2 : 1 }, { merge: true });
}
/** Notice of the day: shows until the end of today (Lagos). Posting a new one replaces the old one. */
export async function postDailyNotice(text: string) {
  const t = String(text || '').trim().slice(0, 280);
  const now = Date.now();
  const LAGOS = 3600000;
  const endMs = (Math.floor((now + LAGOS) / 86400000) + 1) * 86400000 - LAGOS;
  await setDoc(doc(db, 'settings', 'gamesConfig'), { notice: t ? { text: t, atMs: now, endMs } : { text: '', atMs: now, endMs: 0 } }, { merge: true });
}
