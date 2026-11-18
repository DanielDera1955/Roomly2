/**
 * Games credits, read side. A credit is one record: phone (as a hash), game, week, value, issued_at, expires_at,
 * status, used_order_id. The daily server job creates them; the app only reads them and marks one used at checkout.
 * Expiry is worked out when read (see creditState), nothing rewrites a credit when it runs out.
 */
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase.ts';
import { phoneKey, normalizePhone, isValidNigerianPhone } from './api.js';
import { creditState } from './boardCore.js';

export type Credit = {
  id: string;
  pk: string;
  game: string;
  weekKey: string;
  rank: number;
  value: number;
  issuedAtMs: number;
  validFromMs: number;
  expiresAtMs: number;
  status: 'active' | 'used' | 'void';
  usedOrderId?: string;
  usedAtMs?: number;
  releaseAfterMs?: number;
  restoredAtMs?: number;
};

/** All of this phone's credits, newest first. A credit stuck on an order that was never paid is given back first. */
export async function getMyCredits(phone: string): Promise<Credit[]> {
  const p = normalizePhone(phone || '');
  if (!isValidNigerianPhone(p)) return [];
  try {
    const pk = await phoneKey(p);
    const idx = await getDoc(doc(db, 'creditIndex', pk));
    const ids: string[] = idx.exists() ? ((idx.data() as any).ids || []).slice(-30) : [];
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'credits', id))));
    const list: Credit[] = snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...(s.data() as any) }));
    const now = Date.now();
    for (const c of list) {
      if (c.status === 'used' && c.usedOrderId && now >= Number(c.releaseAfterMs || 0) && Number(c.releaseAfterMs || 0) > 0) {
        try {
          const o = await getDoc(doc(db, 'orders', c.usedOrderId));
          if (o.exists() && (o.data() as any).paymentStatus === 'unpaid') {
            await updateDoc(doc(db, 'credits', c.id), { status: 'active', usedOrderId: '', usedAtMs: 0, releaseAfterMs: 0 });
            c.status = 'active';
            c.usedOrderId = '';
          }
        } catch {
          /* leave it as used; the next read tries again */
        }
      }
    }
    return list.sort((a, b) => Number(b.issuedAtMs) - Number(a.issuedAtMs));
  } catch {
    return [];
  }
}

/** The credit to use on an order: the usable one that runs out soonest */
export function usableCredit(list: Credit[], nowMs = Date.now()): Credit | null {
  return list.filter((c) => creditState(c, nowMs) === 'active').sort((a, b) => a.expiresAtMs - b.expiresAtMs)[0] || null;
}
/** Total of the credits that can be spent right now */
export const creditBalance = (list: Credit[], nowMs = Date.now()) =>
  list.filter((c) => creditState(c, nowMs) === 'active').reduce((t, c) => t + (Number(c.value) || 0), 0);

/** "3h 20m" / "45m" / "1d 2h" until a moment */
export function timeLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  if (total < 1) return 'under 1 minute';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
