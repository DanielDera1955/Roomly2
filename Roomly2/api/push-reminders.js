// "Batch closes in 1 hour" alerts. Call this every 10 minutes from a scheduler (cron-job.org is free):
//   GET https://<your site>/api/push-reminders   with header   Authorization: Bearer <CRON_SECRET>
// It sends each reminder once a day, in the 10 minutes after its time (Lagos time), to every phone that turned alerts on.
// Needs in Vercel: FIREBASE_SERVICE_ACCOUNT (already there) and CRON_SECRET (new, required here).
// The times below are one hour before the order cut-offs in src/config.ts. If those change, change them here too.
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from './_paystack.js';

const REMINDERS = [
  { kind: 'lunch', hour: 11, min: 30, offDays: [1], title: 'Lunch closes in 1 hour', body: 'Order before 12:30pm and it reaches the school gate before 1:30pm.' },
  { kind: 'dinner', hour: 17, min: 0, offDays: [0], title: 'Dinner closes in 1 hour', body: 'Order before 6:00pm and it reaches the school gate before 7:00pm.' },
  { kind: 'room', hour: 19, min: 50, offDays: [], title: 'Room delivery closes in 1 hour', body: 'Order before 8:50pm and it reaches your room before 9:30pm.' },
];
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
    const lagos = new Date(Date.now() + 3600000); // Lagos is UTC+1, no daylight saving
    const weekday = lagos.getUTCDay();
    const minNow = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    const dateKey = lagos.toISOString().slice(0, 10);
    const forced = String(req.query?.force || ''); // ?force=lunch to send one now (testing)
    for (const r of REMINDERS) {
      const start = r.hour * 60 + r.min;
      const due = forced ? forced === r.kind : minNow >= start && minNow < start + WINDOW_MIN && !r.offDays.includes(weekday);
      if (!due) continue;
      if (!forced) {
        try {
          await db.doc(`pushLog/${dateKey}_${r.kind}`).create({ atMs: Date.now() });
        } catch {
          out.skipped.push(`${r.kind}: already sent today`);
          continue;
        }
      }
      const snap = await db.collection('pushTokens').get();
      const docs = snap.docs;
      let ok = 0;
      for (let i = 0; i < docs.length; i += 500) {
        const chunk = docs.slice(i, i + 500);
        const resp = await getMessaging().sendEach(
          chunk.map((d) => ({
            token: d.data().token,
            data: { title: r.title, body: r.body, tag: `roomly-${r.kind}`, url: '/' },
            webpush: { headers: { Urgency: 'high', TTL: '1800' } },
          }))
        );
        for (let k = 0; k < resp.responses.length; k++) {
          const x = resp.responses[k];
          if (x.success) ok++;
          else if (/registration-token-not-registered|invalid-argument|invalid-registration/.test(String(x.error?.code || ''))) await chunk[k].ref.delete().catch(() => {});
        }
      }
      out.sent.push(`${r.kind}: ${ok} of ${docs.length}`);
    }
    res.json(out);
  } catch (e) {
    out.errors.push(String((e && e.message) || e));
    res.status(500).json(out);
  }
}
