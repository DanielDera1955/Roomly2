/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getProducts,
  getCategories,
  getCustomerByPhone,
  createOrder,
  getOrderById,
  getMyOrders,
  subscribeOrder,
  advanceOrderStatus,
  getStoreStatus,
  setStoreOverride,
  isValidNigerianPhone,
  createProductRequest,
  subscribeProductRequest,
} from './api.js';
import { Product, isOutsideSource, shopGroupOf, shopGroupLabel, ITEMS_PER_PAGE, STORE_CONFIG, cartOf, CartKind, categoriesForStore, FOOD_EXTRAS } from './config';
import { MessageCircle, Sun, Sunrise, Moon, ShoppingBag, ChevronRight } from 'lucide-react';
import { StaffGate } from './components/StaffGate';
import { playChime } from './sound';
import { AdminSwitcher } from './components/AdminSwitcher';
import { OperatorPortal } from './components/OperatorPortal';
import { CartItem, CustomerProfile, OrderRecord, CategoryDefinition } from './types';
import { Header, PortalMode } from './components/Header';
import { PhoneLookupBar } from './components/PhoneLookupBar';
import { SearchBar } from './components/SearchBar';
import { DeliveryPromiseBanner } from './components/DeliveryPromiseBanner';
import { CategoryNav, ShopTab } from './components/CategoryNav';
import { ProductCard } from './components/ProductCard';
import { FoodCustomizerSheet } from './components/FoodCustomizerSheet';
import { ProductSheet, OrderAgainRow } from './components/ShopExtras';
import { RequestTab, RequestSide, RequestItemInput } from './components/RequestTab';
import { FloatingCartBar } from './components/FloatingCartBar';
import { CartSheet } from './components/CartSheet';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { OrderHistoryModal } from './components/OrderHistoryModal';
import { RunnerPortal } from './components/RunnerPortal';
import { AdminView } from './components/AdminView';

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('roomly_dark_mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Portal Mode: 'customer' | 'runner' | 'admin'
  const [currentPortal, setCurrentPortal] = useState<PortalMode>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('admin')) return 'admin';
      if (hash.includes('operator')) return 'operator';
      if (hash.includes('runner')) return 'runner';
      if (window.location.pathname.includes('/admin')) return 'admin';
      if (window.location.pathname.includes('/runner')) return 'runner';
    }
    return 'customer';
  });

  // Store status (6am - 11pm)
  const [storeStatus, setStoreStatus] = useState(() => getStoreStatus());

  // Categories & Products from API
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // Two categories per side: 'store' (Store Items) and 'food' (Cooked Food), plus the Request form
  const [selectedTab, setSelectedTab] = useState<ShopTab>('store');
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceMode, setSourceMode] = useState<'inside' | 'outside'>('inside');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  // The last section browsed (store or food), so the request form and delivery card know where the student is
  const [lastGroup, setLastGroup] = useState<'store' | 'food'>('store');
  useEffect(() => {
    if (selectedTab !== 'Request') setLastGroup(selectedTab);
  }, [selectedTab]);

  // Customer & Phone Lookup
  // Remember the customer on this device until they press Sign out
  const savedSession = (() => {
    try {
      return JSON.parse(localStorage.getItem('roomly_customer') || '{}');
    } catch (e) {
      return {};
    }
  })();
  const [phone, setPhone] = useState<string>(savedSession.phone || '');
  const [pin, setPin] = useState<string>(savedSession.pin || '');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<OrderRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customRequest, setCustomRequest] = useState<string>('');

  // Product requests: ids kept on this device; each is followed live until priced
  const [requestIds, setRequestIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('roomly_requests') || '[]').slice(0, 20);
    } catch (e) {
      return [];
    }
  });
  const [requests, setRequests] = useState<Record<string, any>>({});
  const [requestPrefill, setRequestPrefill] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  // Three carts: inside (runner), outside store items, outside cooked food and drinks
  const [cartKind, setCartKind] = useState<CartKind>('inside');

  // Food Customizer Bottom Sheet
  const [customizingFood, setCustomizingFood] = useState<Product | null>(null);

  // Order Tracking State
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState<OrderRecord[]>([]);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('roomly_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('roomly_dark_mode', 'false');
    }
  }, [darkMode]);

  // Keep the theme state in step with toggles made on other screens
  useEffect(() => {
    const sync = () => setDarkMode(document.documentElement.classList.contains('dark'));
    window.addEventListener('roomly-theme', sync);
    return () => window.removeEventListener('roomly-theme', sync);
  }, []);

  // Sync hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('admin')) setCurrentPortal('admin');
      else if (hash.includes('operator')) setCurrentPortal('operator');
      else if (hash.includes('runner')) setCurrentPortal('runner');
      else setCurrentPortal('customer');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectPortal = (portal: PortalMode) => {
    setCurrentPortal(portal);
    window.location.hash = portal === 'customer' ? '' : portal;
  };

  // Fetch initial catalog data
  const refreshCatalog = async () => {
    const [cats, prods] = await Promise.all([getCategories(), getProducts()]);
    setCategories(cats);
    setProducts(prods);
  };

  useEffect(() => {
    refreshCatalog();
  }, []);

  // Look up customer when valid phone number is entered
  useEffect(() => {
    if (isValidNigerianPhone(phone)) {
      getCustomerByPhone(phone, pin).then((cust) => {
        setCustomer(cust);
      });
    } else {
      setCustomer(null);
    }
  }, [phone, pin]);

  // Save the login on this device once the PIN is confirmed
  useEffect(() => {
    if (customer && !customer.wrongPin && /^\d{6}$/.test(pin) && phone) {
      try {
        localStorage.setItem('roomly_customer', JSON.stringify({ phone, pin }));
      } catch (e) {
        /* ignore */
      }
    }
  }, [customer, pin, phone]);

  const handleSignOut = () => {
    try {
      localStorage.removeItem('roomly_customer');
    } catch (e) {
      /* ignore */
    }
    setPhone('');
    setPin('');
    setCustomer(null);
    setHistoryOrders([]);
  };

  // "Active Orders & History": one screen that replaces My orders and Track
  const handleOpenHistory = async () => {
    setIsTrackerOpen(false);
    setHistoryOpen(true);
    if (!isValidNigerianPhone(phone) || !/^\d{6}$/.test(pin)) return;
    setHistoryLoading(true);
    setHistoryOrders(await getMyOrders(phone, pin));
    setHistoryLoading(false);
  };

  // Live updates for the order the customer is tracking
  useEffect(() => {
    if (!activeOrder?.id) return;
    let prevStatus: string | null = null;
    return subscribeOrder(activeOrder.id, (o: any) => {
      if (prevStatus && prevStatus !== o.status) playChime('chat');
      prevStatus = o.status;
      setActiveOrder(o as OrderRecord);
      setRecentOrders((prev) => prev.map((r) => (r.id === o.id ? (o as OrderRecord) : r)));
    });
  }, [activeOrder?.id]);

  // Store open/closed changes made by the admin
  useEffect(() => {
    const h = () => setStoreStatus(getStoreStatus());
    window.addEventListener('roomly-settings', h);
    return () => window.removeEventListener('roomly-settings', h);
  }, []);

  // ---------- Saved carts (on this phone): one for guests, one per signed-in number ----------
  const cartOwner =
    customer && customer.name && !customer.wrongPin && isValidNigerianPhone(phone) && /^\d{6}$/.test(pin) ? `u_${customer.phone || phone}` : 'guest';
  const [loadedOwner, setLoadedOwner] = useState('');
  const readCart = (owner: string): CartItem[] => {
    try {
      const v = JSON.parse(localStorage.getItem(`roomly_cart_${owner}`) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  };
  const writeCart = (owner: string, items: CartItem[]) => {
    try {
      if (items.length) localStorage.setItem(`roomly_cart_${owner}`, JSON.stringify(items));
      else localStorage.removeItem(`roomly_cart_${owner}`);
    } catch (e) {
      /* storage blocked: the cart still works for this visit */
    }
  };
  const mergeCarts = (a: CartItem[], b: CartItem[]) => {
    const out = [...a];
    b.forEach((it) => {
      const same = out.findIndex((x) => x.id === it.id && !it.isFood);
      if (same >= 0) {
        const q = out[same].quantity + it.quantity;
        out[same] = { ...out[same], quantity: q, totalPrice: q * out[same].unitPrice };
      } else out.push(it);
    });
    return out;
  };
  // Switch carts when someone signs in or out
  useEffect(() => {
    if (loadedOwner === cartOwner) return;
    if (!loadedOwner) {
      setCartItems(readCart(cartOwner));
    } else if (loadedOwner === 'guest') {
      // Guest signed in: what they picked joins their account cart
      setCartItems((prev) => mergeCarts(readCart(cartOwner), prev));
      writeCart('guest', []);
    } else {
      // Signed out: their cart stays saved under their number
      setCartItems(readCart(cartOwner));
    }
    setLoadedOwner(cartOwner);
  }, [cartOwner, loadedOwner]);
  // Save every change for the current owner
  useEffect(() => {
    if (loadedOwner && loadedOwner === cartOwner) writeCart(cartOwner, cartItems);
  }, [cartItems, cartOwner, loadedOwner]);
  // Today's prices: a saved cart follows the current store price; deleted products drop out
  useEffect(() => {
    if (!products.length) return;
    const byId = new Map(products.map((p) => [p.id, p]));
    setCartItems((prev) => {
      let changed = false;
      const next = prev
        .filter((it) => {
          if (it.pendingQuote || it.requestId || byId.has(it.productId)) return true;
          changed = true;
          return false;
        })
        .map((it) => {
          const p = byId.get(it.productId);
          if (!p || it.pendingQuote) return it;
          let unit = p.price;
          if (it.isFood && (it.plates !== undefined || it.extras?.length)) {
            const extras = (it.extras || []).map((e) => ({ ...e, price: FOOD_EXTRAS.find((f) => f.id === e.id)?.price ?? e.price }));
            unit = (it.plates || 0) * p.price + extras.reduce((sum, e) => sum + e.price * (e.quantity || 0), 0);
            if (unit === it.unitPrice) return it;
            changed = true;
            return { ...it, extras, unitPrice: unit, totalPrice: unit * it.quantity };
          }
          if (unit === it.unitPrice) return it;
          changed = true;
          return { ...it, unitPrice: unit, totalPrice: unit * it.quantity };
        });
      return changed ? next : prev;
    });
  }, [products, loadedOwner]);

  // Cart operations
  const handleAddSimpleProduct = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id && !i.isFood);
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item
        );
      }
      const newItem: CartItem = {
        id: `${product.id}-simple`,
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        totalPrice: product.price,
        imageUrl: product.imageUrl,
        emoji: product.emoji,
        source: product.source,
        isFood: false,
      };
      return [...prev, newItem];
    });
  };

  const handleRemoveSimpleProduct = (productId: string) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === productId && !i.isFood);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((i) => i.id !== existing.id);
      }
      return prev.map((item) =>
        item.id === existing.id
          ? {
              ...item,
              quantity: item.quantity - 1,
              totalPrice: (item.quantity - 1) * item.unitPrice,
            }
          : item
      );
    });
  };

  const handleAddCustomizedFood = (foodItem: CartItem) => {
    // Keep the product's source so outside food reaches the food operator
    const source = foodItem.source ?? customizingFood?.source;
    setCartItems((prev) => [...prev, source ? { ...foodItem, source } : foodItem]);
  };

  const handleUpdateCartQuantity = (cartItemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalPrice: newQty * item.unitPrice,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== cartItemId));
  };

  // Reorder / Load Last Order into cart
  const handleQuickReorder = (items: CartItem[]) => {
    setCartItems(
      items.map((item) => ({
        ...item,
        id: `${item.productId}-${Date.now()}-${Math.random()}`,
      }))
    );
    openCart();
  };

  // ---------- Product requests ----------
  useEffect(() => {
    try {
      localStorage.setItem('roomly_requests', JSON.stringify(requestIds.slice(0, 20)));
    } catch (e) {
      /* ignore */
    }
    const subs = requestIds.map((id) => subscribeProductRequest(id, (r: any) => setRequests((prev) => ({ ...prev, [id]: r }))));
    return () => subs.forEach((u) => u());
  }, [requestIds.join('|')]);

  const sideSource = (side: RequestSide) => (side === 'store' ? 'outside' : side === 'food' ? 'food' : 'school') as CartItem['source'];

  const handleSubmitRequest = async (side: RequestSide, items: RequestItemInput[], note: string, addToCart: boolean) => {
    const id = await createProductRequest({
      side,
      items,
      note,
      category: selectedFilter !== 'All' ? selectedFilter : '',
      phone,
      name: customer?.name || '',
    });
    setRequestIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 20));
    if (addToCart) {
      // Placeholders: the cart cannot be checked out until the price comes back
      setCartItems((prev) => [
        ...prev,
        ...items.map((it, i) => ({
          id: `req-${id}-${i}`,
          productId: `req:${id}:${i}`,
          name: it.name.trim(),
          unitPrice: 0,
          quantity: 1,
          totalPrice: 0,
          imageUrl: it.photoUrl || '',
          emoji: '🛍️',
          source: sideSource(side),
          isFood: false,
          pendingQuote: true,
          requestId: id,
          requestIdx: i,
        })),
      ]);
    }
  };

  const handleAddQuoteToCart = (r: any) => {
    const side = r.side as RequestSide;
    setCartItems((prev) => [
      ...prev.filter((i) => i.requestId !== r.id),
      ...r.quotes
        .map((q: any, i: number) =>
          q.available
            ? {
                id: `req-${r.id}-${i}`,
                productId: q.productId,
                name: q.name,
                unitPrice: q.price,
                quantity: 1,
                totalPrice: q.price,
                imageUrl: r.items[i]?.photoUrl || '',
                emoji: '🛍️',
                source: sideSource(side),
                isFood: false,
                requestId: r.id,
                requestIdx: i,
              }
            : null
        )
        .filter(Boolean),
    ]);
    openCart();
  };

  // When a price comes back, fill it into the waiting cart items (or drop items that are not available)
  useEffect(() => {
    setCartItems((prev) => {
      let changed = false;
      const next = prev
        .map((i) => {
          if (!i.pendingQuote || !i.requestId) return i;
          const r = requests[i.requestId];
          if (!r || r.status !== 'quoted') return i;
          changed = true;
          const q = r.quotes?.[i.requestIdx ?? -1];
          if (!q || !q.available) return null;
          return { ...i, productId: q.productId, unitPrice: q.price, totalPrice: q.price * i.quantity, pendingQuote: false };
        })
        .filter(Boolean) as CartItem[];
      return changed ? next : prev;
    });
  }, [requests]);

  // Place Order flow
  const handlePlaceOrder = async (orderPayload: any) => {
    if (customer?.wrongPin) {
      window.alert('This phone number is already registered. Enter the correct PIN at the top, or ask Roomly to reset it.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      window.alert('Please enter a 6-digit PIN at the top of the page. It saves your details for next time.');
      return;
    }
    try {
      const order = await createOrder({ ...orderPayload, pin });
      const newOrder = order as OrderRecord;
      setActiveOrder(newOrder);
      setRecentOrders((prev) => [newOrder, ...prev]);

      // Only the cart that was checked out is emptied; the other carts stay
      const placed: CartKind = orderPayload.cart || 'inside';
      setCartItems((prev) => prev.filter((i) => cartOf(i) !== placed));
      if (placed === 'inside') setCustomRequest('');
      setIsCartOpen(false);

      if (orderPayload.phone) {
        const updatedCust = await getCustomerByPhone(orderPayload.phone, pin);
        setCustomer(updatedCust);
      }

      setIsTrackerOpen(true);
    } catch (err: any) {
      console.error('Order creation error:', err);
      window.alert(err?.message || 'Could not place your order. Check your connection and try again.');
    }
  };

  // Cart sizes, and which cart opens: the side being browsed, else the first cart with items
  const cartCounts = useMemo(() => {
    const c: Record<CartKind, number> = { inside: customRequest ? 1 : 0, store: 0, food: 0 };
    cartItems.forEach((i) => (c[cartOf(i)] += i.quantity));
    return c;
  }, [cartItems, customRequest]);
  const openCart = () => {
    const preferred: CartKind[] = sourceMode === 'outside' ? ['store', 'food', 'inside'] : ['inside', 'store', 'food'];
    setCartKind(preferred.find((k) => cartCounts[k] > 0) || preferred[0]);
    setIsCartOpen(true);
  };

  // Advance Status Demo Handler
  const handleAdvanceStatus = async (orderId: string) => {
    const rawUpdated = await advanceOrderStatus(orderId);
    const updated = rawUpdated as OrderRecord | null;
    if (updated) {
      if (activeOrder?.id === orderId) {
        setActiveOrder(updated);
      }
      setRecentOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));

      if (updated.status === 'Delivered' && customer?.phone === updated.phone) {
        const refreshed = await getCustomerByPhone(updated.phone, pin);
        setCustomer(refreshed);
      }
    }
    return updated;
  };

  // Items count & subtotal calculation
  const totalItemsCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const totalItemsPrice = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [cartItems]);

  // Product quantity lookup map
  const productQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    cartItems.forEach((item) => {
      if (!item.isFood) {
        map[item.productId] = (map[item.productId] || 0) + item.quantity;
      }
    });
    return map;
  }, [cartItems]);

  // Products on the chosen side (inside or outside school)
  const sideProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.isAvailable !== false && // out-of-stock items are hidden from students
          (sourceMode === 'outside' ? isOutsideSource(p.source) : !isOutsideSource(p.source))
      ),
    [products, sourceMode]
  );

  // Quick filters inside a category, taken from the products' own categories (Drinks, Toiletries...)
  const groupFilters = useMemo(() => {
    if (selectedTab === 'Request') return [];
    // Every category of this store always shows (even empty), in the store's standard order.
    // Products without a category, or with another store's category, show under All only.
    if (sourceMode === 'inside') {
      // Inside: Store Items gets the inside categories; the Cooked Food tab needs none
      if (selectedTab === 'food') return [];
      return categoriesForStore(categories, 'inside')
        .map((c) => c.name)
        .filter((n) => n.toLowerCase() !== 'food');
    }
    return categoriesForStore(categories, selectedTab === 'food' ? 'food' : 'store').map((c) => c.name);
  }, [categories, selectedTab, sourceMode]);

  // Search first; otherwise the chosen category and filter
  const filteredProducts = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return sideProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.subcategory.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }
    if (selectedTab === 'Request') return [];
    let list = sideProducts.filter((p) => shopGroupOf(p) === selectedTab);
    if (selectedFilter !== 'All') list = list.filter((p) => p.category.toLowerCase() === selectedFilter.toLowerCase());
    return list;
  }, [sideProducts, selectedTab, selectedFilter, searchQuery]);

  // Only 10 items load at a time; Show more loads the next 10
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [sourceMode, selectedTab, selectedFilter, searchQuery]);
  const visibleProducts = filteredProducts.slice(0, visibleCount);

  // Orders for the Active Orders & History screen: only paid ones (or pay on delivery),
  // plus the order just placed in this session so the student can still pay for it
  const screenOrders = useMemo(() => {
    const byId = new Map<string, OrderRecord>();
    [...historyOrders, ...recentOrders].forEach((o) => byId.set(o.id, o));
    if (activeOrder) byId.set(activeOrder.id, activeOrder);
    return Array.from(byId.values())
      .filter((o) => o.paymentStatus !== 'unpaid' || o.id === activeOrder?.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [historyOrders, recentOrders, activeOrder]);
  const activeOrderCount = screenOrders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length;

  // Hero greeting: guests, signed-in students without a finished order, and returning students
  const signedInCustomer = Boolean(customer?.name) && !customer?.wrongPin && isValidNigerianPhone(phone) && /^\d{6}$/.test(pin);
  const firstName = String(customer?.name || '').trim().split(/\s+/)[0] || '';
  const hasCompletedOrder =
    signedInCustomer &&
    ((customer?.deliveredOrdersCount || 0) > 0 || screenOrders.some((o) => o.status === 'Delivered' && o.paymentStatus !== 'unpaid'));
  const hour = new Date().getHours();
  const dayPart = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const heroGreeting = hasCompletedOrder
    ? `${dayPart}, ${firstName}. It's nice to have you back.`
    : signedInCustomer && firstName
    ? `Hi ${firstName}, we've got you covered.`
    : "Hi there, we've got you covered.";

  // Signed-in students: load their order history once, for "Order again" and the greeting
  const historyLoadedFor = useRef('');
  useEffect(() => {
    if (!signedInCustomer) {
      historyLoadedFor.current = '';
      return;
    }
    if (historyLoadedFor.current === phone) return;
    historyLoadedFor.current = phone;
    getMyOrders(phone, pin)
      .then((list: OrderRecord[]) => setHistoryOrders(list))
      .catch(() => {
        historyLoadedFor.current = '';
      });
  }, [signedInCustomer, phone, pin]);

  // "Order again": their most-bought items on this side, from delivered orders
  const orderAgain = useMemo(() => {
    if (!signedInCustomer) return [] as Product[];
    const counts: Record<string, number> = {};
    screenOrders
      .filter((o) => o.status === 'Delivered')
      .forEach((o) => (o.items || []).forEach((i) => {
        if (!i.isFood && i.productId) counts[i.productId] = (counts[i.productId] || 0) + (i.quantity || 1);
      }));
    const byId = new Map(sideProducts.map((p) => [p.id, p]));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 6);
  }, [signedInCustomer, screenOrders, sideProducts]);

  // Tap a product: details and similar items
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const handleToggleStoreHoursOverride = () => {
    const current = storeStatus.isOpen;
    const nextStatus = setStoreOverride(!current);
    setStoreStatus(nextStatus);
  };

  // RENDER PORTAL 1: DELIVERY RUNNER PORTAL
  if (currentPortal === 'runner') {
    return (
      <StaffGate role="runner" onBack={() => handleSelectPortal('customer')}>
      <AdminSwitcher current="runner" onSelect={handleSelectPortal} />
      <RunnerPortal
        onBackToCustomer={() => handleSelectPortal('customer')}
        onOrderUpdated={async () => {
          if (activeOrder) {
            const refreshed = await getOrderById(activeOrder.id);
            if (refreshed) setActiveOrder(refreshed);
          }
        }}
      />
      </StaffGate>
    );
  }

  // RENDER OPERATOR PORTAL (store and food operators)
  if (currentPortal === 'operator') {
    return (
      <StaffGate role="operator" onBack={() => handleSelectPortal('customer')}>
        <AdminSwitcher current="operator" onSelect={handleSelectPortal} />
        <OperatorPortal onBack={() => handleSelectPortal('customer')} />
      </StaffGate>
    );
  }

  // RENDER PORTAL 2: ADMIN PORTAL
  if (currentPortal === 'admin') {
    return (
      <StaffGate role="admin" onBack={() => handleSelectPortal('customer')}>
      <AdminSwitcher current="admin" onSelect={handleSelectPortal} />
      <AdminView
        onBackToStore={() => {
          handleSelectPortal('customer');
          refreshCatalog();
        }}
        onOrderUpdated={async () => {
          if (activeOrder) {
            const refreshed = await getOrderById(activeOrder.id);
            if (refreshed) setActiveOrder(refreshed);
          }
          refreshCatalog();
        }}
      />
      </StaffGate>
    );
  }

  // RENDER PORTAL 3: CUSTOMER STOREFRONT
  return (
    <div className="min-h-screen bg-[#e8efeb] dark:bg-slate-950 flex justify-center selection:bg-[#0e9f55]/20">
      <div className="w-full max-w-[480px] bg-[#f4f8f6] dark:bg-slate-900 min-h-screen flex flex-col relative shadow-2xl border-x border-slate-200/60 dark:border-slate-800/60 pb-24">
        <AdminSwitcher current="customer" onSelect={handleSelectPortal} />
        {/* Header */}
        <Header
          currentPortal={currentPortal}
          onSelectPortal={handleSelectPortal}
          customer={customer}
          storeStatus={storeStatus}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onOpenTracker={handleOpenHistory}
          onToggleStoreHoursOverride={handleToggleStoreHoursOverride}
          activeOrderCount={activeOrderCount}
          signedIn={signedInCustomer}
          onSignOut={handleSignOut}
        />

        {/* Main Storefront Body */}
        <main className="p-4 space-y-4 flex-1">

          {/* Phone Number Input & Customer Recognition */}
          <div className="-mx-4 -mt-4 px-4 pt-5 pb-3 bg-gradient-to-b from-emerald-100/70 to-transparent dark:from-emerald-950/40">
            {hasCompletedOrder ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 rounded-full bg-amber-300/40 dark:bg-emerald-400/20 blur-md" />
                    <div className="relative w-12 h-12 rounded-full bg-white/80 dark:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/60 shadow-sm flex items-center justify-center">
                      {dayPart === 'Good morning' ? (
                        <Sunrise className="w-6 h-6 text-amber-500" />
                      ) : dayPart === 'Good afternoon' ? (
                        <Sun className="w-6 h-6 text-amber-500" />
                      ) : (
                        <Moon className="w-5 h-5 text-indigo-400 dark:text-emerald-300" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0b8044] dark:text-[#0e9f55]">{dayPart}</p>
                    <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight truncate">{firstName}</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Nice to have you back.</p>
                  </div>
                </div>
                {activeOrderCount > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenHistory}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900 text-xs font-bold text-[#0b8044] dark:text-[#0e9f55] shadow-xs cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {activeOrderCount} {activeOrderCount === 1 ? 'order' : 'orders'} on the way
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="font-semibold text-[#0b8044] dark:text-[#0e9f55] leading-snug text-sm mb-1">{heroGreeting}</p>
            )}
            {!hasCompletedOrder && (
              <>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-snug">
                  Order Food and Other Items Within and Outside School
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Delivered to your hostel room or the school gate in scheduled batches.
                </p>
              </>
            )}
          </div>

          {/* Sign-in box: guests only. Signed-in students use the Orders and Account buttons in the header */}
          {!signedInCustomer && (
            <PhoneLookupBar
              phone={phone}
              onPhoneChange={setPhone}
              pin={pin}
              onPinChange={setPin}
              customer={customer}
              onOpenHistory={handleOpenHistory}
              onSignOut={handleSignOut}
              cartCount={cartItems.reduce((n, i) => n + i.quantity, 0)}
            />
          )}

          {/* Inside school or outside school */}
          <div>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70">
              {(['inside', 'outside'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSourceMode(m)}
                  className={`py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all ${
                    sourceMode === m
                      ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {m === 'inside' ? 'Inside school' : 'Outside school'}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery bar: changes with the toggle above */}
          <DeliveryPromiseBanner mode={sourceMode} tab={lastGroup} />

          {/* Search Bar */}
          <SearchBar query={searchQuery} onChange={setSearchQuery} />

          {!searchQuery && (
            <OrderAgainRow
              items={orderAgain}
              qtyOf={(id) => productQuantityMap[id] || 0}
              onAdd={handleAddSimpleProduct}
              onOpen={setDetailProduct}
            />
          )}

          {/* Two categories per side */}
          {!searchQuery && (
            <CategoryNav
              side={sourceMode}
              selected={selectedTab}
              onSelect={setSelectedTab}
              filters={groupFilters}
              selectedFilter={selectedFilter}
              onSelectFilter={setSelectedFilter}
              requestCount={customRequest ? 1 : 0}
            />
          )}

          {/* Request Tab vs Product Grid */}
          {!searchQuery && selectedTab === 'Request' ? (
            <RequestTab
              key={requestPrefill}
              defaultSide={sourceMode === 'inside' ? 'inside' : lastGroup}
              outside={sourceMode === 'outside'}
              initialName={requestPrefill}
              myRequests={requestIds.map((id) => requests[id]).filter(Boolean)}
              cartRequestIds={new Set(cartItems.map((i) => i.requestId || '').filter(Boolean))}
              onSubmit={handleSubmitRequest}
              onAddQuoteToCart={handleAddQuoteToCart}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {searchQuery
                      ? `Search: "${searchQuery}"`
                      : selectedTab === 'Request'
                      ? ''
                      : selectedFilter !== 'All'
                      ? `${shopGroupLabel(selectedTab, sourceMode)} › ${selectedFilter}`
                      : shopGroupLabel(selectedTab, sourceMode)}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} available
                    {filteredProducts.length > visibleCount ? `, showing ${visibleCount}. Search to find any item fast.` : ''}
                  </p>
                </div>

                {selectedTab === 'food' && !searchQuery && (
                  <span className="text-[10px] font-bold text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    0-plate protein orders supported
                  </span>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs space-y-3">
                  <p>{searchQuery ? `We don't have "${searchQuery}" yet.` : 'Nothing here yet. Tell us what you want and we will add it.'}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestPrefill(searchQuery.trim());
                      setSearchQuery('');
                      setSelectedTab('Request');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#0e9f55] text-white font-bold cursor-pointer"
                  >
                    Request a product
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {visibleProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        quantity={productQuantityMap[product.id] || 0}
                        onAdd={handleAddSimpleProduct}
                        onRemove={handleRemoveSimpleProduct}
                        onOpenFoodCustomizer={(prod) => setCustomizingFood(prod)}
                        onOpenDetails={setDetailProduct}
                      />
                    ))}
                  </div>
                  {filteredProducts.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + ITEMS_PER_PAGE)}
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Show more ({filteredProducts.length - visibleCount} more)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Feedback on WhatsApp */}
          <a
            href={`https://wa.me/${STORE_CONFIG.feedbackWhatsApp}?text=${encodeURIComponent('Hi Roomly, I have a suggestion / complaint: ')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs font-bold text-[#0e9f55]"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Suggest a feature or send a complaint on WhatsApp</span>
          </a>
        </main>

        {/* Floating Cart Bar */}
        <FloatingCartBar
          totalItems={totalItemsCount}
          totalPrice={totalItemsPrice}
          hasCustomRequest={Boolean(customRequest)}
          onOpenCart={openCart}
        />

        <ProductSheet
          product={detailProduct}
          pool={sideProducts}
          qtyOf={(id) => productQuantityMap[id] || 0}
          onAdd={handleAddSimpleProduct}
          onRemove={handleRemoveSimpleProduct}
          onOpen={setDetailProduct}
          onClose={() => setDetailProduct(null)}
        />

        {/* Food Customizer Bottom Sheet (with 0-plate support!) */}
        <FoodCustomizerSheet
          product={customizingFood}
          onClose={() => setCustomizingFood(null)}
          onAddToCart={handleAddCustomizedFood}
        />

        {/* Cart & Checkout Sheet (with 500/1000 fee and no-cancellation verification) */}
        <CartSheet
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cart={cartKind}
          cartCounts={cartCounts}
          onSwitchCart={setCartKind}
          allItems={cartItems}
          items={cartItems.filter((i) => cartOf(i) === cartKind)}
          customRequest={cartKind === 'inside' ? customRequest : ''}
          onUpdateQuantity={handleUpdateCartQuantity}
          onRemoveItem={handleRemoveCartItem}
          onRemoveCustomRequest={() => setCustomRequest('')}
          customer={customer}
          phone={phone}
          onPhoneChange={setPhone}
          onPlaceOrder={handlePlaceOrder}
        />

        {/* Order Status & Live Runner Tracker Modal */}
        <OrderHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          orders={screenOrders}
          loading={historyLoading}
          signedIn={isValidNigerianPhone(phone) && /^\d{6}$/.test(pin) && !customer?.wrongPin}
          onSelect={(o) => {
            setActiveOrder(o);
            setHistoryOpen(false);
            setIsTrackerOpen(true);
          }}
        />

        <OrderTrackerModal
          isOpen={isTrackerOpen}
          onClose={() => setIsTrackerOpen(false)}
          onOpenAll={handleOpenHistory}
          order={activeOrder}
          onSearchOrderId={async (orderId) => {
            const found = await getOrderById(orderId);
            return found as OrderRecord | null;
          }}
          onAdvanceStatus={handleAdvanceStatus}
          userOrders={recentOrders}
          onSelectOrder={(ord) => setActiveOrder(ord)}
          onPaymentSent={(updated) => {
            setActiveOrder(updated);
            setRecentOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          }}
        />
      </div>
    </div>
  );
}
