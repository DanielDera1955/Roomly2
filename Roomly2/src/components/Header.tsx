import React, { useState } from 'react';
import { SoundToggle } from './SoundToggle';
import { Moon, Sun, ShoppingBag, UserRound, LogOut } from 'lucide-react';
import { CustomerProfile } from '../types';
import { SCHOOL_NAME } from '../config';

export type PortalMode = 'customer' | 'runner' | 'admin' | 'operator';

interface HeaderProps {
  currentPortal: PortalMode;
  onSelectPortal: (portal: PortalMode) => void;
  customer: CustomerProfile | null;
  storeStatus: {
    isOpen: boolean;
    isOverride: boolean;
    openHour: number;
    closeHour: number;
  };
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenTracker: () => void;
  onToggleStoreHoursOverride?: () => void;
  activeOrderCount?: number;
  /** Signed-in student: shows the Orders and Account buttons instead of the sign-in box */
  signedIn?: boolean;
  onSignOut?: () => void;
  /** Guests: opens the sign-in popup (returning students on a new phone) */
  onSignIn?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPortal,
  onSelectPortal,
  customer,
  storeStatus,
  darkMode,
  onToggleDarkMode,
  onOpenTracker,
  onToggleStoreHoursOverride,
  activeOrderCount = 0,
  signedIn = false,
  onSignOut,
  onSignIn,
}) => {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-2.5">
      {/* Row 1: Brand, Open Badge, and Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Brand & Personalized Greeting */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#0e9f55] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
            R
          </div>
          {/* "Roomly" with the school under it in small green caps, after a short green line */}
          <div className="min-w-0 leading-none">
            <span className="block font-extrabold text-base tracking-tight text-slate-900 dark:text-white">Roomly</span>
            <span className="mt-1 flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#0e9f55] dark:text-[#34d27b] truncate">
              <span className="w-3 h-0.5 rounded-full bg-current shrink-0" />
              {SCHOOL_NAME}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="relative flex items-center gap-1.5 shrink-0">
          {signedIn && (
            <>
              <button
                type="button"
                onClick={onOpenTracker}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Active orders and history"
                title="Active orders and history"
              >
                <ShoppingBag className="w-4 h-4" />
                {activeOrderCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0e9f55] text-white text-[10px] font-bold flex items-center justify-center">
                    {activeOrderCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Account"
                title="Account"
              >
                <UserRound className="w-4 h-4" />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-10 z-40 w-56 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-2">
                  <p className="text-slate-500">
                    Signed in as <strong className="text-slate-900 dark:text-white">{customer?.name || 'you'}</strong>
                    <span className="block font-mono text-[11px]">{customer?.phone}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onSignOut?.();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign out
                  </button>
                </div>
              )}
            </>
          )}
          {!signedIn && currentPortal === 'customer' && onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="px-2.5 h-8 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Sign in
            </button>
          )}
          {/* Dark Mode Toggle */}
          <SoundToggle className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
