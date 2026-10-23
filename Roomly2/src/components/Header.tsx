import React from 'react';
import { SoundToggle } from './SoundToggle';
import { Moon, Sun } from 'lucide-react';
import { CustomerProfile } from '../types';

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
            <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">Roomly</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
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
