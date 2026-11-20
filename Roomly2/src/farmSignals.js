/**
 * Farm control: signals that point at fake or fed points. Pure code (no Firebase), used by the admin Players list.
 * Nothing here bans anyone. It adds up a suspicion score and flags, and the admin decides.
 *
 * Signals (weights add up to the score, capped at 100):
 *   same number on several accounts           30
 *   losing streak, number not on WhatsApp      40   (confirmed by the admin by trying the number)
 *   losing streak, number not checked yet      15   (check the number first)
 *   several one-opponent accounts feed a player 35 (3 or more) or 15 (2)
 *   results logged minutes apart               15 for each pair, up to 30
 *   most points from one opponent              10
 *   only ever played one opponent              10
 */
import { capPairs, matchCounts, winnerOf, POINTS } from './boardCore.js';

export const BURST_MINUTES = 6;
export const STREAK_FLAG = 3;
export const STREAK_REMOVE = 5;
/** A player is "flagged" in the admin list from this score */
export const FLAG_SCORE = 25;

const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const nameOf = (gamers, id) => (gamers.find((g) => g.id === id) || {}).name || 'Unknown';

/** Everyone a player met this season: who, how many counted matches, and the points they won from this player */
export function opponentsOf(gid, matches, gamers) {
  const by = {};
  capPairs((matches || []).filter(matchCounts)).forEach((m) => {
    if (m.aUid !== gid && m.bUid !== gid) return;
    const opp = m.aUid === gid ? m.bUid : m.aUid;
    const o = (by[opp] = by[opp] || { id: opp, name: nameOf(gamers, opp), matches: 0, won: 0, pts: 0 });
    o.matches++;
    const w = winnerOf(m);
    if (w === opp) {
      o.won++;
      o.pts += POINTS.win;
    } else if (w === '') {
      o.pts += POINTS.draw;
    }
  });
  return Object.values(by).sort((a, b) => b.matches - a.matches);
}

/** The current run of losses in one game (the latest results, a draw or a win ends the run) */
function lossRun(gid, game, list) {
  const mine = list
    .filter((m) => m.game === game && (m.aUid === gid || m.bUid === gid))
    .sort((a, b) => Number(b.loggedAtMs || 0) - Number(a.loggedAtMs || 0));
  const run = [];
  for (const m of mine) {
    const w = winnerOf(m);
    if (w && w !== gid) run.push(m.aUid === gid ? m.bUid : m.aUid);
    else break;
  }
  return run;
}

/**
 * gamers: all gamer profiles; matches: this season's matches (any game, any status); phones: Map gid -> phone.
 * Returns a Map gid -> { score, flagged, flags: [{ key, text, level }], streak, removable, dupWith }
 */
