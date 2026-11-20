// The Games jobs that need a server. Shared by two callers:
//   api/push-reminders.js   every 10 minutes (cron-job.org). It calls gamesTick(): a cheap check that only does the
//                           full run when something is due, so the database is not read in full every 10 minutes.
//   api/games-daily.js      once a day (Vercel cron). It always does the full run, as a safety net.
// The full run does four things:
//   1. issue credits for reward weeks that have closed (at the close, within 10 minutes)
//   2. schedule the next reward week when a game has enough players: it starts at the next 12:00AM and runs 7 days
//   3. send the "week started" and "ends tonight" alerts
//   4. record each game's champion when a season has ended (the Hall of fame)
// Every step is safe to run twice: credits are created with fixed ids and a week is marked issued only after its
// credits exist, so a late or double run never pays anyone twice.
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { alertSettings, sendItems, dataFor, fill, GAME_LABELS, pkByGid, tokenDocsForPks, logPush, lagosDateKey } from './_push.js';
import {
  computeRows,
  rewardWinners,
  disputeAffectsTop3,
  rewardConfigFor,
  nextRewardStart,
  weekKeyOf,
  qualifiedAtMs,
  rewardSlots,
  creditOpensAtMs,
  earnedPoints,
  contestOf,
  GAME_IDS,
  WEEK_MS,
  CREDIT_HOURS,
  DISPUTE_HOURS,
} from '../src/boardCore.js';

const HOUR = 3600000;
const phoneKeyOf = (phone) => crypto.createHash('sha256').update('roomly-phone:' + phone).digest('hex');
const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const already = (e) => e && (e.code === 6 || /already exists/i.test(String(e.message)));

/**
 * The cheap check. Is there anything the full run would do right now?
 * Reads only: the seasons (a few documents), reward weeks not yet issued, and one count of reward registrations.
 */
export async function gamesNeedWork(db, now) {
  const state = ((await db.doc('settings/gamesJob').get()).data()) || {};
  const seasons = rows(await db.collection('seasons').get()).filter((s) => Number(s.startMs) <= now);
  if (seasons.some((s) => now >= Number(s.endMs) && !s.championsAt)) return { need: true, why: 'champions' };
  const open = rows(await db.collection('rewardWeeks').where('status', '==', 'scheduled').get());
  for (const w of open) {
    const startMs = Number(w.startMs);
    const endMs = Number(w.endMs);
    if (now >= endMs) return { need: true, why: `close ${w.id}` };
    if (!w.startAlertMs && now >= startMs && now < startMs + 24 * HOUR) return { need: true, why: `start alert ${w.id}` };
    if (!w.endAlertMs && now >= endMs - 20 * HOUR && now < endMs) return { need: true, why: `end alert ${w.id}` };
  }
  // A new reward registration may have filled a game. A count, not a time, so a phone with a wrong clock cannot hide one.
  const total = (await db.collection('rewardRegs').count().get()).data().count;
  if (total !== Number(state.regCount)) return { need: true, why: 'registrations', regCount: total };
  return { need: false };
}

/**
 * Credits that are still held: if a match of the winner was reported after the credit was issued, hold it for 24 hours
 * from now (once). Costs one small read per held credit's week, and nothing when no credit is held.
 */
export async function recheckHeldCredits(db, now, out) {
  const held = rows(await db.collection('credits').where('validFromMs', '>', now).get()).filter((c) => c.status === 'active' && !c.heldForDispute && c.weekKey);
  if (!held.length) return;
  const byWeek = {};
  held.forEach((c) => (byWeek[c.weekKey] = [...(byWeek[c.weekKey] || []), c]));
  for (const weekKey of Object.keys(byWeek)) {
    const weekMatches = rows(await db.collection('matches').where('weekKey', '==', weekKey).get());
    for (const c of byWeek[weekKey]) {
      const reported = weekMatches.some((m) => m.status === 'disputed' && earnedPoints(m, c.gid));
      if (!reported) continue;
      const validFromMs = Math.max(Number(c.validFromMs), now + DISPUTE_HOURS * HOUR);
      await db.doc(`credits/${c.id}`).update({ validFromMs, expiresAtMs: validFromMs + CREDIT_HOURS * HOUR, heldForDispute: true });
      out.held.push(c.id);
    }
  }
}

