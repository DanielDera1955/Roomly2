/**
 * Games seasons: season join, challengeable switch, challenge taps, reports, hide, reward week join,
 * and the rules text. Everything here is read and written from the player's phone, so the security
 * rules (firestore.rules) are what keep it honest. Credits are created only by the daily server job.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { hubDb, hubUid, gameLabel, waTo } from './hub.js';
import { db } from './firebase.ts';
import { rewardConfigFor, weekPhase, lagosDay } from './boardCore.js';

/* ------------------------------ rules text ------------------------------ */

/** Bump this when the rules change in a way players must read again */
export const RULES_VERSION = 1;
export const GAME_RULES: { title: string; lines: string[] }[] = [
  {
    title: 'Seasons',
    lines: [
      'A season has a start and an end date set by Roomly. Tap Join season once to enter the season league. Your name and number carry over from your player profile.',
      'Each WhatsApp number can be one player only. The general table and the crown belong to a season. Past champions stay in the Hall of fame.',
    ],
  },
  {
    title: 'Challenges',
    lines: [
      'After you join a season you can be challenged in each game you play. You can switch this off for a game. If you joined a reward week, it stays on for that week.',
      'Only players on a game table can see the other players\' WhatsApp button. Tapping Challenge opens WhatsApp with a message and is recorded. There is no limit on challenges.',
      'Use Report if someone behaves badly. Use "Hide me from this player" so they can no longer challenge you.',
    ],
  },
  {
    title: 'Results',
    lines: [
      'The winner enters the result: the opponent, the score, the stats (goals, kills and damage where the game has them) and a screenshot of the final score. A draw can be entered by either player. A screenshot is required.',
      'You can enter at most 2 matches between the same two players on the same day. The player who challenged is home in the first match and the rematch reverses it. Extra matches do not count.',
      'Your opponent confirms the result or reports it. If nobody answers for 5 hours it shows as recorded. Reports are allowed for 24 hours after the result was entered. After that it is locked, even if it was wrong.',
    ],
  },
  {
    title: 'Points and ranking',
    lines: [
      'A win is 3 points, a draw is 1 and a loss is 0. Points count as soon as a result is entered. If a result is reported, the table is worked out without it until Roomly decides.',
      'Players on the same points are ranked by wins, then goals scored (football games) or damage (the other games), then kills, then whoever reached their points first.',
    ],
  },
  {
    title: 'Reward weeks',
    lines: [
      'When enough players have joined a game table, a reward week starts the next Monday at 12:00AM and runs Monday to Sunday. Roomly sets the minimum number of players and points for each game. A change applies from the next reward week.',
      'Tap Join this week\'s reward to take part. You can join late. The reward table counts only matches entered in that week, starting from zero. The general table is not affected.',
      'The table closes at 12:00AM when the week ends. After that no result can be entered and the ranking is decided.',
    ],
  },
  {
    title: 'Credits',
    lines: [
      'The top 3 players with at least the minimum points each get one food credit. If a player in the top 3 is below the minimum, they get nothing, and credits are not passed down.',
      'Credits are issued on the morning after the table closes. A credit opens at the next 12:00AM and lasts 24 hours from then. It counts if your order is placed before it expires.',
      'A credit works on Outside Food and Canteen Items only, not on Outside Items and not on delivery. It is a fixed amount off your items. Whatever you do not use is lost. One credit per order.',
      'If a credit order is refunded because it was late or failed, the credit is restored with a fresh 24 hours.',
    ],
  },
  {
    title: 'Disputes and cheating',
    lines: [
      'Roomly settles disputes and can add or remove points to correct a result. If a report could change the top 3, Roomly holds the payout until it is settled.',
      'Honest mistakes are corrected with no penalty. A fake screenshot or a false claim removes the points and makes the player ineligible for the next reward week of that game. A second offence removes the player from Games and blocks the number.',
    ],
  },
];

/* ------------------------------ seasons ------------------------------ */

export type Season = { id: string; name: string; session?: string; startMs: number; endMs: number; createdAtMs?: number; champions?: Record<string, any> };

export function subscribeSeasons(cb: (list: Season[]) => void) {
  return onSnapshot(
    collection(hubDb, 'seasons'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => (b.startMs || 0) - (a.startMs || 0))),
    () => cb([])
  );
}
/** The season running now (the latest one that has started and not ended) */
export const currentSeason = (list: Season[], nowMs = Date.now()): Season | null =>
  list.find((s) => Number(s.startMs) <= nowMs && nowMs < Number(s.endMs)) || null;
/** A season that has not started yet (players may already join it) */
export const upcomingSeason = (list: Season[], nowMs = Date.now()): Season | null =>
  [...list].filter((s) => Number(s.startMs) > nowMs).sort((a, b) => a.startMs - b.startMs)[0] || null;
/** Past seasons with their champions, newest first (the Hall of fame) */
export const hallOfFame = (list: Season[], nowMs = Date.now()) =>
  list.filter((s) => Number(s.endMs) <= nowMs && s.champions && Object.keys(s.champions).length > 0);

