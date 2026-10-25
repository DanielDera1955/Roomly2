/**
 * Roomly - Central Configuration
 * Easy to edit categories, subcategories, products, prices, locations, and rules.
 */

import { CategoryDefinition, DeliveryRunner, DeliveryBatchId } from './types';

export interface Product {
  id: string;
  name: string;
  category: string; // e.g. 'Food', 'Everyday', 'Drinks', 'Toiletries', 'Books & Stationery'
  subcategory: string; // e.g. 'Bread', 'Water', 'Soft Drinks', 'Course Textbooks'
  price: number;
  unit?: string;
  isFood?: boolean;
  imageUrl?: string;
  emoji: string;
  gradient: string;
  description?: string;
  isAvailable?: boolean;
  costPrice?: number; // what you pay (admin only)
  source?: 'school' | 'outside' | 'food'; // school = canteen, outside = store, food = food operator
}

export interface FoodExtraOption {
  id: string;
  name: string;
  price: number;
}

export interface PresetImageOption {
  label: string;
  url: string;
}

export const PRESET_PRODUCT_IMAGES: PresetImageOption[] = [
  { label: 'Smoky Jollof Rice', url: '/images/jollof_rice_plate_1792185951038.jpg' },
  { label: 'Fried Chicken', url: '/images/fried_chicken_piece_1792245638899.jpg' },
  { label: 'Sliced Bread Loaf', url: '/images/loaf_of_bread_1792185951610.jpg' },
  { label: 'Instant Noodles Pack', url: '/images/noodles_pack_1792185951495.jpg' },
  { label: 'Coca-Cola Bottle', url: '/images/coke_bottle_drink_1792245593261.jpg' },
  { label: 'Malt Drink Bottle', url: '/images/malt_drink_bottle_1792185952073.jpg' },
  { label: 'Chilled Spring Water', url: '/images/chilled_water_bottle_1792245608205.jpg' },
  { label: 'Engineering Textbook', url: '/images/math_textbook_1792245624167.jpg' },
];

export const STORE_CONFIG = {
  brandName: 'Roomly',
  tagline: 'Hostel & Lodge Room Delivery',
  deliveryEstimate: '30 to 60 mins',
  openHour: 6, // 6 AM
  closeHour: 23, // 11 PM
  // Delivery Batches: 3 batches (morning, afternoon, evening) @ ₦1,000 + 1 Premium instant @ ₦1,500
  deliveryFeePremium: 1500,
  deliveryFeeBatch: 1000,
  paymentTimeoutMinutes: 15,
  adminPin: '1234',
  // Roomly's own account: runners and operators send what they owe here. Students never see it.
  bankDetails: {
    bankName: 'Opay',
    accountNumber: '8141850484',
    accountName: 'Chidera Ugwu Daniel',
    instructions: 'Use your Order ID as payment narration/reference',
  },
  supportPhone: '08012345678',
  supportWhatsApp: '+2348012345678',
  // Students use this to suggest a feature or send a complaint (08141850484)
  feedbackWhatsApp: '2348141850484',
};

export interface DeliveryBatchOption {
  id: DeliveryBatchId;
  name: string;
  timeWindow: string;
  price: number;
  badge: string;
  description: string;
}

// Labels for every batch that can appear (used by the cart and the admin charts)
export const DELIVERY_BATCHES: DeliveryBatchOption[] = [
  { id: 'morning', name: 'Morning Batch', timeWindow: 'Saturday morning', price: 0, badge: '', description: 'Free-day morning delivery' },
  { id: 'midday', name: 'Midday Batch', timeWindow: 'Midday', price: 0, badge: '', description: 'Midday delivery' },
  { id: 'afternoon', name: 'Afternoon Batch', timeWindow: '2 to 3pm', price: 0, badge: '', description: 'Afternoon delivery' },
  { id: 'late', name: 'Late Afternoon Batch', timeWindow: 'Late afternoon', price: 0, badge: '', description: 'Late afternoon delivery' },
  { id: 'evening', name: 'Evening Batch', timeWindow: '8 to 9pm', price: 0, badge: '', description: 'Evening delivery' },
];

/**
 * Calculate delivery fee based on selected batch option:
 * Premium delivery = ₦1,500; Morning/Afternoon/Evening batches = ₦1,000
 */
// ---------- Pricing engine ----------
export type ProductSource = 'school' | 'outside' | 'food';

/** Outside-school items: 'outside' = trusted store, 'food' = food operator */
export const isOutsideSource = (s?: string) => s === 'outside' || s === 'food';

export const PRICING = {
  schoolMargin: 0.16, // every item bought inside school
  outsideMargin: 0.18, // outside-school items costing under outsideBigFrom
  outsideBigMargin: 0.12, // outside-school items costing outsideBigFrom or more
  outsideBigFrom: 10000,
};

/** Outside delivery to the school gate: ₦800 (₦600 to the operator, ₦200 to you) */
export const OUTSIDE_DELIVERY_FEE = 800;

// ---------- Three carts (Phase 4) ----------
/** inside = one cart for inside store items and cooked food (runner); store / food = the two outside carts */
export type CartKind = 'inside' | 'store' | 'food';
export const cartOf = (i: { source?: string }): CartKind => (i.source === 'outside' ? 'store' : i.source === 'food' ? 'food' : 'inside');
export const CART_LABEL: Record<CartKind, string> = {
  inside: 'Inside school',
  store: 'Outside: store items',
  food: 'Outside: cooked food and drinks',
};
/** Daily settlement: a day must be cleared before this hour the next morning */
export const SETTLE_BY_HOUR = 6;
/** Inside runners keep 30% of the day's profit and owe 70% */
export const RUNNER_SHARE = 0.3;
/** Gate pickup: an inside runner brings the parcel from the gate to the room. Paid to the runner. */
export const GATE_PICKUP_FEES = { normal: 600, heavy: 1000 };
/** What the student wants if an item is out of stock */
export type OutOfStockChoice = 'refund' | 'tomorrow' | 'swap';
export const OUT_OF_STOCK_LABEL: Record<OutOfStockChoice, string> = {
  refund: 'Refund that item',
  tomorrow: "Get it in tomorrow's batch (no extra delivery)",
  swap: 'Buy a same-category item at the same price',
};

