import React from 'react';
import { Moon, Sun, Shield, Compass, Truck, ShoppingBag } from 'lucide-react';
import { CustomerProfile } from '../types';

export type PortalMode = 'customer' | 'runner' | 'admin';

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
}) => {
  const greetingName = customer?.name ? `Hi ${customer.name}` : 'Hi there';

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-2.5">
      {/* Row 1: Brand, Open Badge, and Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Brand & Personalized Greeting */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#0e9f55] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
            R
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                Roomly
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors ${
                  storeStatus.isOpen
                    ? 'bg-emerald-50 text-[#0e9f55] dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                    : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    storeStatus.isOpen ? 'bg-[#0e9f55]' : 'bg-rose-500'
                  }`}
                />
                {storeStatus.isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
              {greetingName} · <span className="text-slate-400">6am - 11pm</span>
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Track Order Button */}
          <button
            type="button"
            onClick={onOpenTracker}
            className="relative px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            aria-label="Track Order"
          >
            <Compass className="w-3.5 h-3.5 text-[#0e9f55]" />
            <span>Track</span>
            {activeOrderCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#0e9f55] ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {/* Dark Mode Toggle */}
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
