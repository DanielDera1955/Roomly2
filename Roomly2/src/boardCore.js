/**
 * Games: pure rules shared by the app and the daily server job (no Firebase, no browser code here).
 * Points, tie-breaks, the weekly pair caps, reward week windows and the top 3 that earn credits.
 */

export const GAME_IDS = ['efootball', 'fifa', 'dls', 'freefire', 'codm'];
/** Football games are scored (draws possible); the others are win or lose */
export const SCORED_GAMES = ['efootball', 'fifa', 'dls'];
export const POINTS = { win: 3, draw: 1, loss: 0 };

/** A result counts at once. After this long with no answer it shows as "recorded". */
export const AUTO_CONFIRM_HOURS = 24;
/** The player who logged a result can take it back for this long, and only while it is their latest result */
export const TAKEBACK_MINUTES = 10;
/** The opponent can report a result for this long after it was entered, then it locks */
export const DISPUTE_HOURS = 24;
/** At most this many matches count between the same two players in one week: league 4 (2 home, 2 away), reward 2 (1 home, 1 away) */
export const MAX_PAIR_LEAGUE_WEEK = 4;
export const MAX_PAIR_REWARD_WEEK = 2;

const HOUR = 3600000;
const DAY = 86400000;
/** Lagos is always UTC+1 (no daylight saving) */
const LAGOS = HOUR;

export const isScored = (game) => SCORED_GAMES.includes(game);

/** Per-game reward settings. The admin changes them; a change applies from the next reward week. */
export const DEFAULT_REWARD_CONFIG = { minPlayers: 20, minPoints: 21, creditValue: 3500 };
export function rewardConfigFor(settings, game) {
  const c = (settings && settings.perGame && settings.perGame[game]) || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);
  return {
    minPlayers: num(c.minPlayers, DEFAULT_REWARD_CONFIG.minPlayers),
    minPoints: num(c.minPoints, DEFAULT_REWARD_CONFIG.minPoints),
    creditValue: num(c.creditValue, DEFAULT_REWARD_CONFIG.creditValue),
  };
}

/** Day number in Lagos time (changes at 12:00AM Lagos) */
export const lagosDay = (ms) => Math.floor((Number(ms) + LAGOS) / DAY);
/** The next Monday 12:00AM Lagos strictly after this moment, as a timestamp */
export function nextMondayStart(nowMs) {
  const lagos = Number(nowMs) + LAGOS;
  const dow = new Date(lagos).getUTCDay(); // 0 Sunday ... 6 Saturday, in Lagos time
  const ahead = (8 - dow) % 7 || 7;
  const startOfDay = Math.floor(lagos / DAY) * DAY;
  return startOfDay + ahead * DAY - LAGOS;
}
export const WEEK_MS = 7 * DAY;

/** Does this player take part in this game (registered, not banned, has the game on their profile)? */
export const playsGame = (g, game) => Boolean(g && !g.banned && g.ownerUid && (g.games || []).includes(game));

/** Points count at once. A report removes the match until Roomly decides; a cancelled or void match never counts. */
export const matchCounts = (m) => Boolean(m) && (m.status === 'pending' || m.status === 'confirmed');
/** Confirmed, or nobody answered for 24 hours: shown as "recorded" */
export const matchRecorded = (m, nowMs = Date.now()) =>
  Boolean(m) && (m.status === 'confirmed' || (m.status === 'pending' && nowMs - Number(m.loggedAtMs || 0) >= AUTO_CONFIRM_HOURS * HOUR));
/** Reports are allowed until 24 hours after entry, then the result locks */
export const canDispute = (m, nowMs = Date.now()) =>
  Boolean(m) && (m.status === 'pending' || m.status === 'confirmed') && nowMs - Number(m.loggedAtMs || 0) < DISPUTE_HOURS * HOUR;

/** Take it back: my pending result, under 10 minutes old, and no newer result of mine after it */
export const canTakeBack = (m, all, meId, nowMs = Date.now()) =>
  Boolean(m) &&
  m.status === 'pending' &&
  m.aUid === meId &&
  nowMs - Number(m.loggedAtMs || 0) < TAKEBACK_MINUTES * 60000 &&
  !(all || []).some((x) => x.id !== m.id && x.aUid === meId && matchCounts(x) && Number(x.loggedAtMs || 0) > Number(m.loggedAtMs || 0));

/** A small version of a Cloudinary screenshot for lists (the full picture opens on tap) */
export const thumbUrl = (url, w = 120) =>
  String(url || '').replace('/upload/', `/upload/c_fill,w_${w},h_${w},q_auto,f_auto/`);

