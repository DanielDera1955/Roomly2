// Shared helpers for the Paystack payment functions (the underscore keeps this file from becoming a web address).
// Secrets come only from Vercel's Environment Variables, never from this code:
//   PAYSTACK_SECRET_KEY        sk_test_... or sk_live_...
//   FIREBASE_SERVICE_ACCOUNT   the whole Firebase service account file
//   (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY as three separate settings)
import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PAYSTACK = 'https://api.paystack.co';

function serviceAccount() {
  const whole = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (whole) {
    const sa = JSON.parse(whole);
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: String(sa.private_key || '').replace(/\\n/g, '\n') };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

export function adminDb() {
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount()) });
  return getFirestore();
}

export function secretKey() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error('PAYSTACK_SECRET_KEY is not set in Vercel');
  return k;
}

export const isTestKey = () => String(process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_test_');

export async function paystack(path, body) {
  const res = await fetch(PAYSTACK + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.status) throw new Error(json.message || `Paystack error ${res.status}`);
  return json.data;
}

/** True when the webhook body really came from Paystack (HMAC-SHA512 of the raw body with the secret key) */
export function signatureOk(raw, signature) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha512', secretKey()).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Orders are created with ids like RM-1234-ABCD; refuse anything else before touching the database */
export const validOrderId = (id) => typeof id === 'string' && /^RM-[0-9]{4}-[A-Z0-9]{4}$/.test(id);

/**
 * Ask Paystack about a payment, and if it truly succeeded for the full amount of its order, mark the order paid.
 * Used by both the webhook and the check right after the popup closes, so it is safe to run twice.
 * Returns { ok, order?, reason? }.
 */
export async function confirmFromPaystack(reference) {
  if (typeof reference !== 'string' || !/^[A-Za-z0-9-]{6,80}$/.test(reference)) return { ok: false, reason: 'bad reference' };
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!tx || tx.status !== 'success') return { ok: false, reason: `payment ${tx ? tx.status : 'not found'}` };
  const orderId = tx.metadata && tx.metadata.orderId;
  if (!validOrderId(orderId) || !reference.startsWith(orderId + '-')) return { ok: false, reason: 'payment is not for a Roomly order' };
  if (tx.currency !== 'NGN') return { ok: false, reason: 'wrong currency' };

  const db = adminDb();
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return { ok: false, reason: 'order not found' };
    const o = snap.data();
    if (o.paymentStatus === 'payment_confirmed') return { ok: true, order: { ...o, id: orderId }, already: true };
    const due = Math.round(Number(o.totalAmount || 0) * 100);
    if (Number(tx.amount) !== due) return { ok: false, reason: `amount ${tx.amount} does not match the order (${due})` };

    const now = new Date().toISOString();
    const paidAt = tx.paid_at || tx.paidAt || now;
    const pending = o.paystack && o.paystack.batch;
    const update = {
      paymentStatus: 'payment_confirmed',
      paymentSentAt: o.paymentSentAt || paidAt,
      paymentConfirmedAt: now,
      paymentConfirmedBy: 'Paystack',
      payReady: true,
      paidVia: 'paystack',
      paymentNotReceived: null,
      paystack: { reference, paidAt, channel: tx.channel || '', amount: Number(tx.amount), test: isTestKey() },
      history: [
        ...(o.history || []),
        { status: o.status, timestamp: now, note: `Paid ₦${(Number(tx.amount) / 100).toLocaleString()} through Paystack (${tx.channel || 'online'}). Confirmed automatically.`, updatedBy: 'Paystack' },
      ],
    };
    // Paid after the batch closed: the order joins the batch the student saw when they tapped Pay
    if (pending && pending.deliveryBatch) {
      for (const k of ['deliveryBatch', 'deliveryTime', 'deliveryDate', 'paymentDeadline']) if (pending[k]) update[k] = pending[k];
    }
    // Placed while nobody was available: attach the runner / operator who has taken the batch since (only if none was set)
    const prov = o.paystack && o.paystack.provider;
    if (prov && !o.operatorId && !o.turnRunner) {
      for (const k of ['operatorId', 'operatorName', 'turnRunner']) if (prov[k]) update[k] = prov[k];
    }
    t.update(ref, update);
    return { ok: true, order: { ...o, ...update, id: orderId } };
  });
}
