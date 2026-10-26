import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Camera, Sparkles, Clock, Check } from 'lucide-react';
import { uploadProductImage } from '../api.js';
import { InstallPrompt } from './InstallPrompt';

export type RequestSide = 'inside' | 'store' | 'food';

export interface RequestItemInput {
  name: string;
  estimate: string;
  photoUrl: string;
}

interface RequestTabProps {
  /** Where the student is shopping; outside they can switch between store items and food */
  defaultSide: RequestSide;
  outside: boolean;
  initialName?: string;
  myRequests: any[];
  cartRequestIds: Set<string>;
  onSubmit: (side: RequestSide, items: RequestItemInput[], note: string, addToCart: boolean) => Promise<void>;
  onAddQuoteToCart: (req: any) => void;
}

const SIDE_LABEL: Record<RequestSide, string> = {
  inside: 'Inside school (runners)',
  store: 'Outside: store items',
  food: 'Outside: cooked food and drinks',
};
const blank = (): RequestItemInput => ({ name: '', estimate: '', photoUrl: '' });
const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';

/** Request products that are not in the store. A runner or operator replies with the price. */
export const RequestTab: React.FC<RequestTabProps> = ({
  defaultSide,
  outside,
  initialName,
  myRequests,
  cartRequestIds,
  onSubmit,
  onAddQuoteToCart,
}) => {
  const [side, setSide] = useState<RequestSide>(defaultSide);
  const [items, setItems] = useState<RequestItemInput[]>([{ ...blank(), name: initialName || '' }]);
  const [note, setNote] = useState('');
  const [addToCart, setAddToCart] = useState(true);
  const [uploading, setUploading] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => setSide(defaultSide), [defaultSide]);

  const setItem = (i: number, patch: Partial<RequestItemInput>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const addPhoto = async (i: number, file?: File) => {
    if (!file) return;
    setUploading(i);
    try {
      const url = await uploadProductImage(file);
      setItem(i, { photoUrl: url });
    } catch (e: any) {
      window.alert(e?.message || 'Photo upload failed. You can still send the request without it.');
    }
    setUploading(-1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = items.filter((it) => it.name.trim());
    if (!filled.length) {
      window.alert('Type the name of at least one product.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(side, filled, note, addToCart);
      setItems([blank()]);
      setNote('');
      setSent(true);
      setTimeout(() => setSent(false), 6000);
    } catch (err: any) {
      window.alert(err?.message || 'Could not send. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-[#0e9f55]">
          <Sparkles className="w-5 h-5" />
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Request a product</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Can't find it? Tell us what you want. The first {outside ? 'operator' : 'runner'} to reply sends you the price, and the product is added to the store.
        </p>

        {outside && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(['store', 'food'] as RequestSide[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${side === s ? 'bg-white dark:bg-slate-900 text-[#0e9f55]' : 'text-slate-500'}`}
              >
                {s === 'store' ? 'Store items' : 'Cooked food & drinks'}
              </button>
            ))}
          </div>
        )}

        {items.map((it, i) => (
          <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Product {i + 1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Remove product">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} maxLength={80} className={input} placeholder="Product name, e.g. Nutri Milk 1L" />
            <input
              type="number"
              inputMode="numeric"
              value={it.estimate}
              onChange={(e) => setItem(i, { estimate: e.target.value })}
              className={input}
              placeholder="Estimated price (₦), your guess"
            />
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
              <Camera className="w-4 h-4 text-[#0e9f55]" />
              <span>{uploading === i ? 'Uploading photo…' : it.photoUrl ? 'Photo added (tap to change)' : 'Add a photo (optional)'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(i, e.target.files?.[0])} />
            </label>
            {it.photoUrl && <img src={it.photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItems((l) => [...l, blank()])}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add another product
        </button>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className={input} placeholder="Note (optional), e.g. brand, size, colour" />

        <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={addToCart} onChange={(e) => setAddToCart(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#0e9f55]" />
          <span>
            Also add to my cart. <span className="text-slate-500">Checkout stays locked until the price comes back, then your cart totals it up.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || uploading >= 0}
          className="w-full py-2.5 bg-[#0e9f55] hover:bg-[#0b8044] disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer"
        >
          {busy ? 'Sending…' : `Send request to ${SIDE_LABEL[side]}`}
        </button>
        {sent && <p className="text-xs text-[#0e9f55] font-semibold text-center">Sent. You'll see the price below as soon as someone replies.</p>}
      </form>

      {/* Waiting for a price: install the app or turn on notifications, or check back before the next batch */}
      {(sent || myRequests.some((r) => r.status === 'open')) && <InstallPrompt />}

      {myRequests.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">My product requests</h3>
          {myRequests.map((r) => (
            <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">{SIDE_LABEL[r.side as RequestSide] || ''}</span>
                {r.status === 'open' ? (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                    <Clock className="w-3 h-3" /> Waiting for a price
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[#0e9f55] font-bold text-[11px]">
                    <Check className="w-3 h-3" /> Priced{r.quotedBy?.name ? ` by ${r.quotedBy.name}` : ''}
                  </span>
                )}
              </div>
              {(r.status === 'quoted' ? r.quotes : r.items).map((q: any, i: number) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{q.name}</span>
                  <span className="font-bold shrink-0">
                    {r.status !== 'quoted' ? (r.items[i].estimate ? `~₦${Number(r.items[i].estimate).toLocaleString()}` : '') : q.available ? `₦${q.price.toLocaleString()}` : 'Not available'}
                  </span>
                </div>
              ))}
              {r.status === 'quoted' && r.quotes.some((q: any) => q.available) && !cartRequestIds.has(r.id) && (
                <button
                  type="button"
                  onClick={() => onAddQuoteToCart(r)}
                  className="w-full py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold cursor-pointer"
                >
                  Add to cart
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
