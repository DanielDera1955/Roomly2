/**
 * Challenges: admin-made contests inside a game (win N different players, win X of N, and so on).
 * Everything is worked out from the matches players already log, so there is no second place to log.
 * Credits are issued by hand by Roomly after a review. Nothing here pays anyone automatically.
 */
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion } from 'firebase/firestore';
import { hubDb, hubUid, gameLabel, GAMES } from './hub.js';
import { db } from './firebase.ts';
import { matchCounts, matchRecorded, winnerOf, contestOf, AUTO_CONFIRM_HOURS, CREDIT_HOURS } from './boardCore.js';
import { normalizePhone, phoneKey } from './api.js';

const HOUR = 3600000;
const DAY = 86400000;
const LAGOS = HOUR;

/** Midnight (Lagos) at the start of the day that contains ms */
export const lagosDayStart = (ms: number) => Math.floor((Number(ms) + LAGOS) / DAY) * DAY - LAGOS;

/** The challenge templates. 'play' = play N different Caritas players, any result. */
export type TemplateKey = 'first' | 'xofn' | 'play';

export type Challenge = {
  id: string;
  title: string;
  desc: string;
  descSig?: string;
  game: string; // a game id, or 'all' = matches in any game count and the challenge shows in every game
  template: TemplateKey;
  nOpp: number;
  winsReq: number;
  diffOpp: boolean;
  prize: number;
  winners: number;
  startMs: number;
  endMs: number;
  matchesCounted: number; // 0 = every match in the window counts
  spots: number; // 0 = no limit
  dayMode: 'window' | 'pick' | 'fixed';
  fixedDayMs?: number;
  status: 'on' | 'paused' | 'cancelled' | 'ended';
  createdAtMs?: number;
  seasonId?: string;
  winner?: any;
};

export const TEMPLATES: Record<TemplateKey, { label: string; blurb: string; defaults: Partial<Challenge> }> = {
  first: {
    label: 'Win N different players, first to finish',
    blurb: 'Win a set number of different players inside the window. The first player to finish wins.',
    defaults: { template: 'first', nOpp: 20, winsReq: 20, diffOpp: true, prize: 20000, winners: 1, matchesCounted: 0, spots: 0, dayMode: 'window' },
  },
  xofn: {
    label: 'Win X of N different players',
    blurb: 'Play N different players on your day and win X of them. The first player to finish wins.',
    defaults: { template: 'xofn', nOpp: 5, winsReq: 3, diffOpp: true, prize: 5000, winners: 1, matchesCounted: 5, spots: 0, dayMode: 'pick' },
  },
  play: {
    label: 'Play N different players, any result',
    blurb: 'Play a set number of different Caritas players. Wins and losses both count. The first player to finish wins.',
    defaults: { template: 'play', nOpp: 20, winsReq: 20, diffOpp: true, prize: 20000, winners: 1, matchesCounted: 0, spots: 0, dayMode: 'window' },
  },
};

/** 'All games' for a challenge that counts every game, otherwise the game's name */
export const challengeGameLabel = (game?: string) => (game === 'all' ? 'All games' : game ? gameLabel(game) : '');
/** How many wins (or, for the play template, different players) a player needs */
export const targetOf = (c: Partial<Challenge>) => (c.template === 'play' ? Number(c.nOpp) || 1 : Number(c.winsReq) || 1);

const naira = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;

/** The numbers that the rules depend on. A description written for other numbers is flagged. */
export const numbersSig = (c: Partial<Challenge>) =>
  [c.nOpp, c.winsReq, c.diffOpp ? 1 : 0, c.prize, c.winners, c.matchesCounted, c.dayMode].join('|') + (c.template === 'play' ? `|play|${c.game}` : '');

