import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Loader2, Plus, X, Check } from 'lucide-react';
import { HOSTELS } from '../config';
import { uploadProductImage } from '../api.js';
import { submitShopApplication, hostelLabel } from '../shops.js';

const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const rowInput = input.replace('w-full ', '');
const label = 'block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1';

interface Row {
  name: string;
  price: string;
  priceFrom: boolean;
}

/** "List your business": a vendor or service provider applies. It lands in the admin console under Applications. */
export const ListBusiness: React.FC<{ startKind?: 'vendor' | 'service'; startHostel?: string; onClose: () => void }> = ({ startKind = 'vendor', startHostel = '', onClose }) => {
  const [kind, setKind] = useState<'vendor' | 'service'>(startKind);
  const [name, setName] = useState('');
  const [hostel, setHostel] = useState(HOSTELS.includes(startHostel) ? startHostel : '');
  const [room, setRoom] = useState('');
  const [showRoom, setShowRoom] = useState(false);
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { name: '', price: '', priceFrom: false },
    { name: '', price: '', priceFrom: false },
    { name: '', price: '', priceFrom: false },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const isService = kind === 'service';

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError('');
    setUploading(true);
    try {
      const room3 = Math.max(0, 3 - photos.length);
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, room3)) urls.push(await uploadProductImage(f));
      setPhotos((p) => [...p, ...urls].slice(0, 3));
    } catch (e: any) {
      setError(e?.message || 'Photo upload failed. Try again.');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await submitShopApplication({
        kind,
        name,
        hostel,
        room,
        showRoom,
        phone,
        photos,
        items: rows.map((r) => ({ name: r.name, price: Number(r.price), priceFrom: r.priceFrom })),
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send. Check your network and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-[480px] mx-auto min-h-full px-4 pb-12">
        <div className="flex items-center gap-3 pt-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">List your business</h1>
        </div>

        {done ? (
          <div className="mt-6 rounded-2xl p-6 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
            <span className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
              <Check className="w-6 h-6 text-[#0e9f55]" />
            </span>
            <p className="mt-3 text-base font-black text-slate-900 dark:text-white">Application sent</p>
            <p className="mt-1 text-sm text-slate-500">Roomly will review it and message you on WhatsApp with your private link to edit your items and prices.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70">
              {(['vendor', 'service'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`py-2.5 rounded-xl text-sm font-bold cursor-pointer ${kind === k ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {k === 'vendor' ? 'I sell items' : 'I offer services'}
                </button>
              ))}
            </div>

            <div>
              <label className={label}>Your name</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Kene Obi" maxLength={60} />
              <p className="mt-1 text-[11px] text-slate-500">Your page shows your first name only: "{(name.trim().split(/\s+/)[0] || 'Kene')}'s {isService ? 'Services' : 'Items'}".</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Hostel</label>
                <select className={input} value={hostel} onChange={(e) => setHostel(e.target.value)}>
                  <option value="">Choose</option>
                  {HOSTELS.map((h: string) => (
                    <option key={h} value={h}>
                      {hostelLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Room</label>
                <input className={input} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B12" maxLength={20} />
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={showRoom} onChange={(e) => setShowRoom(e.target.checked)} className="w-4 h-4 accent-[#0e9f55]" />
              Show my room number on my page (you can change this later)
            </label>

            <div>
              <label className={label}>WhatsApp number</label>
              <input className={input} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678" maxLength={14} />
              <p className="mt-1 text-[11px] text-slate-500">Orders come to this number. Roomly never shows it on your page.</p>
            </div>

            <div>
              <label className={label}>{isService ? 'Your services and prices' : 'Your items and prices'}</label>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className={`${rowInput} flex-1 min-w-0`} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={isService ? 'Service' : 'Item'} maxLength={60} />
                    <input className={`${rowInput} w-24 shrink-0`} inputMode="numeric" value={r.price} onChange={(e) => setRow(i, { price: e.target.value.replace(/\D/g, '') })} placeholder="Price" />
                    {isService && (
                      <label className="shrink-0 flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={r.priceFrom} onChange={(e) => setRow(i, { priceFrom: e.target.checked })} className="accent-[#0e9f55]" />
                        from
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {rows.length < 30 && (
                <button type="button" onClick={() => setRows((r) => [...r, { name: '', price: '', priceFrom: false }])} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#0e9f55] cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add another
                </button>
              )}
            </div>

            <div>
              <label className={label}>Photos (at least one)</label>
              <div className="flex gap-2.5 flex-wrap">
                {photos.map((u, i) => (
                  <div key={u} className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => setPhotos((p) => p.filter((_, n) => n !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1 text-slate-500 text-[11px] font-bold cursor-pointer"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    {uploading ? 'Uploading' : 'Add'}
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              <p className="mt-1 text-[11px] text-slate-500">The first photo is your card photo. Use a real photo of your items or your work.</p>
            </div>

            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            <button type="button" disabled={busy || uploading} onClick={submit} className="w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Send for approval
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
