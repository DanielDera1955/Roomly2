/**
 * Games admin: reads and writes for the Players tab, credits, week review, challenge log and per-game settings.
 * Runs with the staff (admin) login, so the security rules decide who can use it.
 */
import { collection, doc, getDocs, addDoc, setDoc, updateDoc, query, where, limit, arrayUnion } from 'firebase/firestore';
import { db } from './firebase.ts';
import { phoneKey, normalizePhone } from './api.js';
import { CREDIT_HOURS } from './boardCore.js';

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

/** Contacted mark for one player in one game (date kept, so "not contacted" can be listed first) */
export async function markContacted(gid: string, game: string, on: boolean) {
  await updateDoc(doc(db, 'gamers', gid), { [`contacted.${game}`]: on ? Date.now() : 0 });
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
/** Give a player a fresh credit for a week (after a settlement). Opens now, or at day 9 if that is still ahead, and lasts 24 hours. */
export async function issueCredit(week: any, gid: string, name: string, rank: number, phone: string, value: number) {
  const p = normalizePhone(phone || '');
  if (!p) throw new Error('No phone number saved for this player.');
  const pk = await phoneKey(p);
  const now = Date.now();
  const validFromMs = Math.max(Number(week.endMs) + 24 * HOUR, now);
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
/** Notice of the day: shows until the end of today (Lagos). Posting a new one replaces the old one. */
export async function postDailyNotice(text: string) {
  const t = String(text || '').trim().slice(0, 280);
  const now = Date.now();
  const LAGOS = 3600000;
  const endMs = (Math.floor((now + LAGOS) / 86400000) + 1) * 86400000 - LAGOS;
  await setDoc(doc(db, 'settings', 'gamesConfig'), { notice: t ? { text: t, atMs: now, endMs } : { text: '', atMs: now, endMs: 0 } }, { merge: true });
}