/** The words players read, built from the settings (the admin can rewrite them) */
export function autoDescription(c: Partial<Challenge>): string {
  const n = Number(c.nOpp) || 0;
  const w = Number(c.winsReq) || 0;
  const label = c.game === 'all' ? 'any game' : c.game ? gameLabel(c.game) : 'the game';
  const who = c.diffOpp ? 'different players' : 'players';
  const head = n === w ? `Win ${w} ${who} in ${label}` : `Win ${w} of ${n} ${who} in ${label}`;
  const prize = `${naira(Number(c.prize))} Roomly credit`;
  const winners = Number(c.winners) || 1;
  const first = winners === 1 ? 'The first player to finish wins it, and the challenge ends.' : `The first ${winners} players to finish win it.`;
  const day = c.dayMode === 'pick' ? 'Apply, then pick your day. Your count starts on that day.' : c.dayMode === 'fixed' ? 'Everyone plays on the same day.' : 'Apply, then play any time inside the window.';
  if (c.template === 'play') {
    const where = c.game === 'all' ? 'Counts in every game on Roomly.' : `Counts in ${label}.`;
    const win = winners === 1 ? `The first player to finish wins ${naira(Number(c.prize))}.` : `The first ${winners} players to finish win ${naira(Number(c.prize))} each.`;
    return `**Play ${n} different Caritas students, win or lose.**\n- ${where}\n- ${win}`;
  }
  return `${head} and win ${prize}.\n${first}\n${day}\nLog your matches the normal way. Only matches after you apply count, and your opponent must confirm each win.`;
}

