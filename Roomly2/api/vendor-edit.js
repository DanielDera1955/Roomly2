// POST /api/vendor-edit  { token, action: 'get' | 'save', patch? }
//
// Lets a vendor or service provider edit THEIR OWN listing with the private link the admin gave them.
//
// How it stays safe:
//  - The token is 64 random hex characters (256 bits). Nobody can guess one.
//  - Only a SHA-256 hash of the token is stored (shopEditKeys/{hash}). The hash points to exactly one shop id.
//  - The phone never says which shop to change. The shop id comes only from the stored hash, so one vendor's
//    link can never open or change another vendor's listing.
//  - A wrong, cut-off or altered token has a different hash, finds nothing, and is refused.
//  - Students' phones cannot write to `shops` at all (see firestore.rules). Only this function and the admin can.
//  - Only the fields below can change, and every value is checked and trimmed here.
import crypto from 'node:crypto';
import { adminDb, json } from './_paystack.js';

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_RE = /^[a-f0-9]{64}$/;
const DENIED = 'This edit link is not valid. Ask Roomly for your link.';

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
// Photos must be real https links (uploaded to Cloudinary). Anything else is dropped.
const photoUrl = (v) => {
  const s = str(v, 600);
  return /^https:\/\/[^\s]+$/i.test(s) ? s : '';
};

function cleanItems(list) {
  if (!Array.isArray(list)) throw new Error('Items must be a list.');
  if (list.length > 60) throw new Error('You can list up to 60 items.');
  const seen = new Set();
  return list
    .map((i) => {
      let id = str(i && i.id, 40).replace(/[^A-Za-z0-9_-]/g, '');
      if (!id || seen.has(id)) id = crypto.randomBytes(6).toString('hex');
      seen.add(id);
      return {
        id,
        name: str(i && i.name, 60),
        price: int(i && i.price, 0, 10000000),
        priceFrom: Boolean(i && i.priceFrom),
        soldOut: Boolean(i && i.soldOut),
        photo: photoUrl(i && i.photo),
      };
    })
    .filter((i) => i.name);
}

/** Only these fields can be changed by a vendor. Everything else in `patch` is ignored. */
function cleanPatch(patch, shop) {
  const out = {};
  const p = patch && typeof patch === 'object' ? patch : {};
  if ('items' in p) out.items = cleanItems(p.items);
  if ('showRoom' in p) out.showRoom = Boolean(p.showRoom);
  if ('photo' in p) out.photo = photoUrl(p.photo);
  if ('cover' in p) out.cover = photoUrl(p.cover);
  if (shop.kind === 'vendor') {
    if ('deliveryOn' in p) out.deliveryOn = Boolean(p.deliveryOn);
    if ('deliveryFee' in p) out.deliveryFee = int(p.deliveryFee, 0, 5000);
  }
  return out;
}

const view = (id, d) => ({
  id,
  kind: d.kind,
  name: d.name,
  hostel: d.hostel,
  room: d.room || '',
  status: d.status,
  showRoom: Boolean(d.showRoom),
  photo: d.photo || '',
  cover: d.cover || '',
  deliveryOn: Boolean(d.deliveryOn),
  deliveryFee: Number(d.deliveryFee) || 0,
  items: Array.isArray(d.items) ? d.items : [],
});

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    // A token that is the wrong shape never reaches the database
    if (!TOKEN_RE.test(token)) return json({ error: DENIED }, 403);

    const db = adminDb();
    const key = await db.collection('shopEditKeys').doc(hashOf(token)).get();
    if (!key.exists || key.data().active === false || !key.data().shopId) return json({ error: DENIED }, 403);

    // The shop is decided by the stored key alone, never by anything the phone sends
    const ref = db.collection('shops').doc(String(key.data().shopId));
    const snap = await ref.get();
    if (!snap.exists) return json({ error: DENIED }, 403);
    const shop = snap.data();

    if (body.action === 'get') return json({ shop: view(snap.id, shop) });

    if (body.action === 'save') {
      let patch;
      try {
        patch = cleanPatch(body.patch, shop);
      } catch (e) {
        return json({ error: e.message || 'Could not save that.' }, 400);
      }
      if (!Object.keys(patch).length) return json({ error: 'Nothing to save.' }, 400);
      await ref.update({ ...patch, lastEditedAtMs: Date.now() });
      return json({ ok: true, shop: view(snap.id, { ...shop, ...patch }) });
    }

    return json({ error: 'Unknown request.' }, 400);
  } catch (e) {
    console.error('vendor-edit', e);
    return json({ error: 'Could not reach Roomly. Try again.' }, 500);
  }
}
