// "Batch closes in 1 hour" alerts. Call this every 10 minutes from a scheduler (cron-job.org is free):
//   GET https://<your site>/api/push-reminders   with header   Authorization: Bearer <CRON_SECRET>
// Each reminder goes out once a day, in the 10 minutes after its time (Lagos time), to every phone that turned alerts on.
// The switches, times and wording come from Admin > Alerts (settings/alerts); _push.js holds the defaults.
// After the reminders it also runs the Games jobs (reward weeks, credits, alerts) through gamesTick(): a cheap check that
// does the full run only when something is due. Reminders go first, so a slow Games run never delays them.
// Needs in Vercel: FIREBASE_SERVICE_ACCOUNT (already there) and CRON_SECRET.
import { adminDb } from './_paystack.js';
import { alertSettings, allTokenDocs, sendItems, dataFor, lagosNow, lagosDateKey, logPush } from './_push.js';
import { gamesTick } from './_games.js';

// Days a batch does not run (0 = Sunday): lunch is off on Monday, dinner off on Sunday
const OFF_DAYS = { lunch: [1], dinner: [0], room: [] };
const WINDOW_MIN = 9;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Not allowed' });
    return;
  }
  const out = { sent: [], skipped: [], errors: [] };
  try {
    const db = adminDb();
    const cfg = await alertSettings(db);
    const lagos = lagosNow();
    const weekday = lagos.getUTCDay();
    const minNow = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    const dateKey = lagosDateKey();
    const forced = String(req.query?.force || ''); // ?force=lunch sends one now (testing)
    for (const kind of Object.keys(OFF_DAYS)) {
      const r = cfg[kind];
      const start = Number(r.hour) * 60 + Number(r.min);
      const due = forced ? forced === kind : r.on !== false && minNow >= start && minNow < start + WINDOW_MIN && !OFF_DAYS[kind].includes(weekday);
      if (!due) continue;
      if (!forced) {
        try {
          await db.doc(`pushLog/${dateKey}_${kind}`).create({ date: dateKey, kind, title: r.title, atMs: Date.now(), sent: 0, total: 0 });
        } catch {
          out.skipped.push(`${kind}: already sent today`);
          continue;
        }
      }
      const docs = await allTokenDocs(db);
      const ok = await sendItems(docs.map((d) => ({ ref: d.ref, token: d.data().token, data: dataFor(r.title, r.body, `roomly-${kind}`) })));
      if (!forced) await logPush(db, `${dateKey}_${kind}`, { sent: ok, total: docs.length });
      out.sent.push(`${kind}: ${ok} of ${docs.length}`);
    }
    // Games: reward weeks start at the next 12:00AM after a game fills, and credits are issued when a week closes
    try {
      const g = await gamesTick(db);
      out.games = g.ran ? { ran: true, why: g.why, issued: g.issued, scheduled: g.scheduled, held: g.held, errors: g.errors } : { ran: false, held: g.held, errors: g.errors };
    } catch (e) {
      out.errors.push(`games: ${String((e && e.message) || e)}`);
    }
    res.json(out);
  } catch (e) {
    out.errors.push(String((e && e.message) || e));
    res.status(500).json(out);
  }
}