const roundUp10 = (n: number) => Math.ceil((n - 0.000001) / 10) * 10;

/** Customer price for one item from the price you pay, rounded up to the next 10 naira */
export function sellingPrice(cost: number, source: ProductSource = 'school'): number {
  if (!cost || cost <= 0) return 0;
  if (!isOutsideSource(source)) return roundUp10(cost * (1 + PRICING.schoolMargin));
  if (cost >= PRICING.outsideBigFrom) return roundUp10(cost * (1 + PRICING.outsideBigMargin));
  // Under the big-item line: 18%, but never more than the price of a big item,
  // so an item costing 9,999 can't sell for more than one costing 10,000.
  const capped = Math.min(cost * (1 + PRICING.outsideMargin), PRICING.outsideBigFrom * (1 + PRICING.outsideBigMargin));
  return roundUp10(capped);
}

// ---------- Weekly delivery schedule (inside school) ----------
export interface BatchSlotDef {
  id: DeliveryBatchId;
  name: string;
  startMin: number; // minutes after midnight
  endMin: number;
  orderByMin: number;
}
const T = (h: number, m: number = 0) => h * 60 + m;
const SLOT_NAMES: Record<string, string> = {
  morning: 'Morning Batch',
  midday: 'Midday Batch',
  afternoon: 'Afternoon Batch',
  late: 'Late Afternoon Batch',
  evening: 'Evening Batch',
};
const slot = (id: DeliveryBatchId, start: number, end: number, orderBy: number): BatchSlotDef => ({
  id,
  name: SLOT_NAMES[id],
  startMin: start,
  endMin: end,
  orderByMin: orderBy,
});
const SCHOOL_DAY = [slot('afternoon', T(14), T(15), T(12, 30)), slot('late', T(17), T(18), T(15, 30)), slot('evening', T(20), T(21), T(18, 30))];
/** 0 = Sunday ... 6 = Saturday. Runners and admin can switch any batch off for a day. */
export const WEEKLY_BATCHES: Record<number, BatchSlotDef[]> = {
  // Sunday: four batches, delivered by 12pm, 4pm, 6pm and 9pm
  0: [
    slot('midday', T(11), T(12), T(10)),
    slot('afternoon', T(15), T(16), T(13, 30)),
    slot('late', T(17), T(18), T(15, 30)),
    slot('evening', T(20), T(21), T(18, 30)),
  ],
  1: SCHOOL_DAY,
  2: SCHOOL_DAY,
  3: SCHOOL_DAY,
  4: SCHOOL_DAY,
  5: SCHOOL_DAY,
  // Saturday: 9 to 10am, 1 to 2pm, 4 to 5pm, 8 to 9pm
  6: [
    slot('morning', T(9), T(10), T(8)),
    slot('midday', T(13), T(14), T(11, 30)),
    slot('late', T(16), T(17), T(14, 30)),
    slot('evening', T(20), T(21), T(18, 30)),
  ],
};

export interface BatchOption {
  key: string; // "2026-10-20|afternoon"
  id: DeliveryBatchId;
  name: string;
  date: string;
  dayLabel: string;
  window: string; // "2 to 3pm"
  label: string; // "Today, Afternoon Batch (2 to 3pm)"
  orderBy: Date;
  startMin: number; // scheduled start, minutes after midnight
}

export const timeLabel = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
};
const windowLabel = (a: number, b: number): string => {
  const same = (a >= 720) === (b >= 720);
  const start = timeLabel(a);
  return same ? `${start.replace(/(am|pm)$/, '')} to ${timeLabel(b)}` : `${start} to ${timeLabel(b)}`;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildOption(day: Date, dayOffset: number, s: BatchSlotDef): BatchOption {
  const date = ymd(day);
  const dayLabel = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : DAY_NAMES[day.getDay()];
  const window = windowLabel(s.startMin, s.endMin);
  return {
    key: `${date}|${s.id}`,
    id: s.id,
    name: s.name,
    date,
    dayLabel,
    window,
    label: `${dayLabel}, ${s.name} (${window})`,
    orderBy: new Date(day.getTime() + s.orderByMin * 60000),
    startMin: s.startMin,
  };
}

/** Every batch on a day (for the runner and admin switches), whether or not orders are still open */
export function listDaySlots(base: Date, dayOffset: number): BatchOption[] {
  const day = new Date(base);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOffset);
  return (WEEKLY_BATCHES[day.getDay()] || []).map((s) => buildOption(day, dayOffset, s));
}

/** Batches a student can still order into, soonest first. Outside-school orders stop at 6pm (school rule). */
export function getBookableSlots(now: Date = new Date(), hasOutside: boolean = false, off: Iterable<string> = []): BatchOption[] {
  const offSet = new Set(off);
  const out: BatchOption[] = [];
  for (let d = 0; d < 3; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    for (const s of WEEKLY_BATCHES[day.getDay()] || []) {
      if (hasOutside && s.endMin > T(18)) continue;
      const opt = buildOption(day, d, s);
      if (opt.orderBy.getTime() <= now.getTime()) continue;
      if (offSet.has(opt.key)) continue;
      out.push(opt);
    }
  }
  return out.slice(0, 8);
}

export function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return 'under 1 minute';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------- Outside school schedule ----------
/** Outside store items: two batches a day, 12:30 to 1:30pm and 5 to 6pm */
export const OUTSIDE_STORE_BATCHES: BatchSlotDef[] = [
  { id: 'afternoon', name: 'Afternoon store batch', startMin: T(12, 30), endMin: T(13, 30), orderByMin: T(12) },
  { id: 'late', name: 'Evening store batch', startMin: T(17), endMin: T(18), orderByMin: T(16, 30) },
];
/** Outside food: one batch a day, 4:30 to 6pm */
export const OUTSIDE_FOOD_BATCH: BatchSlotDef = {
  id: 'evening',
  name: 'Food batch',
  startMin: T(16, 30),
  endMin: T(18),
  orderByMin: T(16),
};