/** The screenshot to show for a match: the winner's (logger's) first, else the opponent's */
export const proofOf = (m) => (m && (m.proofA || m.proofB)) || '';

/** Winner id of a match ('' for a draw) */
export const winnerOf = (m) => (m.scoreA > m.scoreB ? m.aUid : m.scoreB > m.scoreA ? m.bUid : '');

/** A match belongs to one contest only. Matches without a tag are league matches. */
export const contestOf = (m) => (m && m.contest === 'reward' ? 'reward' : 'league');
/** Lagos week number, weeks start Monday 12:00AM */
export const lagosWeek = (ms) => Math.floor((lagosDay(ms) + 3) / 7);

/**
 * Keep only the first counting matches between the same two players in one week, per contest:
 * 4 in the league, 2 in a reward week. Extra matches are ignored by every board, whatever was written.
 */
export function capPairs(matches) {
  const sorted = [...matches].filter(matchCounts).sort((a, b) => Number(a.loggedAtMs || 0) - Number(b.loggedAtMs || 0));
  const seen = {};
  const keep = new Set();
  sorted.forEach((m) => {
    const c = contestOf(m);
    const pair = [m.aUid, m.bUid].sort().join('|');
    const period = c === 'reward' ? m.weekKey || lagosWeek(m.loggedAtMs) : lagosWeek(m.loggedAtMs);
    const key = `${m.seasonId || ''}|${m.game}|${c}|${pair}|${period}`;
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] <= (c === 'reward' ? MAX_PAIR_REWARD_WEEK : MAX_PAIR_LEAGUE_WEEK)) keep.add(m.id || m);
  });
  return matches.filter((m) => keep.has(m.id || m));
}

/**
 * The table for one game.
 * opts:
 *   seasonId   count only matches of this season (matches without a season id never count)
 *   joined     Set of player ids on this table (season joined, or joined the reward week). Everyone else is left out.
 *   fromMs/toMs count only matches entered in [fromMs, toMs) (a reward week window)
 *   contest    'league' (default) or 'reward': a table counts matches of its own contest only
 *   includeDisputed  count reported matches as if they stood (used only to see whether a report could change the top 3)
 *   nowMs      "ready" is not used any more; kept so callers can pass a clock
 * Order: points, wins, main stat (goals scored, or damage), kills, whoever reached their points first, then name.
 */
export function computeRows(game, gamers, matches, opts = {}) {
  const scored = isScored(game);
  const joined = opts.joined || null;
  const rows = {};
  gamers
    .filter((g) => playsGame(g, game) && (!joined || joined.has(g.id)))
    .forEach((g) => {
      const school = g.school || 'caritas';
      rows[g.id] = {
        id: g.id,
        name: g.name,
        hostel: g.hostel,
        school,
        tag: school === 'caritas' ? '' : school === 'guest' ? 'Guest' : g.schoolName || 'Other school',
        origin: school === 'caritas' ? 'Caritas' : school === 'guest' ? 'Guest' : g.schoolName || 'Other school',
        gameId: (g.ids && g.ids[game]) || '',
        freeNote: g.freeNote || '',
        lastActiveMs: Number(g.lastActiveMs || g.updatedAtMs || 0),
        p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, dmg: 0, kills: 0, lastPtMs: 0,
      };
    });
  // A table counts the matches played in its own contest only
  const contest = opts.contest === 'reward' ? 'reward' : 'league';
  const pool = matches.filter(
    (m) =>
      m.game === game &&
      (!opts.seasonId || m.seasonId === opts.seasonId) &&
      contestOf(m) === contest &&
      (contest !== 'reward' || !opts.weekKey || m.weekKey === opts.weekKey)
  );
  const inWindow = (m) => (opts.fromMs == null || Number(m.loggedAtMs) >= opts.fromMs) && (opts.toMs == null || Number(m.loggedAtMs) < opts.toMs);
  const counting = opts.includeDisputed
    ? pool.filter((m) => ['pending', 'confirmed', 'disputed'].includes(m.status)).map((m) => (m.status === 'disputed' ? { ...m, status: 'pending' } : m))
    : pool;
  capPairs(counting)
    .filter(inWindow)
    .forEach((m) => {
      const a = rows[m.aUid];
      const b = rows[m.bUid];
      if (!a || !b || a === b) return;
      a.p++; b.p++;
      a.gf += m.scoreA; a.ga += m.scoreB;
      b.gf += m.scoreB; b.ga += m.scoreA;
      const at = Number(m.loggedAtMs || 0);
      if (m.scoreA > m.scoreB) {
        a.w++; b.l++; a.pts += POINTS.win; a.lastPtMs = Math.max(a.lastPtMs, at);
        // Only the winner enters stats, so only the winner's kills and damage exist
        a.kills += Number(m.kills || 0);
        a.dmg += Number(m.damage || 0);
      } else if (m.scoreB > m.scoreA) {
        b.w++; a.l++; b.pts += POINTS.win; b.lastPtMs = Math.max(b.lastPtMs, at);
        b.kills += Number(m.kills || 0);
        b.dmg += Number(m.damage || 0);
      } else {
        a.d++; b.d++; a.pts += POINTS.draw; b.pts += POINTS.draw;
        a.lastPtMs = Math.max(a.lastPtMs, at); b.lastPtMs = Math.max(b.lastPtMs, at);
      }
    });
  // Points Roomly added or removed by hand (dispute settlements). A week table only takes the ones set for that week.
  (opts.adjusts || []).forEach((a) => {
    const r = rows[a.gid];
    if (!r || a.game !== game || (opts.seasonId && a.seasonId !== opts.seasonId)) return;
    if (opts.weekKey ? a.weekKey !== opts.weekKey : opts.fromMs != null) return;
    r.pts = Math.max(0, r.pts + Number(a.pts || 0));
    r.adj = (r.adj || 0) + Number(a.pts || 0);
  });
  const list = Object.values(rows).map((r) => ({ ...r, gd: r.gf - r.ga }));
  const main = (r) => (scored ? r.gf : r.dmg);
  list.sort(
    (x, y) =>
      y.pts - x.pts ||
      y.w - x.w ||
      main(y) - main(x) ||
      y.kills - x.kills ||
      // reached their points first = lower time; players with no points sort by name
      (x.lastPtMs || Infinity) - (y.lastPtMs || Infinity) ||
      String(x.name).localeCompare(String(y.name))
  );
  return list.map((r, i) => ({ ...r, rank: i + 1, crown: i === 0 && r.pts > 0 }));
}

