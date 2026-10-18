import React, { useState, useEffect, useMemo } from 'react';
import { OrderChat } from './OrderChat';
import {
  Truck,
  Package,
  Phone,
  CheckCircle,
  Clock,
  ArrowRight,
  RefreshCw,
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
import { OrderRecord, DeliveryRunner, CartItem, locationText, shortLocation, roomText } from '../types';
import {
  getOrders,
  getRunners,
  updateOrderStatus,
  confirmPayment,
  startPackagingOrder,
  subscribeOrders,
  getCurrentStaff,
  logoutStaff,
} from '../api.js';

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
          <span className="text-2xl select-none">{item.emoji || '📦'}</span>
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
                🥣 0 Plates (Proteins/Item Only)
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                🍽️ {item.plates} {item.plates === 1 ? 'Plate' : 'Plates'}
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
  const [activeRunnerId, setActiveRunnerId] = useState<string>(() => getCurrentStaff()?.id || 'run-1');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Main Mode Tab: 'active' (orders to accept & packaging) vs 'history' (past completed deliveries)
  const [runnerTab, setRunnerTab] = useState<'active' | 'history'>('active');

  // Filter Sub-tabs for Active Orders
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending_first_time' | 'confirmed' | 'premium'>('all');

  const activeRunner = runners.find((r) => r.id === activeRunnerId) || runners[0];

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
    return subscribeOrders(() => {
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

  const handleConfirmPayment = async (orderId: string) => {
    if (!activeRunner) return;
    setUpdatingId(orderId);
    try {
      await confirmPayment(orderId, activeRunner.name);
      await fetchOrdersAndRunners();
      if (onOrderUpdated) onOrderUpdated();
    } finally {
      setUpdatingId(null);
    }
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

  // 1. Active Orders Available to Accept (unassigned or received)
  const unassignedOrders = orders.filter(
    (o) => o.status !== 'Delivered' && o.status !== 'Cancelled' && (!o.runnerId || o.status === 'Received')
  );

  // 2. Active Orders Currently Assigned to Chosen Runner
  const myActiveOrders = orders.filter(
    (o) =>
      o.runnerId === activeRunner?.id &&
      o.status !== 'Delivered' &&
      o.status !== 'Cancelled'
  );

  // 3. Past Completed Orders Delivered by Chosen Runner (History)
  const myCompletedOrders = orders.filter(
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

  // Filter Active orders based on chosen filter sub-tab
  const filterOrderList = (list: OrderRecord[]) => {
    if (activeFilter === 'all') return list;
    if (activeFilter === 'pending_first_time') {
      return list.filter(
        (o) =>
          (o.isFirstTimeCustomer && o.paymentStatus === 'pay_on_delivery') ||
          o.paymentStatus === 'payment_sent' ||
          (o.isFirstTimeCustomer && o.paymentStatus === 'unpaid')
      );
    }
    if (activeFilter === 'confirmed') {
      return list.filter((o) => o.paymentStatus === 'payment_confirmed');
    }
    if (activeFilter === 'premium') {
      return list.filter((o) => o.deliveryBatch === 'premium');
    }
    return list;
  };

  const filteredMyActive = filterOrderList(myActiveOrders);
  const filteredUnassigned = filterOrderList(unassignedOrders);

  // Render Order Card Helper
  const renderOrderCard = (ord: OrderRecord, isAssignedToMe: boolean) => {
    const isFirstTime = ord.isFirstTimeCustomer !== false;
    const isPOD = ord.paymentStatus === 'pay_on_delivery' || ord.paymentMethod === 'pay_on_delivery';
    const isPaymentSent = ord.paymentStatus === 'payment_sent';
    const isPaidConfirmed = ord.paymentStatus === 'payment_confirmed';
    const isUnpaid = ord.paymentStatus === 'unpaid';

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
        {/* CARD HEADER: ID, STATUS, BADGES */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="font-extrabold font-mono text-base text-slate-900 dark:text-white">
                #{ord.id}
              </span>

              {/* Status Badge */}
              <span
                className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                  ord.status === 'Packing'
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-800'
                    : ord.status === 'On the way'
                    ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-800'
                    : ord.status === 'Delivered'
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {ord.status === 'Packing'
                  ? '📦 Being Packaged'
                  : ord.status === 'On the way'
                  ? '🛵 Packaged & En Route'
                  : ord.status}
              </span>

              {/* FIRST-TIME CUSTOMER BADGE (Highlighted Requirement) */}
              {isFirstTime ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                  <BadgeAlert className="w-3 h-3 stroke-[2.5]" />
                  <span>First-Time Customer</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Repeat Student</span>
                </span>
              )}

              {/* Premium instant badge */}
              {ord.deliveryBatch === 'premium' && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center gap-0.5">
                  <Zap className="w-3 h-3 fill-current" />
                  <span>Premium 30–60m (₦1,500)</span>
                </span>
              )}
            </div>

            {/* Room, Floor & Building Location */}
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white pt-0.5">
              <Building className="w-4 h-4 text-[#0e9f55] shrink-0" />
              <span className="text-sm">
                {locationText(ord)}
              </span>
            </div>
          </div>

          {/* Pricing Header */}
          <div className="text-right shrink-0">
            <span className="font-mono font-extrabold text-base text-[#0e9f55] block">
              ₦{ord.totalAmount.toLocaleString()}
            </span>
            <span className="block text-[10px] font-semibold text-slate-400">
              Transport Fee: ₦{ord.deliveryFee.toLocaleString()}
            </span>
          </div>
        </div>

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
                🚨 First-time student is paying upon arrival. You MUST collect{' '}
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
              ⏳ Student has a <strong>15-minute countdown window</strong> to transfer to Kuda Bank.
              Once student clicks they made the payment, a verification prompt will appear here for you to verify.
            </p>
          </div>
        )}

        {/* When student clicked payment sent */}
        {isPaymentSent && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 space-y-2.5 animate-pulse">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Student Marked Payment Sent!</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-[#0e9f55]">
                ₦{ord.totalAmount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
              Student tapped "Payment Made". Verify <strong>₦{ord.totalAmount.toLocaleString()}</strong> has landed in the Kuda Bank account before packaging.
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => handleConfirmPayment(ord.id)}
                disabled={updatingId === ord.id}
                className="px-3 py-1.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Confirm Payment Received</span>
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

        {/* ================= CUSTOMER DETAILS & DIRECT CONTACT ================= */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                Student: {ord.name}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Scheduled: {ord.deliveryTime}
              </span>
            </div>

            {/* Direct Phone & SMS Actions */}
            <div className="flex items-center gap-1.5">
              <a
                href={`tel:${ord.phone}`}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                title={`Call ${ord.phone}`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call {ord.phone}</span>
              </a>

              <a
                href={`sms:${ord.phone}?body=Hello%20${encodeURIComponent(ord.name)},%20this%20is%20your%20Roomly%20delivery%20runner.`}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Send SMS to student"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>SMS</span>
              </a>
            </div>
          </div>
        </div>

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
        ) : (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/30 text-[11px] text-slate-400 dark:text-slate-500 italic flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Customer did not leave special delivery notes.</span>
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
              <span>Runner Delivery Fee ({ord.deliveryBatch === 'premium' ? '⚡ Premium Instant' : 'Batch'}):</span>
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
              <span>Order Packaged & On The Way</span>
              <ArrowRight className="w-4 h-4" />
            </button>
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

          {/* If unassigned or received: runner can accept and start packaging */}
          {!isAssignedToMe && (
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

          {isAssignedToMe && (
            <OrderChat orderId={ord.id} role="runner" senderName={activeRunner?.name || 'Runner'} closed={ord.status === 'Delivered'} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 selection:bg-[#0e9f55]/20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-3">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold shadow-xs">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Runner Portal
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#0e9f55]">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Pick orders, verify POD & complete delivery runs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchOrdersAndRunners}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Refresh all orders"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onBackToCustomer}
              className="text-xs font-bold text-[#0e9f55] hover:underline px-2.5 py-1.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
            >
              Storefront
            </button>
            <button
              type="button"
              onClick={() => logoutStaff()}
              className="text-xs font-bold text-slate-500 hover:text-rose-500 px-2.5 py-1.5 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="p-4 space-y-4 max-w-[480px] mx-auto">
        {/* Runner Name Chooser Card (Runner selects their identity) */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#0e9f55]" />
              <span>Select Your Runner Name:</span>
            </label>
            <span className="text-xs font-mono font-bold text-[#0e9f55]">
              {myActiveOrders.length} active · {myCompletedOrders.length} delivered
            </span>
          </div>

          <select
            value={activeRunnerId}
            disabled={getCurrentStaff()?.role === 'runner'}
            onChange={(e) => setActiveRunnerId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm font-bold bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
          >
            {runners.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.phone} ({r.currentZone || 'Campus Runner'})
              </option>
            ))}
          </select>

          {/* Quick Metrics for Chosen Runner */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                Active Runs
              </span>
              <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                {myActiveOrders.length}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                Delivered
              </span>
              <span className="text-base font-extrabold text-[#0e9f55] font-mono">
                {myCompletedOrders.length}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                My Earnings
              </span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                ₦{totalEarnings.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Mode Navigation Tabs: Active Orders vs Order History */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-2xl">
          <button
            type="button"
            onClick={() => setRunnerTab('active')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              runnerTab === 'active'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Active & To Accept ({unassignedOrders.length + myActiveOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setRunnerTab('history')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              runnerTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>My Delivery History ({myCompletedOrders.length})</span>
          </button>
        </div>

        {/* ================= TAB 1: ACTIVE ORDERS & DISPATCH ================= */}
        {runnerTab === 'active' && (
          <div className="space-y-4">
            {/* Filter Pills for Active Orders */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800'
                }`}
              >
                All Orders ({allActiveOrders.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('pending_first_time')}
                className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                  activeFilter === 'pending_first_time'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-900/60'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Pending / POD ({pendingPaymentOrdersCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('confirmed')}
                className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                  activeFilter === 'confirmed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <CheckCircle className="w-3 h-3" />
                <span>Paid Confirmed</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('premium')}
                className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                  activeFilter === 'premium'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 border border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>⚡ Premium (₦1.5k)</span>
              </button>
            </div>

            {/* SUB-SECTION A: ORDERS CURRENTLY PACKAGING / DELIVERING BY ACTIVE RUNNER */}
            {filteredMyActive.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#0e9f55]" />
                    <span>My In-Progress Packaging & Deliveries ({filteredMyActive.length})</span>
                  </h2>
                </div>

                {filteredMyActive.map((ord) => renderOrderCard(ord, true))}
              </div>
            )}

            {/* SUB-SECTION B: ACTIVE ORDERS WAITING FOR A RUNNER TO ACCEPT */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>Available Orders to Accept ({filteredUnassigned.length})</span>
                </h2>
              </div>

              {filteredUnassigned.length === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs space-y-1">
                  <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                  <p className="font-bold text-slate-600 dark:text-slate-300">
                    No matching unassigned orders right now.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    New student orders will appear here automatically as they are submitted!
                  </p>
                </div>
              ) : (
                filteredUnassigned.map((ord) => renderOrderCard(ord, false))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: MY DELIVERY HISTORY ================= */}
        {runnerTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#0e9f55]" />
                <span>Orders Delivered by {activeRunner?.name} ({myCompletedOrders.length})</span>
              </h2>

              <span className="text-xs font-mono font-black text-[#0e9f55]">
                Total Earned: ₦{totalEarnings.toLocaleString()}
              </span>
            </div>

            {myCompletedOrders.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs space-y-2">
                <History className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  No past completed deliveries for {activeRunner?.name} yet.
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Accept an order from the active tab and complete the run to room doors to build your delivery history!
                </p>
              </div>
            ) : (
              myCompletedOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-emerald-200/80 dark:border-emerald-900/50 shadow-xs space-y-3.5"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                          #{ord.id}
                        </span>
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-100 text-[#0e9f55] dark:bg-emerald-950/60 flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Delivered</span>
                        </span>
                        {ord.deliveryBatch === 'premium' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700">
                            ⚡ Premium Instant
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Building className="w-3.5 h-3.5 text-[#0e9f55]" />
                        <span>
                          {locationText(ord)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        Student: {ord.name} ({ord.phone}) · {ord.deliveryTime}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[#0e9f55] border border-emerald-200/60 font-mono shadow-2xs">
                        +₦{ord.deliveryFee.toLocaleString()} Earned
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-1">
                        Total Order: ₦{ord.totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Customer Delivery Notes if any */}
                  {ord.customRequest && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-xs italic space-y-0.5">
                      <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider block">
                        Customer Note:
                      </span>
                      <p className="text-slate-700 dark:text-slate-300">"{ord.customRequest}"</p>
                    </div>
                  )}

                  {/* Delivered Timestamp & Payment Status */}
                  <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#0e9f55]" />
                      <span>
                        Delivered on:{' '}
                        {ord.deliveredAt
                          ? new Date(ord.deliveredAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recently'}
                      </span>
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Payment:{' '}
                      {ord.paymentMethod === 'pay_on_delivery'
                        ? 'POD (Collected at Room)'
                        : 'Bank Transfer'}
                    </span>
                  </div>

                  {/* Delivered Items Summary with Photos */}
                  <div className="space-y-1.5">
                    {ord.items.map((i, idx) => (
                      <OrderItemRow key={idx} item={i} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