/** Next outside batch still taking orders. kind 'store' or 'food'. */
export function getNextOutsideSlot(kind: 'store' | 'food', now: Date = new Date()): BatchOption | null {
  const slots = kind === 'food' ? [OUTSIDE_FOOD_BATCH] : OUTSIDE_STORE_BATCHES;
  for (let d = 0; d < 3; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    for (const s of slots) {
      const opt = buildOption(day, d, s);
      if (opt.orderBy.getTime() > now.getTime()) return opt;
    }
  }
  return null;
}

/** Every slot on a day for one side: inside batches, outside store batches, or the food batch */
export type SwitchSide = 'inside' | 'store' | 'food';
export function slotsForDay(side: SwitchSide, base: Date, dayOffset: number): BatchOption[] {
  if (side === 'inside') return listDaySlots(base, dayOffset);
  const day = new Date(base);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOffset);
  const defs = side === 'food' ? [OUTSIDE_FOOD_BATCH] : OUTSIDE_STORE_BATCHES;
  return defs.map((s) => buildOption(day, dayOffset, s));
}
/** Switches turn themselves off at night: 10pm inside, 6pm outside (the school does not want outside parcels at the gate after 6pm) */
export const SWITCH_CUTOFF_MIN = { inside: T(22), outside: T(18) };

/** "will start sending by 2pm" style label for a batch */
export const startLabel = (opt: BatchOption): string => {
  const t = opt.window.split(' to ')[0];
  const end = opt.window.match(/(am|pm)$/)?.[1] || '';
  return /(am|pm)$/.test(t) ? t : `${t}${end}`;
};

/**
 * Inside school: ₦390 under ₦4,000. ₦500 from ₦4,000 up, or whenever the order has a bag of water (heavy), even if it is the only item.
 * Outside-school items: ₦800.
 */
export const DELIVERY_FEES = { small: 390, large: 500, threshold: 4000 };
/** A bag of water, by name: it has "bag" and "water" in it (for example "Sachet Water (Full Bag of 20)") */
export const isBagOfWater = (name?: string): boolean => /bag/i.test(name || '') && /water/i.test(name || '');
export function deliveryFeeFor(itemTotal: number, hasOutside: boolean = false, hasBagOfWater: boolean = false): number {
  if (hasOutside) return OUTSIDE_DELIVERY_FEE;
  return hasBagOfWater || itemTotal >= DELIVERY_FEES.threshold ? DELIVERY_FEES.large : DELIVERY_FEES.small;
}

export function nextBatchId(now: Date = new Date()): DeliveryBatchId {
  return getBookableSlots(now)[0]?.id || 'afternoon';
}

export function calculateDeliveryFee(batchId: string = 'morning'): number {
  if (batchId === 'premium') {
    return STORE_CONFIG.deliveryFeePremium;
  }
  return STORE_CONFIG.deliveryFeeBatch;
}

// Campus hostels (students type their own room, e.g. A12)
export const HOSTELS = ['JV', 'TA', 'New Hostel'];
export const CAMPUS_LOCATIONS: Record<string, string[]> = {
  Hostels: HOSTELS,
};

// ---------- Home screen categories (two per side) ----------
export type ShopGroup = 'store' | 'food';
/** Cooked food goes to Food, everything else to Store Items, decided from the product itself */
export function shopGroupOf(p: Product): ShopGroup {
  // Outside school: the tab follows the store, so Cooked Food always goes to the Food cart
  if (p.source === 'food') return 'food';
  if (p.source === 'outside') return 'store';
  // Inside school: one cart, so the tab follows the product
  if (p.isFood || String(p.category).toLowerCase() === 'food') return 'food';
  return 'store';
}
export function shopGroupLabel(group: ShopGroup, side: 'inside' | 'outside'): string {
  if (group === 'store') return 'Store Items';
  return 'Cooked Food';
}
export const ITEMS_PER_PAGE = 10;

/** Store Items categories, in the order students see them */
export const INSIDE_CATEGORIES: { name: string; emoji: string }[] = [
  { name: 'Bread & Pastries', emoji: '🥖' },
  { name: 'Drinks', emoji: '🥤' },
  { name: 'Snacks & Treats', emoji: '🍪' },
  { name: 'Breakfast & Provisions', emoji: '🥣' },
  { name: 'Local Food Items', emoji: '🌾' },
  { name: 'Toiletries & Care', emoji: '🧼' },
  { name: 'Laundry & Room', emoji: '🧺' },
];
export const OUTSIDE_CATEGORIES: { name: string; emoji: string }[] = [
  { name: 'Foodstuff', emoji: '🍚' },
  { name: 'Cooking Essentials', emoji: '🌶️' },
  { name: 'Kitchen & Stove', emoji: '🔥' },
  { name: 'Provisions in Bulk', emoji: '📦' },
  { name: 'Toiletries & Laundry Packs', emoji: '🧴' },
  { name: 'Drinks in Bulk', emoji: '🧃' },
];
export const FOOD_CATEGORIES: { name: string; emoji: string }[] = [
  { name: 'Food', emoji: '🍛' },
  { name: 'Soft Drinks', emoji: '🥤' },
];

