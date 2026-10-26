import React, { useEffect, useState } from 'react';
import { Bell, Download, X, Share, PlusSquare, Smartphone } from 'lucide-react';
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

/* ---------- Install bar: homepage, and on the order screen after ordering ---------- */
const HIDE_DAYS = 3;
const hideKey = (variant: string) => `roomly_install_hide_${variant}`;
const hiddenNow = (variant: string) => {
  try {
    return Number(localStorage.getItem(hideKey(variant)) || 0) > Date.now();
  } catch {
    return false;
  }
};
const hideForDays = (variant: string, days = HIDE_DAYS) => {
  try {
    localStorage.setItem(hideKey(variant), String(Date.now() + days * 86400000));
  } catch {
    /* storage blocked: it just shows again next visit */
  }
};
/** Real Chrome on Android (not WhatsApp, Instagram, Facebook, Opera or other in-app browsers, which can't install) */
const isRealChrome = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Chrome\//.test(ua) && !/(; wv\)|OPR\/|Opera|OPiOS|FBAN|FBAV|Instagram|WhatsApp|EdgA|SamsungBrowser|UCBrowser|MiuiBrowser)/i.test(ua);
};

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
/** Android: open this same page in Chrome (falls back to the page itself if Chrome isn't there) */
const openInChrome = () => {
  const { host, pathname, search, href } = window.location;
  window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
};

/**
 * Shows on any device where Roomly isn't installed. Disappears for good once installed;
 * × or a cancelled install hides it for 3 days on that device.
 */
export const InstallBanner: React.FC<{ variant?: 'home' | 'order'; className?: string }> = ({ variant = 'home', className = '' }) => {
  const [, setTick] = useState(0);
  const [hidden, setHidden] = useState(() => hiddenNow(variant));
  const [steps, setSteps] = useState(false);
  useEffect(() => {
    const off = onInstallChange(() => setTick((n) => n + 1));
    return () => {
      off();
    };
  }, []);

  if (hidden || isInstalled()) return null;
  const mode = canInstall() ? 'button' : isIPhone() ? 'iphone' : !isRealChrome() ? 'chrome' : null;
  if (!mode) return null; // Chrome that isn't offering install (usually already installed)

  const dismiss = () => {
    // Other browsers can't tell if Roomly is already installed, so × there hides the message for good
    hideForDays(variant, mode === 'chrome' ? 3650 : HIDE_DAYS);
    setHidden(true);
  };
  const install = async () => {
    const ok = await promptInstall();
    if (!ok) dismiss();
    setTick((n) => n + 1);
  };
  const text =
    variant === 'order'
      ? 'Install Roomly to get notified when your order is on the way.'
      : 'Install Roomly: order in 2 taps and get updates on your order.';

  return (
    <div className={`relative p-3 pr-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-950 dark:text-emerald-50 space-y-2 ${className}`}>
      <button
        type="button"
        aria-label="Hide for now"
        onClick={dismiss}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/80 dark:bg-slate-900/80 text-slate-500 flex items-center justify-center cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-[#0e9f55] text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4" />
        </span>
        <p className="font-semibold leading-snug flex-1">{text}</p>
      </div>
      {mode === 'button' && (
        <button type="button" onClick={install} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white font-bold cursor-pointer">
          <Download className="w-4 h-4" /> Install Roomly
        </button>
      )}
      {mode === 'iphone' &&
        (steps ? (
          <ol className="space-y-1.5 text-[12px]">
            <li className="flex items-center gap-2">
              <b>1.</b> Tap <Share className="w-4 h-4 text-sky-600" /> <b>Share</b> at the bottom of Safari
            </li>
            <li className="flex items-center gap-2">
              <b>2.</b> Scroll and tap <PlusSquare className="w-4 h-4" /> <b>Add to Home Screen</b>
            </li>
            <li className="flex items-center gap-2">
              <b>3.</b> Tap <b>Add</b>. Roomly appears on your home screen.
            </li>
          </ol>
        ) : (
          <button type="button" onClick={() => setSteps(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0e9f55] text-white font-bold cursor-pointer">
            <Download className="w-4 h-4" /> How to install
          </button>
        ))}
      {mode === 'chrome' && (
        <>
          <p className="text-[12px]">
            To install, open this page in <b>Chrome</b>, then tap <b>Install Roomly</b>. Already have it? Tap × to hide this.
          </p>
          {isAndroid() && (
            <button type="button" onClick={openInChrome} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0e9f55] hover:bg-[#0b8044] text-white font-bold cursor-pointer">
              <Download className="w-4 h-4" /> Open in Chrome
            </button>
          )}
        </>
      )}
    </div>
  );
};
