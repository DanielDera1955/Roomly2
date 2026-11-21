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
import { hubDb, hubUid, gameLabel, waTo, isScored } from './hub.js';
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
      'Once you have joined and accepted the rules, any league player can challenge you at any time in the games you play. Tap a player on the table, then Schedule 1v1, to open WhatsApp with a message. Other league players can message you on WhatsApp this way, and every tap is recorded.',
      'Use Report if someone behaves badly. Use "Hide me from this player" so they can no longer challenge you.',
    ],
  },
  {
    title: 'Results',
    lines: [
      'The winner enters the result: the opponent, the score, the stats (goals, kills and damage where the game has them) and a screenshot of the final score. A draw can be entered by either player. A screenshot is required. Screenshots you upload are shown to other players.',
      'Anyone can report an account they believe is farming or faking points. Roomly checks it and can remove points or ban the account.',
      'Each match counts in one contest only: the league table or a reward week, depending on where you log it. League matches never add to a reward table and reward matches never add to the league.',
      'Between the same two players, at most 4 league matches count per week (2 home and 2 away) and at most 2 reward matches count per week (1 home and 1 away). The player who challenged is home in the first match and the rematch reverses it. Extra matches do not count.',
      'Your opponent confirms the result or reports it. If nobody answers for 24 hours it is confirmed automatically. Reports are allowed for 24 hours after the result was entered. After that it is locked, even if it was wrong. You can take back a result you entered within 10 minutes, if you have not entered a newer one.',
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
      'Reward weeks go one game at a time. When enough players have registered for a game\'s reward contest, its week starts at the next 12:00AM and runs 7 days to 12:00AM. If another game\'s week is running, it starts when that one ends. Roomly sets the minimum number of players and points for each game. A change applies from the next reward week.',
      'Tap Join the reward contest on a game and tick its rules to register once for the semester. You can register late. The reward table counts only reward matches entered in that week, starting from zero. League points are not affected.',
      'The table closes at 12:00AM when the 7 days end. After that no result can be entered and the ranking is decided.',
    ],
  },
  {
    title: 'Credits',
    lines: [
      'The top 3 players with at least the minimum points each get one food credit. If a player in the top 3 is below the minimum, they get nothing, and credits are not passed down.',
      'Credits are issued when the table closes. If all your counted matches are confirmed, your credit opens straight away. If any of them is still waiting or reported, it opens after that is settled or after 24 hours, so it can take up to 48 hours. A credit lasts 24 hours from when it opens. It counts if your order is placed before it expires.',
      'A credit works on Outside Food and Canteen Items only, not on Outside Items and not on delivery. It is a fixed amount off your items. Whatever you do not use is lost. One credit per order.',
      'If a credit order is refunded because it was late or failed, the credit is restored with a fresh 24 hours.',
    ],
  },
  {
    title: 'Disputes and cheating',
    lines: [
      'Roomly settles disputes and can add or remove points to correct a result. If a report could change the top 3, Roomly holds the payout until it is settled.',
      'Honest mistakes are corrected with no penalty. A fake screenshot or a false claim removes the points and makes the player ineligible for the next reward week of that game. A second offence removes the player from Games and blocks the number.',
      'Use a WhatsApp number that works, so Roomly can reach you. An account whose number is not on WhatsApp and that keeps losing to the same few players can be removed. The points other players earned against a removed account are removed too.',
    ],
  },
];

/* ------------------------------ seasons ------------------------------ */

export type Season = { id: string; name: string; session?: string; autoJoin?: boolean; startMs: number; endMs: number; createdAtMs?: number; champions?: Record<string, any> };

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

/** Has this player accepted the rules for the season? (Roomly may add players first; they accept on first open.) */
export const rulesAccepted = (join: any) => Boolean(join && Number(join.rulesVersion || 0) >= 1);
/** A player Roomly added to the season ticks the rules to complete their entry */
export async function acceptRules(join: any, season: Season, me: any) {
  await hubUid();
  await updateDoc(doc(hubDb, 'seasonJoins', join.id), { rulesVersion: RULES_VERSION, rulesAtMs: Date.now() });
  await syncOpen(me, season, { ...join, rulesVersion: RULES_VERSION }, null);
}

