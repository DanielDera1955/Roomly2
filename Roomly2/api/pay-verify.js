// POST /api/pay-verify  { reference }
// Called right after the Paystack popup says the payment went through, in case the webhook is slow.
import { confirmFromPaystack, json } from './_paystack.js';

export async function POST(request) {
  try {
    const { reference } = await request.json().catch(() => ({}));
    const r = await confirmFromPaystack(reference);
    if (!r.ok) return json({ paid: false, reason: r.reason });
    return json({ paid: true, order: r.order });
  } catch (e) {
    console.error('pay-verify failed', e);
    return json({ paid: false, reason: 'Could not check the payment yet.' }, 500);
  }
}
