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
  };
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
  s === 'sent' ? 'On the way to school' : s === 'packed' ? 'Packed' : 'Waiting for the operator';
