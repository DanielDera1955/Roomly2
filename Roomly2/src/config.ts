/**
 * Roomly - Central Configuration
 * Easy to edit categories, subcategories, products, prices, locations, and rules.
 */

import { CategoryDefinition, DeliveryRunner } from './types';

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
  bankDetails: {
    bankName: 'Kuda Microfinance Bank',
    accountNumber: '2048913401',
    accountName: 'Roomly Campus Logistics',
    instructions: 'Use your Order ID as payment narration/reference',
  },
  supportPhone: '08012345678',
  supportWhatsApp: '+2348012345678',
};

export interface DeliveryBatchOption {
  id: 'premium' | 'morning' | 'afternoon' | 'evening';
  name: string;
  timeWindow: string;
  price: number;
  badge: string;
  description: string;
}

export const DELIVERY_BATCHES: DeliveryBatchOption[] = [
  {
    id: 'premium',
    name: 'Premium Instant Delivery',
    timeWindow: 'Within 30 – 60 mins',
    price: 1500,
    badge: '30-60m Instant',
    description: 'Immediate runner dispatch direct to your room door for any item',
  },
  {
    id: 'morning',
    name: 'Morning Batch',
    timeWindow: '8:00 AM – 9:00 AM',
    price: 1000,
    badge: 'Morning Run',
    description: 'Packaged & dispatched during 8-9am campus delivery batch',
  },
  {
    id: 'afternoon',
    name: 'Afternoon Batch',
    timeWindow: '1:00 PM – 2:00 PM',
    price: 1000,
    badge: 'Afternoon Run',
    description: 'Packaged & dispatched during 1-2pm campus lunchtime batch',
  },
  {
    id: 'evening',
    name: 'Evening / Night Batch',
    timeWindow: '7:00 PM – 8:00 PM',
    price: 1000,
    badge: 'Night Run',
    description: 'Packaged & dispatched during 7-8pm dinner & hostel study batch',
  },
];

/**
 * Calculate delivery fee based on selected batch option:
 * Premium delivery = ₦1,500; Morning/Afternoon/Evening batches = ₦1,000
 */
export function calculateDeliveryFee(batchId: string = 'premium'): number {
  if (batchId === 'premium') {
    return STORE_CONFIG.deliveryFeePremium;
  }
  return STORE_CONFIG.deliveryFeeBatch;
}

// Campus buildings
export const CAMPUS_LOCATIONS: Record<string, string[]> = {
  Hostels: ['Hostel A', 'Hostel B', 'Hostel C', 'Hostel D'],
  Lodge: ['Lodge 1', 'Lodge 2', 'Lodge 3'],
};

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