/** The top 3 of a table that have at least the minimum points: these earn a credit */
export const rewardWinners = (rows, minPoints) => rows.slice(0, 3).filter((r) => r.pts >= minPoints);

/** Would a reported match change who is in the top 3, or their order? */
export function disputeAffectsTop3(game, gamers, matches, opts) {
  const without = computeRows(game, gamers, matches, opts).slice(0, 3).map((r) => r.id).join('|');
  const withIt = computeRows(game, gamers, matches, { ...opts, includeDisputed: true }).slice(0, 3).map((r) => r.id).join('|');
  return without !== withIt;
}

/** Reward week id */
export const weekKeyOf = (seasonId, game, startMs) => `${seasonId}_${game}_${startMs}`;
/** scheduled | running | closed (closed = past its end, credits not yet issued) | issued | none */
export function weekPhase(w, nowMs = Date.now()) {
  if (!w) return '';
  if (w.status === 'issued' || w.status === 'none') return w.status;
  if (nowMs < Number(w.startMs)) return 'scheduled';
  if (nowMs < Number(w.endMs)) return 'running';
  return 'closed';
}

/* ------------------------------ credits ------------------------------ */

/** A credit lasts 24 hours from the moment it opens */
export const CREDIT_HOURS = 24;
/** Where a credit stands right now (expiry is worked out when read, not stored) */
export function creditState(c, nowMs = Date.now()) {
  if (!c) return 'none';
  if (c.status === 'void') return 'void';
  if (c.status === 'used') return 'used';
  if (nowMs < Number(c.validFromMs || 0)) return 'locked';
  if (nowMs >= Number(c.expiresAtMs || 0)) return 'expired';
  return 'active';
}

/** Players registered for a game's reward contest (valid players only), oldest registration first */
export function rewardRegsFor(regs, gamers, game) {
  const ok = new Set((gamers || []).filter((g) => playsGame(g, game)).map((g) => g.id));
  return (regs || [])
    .filter((r) => r.game === game && ok.has(r.gid))
    .sort((a, b) => Number(a.atMs || 0) - Number(b.atMs || 0));
}
/** The exact moment the game reached its minimum players (the Nth registration), or 0 if it has not */
export function qualifiedAtMs(regs, gamers, game, minPlayers) {
  const list = rewardRegsFor(regs, gamers, game);
  const n = Math.max(1, Number(minPlayers) || 1);
  return list.length >= n ? Number(list[n - 1].atMs || 0) : 0;
}
/** How many reward weeks can run at once (Roomly sets 1 or 2) */
export const rewardSlots = (config) => (Number(config && config.slots) === 2 ? 2 : 1);
