import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Loader2, Plus, X, Check } from 'lucide-react';
import { uploadProductImage } from '../api.js';
import { vendorEditApi, shopTitle, shopLink, daysSince, shopFreshAtMs, SHOP_CONFIRM_DAYS, hostelChoices, MAX_ITEMS, SHOP_TYPES } from '../shops.js';
import { PostEditor } from './PostEditor';

const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const rowInput = input.replace('w-full ', '');
const label = 'block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1';

interface EditItem {
  id: string;
  name: string;
  price: string;
  priceFrom: boolean;
  soldOut: boolean;
  photo: string;
  category: string;
  photos: string[];
  sizes: string[];
  colors: string;
  note: string;
}

const blankItem = (category = ''): EditItem => ({ id: '', name: '', price: '', priceFrom: false, soldOut: false, photo: '', category, photos: [], sizes: [], colors: '', note: '' });

const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];
const CLOTHES_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const SUGGEST: Record<string, string[]> = {
  Fashion: ['Shirts', 'Trousers', 'Dresses'],
  Shoes: ['Sneakers', 'Heels', 'Sandals'],
  Perfume: ['For men', 'For women', 'Unisex'],
  Gadgets: ['Phones', 'Accessories', 'Chargers'],
  Beauty: ['Skincare', 'Hair', 'Makeup'],
};
type SizeMode = 'none' | 'shoe' | 'clothes' | 'other';
const modeOf = (s: string[]): SizeMode => (!s.length ? 'none' : s.every((x) => SHOE_SIZES.includes(x)) ? 'shoe' : s.every((x) => CLOTHES_SIZES.includes(x)) ? 'clothes' : 'other');

