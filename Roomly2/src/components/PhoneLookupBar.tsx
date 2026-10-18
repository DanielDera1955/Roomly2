import React, { useState, useEffect } from 'react';
import { Phone, CheckCircle2, Sparkles, RotateCcw, UserCheck, ShoppingBag, ArrowRight } from 'lucide-react';
import { CustomerProfile, CartItem } from '../types';
import { isValidNigerianPhone } from '../api.js';

interface PhoneLookupBarProps {
  phone: string;
  onPhoneChange: (phone: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  customer: CustomerProfile | null;
  onQuickReorder: (items: CartItem[]) => void;
}

export const PhoneLookupBar: React.FC<PhoneLookupBarProps> = ({
  phone,
  onPhoneChange,
  pin,
  onPinChange,
  customer,
  onQuickReorder,
}) => {
  const [inputValue, setInputValue] = useState(phone || '');
  const isValid = isValidNigerianPhone(inputValue);

  useEffect(() => {
    setInputValue(phone || '');
  }, [phone]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d]/g, '').slice(0, 11);
    setInputValue(val);
    onPhoneChange(val);
  };

  const fillDemo = () => {
    const demoPhone = '08012345678';
    setInputValue(demoPhone);
    onPhoneChange(demoPhone);
  };

  return (
    <div className="space-y-2">
      {/* Phone Input Box */}
      <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="phone-input"
            className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5 text-[#0e9f55]" />
            <span>Enter your phone number</span>
          </label>
        </div>

        <div className="relative flex items-center">
          <input
            id="phone-input"
            type="tel"
            inputMode="numeric"
            value={inputValue}
            onChange={handleChange}
            placeholder="e.g. 08012345678"
            maxLength={11}
            className="w-full pl-3 pr-10 py-2 text-sm font-mono tracking-wider bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55] transition-all"
          />
          {isValid && (
            <div className="absolute right-3 text-[#0e9f55]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>

        {isValid && (
          <div className="mt-2">
            <label htmlFor="pin-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              6-digit PIN (keeps your saved details private)
            </label>
            <input
              id="pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => onPinChange(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              className="mt-1 w-full px-3 py-2 text-sm font-mono tracking-[0.4em] bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
            />
          </div>
        )}

        {/* Customer recognition banner */}
        {isValid && (
          <div className="mt-2 text-xs">
            {customer && customer.wrongPin ? (
              <div className="text-amber-600 dark:text-amber-400 font-medium">
                {pin.length < 6
                  ? 'Welcome back! Enter your 6-digit PIN to load your saved details.'
                  : 'That PIN does not match. You can still order, but Pay Now is required.'}
              </div>
            ) : customer && customer.isReturning ? (
              <div className="flex items-center gap-1.5 text-[#0e9f55] font-medium">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Welcome back, <strong className="font-semibold">{customer.name}</strong>! Room delivery to{' '}
                  <span className="underline">{customer.building}, Room {customer.room}</span>
                </span>
              </div>
            ) : (
              <div className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">Welcome!</span>{' '}
                Choose a 6-digit PIN above and your details will be remembered for 1-tap reordering.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recognized returning customer's previous order listing */}
      {customer && customer.lastOrder && customer.lastOrder.items?.length > 0 && (
        <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 dark:via-emerald-950/20 rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 shadow-xs space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                <RotateCcw className="w-3.5 h-3.5 text-[#0e9f55]" />
                <span>Previous Order Found</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  ({customer.lastOrder.id})
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">
                {customer.lastOrder.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
              </p>
              <p className="text-xs font-semibold text-[#0e9f55] mt-0.5">
                ₦{customer.lastOrder.subtotal?.toLocaleString()} subtotal
              </p>
            </div>

            <button
              type="button"
              onClick={() => onQuickReorder(customer.lastOrder!.items)}
              className="shrink-0 px-3 py-2 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Load & Edit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            Loads items into your cart so you can add, remove, or customize as you like.
          </p>
        </div>
      )}
    </div>
  );
};
