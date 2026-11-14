/**
 * Section links for promotion posts. Each one opens the app straight on one section:
 *   roomly2-inky.vercel.app/?ref=cs#outside-food
 * The #part is removed right after it is read, so a refresh or the back button opens the app normally.
 * A tagged link (?ref=) also counts one visit per phone, per tag, per day, for Admin > Where students come from.
 */
import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export const SECTION_LINKS = {
  inside: { side: 'inside', tab: 'store', label: 'Inside school: Store Items' },
  'inside-food': { side: 'inside', tab: 'food', label: 'Inside school: Food' },
  'outside-food': { side: 'outside', tab: 'food', label: 'Outside: Cooked Food and Drinks' },
  'outside-store': { side: 'outside', tab: 'store', label: 'Outside: Store Items' },
  'hub-vendors': { side: 'inside', tab: 'hub', hub: 'vendors', label: 'Hostel Hub: Vendors' },
  'hub-services': { side: 'inside', tab: 'hub', hub: 'services', label: 'Hostel Hub: Services' },
  'hub-buysell': { side: 'inside', tab: 'hub', hub: 'buysell', label: 'Hostel Hub: Buy & Sell' },
  // Games has its own page now (opened from the Home card)
  games: { side: 'inside', tab: 'store', games: true, label: 'Games' },
  'hub-lostfound': { side: 'inside', tab: 'hub', hub: 'lostfound', label: 'Hostel Hub: Lost & Found' },
};

export const SITE_URL = 'https://roomly2-inky.vercel.app';

/** The link a post should use for one group: tag + section */
export function buildLink(tag, section) {
  const t = String(tag || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const s = SECTION_LINKS[section] ? `#${section}` : '';
  return `${SITE_URL.replace(/^https:\/\//, '')}/${t ? `?ref=${t}` : ''}${s}`;
}

let target = null;
let hubPending = '';

(() => {
  if (typeof window === 'undefined') return;
  try {
    const key = window.location.hash.replace(/^#/, '').toLowerCase();
    if (SECTION_LINKS[key]) {
      target = { key, ...SECTION_LINKS[key] };
      hubPending = target.hub || '';
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (e) {
    /* leave the link as it is */
  }
  // One visit per phone, per tag, per day
  try {
    const ref = String(new URLSearchParams(window.location.search).get('ref') || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 40);
    if (!ref) return;
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const seenKey = `roomly_visit_${ref}_${day}`;
    if (localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, '1');
    addDoc(collection(db, 'visits'), { ref, section: target ? target.key : '', day, atMs: Date.now() }).catch(() => {});
  } catch (e) {
    /* private mode: not counted */
  }
})();

// Installs: the first time Roomly is opened from the home screen on a phone, count it once (Android and iPhone)
(() => {
  if (typeof window === 'undefined') return;
  try {
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (!standalone) return;
    const key = 'roomly_installed_counted';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    addDoc(collection(db, 'visits'), { ref: '_installed', section: 'app', day, atMs: Date.now() }).catch(() => {
      localStorage.removeItem(key);
    });
  } catch (e) {
    /* private mode: not counted */
  }
})();

/** The section this visit's link asked for (null for a plain link) */
export function getLinkTarget() {
  return target;
}

/** Did the link ask for the Games page? (a #games post link, or a WhatsApp ?game= / ?match= link) */
export function linkOpensGames() {
  try {
    if (target && target.games) return true;
    const q = new URLSearchParams(window.location.search);
    return Boolean(q.get('game') || q.get('match'));
  } catch {
    return false;
  }
}

/** Hostel Hub: the section the link asked for, used once */
export function takeHubSection() {
  const s = hubPending;
  hubPending = '';
  return s;
}
