import React, { useState, useEffect } from 'react';
import { OrderChat } from './OrderChat';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';
import { AdminSettlementsPanel } from './SettlementPanel';
import { playChime } from '../sound';
import { Phone as PhoneIcon, ChevronDown as ChevronDownIcon } from 'lucide-react';
import {
  ArrowLeft,
  Lock,
  Search,
  CheckCircle,
  Truck,
  Package,
  Clock,
  Trash2,
  RefreshCw,
  Building,
  User,
  Plus,
  Edit2,
  Check,
  X,
  CreditCard,
  Banknote,
  Image as ImageIcon,
  Upload,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { sellingPrice } from '../config';
import { OrderRecord, CategoryDefinition, DeliveryRunner, locationText, shortLocation, roomText } from '../types';
import { Product, PRESET_PRODUCT_IMAGES } from '../config';
import { OrderHistorySection } from './SpendingHistorySection';
import {
  getOrders,
  updateOrderStatus,
  deleteOrder,
  verifyAdminPin,
  subscribeOrders,
  logoutStaff,
  resetCustomerPhone,
  uploadProductImage,
  getCategories,
  addCategory,
  addSubcategory,
  deleteSubcategory,
  getProducts,
  saveProduct,
  deleteProduct,
  getRunners,
  assignRunnerToOrder,
  getAllCustomers,
  confirmPayment,
} from '../api.js';

interface AdminViewProps {
  onBackToStore: () => void;
  onOrderUpdated?: () => void;
}

type AdminTab = 'orders' | 'spending' | 'products' | 'categories' | 'customers';

export const AdminView: React.FC<AdminViewProps> = ({ onBackToStore, onOrderUpdated }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('roomly_admin_auth') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Active Admin Tab
  const [currentTab, setCurrentTab] = useState<AdminTab>('orders');

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Runners State
  const [runners, setRunners] = useState<DeliveryRunner[]>([]);

  // Categories & Subcategories State
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const [newSubcatName, setNewSubcatName] = useState<Record<string, string>>({});

  // Products State
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);

  // New Product Modal/Form State
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Everyday');
  const [newProdSubcategory, setNewProdSubcategory] = useState('Bread');
  const [newProdPrice, setNewProdPrice] = useState<number>(1000);
  const [newProdUnit, setNewProdUnit] = useState('');
  const [newProdCost, setNewProdCost] = useState<number>(0);
  const [newProdSource, setNewProdSource] = useState<'school' | 'outside' | 'food'>('school');
  const [newProdEmoji, setNewProdEmoji] = useState('');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdIsFood, setNewProdIsFood] = useState(false);

  // Full Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Customers State
  const [customers, setCustomers] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [ordList, catList, prodList, runList, custList] = await Promise.all([
        getOrders(),
        getCategories(),
        getProducts(),
        getRunners(),
        getAllCustomers(),
      ]);
      setOrders(ordList);
      setCategories(catList);
      setProducts(prodList);
      setRunners(runList);
      setCustomers(custList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
    }
  }, [isAuthenticated]);

  // Live updates: refresh whenever any order changes
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeOrders((list: any[]) => {
      const ids = new Set<string>((list || []).map((o) => o.id));
      if (seenIds.current && (list || []).some((o) => !seenIds.current!.has(o.id))) playChime('order');
      seenIds.current = ids;
      fetchAllData();
    });
  }, [isAuthenticated]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPin(pinInput)) {
      setIsAuthenticated(true);
      sessionStorage.setItem('roomly_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('Incorrect PIN. The default demo PIN is 1234');
    }
  };

  // Order Actions
  const handleStatusChange = async (orderId: string, newStatus: any) => {
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus, 'Admin Dispatch');
      const updatedOrders = await getOrders();
      setOrders(updatedOrders);
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleAssignRunner = async (orderId: string, runnerId: string) => {
    await assignRunnerToOrder(orderId, runnerId);
    const updatedOrders = await getOrders();
    setOrders(updatedOrders);
    if (onOrderUpdated) onOrderUpdated();
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm(`Delete order ${orderId}?`)) {
      await deleteOrder(orderId);
      const updatedOrders = await getOrders();
      setOrders(updatedOrders);
      if (onOrderUpdated) onOrderUpdated();
    }
  };

  // Category Actions
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const updated = await addCategory(newCatName.trim(), newCatEmoji.trim() || '');
    setCategories(updated);
    setNewCatName('');
  };

  const handleAddSubcategory = async (catName: string) => {
    const subName = newSubcatName[catName];
    if (!subName || !subName.trim()) return;
    const updated = await addSubcategory(catName, subName.trim());
    setCategories(updated);
    setNewSubcatName((prev) => ({ ...prev, [catName]: '' }));
  };

  const handleDeleteSubcategory = async (catName: string, subName: string) => {
    if (window.confirm(`Remove subcategory "${subName}" from ${catName}?`)) {
      const updated = await deleteSubcategory(catName, subName);
      setCategories(updated);
    }
  };

  // Product Actions
  const handleSavePrice = async (product: Product) => {
    if (tempPrice <= 0) return;
    await saveProduct({
      ...product,
      price: tempPrice,
    });
    const updatedProds = await getProducts();
    setProducts(updatedProds);
    setEditingPriceId(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    await saveProduct({
      id: `prod-${Date.now()}`,
      name: newProdName.trim(),
      category: newProdCategory,
      subcategory: newProdSubcategory || 'All',
      price: Number(newProdPrice),
      costPrice: newProdCost > 0 ? newProdCost : undefined,
      source: newProdSource,
      unit: newProdUnit.trim() || '1 item',
      emoji: newProdEmoji.trim() || '',
      imageUrl: newProdImageUrl.trim() || undefined,
      gradient: 'from-emerald-500/20 to-teal-500/20',
      isFood: newProdIsFood,
      isAvailable: true,
    });

    const updated = await getProducts();
    setProducts(updated);
    setIsAddingProduct(false);
    setNewProdName('');
    setNewProdUnit('');
    setNewProdImageUrl('');
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    await saveProduct(editingProduct);
    const updated = await getProducts();
    setProducts(updated);
    setEditingProduct(null);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (window.confirm('Delete this product from catalog?')) {
      const updated = await deleteProduct(productId);
      setProducts(updated);
    }
  };

  // Helper to handle local file upload to base64 Data URL
  const [uploadingImage, setUploadingImage] = useState(false);
  const [adminOpen, setAdminOpen] = useState<Record<string, boolean>>({});
  const seenIds = React.useRef<Set<string> | null>(null);
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadProductImage(file);
      if (isEdit && editingProduct) {
        setEditingProduct({ ...editingProduct, imageUrl: result });
      } else {
        setNewProdImageUrl(result);
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not upload that photo.');
    }
    setUploadingImage(false);
  };

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = selectedStatus === 'All' || o.status === selectedStatus;
    const q = orderSearchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.name.toLowerCase().includes(q) ||
      o.phone.includes(q) ||
      o.building.toLowerCase().includes(q) ||
      o.room.toLowerCase().includes(q) ||
      (o.runnerName && o.runnerName.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.subcategory.toLowerCase().includes(q)
    );
  });

  // KPI Metrics
  const totalRevenue = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const activeCount = orders.filter((o) => ['Received', 'Packing', 'On the way'].includes(o.status)).length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center px-4 py-8">
        <div className="max-w-xs mx-auto w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#0e9f55]/10 text-[#0e9f55] flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Roomly Admin Portal
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Owner control for orders, runner assignments & catalog photos
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-3">
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN (Demo: 1234)"
                className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
                autoFocus
              />
              {pinError && (
                <p className="text-xs text-rose-500 font-medium mt-1.5">{pinError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Unlock Dashboard
            </button>
          </form>

          <div className="pt-2">
            <button
              type="button"
              onClick={onBackToStore}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Roomly Store</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 selection:bg-[#0e9f55]/20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-3">
        <div className="max-w-[540px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToStore}
              className="p-1.5 -ml-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Back to store"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Roomly Admin Console
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#0e9f55]">
                  Owner
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Signed in as admin</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAllData}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Refresh all data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('roomly_admin_auth');
                logoutStaff();
                setIsAuthenticated(false);
              }}
              className="text-xs text-slate-500 hover:text-rose-500 font-semibold px-2 py-1 cursor-pointer"
            >
              Lock
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-[540px] mx-auto flex items-center justify-between gap-1 pt-2.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setCurrentTab('orders')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'orders'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Orders & Dispatch</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('spending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'spending'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#0e9f55]" />
            <span>Order History</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('products')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'products'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Products & Photos</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('categories')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'categories'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Categories</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('customers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'customers'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Customers</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="p-4 space-y-4 max-w-[540px] mx-auto">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-3 gap-2">
          <div
            onClick={() => setCurrentTab('spending')}
            className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer hover:border-[#0e9f55]/60 transition-colors group"
            title="Click to view order history, category demand & item volume"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Revenue
              </span>
              <BarChart3 className="w-3 h-3 text-[#0e9f55] opacity-60 group-hover:opacity-100" />
            </div>
            <span className="text-sm font-extrabold font-mono text-[#0e9f55] block mt-0.5">
              ₦{totalRevenue.toLocaleString()}
            </span>
            <span className="text-[9px] text-slate-400 block group-hover:text-[#0e9f55]">
              Order & volume history ›
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Active In-Flight
            </span>
            <span className="text-sm font-extrabold font-mono text-amber-500 block mt-0.5">
              {activeCount} orders
            </span>
            <span className="text-[9px] text-slate-400">Dispatching now</span>
          </div>

          <div
            onClick={() => setCurrentTab('products')}
            className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer hover:border-slate-400 transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Catalog Items
            </span>
            <span className="text-sm font-extrabold font-mono text-slate-900 dark:text-white block mt-0.5">
              {products.length} products
            </span>
            <span className="text-[9px] text-slate-400">Manage photos ›</span>
          </div>
        </div>

        {/* ================= TAB 1: ORDERS & RUNNERS ================= */}
        {currentTab === 'orders' && (
          <div className="space-y-4">
            <BatchSwitches />
            <OperatorOverridePanel />
            <AdminSettlementsPanel />

            {/* Search & Filter */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Search orders, room, student or runner..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                {['All', 'Received', 'Packing', 'On the way', 'Delivered'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStatus(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      selectedStatus === st
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {st === 'Packing' ? 'Being Packaged' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                  No orders found matching your search.
                </div>
              ) : (
                filteredOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
                  >
                    {/* Header: tap to open or close */}
                    <button
                      type="button"
                      onClick={() => setAdminOpen((prev) => ({ ...prev, [ord.id]: !prev[ord.id] }))}
                      className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">{ord.name}</span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              ord.status === 'Delivered'
                                ? 'bg-emerald-100 text-[#0e9f55] dark:bg-emerald-950/60'
                                : ord.status === 'Packing'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60'
                                : ord.status === 'On the way'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {ord.status === 'Received' ? 'New' : ord.status}
                          </span>
                          {ord.paymentStatus === 'payment_sent' && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">Payment sent</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <Building className="w-3.5 h-3.5 text-[#0e9f55] shrink-0" />
                          <span>{shortLocation(ord)}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {ord.deliveryTime} ·{' '}
                          {ord.cart === 'store' || ord.cart === 'food'
                            ? `${ord.cart === 'food' ? 'Food' : 'Store'}: ${ord.operatorName || 'any operator'}`
                            : `Runner: ${ord.runnerName || ord.turnRunner || 'none yet'}`}
                        </p>
                        {(ord.outOfStock || ord.gatePickup) && (
                          <p className="text-[11px] text-slate-400">
                            {ord.outOfStock ? `Out of stock: ${ord.outOfStock}` : ''}
                            {ord.gatePickup ? ` · Gate pickup: ${ord.gatePickup.status}${ord.gatePickup.runnerName ? ` (${ord.gatePickup.runnerName}, ₦${ord.gatePickup.fee})` : ''}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="font-bold text-sm text-[#0e9f55] whitespace-nowrap">
                          ₦{ord.totalAmount.toLocaleString()}
                        </span>
                        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${adminOpen[ord.id] ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {adminOpen[ord.id] && (
                    <div className="space-y-3">
                    {/* Payment Status & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Payment:
                        </span>
                        {ord.paymentStatus === 'payment_confirmed' ? (
                          <span className="text-[#0e9f55] font-bold">Confirmed Paid</span>
                        ) : ord.paymentStatus === 'payment_sent' ? (
                          <span className="text-amber-600 font-bold animate-pulse">
                            Student Sent Payment!
                          </span>
                        ) : ord.paymentStatus === 'pay_on_delivery' ? (
                          <span className="text-blue-600 font-bold">Pay on Delivery</span>
                        ) : (
                          <span className="text-rose-600 font-bold">Awaiting Bank Transfer</span>
                        )}
                      </div>

                      {ord.paymentStatus === 'payment_sent' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await confirmPayment(ord.id, 'Admin');
                            const refreshed = await getOrders();
                            setOrders(refreshed);
                            if (onOrderUpdated) onOrderUpdated();
                          }}
                          className="px-2.5 py-1 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                        >
                          Confirm Payment
                        </button>
                      )}
                    </div>

                    {/* Assigned Runner Selector */}
                    <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#0e9f55]" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Assigned Runner:
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {ord.runnerName || 'None assigned yet'}
                        </span>
                      </div>

                      <select
                        value={ord.runnerId || ''}
                        onChange={(e) => handleAssignRunner(ord.id, e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 rounded-lg px-2 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                      >
                        <option value="">Assign Runner...</option>
                        {runners.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Products with Recognizable Photos in Admin view */}
                    <div className="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Ordered Items ({ord.items?.length || 0}):
                      </span>
                      {ord.items?.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="text-base">{item.emoji || ''}</span>
                              )}
                            </div>
                            <span className="text-slate-700 dark:text-slate-300 truncate">
                              <strong>{item.quantity}x</strong> {item.name}
                              {item.extras && item.extras.length > 0
                                ? ` (+${item.extras.map((e) => `${e.quantity || 1}x ${e.name}`).join(', ')})`
                                : ''}
                            </span>
                          </div>
                          <span className="font-mono text-slate-900 dark:text-white shrink-0">
                            ₦{item.totalPrice.toLocaleString()}
                          </span>
                        </div>
                      ))}

                      {ord.customRequest && (
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 italic mt-1 text-xs">
                          Custom Request: "{ord.customRequest}"
                        </div>
                      )}
                    </div>

                    {/* Status Changer Buttons */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {['Received', 'Packing', 'On the way', 'Delivered'].map((step) => (
                          <button
                            key={step}
                            type="button"
                            onClick={() => handleStatusChange(ord.id, step)}
                            disabled={updatingOrderId === ord.id}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                              ord.status === step
                                ? 'bg-[#0e9f55] text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {step === 'Packing' ? 'Packaged' : step}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(ord.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <a
                      href={`tel:${ord.phone}`}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white text-xs font-bold"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span>Call {ord.name} · {ord.phone}</span>
                    </a>
                    <OrderChat orderId={ord.id} role="admin" senderName="Admin" closed={ord.status === 'Delivered'} />
                    </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: ORDER HISTORY & VOLUME DEMAND (User prompt: total volume, categories, items volume, peak batch, spending history, today, 7d, 30d, 1y, 5y) ================= */}
        {currentTab === 'spending' && (
          <OrderHistorySection orders={orders} categories={categories} products={products} />
        )}

        {/* ================= TAB 3: PRODUCTS & PHOTOS (User prompt explicitly requested adding product images) ================= */}
        {currentTab === 'products' && (
          <div className="space-y-4">
            {/* Header with Add Product button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Products & Photos Manager
                </h3>
                <p className="text-[11px] text-slate-400">Add product images so buyers & runners recognize items</p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddingProduct((prev) => !prev)}
                className="px-3 py-1.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingProduct ? 'Close Form' : 'New Product'}</span>
              </button>
            </div>

            {/* Create Product Form with Image Uploader & Presets */}
            {isAddingProduct && (
              <form
                onSubmit={handleCreateProduct}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border-2 border-[#0e9f55]/60 shadow-md space-y-3"
              >
                <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#0e9f55]" />
                  <span>Add New Product With Photo</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Item Name
                    </label>
                    <input
                      type="text"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="e.g. Fresh Agege Bread"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Price (₦)
                    </label>
                    <input
                      type="number"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Cost price you pay (₦)</label>
                    <input
                      type="number"
                      value={newProdCost || ''}
                      onChange={(e) => {
                        const c = Number(e.target.value);
                        setNewProdCost(c);
                        if (c > 0) setNewProdPrice(sellingPrice(c, newProdSource));
                      }}
                      placeholder="e.g. 1000"
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Sold from</label>
                    <select
                      value={newProdSource}
                      onChange={(e) => {
                        const s = e.target.value as 'school' | 'outside' | 'food';
                        setNewProdSource(s);
                        if (newProdCost > 0) setNewProdPrice(sellingPrice(newProdCost, s));
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="school">Inside school (16%)</option>
                      <option value="outside">Outside: trusted store (18% / 12%)</option>
                      <option value="food">Outside: food operator (18% / 12%)</option>
                    </select>
                  </div>
                  {newProdCost > 0 && (
                    <p className="col-span-2 text-[11px] text-slate-600 dark:text-slate-300">
                      Customer pays ₦{Number(newProdPrice).toLocaleString()} · your profit ₦
                      {(Number(newProdPrice) - newProdCost).toLocaleString()} per item
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Main Category
                    </label>
                    <select
                      value={newProdCategory}
                      onChange={(e) => {
                        setNewProdCategory(e.target.value);
                        const cat = categories.find((c) => c.name === e.target.value);
                        if (cat && cat.subcategories.length > 1) {
                          setNewProdSubcategory(cat.subcategories[1]);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Subcategory
                    </label>
                    <select
                      value={newProdSubcategory}
                      onChange={(e) => setNewProdSubcategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      {(
                        categories.find((c) => c.name === newProdCategory)?.subcategories || ['All']
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PRODUCT PHOTO FIELD (Image URL / Presets / File Upload) */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-[#0e9f55]" />
                      <span>Product Image (Photo for Buyer & Runner)</span>
                    </label>
                    {newProdImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewProdImageUrl('')}
                        className="text-[10px] text-rose-500 hover:underline"
                      >
                        Clear Image
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2.5 items-start">
                    {/* Visual Preview */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center relative">
                      {newProdImageUrl ? (
                        <img
                          src={newProdImageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-2xl select-none">{newProdEmoji}</span>
                      )}
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={newProdImageUrl}
                        onChange={(e) => setNewProdImageUrl(e.target.value)}
                        placeholder="Paste image URL (https://... or choose preset below)"
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />

                      {/* File upload from device */}
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#0e9f55] rounded-lg text-[10px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors">
                        <Upload className="w-3 h-3" />
                        <span>{uploadingImage ? 'Uploading…' : 'Upload photo from device'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileChange(e, false)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* 1-Click Preset Campus Product Photos */}
                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      Or select from studio campus photos:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {PRESET_PRODUCT_IMAGES.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setNewProdImageUrl(preset.url)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-colors cursor-pointer ${
                            newProdImageUrl === preset.url
                              ? 'bg-[#0e9f55] text-white border-[#0e9f55]'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#0e9f55]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Unit (e.g. 1 pack, 50cl, 1 loaf)
                    </label>
                    <input
                      type="text"
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      placeholder="1 piece"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Emoji Fallback
                    </label>
                    <input
                      type="text"
                      value={newProdEmoji}
                      onChange={(e) => setNewProdEmoji(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isFoodCheck"
                    checked={newProdIsFood}
                    onChange={(e) => setNewProdIsFood(e.target.checked)}
                    className="w-4 h-4 accent-[#0e9f55]"
                  />
                  <label
                    htmlFor="isFoodCheck"
                    className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                  >
                    Enable plate & side protein customization for this food item
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Save Product to Catalog
                </button>
              </form>
            )}

            {/* Search products */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name, category or subcategory..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
              />
            </div>

            {/* Products Table / List with Product Images */}
            <div className="space-y-2">
              {filteredProducts.map((p) => {
                const isEditingThis = editingPriceId === p.id;

                return (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Product Thumbnail */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-2xl select-none">{p.emoji}</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </h4>
                          {p.imageUrl ? (
                            <span className="text-[9px] font-bold px-1 rounded bg-emerald-50 text-[#0e9f55] border border-emerald-200/60 shrink-0">
                              Photo
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1 rounded bg-slate-100 text-slate-400 shrink-0">
                              No photo
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {p.category} › {p.subcategory} {p.unit ? `(${p.unit})` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Display Price Editor & Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditingThis ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold">₦</span>
                          <input
                            type="number"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(Number(e.target.value))}
                            className="w-20 px-2 py-1 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 rounded border border-[#0e9f55] text-slate-900 dark:text-white"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePrice(p)}
                            className="p-1 bg-[#0e9f55] text-white rounded hover:bg-[#0b8044] cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPriceId(p.id);
                            setTempPrice(p.price);
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl text-xs font-bold font-mono text-[#0e9f55] cursor-pointer transition-colors"
                          title="Click to edit display price"
                        >
                          <span>₦{p.price.toLocaleString()}</span>
                          <Edit2 className="w-2.5 h-2.5 text-slate-400" />
                        </button>
                      )}

                      {/* Full Edit Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...p })}
                        className="p-1.5 text-slate-500 hover:text-[#0e9f55] rounded-lg transition-colors cursor-pointer"
                        title="Edit photo & details"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                        title="Delete product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FULL EDIT PRODUCT MODAL (Allows updating product image, name, price, etc.) */}
            {editingProduct && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-[#0e9f55]" />
                      <span>Edit Product & Photo</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveEditedProduct} className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                        Product Name
                      </label>
                      <input
                        type="text"
                        value={editingProduct.name}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Cost price you pay (₦)</label>
                        <input
                          type="number"
                          value={editingProduct.costPrice || ''}
                          onChange={(e) => {
                            const c = Number(e.target.value);
                            setEditingProduct({
                              ...editingProduct,
                              costPrice: c > 0 ? c : undefined,
                              price: c > 0 ? sellingPrice(c, editingProduct.source || 'school') : editingProduct.price,
                            });
                          }}
                          placeholder="e.g. 1000"
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Sold from</label>
                        <select
                          value={editingProduct.source || 'school'}
                          onChange={(e) => {
                            const src = e.target.value as 'school' | 'outside' | 'food';
                            setEditingProduct({
                              ...editingProduct,
                              source: src,
                              price: editingProduct.costPrice ? sellingPrice(editingProduct.costPrice, src) : editingProduct.price,
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="school">Inside school (16%)</option>
                          <option value="outside">Outside: trusted store (18% / 12%)</option>
                      <option value="food">Outside: food operator (18% / 12%)</option>
                        </select>
                      </div>
                      {editingProduct.costPrice ? (
                        <p className="col-span-2 text-[11px] text-slate-600 dark:text-slate-300">
                          Customer pays ₦{Number(editingProduct.price).toLocaleString()} · your profit ₦
                          {(Number(editingProduct.price) - editingProduct.costPrice).toLocaleString()} per item
                        </p>
                      ) : (
                        <p className="col-span-2 text-[11px] text-slate-500">Enter the cost to price this item automatically.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                          Price (₦)
                        </label>
                        <input
                          type="number"
                          value={editingProduct.price}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                          Unit / Size
                        </label>
                        <input
                          type="text"
                          value={editingProduct.unit || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, unit: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Image URL & Preview in Edit Modal */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Product Image Photo
                        </label>
                        {editingProduct.imageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingProduct({ ...editingProduct, imageUrl: '' })
                            }
                            className="text-[10px] text-rose-500 hover:underline"
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2.5 items-center">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                          {editingProduct.imageUrl ? (
                            <img
                              src={editingProduct.imageUrl}
                              alt="Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-2xl">{editingProduct.emoji}</span>
                          )}
                        </div>

                        <div className="flex-1 space-y-1">
                          <input
                            type="text"
                            value={editingProduct.imageUrl || ''}
                            onChange={(e) =>
                              setEditingProduct({ ...editingProduct, imageUrl: e.target.value })
                            }
                            placeholder="Image URL or upload"
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                          />

                          <label className="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[9px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                            <Upload className="w-2.5 h-2.5" />
                            <span>{uploadingImage ? 'Uploading…' : 'Upload from device'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageFileChange(e, true)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Presets in Edit Modal */}
                      <div className="pt-1 flex flex-wrap gap-1">
                        {PRESET_PRODUCT_IMAGES.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              setEditingProduct({ ...editingProduct, imageUrl: preset.url })
                            }
                            className="px-1.5 py-0.5 rounded text-[9px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#0e9f55] cursor-pointer"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="editIsFood"
                        checked={Boolean(editingProduct.isFood)}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isFood: e.target.checked })
                        }
                        className="w-4 h-4 accent-[#0e9f55]"
                      />
                      <label htmlFor="editIsFood" className="text-xs text-slate-700 dark:text-slate-300">
                        Is food item (supports 0-plate & side extras)
                      </label>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                        className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: CATEGORIES & SUBCATEGORIES ================= */}
        {currentTab === 'categories' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add New Main Category
              </h3>
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  maxLength={2}
                  value={newCatEmoji}
                  onChange={(e) => setNewCatEmoji(e.target.value)}
                  placeholder="Emoji"
                  className="w-14 text-center py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category Name (e.g. Pastries, Pharmacy, Electronics)"
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
                />
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="px-3.5 py-2 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors shrink-0"
                >
                  Add
                </button>
              </form>
            </div>

            {/* List of categories with subcategory manager */}
            <div className="space-y-3">
              {categories.map((cat) => (
                <div
                  key={cat.id || cat.name}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl select-none">{cat.emoji}</span>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {cat.name}
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {cat.subcategories.length - 1} subcategories
                    </span>
                  </div>

                  {/* Subcategories Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cat.subcategories
                      .filter((s) => s !== 'All')
                      .map((subcat) => (
                        <div
                          key={subcat}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                        >
                          <span>{subcat}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubcategory(cat.name, subcat)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 rounded cursor-pointer"
                            title="Delete subcategory"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                  </div>

                  {/* Add Subcategory input */}
                  <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <input
                      type="text"
                      value={newSubcatName[cat.name] || ''}
                      onChange={(e) =>
                        setNewSubcatName((prev) => ({ ...prev, [cat.name]: e.target.value }))
                      }
                      placeholder={`Add subcategory to ${cat.name}...`}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSubcategory(cat.name)}
                      className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                    >
                      + Add Subcategory
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: CUSTOMERS ================= */}
        {currentTab === 'customers' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Registered Campus Students ({customers.length})
            </h3>

            {customers.map((c, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {c.name || 'Student'}
                    </span>
                    {c.isReturning && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#0e9f55]">
                        Returning
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Phone: <span className="font-mono text-slate-700 dark:text-slate-300">{c.phone}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Room: {locationText(c)}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('Reset this customer? The phone number can then be registered again with a new PIN. Their saved details and order list are removed.')) {
                        await resetCustomerPhone(c.phone);
                        fetchAllData();
                      }
                    }}
                    className="mt-1 text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
                  >
                    Reset PIN / free this number
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    {c.ordersCount || 1} orders
                  </span>
                  <span className="block text-[10px] text-[#0e9f55]">
                    {c.deliveredOrdersCount || 0} delivered
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
