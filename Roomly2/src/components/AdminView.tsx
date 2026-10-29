import React, { useState, useEffect } from 'react';
import { OrderChat } from './OrderChat';
import { BatchSwitches, OperatorOverridePanel } from './BatchSwitches';
import { AdminSettlementsPanel } from './SettlementPanel';
import { AnnouncementsPanel } from './AnnouncementsPanel';
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
  MessageSquare,
} from 'lucide-react';
import { sellingPrice, isOutsideSource } from '../config';
import { OrderRecord, CategoryDefinition, DeliveryRunner, locationText, shortLocation, roomText } from '../types';
import { Product, FoodExtraOption, PRESET_PRODUCT_IMAGES, StoreKey, STORE_LABEL, STORE_SOURCE, categoriesForStore, storeOfSource } from '../config';
import { AdminDispatch, AdminTeam, AdminMoney, useOpenSettlements, needsAction } from './AdminDispatch';
import { AdminInsights } from './AdminInsights';
import { AdminFeedbackPanel } from './FeedbackPanels';
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
  setupStoreCategories,
  getProductsFresh,
  deleteCategory,
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

type FoodOptions = Pick<Product, 'extras' | 'choiceTitle' | 'choices'>;

/** "Chicken, 1200" per line -> extras. The number is what YOU pay; the student price adds your margin. */
function parseFoodLines(text: string, source: Product['source']): FoodExtraOption[] {
  const out: FoodExtraOption[] = [];
  text.split('\n').forEach((line) => {
    const m = line.trim().match(/^(.+?)[,\s]+₦?([\d,]+)$/);
    if (!m) return;
    const name = m[1].trim().replace(/[,\s]+$/, '');
    const cost = Number(m[2].replace(/,/g, ''));
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name || !id || out.some((o) => o.id === id)) return;
    out.push({ id, name, cost, price: cost > 0 ? sellingPrice(cost, source || 'school') : 0 });
  });
  return out;
}
const foodLinesOf = (list?: FoodExtraOption[]) => (list || []).map((o) => `${o.name}, ${o.cost ?? o.price}`).join('\n');

/** Admin: one food item's own extras and its "pick one" choice (e.g. Swallow) */
const FoodOptionsEditor: React.FC<{ value: FoodOptions; source: Product['source']; onChange: (v: FoodOptions) => void }> = ({ value, source, onChange }) => {
  const [extrasText, setExtrasText] = useState(foodLinesOf(value.extras));
  const [choicesText, setChoicesText] = useState(foodLinesOf(value.choices));
  const [title, setTitle] = useState(value.choiceTitle || '');
  const extras = parseFoodLines(extrasText, source);
  const choices = parseFoodLines(choicesText, source);
  const push = (e: string, c: string, t: string) =>
    onChange({ extras: parseFoodLines(e, source), choices: parseFoodLines(c, source), choiceTitle: t.trim() || undefined });
  const box = 'w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white';
  const preview = (list: FoodExtraOption[]) =>
    list.length > 0 && (
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Student pays: {list.map((o) => `${o.name} ${o.price > 0 ? `₦${o.price.toLocaleString()}` : 'free'}`).join(' · ')}
      </p>
    );
  return (
    <div className="space-y-2 p-3 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/70 dark:border-orange-900/40">
      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Extras for this food (one per line: name, your cost)</p>
      <textarea
        rows={4}
        value={extrasText}
        onChange={(e) => {
          setExtrasText(e.target.value);
          push(e.target.value, choicesText, title);
        }}
        placeholder={'Chicken, 1200\nBeef, 400\nEgg, 250\nDodo, 250'}
        className={box}
      />
      {preview(extras)}
      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 pt-1">Pick one per plate (optional, e.g. swallow)</p>
      <input
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          push(extrasText, choicesText, e.target.value);
        }}
        placeholder="Title, e.g. Swallow"
        className={box}
      />
      <textarea
        rows={3}
        value={choicesText}
        onChange={(e) => {
          setChoicesText(e.target.value);
          push(extrasText, e.target.value, title);
        }}
        placeholder={'Fufu, 0\nGarri, 0\nSemo, 100\nWheat, 200'}
        className={box}
      />
      {preview(choices)}
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Use 0 for no extra charge. Leave both empty for food with no extras (e.g. okpa).
      </p>
    </div>
  );
};

