// Saves or removes a phone's alert token, and sends a test alert to one token.
// Tokens live in the pushTokens collection (only this server reads or writes it).
import crypto from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from './_paystack.js';

const idOf = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const token = String(b.token || '');
    if (token.length < 50 || token.length > 4096) {
      res.status(400).json({ error: 'Bad token' });
      return;
    }
    const db = adminDb();
    const ref = db.doc(`pushTokens/${idOf(token)}`);
    if (b.action === 'save') {
      await ref.set({ token, pk: String(b.pk || '').slice(0, 80), createdMs: Date.now() }, { merge: true });
      res.json({ ok: true });
    } else if (b.action === 'remove') {
      await ref.delete();
      res.json({ ok: true });
    } else if (b.action === 'test') {
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Not subscribed' });
        return;
      }
      await getMessaging().send({
        token,
        data: { title: 'Roomly alerts are on', body: 'This is a test. You will get a reminder an hour before each batch closes.', tag: 'roomly-test', url: '/' },
        webpush: { headers: { Urgency: 'high', TTL: '300' } },
      });
      res.json({ ok: true });
    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
