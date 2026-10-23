import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import {
  getProductsFresh,
  getCategories,
  getCurrentStaff,
  operatorSetPrice,
  operatorAddProduct,
  runnerSetStock,
  uploadProductImage,
} from '../api.js';
import { sellingPrice, categoriesForStore, STORE_SOURCE, StoreKey } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

/**
 * Store and food operators: their products. Change a cost price (the student price follows with your margin),
 * or add a product they sell. Both go live at once. They cannot delete products, mark stock or edit categories.
 */
export const OperatorProductsPanel: React.FC = () => {
  const role = getCurrentStaff()?.role;
  const store: StoreKey = role === 'food' ? 'food' : 'store';
  const source = STORE_SOURCE[store];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'prices' | 'add'>('prices');
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [newCost, setNewCost] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  // add form
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState('');
  const [unit, setUnit] = useState('');
  const [group, setGroup] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const [list, c] = await Promise.all([getProductsFresh(), getCategories()]);
    setProducts(list.filter((p: any) => p.source === source));
    setCats(categoriesForStore(c, store).map((x: any) => x.name));
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  const q = search.trim().toLowerCase();
  const shown = products.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category).toLowerCase().includes(q));
  const costNum = Math.round(Number(cost) || 0);

  const savePrice = async (p: any) => {
    setBusy(p.id);
    try {
      await operatorSetPrice(p.id, Number(newCost[p.id]));
      setNewCost((m) => ({ ...m, [p.id]: '' }));
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  const add = async () => {
    setBusy('add');
    try {
      await operatorAddProduct({ name, category, cost: costNum, unit, imageUrl, group });
      setGroup('');
      setName('');
      setCost('');
      setUnit('');
      setImageUrl('');
      window.alert('Added. Students can now order it.');
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not add.');
    }
    setBusy('');
  };

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">My products and prices</span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(['prices', 'add'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-1.5 rounded-xl text-[11px] font-bold cursor-pointer ${mode === m ? 'bg-white dark:bg-slate-900 text-[#0e9f55]' : 'text-slate-500'}`}
              >
                {m === 'prices' ? 'Change prices' : "Add a product you sell that isn't in the store"}
              </button>
            ))}
          </div>

          {mode === 'prices' ? (
            <div className="space-y-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder="Search your products" />
              {shown.length === 0 && <p className="text-xs text-slate-400">No products yet.</p>}
              {shown.slice(0, 40).map((p) => {
                const c = Math.round(Number(newCost[p.id]) || 0);
                return (
                  <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold truncate">{p.name}</span>
                      <span className="shrink-0 text-slate-500">
                        cost {naira(p.costPrice)} · students {naira(p.price)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={newCost[p.id] || ''}
                        onChange={(e) => setNewCost((m) => ({ ...m, [p.id]: e.target.value }))}
                        className={input}
                        placeholder="New cost price (₦)"
                      />
                      <button
                        type="button"
                        disabled={busy === p.id || c <= 0}
                        onClick={() => savePrice(p)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                    {c > 0 && <p className="text-[11px] text-slate-500">Students will pay {naira(sellingPrice(c, source))}</p>}
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-400">You enter your cost price; Roomly's margin is added automatically. Changes go live at once.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} placeholder="Product name, e.g. Rice (1 paint)" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
                <option value="">No category (shows under All)</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input type="number" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className={input} placeholder="Your cost price (₦)" />
              {costNum > 0 && (
                <p className="text-[11px] text-slate-500">
                  Students will pay <strong>{naira(sellingPrice(costNum, source))}</strong>
                </p>
              )}
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={input} placeholder="Size or unit (optional)" />
              <input
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                list="op-groups"
                maxLength={40}
                className={input}
                placeholder="Group, e.g. Soft Drinks (similar items show together)"
              />
              <datalist id="op-groups">
                {Array.from(new Set(products.map((p) => p.subcategory).filter((g) => g && g !== 'All'))).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                <Camera className="w-4 h-4 text-[#0e9f55]" />
                <span>{uploading ? 'Uploading…' : imageUrl ? 'Photo added (tap to change)' : 'Add a photo (optional)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    try {
                      setImageUrl(await uploadProductImage(f));
                    } catch (err: any) {
                      window.alert(err?.message || 'Photo upload failed.');
                    }
                    setUploading(false);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy === 'add' || uploading || !name.trim() || costNum <= 0}
                onClick={add}
                className="w-full py-2 rounded-lg bg-[#0e9f55] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Add to the store
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Runners: switch inside-school items in or out of stock (out of stock hides them from students) */
export const RunnerStockPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const list = await getProductsFresh();
    setProducts(list.filter((p: any) => p.source !== 'outside' && p.source !== 'food'));
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  const q = search.trim().toLowerCase();
  const shown = products
    .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category).toLowerCase().includes(q))
    .sort((a, b) => Number(a.isAvailable !== false) - Number(b.isAvailable !== false));
  const outCount = products.filter((p) => p.isAvailable === false).length;

  const toggle = async (p: any) => {
    setBusy(p.id);
    try {
      await runnerSetStock(p.id, p.isAvailable === false);
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Inside items: in stock ({outCount} out)</span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder="Search inside items" />
          {shown.slice(0, 60).map((p) => {
            const inStock = p.isAvailable !== false;
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                <span className="min-w-0 truncate">
                  <strong>{p.name}</strong> <span className="text-slate-500">· {naira(p.price)}</span>
                </span>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => toggle(p)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg font-bold cursor-pointer disabled:opacity-40 ${
                    inStock ? 'bg-[#0e9f55] text-white' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {inStock ? 'In stock' : 'Out of stock'}
                </button>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">Tap to switch. Out-of-stock items are hidden from students until you switch them back.</p>
        </div>
      )}
    </div>
  );
};
