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
import { OrderRecord, locationText, shortLocation, roomText, partLabel, expressTiming, orderStageOf } from '../types';
import {
  STORE_CONFIG,
  OUT_OF_STOCK_LABEL,
  HOSTELS,
  GATE_PICKUP_FEE,
  EXPRESS_MINUTES,
  EXPRESS_REFUND,
  EXPRESS_ACCEPT_MINUTES,
  EXPRESS_CONFIRM_MINUTES,
  GATE_ARRIVAL_MINUTES,
} from '../config';
import { markPaymentSent, paymentState, requestGatePickup, markGatePickupPaid, getPayProvider, cancelExpress, markExpressReceived } from '../api.js';
import { RateExperience } from './RateExperience';

const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

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

// Inside orders: three steps the student follows (the runner taps Delivered at the end)
const STATUS_STEPS = [
  { key: 'received', label: 'Received', icon: Clock, desc: 'You told us you paid' },
  { key: 'packaging', label: 'Confirmed & Packaging', icon: Package, desc: 'Your runner confirmed your payment and is packing it' },
  { key: 'onway', label: 'On the way to the hostel', icon: Truck, desc: 'Your runner is bringing it to you' },
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
    const st = orderStageOf(currentOrder);
    return st === 'onway' || st === 'delivered' ? 2 : st === 'packaging' ? 1 : 0;
  };

  const stepIndex = getCurrentStepIndex();
  // Students pay the runner or operator on this order; older orders use Roomly's account
  // Students only ever see the runner's or operator's own account (never Roomly's)
  // An order placed while nobody was available shows the account of whoever has taken the batch since
  const [provTick, setProvTick] = useState(0);
  useEffect(() => {
    const h = () => setProvTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    const id = window.setInterval(h, 30000);
    return () => {
      window.removeEventListener('roomly-batches', h);
      window.clearInterval(id);
    };
  }, []);
  void provTick;
  // Express orders are paid to the runner who accepted, never to the batch runner
  const liveProvider = currentOrder && !(currentOrder as any).payTo && !currentOrder.express ? getPayProvider(currentOrder) : null;
  const payAcct = (currentOrder as any)?.payTo || liveProvider?.payTo || null;
  const [askingGate, setAskingGate] = useState(false);
  // Gate to room: where to bring it, then pay the runner who accepts
  const [gateHostel, setGateHostel] = useState(HOSTELS[0]);
  const [gateRoom, setGateRoom] = useState('');
  const [gateFormOpen, setGateFormOpen] = useState(false);
  const payRunner = async () => {
    if (!currentOrder) return;
    setAskingGate(true);
    const updated = await markGatePickupPaid(currentOrder.id);
    if (updated) setCurrentOrder(updated as OrderRecord);
    else window.alert('Could not save. Please try again.');
    setAskingGate(false);
  };
  const askGatePickup = async () => {
    if (!currentOrder) return;
    if (!/\d/.test(gateRoom)) {
      window.alert('Type your room, for example A12');
      return;
    }
    setAskingGate(true);
    const updated = await requestGatePickup(currentOrder.id, gateHostel, gateRoom);
    if (updated) setCurrentOrder(updated as OrderRecord);
    else window.alert('Could not send the request. Please try again.');
    setAskingGate(false);
  };

  // Live clock for express orders and the outside "at the gate in under 15 minutes" countdown
  const [nowMs, setNowMs] = useState(Date.now());
  const ex = currentOrder?.express || null;
  const isOutside = currentOrder?.cart === 'store' || currentOrder?.cart === 'food';
  const clockRunning = Boolean(
    (ex && ex.status !== 'cancelled' && !ex.receivedAt) ||
      (isOutside && currentOrder?.status === 'Delivered' && currentOrder?.deliveredAt && Date.now() - Date.parse(currentOrder.deliveredAt) < GATE_ARRIVAL_MINUTES * 60000)
  );
  useEffect(() => {
    if (!clockRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [clockRunning]);
  const timing = currentOrder ? expressTiming(currentOrder, nowMs, EXPRESS_CONFIRM_MINUTES * 60000, EXPRESS_MINUTES * 60000) : null;
  const [exBusy, setExBusy] = useState(false);
  const switchToNormal = async () => {
    if (!currentOrder) return;
    if (!window.confirm('Switch to normal delivery? Your order joins the next batch with the normal delivery fee.')) return;
    setExBusy(true);
    try {
      const updated = await cancelExpress(currentOrder.id);
      if (updated) setCurrentOrder(updated as OrderRecord);
    } catch (e: any) {
      window.alert(e?.message || 'Could not change the order.');
    }
    setExBusy(false);
  };
  const confirmReceived = async () => {
    if (!currentOrder) return;
    setExBusy(true);
    const updated = await markExpressReceived(currentOrder.id);
    if (updated) setCurrentOrder(updated as OrderRecord);
    else window.alert('Could not save. Please try again.');
    setExBusy(false);
  };
  const waitingMs = ex && ex.status === 'requested' ? nowMs - Date.parse(ex.requestedAt) : 0;
  // Outside: after "Order delivered", a 15-minute countdown to the gate
  const gateLeftMs =
    isOutside && currentOrder?.status === 'Delivered' && currentOrder?.deliveredAt
      ? GATE_ARRIVAL_MINUTES * 60000 - (nowMs - Date.parse(currentOrder.deliveredAt))
      : null;

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

              {/* Outside orders come to the gate; the student can ask a runner to bring it to the room */}
              {(currentOrder.cart === 'store' || currentOrder.cart === 'food') &&
                currentOrder.paymentStatus !== 'unpaid' &&
                currentOrder.status === 'Delivered' &&
                (!currentOrder.gatePickup || currentOrder.gatePickup.status === 'refused' || currentOrder.gatePickup.status === 'refunded') && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-2">
                    <p className="text-slate-700 dark:text-slate-200">
                      Want it brought from the <strong>school gate</strong> to your room? An inside runner can collect it for a flat ₦{GATE_PICKUP_FEE.toLocaleString()}. Ask first: a runner checks the parcel and accepts, then you pay the runner.
                    </p>
                    {!gateFormOpen ? (
                      <button
                        type="button"
                        onClick={() => setGateFormOpen(true)}
                        className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold cursor-pointer"
                      >
                        Get this delivered to my room
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={gateHostel}
                            onChange={(e) => setGateHostel(e.target.value)}
                            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          >
                            {HOSTELS.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          <input
                            value={gateRoom}
                            onChange={(e) => setGateRoom(e.target.value.toUpperCase().slice(0, 8))}
                            placeholder="Room, e.g. A12"
                            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={askingGate}
                          onClick={askGatePickup}
                          className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-50 cursor-pointer"
                        >
                          {askingGate ? 'Sending…' : 'Send request to the runners'}
                        </button>
                        <p className="text-[11px] text-slate-500">A runner accepts it first, then you pay them. You don't pay anything yet.</p>
                      </div>
                    )}
                  </div>
                )}

              {/* GATE PICKUP: separate request to an inside runner */}
              {currentOrder.gatePickup && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1">
                  <p className="font-bold text-slate-800 dark:text-slate-100">Gate to room pickup</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {currentOrder.gatePickup.status === 'pending'
                      ? 'Waiting for an inside runner to accept.'
                      : currentOrder.gatePickup.status === 'accepted'
                      ? currentOrder.gatePickup.paid
                        ? `Paid. ${currentOrder.gatePickup.runnerName || 'The runner'} is bringing it to your room.`
                        : `${currentOrder.gatePickup.runnerName || 'A runner'} accepted. Pay ₦${currentOrder.gatePickup.fee.toLocaleString()} to the runner, then tap "I have paid the runner".`
                      : currentOrder.gatePickup.status === 'delivered'
                      ? 'Brought to your room.'
                      : currentOrder.gatePickup.status === 'refunded'
                      ? 'The runner refunded this pickup. Please collect at the gate.'
                      : 'No runner could take this one. Please collect at the school gate.'}
                  </p>
                  {currentOrder.gatePickup.status === 'accepted' && !currentOrder.gatePickup.paid && (
                    <div className="space-y-2 pt-1">
                      {currentOrder.gatePickup.runnerPay ? (
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Bank</span>
                            <span className="font-bold">{currentOrder.gatePickup.runnerPay.bankName}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Account number</span>
                            <span className="flex items-center gap-1 font-bold">
                              {currentOrder.gatePickup.runnerPay.accountNumber}
                              <button
                                type="button"
                                onClick={() => copyToClipboard(currentOrder.gatePickup!.runnerPay!.accountNumber, 'gate')}
                                className="p-1 text-slate-400 hover:text-slate-700"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Account name</span>
                            <span className="font-semibold">{currentOrder.gatePickup.runnerPay.accountName}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">Call the runner for their account number.</p>
                      )}
                      <button
                        type="button"
                        disabled={askingGate}
                        onClick={payRunner}
                        className="w-full py-2 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-50 cursor-pointer"
                      >
                        I have paid the runner
                      </button>
                    </div>
                  )}
                  {currentOrder.gatePickup.runnerPhone && currentOrder.gatePickup.status === 'accepted' && (
                    <a href={`tel:${currentOrder.gatePickup.runnerPhone}`} className="inline-block font-bold text-[#0e9f55]">
                      Call {currentOrder.gatePickup.runnerName}
                    </a>
                  )}
                </div>
              )}

              {/* EXPRESS: waiting for a runner, the 20-minute clock, received, refund */}
              {ex && ex.status !== 'cancelled' && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-extrabold text-emerald-950 dark:text-emerald-100">
                      <Zap className="w-4 h-4 text-[#0e9f55]" /> Express delivery
                    </span>
                    {timing && !timing.finished && (
                      <span className={`font-mono font-bold px-2 py-0.5 rounded-md ${timing.late ? 'bg-rose-600 text-white' : 'bg-[#0e9f55] text-white'}`}>
                        {timing.late ? `Late +${mmss(-timing.leftMs)}` : mmss(timing.leftMs)}
                      </span>
                    )}
                  </div>

                  {ex.status === 'requested' && (
                    <>
                      <p className="text-emerald-900 dark:text-emerald-200">
                        Waiting for an express runner to accept. You don't pay anything until one does.
                      </p>
                      {waitingMs >= EXPRESS_ACCEPT_MINUTES * 60000 ? (
                        <>
                          <p className="text-amber-800 dark:text-amber-300 font-semibold">No express runner has accepted yet.</p>
                          <button
                            type="button"
                            disabled={exBusy}
                            onClick={switchToNormal}
                            className="w-full py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold disabled:opacity-50 cursor-pointer"
                          >
                            Switch to normal delivery
                          </button>
                        </>
                      ) : (
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                          If nobody accepts within {EXPRESS_ACCEPT_MINUTES} minutes, you can switch to normal delivery.
                        </p>
                      )}
                    </>
                  )}

                  {ex.status === 'accepted' && (
                    <>
                      <p className="text-emerald-900 dark:text-emerald-200">
                        <strong>{ex.runnerName || 'A runner'}</strong> accepted your express order.
                        {currentOrder.paymentStatus === 'unpaid' ? ' Pay them below to start the clock.' : ''}
                      </p>
                      <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                        The {EXPRESS_MINUTES} minutes starts from your payment time. If it arrives late, you get ₦{EXPRESS_REFUND.toLocaleString()} back.
                      </p>
                      {timing && !timing.finished && !timing.awaitingReceipt && (
                        <p className="text-emerald-900 dark:text-emerald-200">
                          {timing.late
                            ? `It's past ${EXPRESS_MINUTES} minutes. You'll get ₦${EXPRESS_REFUND.toLocaleString()} back from the runner once it arrives.`
                            : 'Your runner is on it.'}
                        </p>
                      )}
                      {timing?.awaitingReceipt && (
                        <div className="space-y-1.5">
                          <p className="text-emerald-900 dark:text-emerald-200">The runner says it's delivered. Got it? Tap below to stop the clock.</p>
                          <button
                            type="button"
                            disabled={exBusy}
                            onClick={confirmReceived}
                            className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white font-bold disabled:opacity-50 cursor-pointer"
                          >
                            I've received it
                          </button>
                        </div>
                      )}
                      {timing && !timing.finished && !timing.awaitingReceipt && currentOrder.status !== 'Delivered' && (
                        <button
                          type="button"
                          disabled={exBusy}
                          onClick={confirmReceived}
                          className="w-full py-2 rounded-xl border border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-bold disabled:opacity-50 cursor-pointer"
                        >
                          I've received it
                        </button>
                      )}
                      {timing?.finished && (
                        <p className={`font-bold ${timing.late ? 'text-rose-700 dark:text-rose-300' : 'text-[#0e9f55]'}`}>
                          {timing.late
                            ? ex.refunded
                              ? `Arrived after ${Math.round(timing.usedMs / 60000)} minutes. ${ex.runnerName || 'The runner'} refunded your ₦${EXPRESS_REFUND.toLocaleString()}.`
                              : `Arrived after ${Math.round(timing.usedMs / 60000)} minutes, so you get ₦${EXPRESS_REFUND.toLocaleString()} back. ${ex.runnerName || 'The runner'} will send it to you. Message them below if it doesn't arrive.`
                            : `Delivered in ${Math.max(1, Math.round(timing.usedMs / 60000))} minutes. On time!`}
                        </p>
                      )}
                      {ex.runnerPhone && (
                        <a href={`tel:${ex.runnerPhone}`} className="inline-block font-bold text-[#0e9f55]">
                          Call {ex.runnerName}
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* PAYMENT: bank details until the student taps "payment made", then a short note, then nothing once confirmed */}
              {ex && ex.status === 'requested' ? null : currentOrder.paymentMethod === 'pay_now' && paymentState(currentOrder) === 'expired' ? (
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
                    {payAcct ? (
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
                    ) : (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 text-xs">
                        Nobody has taken your batch yet, so there is no account to pay. Your order is saved and scheduled. The account will show here as soon as a {currentOrder.cart === 'inside' || !currentOrder.cart ? 'runner' : 'operator'} takes it. Check back soon.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleStudentClickPaymentMade}
                      disabled={markingPayment || !payAcct}
                      className="w-full py-2.5 disabled:opacity-50 disabled:cursor-not-allowed bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
                ) : currentOrder.status === 'Delivered' && isOutside ? (
                  // Outside: the operator tapped "Order delivered". A green bar counts down to the gate.
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#0e9f55] text-white flex items-center justify-center font-bold shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                          {gateLeftMs !== null && gateLeftMs > 0 ? 'Your order is on its way to the gate' : 'Your order has been delivered'}
                        </h4>
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-400">
                          {currentOrder.gatePickup && currentOrder.gatePickup.status !== 'refused' && currentOrder.gatePickup.status !== 'refunded'
                            ? `It will be at the school gate in under ${GATE_ARRIVAL_MINUTES} minutes, and the runner will bring it to your room.`
                            : gateLeftMs !== null && gateLeftMs > 0
                            ? `It will be at the school gate in under ${GATE_ARRIVAL_MINUTES} minutes. Head to the gate when the timer is nearly done.`
                            : 'It should be at the school gate now. Please collect it.'}
                        </p>
                      </div>
                      {gateLeftMs !== null && gateLeftMs > 0 && (
                        <span className="shrink-0 font-mono text-sm font-extrabold text-[#0e9f55]">{mmss(gateLeftMs)}</span>
                      )}
                    </div>
                    {gateLeftMs !== null && (
                      <div className="h-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0e9f55] transition-all duration-1000"
                          style={{ width: `${Math.min(100, Math.max(4, 100 - (Math.max(0, gateLeftMs) / (GATE_ARRIVAL_MINUTES * 60000)) * 100))}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : currentOrder.status === 'Delivered' ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#0e9f55] text-white flex items-center justify-center font-bold shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">Order Delivered & Handed Over!</h4>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-400">Delivered to {shortLocation(currentOrder)}. Enjoy your order!</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {currentOrder.paymentStatus === 'payment_confirmed'
                        ? isOutside
                          ? `Payment confirmed. ${currentOrder.operatorName || 'The operator'} is packaging your order.`
                          : 'Payment confirmed. Your runner will start packaging soon.'
                        : currentOrder.paymentStatus === 'payment_sent'
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
                    {currentOrder.status === 'Delivered' ? 'Delivered' : STATUS_STEPS[stepIndex].key === 'onway' && currentOrder.area === 'Custom' ? `On the way to ${currentOrder.building}` : STATUS_STEPS[stepIndex].label}
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
                            {step.key === 'onway' && currentOrder.area === 'Custom' ? `On the way to ${currentOrder.building}` : step.label}
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

              {/* OUTSIDE ORDERS: live steps, moving as the operator taps */}
              {isOutside && currentOrder.paymentStatus !== 'unpaid' && (() => {
                const st = orderStageOf(currentOrder, nowMs);
                const steps = [
                  { key: 'received', label: 'Received', desc: 'You told us you paid' },
                  { key: 'packaging', label: 'Confirmed & Packaging', desc: `${currentOrder.operatorName || 'The operator'} confirmed your payment and is packing it` },
                  {
                    key: 'delivered',
                    label: st === 'onway' ? 'On its way to the gate' : 'Delivered',
                    desc: st === 'onway' ? `At the school gate in under ${GATE_ARRIVAL_MINUTES} minutes` : 'At the school gate',
                  },
                ];
                const at = st === 'received' ? 0 : st === 'packaging' ? 1 : 2;
                const done = st === 'delivered';
                return (
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Order progress</h3>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#0e9f55] dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/40">
                        {steps[at].label}
                      </span>
                    </div>
                    {/* Progress bar: fills a third per step */}
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-[#0e9f55] transition-all duration-700" style={{ width: `${done ? 100 : ((at + 1) / 3) * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {steps.map((step, idx) => {
                        const reached = idx < at || done || (idx === at);
                        const current = idx === at && !done;
                        return (
                          <div key={step.key} className="text-center">
                            <div
                              className={`mx-auto w-6 h-6 rounded-full flex items-center justify-center ${
                                reached ? 'bg-[#0e9f55] text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                              } ${current ? 'ring-4 ring-emerald-100 dark:ring-emerald-900 animate-pulse' : ''}`}
                            >
                              {idx < at || done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                            </div>
                            <p className={`mt-1 text-[11px] font-bold leading-tight ${reached ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{step.label}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{step.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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

              {/* Rate your experience: one rating per delivered cart, straight to Roomly */}
              {currentOrder.status === 'Delivered' && <RateExperience order={currentOrder} />}

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
