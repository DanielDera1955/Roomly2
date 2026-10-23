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
import { HOSTELS, deliveryFeeFor, CartKind, CART_LABEL, GATE_PICKUP_FEES, OUT_OF_STOCK_LABEL, OutOfStockChoice, slotsForDay } from '../config';
import { getNextBatch, getOutsideChoices } from '../api.js';
import { isValidNigerianPhone, normalizePhone } from '../api.js';

interface CartSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which of the three carts is open; items are only that cart's items */
  cart: CartKind;
  cartCounts: Record<CartKind, number>;
  onSwitchCart: (c: CartKind) => void;
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
  }) => void | Promise<void>;
}

export const CartSheet: React.FC<CartSheetProps> = ({
  isOpen,
  onClose,
  cart,
  cartCounts,
  onSwitchCart,
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
    ? { batch: outside.batch, start: chosenOp.start, startText: chosenOp.startText, by: chosenOp.name }
    : null;
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

  // Requested products still waiting for a price: the cart cannot be checked out yet
  const waitingCount = items.filter((i) => i.pendingQuote).length;

  // Late order: a batch earlier today has already gone, or the next batch is another day.
  // The student must accept that the order joins the next batch.
  const nowDate = new Date();
  const dayStart = new Date(nowDate);
  dayStart.setHours(0, 0, 0, 0);
  const isLate = Boolean(
    selectedBatch &&
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

    if (!customMode && !/\d/.test(room)) {
      setErrorMessage('Please type your room, for example A12');
      return;
    }

    if (items.length === 0 && !hasCustomRequest) {
      setErrorMessage('Your cart is empty. Please add items or a custom request.');
      return;
    }

    // Repeat customer validation
    if ((isRepeatCustomer || hasOutside) && paymentChoice === 'pay_on_delivery') {
      setErrorMessage('Repeat customers must select Pay Now (Bank Transfer) before orders can be packaged.');
      setPaymentChoice('pay_now');
      return;
    }

    if (waitingCount > 0) {
      setErrorMessage(`Waiting for the price of ${waitingCount} requested item(s). You can check out once it comes back.`);
      return;
    }

    if (isLate && !lateAccepted) {
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
        area: customMode ? 'Custom' : area,
        building: customMode ? customLocation.trim() : building,
        room: customMode ? '-' : room.replace(/\s+/g, '').toUpperCase(),
        isCustomLocation: customMode,
        items,
        customRequest: customRequest.trim(),
        deliveryBatch: (selectedBatch?.id || 'afternoon') as DeliveryBatchId,
        deliveryTime: selectedBatch?.label || '',
        deliveryDate: selectedBatch?.date,
        paymentDeadline: payBy?.toISOString(),
        paymentMethod: paymentChoice,
        subtotal: itemTotal,
        deliveryFee,
        totalAmount: grandTotal,
        cart,
        operatorId: cart !== 'inside' ? chosenOp?.uid : undefined,
        operatorName: cart !== 'inside' ? chosenOp?.name : undefined,
        turnRunner: cart === 'inside' ? insideNext?.next?.by || '' : undefined,
        outOfStock,
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
              {CART_LABEL[cart]}
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

        {/* Other carts: each is checked out on its own */}
        {otherCarts.length > 0 && (
          <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <span className="text-[11px] text-slate-500 shrink-0">Other carts:</span>
            {otherCarts.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onSwitchCart(k)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
              >
                {CART_LABEL[k]} ({cartCounts[k]})
              </button>
            ))}
          </div>
        )}

        {/* Scrollable Checkout Content */}
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
                <strong>Delivered to the school gate, not to your room.</strong> Your room details are used to label the
                bag and reach you. Want it brought to your room? Tick gate pickup below, or ask from your order screen once
                it arrives.
              </div>
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

              {!customMode && (
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

              {customMode && (
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

              <button
                type="button"
                onClick={() => setCustomMode(!customMode)}
                className="text-left text-[11px] font-bold text-[#0e9f55] hover:underline cursor-pointer"
              >
                {customMode ? 'Deliver to my room instead' : 'Not in your room? Deliver somewhere else'}
              </button>
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
                      Still accepting orders, will start sending by {chosen.startText}.
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

          {/* GATE PICKUP (outside carts only) */}
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
                  An inside runner collects it at the gate. ₦{GATE_PICKUP_FEES.normal.toLocaleString()}, or ₦
                  {GATE_PICKUP_FEES.heavy.toLocaleString()} if the runner marks it heavy. Paid to the runner separately; they can
                  accept or decline.
                </span>
              </span>
            </label>
          )}

          {/* PAYMENT CHOICE WITH REPEAT CUSTOMER ENFORCEMENT */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-[#0e9f55]" />
              <span>Payment Method</span>
            </h3>

            {/* Option 1: Pay Now by Bank Transfer (Mandatory for repeat customers) */}
            <button
              type="button"
              onClick={() => setPaymentChoice('pay_now')}
              className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                paymentChoice === 'pay_now'
                  ? 'border-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      paymentChoice === 'pay_now'
                        ? 'border-[#0e9f55] bg-[#0e9f55]'
                        : 'border-slate-300'
                    }`}
                  >
                    {paymentChoice === 'pay_now' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Pay Now (Instant Bank Transfer)
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#0e9f55]/10 text-[#0e9f55]">
                  {payByText ? `Pay before ${payByText}` : 'Pay first'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-6">
                Transfer to Kuda Bank and click "Payment Made" so runners confirm and start packaging immediately.
              </p>
            </button>

            {/* Option 2: Pay on Delivery (ONLY ALLOWED FOR FIRST-TIME CUSTOMERS!) */}
            <div
              onClick={() => {
                if (!mustPrepay) setPaymentChoice('pay_on_delivery');
              }}
              className={`p-3.5 rounded-2xl border transition-all ${
                mustPrepay
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-60 cursor-not-allowed'
                  : paymentChoice === 'pay_on_delivery'
                  ? 'border-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/40 shadow-xs cursor-pointer'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      paymentChoice === 'pay_on_delivery'
                        ? 'border-[#0e9f55] bg-[#0e9f55]'
                        : 'border-slate-300'
                    }`}
                  >
                    {paymentChoice === 'pay_on_delivery' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-500" />
                    <span>Pay on Delivery</span>
                  </span>
                </div>
                {mustPrepay ? (
                  <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>{hasOutside ? 'Not for outside items' : 'First-timers only'}</span>
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                    Cash or Transfer
                  </span>
                )}
              </div>

              {mustPrepay ? (
                <div className="mt-2 pl-6 text-[11px] text-rose-600 dark:text-rose-400 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {hasOutside
                      ? 'Outside-school items are paid for first, then packed and sent.'
                      : "Repeat customer detected: You won't be able to order without making payment and clicking payment has been made."}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-6">
                  Available for your first order! Pay the runner when package arrives at your hostel room.
                </p>
              )}
            </div>
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
              disabled={submitting || !acknowledgedNoCancel || !selectedBatch || waitingCount > 0 || (isLate && !lateAccepted)}
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
      </div>
    </div>
  );
};
