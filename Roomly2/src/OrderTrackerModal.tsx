import React, { useState, useEffect } from 'react';
import { OrderChat } from './OrderChat';
import { Phone as PhoneIcon } from 'lucide-react';
import {
  X,
  CheckCircle2,
  Package,
  Truck,
  Home,
  Copy,
  Check,
  Search,
  Building,
  RefreshCw,
  Clock,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  Send,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { OrderRecord, locationText, shortLocation, roomText, partLabel } from '../types';
import { STORE_CONFIG, OUT_OF_STOCK_LABEL } from '../config';
import { markPaymentSent, paymentState } from '../api.js';

interface OrderTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord | null;
  onSearchOrderId: (orderId: string) => Promise<OrderRecord | null>;
  onAdvanceStatus: (orderId: string) => Promise<OrderRecord | null>;
  userOrders?: OrderRecord[];
  onSelectOrder?: (order: OrderRecord) => void;
  onPaymentSent?: (updatedOrder: OrderRecord) => void;
  /** Opens the Active Orders & History list */
  onOpenAll?: () => void;
}

const STATUS_STEPS = [
  { key: 'Received', label: 'Received', icon: Clock, desc: 'Order received & registered' },
  { key: 'Packing', label: 'Packaging', icon: Package, desc: 'Runner packaging your items at kitchen' },
  { key: 'On the way', label: 'On the way', icon: Truck, desc: 'Runner walking to your hostel' },
  { key: 'Delivered', label: 'Delivered', icon: Home, desc: 'Arrived at your room door' },
] as const;

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  isOpen,
  onClose,
  order,
  onSearchOrderId,
  onAdvanceStatus,
  userOrders = [],
  onSelectOrder,
  onPaymentSent,
  onOpenAll,
}) => {
  if (!isOpen) return null;

  const [searchQuery, setSearchQuery] = useState('');
  const [currentOrder, setCurrentOrder] = useState<OrderRecord | null>(order);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [markingPayment, setMarkingPayment] = useState(false);
  const [errorSearch, setErrorSearch] = useState('');

  // 15-minute countdown calculation
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  React.useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  // Live 15-min countdown timer effect
  useEffect(() => {
    if (!currentOrder || currentOrder.paymentStatus === 'payment_confirmed' || currentOrder.paymentMethod === 'pay_on_delivery') {
      return;
    }

    const updateTimer = () => {
      const deadline = currentOrder.paymentDeadline
        ? new Date(currentOrder.paymentDeadline).getTime()
        : new Date(currentOrder.createdAt).getTime() + 15 * 60 * 1000;

      const diff = deadline - Date.now();
      if (diff <= 0) {
        setTimeRemaining('00:00 (Time expired)');
      } else {
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        const mmss = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        setTimeRemaining(hrs > 0 ? `${hrs}h ${mmss}` : mmss);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentOrder]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setErrorSearch('');
    try {
      const found = await onSearchOrderId(searchQuery.trim());
      if (found) {
        setCurrentOrder(found);
      } else {
        setErrorSearch(`No order found matching "${searchQuery.trim()}"`);
      }
    } catch {
      setErrorSearch('Failed to find order');
    } finally {
      setIsSearching(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleStudentClickPaymentMade = async () => {
    if (!currentOrder) return;
    setMarkingPayment(true);
    try {
      const updated = await markPaymentSent(currentOrder.id);
      if (updated) {
        setCurrentOrder(updated);
        if (onPaymentSent) onPaymentSent(updated);
      } else {
        window.alert('Could not record your payment. If this order has expired, please place a new order.');
      }
    } finally {
      setMarkingPayment(false);
    }
  };

  const handleAdvance = async () => {
    if (!currentOrder) return;
    setAdvancing(true);
    try {
      const updated = await onAdvanceStatus(currentOrder.id);
      if (updated) {
        setCurrentOrder(updated);
      }
    } finally {
      setAdvancing(false);
    }
  };

  const getCurrentStepIndex = () => {
    if (!currentOrder) return 0;
    const index = STATUS_STEPS.findIndex((s) => s.key === currentOrder.status);
    return index >= 0 ? index : 0;
  };

  const stepIndex = getCurrentStepIndex();
  // Students pay the runner or operator on this order; older orders use Roomly's account
  const payAcct = (currentOrder as any)?.payTo || STORE_CONFIG.bankDetails;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden border-t sm:border border-slate-200/80 dark:border-slate-800">
        {/* Grab bar on mobile */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              Order status
            </h2>
            {onOpenAll ? (
              <button
                type="button"
                onClick={onOpenAll}
                className="text-xs font-bold text-[#0e9f55] hover:underline cursor-pointer"
              >
                See all active orders &amp; history
              </button>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Live updates directly to your room door</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close tracker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Active Order Card */}
          {currentOrder ? (
            <div className="space-y-4">
              {/* Delivery window and location */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                <div>
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Delivery window</span>
                  <p className="text-sm font-extrabold text-[#0e9f55] mt-0.5">{currentOrder.deliveryTime}</p>
                </div>
                <div className="flex items-start gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Building className="w-4 h-4 text-[#0e9f55] shrink-0 mt-0.5" />
                  <span>{locationText(currentOrder)}</span>
                </div>
                {(currentOrder.operatorName || currentOrder.turnRunner || currentOrder.outOfStock) && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5 pt-1 border-t border-slate-200 dark:border-slate-700">
                    {currentOrder.operatorName && <p>From: <strong>{currentOrder.operatorName}</strong> (delivered to the school gate)</p>}
                    {!currentOrder.operatorName && currentOrder.turnRunner && <p>Runner: <strong>{currentOrder.turnRunner}</strong></p>}
                    {currentOrder.outOfStock && <p>If out of stock: {OUT_OF_STOCK_LABEL[currentOrder.outOfStock]}</p>}
                  </div>
                )}
              </div>

              {/* GATE PICKUP: separate request to an inside runner */}
              {currentOrder.gatePickup && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1">
                  <p className="font-bold text-slate-800 dark:text-slate-100">Gate to room pickup</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {currentOrder.gatePickup.status === 'pending'
                      ? 'Waiting for an inside runner to accept.'
                      : currentOrder.gatePickup.status === 'accepted'
                      ? `${currentOrder.gatePickup.runnerName || 'A runner'} will bring it to your room. Pay them ₦${currentOrder.gatePickup.fee.toLocaleString()}${currentOrder.gatePickup.heavy ? ' (heavy parcel)' : ''} directly.`
                      : currentOrder.gatePickup.status === 'delivered'
                      ? 'Brought to your room.'
                      : currentOrder.gatePickup.status === 'refunded'
                      ? 'The runner refunded this pickup. Please collect at the gate.'
                      : 'No runner could take this one. Please collect at the school gate.'}
                  </p>
                  {currentOrder.gatePickup.runnerPhone && currentOrder.gatePickup.status === 'accepted' && (
                    <a href={`tel:${currentOrder.gatePickup.runnerPhone}`} className="inline-block font-bold text-[#0e9f55]">
                      Call {currentOrder.gatePickup.runnerName}
                    </a>
                  )}
                </div>
              )}

              {/* PAYMENT: bank details until the student taps "payment made", then a short note, then nothing once confirmed */}
              {currentOrder.paymentMethod === 'pay_now' && paymentState(currentOrder) === 'expired' ? (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-200 font-medium">
                  This order was not paid for and expired at the end of the day. Please place a new order.
                </div>
              ) : currentOrder.paymentMethod === 'pay_now' ? (
                currentOrder.paymentStatus === 'payment_confirmed' ? null : currentOrder.paymentStatus === 'payment_sent' ? (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-900 dark:text-emerald-200 font-medium flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#0e9f55] stroke-[3] shrink-0 mt-0.5" />
                    <span>
                      Payment sent. Once your payment is confirmed, your order will be attended to and start being packaged.
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                        <CreditCard className="w-4 h-4 text-amber-600" />
                        <span>Bank Transfer Payment</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100">
                        {timeRemaining ? timeRemaining : 'Pay soon'}
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
                      {paymentState(currentOrder) === 'missed' && (
                        <strong className="block mb-1 text-rose-700 dark:text-rose-300">
                          You missed this batch. If you pay now, your order joins the next batch. Unpaid orders expire at the end of the day.
                        </strong>
                      )}
                      {paymentState(currentOrder) === 'open' && currentOrder.paymentDeadline && (
                        <strong className="block mb-1">
                          Pay before{' '}
                          {new Date(currentOrder.paymentDeadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to
                          join your batch.
                        </strong>
                      )}
                      Orders are attended to once payment is confirmed. Please transfer{' '}
                      <strong>₦{currentOrder.totalAmount.toLocaleString()}</strong> to:
                    </p>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Bank</span>
                        <span className="font-bold">{payAcct.bankName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Account number</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold">{payAcct.accountNumber}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(payAcct.accountNumber, 'acc')}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Account name</span>
                        <span className="font-semibold">{payAcct.accountName}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStudentClickPaymentMade}
                      disabled={markingPayment}
                      className="w-full py-2.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>I have made payment</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                    <Banknote className="w-4 h-4 text-blue-600" />
                    <span>Pay on delivery</span>
                  </div>
                  <span className="font-bold text-blue-900 dark:text-blue-200">
                    ₦{currentOrder.totalAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {/* PACKAGING & RUNNER STATUS CARD (User requirement: no live location; shows packaging, then packaged & on the way) */}
              <div className="space-y-3">
                {currentOrder.status === 'Packing' ? (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                          <Package className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-amber-950 dark:text-amber-200 block">
                            Your order is being packaged!
                          </span>
                          <span className="text-[11px] text-amber-800 dark:text-amber-400">
                            {currentOrder.runnerName ? `Runner: ${currentOrder.runnerName}` : 'Runner assigned'}
                          </span>
                        </div>
                      </div>

                      {currentOrder.runnerPhone && (
                        <a
                          href={`tel:${currentOrder.runnerPhone}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold shadow-xs hover:bg-[#0b8044] transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-amber-900 dark:text-amber-300 leading-snug">
                      Your items are currently being gathered and packaged at the campus kitchen / store. Once complete, your runner will head directly to {shortLocation(currentOrder)}.
                    </p>
                  </div>
                ) : currentOrder.status === 'On the way' ? (
                  <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          <Truck className="w-4 h-4 animate-bounce" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-blue-950 dark:text-blue-200 block">
                            Order Packaged & On The Way!
                          </span>
                          <span className="text-[11px] text-blue-700 dark:text-blue-400">
                            {currentOrder.runnerName ? `Runner: ${currentOrder.runnerName}` : 'Dispatched'}
                          </span>
                        </div>
                      </div>

                      {currentOrder.runnerPhone && (
                        <a
                          href={`tel:${currentOrder.runnerPhone}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold shadow-xs hover:bg-[#0b8044] transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-blue-900 dark:text-blue-300 leading-snug">
                      Your order has been packaged and is en route to <strong>{shortLocation(currentOrder)}</strong>. Please listen for your runner!
                    </p>
                  </div>
                ) : currentOrder.status === 'Delivered' ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#0e9f55] text-white flex items-center justify-center font-bold shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                        Order Delivered & Handed Over!
                      </h4>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-400">
                        {currentOrder.cart === 'store' || currentOrder.cart === 'food'
                          ? currentOrder.gatePickup && currentOrder.gatePickup.status !== 'refused' && currentOrder.gatePickup.status !== 'refunded'
                            ? 'Your items are at the school gate, and the runner is bringing them to your room.'
                            : 'Your items are at the school gate. Please collect them.'
                          : `Delivered to ${shortLocation(currentOrder)}. Enjoy your order!`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {currentOrder.paymentStatus === 'payment_sent'
                        ? 'Payment submitted! Awaiting verification from runner/admin to start packaging.'
                        : currentOrder.paymentMethod === 'pay_on_delivery'
                        ? 'Order placed. Awaiting runner to accept and begin packaging.'
                        : 'Awaiting bank transfer confirmation before packaging begins.'}
                    </span>
                  </div>
                )}
              </div>

              {/* 4-Step Progress Tracker (inside orders; outside carts show the store/food status below) */}
              {currentOrder.cart !== 'store' && currentOrder.cart !== 'food' && (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Order Progress
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#0e9f55] dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/40">
                    {currentOrder.status === 'Packing' ? 'Being Packaged' : currentOrder.status}
                  </span>
                </div>

                {/* Timeline */}
                <div className="relative pl-6 space-y-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {STATUS_STEPS.map((step, idx) => {
                    const isDone = idx < stepIndex || currentOrder.status === 'Delivered';
                    const isCurrent = idx === stepIndex && currentOrder.status !== 'Delivered';
                    const IconComponent = step.icon;

                    return (
                      <div key={step.key} className="relative flex items-start gap-3">
                        <div
                          className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                            isDone
                              ? 'bg-[#0e9f55] text-white ring-4 ring-emerald-50 dark:ring-emerald-950/60'
                              : isCurrent
                              ? 'bg-[#0e9f55] text-white ring-4 ring-emerald-100 dark:ring-emerald-900 animate-pulse'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isDone ? (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          ) : (
                            <IconComponent className="w-3 h-3" />
                          )}
                        </div>

                        <div className="min-w-0 pl-1">
                          <h4
                            className={`text-xs font-bold ${
                              isDone || isCurrent
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {step.label}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {(currentOrder.hasStore || currentOrder.hasFood) && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
                  <p className="font-bold text-slate-700 dark:text-slate-200">Outside-school items</p>
                  {currentOrder.hasStore && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Store items</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{partLabel(currentOrder.storeStatus)}</span>
                    </div>
                  )}
                  {currentOrder.hasFood && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Food</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{partLabel(currentOrder.foodStatus)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Order Items Breakdown with Recognizable Product Photos */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Products in this Order ({currentOrder.items?.length || 0})
                  </span>
                  <span className="text-[10px] text-slate-400">Visual product review</span>
                </div>

                <div className="space-y-2 text-xs">
                  {currentOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      {/* Product Image Thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center">
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
                          <span className="text-xl select-none">{item.emoji || ''}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h5 className="font-bold text-slate-900 dark:text-white truncate">
                          {item.quantity}x {item.name}
                        </h5>
                        {item.extras && item.extras.length > 0 && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400">
                            {item.extras.map((e) => (
                              <span key={e.id} className="block truncate">
                                + {e.quantity || 1}x {e.name} (₦{(e.price * (e.quantity || 1)).toLocaleString()})
                              </span>
                            ))}
                          </div>
                        )}
                        {item.plates !== undefined && item.plates > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {item.plates} {item.plates === 1 ? 'plate' : 'plates'}
                          </span>
                        )}
                      </div>

                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white shrink-0">
                        ₦{item.totalPrice.toLocaleString()}
                      </span>
                    </div>
                  ))}

                  {currentOrder.customRequest && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 italic text-xs">
                      <strong>Custom Request:</strong> "{currentOrder.customRequest}"
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Items</span>
                      <span>₦{(currentOrder.subtotal || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Delivery</span>
                      <span>₦{(currentOrder.deliveryFee || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-1">
                      <span>Total</span>
                      <span className="text-[#0e9f55]">₦{currentOrder.totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat and call, under the items and total */}
              <div className="space-y-2">
                {currentOrder.runnerPhone && (
                  <a
                    href={`tel:${currentOrder.runnerPhone}`}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white text-xs font-bold"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    <span>Call {currentOrder.runnerName || 'your runner'}</span>
                  </a>
                )}
                <OrderChat
                  orderId={currentOrder.id}
                  role="customer"
                  senderName={currentOrder.name}
                  closed={currentOrder.status === 'Delivered'}
                  defaultOpen
                  title="Order taking long? Message your runner"
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-10 space-y-3">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No order selected. Open Active Orders &amp; History to pick one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