type AdminTab = 'dashboard' | 'orders' | 'team' | 'money' | 'feedback' | 'products' | 'categories' | 'customers';

export const AdminView: React.FC<AdminViewProps> = ({ onBackToStore, onOrderUpdated }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('roomly_admin_auth') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Active Admin Tab
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  // Red count on the Money tab: days sent and waiting for your confirmation, or overdue
  const moneyAlerts = needsAction(useOpenSettlements()).length;

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
  // Products and Categories are managed one store at a time: Inside School, Outside Store, Outside Food
  const [adminStore, setAdminStore] = useState<StoreKey>('inside');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);

  // New Product Modal/Form State
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdSubcategory, setNewProdSubcategory] = useState('');
  const [newProdPrice, setNewProdPrice] = useState<number>(1000);
  const [newProdUnit, setNewProdUnit] = useState('');
  const [newProdCost, setNewProdCost] = useState<number>(0);
  const [newProdSource, setNewProdSource] = useState<'school' | 'outside' | 'food'>('school');
  const [newProdEmoji, setNewProdEmoji] = useState('');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdIsFood, setNewProdIsFood] = useState(false);
  const [newProdFood, setNewProdFood] = useState<FoodOptions>({});

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
        getProductsFresh(),
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
    try {
      const updated = await addCategory(newCatName.trim(), newCatEmoji.trim() || '', ['All'], [adminStore]);
      setCategories(updated);
      setNewCatName('');
    } catch (err: any) {
      window.alert(err?.message || 'Could not add this category. Check your connection and try again.');
    }
  };

  const handleAddSubcategory = async (catName: string) => {
    const subName = newSubcatName[catName];
    if (!subName || !subName.trim()) return;
    const updated = await addSubcategory(catName, subName.trim());
    setCategories(updated);
    setNewSubcatName((prev) => ({ ...prev, [catName]: '' }));
  };

  // Move one product to another category straight from the product list
  const handleMoveProduct = async (product: Product, category: string) => {
    if (category === (product.category || '')) return;
    try {
      const updated = await saveProduct({ id: product.id, category, subcategory: 'All' });
      setProducts(updated);
    } catch (e: any) {
      window.alert(e?.message || 'Could not move this product.');
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (!window.confirm(`Delete the category "${catName}"?`)) return;
    try {
      setCategories(await deleteCategory(catName, adminStore));
    } catch (e: any) {
      window.alert(e?.message || 'Could not delete this category.');
    }
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
      subcategory: newProdSubcategory.trim() || 'All',
      price: Number(newProdPrice),
      costPrice: newProdCost > 0 ? newProdCost : undefined,
      source: STORE_SOURCE[adminStore],
      unit: newProdUnit.trim() || '1 item',
      emoji: newProdEmoji.trim() || '',
      imageUrl: newProdImageUrl.trim() || undefined,
      gradient: 'from-emerald-500/20 to-teal-500/20',
      isFood: newProdIsFood,
      ...(newProdIsFood ? newProdFood : {}),
      isAvailable: true,
    });

    const updated = await getProductsFresh();
    setProducts(updated);
    setIsAddingProduct(false);
    setNewProdName('');
    setNewProdUnit('');
    setNewProdImageUrl('');
    setNewProdFood({});
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
  const storeCats = categoriesForStore(categories, adminStore);
  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    if (storeOfSource(p.source) !== adminStore) return false;
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
            onClick={() => setCurrentTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'dashboard'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#0e9f55]" />
            <span>Dashboard</span>
          </button>

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
            onClick={() => setCurrentTab('team')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'team'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Team</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('money')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'money'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Money</span>
            {moneyAlerts > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center">
                {moneyAlerts}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('feedback')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'feedback'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Feedback</span>
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
        {/* ================= DASHBOARD: performance and decisions ================= */}
        {currentTab === 'dashboard' && (
          <>
            <AdminInsights />
            <div className="mt-4">
              <AnnouncementsPanel />
            </div>
          </>
        )}

        {/* ================= ORDERS & DISPATCH: Inside / Outside Store / Food ================= */}
        {currentTab === 'orders' && <AdminDispatch />}

        {/* ================= TEAM: runners, operators, accounts, switches ================= */}
        {currentTab === 'team' && <AdminTeam />}

        {/* ================= MONEY: real totals from settlement records ================= */}
        {currentTab === 'money' && <AdminMoney />}

        {/* ================= FEEDBACK: students' ratings of each runner and operator ================= */}
        {currentTab === 'feedback' && <AdminFeedbackPanel />}

        {/* ================= TAB 3: PRODUCTS & PHOTOS (User prompt explicitly requested adding product images) ================= */}
        {currentTab === 'products' && (
          <div className="space-y-4">
            {/* Store switcher: each store keeps its own products and categories */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
              {(['inside', 'store', 'food'] as StoreKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setAdminStore(k);
                    setNewProdSource(STORE_SOURCE[k]);
                    setNewProdCategory('');
                  }}
                  className={`py-2 rounded-xl text-[11px] font-bold cursor-pointer ${
                    adminStore === k ? 'bg-white dark:bg-slate-900 shadow-xs text-[#0e9f55]' : 'text-slate-500'
                  }`}
                >
                  {STORE_LABEL[k]}
                </button>
              ))}
            </div>

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
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Store</label>
                    <p className="px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {STORE_LABEL[adminStore]} ({adminStore === 'inside' ? '16%' : '18% / 12%'})
                    </p>
                  </div>
                  {newProdCost > 0 && (
                    <p className="col-span-2 text-[11px] text-slate-600 dark:text-slate-300">
                      Customer pays ₦{Number(newProdPrice).toLocaleString()} · your profit ₦
                      {(Number(newProdPrice) - newProdCost).toLocaleString()} per item
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">No category (shows under All)</option>
                    {storeCats.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                  </select>
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

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                    Group (similar items show together, e.g. Soft Drinks, Noodles)
                  </label>
                  <input
                    type="text"
                    list="roomly-groups"
                    value={newProdSubcategory}
                    onChange={(e) => setNewProdSubcategory(e.target.value)}
                    placeholder="Soft Drinks"
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <datalist id="roomly-groups">
                    {Array.from(new Set(products.map((p) => p.subcategory).filter((g) => g && g !== 'All'))).map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
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
                    This is a food item (plates, its own extras and pick-one choice)
                  </label>
                </div>
                {newProdIsFood && (
                  <FoodOptionsEditor value={newProdFood} source={STORE_SOURCE[adminStore]} onChange={setNewProdFood} />
                )}

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
                        <select
                          value={p.category || ''}
                          onChange={(e) => handleMoveProduct(p, e.target.value)}
                          className="mt-0.5 max-w-full text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                          title="Move to another category"
                        >
                          <option value="">No category (All only)</option>
                          {p.category && !storeCats.some((c) => c.name === p.category) && <option value={p.category}>{p.category}</option>}
                          {storeCats
                            .map((c) => (
                              <option key={c.id || c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                        {p.unit && <span className="text-[10px] text-slate-400 block truncate">{p.unit}</span>}
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
                {/* Never taller than the screen: the form scrolls inside, title and Save stay pinned */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[90dvh] overflow-y-auto overscroll-contain px-5 pb-0 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3.5">
                  <div className="sticky top-0 z-10 -mx-5 px-5 pt-5 pb-2 bg-white dark:bg-slate-900 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
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
                          Group (e.g. Soft Drinks)
                        </label>
                        <input
                          type="text"
                          list="roomly-groups"
                          value={editingProduct.subcategory && editingProduct.subcategory !== 'All' ? editingProduct.subcategory : ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, subcategory: e.target.value || 'All' })}
                          placeholder="Soft Drinks"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
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

                    {/* Featured on the homepage + "Goes well with" suggestions */}
                    <div className="space-y-2 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingProduct.featured)}
                          onChange={(e) => setEditingProduct({ ...editingProduct, featured: e.target.checked || undefined })}
                          className="w-4 h-4 accent-[#0e9f55]"
                        />
                        Featured on the homepage
                        <span className="font-normal text-slate-500">
                          ({products.filter((x) => x.featured && isOutsideSource(x.source) === isOutsideSource(editingProduct.source)).length} featured on this side, first 10 show)
                        </span>
                      </label>
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 pt-1">Goes well with (up to 4)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(editingProduct.pairsWith || []).map((id) => {
                          const pp = products.find((x) => x.id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]">
                              {pp ? pp.name : 'Deleted product'}
                              <button
                                type="button"
                                aria-label="Remove"
                                onClick={() => setEditingProduct({ ...editingProduct, pairsWith: (editingProduct.pairsWith || []).filter((x) => x !== id) })}
                                className="w-4 h-4 rounded text-slate-400 hover:text-rose-500 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      {(editingProduct.pairsWith || []).length < 4 && (
                        <select
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            setEditingProduct({ ...editingProduct, pairsWith: [...(editingProduct.pairsWith || []), e.target.value] })
                          }
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="">+ Add a product to suggest…</option>
                          {products
                            .filter(
                              (x) =>
                                x.id !== editingProduct.id &&
                                !(editingProduct.pairsWith || []).includes(x.id) &&
                                // same cart only, so a suggestion never adds a second delivery fee
                                (x.source || 'school') === (editingProduct.source || 'school')
                            )
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                                {x.unit ? ` (${x.unit})` : ''}
                              </option>
                            ))}
                        </select>
                      )}
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Shown to students right after they add this product. Out-of-stock suggestions hide themselves.
                      </p>
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
                        This is a food item (plates, its own extras and pick-one choice)
                      </label>
                    </div>
                    {editingProduct.isFood && (
                      <FoodOptionsEditor
                        key={editingProduct.id}
                        value={editingProduct}
                        source={editingProduct.source}
                        onChange={(v) => setEditingProduct((cur) => (cur ? { ...cur, ...v } : cur))}
                      />
                    )}

                    <div className="sticky bottom-0 z-10 -mx-5 px-5 pt-3 pb-5 bg-white dark:bg-slate-900 flex gap-2 border-t border-slate-100 dark:border-slate-800">
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
            {/* Store switcher: each store keeps its own products and categories */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
              {(['inside', 'store', 'food'] as StoreKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setAdminStore(k);
                    setNewProdSource(STORE_SOURCE[k]);
                    setNewProdCategory('');
                  }}
                  className={`py-2 rounded-xl text-[11px] font-bold cursor-pointer ${
                    adminStore === k ? 'bg-white dark:bg-slate-900 shadow-xs text-[#0e9f55]' : 'text-slate-500'
                  }`}
                >
                  {STORE_LABEL[k]}
                </button>
              ))}
            </div>

            {/* One tap: add Roomly's standard categories and subcategories (never deletes) */}
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-900/50 space-y-2">
              <p className="text-xs text-slate-700 dark:text-slate-200">
                Add Roomly's categories and subcategories to all three stores. It only adds what is missing: nothing is deleted and no
                product is moved. Move your products yourself, then delete the old categories once they are empty.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Add the Roomly categories and subcategories? Nothing is deleted.')) return;
                  try {
                    const res = await setupStoreCategories();
                    setCategories(res.categories);
                    setProducts(await getProductsFresh());
                    window.alert(
                      `Done. New categories: ${res.added.length ? res.added.join(', ') : 'none'}. Subcategories added: ${res.subsAdded}.`
                    );
                  } catch (e: any) {
                    window.alert(e?.message || 'Could not update categories.');
                  }
                }}
                className="w-full py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer"
              >
                Set up Roomly categories
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add a category to {STORE_LABEL[adminStore]}
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

            {/* This store's categories */}
            <div className="space-y-3">
              {storeCats.map((cat) => (
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
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">
                        {products.filter((p) => p.category === cat.name && storeOfSource(p.source) === adminStore).length} products
                      </span>
                      {cat.name !== 'Request' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.name)}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Delete category (only when it has no products)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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
