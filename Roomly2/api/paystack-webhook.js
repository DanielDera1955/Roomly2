// POST /api/paystack-webhook  (set as the Webhook URL in Paystack: Settings > API Keys & Webhooks)
// Paystack calls this when a payment succeeds. The signature proves it came from Paystack,
// and the payment is checked with Paystack again before the order is marked paid.
import { signatureOk, confirmFromPaystack, json } from './_paystack.js';

export async function POST(request) {
  const raw = await request.text();
  if (!signatureOk(raw, request.headers.get('x-paystack-signature'))) return json({ error: 'bad signature' }, 401);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'bad body' }, 400);
  }
  if (event.event !== 'charge.success') return json({ received: true });
  try {
    const r = await confirmFromPaystack(event.data && event.data.reference);
    if (!r.ok) console.warn('Paystack payment not applied:', event.data && event.data.reference, r.reason);
  } catch (e) {
    console.error('webhook failed', e);
    // Paystack retries when it doesn't get a 200, so a temporary failure is not lost
    return json({ error: 'try again' }, 500);
  }
  return json({ received: true });
}
