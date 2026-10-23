import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Clock,
  CreditCard,
  Banknote,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Zap,
  Lock,
} from 'lucide-react';
import { CartItem, CustomerProfile, DeliveryBatchId } from '../types';
import { HOSTELS, deliveryFeeFor, CartKind, CART_LABEL, GATE_PICKUP_FEES, OUT_OF_STOCK_LABEL, OutOfStockChoice, slotsForDay, cartOf } from '../config';
import { getNextBatch, getOutsideChoices } from '../api.js';
import { isValidNigerianPhone, normalizePhone } from '../api.js';

interface CartSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which of the three carts is open; items are only that cart's items */
  cart: CartKind;
  cartCounts: Record<CartKind, number>;
  onSwitchCart: (c: CartKind) => void;
  /** Every item in every cart, for the "all carts" overview */
  allItems: CartItem[];
  items: CartItem[];
  customRequest: string;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onRemoveCustomRequest: () => void;
  customer: CustomerProfile | null;
  phone: string;
  onPhoneChange: (phone: string) => void;
  onPlaceOrder: (orderPayload: {
    phone: string;
    name: string;
    area: string;
    building: string;
    room: string;
    isCustomLocation?: boolean;
    items: CartItem[];
    customRequest: string;
    deliveryBatch: DeliveryBatchId;
    deliveryTime: string;
    deliveryDate?: string;
    paymentDeadline?: string;
    paymentMethod: 'pay_now' | 'pay_on_delivery';
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    cart: CartKind;
    operatorId?: string;
    operatorName?: string;
    turnRunner?: string;
    outOfStock: OutOfStockChoice;
    gatePickup?: boolean;
    payTo?: { bankName: string; accountNumber: string; accountName: string } | null;
    lateBatch?: boolean;
  }) => void | Promise<void>;
}

