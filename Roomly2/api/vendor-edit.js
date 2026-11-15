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

// ---------- Name changes ----------
const NAME_COOLDOWN_DAYS = 7;
const BLOCKED_NAME_WORDS = ['roomly', 'admin', 'official', 'support'];
const firstWord = (name) => String(name || '').trim().split(/\s+/)[0].toLowerCase();

/** Returns an error message, or '' when the name is fine */
function nameProblem(name) {
  if (name.length < 2) return 'Your name must be at least 2 letters.';
  if (!/[a-z]/i.test(name)) return 'Your name must have letters in it.';
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED_NAME_WORDS.some((w) => flat.includes(w))) return 'That name can\'t be used. Choose your own name.';
  return '';
}

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
  nameLocked: Boolean(d.nameLocked),
  lastNameChangeAtMs: Number(d.lastNameChangeAtMs) || 0,
  confirmedAtMs: Number(d.confirmedAtMs) || 0,
  lastEditedAtMs: Number(d.lastEditedAtMs) || 0,
  approvedAtMs: Number(d.approvedAtMs) || Number(d.createdAtMs) || 0,
});


// ---------- Hub listings posted by the admin for someone (the same private link opens their post) ----------
const DAY = 86400000;
const LONG_LIVED = ['service', 'charging', 'water'];

const viewPost = (id, d) => ({
  id,
  type: d.type,
  title: d.title || '',
  price: Number(d.price) || 0,
  price2: Number(d.price2) || 0,
  note: d.note || '',
  photo: d.photo || '',
  status: d.status,
  chargingNow: Boolean(d.chargingNow),
  name: d.name || '',
  hostel: d.hostel || '',
  expiresAtMs: Number(d.expiresAtMs) || 0,
  confirmedAtMs: Number(d.confirmedAtMs) || 0,
});

async function handleListing(db, listingId, body) {
  const ref = db.collection('hubListings').doc(String(listingId));
  const snap = await ref.get();
  // Removed by the admin or hidden after reports: the link stops working
  if (!snap.exists || snap.data().status === 'removed' || snap.data().hidden) return json({ error: DENIED }, 403);
  const l = snap.data();

  if (body.action === 'get') return json({ post: viewPost(snap.id, l) });

  if (body.action === 'save') {
    const p = body.patch && typeof body.patch === 'object' ? body.patch : {};
    const patch = {};
    if ('title' in p) {
      const t = str(p.title, 60);
      if (t.length < 2) return json({ error: 'Add a short title.' }, 400);
      patch.title = t;
    }
    if ('price' in p) patch.price = int(p.price, 0, 10000000);
    if ('price2' in p) patch.price2 = int(p.price2, 0, 10000000);
    if ('note' in p) patch.note = str(p.note, 300);
    if ('photo' in p) patch.photo = photoUrl(p.photo);
    if (!Object.keys(patch).length) return json({ error: 'Nothing to save.' }, 400);
    patch.updatedAtMs = Date.now();
    await ref.update(patch);
    return json({ ok: true, post: viewPost(snap.id, { ...l, ...patch }) });
  }

  if (body.action === 'status') {
    const a = body.patch && typeof body.patch === 'object' ? body.patch.action : '';
    const now = Date.now();
    const patch = { updatedAtMs: now };
    if (a === 'sold') patch.status = 'sold';
    else if (a === 'remove') patch.status = 'removed';
    else if (a === 'confirm') {
      patch.status = 'active';
      patch.confirmedAtMs = now;
    } else if (a === 'renew' && !LONG_LIVED.includes(l.type)) {
      patch.status = 'active';
      patch.expiresAtMs = now + 7 * DAY;
    } else if ((a === 'chargingOn' || a === 'chargingOff') && l.type === 'charging') patch.chargingNow = a === 'chargingOn';
    else return json({ error: 'Unknown request.' }, 400);
    await ref.update(patch);
    return json({ ok: true, post: viewPost(snap.id, { ...l, ...patch }) });
  }

  return json({ error: 'Unknown request.' }, 400);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    // A token that is the wrong shape never reaches the database
    if (!TOKEN_RE.test(token)) return json({ error: DENIED }, 403);

    const db = adminDb();
    const key = await db.collection('shopEditKeys').doc(hashOf(token)).get();
    if (!key.exists || key.data().active === false) return json({ error: DENIED }, 403);
    // A key made for a Hub listing opens that listing; a key made for a shop opens that shop
    if (key.data().listingId) return await handleListing(db, key.data().listingId, body);
    if (!key.data().shopId) return json({ error: DENIED }, 403);

    // The shop is decided by the stored key alone, never by anything the phone sends
    const ref = db.collection('shops').doc(String(key.data().shopId));
    const snap = await ref.get();
    if (!snap.exists) return json({ error: DENIED }, 403);
    const shop = snap.data();

    if (body.action === 'get') return json({ shop: view(snap.id, shop) });

    // "Still available": tells Roomly this page is active, so students keep seeing it
    if (body.action === 'confirm') {
      await ref.update({ confirmedAtMs: Date.now() });
      return json({ ok: true, shop: view(snap.id, { ...shop, confirmedAtMs: Date.now() }) });
    }

    if (body.action === 'save') {
      let patch;
      try {
        patch = cleanPatch(body.patch, shop);
      } catch (e) {
        return json({ error: e.message || 'Could not save that.' }, 400);
      }
      // Renaming: only when the name really changes, with checks so nobody can pass as someone else
      const wantsName = body.patch && typeof body.patch === 'object' && typeof body.patch.name === 'string' ? str(body.patch.name, 60) : '';
      if (wantsName && wantsName !== shop.name) {
        const now = Date.now();
        if (shop.nameLocked) return json({ error: 'Roomly has locked your name. Contact Roomly to change it.' }, 400);
        const last = Number(shop.lastNameChangeAtMs) || 0;
        if (last && now - last < NAME_COOLDOWN_DAYS * 86400000) {
          const left = Math.ceil((NAME_COOLDOWN_DAYS * 86400000 - (now - last)) / 86400000);
          return json({ error: `You can change your name once every ${NAME_COOLDOWN_DAYS} days. Try again in ${left} ${left === 1 ? 'day' : 'days'}.` }, 400);
        }
        const problem = nameProblem(wantsName);
        if (problem) return json({ error: problem }, 400);
        // The first name is what students see ("Kene's Items"), so it must not match another live shop of the same kind
        const others = await db.collection('shops').where('kind', '==', shop.kind).where('status', '==', 'live').get();
        const taken = others.docs.some((d) => d.id !== snap.id && firstWord(d.data().name) === firstWord(wantsName));
        if (taken) return json({ error: 'Another vendor already uses that name. Add your surname or choose a different name.' }, 400);
        const history = Array.isArray(shop.nameHistory) ? shop.nameHistory.slice(-9) : [];
        history.push({ from: shop.name || '', to: wantsName, atMs: now, by: 'vendor' });
        patch.name = wantsName;
        patch.nameHistory = history;
        patch.lastNameChangeAtMs = now;
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