export function farmSignals(gamers, matches, phones) {
  const counted = capPairs((matches || []).filter(matchCounts));
  const out = new Map();
  const get = (id) => {
    if (!out.has(id)) out.set(id, { score: 0, flagged: false, flags: [], streak: 0, streakGame: '', streakTo: [], removable: false, dupWith: [] });
    return out.get(id);
  };
  const add = (id, key, text, level, weight) => {
    const r = get(id);
    r.flags.push({ key, text, level });
    r.score += weight;
  };

  // 1. Same number on several accounts
  const byPhone = {};
  (gamers || []).forEach((g) => {
    const p = digits(phones && phones.get(g.id));
    if (p.length >= 10) byPhone[p] = [...(byPhone[p] || []), g];
  });
  Object.values(byPhone).forEach((list) => {
    if (list.length < 2) return;
    list.forEach((g) => {
      const r = get(g.id);
      r.dupWith = list.filter((x) => x.id !== g.id).map((x) => x.name);
      add(g.id, 'dup', `Same number on ${list.length} accounts`, 'high', 30);
    });
  });

  // 2. Opponent spread: who each player met
  const met = {};
  const meet = (x, y) => {
    met[x] = met[x] || {};
    met[x][y] = (met[x][y] || 0) + 1;
  };
  counted.forEach((m) => {
    meet(m.aUid, m.bUid);
    meet(m.bUid, m.aUid);
  });
  const feeders = {};
  Object.keys(met).forEach((id) => {
    const opps = Object.keys(met[id]);
    if (opps.length !== 1) return;
    const only = opps[0];
    add(id, 'only', `Only ever played ${nameOf(gamers, only)}`, 'low', 10);
    // a thin account that LOST to that one opponent is feeding them points
    const lostToOnly = counted.some((m) => (m.aUid === id || m.bUid === id) && winnerOf(m) === only);
    if (lostToOnly) feeders[only] = [...(feeders[only] || []), id];
  });
  Object.keys(feeders).forEach((id) => {
    const n = feeders[id].length;
    if (n >= 3) add(id, 'feeder', `${n} accounts that only played this player lost to them`, 'high', 35);
    else if (n === 2) add(id, 'feeder', '2 accounts that only played this player lost to them', 'mid', 15);
  });

  // 3. Points from one opponent
  const gained = {};
  counted.forEach((m) => {
    const w = winnerOf(m);
    const give = (id, opp, pts) => {
      const g = (gained[id] = gained[id] || { total: 0, by: {} });
      g.total += pts;
      g.by[opp] = (g.by[opp] || 0) + pts;
    };
    if (w) give(w, w === m.aUid ? m.bUid : m.aUid, POINTS.win);
    else {
      give(m.aUid, m.bUid, POINTS.draw);
      give(m.bUid, m.aUid, POINTS.draw);
    }
  });
  Object.keys(gained).forEach((id) => {
    const g = gained[id];
    if (g.total < 9) return;
    const [opp, pts] = Object.entries(g.by).sort((a, b) => b[1] - a[1])[0];
    if (pts / g.total > 0.5) add(id, 'concentration', `${Math.round((pts / g.total) * 100)}% of points came from ${nameOf(gamers, opp)}`, 'low', 10);
  });

  // 4. Results logged minutes apart by the same player
  const loggedBy = {};
  counted.forEach((m) => (loggedBy[m.aUid] = [...(loggedBy[m.aUid] || []), Number(m.loggedAtMs || 0)]));
  Object.keys(loggedBy).forEach((id) => {
    const t = loggedBy[id].sort((a, b) => a - b);
    let pairs = 0;
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] < BURST_MINUTES * 60000) pairs++;
    if (pairs > 0) add(id, 'burst', `${pairs} ${pairs === 1 ? 'result' : 'results'} logged less than ${BURST_MINUTES} minutes after another`, pairs >= 2 ? 'mid' : 'low', Math.min(30, pairs * 15));
  });

  // 5. Losing streak. With the number marked "not on WhatsApp" it is the strong flag; unchecked it asks the admin to check.
  (gamers || []).forEach((g) => {
    const contacted = g.contacted || {};
    if (contacted.numberChecked) return; // the admin confirmed the number works
    let best = { len: 0, game: '', to: [] };
    ['efootball', 'fifa', 'dls', 'freefire', 'codm'].forEach((game) => {
      const run = lossRun(g.id, game, counted);
      if (run.length > best.len) best = { len: run.length, game, to: run };
    });
    if (best.len < STREAK_FLAG) return;
    const tally = {};
    best.to.forEach((o) => (tally[o] = (tally[o] || 0) + 1));
    const distinct = Object.keys(tally);
    const top2 = Object.values(tally).sort((a, b) => b - a).slice(0, 2).reduce((t, n) => t + n, 0);
    const mostly = distinct.length <= 2 || (best.len >= STREAK_REMOVE && top2 / best.len >= 0.8);
    if (!mostly) return;
    const noWa = Boolean(contacted.noWa);
    const r = get(g.id);
    r.streak = best.len;
    r.streakGame = best.game;
    r.streakTo = distinct.map((id) => nameOf(gamers, id));
    r.removable = noWa && best.len >= STREAK_REMOVE;
    const who = r.streakTo.join(' and ');
    add(
      g.id,
      'streak',
      noWa ? `Number not on WhatsApp, ${best.len} losses in a row, mostly to ${who}` : `${best.len} losses in a row, mostly to ${who}. Check the number on WhatsApp`,
      noWa ? 'high' : 'mid',
      noWa ? 40 : 15
    );
  });

  out.forEach((r) => {
    r.score = Math.min(100, r.score);
    r.flagged = r.score >= FLAG_SCORE;
    const rank = { high: 0, mid: 1, low: 2 };
    r.flags.sort((a, b) => rank[a.level] - rank[b.level]);
  });
  return out;
}
