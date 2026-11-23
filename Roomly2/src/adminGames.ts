/**
 * Games admin: reads and writes for the Players tab, credits, week review, challenge log and per-game settings.
 * Runs with the staff (admin) login, so the security rules decide who can use it.
 */
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, limit, arrayUnion, writeBatch } from 'firebase/firestore';
import { db } from './firebase.ts';
import { phoneKey, normalizePhone } from './api.js';
import { CREDIT_HOURS, matchCounts, WEEK_MS, weekKeyOf } from './boardCore.js';
import { RULES_VERSION } from './season';

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

/**
 * Schedule weekly rewards that live inside the league: each runs 7 days from the start (12:00AM Lagos) and its table is
 * counted from the same league matches. Weeks that already exist are left alone. Returns how many were created.
 */
export async function scheduleWeeks(a: { seasonId: string; game: string; firstStartMs: number; count: number; minPoints: number; creditValue: number }) {
  const count = Math.max(1, Math.min(12, Math.round(Number(a.count))));
  if (!Number.isFinite(a.firstStartMs) || a.firstStartMs < Date.now() - 6 * 3600000) throw new Error('Pick a start day that has not passed.');
  if (!(Number(a.minPoints) > 0) || !(Number(a.creditValue) > 0)) throw new Error('Minimum points and credit value must be numbers above zero.');
  let made = 0;
  for (let i = 0; i < count; i++) {
    const startMs = a.firstStartMs + i * WEEK_MS;
    const id = weekKeyOf(a.seasonId, a.game, startMs);
    const ref = doc(db, 'rewardWeeks', id);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, {
      seasonId: a.seasonId,
      game: a.game,
      startMs,
      endMs: startMs + WEEK_MS,
      minPlayers: 0,
      minPoints: Number(a.minPoints),
      creditValue: Number(a.creditValue),
      status: 'scheduled',
      v: 2,
      createdAtMs: Date.now(),
    });
    made++;
  }
  return made;
}
/** Remove a week that has not started yet */
export async function removeWeek(id: string) {
  await deleteDoc(doc(db, 'rewardWeeks', id));
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
/** Give a player a fresh credit for a week (after a settlement). It opens now, because the results are already settled, and lasts 48 hours. Also writes the public winner line for the game page. */
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
  // The public winner line on the game page (one per player per week)
  await setDoc(doc(db, 'gameWinners', `week_${week.id}_${gid}`), {
    kind: 'weekly',
    game: week.game,
    ref: week.id,
    gid,
    name,
    rank,
    value: Number(value),
    atMs: now,
  });
}

/** Put every registered player on the season. Their own games decide which tables they appear in.
 *  A player who already accepted the current rules in an earlier season keeps that acceptance (also fixed for players added earlier
 *  with the rules unticked). Everyone else ticks the rules on first open. */