/** The 10-minute entry point: cheap check first, then the full run only when needed */
export async function gamesTick(db, now = Date.now()) {
  const out = { ran: false, issued: [], scheduled: [], champions: [], held: [], errors: [] };
  try {
    await recheckHeldCredits(db, now, out);
  } catch (e) {
    out.errors.push(`held credits: ${e.message}`);
  }
  const need = await gamesNeedWork(db, now);
  if (!need.need) return out;
  out.ran = true;
  out.why = need.why;
  await runGames(db, now, out);
  const total = need.regCount != null ? need.regCount : (await db.collection('rewardRegs').count().get()).data().count;
  await db.doc('settings/gamesJob').set({ regCount: total, atMs: now }, { merge: true });
  return out;
}

/** The full run */
export async function runGames(db, now = Date.now(), out = { issued: [], scheduled: [], champions: [], held: [], errors: [] }) {
  const config = ((await db.doc('settings/gamesConfig').get()).data()) || {};
  const alerts = await alertSettings(db);
  const dateKey = lagosDateKey();
  const gamers = rows(await db.collection('gamers').get()).filter((g) => g.ownerUid);
  const seasons = rows(await db.collection('seasons').get()).filter((s) => Number(s.startMs) <= now);

  for (const season of seasons) {
    const matches = rows(await db.collection('matches').where('seasonId', '==', season.id).get());
    const joins = rows(await db.collection('seasonJoins').where('seasonId', '==', season.id).get());
    const rewardJoins = rows(await db.collection('rewardRegs').where('seasonId', '==', season.id).get());
    const weeks = rows(await db.collection('rewardWeeks').where('seasonId', '==', season.id).get());
    const adjusts = rows(await db.collection('pointAdjust').where('seasonId', '==', season.id).get());
    const seasonJoined = new Set(joins.map((j) => j.gid));

    /* 1. Issue credits for weeks that have closed. A credit opens at once when every match that gave the winner
          points is settled, otherwise it is held (see creditOpensAtMs). */
    for (const week of weeks) {
      if (week.status === 'issued' || week.status === 'none' || now < Number(week.endMs)) continue;
      try {
        const joined = new Set(rewardJoins.filter((j) => j.game === week.game).map((j) => j.gid));
        const opts = { seasonId: season.id, contest: 'reward', joined, fromMs: Number(week.startMs), toMs: Number(week.endMs), adjusts, weekKey: week.id };
        const table = computeRows(week.game, gamers, matches, opts);
        const winners = rewardWinners(table, Number(week.minPoints)).filter((r) => {
          const g = gamers.find((x) => x.id === r.id);
          return g && !g.banned && !(g.rewardBlocked && g.rewardBlocked[week.game]);
        });
        const flagged = disputeAffectsTop3(week.game, gamers, matches, opts);
        const weekMatches = matches.filter((m) => m.game === week.game && contestOf(m) === 'reward' && m.weekKey === week.id);
        const newCredits = [];
        for (const w of winners) {
          const contact = await db.doc(`gamerContact/${w.id}`).get();
          const phone = contact.exists ? String(contact.data().phone || '') : '';
          if (!phone) {
            out.errors.push(`no phone for ${w.id}`);
            continue;
          }
          const pk = phoneKeyOf(phone);
          const creditId = `${week.id}_${w.id}`;
          const validFromMs = creditOpensAtMs(weekMatches, w.id, now, flagged);
          const expiresAtMs = validFromMs + CREDIT_HOURS * HOUR;
          const reported = flagged || weekMatches.some((m) => m.status === 'disputed' && earnedPoints(m, w.id));
          try {
            await db.doc(`credits/${creditId}`).create({
              pk,
              gid: w.id,
              name: w.name,
              game: week.game,
              weekKey: week.id,
              seasonId: season.id,
              rank: w.rank,
              value: Number(week.creditValue),
              issuedAtMs: now,
              validFromMs,
              expiresAtMs,
              heldForDispute: reported,
              status: 'active',
              usedOrderId: '',
              usedAtMs: 0,
            });
            newCredits.push(pk);
          } catch (e) {
            if (!already(e)) throw e;
            /* issued by an earlier run */
          }
          await db.doc(`creditIndex/${pk}`).set({ ids: FieldValue.arrayUnion(creditId) }, { merge: true });
          out.issued.push(creditId);
        }
        // Tell the winners their credit is ready (only for credits created in this run)
        if (newCredits.length && alerts.credit.on !== false) {
          try {
            const vars = { game: GAME_LABELS[week.game] || week.game, value: naira(week.creditValue) };
            const docs = await tokenDocsForPks(db, newCredits);
            const ok = await sendItems(docs.map((d) => ({ ref: d.ref, token: d.data().token, data: dataFor(fill(alerts.credit.title, vars), fill(alerts.credit.body, vars), 'roomly-credit') })));
            await logPush(db, `${dateKey}_credit_${week.id}`, { kind: 'credit', title: fill(alerts.credit.title, vars), sent: ok, total: docs.length });
          } catch (e) {
            out.errors.push(`credit alert ${week.id}: ${e.message}`);
          }
        }
        await db.doc(`rewardWeeks/${week.id}`).update({
          status: winners.length ? 'issued' : 'none',
          issuedAtMs: now,
          disputeFlag: flagged,
          results: table.slice(0, 3).map((r) => ({ gid: r.id, name: r.name, pts: r.pts, rank: r.rank, rewarded: winners.some((w) => w.id === r.id) })),
        });
      } catch (e) {
        out.errors.push(`week ${week.id}: ${e.message}`);
      }
    }

    /* 2. Rolling weeks. A game that has enough players starts at the next 12:00AM, or the moment the running week ends
          when the slot is busy. Games take turns: the game that has waited longest goes first. */
    if (now < Number(season.endMs)) {
      try {
        const slots = rewardSlots(config);
        const queued = new Set(weeks.filter((w) => Number(w.startMs) > now).map((w) => w.game));
        const qualified = [];
        for (const game of GAME_IDS) {
          if (queued.has(game)) continue;
          const cfg = rewardConfigFor(config, game);
          const at = qualifiedAtMs(rewardJoins, gamers, game, cfg.minPlayers);
          if (!at) continue;
          const lastGameEnd = weeks.filter((w) => w.game === game).reduce((m, w) => Math.max(m, Number(w.endMs)), 0);
          qualified.push({ game, cfg, lastGameEnd, at });
        }
        qualified.sort((a, b) => a.lastGameEnd - b.lastGameEnd || a.at - b.at);
        const planned = [...weeks];
        for (const next of qualified) {
          const startMs = nextRewardStart(planned, slots, now);
          if (!startMs) break;
          if (startMs + WEEK_MS > Number(season.endMs)) break;
          const id = weekKeyOf(season.id, next.game, startMs);
          const week = {
            id,
            seasonId: season.id,
            game: next.game,
            startMs,
            endMs: startMs + WEEK_MS,
            minPlayers: next.cfg.minPlayers,
            minPoints: next.cfg.minPoints,
            creditValue: next.cfg.creditValue,
            status: 'scheduled',
            createdAtMs: now,
          };
          try {
            const { id: _id, ...data } = week;
            await db.doc(`rewardWeeks/${id}`).create(data);
            out.scheduled.push(id);
          } catch (e) {
            if (!already(e)) throw e;
          }
          planned.push(week);
        }
      } catch (e) {
        out.errors.push(`schedule ${season.id}: ${e.message}`);
      }
    }

    /* 3. Reward week alerts: "has started" (once the week begins) and "ends tonight" (the day it ends) */
    try {
      for (const week of weeks) {
        if (week.status === 'issued' || week.status === 'none') continue;
        const regs = rewardJoins.filter((j) => j.game === week.game);
        if (!regs.length) continue;
        const startMs = Number(week.startMs);
        const endMs = Number(week.endMs);
        const vars = { game: GAME_LABELS[week.game] || week.game, value: naira(week.creditValue), need: Number(week.minPoints) };
        if (alerts.rewardStart.on !== false && !week.startAlertMs && now >= startMs && now < startMs + 24 * HOUR) {
          const pkMap = await pkByGid(db, regs.map((r) => r.gid));
          const docs = await tokenDocsForPks(db, Object.values(pkMap));
          const title = fill(alerts.rewardStart.title, vars);
          const ok = await sendItems(docs.map((d) => ({ ref: d.ref, token: d.data().token, data: dataFor(title, fill(alerts.rewardStart.body, vars), 'roomly-reward-' + week.game) })));
          await db.doc(`rewardWeeks/${week.id}`).update({ startAlertMs: now });
          await logPush(db, `${dateKey}_rewardStart_${week.game}`, { kind: 'rewardStart', title, sent: ok, total: docs.length });
        }
        if (alerts.rewardEnd.on !== false && !week.endAlertMs && now >= endMs - 20 * HOUR && now < endMs) {
          const joined = new Set(regs.map((r) => r.gid));
          const table = computeRows(week.game, gamers, matches, { seasonId: season.id, contest: 'reward', joined, fromMs: startMs, toMs: endMs, adjusts, weekKey: week.id });
          const pkMap = await pkByGid(db, regs.map((r) => r.gid));
          const docs = await tokenDocsForPks(db, Object.values(pkMap));
          const byPk = {};
          docs.forEach((d) => (byPk[d.data().pk] = [...(byPk[d.data().pk] || []), d]));
          const items = [];
          for (const r of regs) {
            const row = table.find((x) => x.id === r.gid);
            const own = { ...vars, rank: row ? row.rank : table.length + 1, pts: row ? row.pts : 0 };
            for (const d of byPk[pkMap[r.gid]] || []) {
              items.push({ ref: d.ref, token: d.data().token, data: dataFor(fill(alerts.rewardEnd.title, own), fill(alerts.rewardEnd.body, own), 'roomly-reward-end-' + week.game) });
            }
          }
          const ok = await sendItems(items);
          await db.doc(`rewardWeeks/${week.id}`).update({ endAlertMs: now });
          await logPush(db, `${dateKey}_rewardEnd_${week.game}`, { kind: 'rewardEnd', title: fill(alerts.rewardEnd.title, vars), sent: ok, total: items.length });
        }
      }
    } catch (e) {
      out.errors.push(`reward alerts ${season.id}: ${e.message}`);
    }

    /* 4. A season that has ended: record its champions once */
    if (now >= Number(season.endMs) && !season.championsAt) {
      try {
        const champions = {};
        for (const game of GAME_IDS) {
          const top = computeRows(game, gamers, matches, { seasonId: season.id, joined: seasonJoined, adjusts })[0];
          if (top && top.pts > 0) champions[game] = { gid: top.id, name: top.name, pts: top.pts, origin: top.origin };
        }
        // Frozen copy for History: names and points only (no phone numbers, no screenshots)
        const freshWeeks = rows(await db.collection('rewardWeeks').where('seasonId', '==', season.id).get());
        await db.doc(`seasonArchive/${season.id}`).set({
          name: season.name,
          session: season.session || '',
          startMs: Number(season.startMs),
          endMs: Number(season.endMs),
          champions,
          weeks: freshWeeks
            .filter((w) => Array.isArray(w.results) && w.results.length)
            .sort((a, b) => Number(a.startMs) - Number(b.startMs))
            .map((w) => ({ game: w.game, startMs: Number(w.startMs), endMs: Number(w.endMs), minPoints: Number(w.minPoints), creditValue: Number(w.creditValue), results: w.results })),
          archivedAtMs: now,
        });
        for (const game of GAME_IDS) {
          const table = computeRows(game, gamers, matches, { seasonId: season.id, joined: seasonJoined, adjusts });
          await db.doc(`seasonArchive/${season.id}/tables/${game}`).set({
            game,
            rows: table.map((r) => ({ id: r.id, rank: r.rank, name: r.name, origin: r.origin, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts })),
          });
        }
        await db.doc(`seasons/${season.id}`).update({ champions, championsAt: now });
        out.champions.push(season.id);
      } catch (e) {
        out.errors.push(`champions ${season.id}: ${e.message}`);
      }
    }
  }
  return out;
}
