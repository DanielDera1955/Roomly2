// Runs once a day (see vercel.json). It does the Games jobs that need a server:
//   1. issue credits for reward weeks that have closed (the morning after the table closes)
//   2. schedule the next reward week when a table has enough players (it starts the next Monday 12:00AM)
//   3. record each game's champion when a season has ended (the Hall of fame)
// Every step is safe to run twice: credits are created with fixed ids and a week is marked issued only after
// its credits exist, so a late or double run never pays anyone twice.
// Needs the same Vercel settings as the Paystack functions (FIREBASE_SERVICE_ACCOUNT). Optional: CRON_SECRET.
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './_paystack.js';
import {
  computeRows,
  rewardWinners,
  disputeAffectsTop3,
  rewardConfigFor,
  nextMondayStart,
  weekKeyOf,
  playsGame,
  GAME_IDS,
  WEEK_MS,
  CREDIT_HOURS,
} from '../src/boardCore.js';

const HOUR = 3600000;
const phoneKeyOf = (phone) => crypto.createHash('sha256').update('roomly-phone:' + phone).digest('hex');
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Not allowed' });
    return;
  }
  const out = { issued: [], scheduled: [], champions: [], errors: [] };
  try {
    const db = adminDb();
    const now = Date.now();
    const config = ((await db.doc('settings/gamesConfig').get()).data()) || {};
    const gamers = rows(await db.collection('gamers').get()).filter((g) => g.ownerUid);
    const seasons = rows(await db.collection('seasons').get()).filter((s) => Number(s.startMs) <= now);

    for (const season of seasons) {
      const matches = rows(await db.collection('matches').where('seasonId', '==', season.id).get());
      const joins = rows(await db.collection('seasonJoins').where('seasonId', '==', season.id).get());
      const rewardJoins = rows(await db.collection('rewardJoins').where('seasonId', '==', season.id).get());
      const weeks = rows(await db.collection('rewardWeeks').where('seasonId', '==', season.id).get());
      const adjusts = rows(await db.collection('pointAdjust').where('seasonId', '==', season.id).get());
      const seasonJoined = new Set(joins.map((j) => j.gid));

      /* 1. Issue credits for weeks that have closed */
      for (const week of weeks) {
        if (week.status === 'issued' || week.status === 'none' || now < Number(week.endMs)) continue;
        try {
          const joined = new Set(rewardJoins.filter((j) => j.weekKey === week.id).map((j) => j.gid));
          const opts = { seasonId: season.id, joined, fromMs: Number(week.startMs), toMs: Number(week.endMs), adjusts, weekKey: week.id };
          const table = computeRows(week.game, gamers, matches, opts);
          const winners = rewardWinners(table, Number(week.minPoints)).filter((r) => {
            const g = gamers.find((x) => x.id === r.id);
            return g && !g.banned && !(g.rewardBlocked && g.rewardBlocked[week.game]);
          });
          const flagged = disputeAffectsTop3(week.game, gamers, matches, opts);
          // Credits open at 12:00AM the day after they are issued and last 24 hours from then
          const validFromMs = Math.max(Number(week.endMs) + 24 * HOUR, now);
          const expiresAtMs = validFromMs + CREDIT_HOURS * HOUR;
          for (const w of winners) {
            const contact = await db.doc(`gamerContact/${w.id}`).get();
            const phone = contact.exists ? String(contact.data().phone || '') : '';
            if (!phone) {
              out.errors.push(`no phone for ${w.id}`);
              continue;
            }
            const pk = phoneKeyOf(phone);
            const creditId = `${week.id}_${w.id}`;
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
                status: 'active',
                usedOrderId: '',
                usedAtMs: 0,
              });
            } catch (e) {
              if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) {
                /* issued by an earlier run */
              } else {
                throw e;
              }
            }
            await db.doc(`creditIndex/${pk}`).set({ ids: FieldValue.arrayUnion(creditId) }, { merge: true });
            out.issued.push(creditId);
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

      /* 2. Schedule the next reward week while the season runs */
      if (now < Number(season.endMs) && !weeks.some((w) => Number(w.startMs) > now)) {
        try {
          const lastEnd = weeks.reduce((m, w) => Math.max(m, Number(w.endMs)), 0);
          const startMs = Math.max(nextMondayStart(now), lastEnd);
          if (startMs + WEEK_MS <= Number(season.endMs)) {
            const qualified = [];
            for (const game of GAME_IDS) {
              const cfg = rewardConfigFor(config, game);
              const count = gamers.filter((g) => seasonJoined.has(g.id) && playsGame(g, game)).length;
              const qref = db.doc(`gameQueue/${season.id}_${game}`);
              if (count >= cfg.minPlayers) {
                let q = await qref.get();
                if (!q.exists) {
                  await qref.set({ qualifiedAtMs: now });
                  q = await qref.get();
                }
                const lastGameEnd = weeks.filter((w) => w.game === game).reduce((m, w) => Math.max(m, Number(w.endMs)), 0);
                qualified.push({ game, cfg, lastGameEnd, qualifiedAtMs: Number(q.data().qualifiedAtMs) });
              } else {
                await qref.delete().catch(() => {});
              }
            }
            // Tables queue: the one that has waited longest goes first
            qualified.sort((a, b) => a.lastGameEnd - b.lastGameEnd || a.qualifiedAtMs - b.qualifiedAtMs);
            const next = qualified[0];
            if (next) {
              const id = weekKeyOf(season.id, next.game, startMs);
              await db.doc(`rewardWeeks/${id}`).create({
                seasonId: season.id,
                game: next.game,
                startMs,
                endMs: startMs + WEEK_MS,
                minPlayers: next.cfg.minPlayers,
                minPoints: next.cfg.minPoints,
                creditValue: next.cfg.creditValue,
                status: 'scheduled',
                createdAtMs: now,
              });
              out.scheduled.push(id);
            }
          }
        } catch (e) {
          if (!(e && (e.code === 6 || /already exists/i.test(String(e.message))))) out.errors.push(`schedule ${season.id}: ${e.message}`);
        }
      }

      /* 3. A season that has ended: record its champions once */
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
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), ...out });
  }
}