// ---------- Three stores (Fix batch 3a) ----------
/** inside = inside school, store = outside store items, food = outside cooked food and drinks */
export type StoreKey = 'inside' | 'store' | 'food';
export const STORE_LABEL: Record<StoreKey, string> = { inside: 'Inside School', store: 'Outside Store', food: 'Outside Food' };
export const STORE_SOURCE: Record<StoreKey, 'school' | 'outside' | 'food'> = { inside: 'school', store: 'outside', food: 'food' };
/** Each store's standard categories. Inside also keeps "Food" for its Cooked Food tab. */
export const STORE_CATEGORIES: Record<StoreKey, { name: string; emoji: string }[]> = {
  inside: [...INSIDE_CATEGORIES, { name: 'Food', emoji: '🍛' }],
  store: OUTSIDE_CATEGORIES,
  food: FOOD_CATEGORIES,
};
/** Which store a product belongs to, from where it is sold */
export const storeOfSource = (source?: string): StoreKey => (source === 'outside' ? 'store' : source === 'food' ? 'food' : 'inside');
/** A store's categories: the standard ones first (in order), then any extra you created for that store */
export function categoriesForStore<T extends { name: string; stores?: string[] }>(cats: T[], store: StoreKey): T[] {
  const std = STORE_CATEGORIES[store].map((c) => c.name.toLowerCase());
  return cats
    .filter((c) => (c.stores || []).includes(store) || std.includes(c.name.toLowerCase()))
    .sort((a, b) => {
      const ia = std.indexOf(a.name.toLowerCase());
      const ib = std.indexOf(b.name.toLowerCase());
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
}

/** Sort category names by the standard order; anything else goes last */
export function categoryRank(name: string, side: 'inside' | 'outside' | 'food'): number {
  const list = side === 'food' ? FOOD_CATEGORIES : side === 'outside' ? OUTSIDE_CATEGORIES : INSIDE_CATEGORIES;
  const i = list.findIndex((c) => c.name.toLowerCase() === String(name).toLowerCase());
  return i < 0 ? 999 : i;
}

// Initial Categories & Subcategories
export const INITIAL_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'cat-everyday',
    name: 'Everyday',
    emoji: '🍞',
    subcategories: ['All', 'Bread', 'Biscuits & Snacks', 'Noodles & Quick Meals', 'Provisions & Milk', 'Laundry & Cleaning'],
  },
  {
    id: 'cat-food',
    name: 'Food',
    emoji: '🍛',
    subcategories: ['All', 'Rice Dishes', 'Pasta & Noodles', 'Beans & Porridge', 'Swallow & Soups', 'Proteins Only'],
  },
  {
    id: 'cat-drinks',
    name: 'Drinks',
    emoji: '🥤',
    subcategories: ['All', 'Water', 'Soft Drinks', 'Malt & Energy', 'Juices & Traditional'],
  },
  {
    id: 'cat-toiletries',
    name: 'Toiletries',
    emoji: '🧼',
    subcategories: ['All', 'Bath & Body', 'Oral Care', 'Sanitary & Paper', 'First Aid & Health'],
  },
  {
    id: 'cat-books',
    name: 'Books & Stationery',
    emoji: '📚',
    subcategories: ['All', 'Course Textbooks', 'Notebooks & Note Pads', 'Writing & Materials'],
  },
  {
    id: 'cat-request',
    name: 'Request',
    emoji: '✨',
    subcategories: ['All'],
  },
];

// Food extras for food orders (protein and sides customization)
export const FOOD_EXTRAS: FoodExtraOption[] = [
  { id: 'chicken', name: 'Fried Chicken Portion', price: 1500 },
  { id: 'beef', name: 'Seasoned Beef Cut', price: 500 },
  { id: 'fish', name: 'Crispy Fried Fish', price: 800 },
  { id: 'egg', name: 'Boiled / Fried Egg', price: 300 },
  { id: 'plantain', name: 'Dodo (Fried Plantain)', price: 300 },
  { id: 'turkey', name: 'Peppered Turkey', price: 2200 },
];

export const DELIVERY_TIMES = [
  { id: 'asap', label: 'As soon as possible (30 to 60 mins)', badge: 'Fastest' },
  { id: '1hr', label: 'In about 1 hour', badge: '' },
  { id: '2hr', label: 'In about 2 hours', badge: '' },
  { id: 'tomorrow', label: 'Tomorrow morning from 6am', badge: 'Pre-order' },
];

// Delivery Runners
export const INITIAL_RUNNERS: DeliveryRunner[] = [
  { id: 'run-1', name: 'Runner Musa', phone: '08033311122', isOnline: true, activeDeliveriesCount: 1, currentZone: 'Hostel A & B' },
  { id: 'run-2', name: 'Runner Emeka', phone: '08044422233', isOnline: true, activeDeliveriesCount: 0, currentZone: 'Hostel C & D' },
  { id: 'run-3', name: 'Runner Blessing', phone: '08055533344', isOnline: true, activeDeliveriesCount: 1, currentZone: 'Lodge 1, 2, 3' },
];

// Standard Runner Checkpoints
export const RUNNER_CHECKPOINTS = [
  'At Campus Store / Kitchen (Collecting items)',
  'Order Packed & Leaving Kitchen',
  'Walking across Main Campus Quad',
  'Arrived at Hostel / Lodge Security Gate',
  'Entering Building & Walking up Stairwell',
  'Outside Room Door / Knocking',
  'Package Handed over & Delivered',
];

