// Runs once a day (see vercel.json) as a safety net. The same Games jobs also run every 10 minutes from
// api/push-reminders.js (see api/_games.js), so this only catches anything the 10-minute job missed, for example
// after the admin lowers a game's minimum players.
// Every step is safe to run twice: credits are created with fixed ids and a week is marked issued only after
// its credits exist, so a late or double run never pays anyone twice.
// Needs the same Vercel settings as the Paystack functions (FIREBASE_SERVICE_ACCOUNT). Optional: CRON_SECRET.
import { adminDb } from './_paystack.js';
import { runGames, recheckHeldCredits } from './_games.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Not allowed' });
    return;
  }
  const out = { issued: [], scheduled: [], champions: [], held: [], errors: [] };
  try {
    const db = adminDb();
    const now = Date.now();
    await recheckHeldCredits(db, now, out).catch((e) => out.errors.push(`held credits: ${e.message}`));
    await runGames(db, now, out);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), ...out });
  }
}
