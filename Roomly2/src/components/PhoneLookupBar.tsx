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
  onOpenHistory: () => void;
  onSignOut: () => void;
}

export const PhoneLookupBar: React.FC<PhoneLookupBarProps> = ({
  phone,
  onPhoneChange,
  pin,
  onPinChange,
  customer,
  onOpenHistory,
  onSignOut,
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
              6-digit PIN (new here? choose one)
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

        {isValid && customer && customer.wrongPin && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
            {pin.length < 6
              ? 'Enter your 6-digit PIN to continue.'
              : 'That PIN does not match this phone number. Enter the correct PIN, or ask Roomly to reset it.'}
          </div>
        )}

        {isValid && customer && !customer.wrongPin && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenHistory}
              className="px-3 py-1.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer"
            >
              My orders
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
