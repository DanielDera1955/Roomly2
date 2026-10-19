/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
} from './api.js';
import { Product } from './config';
import { StaffGate } from './components/StaffGate';
import { AdminSwitcher } from './components/AdminSwitcher';
import { CartItem, CustomerProfile, OrderRecord, CategoryDefinition } from './types';
import { Header, PortalMode } from './components/Header';
import { PhoneLookupBar } from './components/PhoneLookupBar';
import { SearchBar } from './components/SearchBar';
import { DeliveryPromiseBanner } from './components/DeliveryPromiseBanner';
import { CategoryNav } from './components/CategoryNav';
import { ProductCard } from './components/ProductCard';
import { FoodCustomizerSheet } from './components/FoodCustomizerSheet';
import { RequestTab } from './components/RequestTab';
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Everyday');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [isCartOpen, setIsCartOpen] = useState(false);

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

  const handleOpenHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryOrders(await getMyOrders(phone, pin));
    setHistoryLoading(false);
  };

  // Live updates for the order the customer is tracking
  useEffect(() => {
    if (!activeOrder?.id) return;
    return subscribeOrder(activeOrder.id, (o: any) => {
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
    setCartItems((prev) => [...prev, foodItem]);
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
    setIsCartOpen(true);
  };

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

      setCartItems([]);
      setCustomRequest('');
      setIsCartOpen(false);

      if (orderPayload.phone) {
        const updatedCust = await getCustomerByPhone(orderPayload.phone, pin);
        setCustomer(updatedCust);
      }

      setIsTrackerOpen(true);
    } catch (err) {
      console.error('Order creation error:', err);
    }
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

  // Filter products by search, main category, and subcategory
  const filteredProducts = useMemo(() => {
    let list = products;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.subcategory.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== 'Request') {
      list = list.filter((p) => p.category.toLowerCase() === selectedCategory.toLowerCase());
      if (selectedSubcategory && selectedSubcategory !== 'All') {
        list = list.filter((p) => p.subcategory.toLowerCase() === selectedSubcategory.toLowerCase());
      }
    }
    return list;
  }, [products, selectedCategory, selectedSubcategory, searchQuery]);

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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex justify-center selection:bg-[#0e9f55]/20">
      <div className="w-full max-w-[480px] bg-slate-50 dark:bg-slate-900 min-h-screen flex flex-col relative shadow-2xl border-x border-slate-200/60 dark:border-slate-800/60 pb-24">
        <AdminSwitcher current="customer" onSelect={handleSelectPortal} />
        {/* Header */}
        <Header
          currentPortal={currentPortal}
          onSelectPortal={handleSelectPortal}
          customer={customer}
          storeStatus={storeStatus}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onOpenTracker={() => setIsTrackerOpen(true)}
          onToggleStoreHoursOverride={handleToggleStoreHoursOverride}
          activeOrderCount={activeOrder ? 1 : 0}
        />

        {/* Main Storefront Body */}
        <main className="p-4 space-y-4 flex-1">
          {/* Closed Warning Banner */}
          {!storeStatus.isOpen && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
              <div>
                <strong className="font-bold">Store is currently closed.</strong>
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  Open daily 6am - 11pm. You can pre-order for tomorrow morning!
                </p>
              </div>
            </div>
          )}

          {/* Phone Number Input & Customer Recognition */}
          <PhoneLookupBar
            phone={phone}
            onPhoneChange={setPhone}
            pin={pin}
            onPinChange={setPin}
            customer={customer}
            onOpenHistory={handleOpenHistory}
            onSignOut={handleSignOut}
          />

          {/* Delivery Promise Banner */}
          <DeliveryPromiseBanner />

          {/* Search Bar */}
          <SearchBar query={searchQuery} onChange={setSearchQuery} />

          {/* Category & Subcategory Nav */}
          {!searchQuery && (
            <CategoryNav
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              selectedSubcategory={selectedSubcategory}
              onSelectSubcategory={setSelectedSubcategory}
              requestCount={customRequest ? 1 : 0}
            />
          )}

          {/* Request Tab vs Product Grid */}
          {!searchQuery && selectedCategory === 'Request' ? (
            <RequestTab
              customRequest={customRequest}
              onSaveCustomRequest={setCustomRequest}
              onClearCustomRequest={() => setCustomRequest('')}
              onOpenCart={() => setIsCartOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {searchQuery
                      ? `Search: "${searchQuery}"`
                      : selectedSubcategory !== 'All'
                      ? `${selectedCategory} › ${selectedSubcategory}`
                      : `${selectedCategory} Items`}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} available
                  </p>
                </div>

                {selectedCategory === 'Food' && (
                  <span className="text-[10px] font-bold text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    0-plate protein orders supported
                  </span>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                  No items found in this section. Try choosing another subcategory or the Request tab!
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={productQuantityMap[product.id] || 0}
                      onAdd={handleAddSimpleProduct}
                      onRemove={handleRemoveSimpleProduct}
                      onOpenFoodCustomizer={(prod) => setCustomizingFood(prod)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Floating Cart Bar */}
        <FloatingCartBar
          totalItems={totalItemsCount}
          totalPrice={totalItemsPrice}
          hasCustomRequest={Boolean(customRequest)}
          onOpenCart={() => setIsCartOpen(true)}
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
          items={cartItems}
          customRequest={customRequest}
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
          orders={historyOrders}
          loading={historyLoading}
          onSelect={(o) => {
            setActiveOrder(o);
            setHistoryOpen(false);
            setIsTrackerOpen(true);
          }}
        />

        <OrderTrackerModal
          isOpen={isTrackerOpen}
          onClose={() => setIsTrackerOpen(false)}
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
