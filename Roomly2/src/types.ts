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
  /** Outside orders: the operator's cost for this line when the order was placed, so later price changes don't change the settlement */
  lockedCost?: number;
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
  /** Photo of the packed order, added by the operator (shown large to the student) */
  packPhoto?: string;
  packPhotoAt?: string;
  packPhotoBy?: string;
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
  /** Inside: when the runner tapped "Done packing, on my way" (starts the 15-minute timer) */
  onTheWayAt?: string;
  onTheWayAtMs?: number;
  /** Inside: marked delivered by the 15-minute timer, not by the runner */
  autoDelivered?: boolean;
  /** Inside: the student tapped "I haven't received it" */
  notReceived?: { atMs: number; at: string; resolvedAt?: string; resolvedNote?: string };
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
  /** The operator moved this outside order to their next available day */
  movedAt?: string;
  movedBy?: string;
  gateReq?: boolean;
  gatePickup?: {
    status: 'pending' | 'accepted' | 'refused' | 'delivered' | 'refunded' | 'cancelled';
    fee: number;
    /** When the current request started (ms). No runner for 10 min: the student may cancel; 30 min: cancelled by itself */
    requestedAt?: number;
    /** Runners who said they can't take it: they no longer see it */
    refusedBy?: string[];
    runnerUid?: string;
    /** The runner checked their account: the student's ₦1,000 arrived */
    payConfirmed?: boolean;
    payConfirmedAt?: string;
    /** A runner who released it after the student paid, and is sending the money back */
    refunds?: { runnerName: string; amount: number; at: string }[];
    cancelledAt?: string;
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

/**
 * Where an order stands, as the student sees it.
 * Outside: unpaid -> received (student paid) -> packaging (operator confirmed payment)
 *          -> onway (operator tapped "Order delivered", 15-minute countdown to the gate) -> delivered (countdown over)
 * Inside:  unpaid -> received -> packaging -> onway (runner on the way) -> delivered
 * Records for the operator and admin count an outside order at the operator's "Order delivered" tap.
 */
export type OrderStage = 'unpaid' | 'received' | 'packaging' | 'onway' | 'delivered' | 'cancelled';
export const GATE_COUNTDOWN_MS = 15 * 60000;

export function orderStageOf(o: OrderRecord, now: number = Date.now()): OrderStage {
  if (!o) return 'unpaid';
  if (o.status === 'Cancelled') return 'cancelled';
  const outside = o.cart === 'store' || o.cart === 'food';
  if (outside) {
    const part = o.cart === 'food' ? o.foodStatus : o.storeStatus;
    if (part === 'sent' || o.status === 'Delivered') {
      const at = Date.parse(o.deliveredAt || '');
      return Number.isFinite(at) && now - at < GATE_COUNTDOWN_MS ? 'onway' : 'delivered';
    }
    if (o.paymentStatus === 'payment_confirmed') return 'packaging';
    if (o.paymentStatus === 'payment_sent') return 'received';
    return 'unpaid';
  }
  if (o.status === 'Delivered') return 'delivered';
  if (o.status === 'On the way') return 'onway';
  if (o.status === 'Packing' || o.paymentStatus === 'payment_confirmed') return 'packaging';
  if (o.paymentStatus === 'payment_sent' || o.paymentStatus === 'pay_on_delivery') return 'received';
  return 'unpaid';
}

/** Still shown under Active Orders (outside orders stay there during the 15-minute gate countdown) */
export const isActiveOrder = (o: OrderRecord, now: number = Date.now()) => {
  const st = orderStageOf(o, now);
  return st !== 'delivered' && st !== 'cancelled';
};

export function stageLabel(o: OrderRecord, now: number = Date.now()): string {
  const st = orderStageOf(o, now);
  const outside = o.cart === 'store' || o.cart === 'food';
  if (st === 'unpaid') return 'Waiting for payment';
  if (st === 'received') return 'Received';
  if (st === 'packaging') return 'Confirmed & Packaging';
  if (st === 'onway') return outside ? 'On its way to the gate' : 'On its way to you';
  if (st === 'delivered') return 'Delivered';
  return 'Cancelled';
}

/** Status of the outside-school part of an order, as the student and runners see it */
export const partLabel = (s?: string) =>
  s === 'sent' ? 'Delivered: at the gate in under 15 minutes' : s === 'packed' ? 'Packed' : 'Waiting for the operator';
