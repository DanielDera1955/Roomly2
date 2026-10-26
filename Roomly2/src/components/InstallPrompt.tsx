import React, { useEffect, useState } from 'react';
import { Bell, Download } from 'lucide-react';
import {
  canInstall,
  promptInstall,
  isInstalled,
  isIPhone,
  onInstallChange,
  notificationsSupported,
  notificationsOn,
  notificationsBlocked,
  askNotifications,
} from '../notify';

/**
 * After a product request: install Roomly to get notified when the price is ready,
 * or check back before the next batch.
 */
export const InstallPrompt: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = onInstallChange(() => setTick((n) => n + 1));
    return () => {
      off();
    };
  }, []);

  const installed = isInstalled();
  const on = notificationsOn();
  if (installed && on) return null;

  const turnOn = async () => {
    const ok = await askNotifications();
    if (!ok && notificationsBlocked()) {
      window.alert('Notifications are blocked for Roomly. Allow them in your browser or phone settings, then try again.');
    }
    setTick((n) => n + 1);
  };

  const install = async () => {
    await promptInstall();
    setTick((n) => n + 1);
  };

  return (
    <div className={`p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-100 space-y-2 ${className}`}>
      <p className="flex items-start gap-2">
        <Bell className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
        <span>
          <strong>Install Roomly to get notified when your price is ready</strong>, or check back before the next batch. Your cart saves
          the price automatically.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {!installed && canInstall() && (
          <button type="button" onClick={install} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 text-white font-bold cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Install Roomly
          </button>
        )}
        {notificationsSupported() && !on && (
          <button
            type="button"
            onClick={turnOn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 font-bold cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5" /> Turn on notifications
          </button>
        )}
      </div>
      {!installed && !canInstall() && isIPhone() && (
        <p className="text-[11px] text-sky-800 dark:text-sky-300">On iPhone: tap Share, then "Add to Home Screen".</p>
      )}
    </div>
  );
};