export const CartSheet: React.FC<CartSheetProps> = ({
  isOpen,
  onClose,
  cart,
  cartCounts,
  onSwitchCart,
  allItems,
  items,
  customRequest,
  onUpdateQuantity,
  onRemoveItem,
  onRemoveCustomRequest,
  customer,
  phone,
  onPhoneChange,
  onPlaceOrder,
}) => {
  if (!isOpen) return null;

  // Form states
  const [name, setName] = useState(customer?.name || '');
  // Location: hostel (JV, TA, New Hostel) plus a typed room number
  const area = 'Hostels';
  const savedHostel = (b?: string) => (b && HOSTELS.includes(b) ? b : HOSTELS[0]);
  const [building, setBuilding] = useState(savedHostel(customer?.building));
  const [room, setRoom] = useState(customer?.room || '');
  const [customMode, setCustomMode] = useState(false);
  const [customLocation, setCustomLocation] = useState('');

  // The order always joins the next batch (no batch picker)
  const [, setBatchTick] = useState(0);
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_on_delivery'>('pay_now');
  const [acknowledgedNoCancel, setAcknowledgedNoCancel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [outOfStock, setOutOfStock] = useState<OutOfStockChoice | ''>('');
  // With items in more than one cart, start on the overview of all carts
  const filledCarts = (['inside', 'store', 'food'] as CartKind[]).filter((k) => cartCounts[k] > 0);
  const [overview, setOverview] = useState(filledCarts.length > 1);
  const [gatePickup, setGatePickup] = useState(false);
  const [operatorId, setOperatorId] = useState('');

  // Is repeat customer?
  const isRepeatCustomer = Boolean(customer && (customer.isReturning || (customer.ordersCount && customer.ordersCount > 0)));

  // Auto-fill when customer profile is available
  useEffect(() => {
    if (customer) {
      if (customer.name) setName(customer.name);
      // Older saved locations (Hostel A, Lodge 1...) fall back to the first hostel
      if (customer.building) setBuilding(savedHostel(customer.building));
      if (customer.room && HOSTELS.includes(customer.building)) setRoom(customer.room);
    }
  }, [customer]);

  // Repeat customer payment rule enforcement:
  // "phone number will be used to detect a reap customer who won't be able to order without making payment and clicking they have made the payment."
  useEffect(() => {
    if (isRepeatCustomer || cart !== 'inside') {
      setPaymentChoice('pay_now');
    }
  }, [isRepeatCustomer, cart]);

  // Financial calculations
  const itemTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const hasOutside = cart !== 'inside';
  const mustPrepay = isRepeatCustomer || hasOutside;
  const deliveryFee = deliveryFeeFor(itemTotal, hasOutside);
  const grandTotal = itemTotal + deliveryFee;

  // Batches that are still open, refreshed when a runner switches one on or off
  useEffect(() => {
    const h = () => setBatchTick((n) => n + 1);
    window.addEventListener('roomly-batches', h);
    const id = window.setInterval(h, 60000);
    return () => {
      window.removeEventListener('roomly-batches', h);
      window.clearInterval(id);
    };
  }, []);
  // Next batch only. Inside: the runner whose turn it is. Outside: the operators taking that batch;
  // the student picks one (the one with fewer orders today is suggested).
  const insideNext = cart === 'inside' ? getNextBatch('inside') : null;
  const outside = cart !== 'inside' ? getOutsideChoices(cart) : null;
  const operators = outside?.operators || [];
  const chosenOp = operators.find((o) => o.uid === operatorId) || operators[0];
  const chosen = cart === 'inside'
    ? insideNext?.next || null
    : outside?.batch && chosenOp
    ? { batch: outside.batch, start: chosenOp.start, startText: chosenOp.startText, by: chosenOp.name, unconfirmed: Boolean(outside.unconfirmed) }
    : null;
  // The batch has not been opened by a runner / operator yet: ordering still works, the student just accepts it
  const unconfirmed = Boolean((chosen as any)?.unconfirmed);
  const selectedBatch = chosen?.batch;
  const payBy = chosen ? chosen.start : null;
  const payByText = payBy ? payBy.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const pauseNote = cart === 'inside' ? insideNext?.note : outside?.note;
  const pausedText = chosen
    ? ''
    : `${cart === 'food' ? 'Food orders are' : cart === 'store' ? 'Store orders are' : 'Ordering is'} paused right now.${
        pauseNote ? ' ' + pauseNote : ' Please check back soon.'
      }`;
  const otherCarts = (['inside', 'store', 'food'] as CartKind[]).filter((k) => k !== cart && cartCounts[k] > 0);
  const atGate = cart !== 'inside' && !gatePickup;

  // Requested products still waiting for a price: the cart cannot be checked out yet
  const waitingCount = items.filter((i) => i.pendingQuote).length;

  // Late order: a batch earlier today has already gone, or the next batch is another day.
  // The student must accept that the order joins the next batch.
  const nowDate = new Date();
  const dayStart = new Date(nowDate);
  dayStart.setHours(0, 0, 0, 0);
  const isLate = Boolean(
    selectedBatch &&
      !unconfirmed &&
      (selectedBatch.dayLabel !== 'Today' ||
        slotsForDay(cart, nowDate, 0).some(
          (o) => o.key !== selectedBatch.key && dayStart.getTime() + o.startMin * 60000 <= nowDate.getTime()
        ))
  );
  const [lateAccepted, setLateAccepted] = useState(false);
  useEffect(() => setLateAccepted(false), [selectedBatch?.key]);

  // Tell the student when the batch they saw stops accepting and the order moves to the next one
  const lastBatch = useRef<{ key: string; window: string } | null>(null);
  const [batchNotice, setBatchNotice] = useState('');
  useEffect(() => {
    const prev = lastBatch.current;
    if (prev && selectedBatch && prev.key !== selectedBatch.key) {
      setBatchNotice(`The ${prev.window} batch has stopped taking orders. Your order will join the next batch: ${selectedBatch.dayLabel}, ${selectedBatch.window}.`);
    }
    if (selectedBatch) lastBatch.current = { key: selectedBatch.key, window: selectedBatch.window };
  }, [selectedBatch?.key]);

  const hasCustomRequest = Boolean(customRequest && customRequest.trim().length > 0);
  const isPhoneValid = isValidNigerianPhone(phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isPhoneValid) {
      setErrorMessage('Please enter a valid 11-digit Nigerian phone number (e.g. 08012345678)');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Please enter your student name');
      return;
    }

    if (!selectedBatch || !payBy) {
      setErrorMessage(pausedText || 'No delivery batch is open right now. Please check back soon.');
      return;
    }

    if (customMode && !customLocation.trim()) {
      setErrorMessage('Please tell us where to deliver (for example: Faculty of Science gate)');
      return;
    }

    if ((cart === 'inside' || gatePickup) && !customMode && !/\d/.test(room)) {
      setErrorMessage('Please type your room, for example A12');
      return;
    }

    if (items.length === 0 && !hasCustomRequest) {
      setErrorMessage('Your cart is empty. Please add items or a custom request.');
      return;
    }

    if (waitingCount > 0) {
      setErrorMessage(`Waiting for the price of ${waitingCount} requested item(s). You can check out once it comes back.`);
      return;
    }

    if ((isLate || unconfirmed) && !lateAccepted) {
      setErrorMessage('Please tick that you accept your order coming in the next batch.');
      return;
    }

    if (!outOfStock) {
      setErrorMessage('Please choose what we should do if an item is out of stock.');
      return;
    }

    if (!acknowledgedNoCancel) {
      setErrorMessage('Please confirm that you have rechecked your order details (No cancellation policy).');
      return;
    }


    setSubmitting(true);
    try {
      await onPlaceOrder({
        phone: normalizePhone(phone),
        name: name.trim(),
        // Outside orders stop at the school gate unless a runner is bringing them to the room
        area: atGate ? 'Custom' : customMode ? 'Custom' : area,
        building: atGate ? 'School gate' : customMode ? customLocation.trim() : building,
        room: atGate || customMode ? '-' : room.replace(/\s+/g, '').toUpperCase(),
        isCustomLocation: atGate || customMode,
        items,
        customRequest: customRequest.trim(),
        deliveryBatch: (selectedBatch?.id || 'afternoon') as DeliveryBatchId,
        deliveryTime: selectedBatch?.label || '',
        deliveryDate: selectedBatch?.date,
        paymentDeadline: payBy?.toISOString(),
        paymentMethod: 'pay_now',
        subtotal: itemTotal,
        deliveryFee,
        totalAmount: grandTotal,
        cart,
        operatorId: cart !== 'inside' ? chosenOp?.uid : undefined,
        operatorName: cart !== 'inside' ? chosenOp?.name : undefined,
        turnRunner: cart === 'inside' ? insideNext?.next?.by || '' : undefined,
        outOfStock,
        lateBatch: isLate || unconfirmed, // for the dashboard: student accepted the next batch
        gatePickup: cart !== 'inside' && gatePickup,
        // Students pay the runner or operator handling the order (Roomly's account if they have not set one)
        payTo: (cart === 'inside' ? insideNext?.next?.payTo : chosenOp?.payTo) || null,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to place order');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden border-t border-slate-200/80 dark:border-slate-800">
        {/* Drag Bar */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {overview ? 'Your carts' : CART_LABEL[cart]}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} {items.length === 1 ? 'item' : 'items'}
              {hasCustomRequest ? ' · 1 custom request' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* With several carts: back to the overview of all carts */}
        {filledCarts.length > 1 && !overview && (
          <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <button type="button" onClick={() => setOverview(true)} className="text-xs font-bold text-[#0e9f55] cursor-pointer">
              ← All carts ({filledCarts.length})
            </button>
          </div>
        )}

        {/* All carts at once: each with its items, prices and its own checkout */}
        {overview && (
          <div className="overflow-y-auto p-5 space-y-4 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your items are in {filledCarts.length} carts. Each one is delivered and paid for separately. Check out one at a time.
            </p>
            {filledCarts.map((k) => {
              const list = allItems.filter((i) => cartOf(i) === k);
              const subtotal = list.reduce((t, i) => t + (i.totalPrice || 0), 0);
              const waiting = list.some((i) => i.pendingQuote);
              return (
                <div key={k} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{CART_LABEL[k]}</h3>
                    <span className="text-[11px] text-slate-500">{k === 'inside' ? 'To your room' : 'To the school gate'}</span>
                  </div>
                  {list.map((i) => (
                    <div key={i.id} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {i.quantity}x {i.name}
                      </span>
                      <span className="shrink-0 font-mono font-semibold">
                        {i.pendingQuote ? <span className="text-amber-600">Waiting for price</span> : `₦${i.totalPrice.toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                  {k === 'inside' && customRequest && (
                    <p className="text-[11px] italic text-amber-700 dark:text-amber-300">Request: "{customRequest}"</p>
                  )}
                  <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-slate-100 dark:border-slate-800">
                    <span>Items subtotal</span>
                    <span className="font-mono">₦{subtotal.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Delivery fee is added at checkout.</p>
                  <button
                    type="button"
                    disabled={waiting}
                    onClick={() => {
                      onSwitchCart(k);
                      setOverview(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {waiting ? 'Waiting for a price before checkout' : 'Check out this cart'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Scrollable Checkout Content */}
        {!overview && (
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5 flex-1">

          {/* Cart Items Summary */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Order Items ({items.length})
              </h3>
              <span className="text-[11px] text-slate-400">Adjust or remove anytime</span>
            </div>

            {items.length === 0 && !hasCustomRequest ? (
              <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs">
                Your cart is empty. Add food, drinks or essentials from the store.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shrink-0 flex items-center justify-center">
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
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {item.name}
                        </h4>
                        {item.extras && item.extras.length > 0 && (() => {
                          const extrasCost = item.extras.reduce((s, e) => s + e.price * (e.quantity || 1), 0);
                          const dishCost = item.unitPrice - extrasCost;
                          return (
                            <div className="mt-0.5 space-y-0.5 text-[10px]">
                              {item.plates !== undefined && item.plates > 0 && (
                                <div className="flex justify-between gap-2 text-slate-500 dark:text-slate-400">
                                  <span>
                                    {item.plates} {item.plates === 1 ? 'plate' : 'plates'}
                                  </span>
                                  <span className="font-mono">₦{dishCost.toLocaleString()}</span>
                                </div>
                              )}
                              {item.extras.map((e) => (
                                <div key={e.id} className="flex justify-between gap-2 text-amber-700 dark:text-amber-400">
                                  <span className="break-words">
                                    + {e.quantity || 1}x {e.name}
                                  </span>
                                  <span className="font-mono shrink-0">₦{(e.price * (e.quantity || 1)).toLocaleString()}</span>
                                </div>
                              ))}
                              {item.quantity > 1 && (
                                <span className="block text-slate-400">× {item.quantity} of this dish</span>
                              )}
                            </div>
                          );
                        })()}
                        {(!item.extras || item.extras.length === 0) && item.plates !== undefined && item.plates > 0 && (
                          <span className="text-[10px] text-slate-400 block">
                            {item.plates} {item.plates === 1 ? 'plate' : 'plates'}
                          </span>
                        )}
                        {item.pendingQuote ? (
                          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Waiting for price</p>
                        ) : (
                          <p className="text-xs font-mono font-semibold text-[#0e9f55]">
                            ₦{item.totalPrice.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          aria-label="Decrease"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold font-mono">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, 1)}
                          className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          aria-label="Increase"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Custom Request Line */}
                {hasCustomRequest && (
                  <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/60 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Custom Campus Request</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 italic">
                        "{customRequest}"
                      </p>
                      <span className="inline-block mt-1 text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                        Quote will be sent before purchase (Pre-paid)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={onRemoveCustomRequest}
                      className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                      aria-label="Remove custom request"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delivery Details */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#0e9f55]" />
              <span>{cart === 'inside' ? 'Delivered to your room' : 'Your details'}</span>
            </h3>
            {cart !== 'inside' && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
                <strong>Delivered to the school gate.</strong> Collect it there, or ask an inside runner to bring it to your room
                (you can also ask later from your order screen).
              </div>
            )}
            {cart !== 'inside' && (
              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={gatePickup}
                  onChange={(e) => setGatePickup(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#0e9f55]"
                />
                <span>
                  <strong className="block text-slate-900 dark:text-white">Bring it from the gate to my room</strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    ₦{GATE_PICKUP_FEES.normal.toLocaleString()}, or ₦{GATE_PICKUP_FEES.heavy.toLocaleString()} if heavy. A runner accepts it,
                    then you pay the runner. Add your hostel and room below.
                  </span>
                </span>
              </label>
            )}

            <div className="grid grid-cols-1 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                  placeholder="08012345678"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chidi Okon"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
                />
              </div>

              {(cart === 'inside' || gatePickup) && !customMode && (
              <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hostel
                  </label>
                  <select
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55] cursor-pointer"
                  >
                    {HOSTELS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Room number
                  </label>
                  <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value.toUpperCase().slice(0, 8))}
                    placeholder="e.g. A12"
                    autoCapitalize="characters"
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                Enter the room where you will be when the delivery arrives.
              </p>
              </>
              )}

              {cart === 'inside' && customMode && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Where should we deliver?
                  </label>
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="e.g. Library entrance, Science Faculty gate"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
                  />
                </div>
              )}

              {cart === 'inside' && (
              <button
                type="button"
                onClick={() => setCustomMode(!customMode)}
                className="text-left text-[11px] font-bold text-[#0e9f55] hover:underline cursor-pointer"
              >
                {customMode ? 'Deliver to my room instead' : 'Not in your room? Deliver somewhere else'}
              </button>
              )}
            </div>
          </div>

          {/* DELIVERY BATCHES & PREMIUM DELIVERY (User prompt requirement) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#0e9f55]" />
                <span>Your delivery batch</span>
              </h3>
            </div>

            {unconfirmed && selectedBatch && (
              <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateAccepted}
                  onChange={(e) => setLateAccepted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#0e9f55]"
                />
                <span>
                  <strong>This batch is not open yet.</strong> You can still order now. Your order will come in the next batch:{' '}
                  {selectedBatch.dayLabel === 'Today' ? 'today' : selectedBatch.dayLabel.toLowerCase()}, {selectedBatch.window}, once the{' '}
                  {cart === 'inside' ? 'runner' : 'operator'} starts it (or the batch after). Tick to accept.
                </span>
              </label>
            )}
            {isLate && selectedBatch && (
              <label className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateAccepted}
                  onChange={(e) => setLateAccepted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#0e9f55]"
                />
                <span>
                  <strong>The earlier batch is closed.</strong> Your order will come in the next batch:{' '}
                  {selectedBatch.dayLabel === 'Today' ? 'today' : selectedBatch.dayLabel.toLowerCase()}, {selectedBatch.window}. Tick to accept.
                </span>
              </label>
            )}
            {batchNotice && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-200">
                {batchNotice}
              </div>
            )}
            {selectedBatch && chosen ? (
              <div className="p-3 rounded-2xl border border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {selectedBatch.dayLabel}, {selectedBatch.window}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {unconfirmed
                        ? `Not opened yet. Usually starts around ${chosen.startText}.`
                        : `Still accepting orders, will start sending by ${chosen.startText}.`}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    ₦{deliveryFee.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  Pay before {payByText} to join the {selectedBatch.window} batch.
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Every order joins the next batch.{cart !== 'inside' ? ' Delivery is to the school gate.' : ''}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
                {pausedText || 'No delivery batch is open right now. Please check back soon.'}
              </div>
            )}
          </div>

          {/* WHO HANDLES THIS ORDER */}
          {chosen && cart === 'inside' && chosen.by && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
              Your order goes to <strong>{chosen.by}</strong>, the runner on this batch.
            </div>
          )}
          {chosen && cart !== 'inside' && operators.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {cart === 'food' ? 'Food partner' : 'Store'}
              </h3>
              {operators.length === 1 ? (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  Your order goes to <strong>{operators[0].name}</strong>.
                </div>
              ) : (
                operators.map((op, idx) => {
                  const on = (chosenOp?.uid || '') === op.uid;
                  return (
                    <button
                      key={op.uid}
                      type="button"
                      onClick={() => setOperatorId(op.uid)}
                      className={`w-full p-3 rounded-2xl border text-left text-xs cursor-pointer ${
                        on ? 'border-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span className="font-bold text-slate-900 dark:text-white">{op.name}</span>
                      {idx === 0 && <span className="ml-1.5 text-[10px] font-bold text-[#0e9f55]">Fewer orders now</span>}
                      <span className="block text-[11px] text-slate-500">Will start sending by {op.startText}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* OUT OF STOCK */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              If an item is out of stock
            </h3>
            {((cart === 'inside' ? ['refund', 'swap'] : ['refund', 'tomorrow', 'swap']) as OutOfStockChoice[]).map((k) => (
              <label key={k} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="oos"
                  checked={outOfStock === k}
                  onChange={() => setOutOfStock(k)}
                  className="w-4 h-4 accent-[#0e9f55]"
                />
                <span>{OUT_OF_STOCK_LABEL[k]}</span>
              </label>
            ))}
          </div>

          {/* PAYMENT: everyone pays first */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-[#0e9f55]" />
              <span>Payment</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Pay first by bank transfer. After you place the order you'll see the {cart === 'inside' ? "runner's" : "operator's"} account. Transfer
              {payByText ? ` before ${payByText}` : ''}, then tap <strong>"I have made payment"</strong>.
            </p>
          </div>

          {/* Price Breakdown */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Items Subtotal</span>
              <span className="font-mono tabular-nums">₦{itemTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>
                Delivery
              </span>
              <span className="font-mono tabular-nums">₦{deliveryFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total to Pay</span>
              <span className="font-mono text-[#0e9f55] text-base tabular-nums">
                ₦{grandTotal.toLocaleString()}
              </span>
            </div>
          </div>

          {/* MANDATORY WARNING BEFORE FINAL CHECKOUT */}
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-2.5">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong className="block font-bold">Please Recheck Your Order Carefully</strong>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">
                  Because campus runners are dispatched immediately to prepare and deliver your items to your room, <strong>orders cannot be cancelled</strong> once placed.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 text-xs text-amber-950 dark:text-amber-200 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledgedNoCancel}
                onChange={(e) => setAcknowledgedNoCancel(e.target.checked)}
                className="w-4 h-4 rounded text-[#0e9f55] accent-[#0e9f55] cursor-pointer"
              />
              <span>I confirm my room number & items (No cancellations after dispatch)</span>
            </label>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting || !acknowledgedNoCancel || !selectedBatch || waitingCount > 0 || ((isLate || unconfirmed) && !lateAccepted)}
              className="w-full h-12 bg-[#0e9f55] hover:bg-[#0b8044] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-between px-5 shadow-lg shadow-[#0e9f55]/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>{submitting ? 'Placing Order...' : 'Confirm & Place Order'}</span>
              <span className="font-mono text-base">₦{grandTotal.toLocaleString()}</span>
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              {waitingCount > 0
                ? `Waiting for the price of ${waitingCount} requested item(s). You can check out once it comes back.`
                : cart === 'inside'
                ? 'Goes to the runner on this batch'
                : `Goes to ${chosenOp?.name || 'the operator'}, delivered to the school gate`}
            </p>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
