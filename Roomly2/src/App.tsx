/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getProducts,
  getCategories,
  getCustomerByPhone,
  subscribeAnnouncement,
  createOrder,
  getOrderById,
  getMyOrders,
  subscribeOrder,
  advanceOrderStatus,
  getStoreStatus,
  setStoreOverride,
  isValidNigerianPhone,
  isValidPin,
  createProductRequest,
  subscribeProductRequest,
} from './api.js';
import { openDateText, SCHOOL_NAME, ShopGroup, Product, isOutsideSource, shopGroupOf, shopGroupLabel, ITEMS_PER_PAGE, STORE_CONFIG, cartOf, CartKind, categoriesForStore, Announcement, announcementActive, announcementKey } from './config';
import { MessageCircle } from 'lucide-react';
import { StaffGate } from './components/StaffGate';
import { playChime } from './sound';
import { notify } from './notify';
import { AdminSwitcher } from './components/AdminSwitcher';
import { OperatorPortal } from './components/OperatorPortal';
import { CartItem, CustomerProfile, OrderRecord, CategoryDefinition, orderStageOf, isActiveOrder } from './types';
import { Header, PortalMode } from './components/Header';
import { PhoneLookupBar } from './components/PhoneLookupBar';
import { SearchBar } from './components/SearchBar';
import { DeliveryPromiseBanner } from './components/DeliveryPromiseBanner';
import { CategoryNav, ShopTab } from './components/CategoryNav';
import { HostelHub } from './components/HostelHub';
import { HowRoomlyWorks } from './components/HowRoomlyWorks';
import { subscribeHubSettings, outsideStoreOpensAt } from './hub.js';
import { ProductCard } from './components/ProductCard';
import { FoodCustomizerSheet } from './components/FoodCustomizerSheet';
import { ProductSheet, OrderAgainRow, FeaturedRow, PairingsBar } from './components/ShopExtras';
import { HomeBanner } from './components/HomeBanner';
import { RequestTab, RequestSide, RequestItemInput } from './components/RequestTab';
import { FloatingCartBar } from './components/FloatingCartBar';
import { CartSheet } from './components/CartSheet';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { InstallBanner } from './components/InstallPrompt';
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
      // Staff reopen where they left off (only staff ever save a work screen here)
      try {
        const last = localStorage.getItem('roomly_last_portal');
        if (last === 'runner' || last === 'operator' || last === 'admin') return last;
      } catch {
        /* storage blocked: start on the customer screen */
      }
    }
    return 'customer';
  });

  // Store status (6am - 11pm)
  const [storeStatus, setStoreStatus] = useState(() => getStoreStatus());

  // Categories & Products from API
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // Outside store items open on launch day (Admin > Hub & Games can change the date or open it now)
  const [hubSettings, setHubSettings] = useState<any>({});
  useEffect(() => subscribeHubSettings(setHubSettings), []);
  const storeOpensMs = outsideStoreOpensAt(hubSettings);
  const [clockMs, setClockMs] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const storeLocked = storeOpensMs > clockMs;
  // The app opens on the side and category of the student's last placed order (saved on this phone).
  // Nothing saved, or unreadable storage: Inside school > Store Items.
  const lastShop = useMemo(() => {
    // A WhatsApp link from Games (?game= or ?match=) opens Hostel Hub > Games
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('game') || q.get('match')) {
        localStorage.setItem('roomly_hub_section', 'games');
        return { side: 'inside', tab: 'hub' } as { side: 'inside' | 'outside'; tab: 'store' | 'food' | 'hub' };
      }
    } catch {}
    try {
      const v = JSON.parse(localStorage.getItem('roomly_last_shop') || '{}');
      return {
        side: v.side === 'outside' ? 'outside' : 'inside',
        tab: v.tab === 'food' ? 'food' : 'store',
      } as { side: 'inside' | 'outside'; tab: 'store' | 'food' | 'hub' };
    } catch {
      return { side: 'inside', tab: 'store' } as { side: 'inside' | 'outside'; tab: 'store' | 'food' | 'hub' };
    }
  }, []);
  // Two categories per side: 'store' (Store Items) and 'food' (Cooked Food), plus the Request form
  const [selectedTab, setSelectedTab] = useState<ShopTab>(lastShop.tab);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  // Header "Sign in" popup for guests (returning students on a new phone)
  const [signInOpen, setSignInOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<'inside' | 'outside'>(lastShop.side);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  // The last section browsed (store or food), so the request form and delivery card know where the student is
  const [lastGroup, setLastGroup] = useState<'store' | 'food'>(lastShop.tab === 'food' ? 'food' : 'store');
  useEffect(() => {
    if (selectedTab !== 'Request' && selectedTab !== 'hub') setLastGroup(selectedTab);
  }, [selectedTab]);
  // Hostel Hub is inside school only
  useEffect(() => {
    if (sourceMode === 'outside' && selectedTab === 'hub') setSelectedTab('store');
  }, [sourceMode, selectedTab]);

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
  // A new student can type a name at sign-in (optional). It is kept on this device only until their first order saves a profile.
  const [localName, setLocalName] = useState<string>(savedSession.name || '');
  const [introPhone, setIntroPhone] = useState<string>(savedSession.intro || '');
  const [customerLoaded, setCustomerLoaded] = useState(false);
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

  // Remember the last screen (the staff link or switch), so staff reopen straight into their work screen
  useEffect(() => {
    try {
      localStorage.setItem('roomly_last_portal', currentPortal);
    } catch {
      /* storage blocked: start on the customer screen next time */
    }
  }, [currentPortal]);

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
    setCustomerLoaded(false);
    if (isValidNigerianPhone(phone)) {
      let stale = false;
      getCustomerByPhone(phone, pin).then((cust) => {
        if (stale) return;
        setCustomer(cust);
        setCustomerLoaded(true);
      });
      return () => {
        stale = true;
      };
    }
    setCustomer(null);
  }, [phone, pin]);

  // Save the login on this device once the PIN is confirmed
  useEffect(() => {
    if (customer && !customer.wrongPin && isValidPin(pin) && phone) {
      try {
        localStorage.setItem('roomly_customer', JSON.stringify({ phone, pin, name: localName, intro: introPhone }));
      } catch (e) {
        /* ignore */
      }
    }
  }, [customer, pin, phone, localName, introPhone]);

  // "Continue" for a new number: remember the phone, PIN and optional name on this device
  const handleContinueNew = () => {
    const nm = localName.trim();
    setLocalName(nm);
    setIntroPhone(phone);
    try {
      localStorage.setItem('roomly_customer', JSON.stringify({ phone, pin, name: nm, intro: phone }));
    } catch (e) {
      /* ignore */
    }
  };

  const handleSignOut = () => {
    try {
      localStorage.removeItem('roomly_customer');
    } catch (e) {
      /* ignore */
    }
    setPhone('');
    setPin('');
    setLocalName('');
    setIntroPhone('');
    setCustomer(null);
    setHistoryOrders([]);
  };

  // "Active Orders & History": one screen that replaces My orders and Track
  const handleOpenHistory = async () => {
    setIsTrackerOpen(false);
    setHistoryOpen(true);
    if (!isValidNigerianPhone(phone) || !isValidPin(pin)) return;
    setHistoryLoading(true);
    setHistoryOrders(await getMyOrders(phone, pin));
    setHistoryLoading(false);
  };

  // Each step of an order (packaging, on its way, delivered): a sound and a phone notification if allowed
  const stageSeen = useRef<Record<string, string>>({});
  const announceStage = (o: OrderRecord) => {
    const st = orderStageOf(o);
    const before = stageSeen.current[o.id];
    stageSeen.current[o.id] = st;
    if (!before || before === st) return;
    const outside = o.cart === 'store' || o.cart === 'food';
    const msg =
      st === 'packaging'
        ? 'Payment confirmed. Your order is being packaged.'
        : st === 'onway'
        ? outside
          ? 'Your order is on its way to the gate. It will be there in under 15 minutes.'
          : 'Your order is on its way to you.'
        : st === 'delivered'
        ? outside
          ? 'Your order should be at the school gate now. Please collect it.'
          : 'Your order has been delivered. Enjoy!'
        : '';
    if (!msg) return;
    playChime('chat');
    notify('Roomly', msg, 'roomly-order-' + o.id);
  };
  // One live order changed: update it everywhere it is shown
  const applyLiveOrder = (o: OrderRecord) => {
    announceStage(o);
    setRecentOrders((prev) => prev.map((r) => (r.id === o.id ? o : r)));
    setHistoryOrders((prev) => prev.map((r) => (r.id === o.id ? o : r)));
  };

  // Live updates for the order the customer is tracking
  useEffect(() => {
    if (!activeOrder?.id) return;
    return subscribeOrder(activeOrder.id, (o: any) => {
      setActiveOrder(o as OrderRecord);
      applyLiveOrder(o as OrderRecord);
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
    customer && customer.name && !customer.wrongPin && isValidNigerianPhone(phone) && isValidPin(pin) ? `u_${customer.phone || phone}` : 'guest';
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
            const opts = [...(p.extras || []), ...(p.choices || []).map((c) => ({ ...c, id: `choice-${c.id}` }))];
            const extras = (it.extras || []).map((e) => ({ ...e, price: opts.find((f) => f.id === e.id)?.price ?? e.price }));
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

  // "Goes well with": which product's suggestions are showing (and a counter so each add restarts the timer)
  const [pairFor, setPairFor] = useState<{ id: string; n: number } | null>(null);
  const showPairs = (p?: Product | null) => {
    if (p && (p.pairsWith || []).length) setPairFor((cur) => ({ id: p.id, n: (cur?.n || 0) + 1 }));
  };
  useEffect(() => {
    if (!pairFor) return;
    const t = window.setTimeout(() => setPairFor(null), 12000);
    return () => window.clearTimeout(t);
  }, [pairFor]);

  // Cart operations
  const handleAddSimpleProduct = (product: Product) => {
    if (storeLocked && cartOf(product) === 'store') {
      window.alert(`Outside store orders open ${openDateText(storeOpensMs)}. You can browse until then.`);
      return;
    }
    addSimpleToCart(product);
    showPairs(product);
  };
  const addSimpleToCart = (product: Product) => {
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
    showPairs(products.find((p) => p.id === foodItem.productId));
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

  // A price came back: tell the student (phone notification if allowed, plus a banner here)
  const [priceReady, setPriceReady] = useState('');
  const requestStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    Object.entries(requests).forEach(([id, r]: [string, any]) => {
      if (!r) return;
      const before = requestStatus.current[id];
      requestStatus.current[id] = r.status;
      if (before === 'open' && r.status === 'quoted') {
        const names = (r.quotes || []).filter((q: any) => q.available).map((q: any) => q.name);
        const text = names.length
          ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ' and more' : ''} priced and saved in your cart. You can check out now.`
          : 'Sorry, your requested item is not available right now.';
        setPriceReady(text);
        playChime('chat');
        notify('Your price is ready', text, 'roomly-price-' + id);
      }
    });
  }, [requests]);

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
      window.alert('This phone number is already registered. Enter your PIN in the checkout form, or ask Roomly on WhatsApp to reset it.');
      return;
    }
    if (!isValidPin(pin)) {
      window.alert('Please create your 4-digit PIN in the checkout form. It saves your details for next time.');
      return;
    }
    try {
      const order = await createOrder({ ...orderPayload, pin });
      const newOrder = order as OrderRecord;
      setActiveOrder(newOrder);
      setRecentOrders((prev) => [newOrder, ...prev]);

      // Only the cart that was checked out is emptied; the other carts stay
      const placed: CartKind = orderPayload.cart || 'inside';

      // Remember this order's side and category so the app opens there next time.
      // Inside: Food only when every item in the cart was food, otherwise Store Items.
      try {
        const placedItems = cartItems.filter((i) => cartOf(i) === placed);
        const insideAllFood = placedItems.length > 0 && placedItems.every((i) => i.isFood);
        const shop =
          placed === 'store'
            ? { side: 'outside', tab: 'store' }
            : placed === 'food'
              ? { side: 'outside', tab: 'food' }
              : { side: 'inside', tab: insideAllFood ? 'food' : 'store' };
        localStorage.setItem('roomly_last_shop', JSON.stringify(shop));
      } catch {
        // Storage blocked (private browsing): the app just opens on the normal default
      }

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
    if (selectedTab === 'Request' || selectedTab === 'hub') return [];
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
    if (selectedTab === 'Request' || selectedTab === 'hub') return [];
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
  const activeOrderCount = screenOrders.filter((o) => isActiveOrder(o)).length;

  // Live updates for every active order (not only the one open), so each step shows the moment it happens
  const liveIds = screenOrders
    .filter((o) => o.paymentStatus !== 'unpaid' && isActiveOrder(o) && o.id !== activeOrder?.id)
    .map((o) => o.id)
    .slice(0, 8)
    .join('|');
  useEffect(() => {
    if (!liveIds) return;
    const subs = liveIds.split('|').map((id) => subscribeOrder(id, (o: any) => o && applyLiveOrder(o as OrderRecord)));
    return () => subs.forEach((u: any) => typeof u === 'function' && u());
  }, [liveIds]);

  // The 15-minute gate countdown ends without any change to the order, so check the steps every 30 seconds
  const screenRef = useRef<OrderRecord[]>([]);
  screenRef.current = screenOrders;
  useEffect(() => {
    screenRef.current.forEach((o) => (stageSeen.current[o.id] = stageSeen.current[o.id] || orderStageOf(o)));
    const id = window.setInterval(() => screenRef.current.forEach((o) => announceStage(o)), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Hero greeting: guests, signed-in students without a finished order, and returning students
  const signedInCustomer =
    (Boolean(customer?.name) || (introPhone !== '' && introPhone === phone)) &&
    !customer?.wrongPin &&
    isValidNigerianPhone(phone) &&
    isValidPin(pin);
  useEffect(() => {
    if (signedInCustomer) setSignInOpen(false);
  }, [signedInCustomer]);
  const firstName = String(customer?.name || localName || '').trim().split(/\s+/)[0] || '';
  const hasCompletedOrder =
    signedInCustomer &&
    ((customer?.deliveredOrdersCount || 0) > 0 || screenOrders.some((o) => o.status === 'Delivered' && o.paymentStatus !== 'unpaid'));
  const hour = new Date().getHours();
  const dayPart = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const heroGreeting = "Hi there, we've got you covered.";

  // Home announcement: one at a time, set by the admin. A student can dismiss it.
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string>(() => {
    try {
      return localStorage.getItem('roomly_ann_dismissed') || '';
    } catch (e) {
      return '';
    }
  });
  useEffect(() => {
    const unsub = subscribeAnnouncement((a: Announcement | null) => setAnnouncement(a));
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);
  const liveAnnouncement =
    announcement && announcementActive(announcement) && announcementKey(announcement) !== dismissedKey ? announcement : null;
  const handleDismissAnnouncement = () => {
    if (!announcement) return;
    const k = announcementKey(announcement);
    setDismissedKey(k);
    try {
      localStorage.setItem('roomly_ann_dismissed', k);
    } catch (e) {
      /* ignore */
    }
  };
  const handleAnnouncementAction = (a: Announcement) => {
    const target = String(a.buttonTarget || '').trim();
    if (!target) return;
    if (a.buttonType === 'search') {
      setSearchQuery(target);
    } else if (a.buttonType === 'whatsapp') {
      const digits = target.replace(/[^\d]/g, '');
      if (digits) window.open(`https://wa.me/${digits}`, '_blank', 'noopener');
    } else if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener');
    }
  };

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
  const featured = useMemo(() => sideProducts.filter((p) => p.featured).slice(0, 10), [sideProducts]);
  const pairSource = pairFor ? products.find((p) => p.id === pairFor.id) : undefined;
  const pairItems = useMemo(() => {
    if (!pairSource) return [] as Product[];
    const byId = new Map(sideProducts.map((p) => [p.id, p])); // in stock and on this side only
    return (pairSource.pairsWith || []).map((id) => byId.get(id)).filter((p): p is Product => Boolean(p)).slice(0, 4);
  }, [pairSource, sideProducts]);
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

  // Water add-on for the inside cart: an in-stock inside product named "water", a bag preferred
  const waterProduct = useMemo(() => {
    const list = products.filter((p) => p.isAvailable !== false && !isOutsideSource(p.source) && !p.isFood && /water/i.test(p.name));
    return list.find((p) => /bag/i.test(p.name)) || list[0] || null;
  }, [products]);

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
      <div className="w-full max-w-[480px] bg-[#f4f8f6] dark:bg-slate-900 min-h-screen flex flex-col relative shadow-2xl border-x border-slate-200/60 dark:border-slate-800/60 pb-36">
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
          onSignIn={() => setSignInOpen(true)}
        />

        {/* A requested price just came back */}
        {priceReady && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-100 flex items-start justify-between gap-2">
            <span>
              <strong className="block">Your price is ready</strong>
              {priceReady}
            </span>
            <span className="shrink-0 flex flex-col items-end gap-1">
              <button type="button" onClick={() => { setPriceReady(''); openCart(); }} className="font-bold text-[#0e9f55] cursor-pointer">
                Open cart
              </button>
              <button type="button" onClick={() => setPriceReady('')} className="text-[11px] text-slate-500 cursor-pointer">
                Dismiss
              </button>
            </span>
          </div>
        )}

        {/* Main Storefront Body */}
        <main className="p-4 space-y-4 flex-1">

          {/* Phone Number Input & Customer Recognition */}
          <div className="-mx-4 -mt-4 px-4 pt-5 pb-3 bg-gradient-to-b from-emerald-100/70 to-transparent dark:from-emerald-950/40">
            {signedInCustomer ? (
              <HomeBanner
                dayPart={dayPart as 'Good morning' | 'Good afternoon' | 'Good evening'}
                name={firstName}
                isNew={!hasCompletedOrder}
                hasUsuals={orderAgain.length > 0}
                orders={screenOrders}
                announcement={liveAnnouncement}
                onOpenOrder={(o) => {
                  setActiveOrder(o);
                  setIsTrackerOpen(true);
                }}
                onOpenOrders={handleOpenHistory}
                onAnnouncementAction={handleAnnouncementAction}
                onDismissAnnouncement={handleDismissAnnouncement}
              />
            ) : (
              <p className="font-semibold text-[#0b8044] dark:text-[#0e9f55] leading-snug text-sm mb-1">{heroGreeting}</p>
            )}
            {!signedInCustomer && (
              <>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-snug">
                  Order Food, Provisions and Your Everyday Essentials
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  From inside or outside {SCHOOL_NAME}, delivered to your room or the school gate.
                </p>
                <p className="text-xs font-semibold text-[#0b8044] dark:text-[#0e9f55] mt-1.5">
                  No sign-up needed. Just pick what you need and check out.
                </p>
              </>
            )}
          </div>

          {/* How Roomly works: folded guide for first-time visitors */}
          <HowRoomlyWorks
            storeOpensMs={storeOpensMs}
            onStart={() => {
              setSourceMode('inside');
              setSelectedTab('store');
              window.setTimeout(() => document.getElementById('shop-sections')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
            }}
            onHub={() => {
              setSourceMode('inside');
              setSelectedTab('hub');
              window.setTimeout(() => document.getElementById('shop-sections')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
            }}
          />

          {/* No sign-in box on the home screen: new students give their details once, at checkout.
              Returning students on a new phone use "Sign in" in the header, which opens this popup. */}
          {signInOpen && !signedInCustomer && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-3 pt-20" onClick={() => setSignInOpen(false)}>
              <div className="w-full max-w-[460px] space-y-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-bold text-white">Sign in</p>
                  <button type="button" onClick={() => setSignInOpen(false)} className="text-xs font-bold text-white/80 cursor-pointer">
                    Close
                  </button>
                </div>
                <PhoneLookupBar
                  phone={phone}
                  onPhoneChange={setPhone}
                  pin={pin}
                  onPinChange={setPin}
                  customer={customer}
                  onOpenHistory={handleOpenHistory}
                  onSignOut={handleSignOut}
                  isNewNumber={customerLoaded && !customer}
                  signInOnly
                />
              </div>
            </div>
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
          <DeliveryPromiseBanner mode={sourceMode} tab={lastGroup} storeOpensAtMs={storeLocked ? storeOpensMs : 0} />

          {!searchQuery && <InstallBanner variant="home" />}

          {!searchQuery && (
            <FeaturedRow
              items={featured}
              qtyOf={(id) => productQuantityMap[id] || 0}
              onAdd={(p) => (p.isFood ? setCustomizingFood(p) : handleAddSimpleProduct(p))}
              onOpen={(p) => (p.isFood ? setCustomizingFood(p) : setDetailProduct(p))}
            />
          )}

          {!searchQuery && (
            <OrderAgainRow
              items={orderAgain}
              qtyOf={(id) => productQuantityMap[id] || 0}
              onAdd={handleAddSimpleProduct}
              onOpen={setDetailProduct}
              ownerKey={phone}
            />
          )}

          {/* Store Items / Food toggle, then search, then category chips and request */}
          <div id="shop-sections" className="scroll-mt-20" />
          <CategoryNav
            side={sourceMode}
            selected={selectedTab}
            onSelect={(t) => {
              setSelectedTab(t);
              setSearchQuery('');
            }}
            filters={groupFilters}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            requestCount={customRequest ? 1 : 0}
            searching={Boolean(searchQuery)}
            searchSlot={<SearchBar query={searchQuery} onChange={setSearchQuery} />}
          >
          {/* Request Tab vs Product Grid */}
          {!searchQuery && selectedTab === 'hub' ? (
            <HostelHub
              productNames={sideProducts.map((p) => p.name)}
              session={{ name: customer?.name || localName, phone, pin }}
              onGoStore={() => {
                setSelectedTab('store');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : !searchQuery && selectedTab === 'Request' ? (
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
                      ? `${shopGroupLabel(selectedTab as ShopGroup, sourceMode)} › ${selectedFilter}`
                      : shopGroupLabel(selectedTab as ShopGroup, sourceMode)}
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
                        lockedLabel={storeLocked && cartOf(product) === 'store' ? `Opens ${new Date(storeOpensMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : undefined}
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
          </CategoryNav>


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

        {pairSource && !detailProduct && (
          <PairingsBar
            forName={pairSource.name}
            items={pairItems}
            qtyOf={(id) => productQuantityMap[id] || 0}
            onAdd={(p) => (p.isFood ? setCustomizingFood(p) : addSimpleToCart(p))}
            onClose={() => setPairFor(null)}
          />
        )}

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

        {/* Cart & Checkout Sheet (delivery fee, basket nudge, water add-on, no-cancellation check) */}
        <CartSheet
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cart={cartKind}
          cartCounts={cartCounts}
          onSwitchCart={setCartKind}
          allItems={cartItems}
          suggestWater={waterProduct}
          onAddSuggested={() => waterProduct && handleAddSimpleProduct(waterProduct)}
          items={cartItems.filter((i) => cartOf(i) === cartKind)}
          customRequest={cartKind === 'inside' ? customRequest : ''}
          onUpdateQuantity={handleUpdateCartQuantity}
          onRemoveItem={handleRemoveCartItem}
          onRemoveCustomRequest={() => setCustomRequest('')}
          customer={customer}
          guestName={localName}
          phone={phone}
          onPhoneChange={setPhone}
          pin={pin}
          onPinChange={setPin}
          signedIn={signedInCustomer}
          onPlaceOrder={handlePlaceOrder}
        />

        {/* Order Status & Live Runner Tracker Modal */}
        <OrderHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          orders={screenOrders}
          loading={historyLoading}
          signedIn={isValidNigerianPhone(phone) && isValidPin(pin) && !customer?.wrongPin}
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