export function subscribeSeasonJoins(seasonId: string, cb: (list: any[]) => void) {
  if (!seasonId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'seasonJoins'), where('seasonId', '==', seasonId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

/** Join the season league (one tap, after reading the rules) */
export async function joinSeason(season: Season, me: any) {
  const uid = await hubUid();
  if (!me || !me.id) throw new Error('Register as a player first.');
  const id = `${season.id}_${me.id}`;
  const ref = doc(hubDb, 'seasonJoins', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    seasonId: season.id,
    gid: me.id,
    ownerUid: uid,
    name: me.name,
    off: {},
    rulesVersion: RULES_VERSION,
    rulesAtMs: Date.now(),
    joinedAtMs: Date.now(),
  });
  await syncOpen(me, season, { off: {} }, null);
  updateDoc(doc(hubDb, 'gamers', me.id), { lastActiveMs: Date.now() }).catch(() => {});
}

/** Is this player open to challenges in this game? On by default after joining; a reward-week join keeps it on. */
export function isChallengeable(join: any, game: string, rewardJoined = false): boolean {
  if (!join) return false;
  if (rewardJoined) return true;
  return !(join.off && join.off[game]);
}

/** Other players read a phone number only while this is in the future (see the gamerContact rule) */
async function syncOpen(me: any, season: Season, join: any, week: any | null) {
  const games: string[] = me.games || [];
  const anyOn = games.some((g) => isChallengeable(join, g, Boolean(week && week.game === g)));
  const until = Math.max(anyOn ? Number(season.endMs) : 0, week ? Number(week.endMs) : 0);
  await updateDoc(doc(hubDb, 'gamerContact', me.id), { readyUntil: until, atMs: Date.now() }).catch(() => {});
}

/** Switch "challengeable" on or off for one game */
export async function setChallengeable(season: Season, join: any, me: any, game: string, on: boolean, week: any | null = null) {
  await hubUid();
  const off = { ...(join.off || {}) };
  if (on) delete off[game];
  else off[game] = true;
  await updateDoc(doc(hubDb, 'seasonJoins', join.id), { off });
  await syncOpen(me, season, { ...join, off }, week);
}

/* ------------------------------ reward weeks ------------------------------ */

/** Matches of one season only. The app never loads old seasons: History reads the frozen copy instead. */
export function subscribeSeasonMatches(seasonId: string, cb: (list: any[]) => void) {
  if (!seasonId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'matches'), where('seasonId', '==', seasonId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((m: any) => m.v === 2)),
    () => cb([])
  );
}

/** Finished seasons (frozen copies), newest first */
export function subscribeArchives(cb: (list: any[]) => void) {
  return onSnapshot(
    collection(hubDb, 'seasonArchive'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => Number(b.startMs) - Number(a.startMs))),
    () => cb([])
  );
}
export async function loadArchiveTable(seasonId: string, game: string): Promise<any[]> {
  await hubUid();
  const s = await getDoc(doc(hubDb, 'seasonArchive', seasonId, 'tables', game));
  return s.exists() ? ((s.data() as any).rows || []) : [];
}