export async function addAllToSeason(season: { id: string }, gamers: any[], _existing?: Set<string>) {
  const snap = await getDocs(collection(db, 'seasonJoins'));
  const accepted = new Set<string>();
  const here = new Map<string, any>();
  snap.docs.forEach((d) => {
    const j: any = { id: d.id, ...(d.data() as any) };
    if (j.seasonId === season.id) here.set(j.gid, j);
    else if (Number(j.rulesVersion || 0) >= RULES_VERSION) accepted.add(j.gid);
  });
  let added = 0;
  let carried = 0;
  let pending = 0;
  for (const g of gamers) {
    if (!g.ownerUid || g.banned || !(g.games || []).length) continue;
    const cur = here.get(g.id);
    if (cur) {
      if (Number(cur.rulesVersion || 0) >= RULES_VERSION) continue;
      if (accepted.has(g.id)) {
        await updateDoc(doc(db, 'seasonJoins', cur.id), { rulesVersion: RULES_VERSION, rulesAtMs: Date.now(), rulesCarriedOver: true });
        carried++;
      } else pending++;
      continue;
    }
    const carry = accepted.has(g.id);
    await setDoc(doc(db, 'seasonJoins', `${season.id}_${g.id}`), {
      seasonId: season.id,
      gid: g.id,
      ownerUid: g.ownerUid,
      name: g.name,
      off: {},
      rulesVersion: carry ? RULES_VERSION : 0,
      rulesAtMs: carry ? Date.now() : 0,
      ...(carry ? { rulesCarriedOver: true } : {}),
      joinedAtMs: Date.now(),
      addedByAdmin: true,
    });
    added++;
    if (carry) carried++;
    else pending++;
  }
  return { added, carried, pending };
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

/* ------------------------------ Special 1v1 ------------------------------ */

/** Create a Special 1v1: one game, one special player (X), one day. Players see its card on that game's page. */
export async function createSpecialEvent(e: {
  seasonId: string;
  game: string;
  xId: string;
  xName: string;
  startMs: number;
  endMs: number;
  prizeChallenger: number;
  prizeX: number;
}) {
  if (!e.game || !e.xId) throw new Error('Pick the game and the special player.');
  if (!Number.isFinite(e.startMs) || !Number.isFinite(e.endMs) || e.endMs <= e.startMs) throw new Error('The end time must be after the start time.');
  const id = `sp_${e.game}_${e.startMs}`;
  await setDoc(doc(db, 'specialEvents', id), {
    ...e,
    prizeChallenger: Math.max(0, Math.round(Number(e.prizeChallenger) || 0)),
    prizeX: Math.max(0, Math.round(Number(e.prizeX) || 0)),
    needWins: 3,
    ofMatches: 5,
    status: 'on',
    createdAtMs: Date.now(),
  });
  return id;
}
/** Pause: stops new special matches and hides the Challenge button. Matches already logged stay. */
export async function setSpecialStatus(id: string, status: 'on' | 'paused') {
  await updateDoc(doc(db, 'specialEvents', id), { status });
}
/** Remove the event card. Matches already logged are not touched. */
export async function removeSpecialEvent(id: string) {
  await deleteDoc(doc(db, 'specialEvents', id));
}
/** The admin has checked the matches: publish the winner on the game page and close the event. */
export async function confirmSpecialWinner(
  event: any,
  result: { kind: 'challenger' | 'x'; gid: string; name: string; text: string; value: number }
) {
  const now = Date.now();
  await setDoc(doc(db, 'gameWinners', `special_${event.id}`), {
    kind: 'special',
    game: event.game,
    ref: event.id,
    gid: result.gid,
    name: result.name,
    winKind: result.kind,
    text: String(result.text || '').slice(0, 160),
    value: Number(result.value) || 0,
    atMs: now,
  });
  await updateDoc(doc(db, 'specialEvents', event.id), {
    status: 'done',
    winner: { kind: result.kind, gid: result.gid, name: result.name, atMs: now },
  });
}
/** Reopen an event that was closed by mistake: removes the published winner line. */
export async function reopenSpecial(event: any) {
  await deleteDoc(doc(db, 'gameWinners', `special_${event.id}`)).catch(() => {});
  await updateDoc(doc(db, 'specialEvents', event.id), { status: 'paused', winner: null });
}
export async function removeWinnerLine(id: string) {
  await deleteDoc(doc(db, 'gameWinners', id));
}
/** Credit for a Special 1v1 prize. Only the admin issues it, after checking the matches. Opens now and lasts 48 hours. */
export async function issueSpecialCredit(event: any, gid: string, name: string, phone: string, value: number, reason: string) {
  const p = normalizePhone(phone || '');
  if (!p) throw new Error('No phone number saved for this player.');
  const pk = await phoneKey(p);
  const now = Date.now();
  const id = `${event.id}_${gid}_m${now}`;
  await setDoc(doc(db, 'credits', id), {
    pk,
    gid,
    name,
    game: event.game,
    weekKey: event.id,
    seasonId: event.seasonId || '',
    kind: 'special',
    reason: String(reason || 'Special 1v1').slice(0, 120),
    rank: 0,
    value: Number(value),
    issuedAtMs: now,
    validFromMs: now,
    expiresAtMs: now + CREDIT_HOURS * HOUR,
    status: 'active',
    usedOrderId: '',
    usedAtMs: 0,
    manual: true,
  });
  await setDoc(doc(db, 'creditIndex', pk), { ids: arrayUnion(id) }, { merge: true });
}
export async function removeBooking(id: string) {
  await deleteDoc(doc(db, 'specialBookings', id));
}
/** Take back a points adjustment */
export async function undoAdjust(id: string) {
  await deleteDoc(doc(db, 'pointAdjust', id));
}