/** Sizes: pick the kind (shoe, clothing, other), tap the sizes that are available. "Other" lets the seller type their own. */
const SizePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const [mode, setMode] = useState<SizeMode>(() => modeOf(value));
  const [text, setText] = useState(() => value.join(', '));
  const preset = mode === 'shoe' ? SHOE_SIZES : mode === 'clothes' ? CLOTHES_SIZES : [];
  const pick = (m: SizeMode) => {
    setMode(m);
    if (m === 'none') onChange([]);
    else if (m === 'shoe') onChange(value.filter((x) => SHOE_SIZES.includes(x)));
    else if (m === 'clothes') onChange(value.filter((x) => CLOTHES_SIZES.includes(x)));
    else setText(value.join(', '));
  };
  return (
    <div className="space-y-2">
      <select className={input} value={mode} onChange={(e) => pick(e.target.value as SizeMode)}>
        <option value="none">No sizes</option>
        <option value="shoe">Shoe sizes (36 to 47)</option>
        <option value="clothes">Clothing sizes (XS to 3XL)</option>
        <option value="other">Other (type your own)</option>
      </select>
      {preset.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preset.map((s) => {
            const on = value.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== s) : preset.filter((x) => x === s || value.includes(x)))}
                className={`h-9 min-w-[40px] px-2.5 rounded-full text-xs font-bold border cursor-pointer ${
                  on ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
      {mode === 'other' && (
        <input
          className={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/\|/g, ''));
            onChange(splitList(e.target.value.replace(/\|/g, '')));
          }}
          placeholder="For example: 100ml, 50ml or One size"
        />
      )}
    </div>
  );
};

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; text: string; hint?: string }> = ({ on, onChange, text, hint }) => (
  <button type="button" onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 text-left cursor-pointer">
    <span>
      <span className="block text-sm font-bold text-slate-900 dark:text-white">{text}</span>
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </span>
    <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

/**
 * The private page a vendor opens from their edit link (?edit=TOKEN). It talks only to /api/vendor-edit,
 * which finds the one listing that belongs to this link. Edits go live as soon as they are saved.
 */
export const VendorEditor: React.FC<{ token: string; onClose: () => void; onForget: () => void }> = ({ token, onClose, onForget }) => {
  const [shop, setShop] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'post'>('loading');
  const [post, setPost] = useState<any>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [showRoom, setShowRoom] = useState(false);
  const [hostel, setHostel] = useState('');
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [fee, setFee] = useState('');
  const [cover, setCover] = useState('');
  const [photo, setPhoto] = useState('');
  const [bio, setBio] = useState('');
  const [shopType, setShopType] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = (s: any) => {
    setShop(s);
    setItems(
      (s.items || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        price: String(i.price ?? ''),
        priceFrom: Boolean(i.priceFrom),
        soldOut: Boolean(i.soldOut),
        photo: i.photo || '',
        category: i.category || '',
        photos: Array.isArray(i.photos) ? i.photos : [],
        sizes: Array.isArray(i.sizes) ? i.sizes : [],
        colors: Array.isArray(i.colors) ? i.colors.join(', ') : '',
        note: i.note || '',
      }))
    );
    setBio(s.bio || '');
    setShopType(s.shopType || '');
    setCategories(Array.isArray(s.categories) ? s.categories : []);
    setShowRoom(Boolean(s.showRoom));
    setHostel(s.hostel || '');
    setRoom(s.room || '');
    setName(s.name || '');
    setDeliveryOn(Boolean(s.deliveryOn));
    setFee(String(s.deliveryFee ?? 0));
    setCover(s.cover || '');
    setPhoto(s.photo || '');
  };

  useEffect(() => {
    vendorEditApi(token, 'get')
      .then((d: any) => {
        // The same private link opens a Hub post when the admin made one for this person
        if (d.post) {
          setPost(d.post);
          setState('post');
          return;
        }
        load(d.shop);
        setState('ready');
      })
      .catch(() => setState('denied'));
  }, [token]);

  const setItem = (i: number, patch: Partial<EditItem>) => setItems((l) => l.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const upload = async (file: File | undefined, key: string, apply: (url: string) => void) => {
    if (!file) return;
    setUploading(key);
    setMsg(null);
    try {
      apply(await uploadProductImage(file));
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Photo upload failed.' });
    }
    setUploading('');
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const isVendor = shop.kind === 'vendor';
      const d: any = await vendorEditApi(token, 'save', {
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          price: Number(i.price) || 0,
          priceFrom: i.priceFrom,
          soldOut: i.soldOut,
          photo: i.photo,
          category: i.category,
          photos: i.photos,
          sizes: i.sizes,
          colors: splitList(i.colors),
          note: i.note,
        })),
        bio: bio.trim(),
        ...(isVendor ? { shopType, categories: categories.map((c) => c.trim()).filter(Boolean) } : {}),
        showRoom,
        hostel,
        room,
        cover,
        photo,
        ...(name.trim() && name.trim() !== shop.name ? { name: name.trim() } : {}),
        ...(isVendor ? { deliveryOn, deliveryFee: Number(fee) || 0 } : {}),
      });
      load(d.shop);
      setMsg({ ok: true, text: 'Saved. Your changes are live now.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save. Try again.' });
    }
    setBusy(false);
  };

  if (state === 'loading') {
    return (
      <Page onClose={onClose}>
        <div className="py-24 flex justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Page>
    );
  }
  if (state === 'post') {
    return (
      <Page onClose={onClose}>
        <PostEditor token={token} initial={post} />
      </Page>
    );
  }
  if (state === 'denied') {
    return (
      <Page onClose={onClose}>
        <div className="py-24 px-6 text-center">
          <p className="text-base font-black text-slate-900 dark:text-white">This link is not valid</p>
          <p className="mt-2 text-sm text-slate-500">Check that you opened the whole link, or ask Roomly to send you a new one.</p>
          <button type="button" onClick={onForget} className="mt-5 h-11 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
            Remove this saved link
          </button>
        </div>
      </Page>
    );
  }

  const isService = shop.kind === 'service';
  // Fashion, shoes, perfume and other non-food shops: items show in full, with categories, sizes and colours
  const visual = !isService && Boolean(shopType) && shopType !== 'Food';
  return (
    <Page onClose={onClose}>
      <div className="px-4 pt-2 pb-32 space-y-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0b8044] dark:text-emerald-400">Edit your page</p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{shopTitle(shop)}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Only you have this link. Keep it private. Students see your changes as soon as you save.
          </p>
          <p className="mt-1 text-xs text-slate-500 break-all">Your page: {shopLink(shop.id)}</p>
        </div>

        <div className={`${card} px-4 py-3`}>
          <p className="text-sm font-black text-slate-900 dark:text-white">Your page is live</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Opening this page keeps you listed. If you don't open or save it for {SHOP_CONFIRM_DAYS} days, students stop seeing your page until you open it again.</p>
        </div>

        <div className={`${card} p-4 space-y-4`}>
          <div>
            <label className={label}>Your name</label>
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              disabled={Boolean(shop.nameLocked)}
              placeholder="Your name"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {shop.nameLocked
                ? 'Roomly has locked your name. Contact Roomly to change it.'
                : `Students see "${shopTitle({ ...shop, name })}". You can change your name once every 7 days.`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Hostel</label>
              <select className={input} value={hostel} onChange={(e) => setHostel(e.target.value)}>
                {hostelChoices(shop.hostel).map((h: string) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Room number</label>
              <input className={input} value={room} onChange={(e) => setRoom(e.target.value.slice(0, 20))} maxLength={20} placeholder="For example A26" />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-slate-500">Moved rooms this semester? Change it here and it is live straight away.</p>
          <Toggle on={showRoom} onChange={setShowRoom} text="Show my room number" hint="Students will see your hostel and room." />
          {!isService && (
            <>
              <Toggle on={deliveryOn} onChange={setDeliveryOn} text="I deliver to rooms" hint="Turn off if students must pick up from you." />
              {deliveryOn && (
                <div>
                  <label className={label}>Delivery fee (one flat amount, in naira)</label>
                  <input className={input} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} placeholder="300" />
                </div>
              )}
            </>
          )}
          {!isService && (
            <div>
              <label className={label}>What do you sell?</label>
              <div className="flex flex-wrap gap-2">
                {SHOP_TYPES.map((t: string) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setShopType(shopType === t ? '' : t)}
                    className={`h-9 px-3.5 rounded-full text-xs font-bold border cursor-pointer ${
                      shopType === t
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">This decides how your items are shown. Food keeps the quick list. Fashion, shoes and the rest show each item in full, with sizes and colours.</p>
            </div>
          )}
          <div>
            <label className={label}>One line about your shop (optional)</label>
            <input className={input} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={100} placeholder={isService ? 'For example: Fast and neat, I come to your room' : 'For example: Original sneakers and kicks, delivered to your room'} />
          </div>
          <div>
            <label className={label}>Page cover photo</label>
            <div className="flex items-center gap-3">
              <div className="w-24 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">{cover && <img src={cover} alt="" className="w-full h-full object-cover" />}</div>
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                disabled={uploading === 'cover'}
                className="h-10 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                {uploading === 'cover' ? 'Uploading...' : cover ? 'Change photo' : 'Add photo'}
              </button>
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  upload(e.target.files?.[0], 'cover', (u) => {
                    setCover(u);
                    if (!photo) setPhoto(u);
                  })
                }
              />
            </div>
          </div>
        </div>

        {visual && (
          <div className={`${card} p-4 space-y-2.5`}>
            <p className="text-sm font-black text-slate-900 dark:text-white">Your categories</p>
            <p className="text-[11px] text-slate-500">Students see your items in sections, one for each category. Add up to 8, then pick a category on each item.</p>
            {categories.map((c, n) => (
              <div key={n} className="flex items-center gap-2">
                <input
                  className={`${rowInput} flex-1 min-w-0`}
                  value={c}
                  maxLength={24}
                  placeholder="For example Sneakers"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\|/g, '').slice(0, 24);
                    const old = categories[n];
                    setCategories((l) => l.map((x, k) => (k === n ? v : x)));
                    setItems((l) => l.map((it) => (old && it.category === old ? { ...it, category: v } : it)));
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove category"
                  onClick={() => {
                    const old = categories[n];
                    setCategories((l) => l.filter((_, k) => k !== n));
                    setItems((l) => l.map((it) => (old && it.category === old ? { ...it, category: '' } : it)));
                  }}
                  className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-rose-600 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {categories.length < 8 && (
              <button type="button" onClick={() => setCategories((l) => [...l, ''])} className="flex items-center gap-1.5 text-sm font-bold text-[#0e9f55] cursor-pointer">
                <Plus className="w-4 h-4" /> Add a category
              </button>
            )}
            {categories.length === 0 && SUGGEST[shopType] && (
              <button type="button" onClick={() => setCategories(SUGGEST[shopType])} className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 underline cursor-pointer">
                Start with: {SUGGEST[shopType].join(', ')}
              </button>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <h2 className="text-sm font-black text-slate-900 dark:text-white">{isService ? 'Your services' : 'Your items'}</h2>
          {items.map((it, i) => (
            <div key={it.id || i} className={`${card} p-3 space-y-2.5`}>
              <div className="flex gap-2">
                <input className={`${rowInput} flex-1 min-w-0`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={isService ? 'Service' : 'Item'} maxLength={60} />
                <input className={`${rowInput} w-24 shrink-0`} inputMode="numeric" value={it.price} onChange={(e) => setItem(i, { price: e.target.value.replace(/\D/g, '') })} placeholder={isService ? 'Negotiable' : 'Price'} />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={it.priceFrom} onChange={(e) => setItem(i, { priceFrom: e.target.checked })} className="accent-[#0e9f55]" />
                    Starting price (from)
                  </label>
                  {!isService && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={it.soldOut} onChange={(e) => setItem(i, { soldOut: e.target.checked })} className="accent-[#0e9f55]" />
                      Finished for today
                    </label>
                  )}
                </div>
                <button type="button" onClick={() => setItems((l) => l.filter((_, n) => n !== i))} className="flex items-center gap-1 text-[11px] font-bold text-rose-600 cursor-pointer">
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                  {it.photo ? <img src={it.photo} alt="" className="w-full h-full object-cover" /> : <Camera className="w-4 h-4 text-slate-400" />}
                </div>
                <label className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center cursor-pointer">
                  {uploading === `i${i}` ? 'Uploading...' : it.photo ? 'Change photo' : 'Add photo (optional)'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], `i${i}`, (u) => setItem(i, { photo: u }))} />
                </label>
                {it.photo && (
                  <button type="button" onClick={() => setItem(i, { photo: '' })} className="text-[11px] text-slate-500 underline cursor-pointer">
                    Remove photo
                  </button>
                )}
              </div>
              {visual && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 p-3 space-y-3">
                  <div>
                    <label className={label}>Category</label>
                    <select className={input} value={it.category} onChange={(e) => setItem(i, { category: e.target.value })}>
                      <option value="">No category</option>
                      {categories.filter((c) => c.trim()).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      {it.category && !categories.includes(it.category) && <option value={it.category}>{it.category}</option>}
                    </select>
                    {categories.filter((c) => c.trim()).length === 0 && <p className="mt-1 text-[11px] text-slate-500">Add your categories above first.</p>}
                  </div>
                  <div>
                    <label className={label}>Sizes (optional)</label>
                    <SizePicker key={`${it.id}-${i}`} value={it.sizes} onChange={(v) => setItem(i, { sizes: v })} />
                  </div>
                  <div>
                    <label className={label}>Colours (optional, separate with commas)</label>
                    <input className={input} value={it.colors} onChange={(e) => setItem(i, { colors: e.target.value.replace(/\|/g, '') })} placeholder="Black, White, Red" />
                  </div>
                  <div>
                    <label className={label}>Note (optional)</label>
                    <input className={input} value={it.note} onChange={(e) => setItem(i, { note: e.target.value })} maxLength={200} placeholder="Original, fits true to size" />
                  </div>
                  <div>
                    <label className={label}>Extra photos (up to 3)</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {it.photos.map((u, n) => (
                        <div key={`${u}${n}`} className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img src={u} alt="" className="w-full h-full object-cover" />
                          <button type="button" aria-label="Remove photo" onClick={() => setItem(i, { photos: it.photos.filter((_, k) => k !== n) })} className="absolute top-0 right-0 w-5 h-5 bg-black/70 text-white flex items-center justify-center cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {it.photos.length < 3 && (
                        <label className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer text-slate-500">
                          {uploading === `x${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], `x${i}`, (u) => setItem(i, { photos: [...it.photos, u].slice(0, 3) }))} />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!isService && <p className="text-[11px] text-slate-500">{items.length} of {MAX_ITEMS} items</p>}
          {items.length < MAX_ITEMS && (
            <button
              type="button"
              onClick={() => setItems((l) => [...l, blankItem(l.length ? l[l.length - 1].category : '')])}
              className="flex items-center gap-1.5 text-sm font-bold text-[#0e9f55] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add {isService ? 'a service' : 'an item'}
            </button>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-[480px] mx-auto px-4 py-3 space-y-2">
          {msg && (
            <p className={`text-xs font-semibold flex items-center gap-1.5 ${msg.ok ? 'text-[#0e9f55]' : 'text-rose-600'}`}>
              {msg.ok && <Check className="w-3.5 h-3.5" />}
              {msg.text}
            </p>
          )}
          <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </Page>
  );
};

const Page: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-[480px] mx-auto min-h-full relative">
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Roomly"
            className="h-11 pl-3 pr-4 rounded-full flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" /> Roomly
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
