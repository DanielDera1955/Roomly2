// POST /api/pay-init  { orderId, batch?, provider? }
// Starts a Paystack payment for one order. The amount always comes from the saved order, never from the phone.
import { adminDb, paystack, json, validOrderId } from './_paystack.js';

const lagosDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
const clean = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId;
    if (!validOrderId(orderId)) return json({ error: 'Invalid order.' }, 400);

    const db = adminDb();
    const ref = db.collection('orders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: 'Order not found.' }, 404);
    const o = snap.data();

    if (o.paymentStatus === 'payment_confirmed') return json({ error: 'This order is already paid.', paid: true }, 409);
    if (o.status === 'Cancelled') return json({ error: 'This order was cancelled.' }, 409);
    if (o.createdAt && lagosDay(new Date(o.createdAt)) < lagosDay(new Date())) {
      return json({ error: 'This order expired at the end of the day it was placed. Please place a new order.' }, 409);
    }
    const amount = Math.round(Number(o.totalAmount || 0) * 100);
    if (!(amount >= 100)) return json({ error: 'This order has no amount to pay.' }, 409);

    // A fresh reference per attempt (Paystack refuses a reused one); it always starts with the order id
    const reference = `${orderId}-${Date.now().toString(36).toUpperCase()}`;
    const digits = String(o.phone || '').replace(/\D/g, '') || 'customer';

    // What the student saw when they tapped Pay, applied only once the money is confirmed
    const b = body.batch || {};
    const p = body.provider || {};
    const pending = {
      reference,
      startedAt: new Date().toISOString(),
      batch: b.deliveryBatch
        ? { deliveryBatch: clean(b.deliveryBatch), deliveryTime: clean(b.deliveryTime), deliveryDate: clean(b.deliveryDate), paymentDeadline: clean(b.paymentDeadline) }
        : null,
      provider: p.operatorId || p.turnRunner ? { operatorId: clean(p.operatorId), operatorName: clean(p.operatorName), turnRunner: clean(p.turnRunner) } : null,
    };

    const tx = await paystack('/transaction/initialize', {
      email: `${digits}@customers.roomly.app`,
      amount,
      currency: 'NGN',
      reference,
      // Most students pay by transfer, so it is listed first
      channels: ['bank_transfer', 'card', 'ussd', 'bank'],
      metadata: {
        orderId,
        cart: o.cart || 'inside',
        custom_fields: [
          { display_name: 'Order', variable_name: 'order_id', value: orderId },
          { display_name: 'Customer', variable_name: 'customer', value: `${o.name || ''} ${o.phone || ''}`.trim() },
        ],
      },
    });
    await ref.update({ paystack: pending });
    return json({ accessCode: tx.access_code, reference });
  } catch (e) {
    console.error('pay-init failed', e);
    return json({ error: 'Could not start the payment. Please try again.' }, 500);
  }
}