export function subscribePointAdjust(seasonId: string, cb: (list: any[]) => void) {
  if (!seasonId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'pointAdjust'), where('seasonId', '==', seasonId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeRewardWeeks(seasonId: string, cb: (list: any[]) => void) {
  if (!seasonId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'rewardWeeks'), where('seasonId', '==', seasonId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.startMs || 0) - (a.startMs || 0))),
    () => cb([])
  );
}
export function subscribeRewardJoins(seasonId: string, cb: (list: any[]) => void) {
  if (!seasonId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'rewardJoins'), where('seasonId', '==', seasonId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}
export function subscribeGamesConfig(cb: (c: any) => void) {
  return onSnapshot(doc(hubDb, 'settings', 'gamesConfig'), (s) => cb(s.exists() ? s.data() : {}), () => cb({}));
}

/** The reward week to show for a game: the one running, else the next scheduled one */
export function activeWeekFor(weeks: any[], game: string, nowMs = Date.now()) {
  const mine = weeks.filter((w) => w.game === game);
  const running = mine.find((w) => weekPhase(w, nowMs) === 'running');
  if (running) return running;
  return [...mine].filter((w) => weekPhase(w, nowMs) === 'scheduled').sort((a, b) => a.startMs - b.startMs)[0] || null;
}
/** A reward week (any game) running or scheduled right now: reward weeks queue one after another */
export const queuedWeek = (weeks: any[], nowMs = Date.now()) =>
  [...weeks].filter((w) => ['running', 'scheduled'].includes(weekPhase(w, nowMs))).sort((a, b) => a.startMs - b.startMs)[0] || null;

/** "Join this week's reward": one tap, late joiners allowed until the table closes */
export async function joinRewardWeek(week: any, me: any, season: Season, join: any) {
  const uid = await hubUid();
  if (Date.now() >= Number(week.endMs)) throw new Error('This reward week has closed.');
  if (me.rewardBlocked && me.rewardBlocked[week.game]) throw new Error('You cannot join this reward week. Roomly can tell you why.');
  await setDoc(doc(hubDb, 'rewardJoins', `${week.id}_${me.id}`), {
    weekKey: week.id,
    seasonId: week.seasonId,
    game: week.game,
    gid: me.id,
    ownerUid: uid,
    name: me.name,
    atMs: Date.now(),
  });
  await syncOpen(me, season, join, week);
  updateDoc(doc(hubDb, 'gamers', me.id), { lastActiveMs: Date.now() }).catch(() => {});
}

/** Shown on the reward card: what the settings say for this game */
export const rewardConfig = (config: any, game: string) => rewardConfigFor(config, game);

/* ------------------------------ challenge, report, hide ------------------------------ */

export function subscribeHiddenFromMe(meId: string, cb: (ids: Set<string>) => void) {
  if (!meId) {
    cb(new Set());
    return () => {};
  }
  return onSnapshot(
    query(collection(hubDb, 'gamerHides'), where('blocked', '==', meId)),
    (snap) => cb(new Set(snap.docs.map((d) => String((d.data() as any).hider)))),
    () => cb(new Set())
  );
}

/** Tap Challenge: records the tap, then returns the WhatsApp link with the agreed message */
export async function tapChallenge(game: string, me: any, opp: any, seasonId: string, rewardRunning: boolean) {
  await hubUid();
  if (me.id === opp.id) throw new Error("That's you.");
  const hidden = await getDoc(doc(hubDb, 'gamerHides', `${opp.id}_${me.id}`));
  if (hidden.exists()) throw new Error(`${opp.name} is not available to challenge.`);
  const c = await getDoc(doc(hubDb, 'gamerContact', opp.id));
  if (!c.exists() || !c.data().phone || Number(c.data().readyUntil) <= Date.now()) throw new Error(`${opp.name} cannot be challenged right now.`);
  const now = Date.now();
  await addDoc(collection(hubDb, 'challengeTaps'), {
    from: me.id,
    to: opp.id,
    fromName: me.name,
    toName: opp.name,
    game,
    seasonId,
    kind: rewardRunning ? 'reward' : 'league',
    atMs: now,
  });
  // Needed so a result can be logged against this player (the rules check a recent contact)
  await setDoc(doc(hubDb, 'gameContacts', `${me.id}_${opp.id}_${game}`), { from: me.id, to: opp.id, game, atMs: now });
  updateDoc(doc(hubDb, 'gamers', me.id), { lastActiveMs: now }).catch(() => {});
  const text = `How far ${opp.name}, it's ${me.name}. Let's schedule a ${gameLabel(game)} 1v1 for the Roomly league ${rewardRunning ? 'reward table' : 'table'}. When will you be free?`;
  return waTo(c.data().phone, text);
}

export const REPORT_REASONS_GAMES = [
  { id: 'harassing', label: 'Harassing me' },
  { id: 'fake', label: 'Fake result or screenshot' },
  { id: 'noshow', label: 'Agreed a match and did not show' },
  { id: 'other', label: 'Other' },
];
export async function reportPlayer(game: string, me: any, target: any, reason: string, note: string) {
  await hubUid();
  await addDoc(collection(hubDb, 'gameReports'), {
    from: me.id,
    fromName: me.name,
    target: target.id,
    targetName: target.name,
    game,
    reason,
    note: String(note || '').slice(0, 300),
    atMs: Date.now(),
  });
}
export async function hideFromPlayer(me: any, other: any) {
  await hubUid();
  await setDoc(doc(hubDb, 'gamerHides', `${me.id}_${other.id}`), { hider: me.id, blocked: other.id, atMs: Date.now() });
}

/** Who challenged first between two players, and how many counting matches they have today (for the 2 a day rule) */
export async function pairContext(me: any, oppId: string, game: string) {
  const [a, b] = await Promise.all([
    getDoc(doc(hubDb, 'gameContacts', `${me.id}_${oppId}_${game}`)),
    getDoc(doc(hubDb, 'gameContacts', `${oppId}_${me.id}_${game}`)),
  ]);
  const mine = a.exists() ? Number((a.data() as any).atMs) : 0;
  const theirs = b.exists() ? Number((b.data() as any).atMs) : 0;
  return { challengerId: mine >= theirs ? me.id : oppId, hasContact: Boolean(mine || theirs) };
}
export const todayKey = (ms = Date.now()) => lagosDay(ms);

/* ------------------------------ admin (Phase 1: seasons only) ------------------------------ */

export async function adminCreateSeason(name: string, startMs: number, endMs: number, session = '') {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Give the season a name.');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The end date must be after the start date.');
  const ref = await addDoc(collection(db, 'seasons'), { name: clean, session: String(session || '').trim().slice(0, 20), startMs, endMs, createdAtMs: Date.now() });
  return ref.id;
}
export async function adminUpdateSeasonDates(id: string, startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The end date must be after the start date.');
  await updateDoc(doc(db, 'seasons', id), { startMs, endMs });
}

/** Players on a table: joined the season and play the game */
export function tablePlayers(gamers: any[], joins: any[], game: string) {
  const ids = new Set(joins.map((j) => j.gid));
  return gamers.filter((g) => ids.has(g.id) && g.ownerUid && !g.banned && (g.games || []).includes(game));
}
