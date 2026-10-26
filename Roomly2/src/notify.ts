/**
 * Installing Roomly on the phone, and notifications.
 *
 * - Android / Chrome: the browser offers "Install"; we keep that offer and show our own button.
 * - iPhone: there is no button; the student taps Share, then "Add to Home Screen".
 * - Notifications show while Roomly is open or running in the background on the phone.
 *   (Alerts while the app is fully closed would need a paid push server, so we don't use one.)
 */

let deferred: any = null;
const listeners = new Set<() => void>();
const fire = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferred = e;
    fire();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    fire();
  });
}

/** Register the small offline helper that makes Roomly installable */
export function registerApp() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* not installable here (e.g. preview); the site still works */
    });
  });
}

export function onInstallChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Already opened from the home screen */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export const isIPhone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** The browser is ready to install Roomly with one tap */
export const canInstall = () => Boolean(deferred);

/** Show the install offer. Returns true if the student installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  fire();
  return choice?.outcome === 'accepted';
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationsOn = () => notificationsSupported() && Notification.permission === 'granted';
export const notificationsBlocked = () => notificationsSupported() && Notification.permission === 'denied';

/** Ask the student to allow notifications (must be called from a tap) */
export async function askNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Show a phone notification if allowed (through the app helper when installed, so it works in the background) */
export async function notify(title: string, body: string, tag = 'roomly') {
  if (!notificationsOn()) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' });
      return;
    }
  } catch {
    /* fall back below */
  }
  try {
    new Notification(title, { body, tag, icon: '/icon-192.png' });
  } catch {
    /* some phones only allow notifications from the app helper */
  }
}
