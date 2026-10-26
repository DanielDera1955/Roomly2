export interface CartItem {
  id: string; // unique cart item id (e.g., prodId + extras combination)
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl?: string;
  emoji: string;
  source?: 'school' | 'outside' | 'food';
  isFood?: boolean;
  plates?: number;
  extras?: {
    id: string;
    name: string;
    price: number;
    quantity?: number;
  }[];
  specialNote?: string;
  // A requested product waiting for a price quote: the cart cannot be checked out until it is priced
  pendingQuote?: boolean;
  requestId?: string;
  requestIdx?: number;
}

export interface CustomerProfile {
  phone: string;
  name: string;
  area: 'Hostels' | 'Lodge';
  building: string;
  room: string;
  ordersCount: number;
  deliveredOrdersCount: number;
  isReturning: boolean;
  lastOrder?: OrderRecord | null;
  wrongPin?: boolean;
}

export interface OrderStatusHistory {
  status: 'Received' | 'Packing' | 'On the way' | 'Delivered' | 'Cancelled';
  timestamp: string;
  note?: string;
  updatedBy?: string;
}

export type PaymentStatus = 'unpaid' | 'payment_sent' | 'payment_confirmed' | 'pay_on_delivery';
export type DeliveryBatchId = 'premium' | 'morning' | 'midday' | 'afternoon' | 'late' | 'evening';

export interface OrderRecord {
  id: string;
  hasStore?: boolean;
  hasFood?: boolean;
  payReady?: boolean;
  storeStatus?: string;
  foodStatus?: string;
  phone: string;
  name: string;
  area: string;
  building: string;
  room: string;
  status: 'Received' | 'Packing' | 'On the way' | 'Delivered' | 'Cancelled';
  paymentMethod: 'pay_now' | 'pay_on_delivery';
  paymentStatus: PaymentStatus;
  paymentDeadline?: string; // 15 mins countdown deadline
  paymentSentAt?: string;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  isFirstTimeCustomer?: boolean;

  deliveryBatch: DeliveryBatchId;
  deliveryTime: string; // descriptive window
  createdAt: string;
  deliveredAt?: string;
  items: CartItem[];
  customRequest?: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  estimatedDeliveryTime?: string;
  
  // Runner Tracking
  runnerId?: string;
  runnerName?: string;
  runnerPhone?: string;
  runnerCurrentLocation?: string;
  runnerLocationUpdatedAt?: string;
  history?: OrderStatusHistory[];

  // Phase 4: one order per cart
  cart?: 'inside' | 'store' | 'food';
  operatorId?: string;
  operatorName?: string;
  turnRunner?: string; // the runner whose turn it is, shown at checkout
  outOfStock?: 'refund' | 'tomorrow' | 'swap';
  deliveryDate?: string;
  gateReq?: boolean;
  gatePickup?: {
    status: 'pending' | 'accepted' | 'refused' | 'delivered' | 'refunded';
    fee: number;
    heavy?: boolean;
    runnerName?: string;
    runnerPhone?: string;
    note?: string;
    updatedAt?: string;
    runnerPay?: { bankName: string; accountNumber: string; accountName: string } | null;
    paid?: boolean;
    paidAt?: string;
  };
  /** Express run (inside only): ₦1,200 instead of the normal delivery fee, delivered within 20 minutes of payment */
  express?: ExpressInfo | null;
}

export interface ExpressInfo {
  /** requested: waiting for a runner; accepted: a runner said "I can do it now"; cancelled: switched to normal delivery */
  status: 'requested' | 'accepted' | 'cancelled';
  requestedAt: string;
  runnerId?: string; // runner login email
  runnerName?: string;
  runnerPhone?: string;
  acceptedAt?: string;
  payTo?: { bankName: string; accountNumber: string; accountName: string } | null;
  /** When the money actually arrived (the runner reads it from their bank app). Moves the start if later than the tap. */
  txAt?: string;
  /** Runner tapped Delivered */
  runnerDeliveredAt?: string;
  /** Student tapped Received: this stops the clock */
  receivedAt?: string;
  /** Runner paid the ₦600 back to a late order's student */
  refunded?: boolean;
  refundedAt?: string;
}

/** Express clock: start = payment time (moved to the bank time if later), end = student's Received (or the runner's Delivered after 10 min) */
export function expressTiming(o: { express?: ExpressInfo | null; paymentSentAt?: string }, now: number = Date.now(), confirmMs = 10 * 60000, limitMs = 20 * 60000) {
  const ex = o.express;
  if (!ex || ex.status !== 'accepted' || !o.paymentSentAt) return null;
  const tap = Date.parse(o.paymentSentAt);
  const tx = ex.txAt ? Date.parse(ex.txAt) : NaN;
  const start = Number.isFinite(tx) && tx > tap ? tx : tap;
  const received = ex.receivedAt ? Date.parse(ex.receivedAt) : NaN;
  const delivered = ex.runnerDeliveredAt ? Date.parse(ex.runnerDeliveredAt) : NaN;
  let end = NaN;
  if (Number.isFinite(received)) end = received;
  else if (Number.isFinite(delivered) && now - delivered >= confirmMs) end = delivered;
  const finished = Number.isFinite(end);
  const used = (finished ? end : now) - start;
  return {
    start,
    end: finished ? end : null,
    finished,
    /** Delivered by the runner, waiting for the student to tap Received */
    awaitingReceipt: !finished && Number.isFinite(delivered),
    usedMs: used,
    leftMs: limitMs - used,
    late: used > limitMs,
  };
}

/** One rating per cart, sent straight to the admin */
export interface RatingRecord {
  orderId: string;
  cart: 'inside' | 'store' | 'food';
  score: number; // 1 to 5
  reasons: string[];
  comment?: string;
  /** Runner email or operator login uid: the person the rating is about */
  providerKey: string;
  providerName: string;
  customer?: string;
  createdAt: string;
}

export interface DeliveryRunner {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  activeDeliveriesCount?: number;
  currentZone?: string;
}

export interface CategoryDefinition {
  id: string;
  name: string;
  emoji: string;
  subcategories: string[];
  /** Which stores use this category: 'inside', 'store' (outside store), 'food' (outside food) */
  stores?: string[];
}

// Location helpers (customers may deliver to a custom spot instead of their room)
const cleanRoom = (room?: string) => String(room || '').replace(/^\s*room\s*/i, '').trim();
export const locationText = (o: { area?: string; building?: string; room?: string }) =>
  o.area === 'Custom' ? `${o.building}` : `${o.building}, Room ${cleanRoom(o.room)} (${o.area})`;
export const shortLocation = (o: { area?: string; building?: string; room?: string }) =>
  o.area === 'Custom' ? `${o.building}` : `${o.building}, Room ${cleanRoom(o.room)}`;
export const roomText = (o: { area?: string; building?: string; room?: string }) =>
  o.area === 'Custom' ? `${o.building}` : `Room ${cleanRoom(o.room)}`;

/** Status of the outside-school part of an order, as the student and runners see it */
export const partLabel = (s?: string) =>
  s === 'sent' ? 'Delivered: at the gate in under 15 minutes' : s === 'packed' ? 'Packed' : 'Waiting for the operator';
