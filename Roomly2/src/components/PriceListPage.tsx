import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, X, Camera, Loader2, Pencil } from 'lucide-react';
import {
  getPriceLink,
  getProducts,
  subscribeLinkPrices,
  subscribeLinkNewItems,
  setLinkPrice,
  saveLinkNewItem,
  deleteLinkNewItem,
  saveLinkNote,
} from '../api.js';
import { NoPhoto } from './NoPhoto';

/**
 * A supplier's private price list (?prices=<token>). Photo, name, one price box per item.
 * Empty box = skipped. Saves as they type. Never shows Roomly's prices or margin.
 */
export const PriceListPage: React.FC<{ token: string }> = ({ token }) => {
  const [link, setLink] = useState<any>(undefined);
  const [products, setProducts] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [newItems, setNewItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<any>(null);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    getPriceLink(token).then((l) => setLink(l || null)).catch(() => setLink(null));
    getProducts().then((p: any[]) => setProducts(p || [])).catch(() => setProducts([]));
  }, [token]);
  useEffect(() => subscribeLinkPrices(token, setPrices), [token]);
  useEffect(() => subscribeLinkNewItems(token, setNewItems), [token]);

  // Inside-school store items, limited to the categories chosen for this supplier
  const items = useMemo(() => {
    const cats: string[] = link?.categories || [];
    return products
      .filter((p) => (!p.source || p.source === 'school') && !p.isFood)
      .filter((p) => !cats.length || cats.includes(p.category))
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
  }, [products, link]);

  if (link === undefined) return <Shell><p className="text-center text-slate-500 py-20">Loading...</p></Shell>;
  if (!link || !link.active)
    return (
      <Shell>
        <p className="text-center text-slate-700 py-20 text-lg font-bold">This price list is closed.</p>
        <p className="text-center text-slate-500">Please contact Roomly if you still want to add prices.</p>
      </Shell>
    );

  const done = items.filter((p) => prices[p.id]?.price > 0).length;
  const query = q.trim().toLowerCase();
  const shown = items.filter((p) => (tab === 'all' || prices[p.id]?.price > 0) && (!query || String(p.name).toLowerCase().includes(query)));
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  let lastCat = '';

  return (
    <Shell>
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#0e9f55]">Roomly</p>
        <h1 className="text-2xl font-black text-slate-900">Price list for {link.name}</h1>
        <p className="text-base text-slate-600">Type your price for each item you sell. Leave it empty to skip.</p>
        <p className="text-sm text-slate-500">Everything saves by itself.</p>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-sm font-bold text-slate-700">
          <span>
            {done} of {items.length} priced
          </span>
          <span>{newItems.length ? `${newItems.length} added by you` : ''}</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-[#0e9f55] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 -mx-3 px-3 pt-3 pb-2 bg-[#f4f8f6] space-y-2">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-slate-200">
          {(
            [
              ['all', `All items (${items.length})`],
              ['mine', `My prices (${done + newItems.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-12 rounded-xl text-base font-bold cursor-pointer ${tab === id ? 'bg-[#0e9f55] text-white' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-12 pl-11 pr-10 text-base bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30"
            placeholder="Find an item"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Items she added */}
      {tab === 'mine' && newItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-black text-slate-700 pt-2">Items you added</p>
          {newItems.map((it) => (
            <div key={it.id} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <Thumb src={it.photo} name={it.name} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900 leading-tight">{it.name}</p>
                {it.size && <p className="text-sm text-slate-500">{it.size}</p>}
                <p className="text-base font-black text-[#0e9f55]">₦{Number(it.price).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setAdding(it)} className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 flex items-center gap-1 cursor-pointer">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The list */}
      <div className="space-y-2 pt-1">
        {shown.length === 0 && (
          <p className="text-center text-slate-500 py-10">{tab === 'mine' ? 'Nothing priced yet.' : 'No item matches.'}</p>
        )}
        {shown.map((p) => {
          const header = p.category !== lastCat && !query ? p.category : '';
          lastCat = p.category;
          return (
            <React.Fragment key={p.id}>
              {header && <p className="text-sm font-black uppercase tracking-wider text-slate-500 pt-3">{header}</p>}
              <PriceRow token={token} p={p} saved={prices[p.id]?.price || 0} />
            </React.Fragment>
          );
        })}
      </div>

      {/* Add a missing item */}
      <button
        type="button"
        onClick={() => setAdding({})}
        className="mt-5 w-full h-14 rounded-2xl border-2 border-dashed border-[#0e9f55] text-[#0e9f55] text-base font-bold flex items-center justify-center gap-2 cursor-pointer bg-white"
      >
        <Plus className="w-5 h-5" /> Add an item that's not here
      </button>

      <NoteBox token={token} initial={link.note || ''} />

      <p className="mt-6 text-center text-sm text-slate-500">Thank you. Roomly will check your prices and get back to you.</p>

      {adding && <AddItemSheet token={token} item={adding} onClose={() => setAdding(null)} />}
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#f4f8f6] text-slate-900">
    <div className="max-w-[520px] mx-auto px-3 py-6 pb-24">{children}</div>
  </div>
);

const Thumb: React.FC<{ src?: string; name: string }> = ({ src, name }) => {
  const [err, setErr] = useState(false);
  return src && !err ? (
    <img src={src} alt="" onError={() => setErr(true)} referrerPolicy="no-referrer" className="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200 shrink-0" />
  ) : (
    <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
      <NoPhoto name={name} className="text-2xl" />
    </div>
  );
};

/** One item: photo, name, size, price box. Saves a moment after she stops typing. */
const PriceRow: React.FC<{ token: string; p: any; saved: number }> = ({ token, p, saved }) => {
  const [val, setVal] = useState(saved ? String(saved) : '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<number | null>(null);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setVal(saved ? String(saved) : '');
  }, [saved]);

  const change = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 7);
    setVal(clean);
    typing.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setState('saving');
      try {
        await setLinkPrice(token, p.id, Number(clean) || 0);
        setState('saved');
      } catch {
        setState('error');
      }
      typing.current = false;
    }, 700);
  };
  const filled = Number(val) > 0;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${filled ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}`}>
      <Thumb src={p.imageUrl} name={p.name} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-slate-900 leading-tight">{p.name}</p>
        {p.unit && <p className="text-sm text-slate-500">{p.unit}</p>}
        <p className="text-xs h-4 mt-0.5 text-slate-400">
          {state === 'saving' ? 'Saving...' : state === 'error' ? <span className="text-rose-600 font-bold">Not saved. Check your network.</span> : filled ? <span className="text-[#0e9f55] font-bold">Saved</span> : ''}
        </p>
      </div>
      <div className="relative w-28 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">₦</span>
        <input
          value={val}
          onChange={(e) => change(e.target.value)}
          inputMode="numeric"
          aria-label={`Price for ${p.name}`}
          className={`w-full h-12 pl-8 pr-8 text-lg font-black rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/40 ${filled ? 'border-[#0e9f55] bg-white' : 'border-slate-300 bg-slate-50'}`}
          placeholder=""
        />
        {filled && <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#0e9f55]" />}
      </div>
    </div>
  );
};

const AddItemSheet: React.FC<{ token: string; item: any; onClose: () => void }> = ({ token, item, onClose }) => {
  const [name, setName] = useState(item.name || '');
  const [price, setPrice] = useState(item.price ? String(item.price) : '');
  const [size, setSize] = useState(item.size || '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'w-full h-12 px-3 text-base bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await saveLinkNewItem(token, { id: item.id, name, price, size, photoFile: file, photo: item.photo });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your network and try again.');
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm('Remove this item?')) return;
    await deleteLinkNewItem(token, item.id).catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[520px] max-h-[92vh] overflow-y-auto bg-[#f4f8f6] rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{item.id ? 'Edit item' : 'Add an item'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <label className="block">
          <span className="block text-base font-bold text-slate-800 mb-1">Item name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} placeholder="e.g. Peak milk sachet" />
        </label>
        <label className="block">
          <span className="block text-base font-bold text-slate-800 mb-1">Price (₦)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" className={`${field} text-lg font-black`} placeholder="e.g. 150" />
        </label>
        <label className="block">
          <span className="block text-base font-bold text-slate-800 mb-1">
            Size <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input value={size} onChange={(e) => setSize(e.target.value)} maxLength={40} className={field} placeholder="e.g. small, 50cl" />
        </label>
        <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-300 cursor-pointer">
          <Camera className="w-6 h-6 text-[#0e9f55]" />
          <span className="text-base text-slate-700">
            {file ? file.name : item.photo ? 'Change photo' : 'Add photo'} <span className="text-slate-400">(optional)</span>
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {error && <p className="text-base font-semibold text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={busy || !name.trim() || !(Number(price) > 0)}
          onClick={save}
          className="w-full h-14 rounded-2xl bg-[#0e9f55] text-white text-lg font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy && <Loader2 className="w-5 h-5 animate-spin" />} Save
        </button>
        {item.id && (
          <button type="button" onClick={remove} className="w-full text-base font-bold text-rose-600 cursor-pointer">
            Remove this item
          </button>
        )}
      </div>
    </div>
  );
};

const NoteBox: React.FC<{ token: string; initial: string }> = ({ token, initial }) => {
  const [note, setNote] = useState(initial);
  const [state, setState] = useState('');
  const timer = useRef<number | null>(null);
  const change = (v: string) => {
    setNote(v.slice(0, 500));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await saveLinkNote(token, v.slice(0, 500));
        setState('Saved');
      } catch {
        setState('Not saved. Check your network.');
      }
    }, 900);
  };
  return (
    <div className="mt-5 space-y-1.5">
      <p className="text-base font-bold text-slate-800">
        Anything to tell Roomly? <span className="font-normal text-slate-400">(optional)</span>
      </p>
      <textarea
        value={note}
        onChange={(e) => change(e.target.value)}
        rows={3}
        className="w-full px-3 py-2.5 text-base bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30"
        placeholder="e.g. a price is changing soon"
      />
      {state && <p className="text-sm text-slate-500">{state}</p>}
    </div>
  );
};
