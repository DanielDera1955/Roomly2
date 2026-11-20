// Shared helpers for sending alerts (the underscore keeps this file from becoming a web address).
import crypto from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';

export const GAME_LABELS = { efootball: 'eFootball', fifa: 'FIFA', dls: 'DLS', freefire: 'Free Fire', codm: 'CODM' };
export const phoneKeyOf = (phone) => crypto.createHash('sha256').update('roomly-phone:' + phone).digest('hex');
export const lagosNow = () => new Date(Date.now() + 3600000); // Lagos is UTC+1, no daylight saving
export const lagosDateKey = () => lagosNow().toISOString().slice(0, 10);
export const fill = (text, vars = {}) => String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])));

// The built-in alerts. Roomly can change any of these in Admin > Alerts (saved in settings/alerts).
// The batch times are one hour before the order cut-offs in src/config.ts.
export const ALERT_DEFAULTS = {
  lunch: { on: true, hour: 11, min: 30, title: 'Lunch closes in 1 hour', body: 'Order before 12:30pm and it reaches the school gate before 1:30pm.' },
  dinner: { on: true, hour: 17, min: 0, title: 'Dinner closes in 1 hour', body: 'Order before 6:00pm and it reaches the school gate before 7:00pm.' },
  room: { on: true, hour: 19, min: 50, title: 'Room delivery closes in 1 hour', body: 'Order before 8:50pm and it reaches your room before 9:30pm.' },
  credit: { on: true, title: 'Your {value} {game} credit is ready', body: 'Open your credits to see when it opens. Once open it lasts 24 hours, so order food and use it.' },
  rewardStart: { on: true, title: 'The {game} reward week has started', body: 'The top 3 players win {value} food credit each. Play your matches now.' },
  rewardEnd: { on: true, title: '{game} reward week ends tonight', body: 'You are #{rank} with {pts} points. The top 3 need at least {need} points to win.' },
};

export async function alertSettings(db) {
  const saved = ((await db.doc('settings/alerts').get()).data()) || {};
  const out = {};
  for (const k of Object.keys(ALERT_DEFAULTS)) out[k] = { ...ALERT_DEFAULTS[k], ...(saved[k] || {}) };
  return out;
}

const INVALID = /registration-token-not-registered|invalid-argument|invalid-registration/;

/** items: [{ ref, token, data }]. Sends in chunks of 500, removes dead tokens, returns how many arrived. */
export async function sendItems(items) {
  let ok = 0;
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const resp = await getMessaging().sendEach(
      chunk.map((it) => ({ token: it.token, data: it.data, webpush: { headers: { Urgency: 'high', TTL: '3600' } } }))
    );
    for (let k = 0; k < resp.responses.length; k++) {
      const x = resp.responses[k];
      if (x.success) ok++;
      else if (INVALID.test(String(x.error?.code || ''))) await chunk[k].ref.delete().catch(() => {});
    }
  }
  return ok;
}

export const dataFor = (title, body, tag = 'roomly') => ({ title, body, tag, url: '/' });

export async function allTokenDocs(db) {
  return (await db.collection('pushTokens').get()).docs;
}

/** Token docs for a list of phone keys (Firestore allows 30 per query) */
export async function tokenDocsForPks(db, pks) {
  const list = [...new Set(pks.filter(Boolean))];
  const out = [];
  for (let i = 0; i < list.length; i += 30) {
    const snap = await db.collection('pushTokens').where('pk', 'in', list.slice(i, i + 30)).get();
    out.push(...snap.docs);
  }
  return out;
}

/** gamer ids -> { gid: phoneKey } using the private contact record */
export async function pkByGid(db, gids) {
  const out = {};
  const list = [...new Set(gids)];
  for (let i = 0; i < list.length; i += 100) {
    const refs = list.slice(i, i + 100).map((g) => db.doc(`gamerContact/${g}`));
    if (!refs.length) continue;
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, k) => {
      const phone = s.exists ? String(s.data().phone || '') : '';
      if (phone) out[list[i + k]] = phoneKeyOf(phone);
    });
  }
  return out;
}

export async function logPush(db, id, fields) {
  await db.doc(`pushLog/${id}`).set({ date: lagosDateKey(), atMs: Date.now(), ...fields }, { merge: true }).catch(() => {});
}
