export interface CartItem {
  id: string; // unique cart item id (e.g., prodId + extras combination)
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl?: string;
  emoji: string;
  isFood?: boolean;
  plates?: number;
  extras?: {
    id: string;
    name: string;
    price: number;
    quantity?: number;
  }[];
  specialNote?: string;
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
export type DeliveryBatchId = 'premium' | 'morning' | 'afternoon' | 'evening';

export interface OrderRecord {
  id: string;
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