/** Anyone in the league who has accepted the rules can be challenged. (Added by Roomly but not accepted yet: on the table, not challengeable.) */
export function isChallengeable(join: any, _game?: string, _rewardJoined = false): boolean {
  return Boolean(join && Number(join.rulesVersion || 0) >= 1);
}

const CONTACT_DAYS = 400;
/** Other players read a phone number only while this is in the future (see the gamerContact rule) */
async function syncOpen(me: any, season: Season, join: any, week: any | null) {
  // A league member's number can be opened for a long time ahead, so postponing a league or starting the next one never breaks challenges
  const until = isChallengeable(join) ? Date.now() + CONTACT_DAYS * 86400000 : Math.max(0, week ? Number(week.endMs) : 0);
  await updateDoc(doc(hubDb, 'gamerContact', me.id), { readyUntil: until, atMs: Date.now() }).catch(() => {});
}

/** Renew a league member's contact date when they open Games (at most once a day per browser) */
export async function refreshContact(me: any, season: Season, join: any) {
  if (!me || !isChallengeable(join)) return;
  const key = `roomly_contact_${me.id}`;
  try {
    if (Date.now() - Number(localStorage.getItem(key) || 0) < 86400000) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {}
  await hubUid();
  await syncOpen(me, season, join, null);
}

/** Switch "challengeable" on or off for one game (no longer used by the app) */
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
    query(collection(hubDb, 'rewardRegs'), where('seasonId', '==', seasonId)),
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

/** Register once for a game's reward contest (after reading its reward rules). Counts toward the players needed to start a week. */
export async function registerReward(season: Season, me: any, join: any, game: string, week: any | null = null) {
  const uid = await hubUid();
  if (!rulesAccepted(join)) throw new Error('Accept the league rules first.');
  if (me.rewardBlocked && me.rewardBlocked[game]) throw new Error('You cannot join this reward contest. Roomly can tell you why.');
  await setDoc(doc(hubDb, 'rewardRegs', `${season.id}_${me.id}_${game}`), {
    seasonId: season.id,
    game,
    gid: me.id,
    ownerUid: uid,
    name: me.name,
    rulesVersion: RULES_VERSION,
    atMs: Date.now(),
  });
  await syncOpen(me, season, join, week);
  updateDoc(doc(hubDb, 'gamers', me.id), { lastActiveMs: Date.now() }).catch(() => {});
}

/** Shown on the reward card: what the settings say for this game */
export const rewardConfig = (config: any, game: string) => rewardConfigFor(config, game);

/* ------------------------------ rules for one game ------------------------------ */

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
/** League rules for one game only */
export function leagueRulesFor(game: string): string[] {
  const label = gameLabel(game);
  const scored = isScored(game);
  return [
    `The ${label} table ranks players by points: a win is 3${scored ? ', a draw is 1' : ''} and a loss is 0.`,
    scored
      ? 'Players on the same points are ranked by wins, then goals scored, then kills, then whoever reached their points first.'
      : 'Players on the same points are ranked by wins, then damage, then kills, then whoever reached their points first.',
    scored
      ? 'The winner enters the result with the score and a screenshot of the final score. A draw can be entered by either player.'
      : 'The winner enters the result with their kills, damage and a screenshot of the final result.',
    'League matches only count in the league table. Between the same two players, at most 4 count per week (2 home and 2 away). Extra matches do not count.',
    'Your opponent confirms the result or reports it within 24 hours. If nobody answers for 24 hours it is confirmed automatically.',
    'Tap a player on the table, then Schedule 1v1, to message them on WhatsApp. Use Report if someone behaves badly.',
  ];
}
/** The short version shown open on the game page: the main league rules for one game */
export function leagueMainRulesFor(game: string): string[] {
  return [
    `A win is 3 points${isScored(game) ? ', a draw is 1' : ''} and a loss is 0. The player at the top of the league table is the Best in Caritas for ${gameLabel(game)}.`,
    'Schedule a match with your opponent. The winner logs the result with a screenshot, and the opponent can dispute it within 24 hours.',
    'You can play the same opponent up to 4 times a week: 2 at home and 2 away.',
    'Matches played for the weekly food credit are separate. They do not add points to the league.',
  ];
}
/** The one-line headline of the weekly food credit contest */
export function rewardHeadlineFor(cfg: { minPoints: number; creditValue: number }): string {
  return `Free ${naira(cfg.creditValue)} food credit every week for the top 3 players, with at least ${cfg.minPoints} points.`;
}
/** The short, plain version of the reward contest rules, shown on the game cards. The full rules (rewardRulesFor) are what players accept when they register. */
export function rewardShortRulesFor(cfg: { minPlayers: number }): string[] {
  return [
    `One game runs the contest each week. The first game to get ${cfg.minPlayers} registered players starts it at the next 12:00AM, and it runs for 7 days.`,
    'Register once and tick the rules. Reward matches count in the weekly reward table only, not in the league. A win is 3 points, a draw is 1 and a loss is 0.',
    'Schedule a match with your opponent. The winner logs the result with a screenshot, and the opponent can dispute it.',
    'You can play the same opponent twice a week: once at home and once away.',
    'Your credit lasts 24 hours once it opens. It works on Outside Food and Canteen Items only, not on delivery.',
    'A fake screenshot removes your points and blocks you from the next reward week of that game.',
  ];
}
/** Reward contest rules for one game only (or the general version when no game is given) */
export function rewardRulesFor(game: string | null, cfg: { minPlayers: number; minPoints: number; creditValue: number }): string[] {
  const label = game ? gameLabel(game) : 'a game';
  return [
    `Reward weeks go one game at a time. The first game to reach ${cfg.minPlayers} registered players starts the week.`,
    `Join the reward contest and tick the rules to register once for the semester. Only registered players count toward the ${cfg.minPlayers} and appear on the reward table.`,
    `The week starts at the next 12:00AM after the game fills and runs 7 days to 12:00AM, when the table closes. Only reward matches entered in that week count, starting from zero. League matches do not add to it.`,
    'Log a reward match from the reward tab. Both players must be registered for this reward contest. Between the same two players, at most 2 matches count in the week (1 home and 1 away).',
    `Points: a win is 3, a draw is 1 and a loss is 0. Ties are broken by wins, then ${game && !isScored(game) ? 'damage' : 'goals or damage'}, then kills, then whoever reached the points first.`,
    `The top 3 players with at least ${cfg.minPoints} points each win a ${naira(cfg.creditValue)} food credit for ${label}. A player below ${cfg.minPoints} points gets nothing and the credit is not passed down.`,
    'Credits are issued when the week closes. A credit opens straight away if all your counted matches are confirmed, otherwise after a reported or waiting match is settled or after 24 hours. It then lasts 24 hours. A credit works on Outside Food and Canteen Items, not on delivery.',
    'Roomly settles disputes. A fake screenshot removes the points and blocks the player from the next reward week of that game.',
  ];
}

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
  { id: 'farming', label: 'Farming or fake points' },
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

export async function adminCreateSeason(name: string, startMs: number, endMs: number, session = '', autoJoin = true) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Give the season a name.');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The end date must be after the start date.');
  const ref = await addDoc(collection(db, 'seasons'), { name: clean, session: String(session || '').trim().slice(0, 20), autoJoin: Boolean(autoJoin), startMs, endMs, createdAtMs: Date.now() });
  return ref.id;
}
export async function adminUpdateSeasonDates(id: string, startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The end date must be after the start date.');
  await updateDoc(doc(db, 'seasons', id), { startMs, endMs });
}
export const SEMESTER_NAMES = ['1st Semester League', '2nd Semester League'];
export async function adminRenameSeason(id: string, name: string) {
  if (!SEMESTER_NAMES.includes(name)) throw new Error('Pick a semester name.');
  await updateDoc(doc(db, 'seasons', id), { name });
}
/** Close the semester right now; the daily job then crowns champions and archives it */
export async function adminEndSeasonNow(id: string, startMs: number) {
  const now = Date.now();
  if (now <= startMs) throw new Error('This semester has not started yet.');
  await updateDoc(doc(db, 'seasons', id), { endMs: now });
}

/** Players on a table: joined the season and play the game */
export function tablePlayers(gamers: any[], joins: any[], game: string) {
  const ids = new Set(joins.map((j) => j.gid));
  return gamers.filter((g) => ids.has(g.id) && g.ownerUid && !g.banned && (g.games || []).includes(game));
}