/** The short factual line under the description. The settings are the source of truth. */
export function settingsLine(c: Challenge): string {
  if (c.template === 'play') {
    return [`${c.nOpp} different Caritas players`, 'any result', c.game === 'all' ? 'all games' : '', naira(c.prize), `${c.winners} winner${c.winners === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  }
  const parts = [`${c.winsReq} win${c.winsReq === 1 ? '' : 's'} needed`, c.nOpp === c.winsReq ? '' : `${c.nOpp} opponents`, c.diffOpp ? 'different opponents' : '', c.game === 'all' ? 'all games' : '', naira(c.prize), `${c.winners} winner${c.winners === 1 ? '' : 's'}`];
  if (c.matchesCounted > 0) parts.splice(2, 0, `first ${c.matchesCounted} matches count`);
  return parts.filter(Boolean).join(' · ');
}

/** When one player's count runs: from the later of applying and the start, to the end of their day or the challenge */
export function countingWindow(c: Challenge, app: { appliedAtMs?: number; dayMs?: number } | null) {
  // Play template: everyone in the league is in from the start, there is no sign-up or day to pick
  if (c.template === 'play') return { from: Number(c.startMs), to: Number(c.endMs) };
  const applied = Number(app?.appliedAtMs || 0);
  if (c.dayMode === 'pick' && app?.dayMs) {
    const d = lagosDayStart(Number(app.dayMs));
    return { from: Math.max(applied, d, Number(c.startMs)), to: Math.min(d + DAY, Number(c.endMs)) };
  }
  if (c.dayMode === 'fixed' && c.fixedDayMs) {
    const d = lagosDayStart(Number(c.fixedDayMs));
    return { from: Math.max(applied, d, Number(c.startMs)), to: Math.min(d + DAY, Number(c.endMs)) };
  }
  return { from: Math.max(applied, Number(c.startMs)), to: Number(c.endMs) };
}

export type ChallengeRow = {
  id: string;
  oppId: string;
  oppName: string;
  game: string;
  late: boolean; // the opponent registered after the challenge started (flagged for review, still counts in the play template)
  result: 'W' | 'L' | 'D';
  score: string;
  loggedAtMs: number;
  recorded: boolean;
  confirmedMs: number;
  status: string;
};
export type Progress = {
  rows: ChallengeRow[];
  wins: number;
  state: 'notstarted' | 'playing' | 'waiting' | 'finished' | 'out' | 'over' | 'rejected' | 'won';
  finishAtMs: number;
  from: number;
  to: number;
  skipped: number; // matches in the window that did not count (repeat opponent, over the limit, opponent registered late)
  late: number; // counted opponents who registered after the start
};

const confirmedAt = (m: any) => (m.status === 'confirmed' ? Number(m.confirmedAtMs || m.loggedAtMs || 0) : Number(m.loggedAtMs || 0) + AUTO_CONFIRM_HOURS * HOUR);

/** How one player stands in one challenge. Only normally logged league matches count, in the order they were logged.
 *  Play template: every result counts, once per opponent, and only Caritas opponents count.
 *  Game 'all': matches in any game count and each opponent counts once overall. */
export function progressFor(c: Challenge, app: any, matches: any[], gamers: any[], nowMs = Date.now()): Progress {
  const { from, to } = countingWindow(c, app);
  const isPlay = c.template === 'play';
  const anyGame = c.game === 'all';
  const voided = new Set<string>(app?.voided || []);
  const gamerById = new Map<string, any>(gamers.map((g: any) => [g.id, g]));
  const regOf = (id: string) => Number(gamerById.get(id)?.createdAtMs || 0);
  const mine = (matches || [])
    .filter(
      (m) =>
        (anyGame || m.game === c.game) &&
        matchCounts(m) &&
        contestOf(m) === 'league' &&
        (m.aUid === app.gid || m.bUid === app.gid) &&
        Number(m.loggedAtMs || 0) >= from &&
        Number(m.loggedAtMs || 0) < to &&
        !voided.has(m.id)
    )
    .sort((a, b) => Number(a.loggedAtMs || 0) - Number(b.loggedAtMs || 0));
  let skipped = 0;
  const seen = new Set<string>();
  const kept: any[] = [];
  mine.forEach((m) => {
    const oppId = m.aUid === app.gid ? m.bUid : m.aUid;
    if (isPlay) {
      // Only Caritas opponents count. Profiles saved before schools were recorded count as Caritas. Guests and other schools do not.
      const opp = gamerById.get(oppId);
      if (!opp || (opp.school || 'caritas') !== 'caritas') {
        skipped++;
        return;
      }
    } else {
      // The opponent must have registered before the challenge started
      const reg = regOf(oppId);
      if (reg && reg > Number(c.startMs)) {
        skipped++;
        return;
      }
    }
    if ((c.diffOpp || isPlay) && seen.has(oppId)) {
      skipped++;
      return;
    }
    seen.add(oppId);
    kept.push(m);
  });
  const counted = isPlay ? kept.slice(0, Number(c.nOpp) || 1) : c.matchesCounted > 0 ? kept.slice(0, c.matchesCounted) : kept;
  skipped += kept.length - counted.length;
  const rows: ChallengeRow[] = counted.map((m) => {
    const w = winnerOf(m);
    const oppId = m.aUid === app.gid ? m.bUid : m.aUid;
    const reg = regOf(oppId);
    return {
      id: m.id,
      oppId,
      oppName: m.aUid === app.gid ? m.bName : m.aName,
      game: m.game,
      late: reg > 0 && reg > Number(c.startMs),
      result: !w ? 'D' : w === app.gid ? 'W' : 'L',
      score: m.aUid === app.gid ? `${m.scoreA}-${m.scoreB}` : `${m.scoreB}-${m.scoreA}`,
      loggedAtMs: Number(m.loggedAtMs || 0),
      recorded: matchRecorded(m, nowMs),
      confirmedMs: confirmedAt(m),
      status: m.status,
    };
  });
  const winRows = rows.filter((r) => r.result === 'W');
  const need = targetOf(c);
  // What counts toward the target: wins, or in the play template every counted match (any result)
  const pool = isPlay ? rows : winRows;
  const winning = pool.slice(0, need);
  let state: Progress['state'] = 'playing';
  let finishAtMs = 0;
  if (pool.length >= need) {
    if (winning.every((r) => r.recorded)) {
      state = 'finished';
      finishAtMs = Math.max(...winning.map((r) => r.confirmedMs));
    } else state = 'waiting';
  } else if (!isPlay && c.matchesCounted > 0 && winRows.length + (c.matchesCounted - rows.length) < need) {
    state = 'out';
  } else if (nowMs >= to) {
    state = 'over';
  } else if (nowMs < from) {
    state = 'notstarted';
  }
  return { rows, wins: pool.length, state, finishAtMs, from, to, skipped, late: rows.filter((r) => r.late).length };
}

/** The player furthest along: one per game for an all-games challenge, otherwise one for the challenge */
export type Leader = { game: string; gid: string; name: string; count: number; target: number; tiedGids: string[]; tiedNames: string[] };

export type ChallengeView = {
  challenge: Challenge;
  leaders: Leader[];
  entries: { app: any; progress: Progress }[];
  finishers: { app: any; progress: Progress }[]; // finished and not rejected, first to finish first
  winnerSlots: { app: any; progress: Progress; approved: boolean }[];
  found: boolean; // enough finishers: new attempts are closed
  done: boolean; // every winner approved: the challenge has ended
  phase: 'upcoming' | 'running' | 'closed' | 'ended' | 'paused' | 'cancelled' | 'over';
};

/** The full picture of one challenge */
export function viewChallenge(c: Challenge, apps: any[], matches: any[], gamers: any[], nowMs = Date.now()): ChallengeView {
  const mineApps = apps.filter((a) => a.challengeId === c.id);
  const entries = mineApps.map((app) => ({ app, progress: progressFor(c, app, matches, gamers, nowMs) }));
  if (c.template === 'play') {
    // No sign-up: every Caritas player in the league is a contestant. They appear once they have a counted match.
    const have = new Set(mineApps.map((a) => a.gid));
    gamers.forEach((g: any) => {
      if (have.has(g.id) || g.banned || (g.school || 'caritas') !== 'caritas' || !(g.games || []).length) return;
      const app = { id: `${c.id}_${g.id}`, challengeId: c.id, gid: g.id, ownerUid: g.ownerUid || '', game: c.game, name: g.name, appliedAtMs: Number(c.startMs), review: '', voided: [] as string[], virtual: true };
      const progress = progressFor(c, app, matches, gamers, nowMs);
      if (progress.rows.length > 0) entries.push({ app, progress });
    });
  }
  const finishers = entries
    .filter((e) => e.progress.state === 'finished' && e.app.review !== 'rejected')
    .sort((a, b) => a.progress.finishAtMs - b.progress.finishAtMs);
  const slots = finishers.slice(0, Math.max(1, Number(c.winners) || 1)).map((e) => ({ ...e, approved: e.app.review === 'approved' }));
  const found = finishers.length >= Math.max(1, Number(c.winners) || 1);
  const done = found && slots.every((s) => s.approved);
  // Leaders for the progress bars: most counted so far (wins, or players met). For all games: the most matches in each game.
  const target = targetOf(c);
  const live = entries.filter((e) => e.app.review !== 'rejected' && e.progress.wins > 0);
  const lastMs = (e: any) => Number(e.progress.rows[e.progress.rows.length - 1]?.loggedAtMs || 0);
  const pick = (g: string) => {
    let best: any = null;
    let bestN = 0;
    live.forEach((e) => {
      const n = g === '*' ? e.progress.wins : e.progress.rows.filter((r: any) => r.game === g).length;
      if (n <= 0) return;
      if (!best || n > bestN || (n === bestN && (e.progress.wins > best.progress.wins || (e.progress.wins === best.progress.wins && lastMs(e) < lastMs(best))))) {
        best = e;
        bestN = n;
      }
    });
    if (!best) return null;
    // Anyone level with the leader on both counts is tied with them
    const ties = live.filter((e) => e !== best && (g === '*' ? e.progress.wins : e.progress.rows.filter((r: any) => r.game === g).length) === bestN && e.progress.wins === best.progress.wins);
    return { best, ties };
  };
  const mk = (game: string, p: { best: any; ties: any[] }): Leader => ({ game, gid: p.best.app.gid, name: p.best.app.name, count: p.best.progress.wins, target, tiedGids: p.ties.map((e) => e.app.gid), tiedNames: p.ties.map((e) => e.app.name) });
  const leaders: Leader[] = [];
  if (c.game === 'all') {
    (GAMES as any[]).forEach((g: any) => {
      const b = pick(g.id);
      if (b) leaders.push(mk(g.id, b));
    });
  } else {
    const b = pick('*');
    if (b) leaders.push(mk(c.game, b));
  }
  let phase: ChallengeView['phase'] = 'running';
  if (c.status === 'cancelled') phase = 'cancelled';
  else if (c.status === 'paused') phase = 'paused';
  else if (c.status === 'ended' || done) phase = 'ended';
  else if (found) phase = 'closed';
  else if (nowMs >= Number(c.endMs)) phase = 'over';
  else if (nowMs < Number(c.startMs)) phase = 'upcoming';
  return { challenge: c, leaders, entries, finishers, winnerSlots: slots, found, done, phase };
}

/** Can a new player still apply? */
export const canApply = (v: ChallengeView, nowMs = Date.now()) =>
  v.challenge.template !== 'play' && ['upcoming', 'running'].includes(v.phase) && nowMs < Number(v.challenge.endMs) && (v.challenge.spots <= 0 || v.entries.length < v.challenge.spots);

/** The challenge a player is in for a game right now (one at a time per game; an all-games challenge counts for every game) */
export const activeEntryFor = (views: ChallengeView[], gid: string, game: string) =>
  views.find((v) => v.challenge.template !== 'play' && (v.challenge.game === game || v.challenge.game === 'all' || game === 'all') && ['upcoming', 'running', 'closed'].includes(v.phase) && v.entries.some((e) => e.app.gid === gid)) || null;

/** The days a player can pick inside the window (Lagos days, today first, up to 7) */
export function pickableDays(c: Challenge, nowMs = Date.now()): number[] {
  const first = Math.max(lagosDayStart(nowMs), lagosDayStart(Number(c.startMs)));
  const out: number[] = [];
  for (let d = first; d < Number(c.endMs) && out.length < 7; d += DAY) out.push(d);
  return out;
}

/** Number shown on the green badge: challenges the player can still join (or all open ones when not signed in) */
export function badgeCount(views: ChallengeView[], game: string, gid: string | null, nowMs = Date.now()): number {
  return views.filter((v) => {
    if (!(v.challenge.game === game || v.challenge.game === 'all')) return false;
    // The play challenge has no sign-up: it counts while it is open
    if (v.challenge.template === 'play') return ['upcoming', 'running'].includes(v.phase);
    return canApply(v, nowMs) && !(gid && v.entries.some((e) => e.app.gid === gid));
  }).length;
}

/* ------------------------------ player side ------------------------------ */

export function subscribeChallenges(cb: (list: Challenge[]) => void) {
  return onSnapshot(
    collection(hubDb, 'challenges'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => Number(b.startMs || 0) - Number(a.startMs || 0))),
    () => cb([])
  );
}
export function subscribeChallengeApps(cb: (list: any[]) => void) {
  return onSnapshot(
    collection(hubDb, 'challengeApps'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

/** Apply to a challenge. One challenge at a time per game, and the spot limit, are checked here before saving. */
export async function applyChallenge(view: ChallengeView, all: ChallengeView[], me: any, dayMs: number) {
  const c = view.challenge;
  if (c.template === 'play') throw new Error('No sign-up needed. Everyone in the league is already in this challenge.');
  const uid = await hubUid();
  if (!me || !me.id) throw new Error('Register as a player first.');
  if (!canApply(view)) throw new Error('This challenge is closed.');
  if (c.game === 'all' && !(me.games || []).length) throw new Error('Join a game first.');
  if (c.dayMode === 'pick' && !(dayMs >= lagosDayStart(Date.now()) && dayMs < Number(c.endMs))) throw new Error('Pick a day inside the challenge window.');
  const mine = activeEntryFor(all, me.id, c.game);
  if (mine && mine.challenge.id !== c.id) throw new Error(`You are already in "${mine.challenge.title}". Finish it before joining another challenge.`);
  const now = Date.now();
  const w = countingWindow(c, { appliedAtMs: now, dayMs });
  await setDoc(doc(hubDb, 'challengeApps', `${c.id}_${me.id}`), {
    challengeId: c.id,
    gid: me.id,
    ownerUid: uid,
    game: c.game,
    name: me.name,
    dayMs: c.dayMode === 'pick' ? lagosDayStart(dayMs) : 0,
    startCountMs: w.from,
    appliedAtMs: now,
    rescheduled: false,
    review: '',
    voided: [],
  });
}
/** One reschedule, before the day starts */
export async function rescheduleApp(app: any, dayMs: number) {
  await hubUid();
  await updateDoc(doc(hubDb, 'challengeApps', app.id), { dayMs: lagosDayStart(dayMs), startCountMs: lagosDayStart(dayMs), rescheduled: true });
}
export async function withdrawApp(app: any) {
  await hubUid();
  await deleteDoc(doc(hubDb, 'challengeApps', app.id));
}

/* ------------------------------ admin side ------------------------------ */

export async function saveChallenge(data: Partial<Challenge>, id?: string) {
  const title = String(data.title || '').trim().slice(0, 80);
  if (!title) throw new Error('Give the challenge a title.');
  if (!data.game) throw new Error('Pick a game.');
  const template = (['first', 'xofn', 'play'].includes(String(data.template)) ? data.template : 'first') as TemplateKey;
  const isPlay = template === 'play';
  const nOpp = Math.round(Number(data.nOpp));
  // Play template: the target is the number of different players, so wins required is not used
  const winsReq = isPlay ? nOpp : Math.round(Number(data.winsReq));
  if (!(nOpp >= 1) || !(winsReq >= 1)) throw new Error('Opponents and wins must be at least 1.');
  if (winsReq > nOpp) throw new Error('Wins required cannot be more than the opponents to play.');
  const prize = Math.round(Number(data.prize));
  if (!(prize >= 0)) throw new Error('Enter the prize amount.');
  const winners = Math.max(1, Math.round(Number(data.winners) || 1));
  const startMs = Number(data.startMs);
  const endMs = Number(data.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The end must be after the start.');
  const matchesCounted = isPlay ? 0 : Math.max(0, Math.round(Number(data.matchesCounted) || 0));
  if (matchesCounted > 0 && matchesCounted < winsReq) throw new Error('Matches that count cannot be fewer than the wins required.');
  const clean: any = {
    title,
    desc: String(data.desc || '').slice(0, 1500),
    descSig: String(data.descSig || ''),
    game: data.game,
    template,
    nOpp,
    winsReq,
    diffOpp: isPlay ? true : Boolean(data.diffOpp),
    prize,
    winners,
    startMs,
    endMs,
    matchesCounted,
    spots: isPlay ? 0 : Math.max(0, Math.round(Number(data.spots) || 0)),
    dayMode: isPlay ? 'window' : ['window', 'pick', 'fixed'].includes(String(data.dayMode)) ? data.dayMode : 'window',
    fixedDayMs: !isPlay && data.dayMode === 'fixed' ? lagosDayStart(Number(data.fixedDayMs || startMs)) : 0,
    seasonId: data.seasonId || '',
  };
  if (id) {
    await updateDoc(doc(db, 'challenges', id), clean);
    return id;
  }
  const ref = await addDoc(collection(db, 'challenges'), { ...clean, status: 'on', createdAtMs: Date.now() });
  return ref.id;
}
export async function setChallengeStatus(id: string, status: 'on' | 'paused' | 'cancelled') {
  await updateDoc(doc(db, 'challenges', id), { status });
}
export async function removeChallenge(c: Challenge, apps: any[]) {
  await Promise.all(apps.filter((a) => a.challengeId === c.id).map((a) => deleteDoc(doc(db, 'challengeApps', a.id))));
  await deleteDoc(doc(db, 'gameWinners', `challenge_${c.id}`)).catch(() => {});
  await deleteDoc(doc(db, 'challenges', c.id));
}
/** Write to a contestant's record. A play-template contestant has no record until Roomly first acts on it, so it is created then. */
async function writeApp(app: any, data: any) {
  const ref = doc(db, 'challengeApps', app.id);
  if (!app.virtual) return updateDoc(ref, data);
  await setDoc(
    ref,
    { challengeId: app.challengeId, gid: app.gid, ownerUid: app.ownerUid || '', game: app.game, name: app.name, appliedAtMs: Number(app.appliedAtMs || 0), review: '', voided: [], ...data },
    { merge: true }
  );
}
/** Approve or reject a finisher. When every winner slot is approved the challenge ends and the winner line is published. */
export async function reviewApp(view: ChallengeView, app: any, decision: 'approved' | 'rejected' | '', note = '') {
  const c = view.challenge;
  await writeApp(app, { review: decision, reviewNote: String(note || '').slice(0, 200), reviewedAtMs: Date.now() });
  if (decision === 'approved') {
    const slotIds = view.winnerSlots.map((s) => s.app.id);
    const approvedAfter = view.winnerSlots.every((s) => s.app.id === app.id || s.app.review === 'approved');
    if (slotIds.includes(app.id) && approvedAfter) {
      const winnersText = view.winnerSlots.map((s) => s.app.name).join(', ');
      await updateDoc(doc(db, 'challenges', c.id), { status: 'ended', winner: { gids: view.winnerSlots.map((s) => s.app.gid), names: winnersText, atMs: Date.now() } });
      await setDoc(doc(db, 'gameWinners', `challenge_${c.id}`), {
        kind: 'challenge',
        game: c.game,
        ref: c.id,
        gid: app.gid,
        name: winnersText,
        text: `${winnersText} won "${c.title}"`,
        value: c.prize,
        atMs: Date.now(),
      });
    }
  } else {
    // A challenge that ended by mistake reopens when an approval is taken back
    if (c.status === 'ended') {
      await updateDoc(doc(db, 'challenges', c.id), { status: 'on', winner: null });
      await deleteDoc(doc(db, 'gameWinners', `challenge_${c.id}`)).catch(() => {});
    }
  }
}
/** Take a match out of one player's challenge only (it still counts in the league) */
export async function voidFromChallenge(app: any, matchId: string) {
  await writeApp(app, { voided: arrayUnion(matchId) });
}
export async function unvoidFromChallenge(app: any, matchId: string) {
  const left = (app.voided || []).filter((x: string) => x !== matchId);
  await writeApp(app, { voided: left });
}
/** Void the match everywhere: its points leave the league and the weekly table too */
export async function voidMatch(matchId: string) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'void', voidedAtMs: Date.now() });
}
/** Credit for a challenge prize. Only Roomly issues it, after the review. Opens now and lasts 48 hours. */
export async function issueChallengeCredit(c: Challenge, app: any, phone: string) {
  const p = normalizePhone(phone || '');
  if (!p) throw new Error('No phone number saved for this player.');
  const pk = await phoneKey(p);
  const now = Date.now();
  const id = `${c.id}_${app.gid}_m${now}`;
  await setDoc(doc(db, 'credits', id), {
    pk,
    gid: app.gid,
    name: app.name,
    game: c.game,
    weekKey: c.id,
    seasonId: c.seasonId || '',
    kind: 'challenge',
    reason: `Challenge: ${c.title}`.slice(0, 120),
    rank: 0,
    value: Number(c.prize),
    issuedAtMs: now,
    validFromMs: now,
    expiresAtMs: now + CREDIT_HOURS * HOUR,
    status: 'active',
    usedOrderId: '',
    usedAtMs: 0,
    manual: true,
  });
  await setDoc(doc(db, 'creditIndex', pk), { ids: arrayUnion(id) }, { merge: true });
  await writeApp(app, { paidAtMs: now, paidValue: Number(c.prize) });
}
export async function getChallengeApp(id: string) {
  const s = await getDoc(doc(hubDb, 'challengeApps', id));
  return s.exists() ? { id: s.id, ...(s.data() as any) } : null;
}
