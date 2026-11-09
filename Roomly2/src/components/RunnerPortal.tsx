import React, { useState, useEffect, useMemo } from 'react';
import { NoPhoto } from './NoPhoto';
import { OrderChat } from './OrderChat';
import { ThemeToggle } from './ThemeToggle';
import { SoundToggle } from './SoundToggle';
import { BatchSwitches } from './BatchSwitches';
import { WeeklyAvailability } from './WeeklyAvailability';
import { ExpressPanel } from './ExpressPanel';
import { RoomlyPayoutLine } from './AdminOrderActions';
import { MyRatingsPanel } from './FeedbackPanels';
import { ProviderSettlement, PayAccountForm } from './SettlementPanel';
import { ProductRequestsPanel } from './ProductRequestsPanel';
import { ProviderOverview } from './OperatorPortal';
import { OperatorProductsPanel } from './StoreProducts';
import { playChime } from '../sound';
import { ChevronDown as ChevronDownIcon, Phone as PhoneIcon } from 'lucide-react';
import {
  Truck,
  Package,
  Phone,
  CheckCircle,
  Clock,
  ArrowRight,
  LogOut,
  Building,
  User,
  CreditCard,
  Check,
  Zap,
  History,
  TrendingUp,
  Inbox,
  AlertTriangle,
  MessageSquare,
  FileText,
  BadgeAlert,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Send,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { OrderRecord, DeliveryRunner, CartItem, locationText, shortLocation, roomText, partLabel } from '../types';
import {
  subscribeSideRequests,
  getOrders,
  getRunners,
  updateOrderStatus,
  confirmPayment,
  markPaymentNotReceived,
  markStaffSeen,
  startPackagingOrder,
  subscribeOrders,
  getCurrentStaff,
  logoutStaff,
  setOrderHelper,
  syncMyHelpCredits,
  getMyUid,
  autoDeliverOverdue,
  EXPRESS_ENABLED,
  isRoomlyOrder,
} from '../api.js';
import { insideArrivalLeftMs, INSIDE_ARRIVAL_MINUTES, outOfStockSummary } from '../config';
import { AttentionCard, jumpTo } from './AttentionCard';
import { OperatorGuide } from './OperatorGuide';

interface RunnerPortalProps {
  onBackToCustomer: () => void;
  onOrderUpdated?: () => void;
}

// Reusable item row with recognizable product image, plate counts, extras and special notes
const OrderItemRow: React.FC<{ item: CartItem }> = ({ item }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
      {/* Product Image Thumbnail */}
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center relative shadow-xs">
        {item.imageUrl && !imgError ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <NoPhoto name={item.name} className="text-2xl" />
        )}
        <span className="absolute bottom-0 right-0 bg-[#0e9f55] text-white text-[9px] font-black px-1.5 py-0.2 rounded-tl-lg shadow-xs">
          {item.quantity}x
        </span>
      </div>

      {/* Item Details */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
            {item.name}
          </h5>
          <span className="text-xs font-mono font-extrabold text-slate-900 dark:text-slate-100 shrink-0">
            ₦{item.totalPrice.toLocaleString()}
          </span>
        </div>

        {/* Plate Count or Zero-Plate Indicator */}
        {item.plates !== undefined && (
          <div className="flex items-center gap-1.5">
            {item.plates === 0 ? (
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                0 Plates (Proteins/Item Only)
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                {item.plates} {item.plates === 1 ? 'Plate' : 'Plates'}
              </span>
            )}
          </div>
        )}

        {/* Extras Breakdown */}
        {item.extras && item.extras.length > 0 && (
          <div className="p-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 text-[10px] space-y-0.5">
            <span className="font-bold text-amber-900 dark:text-amber-300 block">
              + Extras to add:
            </span>
            {item.extras.map((extra, idx) => (
              <div key={idx} className="flex justify-between text-amber-800 dark:text-amber-200">
                <span>
                  • {extra.quantity || 1}x {extra.name}
                </span>
                <span className="font-mono">₦{((extra.quantity || 1) * extra.price).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Item-level Special Note */}
        {item.specialNote && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800">
            Note: {item.specialNote}
          </p>
        )}
      </div>
    </div>
  );
};

export const RunnerPortal: React.FC<RunnerPortalProps> = ({
  onBackToCustomer,
  onOrderUpdated,
}) => {
  const [runners, setRunners] = useState<DeliveryRunner[]>([]);
  const isRunner = getCurrentStaff()?.role === 'runner';
  const hasAccount = Boolean(getCurrentStaff()?.payAccount?.accountNumber);
  // Inside product requests still waiting for a price: they move up to the top section
  const [openRequests, setOpenRequests] = useState(0);
  useEffect(() => {
    if (!isRunner) return;
    return subscribeSideRequests('inside', (list: any[]) => setOpenRequests((list || []).filter((r) => r.status === 'open').length));
  }, [isRunner]);
  const [activeRunnerId, setActiveRunnerId] = useState<string>(() => getCurrentStaff()?.id || 'run-1');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Main Mode Tab: 'active' (orders to accept & packaging) vs 'history' (past completed deliveries)
  const [runnerTab, setRunnerTab] = useState<'active' | 'history'>('active');

  // Filter Sub-tabs for Active Orders
  const [activeFilter, setActiveFilter] = useState<'all' | 'packing' | 'on_the_way' | 'notpaid' | 'delivered'>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleOpen = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const seenOrderIds = React.useRef<Set<string> | null>(null);

  const activeRunner = runners.find((r) => r.id === activeRunnerId) || runners[0];

  // Shared delivery: who helped on each order (picked per card), and crediting deliveries I helped with
  const [helperPick, setHelperPick] = useState<Record<string, string>>({});
  useEffect(() => syncMyHelpCredits(), []);
  // Opening the portal on the day of a batch is how a runner shows they are active (the admin sees it)
  const [tickMs, setTickMs] = useState(Date.now());
  useEffect(() => {
    if (!isRunner) return;
    markStaffSeen(true);
    const onVis = () => {
      if (document.visibilityState === 'visible') markStaffSeen();
    };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      setTickMs(Date.now());
      if (document.visibilityState === 'visible') markStaffSeen();
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [isRunner]);
  const recordHelper = async (ord: OrderRecord, email: string) => {
    const r = runners.find((x) => x.id === email);
    setUpdatingId(ord.id);
    try {
      await setOrderHelper(ord.id, r ? { email: r.id, name: r.name } : null);
      await fetchOrdersAndRunners();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setUpdatingId(null);
  };

  const fetchOrdersAndRunners = async () => {
    setLoading(true);
    try {
      const [orderList, runnerList] = await Promise.all([getOrders(), getRunners()]);
      setOrders(orderList);
      setRunners(runnerList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersAndRunners();
  }, []);

  // Live updates: refresh whenever any order changes
  useEffect(() => {
    return subscribeOrders((list: any[]) => {
      const ids = new Set<string>((list || []).map((o) => o.id));
      if (seenOrderIds.current) {
        const fresh = (list || []).some((o) => !seenOrderIds.current!.has(o.id) && !o.runnerId && o.status === 'Received');
        if (fresh) playChime('order');
      }
      seenOrderIds.current = ids;
      fetchOrdersAndRunners();
    });
  }, []);

  // Accept active order and start packaging
  const handleStartPackaging = async (orderId: string) => {
    if (!activeRunner) return;
    setUpdatingId(orderId);
    try {
      await startPackagingOrder(orderId, activeRunner.id, activeRunner.name, activeRunner.phone);
      await fetchOrdersAndRunners();
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingId(null);
    }
  };

  // andPack: confirm the payment and start packaging in one tap (the order becomes the runner's)
  const handleConfirmPayment = async (orderId: string, andPack = false) => {
    if (!activeRunner) return;
    // Express: ask when the money actually arrived (from the bank app). A later time moves the 20-minute start.
    let txAt = '';
    const ord = orders.find((o) => o.id === orderId);
    if (ord?.express?.status === 'accepted') {
      const d = new Date();
      const nowText = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const answer = window.prompt(
        'Express: what time did the money arrive in your account? Check your bank app (for example 14:05). The 20 minutes start from this time if it is later than the student\'s tap.',
        nowText
      );
      if (answer === null) return;
      const m = /^(\d{1,2}):(\d{2})$/.exec(answer.trim());
      if (!m) {
        window.alert('Type the time like 14:05');
        return;
      }
      const at = new Date();
      at.setHours(Number(m[1]), Number(m[2]), 0, 0);
      txAt = at.toISOString();
    }
    setUpdatingId(orderId);
    try {
      await confirmPayment(orderId, activeRunner.name, txAt);
      if (andPack) await startPackagingOrder(orderId, activeRunner.id, activeRunner.name, activeRunner.phone);
      await fetchOrdersAndRunners();
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingId(null);
    }
  };

  // Checked the account and the money never came: the order moves to Not paid and the student is told
  const handleNotReceived = async (ord: OrderRecord) => {
    if (!activeRunner) return;
    if (!isRunner) {
      // Admin can't see the runner's bank account: only after checking with the student or runner, and typed to avoid a slip
      const typed = window.prompt(`ADMIN: mark ${ord.name}'s ₦${(ord.totalAmount || 0).toLocaleString()} order as payment not received?\n\nOnly do this after checking with the student or the runner. The student is told and the order moves to Not paid.\n\nType NOT PAID to continue.`);
      if (typed === null) return;
      if (typed.trim().toUpperCase() !== 'NOT PAID') {
        window.alert('Nothing changed. Type NOT PAID exactly to mark it.');
        return;
      }
    } else if (!window.confirm(`No ₦${(ord.totalAmount || 0).toLocaleString()} from ${ord.name} in your account?\n\nThe order moves to Not paid and the student is told you haven't received it. If the money arrives later, you can still confirm it.`)) return;
    setUpdatingId(ord.id);
    try {
      const res = await markPaymentNotReceived(ord.id, isRunner ? activeRunner.name : 'Roomly admin');
      if (!res) window.alert('Could not update. Check your connection and try again.');
      await fetchOrdersAndRunners();
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingId(null);
    }
  };
  // "4:12pm" today, or "Mon 2 Nov, 4:12pm" on another day
  const timeOf = (iso?: string) => {
    const d = new Date(iso || '');
    if (!iso || isNaN(d.getTime())) return '';
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
    return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
  };

  // Status transitions: Packaging -> On the way -> Delivered
  const handleUpdateStatus = async (orderId: string, nextStatus: any) => {
    if (!activeRunner) return;
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, nextStatus, activeRunner.name);
      await fetchOrdersAndRunners();
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingId(null);
    }
  };

  // Runners handle inside-school orders; outside carts go to operators (gate pickups have their own panel).
  // Each runner only sees their own side: boys' hostels or girls' hostels (the admin sees both).
  const mySide = isRunner ? (getCurrentStaff() as any)?.hostelSide || 'boys' : '';
  const insideOrders = orders.filter((o) => (!o.cart || o.cart === 'inside') && (!mySide || ((o as any).hostelSide || 'boys') === mySide));

  // 1. Active Orders Available to Accept (unassigned or received)
  const unassignedOrders = insideOrders.filter(
    (o) =>
      o.status !== 'Delivered' &&
      o.status !== 'Cancelled' &&
      o.paymentStatus !== 'unpaid' && // only orders the student says they have paid (or pay on delivery)
      !(o.paymentStatus === 'payment_sent' && o.paymentNotReceived) && // checked and not received: under Not paid
      (!o.runnerId || o.status === 'Received') &&
      // Roomly's orders are assigned by the admin, never picked by a runner
      !isRoomlyOrder(o) &&
      // An express order belongs to the runner who accepted it
      !(o.express?.status === 'accepted' && o.express.runnerId !== activeRunner?.id) &&
      o.express?.status !== 'requested'
  );

  // 2. Active Orders Currently Assigned to Chosen Runner
  const myActiveOrders = insideOrders.filter(
    (o) =>
      o.runnerId === activeRunner?.id &&
      o.status !== 'Delivered' &&
      o.status !== 'Cancelled' &&
      !(o.paymentStatus === 'payment_sent' && o.paymentNotReceived)
  );
  // Student tapped paid but the money never came (mine, or not yet taken by any runner)
  const notPaidOrders = insideOrders.filter(
    (o) =>
      o.status !== 'Delivered' &&
      o.status !== 'Cancelled' &&
      o.paymentStatus === 'payment_sent' &&
      Boolean(o.paymentNotReceived) &&
      (!o.runnerId || o.runnerId === activeRunner?.id)
  );

  // For the attention card: payments to confirm, orders to deliver today, express and gate pickups waiting
  const nowR = new Date();
  const todayR = `${nowR.getFullYear()}-${String(nowR.getMonth() + 1).padStart(2, '0')}-${String(nowR.getDate()).padStart(2, '0')}`;
  const openInside = insideOrders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled');
  const attConfirm = openInside.filter(
    (o) => o.paymentStatus === 'payment_sent' && !o.paymentNotReceived && !isRoomlyOrder(o) && (!o.runnerId || o.runnerId === activeRunner?.id) && o.express?.status !== 'requested'
  ).length;
  // Students who tapped paid over 30 minutes ago and are still waiting for an answer
  const waitingLong = openInside.filter(
    (o) =>
      o.paymentStatus === 'payment_sent' &&
      !o.paymentNotReceived &&
      (!o.runnerId || o.runnerId === activeRunner?.id) &&
      o.paymentSentAt &&
      tickMs - Date.parse(o.paymentSentAt) >= 30 * 60000
  ).length;
  const attSend = openInside.filter(
    (o) => o.runnerId === activeRunner?.id && o.paymentStatus === 'payment_confirmed' && (!o.deliveryDate || o.deliveryDate <= todayR)
  ).length;
  const attExpress = openInside.filter((o) => o.express?.status === 'requested').length;
  const goToRunnerOrders = () => {
    setActiveFilter('all');
    window.setTimeout(() => jumpTo('op-orders'), 60);
  };

  // 3. Past Completed Orders Delivered by Chosen Runner (History)
  const myCompletedOrders = insideOrders.filter(
    (o) => o.runnerId === activeRunner?.id && o.status === 'Delivered'
  );

  const totalEarnings = myCompletedOrders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);

  // Count of pending payments among active orders (specifically first-time customers or payment_sent)
  const allActiveOrders = [...myActiveOrders, ...unassignedOrders];
  const pendingPaymentOrdersCount = allActiveOrders.filter(
    (o) =>
      (o.isFirstTimeCustomer && o.paymentStatus === 'pay_on_delivery') ||
      o.paymentStatus === 'payment_sent' ||
      (o.isFirstTimeCustomer && o.paymentStatus === 'unpaid')
  ).length;

  const packingOrders = myActiveOrders.filter((o) => o.status === 'Packing');
  const onTheWayOrders = myActiveOrders.filter((o) => o.status === 'On the way');

  // 15-minute arrival timer: tick every second while one of my orders is on its way,
  // and mark it delivered automatically once the time runs out
  const [nowMs, setNowMs] = useState(Date.now());
  const timedCount = onTheWayOrders.filter((o) => insideArrivalLeftMs(o, Date.now()) !== null).length;
  useEffect(() => {
    if (!timedCount) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timedCount]);
  const sweeping = React.useRef(false);
  useEffect(() => {
    const overdue = onTheWayOrders.filter((o) => {
      const left = insideArrivalLeftMs(o, nowMs);
      return left !== null && left <= 0;
    });
    if (!overdue.length || sweeping.current) return;
    sweeping.current = true;
    autoDeliverOverdue(overdue)
      .then((n) => {
        if (n) {
          fetchOrdersAndRunners();
          if (onOrderUpdated) onOrderUpdated();
        }
      })
      .finally(() => {
        sweeping.current = false;
      });
  }, [nowMs, onTheWayOrders.length]);
  const mmss = (ms: number) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  // Render Order Card Helper
  const renderOrderCard = (ord: OrderRecord, isAssignedToMe: boolean) => {
    const isFirstTime = ord.isFirstTimeCustomer !== false;
    const isPOD = ord.paymentStatus === 'pay_on_delivery' || ord.paymentMethod === 'pay_on_delivery';
    const isPaymentSent = ord.paymentStatus === 'payment_sent';
    const isPaidConfirmed = ord.paymentStatus === 'payment_confirmed';
    const isUnpaid = ord.paymentStatus === 'unpaid';
    const isOpen = !!expanded[ord.id];

    return (
      <div
        key={ord.id}
        className={`bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border shadow-sm space-y-4 transition-all ${
          isAssignedToMe
            ? 'border-2 border-[#0e9f55]/60 ring-2 ring-[#0e9f55]/10'
            : isFirstTime && isPOD
            ? 'border-2 border-amber-500/50'
            : 'border-slate-200/80 dark:border-slate-800'
        }`}
      >
        {/* CARD HEADER: tap to open or close */}
        <button
          type="button"
          onClick={() => toggleOpen(ord.id)}
          className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="font-extrabold text-base text-slate-900 dark:text-white">{ord.name}</span>
              <span
                className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                  ord.status === 'Packing'
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                    : ord.status === 'On the way'
                    ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300'
                    : ord.status === 'Delivered'
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {ord.status === 'Received' ? 'New' : ord.status}
              </span>
              {isPaymentSent && !ord.paymentNotReceived && (
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white">Payment sent</span>
              )}
              {isPaymentSent && ord.paymentNotReceived && (
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Not paid</span>
              )}
              {ord.express?.status === 'accepted' && (
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#0e9f55] text-white flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Express
                </span>
              )}
              {(ord as any).helperName && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                  {(ord as any).helperEmail === activeRunner?.id ? 'You helped' : `Shared with ${(ord as any).helperName}`}
                </span>
              )}
              {isPOD && !isPaidConfirmed && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  Pay on delivery
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Building className="w-4 h-4 text-[#0e9f55] shrink-0" />
              <span>{shortLocation(ord)}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{ord.deliveryTime}</p>
            <p className="text-[11px] text-slate-400">
              {[
                timeOf(ord.createdAt) && `Ordered ${timeOf(ord.createdAt)}`,
                timeOf(ord.paymentSentAt) && `Tapped paid ${timeOf(ord.paymentSentAt)}`,
                ord.paymentNotReceived && timeOf(ord.paymentNotReceived.at) && `Marked not paid ${timeOf(ord.paymentNotReceived.at)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {(ord.turnRunner || ord.outOfStock) && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {ord.turnRunner ? `Turn: ${ord.turnRunner}` : ''}
                {ord.turnRunner && ord.outOfStock ? ' · ' : ''}
                {ord.outOfStock ? outOfStockSummary(ord as any) : ''}
              </p>
            )}
            {isRoomlyOrder(ord) && isAssignedToMe && <RoomlyPayoutLine order={ord} who="runner" />}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className="font-extrabold text-base text-[#0e9f55] whitespace-nowrap">₦{ord.totalAmount.toLocaleString()}</span>
            <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
        <div className="space-y-4">
        {/* ================= HIGHLIGHTED PENDING PAYMENT CALLOUT ================= */}
        {/* Requirement: Improve RunnerPortal to highlight pending payments for first-time customers */}
        {isFirstTime && isPOD && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-amber-500/20 border-2 border-amber-500/50 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Pending Payment: Pay on Delivery</span>
                </span>
              </div>
              <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-lg bg-amber-500 text-white shadow-xs">
                Collect ₦{ord.totalAmount.toLocaleString()}
              </span>
            </div>

            <div className="text-xs text-amber-950 dark:text-amber-200 space-y-1">
              <p className="font-bold leading-snug">
                First-time student is paying upon arrival. You MUST collect{' '}
                <span className="underline decoration-amber-500 font-extrabold">
                  ₦{ord.totalAmount.toLocaleString()}
                </span>{' '}
                in cash or bank transfer before handing over the goods at {roomText(ord)}.
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                • Total includes ₦{ord.subtotal.toLocaleString()} for goods + ₦{ord.deliveryFee.toLocaleString()} runner transport fee.
              </p>
            </div>

            <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-amber-500/20">
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                Collected payment at room door?
              </span>
              <button
                type="button"
                onClick={() => handleConfirmPayment(ord.id)}
                disabled={updatingId === ord.id}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Payment Collected</span>
              </button>
            </div>
          </div>
        )}

        {/* First time customer with Bank Transfer pending */}
        {isFirstTime && isUnpaid && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-rose-500" />
                <span>First-Time Customer: Awaiting Bank Transfer</span>
              </span>
              <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300">
                ₦{ord.totalAmount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-rose-800 dark:text-rose-300 leading-snug">
              Student has a <strong>15-minute countdown window</strong> to transfer to Kuda Bank.
              Once student clicks they made the payment, a verification prompt will appear here for you to verify.
            </p>
          </div>
        )}

        {/* When student clicked payment sent */}
        {isPaymentSent && (
          <div className={`p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 space-y-2.5 ${ord.paymentNotReceived ? '' : 'animate-pulse'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{ord.paymentNotReceived ? 'Payment not received' : 'Student Marked Payment Sent!'}</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-[#0e9f55]">
                ₦{ord.totalAmount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
              {ord.paymentNotReceived ? (
                <>Marked not paid by {ord.paymentNotReceived.by}. If the <strong>₦{ord.totalAmount.toLocaleString()}</strong> arrives later, confirm it here.</>
              ) : (
                <>Student tapped "Payment Made". Check that <strong>₦{ord.totalAmount.toLocaleString()}</strong> is in your account before packaging. Never pack before you see the money.</>
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {!ord.paymentNotReceived && (
                <button
                  type="button"
                  onClick={() => handleNotReceived(ord)}
                  disabled={updatingId === ord.id}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-40"
                >
                  Payment not received
                </button>
              )}
              <button
                type="button"
                onClick={() => handleConfirmPayment(ord.id, true)}
                disabled={updatingId === ord.id}
                className="px-3 py-1.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Confirm payment & start packaging</span>
              </button>
            </div>
          </div>
        )}

        {/* Payment Confirmed Notification */}
        {isPaidConfirmed && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
            <span className="font-bold text-[#0e9f55] flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              <span>Payment Verified & Confirmed</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
              {ord.paymentConfirmedBy ? `By ${ord.paymentConfirmedBy}` : 'Attended to'}
            </span>
          </div>
        )}

        {/* ================= CUSTOMER DELIVERY NOTES & INSTRUCTIONS ================= */}
        {/* Requirement: Ensure runners can see full order details and customer delivery notes clearly */}
        {ord.customRequest ? (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-400/60 dark:border-amber-700/60 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Customer Delivery Notes & Instructions</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                Important
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 text-xs font-bold text-slate-900 dark:text-white leading-relaxed border border-amber-300/60 dark:border-amber-800/60 italic shadow-2xs">
              "{ord.customRequest}"
            </div>
          </div>
        ) : null}

        {(ord.hasStore || ord.hasFood) && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
            <p className="font-bold text-slate-700 dark:text-slate-200">Outside-school items</p>
            {ord.hasStore && (
              <div className="flex justify-between">
                <span className="text-slate-500">Store items</span>
                <span className="font-bold">{partLabel(ord.storeStatus)}</span>
              </div>
            )}
            {ord.hasFood && (
              <div className="flex justify-between">
                <span className="text-slate-500">Food</span>
                <span className="font-bold">{partLabel(ord.foodStatus)}</span>
              </div>
            )}
          </div>
        )}

        {/* ================= FULL ORDER ITEMS BREAKDOWN WITH PHOTOS ================= */}
        <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-[#0e9f55]" />
              <span>Full Order Breakdown ({ord.items.length} {ord.items.length === 1 ? 'item' : 'items'}):</span>
            </span>
            <span className="text-[10px] text-slate-400">Match shelf photo & plate count</span>
          </div>

          <div className="space-y-2">
            {ord.items.map((i, idx) => (
              <OrderItemRow key={idx} item={i} />
            ))}
          </div>

          {/* Pricing Totals Summary */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 space-y-1 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Items Subtotal:</span>
              <span className="font-mono">₦{ord.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Delivery:</span>
              <span className="font-mono font-bold text-[#0e9f55]">
                ₦{ord.deliveryFee.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <span>Total Value:</span>
              <span className="font-mono text-[#0e9f55]">
                ₦{ord.totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ================= ACTION BUTTONS ================= */}
        <div className="pt-1">
          {/* If assigned to me and currently packaging */}
          {isAssignedToMe && ord.status === 'Packing' && (
            <button
              type="button"
              onClick={() => handleUpdateStatus(ord.id, 'On the way')}
              disabled={updatingId === ord.id}
              className="w-full py-3 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-2xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>Done packing, on my way</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {isAssignedToMe && ord.status === 'Packing' && (
            <p className="mt-1.5 text-[10px] text-slate-500 text-center">
              Tap this when you leave for this student's hostel. They get a {INSIDE_ARRIVAL_MINUTES}-minute countdown and it marks delivered when it ends.
            </p>
          )}

          {/* 15-minute arrival countdown */}
          {isAssignedToMe && ord.status === 'On the way' && insideArrivalLeftMs(ord, nowMs) !== null && (
            <div className="mb-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Be at {roomText(ord)} in
              </span>
              <span className="font-mono text-sm font-black text-[#0e9f55]">{mmss(insideArrivalLeftMs(ord, nowMs) as number)}</span>
            </div>
          )}

          {/* The student says it never arrived */}
          {ord.notReceived && !ord.notReceived.resolvedAt && (
            <div className="mb-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>The student says they haven't received this order. Call them now. Admin has been told.</span>
            </div>
          )}

          {/* If assigned to me and currently en route */}
          {isAssignedToMe && ord.status === 'On the way' && (
            <button
              type="button"
              onClick={() => handleUpdateStatus(ord.id, 'Delivered')}
              disabled={updatingId === ord.id}
              className="w-full py-3 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-2xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Order Handed Over & Delivered to {roomText(ord)}</span>
            </button>
          )}

          {/* Payment must be confirmed before packing (pay on delivery is collected at the door) */}
          {!isAssignedToMe && ord.paymentStatus === 'payment_sent' && (
            <button
              type="button"
              onClick={() => handleConfirmPayment(ord.id, true)}
              disabled={updatingId === ord.id}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Confirm payment (₦{ord.totalAmount.toLocaleString()}) & start packaging</span>
            </button>
          )}

          {/* If unassigned or received: runner can accept and start packaging */}
          {!isAssignedToMe && (ord.paymentStatus === 'payment_confirmed' || ord.paymentStatus === 'pay_on_delivery') && (
            <button
              type="button"
              onClick={() => handleStartPackaging(ord.id)}
              disabled={updatingId === ord.id}
              className="w-full py-3 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Package className="w-4 h-4" />
              <span>Accept & Start Packaging as {activeRunner?.name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

        </div>

        {/* ================= SHARED DELIVERY (max two runners) ================= */}
        {isAssignedToMe && ord.status !== 'Received' && (() => {
          const helperEmail = (ord as any).helperEmail as string | undefined;
          const helperName = (ord as any).helperName as string | undefined;
          const delivered = ord.status === 'Delivered';
          const others = runners.filter((r) => r.id !== ord.runnerId);
          if (helperEmail) {
            return (
              <div className="p-3 rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-xs flex items-center justify-between gap-2">
                <span>
                  Helped by <strong>{helperName}</strong>. Your delivery pay is split 50/50 with them; Roomly's margin does not change.
                </span>
                {!delivered && (
                  <button
                    type="button"
                    disabled={updatingId === ord.id}
                    onClick={() => recordHelper(ord, '')}
                    className="shrink-0 text-[11px] font-bold text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          }
          if (others.length === 0) return null;
          return (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
              <p className="font-bold">Did another runner help with this delivery?</p>
              <div className="flex gap-2">
                <select
                  value={helperPick[ord.id] || ''}
                  onChange={(e) => setHelperPick((p) => ({ ...p, [ord.id]: e.target.value }))}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value="">Choose runner</option>
                  {others.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!helperPick[ord.id] || updatingId === ord.id}
                  onClick={() => {
                    const r = runners.find((x) => x.id === helperPick[ord.id]);
                    if (window.confirm(`Record ${r?.name} as your helper? Your delivery pay on this order will be split 50/50 with them.`)) {
                      recordHelper(ord, helperPick[ord.id]);
                    }
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  Record help
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Agree it between yourselves first. {delivered ? 'After delivery this can be recorded once and not changed.' : ''}
              </p>
            </div>
          );
        })()}

        {/* Chat and call, under the items and total */}
        <div className="space-y-2">
          <a
            href={`tel:${ord.phone}`}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white text-xs font-bold"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            <span>Call {ord.name} · {ord.phone}</span>
          </a>
          {isAssignedToMe && (
            <OrderChat orderId={ord.id} role="runner" senderName={activeRunner?.name || 'Runner'} closed={ord.status === 'Delivered'} />
          )}
        </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 selection:bg-[#0e9f55]/20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-3">
        <div className="max-w-[480px] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold shadow-xs">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block font-extrabold text-sm text-slate-900 dark:text-white truncate">Runner Portal</span>
              <p className="text-[11px] font-bold text-[#0e9f55] truncate">
                Welcome back, {getCurrentStaff()?.name || 'Runner'}
              </p>
              {isRunner && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  You deliver to the {mySide === 'girls' ? "girls' hostels" : "boys' hostels"}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <SoundToggle className="hover:bg-slate-100 dark:hover:bg-slate-800" />
            <ThemeToggle className="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" />
            <button
              type="button"
              onClick={() => logoutStaff()}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-500 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="p-4 space-y-4 max-w-[480px] mx-auto">
        {/* TOP, always first: the runner's overview. The admin viewing this portal picks a runner instead. */}
        {isRunner ? (
          <ProviderOverview kind="runner" />
        ) : (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#0e9f55]" />
              <span>Runner</span>
            </label>
          </div>

          {getCurrentStaff()?.role === 'runner' ? (
            <p className="text-sm font-bold text-slate-900 dark:text-white">{getCurrentStaff()?.name}</p>
          ) : (
          <select
            value={activeRunnerId}
            disabled={getCurrentStaff()?.role === 'runner'}
            onChange={(e) => setActiveRunnerId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm font-bold bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
          >
            {runners.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.phone}
              </option>
            ))}
          </select>
          )}

        </div>

        )}

        {/* Students waiting over 30 minutes for their payment to be checked */}
        {isRunner && waitingLong > 0 && (
          <button
            type="button"
            onClick={goToRunnerOrders}
            className="w-full text-left p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1 cursor-pointer"
          >
            <p className="font-extrabold text-sm">
              {waitingLong} {waitingLong === 1 ? 'student has' : 'students have'} waited over 30 minutes
            </p>
            <p className="leading-snug">
              They tapped "I've paid". Check your account now, then confirm the payment, or tap Payment not received if the money isn't there. Tap to see them.
            </p>
          </button>
        )}

        {/* What needs doing right now: short, jumps to each section */}
        {isRunner && (
          <AttentionCard
            runner
            needsAccount={!hasAccount}
            toConfirm={attConfirm}
            toSend={attSend}
            requests={openRequests}
            express={attExpress}
            onOrders={goToRunnerOrders}
          />
        )}

        {/* How it works: open until they tap "Got it", then a small bar */}
        {isRunner && <OperatorGuide kind="runner" />}

        {/* Settlement comes up here when they are done for the day with money to send, or a past day is open */}
        {isRunner && (
          <div id="op-settle-top" className="scroll-mt-20">
            <ProviderSettlement kind="runner" placement="top" />
          </div>
        )}

        {/* Payment account first, until it is saved; then it moves to the bottom */}
        {isRunner && !hasAccount && (
          <div id="op-account" className="scroll-mt-20">
            <PayAccountForm />
          </div>
        )}

        {isRunner && <WeeklyAvailability />}

        <BatchSwitches />

        {isRunner && EXPRESS_ENABLED && (
          <div id="op-express" className="scroll-mt-20">
            <ExpressPanel orders={insideOrders} />
          </div>
        )}

        {/* Admin: inside requests, with the student's name and number */}
        {!isRunner && <ProductRequestsPanel side="inside" />}

        {/* A request waiting for a price blocks the student's cart, so it comes up here */}
        {isRunner && openRequests > 0 && (
          <div id="op-requests" className="scroll-mt-20">
            <ProductRequestsPanel />
          </div>
        )}

        <p id="op-orders" className="text-xs font-black uppercase tracking-wider text-slate-500 px-1 pt-1 scroll-mt-20">Orders</p>
        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {([
            ['all', `All orders (${allActiveOrders.length})`],
            ['packing', `Packing (${packingOrders.length})`],
            ['on_the_way', `On the way (${onTheWayOrders.length})`],
            ['notpaid', `Not paid (${notPaidOrders.length})`],
            ['delivered', `Delivered (${myCompletedOrders.length})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                activeFilter === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && orders.length === 0 && <p className="text-xs text-center text-slate-400 py-6">Loading orders…</p>}

        {activeFilter === 'all' && (
          <div className="space-y-5">
            {myActiveOrders.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">My orders ({myActiveOrders.length})</h3>
                {myActiveOrders.map((ord) => renderOrderCard(ord, true))}
              </div>
            )}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Waiting for a runner ({unassignedOrders.length})
              </h3>
              {unassignedOrders.length === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                  No new orders right now.
                </div>
              ) : (
                unassignedOrders.map((ord) => renderOrderCard(ord, false))
              )}
            </div>
          </div>
        )}

        {activeFilter !== 'all' && (
          <div className="space-y-3">
            {(activeFilter === 'packing' ? packingOrders : activeFilter === 'on_the_way' ? onTheWayOrders : activeFilter === 'notpaid' ? notPaidOrders : myCompletedOrders).length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                Nothing here yet.
              </div>
            ) : (
              (activeFilter === 'packing' ? packingOrders : activeFilter === 'on_the_way' ? onTheWayOrders : activeFilter === 'notpaid' ? notPaidOrders : myCompletedOrders).map((ord) =>
                renderOrderCard(ord, activeFilter !== 'notpaid' || ord.runnerId === activeRunner?.id)
              )
            )}
          </div>
        )}

        {/* BELOW ORDERS: settlement, then products and prices, then the rest */}
        {isRunner && (
          <div id="op-settle-bottom" className="scroll-mt-20">
            <ProviderSettlement kind="runner" placement="bottom" />
          </div>
        )}
        {isRunner && <OperatorProductsPanel />}
        {isRunner && openRequests === 0 && <ProductRequestsPanel />}
        {isRunner && <MyRatingsPanel />}
        {isRunner && hasAccount && <PayAccountForm />}
      </div>
    </div>
  );
};