// Comprehensive Seed Catalog
export const INITIAL_PRODUCTS: Product[] = [
  // --- EVERYDAY -> BREAD ---
  {
    id: 'prod-bread-sliced',
    name: 'Sliced Family Loaf Bread',
    category: 'Everyday',
    subcategory: 'Bread',
    price: 1500,
    unit: '1 large sliced loaf',
    imageUrl: '/images/loaf_of_bread_1792185951610.jpg',
    emoji: '🍞',
    gradient: 'from-amber-500/20 to-orange-500/20',
    description: 'Freshly baked soft family sliced loaf',
    isAvailable: true,
  },
  {
    id: 'prod-bread-agege',
    name: 'Agege Butter Bread',
    category: 'Everyday',
    subcategory: 'Bread',
    price: 1200,
    unit: '1 unsliced loaf',
    imageUrl: '',
    emoji: '🥖',
    gradient: 'from-amber-400/20 to-yellow-500/20',
    description: 'Classic warm and chewy soft Agege bread',
    isAvailable: true,
  },
  {
    id: 'prod-bread-chocolate',
    name: 'Chocolate Brioche Roll',
    category: 'Everyday',
    subcategory: 'Bread',
    price: 1800,
    unit: '2 pack',
    imageUrl: '',
    emoji: '🥐',
    gradient: 'from-amber-700/20 to-yellow-600/20',
    description: 'Sweet pastry filled with rich chocolate',
    isAvailable: true,
  },

  // --- EVERYDAY -> BISCUITS & SNACKS ---
  {
    id: 'prod-bisc-digestive',
    name: 'McVitie\'s Digestive Biscuits',
    category: 'Everyday',
    subcategory: 'Biscuits & Snacks',
    price: 600,
    unit: '1 roll pack',
    imageUrl: '',
    emoji: '🍪',
    gradient: 'from-amber-600/20 to-yellow-600/20',
    description: 'Whole wheat classic crunchy biscuits',
    isAvailable: true,
  },
  {
    id: 'prod-bisc-cabin',
    name: 'Cabin Crispy Biscuits',
    category: 'Everyday',
    subcategory: 'Biscuits & Snacks',
    price: 500,
    unit: '1 packet',
    imageUrl: '',
    emoji: '🍘',
    gradient: 'from-yellow-500/20 to-amber-500/20',
    description: 'Light campus staple cabin crackers',
    isAvailable: true,
  },
  {
    id: 'prod-bisc-purebliss',
    name: 'Pure Bliss Milk Cookies',
    category: 'Everyday',
    subcategory: 'Biscuits & Snacks',
    price: 450,
    unit: '1 pack',
    imageUrl: '',
    emoji: '🧁',
    gradient: 'from-orange-400/20 to-amber-400/20',
    description: 'Rich creamy center filled cookies',
    isAvailable: true,
  },

  // --- EVERYDAY -> NOODLES & QUICK MEALS ---
  {
    id: 'prod-noodles-hungry',
    name: 'Indomie Hungry Man Size',
    category: 'Everyday',
    subcategory: 'Noodles & Quick Meals',
    price: 400,
    unit: '1 large pack (180g)',
    imageUrl: '/images/noodles_pack_1792185951495.jpg',
    emoji: '🍜',
    gradient: 'from-orange-500/20 to-red-500/20',
    description: 'Student size extra portion instant noodles',
    isAvailable: true,
  },
  {
    id: 'prod-noodles-onion',
    name: 'Indomie Onion Chicken',
    category: 'Everyday',
    subcategory: 'Noodles & Quick Meals',
    price: 300,
    unit: '1 regular pack',
    imageUrl: '',
    emoji: '🥢',
    gradient: 'from-amber-500/20 to-orange-500/20',
    description: 'Spicy onion aroma instant noodles',
    isAvailable: true,
  },
  {
    id: 'prod-spag-pack',
    name: 'Golden Penny Spaghetti Pack',
    category: 'Everyday',
    subcategory: 'Noodles & Quick Meals',
    price: 850,
    unit: '500g pack',
    imageUrl: '',
    emoji: '🍝',
    gradient: 'from-yellow-400/20 to-amber-500/20',
    description: 'Non-sticky pure semolina pasta',
    isAvailable: true,
  },

  // --- EVERYDAY -> PROVISIONS & MILK ---
  {
    id: 'prod-milk-sachet',
    name: 'Peak Milk Sachet',
    category: 'Everyday',
    subcategory: 'Provisions & Milk',
    price: 250,
    unit: '1 sachet (16g)',
    imageUrl: '',
    emoji: '🥛',
    gradient: 'from-blue-400/20 to-indigo-500/20',
    description: 'Rich full cream powdered milk',
    isAvailable: true,
  },
  {
    id: 'prod-milo-sachet',
    name: 'Milo Chocolate Sachet',
    category: 'Everyday',
    subcategory: 'Provisions & Milk',
    price: 250,
    unit: '1 sachet (20g)',
    imageUrl: '',
    emoji: '☕',
    gradient: 'from-emerald-700/20 to-green-700/20',
    description: 'Malt chocolate energy breakfast drink',
    isAvailable: true,
  },
  {
    id: 'prod-goldenmorn',
    name: 'Golden Morn Maize & Soya',
    category: 'Everyday',
    subcategory: 'Provisions & Milk',
    price: 1800,
    unit: '500g pouch',
    imageUrl: '',
    emoji: '🥣',
    gradient: 'from-yellow-400/20 to-orange-400/20',
    description: 'Instant fortified breakfast cereal',
    isAvailable: true,
  },

  // --- EVERYDAY -> LAUNDRY & CLEANING ---
  {
    id: 'prod-detergent',
    name: 'Ariel Detergent Sachet',
    category: 'Everyday',
    subcategory: 'Laundry & Cleaning',
    price: 200,
    unit: '1 sachet',
    imageUrl: '',
    emoji: '🧼',
    gradient: 'from-cyan-400/20 to-blue-500/20',
    description: 'Deep stain removal washing powder',
    isAvailable: true,
  },
  {
    id: 'prod-hypo-bleach',
    name: 'Hypo Bleach Sachet',
    category: 'Everyday',
    subcategory: 'Laundry & Cleaning',
    price: 150,
    unit: '1 sachet',
    imageUrl: '',
    emoji: '🧴',
    gradient: 'from-blue-500/20 to-sky-500/20',
    description: 'Disinfectant and fabric brightener',
    isAvailable: true,
  },

  // --- FOOD -> RICE DISHES ---
  {
    id: 'prod-jollof',
    name: 'Smoky Jollof Rice',
    category: 'Food',
    subcategory: 'Rice Dishes',
    price: 1200,
    unit: 'per plate',
    isFood: true,
    imageUrl: '/images/jollof_rice_plate_1792185951038.jpg',
    emoji: '🍛',
    gradient: 'from-red-500/20 to-orange-500/20',
    description: 'Smoky firewood party jollof with rich seasoning',
    isAvailable: true,
  },
  {
    id: 'prod-fried-rice',
    name: 'Campus Special Fried Rice',
    category: 'Food',
    subcategory: 'Rice Dishes',
    price: 1200,
    unit: 'per plate',
    isFood: true,
    imageUrl: '',
    emoji: '🍚',
    gradient: 'from-emerald-500/20 to-yellow-500/20',
    description: 'Loaded with diced sweet carrots, peas and liver',
    isAvailable: true,
  },
  {
    id: 'prod-white-rice',
    name: 'White Rice & Spicy Ofada Sauce',
    category: 'Food',
    subcategory: 'Rice Dishes',
    price: 1400,
    unit: 'per plate',
    isFood: true,
    imageUrl: '',
    emoji: '🍲',
    gradient: 'from-rose-500/20 to-amber-600/20',
    description: 'Steamed white rice with bleached palm oil pepper stew',
    isAvailable: true,
  },

  // --- FOOD -> PASTA & NOODLES ---
  {
    id: 'prod-spaghetti-cook',
    name: 'Seasoned Stir-Fry Spaghetti',
    category: 'Food',
    subcategory: 'Pasta & Noodles',
    price: 1000,
    unit: 'per plate',
    isFood: true,
    imageUrl: '',
    emoji: '🍝',
    gradient: 'from-orange-500/20 to-amber-500/20',
    description: 'Stir-fried pasta with peppers, herbs and sweet corn',
    isAvailable: true,
  },

  // --- FOOD -> BEANS & PORRIDGE ---
  {
    id: 'prod-beans-dodo',
    name: 'Honey Beans & Fried Dodo',
    category: 'Food',
    subcategory: 'Beans & Porridge',
    price: 1000,
    unit: 'per plate',
    isFood: true,
    imageUrl: '',
    emoji: '🍲',
    gradient: 'from-amber-700/20 to-yellow-600/20',
    description: 'Slow-simmered Oloyin beans topped with sweet plantain',
    isAvailable: true,
  },

  // --- FOOD -> SWALLOW & SOUPS ---
  {
    id: 'prod-eba-egusi',
    name: 'Yellow Garri (Eba) & Egusi Soup',
    category: 'Food',
    subcategory: 'Swallow & Soups',
    price: 1300,
    unit: '1 wrap + thick bowl',
    isFood: true,
    imageUrl: '',
    emoji: '🥘',
    gradient: 'from-yellow-600/20 to-emerald-600/20',
    description: 'Hearty melon seed soup with bitter leaf and hot eba',
    isAvailable: true,
  },

  // --- FOOD -> PROTEINS ONLY (Can be ordered with 0 plates!) ---
  {
    id: 'prod-protein-chicken',
    name: 'Crispy Fried Chicken',
    category: 'Food',
    subcategory: 'Proteins Only',
    price: 1500,
    unit: '1 portion',
    isFood: true,
    imageUrl: '/images/fried_chicken_piece_1792245638899.jpg',
    emoji: '🍗',
    gradient: 'from-amber-600/20 to-orange-600/20',
    description: 'Crispy golden fried quarter chicken seasoned with garlic',
    isAvailable: true,
  },
  {
    id: 'prod-protein-beef',
    name: 'Peppered Beef Chunks',
    category: 'Food',
    subcategory: 'Proteins Only',
    price: 500,
    unit: '1 large cut',
    isFood: true,
    imageUrl: '',
    emoji: '🥩',
    gradient: 'from-red-600/20 to-amber-700/20',
    description: 'Tender beef tossed in spicy scotch bonnet sauce',
    isAvailable: true,
  },
  {
    id: 'prod-protein-fish',
    name: 'Fried Titus / Croaker Fish',
    category: 'Food',
    subcategory: 'Proteins Only',
    price: 800,
    unit: '1 cut',
    isFood: true,
    imageUrl: '',
    emoji: '🐟',
    gradient: 'from-sky-600/20 to-blue-700/20',
    description: 'Well-seasoned deep fried fish portion',
    isAvailable: true,
  },

  // --- DRINKS -> WATER ---
  {
    id: 'prod-water-bag',
    name: 'Sachet Water (Full Bag of 20)',
    category: 'Drinks',
    subcategory: 'Water',
    price: 450,
    unit: '1 bag (20 sachets)',
    imageUrl: '',
    emoji: '🧊',
    gradient: 'from-cyan-400/20 to-blue-500/20',
    description: 'Complete bag of clean tested campus pure water delivered to your floor',
    isAvailable: true,
  },
  {
    id: 'prod-water-eva-75cl',
    name: 'Eva Bottled Water 75cl',
    category: 'Drinks',
    subcategory: 'Water',
    price: 200,
    unit: '75cl chilled bottle',
    imageUrl: '/images/chilled_water_bottle_1792245608205.jpg',
    emoji: '💧',
    gradient: 'from-sky-400/20 to-cyan-500/20',
    description: 'Pure cold natural spring water',
    isAvailable: true,
  },
  {
    id: 'prod-water-nestle-15l',
    name: 'Nestle Pure Life 1.5L',
    category: 'Drinks',
    subcategory: 'Water',
    price: 450,
    unit: '1.5 Litre Big Bottle',
    imageUrl: '',
    emoji: '🚰',
    gradient: 'from-blue-400/20 to-indigo-500/20',
    description: 'Large dispenser-size chilled drinking water',
    isAvailable: true,
  },
  {
    id: 'prod-water-canned',
    name: 'Canned Sparkling Water',
    category: 'Drinks',
    subcategory: 'Water',
    price: 500,
    unit: '33cl can',
    imageUrl: '',
    emoji: '🫧',
    gradient: 'from-teal-400/20 to-sky-400/20',
    description: 'Crisp zero-sugar fizzy mineral water',
    isAvailable: true,
  },

  // --- DRINKS -> SOFT DRINKS ---
  {
    id: 'prod-coke-50cl',
    name: 'Coca-Cola Original 50cl',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 400,
    unit: '50cl PET bottle',
    imageUrl: '/images/coke_bottle_drink_1792245593261.jpg',
    emoji: '🥤',
    gradient: 'from-red-600/20 to-rose-700/20',
    description: 'Ice-cold classic Coke refreshment',
    isAvailable: true,
  },
  {
    id: 'prod-pepsi-50cl',
    name: 'Pepsi Cola 50cl',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 400,
    unit: '50cl PET bottle',
    imageUrl: '',
    emoji: '🥤',
    gradient: 'from-blue-600/20 to-red-600/20',
    description: 'Bold refreshment with maximum fizz',
    isAvailable: true,
  },
  {
    id: 'prod-fanta-50cl',
    name: 'Fanta Orange 50cl',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 400,
    unit: '50cl PET bottle',
    imageUrl: '',
    emoji: '🍊',
    gradient: 'from-orange-500/20 to-amber-500/20',
    description: 'Bright fruity sparkling orange drink',
    isAvailable: true,
  },
  {
    id: 'prod-sprite-50cl',
    name: 'Sprite Lemon-Lime 50cl',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 400,
    unit: '50cl PET bottle',
    imageUrl: '',
    emoji: '🍋',
    gradient: 'from-emerald-500/20 to-lime-500/20',
    description: 'Crisp, clean lemon-lime quench',
    isAvailable: true,
  },

  // --- DRINKS -> MALT & ENERGY ---
  {
    id: 'prod-malt-can',
    name: 'Maltina Can / Bottle',
    category: 'Drinks',
    subcategory: 'Malt & Energy',
    price: 500,
    unit: '33cl can',
    imageUrl: '/images/malt_drink_bottle_1792185952073.jpg',
    emoji: '🍺',
    gradient: 'from-amber-900/20 to-amber-700/20',
    description: 'Smooth nourishing premium malt drink',
    isAvailable: true,
  },
  {
    id: 'prod-fearless-energy',
    name: 'Fearless Energy Drink (Red Berry)',
    category: 'Drinks',
    subcategory: 'Malt & Energy',
    price: 400,
    unit: '50cl bottle',
    imageUrl: '',
    emoji: '⚡',
    gradient: 'from-red-600/20 to-orange-600/20',
    description: 'Taurine & caffeine late-night study booster',
    isAvailable: true,
  },
  {
    id: 'prod-monster-energy',
    name: 'Monster Energy Original 500ml',
    category: 'Drinks',
    subcategory: 'Malt & Energy',
    price: 1200,
    unit: '500ml can',
    imageUrl: '',
    emoji: '🔋',
    gradient: 'from-green-600/20 to-emerald-800/20',
    description: 'High performance energy blend',
    isAvailable: true,
  },

  // --- DRINKS -> JUICES & TRADITIONAL ---
  {
    id: 'prod-zobo-chilled',
    name: 'Special Chilled Spiced Zobo',
    category: 'Drinks',
    subcategory: 'Juices & Traditional',
    price: 350,
    unit: '50cl bottle',
    imageUrl: '',
    emoji: '🍷',
    gradient: 'from-rose-600/20 to-purple-700/20',
    description: 'Fresh hibiscus brewed with ginger, pineapple and cloves',
    isAvailable: true,
  },
  {
    id: 'prod-hollandia-yoghurt',
    name: 'Hollandia Yoghurt 1 Litre',
    category: 'Drinks',
    subcategory: 'Juices & Traditional',
    price: 2200,
    unit: '1 Litre pack',
    imageUrl: '',
    emoji: '🧃',
    gradient: 'from-amber-400/20 to-yellow-400/20',
    description: 'Thick and creamy sweetened strawberry yoghurt',
    isAvailable: true,
  },

  // --- TOILETRIES & HEALTH -> BATH & BODY ---
  {
    id: 'prod-dettol-soap',
    name: 'Dettol Original Antiseptic Soap',
    category: 'Toiletries',
    subcategory: 'Bath & Body',
    price: 450,
    unit: '1 bar',
    imageUrl: '',
    emoji: '🧼',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    description: 'Antibacterial skin protection bar',
    isAvailable: true,
  },
  {
    id: 'prod-premier-soap',
    name: 'Premier Cool Menthol Soap',
    category: 'Toiletries',
    subcategory: 'Bath & Body',
    price: 400,
    unit: '1 bar',
    imageUrl: '',
    emoji: '🧊',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    description: 'Icy cold freshness after hostel sports',
    isAvailable: true,
  },

  // --- TOILETRIES & HEALTH -> ORAL CARE ---
  {
    id: 'prod-closeup-paste',
    name: 'Close-Up Red Gel Toothpaste',
    category: 'Toiletries',
    subcategory: 'Oral Care',
    price: 700,
    unit: '140g tube',
    imageUrl: '',
    emoji: '🪥',
    gradient: 'from-red-500/20 to-rose-500/20',
    description: '12-hour fresh breath and antibacterial zinc',
    isAvailable: true,
  },

  // --- TOILETRIES & HEALTH -> SANITARY & PAPER ---
  {
    id: 'prod-pads-always',
    name: 'Always Ultra Night Pads',
    category: 'Toiletries',
    subcategory: 'Sanitary & Paper',
    price: 900,
    unit: 'Pack of 8',
    imageUrl: '',
    emoji: '🌸',
    gradient: 'from-pink-500/20 to-purple-500/20',
    description: 'Comfort lock wings with up to 100% leak protection',
    isAvailable: true,
  },
  {
    id: 'prod-tissue-roll',
    name: 'Soft Touch 2-Ply Toilet Tissue',
    category: 'Toiletries',
    subcategory: 'Sanitary & Paper',
    price: 400,
    unit: '1 roll',
    imageUrl: '',
    emoji: '🧻',
    gradient: 'from-slate-300/30 to-slate-400/20',
    description: 'Soft absorbent 2-ply bathroom roll',
    isAvailable: true,
  },

  // --- TOILETRIES & HEALTH -> FIRST AID & HEALTH ---
  {
    id: 'prod-panadol-extra',
    name: 'Panadol Extra Pack (ActiFast)',
    category: 'Toiletries',
    subcategory: 'First Aid & Health',
    price: 600,
    unit: '1 blister card (10 tablets)',
    imageUrl: '',
    emoji: '💊',
    gradient: 'from-red-500/20 to-amber-500/20',
    description: 'Rapid headache and exam fever relief',
    isAvailable: true,
  },

  // --- BOOKS & STATIONERY -> COURSE TEXTBOOKS ---
  {
    id: 'prod-book-maths',
    name: 'Engineering Mathematics (K.A. Stroud)',
    category: 'Books & Stationery',
    subcategory: 'Course Textbooks',
    price: 4500,
    unit: 'Paperback edition',
    imageUrl: '/images/math_textbook_1792245624167.jpg',
    emoji: '📐',
    gradient: 'from-blue-600/20 to-indigo-700/20',
    description: 'Comprehensive undergraduate calculus, algebra & engineering solutions',
    isAvailable: true,
  },
  {
    id: 'prod-book-econ',
    name: 'Introduction to Micro & Macro Economics',
    category: 'Books & Stationery',
    subcategory: 'Course Textbooks',
    price: 3800,
    unit: 'Campus Textbook',
    imageUrl: '',
    emoji: '📈',
    gradient: 'from-emerald-600/20 to-teal-700/20',
    description: 'Standard faculty curriculum guide with review past questions',
    isAvailable: true,
  },
  {
    id: 'prod-book-gst',
    name: 'GST 101: Use of English & Communication',
    category: 'Books & Stationery',
    subcategory: 'Course Textbooks',
    price: 2000,
    unit: 'Official Study Manual',
    imageUrl: '',
    emoji: '📖',
    gradient: 'from-amber-500/20 to-orange-600/20',
    description: 'Mandatory university general studies manual with test exercises',
    isAvailable: true,
  },
  {
    id: 'prod-book-chem',
    name: 'General Chemistry Principles & Lab Manual',
    category: 'Books & Stationery',
    subcategory: 'Course Textbooks',
    price: 3500,
    unit: 'Handbook',
    imageUrl: '',
    emoji: '🧪',
    gradient: 'from-cyan-600/20 to-blue-700/20',
    description: 'Physical & organic chemistry formulas and lab practical guide',
    isAvailable: true,
  },

  // --- BOOKS & STATIONERY -> NOTEBOOKS & NOTE PADS ---
  {
    id: 'prod-note-60leaves',
    name: '60 Leaves Ruled Exercise Book',
    category: 'Books & Stationery',
    subcategory: 'Notebooks & Note Pads',
    price: 250,
    unit: '1 book',
    imageUrl: '',
    emoji: '📝',
    gradient: 'from-yellow-400/20 to-amber-500/20',
    description: 'Standard lined student lecture exercise book',
    isAvailable: true,
  },
  {
    id: 'prod-note-hardcover-2b',
    name: 'Higher Education 2B Hardcover Notebook',
    category: 'Books & Stationery',
    subcategory: 'Notebooks & Note Pads',
    price: 1200,
    unit: '1 heavy hardcover note',
    imageUrl: '',
    emoji: '📓',
    gradient: 'from-slate-600/20 to-zinc-700/20',
    description: 'Durable cloth bound notebook for semester note-taking',
    isAvailable: true,
  },
  {
    id: 'prod-note-folder',
    name: 'Clear A4 Document Filing Folder',
    category: 'Books & Stationery',
    subcategory: 'Notebooks & Note Pads',
    price: 300,
    unit: '1 folder',
    imageUrl: '',
    emoji: '📁',
    gradient: 'from-sky-400/20 to-blue-500/20',
    description: 'Waterproof transparent folder for submitting project printouts',
    isAvailable: true,
  },

  // --- BOOKS & STATIONERY -> WRITING & MATERIALS ---
  {
    id: 'prod-pen-bic-pack',
    name: 'Bic Original Blue Ballpoint Pens (Pack of 10)',
    category: 'Books & Stationery',
    subcategory: 'Writing & Materials',
    price: 1000,
    unit: 'Box of 10 pens',
    imageUrl: '',
    emoji: '🖊️',
    gradient: 'from-blue-600/20 to-indigo-600/20',
    description: 'Smooth writing medium point exam pens',
    isAvailable: true,
  },
  {
    id: 'prod-pen-bic-single',
    name: 'Bic Ballpoint Pen (Single)',
    category: 'Books & Stationery',
    subcategory: 'Writing & Materials',
    price: 120,
    unit: '1 pen',
    imageUrl: '',
    emoji: '✒️',
    gradient: 'from-blue-500/20 to-sky-500/20',
    description: 'Quick single replacement pen for class',
    isAvailable: true,
  },
  {
    id: 'prod-math-set',
    name: 'Oxford Mathematical Instrument Set',
    category: 'Books & Stationery',
    subcategory: 'Writing & Materials',
    price: 1500,
    unit: 'Complete metal tin box',
    imageUrl: '',
    emoji: '📏',
    gradient: 'from-teal-600/20 to-emerald-700/20',
    description: 'Compass, protractor, set squares, ruler and stencil set',
    isAvailable: true,
  },
  {
    id: 'prod-highlighters',
    name: 'Fluorescent Highlighters (Pack of 4 Colors)',
    category: 'Books & Stationery',
    subcategory: 'Writing & Materials',
    price: 1200,
    unit: '4 pack (Yellow, Green, Pink, Blue)',
    imageUrl: '',
    emoji: '🖍️',
    gradient: 'from-yellow-400/20 to-pink-500/20',
    description: 'Smudge-proof quick dry textbook highlighters',
    isAvailable: true,
  },
];
