import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Loader2, Plus, X, Check } from 'lucide-react';
import { uploadProductImage } from '../api.js';
import { vendorEditApi, shopTitle, shopLink } from '../shops.js';

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
}

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
  const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading');
  const [items, setItems] = useState<EditItem[]>([]);
  const [showRoom, setShowRoom] = useState(false);
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [fee, setFee] = useState('');
  const [cover, setCover] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = (s: any) => {
    setShop(s);
    setItems((s.items || []).map((i: any) => ({ id: i.id, name: i.name, price: String(i.price ?? ''), priceFrom: Boolean(i.priceFrom), soldOut: Boolean(i.soldOut), photo: i.photo || '' })));
    setShowRoom(Boolean(s.showRoom));
    setDeliveryOn(Boolean(s.deliveryOn));
    setFee(String(s.deliveryFee ?? 0));
    setCover(s.cover || '');
    setPhoto(s.photo || '');
  };

  useEffect(() => {
    vendorEditApi(token, 'get')
      .then((d: any) => {
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
        items: items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price) || 0, priceFrom: i.priceFrom, soldOut: i.soldOut, photo: i.photo })),
        showRoom,
        cover,
        photo,
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

        <div className={`${card} p-4 space-y-4`}>
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

        <div className="space-y-2.5">
          <h2 className="text-sm font-black text-slate-900 dark:text-white">{isService ? 'Your services' : 'Your items'}</h2>
          {items.map((it, i) => (
            <div key={it.id || i} className={`${card} p-3 space-y-2.5`}>
              <div className="flex gap-2">
                <input className={`${rowInput} flex-1 min-w-0`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={isService ? 'Service' : 'Item'} maxLength={60} />
                <input className={`${rowInput} w-24 shrink-0`} inputMode="numeric" value={it.price} onChange={(e) => setItem(i, { price: e.target.value.replace(/\D/g, '') })} placeholder="Price" />
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
            </div>
          ))}
          {items.length < 60 && (
            <button
              type="button"
              onClick={() => setItems((l) => [...l, { id: '', name: '', price: '', priceFrom: false, soldOut: false, photo: '' }])}
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
