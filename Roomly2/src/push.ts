/**
 * Phone alerts while Roomly is closed (Firebase Cloud Messaging, free).
 * The student taps "Notify me" once. The phone gives Roomly a token, we save it on the server,
 * and the server sends alerts to it (batch closing soon, and a test alert).
 * Needs VITE_FIREBASE_VAPID_KEY in Vercel (Firebase console: Cloud Messaging, Web Push certificates).
 */
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { app } from './firebase';

const VAPID: string = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || '';
const KEY = 'roomly_push_token';

export const pushConfigured = () => Boolean(VAPID);
export const pushToken = (): string => {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};
export const pushSupported = async (): Promise<boolean> => {
  try {
    return 'serviceWorker' in navigator && 'Notification' in window && (await isSupported());
  } catch {
    return false;
  }
};

const post = async (body: any) => {
  const res = await fetch('/api/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('server');
  return res.json().catch(() => ({}));
};

/** Ask permission (from a tap), get the phone's token, save it. */
export async function enablePush(pk = ''): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (!(await pushSupported()) || !VAPID) return 'unsupported';
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) return 'error';
    await post({ action: 'save', token, pk });
    try {
      localStorage.setItem(KEY, token);
    } catch {}
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function disablePush(): Promise<void> {
  const token = pushToken();
  try {
    if (token) await post({ action: 'remove', token });
    await deleteToken(getMessaging(app));
  } catch {}
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function sendTestPush(): Promise<boolean> {
  const token = pushToken();
  if (!token) return false;
  try {
    await post({ action: 'test', token });
    return true;
  } catch {
    return false;
  }
}
