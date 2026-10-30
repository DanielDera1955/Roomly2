import React, { useEffect, useState } from 'react';
import { NoPhoto } from './NoPhoto';
import { Camera, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  getProductsFresh,
  getCategories,
  getCurrentStaff,
  operatorSetPrice,
  operatorAddProduct,
  runnerSetStock,
  operatorSetStock,
  setOptionStock,
  operatorSaveFoodOptions,
  uploadProductImage,
} from '../api.js';
import { auth } from '../firebase';
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
  const store: StoreKey = role === 'food' ? 'food' : role === 'runner' ? 'inside' : 'store';
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

  // This operator's own price on a product (what they set, or what they entered when they added it)
  const uidNow = auth.currentUser?.uid || '';
  const myCost = (p: any): number => Number((p.opCosts && p.opCosts[uidNow]) || (p.addedByUid && p.addedByUid === uidNow ? p.costPrice : 0)) || 0;
  const pricedCount = products.filter((p) => myCost(p) > 0).length;
  const [catFilter, setCatFilter] = useState('All');
  const [needsOnly, setNeedsOnly] = useState(false);
  const [visible, setVisible] = useState(20);

  const q = search.trim().toLowerCase();
  const shown = products
    .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category).toLowerCase().includes(q))
    .filter((p) => catFilter === 'All' || p.category === catFilter)
    .filter((p) => !needsOnly || !myCost(p));
  useEffect(() => setVisible(20), [search, catFilter, needsOnly]);
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

  // "Correct": the price Roomly entered is right, so it becomes this operator's own price
  const keepPrice = async (p: any) => {
    setBusy(p.id);
    try {
      await operatorSetPrice(p.id, Number(p.costPrice));
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      setImageUrl(await uploadProductImage(f));
    } catch (err: any) {
      window.alert(err?.message || 'Photo upload failed. You can still add the product without it.');
    }
    setUploading(false);
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
      window.alert(`Added. Students can now order it${imageUrl ? ', with your photo' : ''}.`);
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
              {/* Progress: how many prices this operator has set themselves */}
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-800 dark:text-slate-100">
                    {pricedCount} of {products.length} prices set by you
                  </span>
                  <span className="text-[#0e9f55]">{products.length ? Math.round((pricedCount / products.length) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 overflow-hidden">
                  <div className="h-full bg-[#0e9f55]" style={{ width: `${products.length ? (pricedCount / products.length) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Items you haven't set yet use the price Roomly entered. Tap Correct if it's right, or type your price and Save.
                </p>
              </div>

              <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder="Search your products" />
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {['All', ...cats.filter((c) => products.some((p) => p.category === c))].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCatFilter(c)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      catFilter === c ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} className="accent-[#0e9f55]" />
                Only show items that need my price ({products.length - pricedCount})
              </label>

              {shown.length === 0 && <p className="text-xs text-slate-400">{products.length ? 'Nothing matches.' : 'No products yet.'}</p>}
              {shown.slice(0, visible).map((p) => {
                const c = Math.round(Number(newCost[p.id]) || 0);
                const mine = myCost(p);
                const current = Number(p.costPrice) || 0;
                return (
                  <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                    <div className="flex gap-2.5">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" className="w-14 h-14 rounded-lg object-cover shrink-0 bg-white dark:bg-slate-900" />
                      ) : (
                        <span className="w-14 h-14 rounded-lg shrink-0 bg-white dark:bg-slate-900 flex items-center justify-center text-2xl"><NoPhoto name={p.name} /></span>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-bold text-slate-900 dark:text-white leading-snug">{p.name}</p>
                        <p className="text-[11px] text-slate-500">{[p.unit, p.category].filter(Boolean).join(' · ')}</p>
                        {mine ? (
                          <p className="text-[11px] font-semibold text-[#0b8044] dark:text-[#34d27b]">
                            Your price {naira(mine)} · Students pay {naira(p.price)}
                          </p>
                        ) : (
                          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            Not set by you{current ? ` · Roomly's price ${naira(current)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={newCost[p.id] || ''}
                        onChange={(e) => setNewCost((m) => ({ ...m, [p.id]: e.target.value }))}
                        className={input}
                        placeholder={mine ? 'New price (₦)' : 'Your price (₦)'}
                      />
                      <button
                        type="button"
                        disabled={busy === p.id || c <= 0}
                        onClick={() => savePrice(p)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
                      >
                        Save
                      </button>
                      {!mine && current > 0 && !c && (
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => keepPrice(p)}
                          className="shrink-0 px-3 py-1.5 rounded-lg border border-[#0e9f55] text-[#0e9f55] font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Correct
                        </button>
                      )}
                    </div>
                    {role === 'food' && p.isFood && <OperatorFoodOptions p={p} onSaved={load} />}
                    {c > 0 && (() => {
                      // Students pay one price, from the highest cost any operator entered
                      const me = auth.currentUser?.uid || '';
                      const others: number[] = Object.entries((p.opCosts || {}) as Record<string, number>).filter(([uid]) => uid !== me).map(([, v]) => Number(v) || 0);
                      const top = Math.max(c, ...others);
                      return (
                        <p className="text-[11px] text-slate-500">
                          Students will pay {naira(sellingPrice(top, source))}
                          {top > c ? ' (another operator has a higher cost, so the price follows theirs; your orders are settled at your cost)' : ''}
                        </p>
                      );
                    })()}
                  </div>
                );
              })}
              {shown.length > visible && (
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + 20)}
                  className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Show 20 more ({shown.length - visible} left)
                </button>
              )}
              <p className="text-[11px] text-slate-400">You enter your own price. Students see one price, worked out from the highest price any operator entered; your orders are settled at your price. Changes go live at once.</p>
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
              {/* Photo: a clear preview and tick once it has uploaded */}
              {imageUrl && !uploading ? (
                <div className="flex items-center gap-3 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
                  <img src={imageUrl} alt="Product photo" className="w-14 h-14 rounded-lg object-cover border border-emerald-200 dark:border-emerald-800 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-xs font-bold text-[#0e9f55]">
                      <CheckCircle2 className="w-4 h-4" /> Photo uploaded
                    </p>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline cursor-pointer">
                      Change photo
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                    </label>
                  </div>
                  <button type="button" onClick={() => setImageUrl('')} aria-label="Remove photo" className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-xs font-semibold cursor-pointer ${
                    uploading ? 'border-[#0e9f55] text-[#0e9f55]' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-[#0e9f55]" />}
                  <span>{uploading ? 'Uploading photo… please wait' : 'Add a photo (optional)'}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => pickPhoto(e.target.files?.[0])} />
                </label>
              )}
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

/** "Name, cost" per line -> [{ name, cost }] */
const parseLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().match(/^(.+?)[,\s]+₦?([\d,]+)$/))
    .filter(Boolean)
    .map((m) => ({ name: m![1].trim().replace(/[,\s]+$/, ''), cost: Number(m![2].replace(/,/g, '')) }));
const linesOf = (list: any[] | undefined, uid: string) =>
  (list || []).map((o: any) => `${o.name}, ${(o.opCosts && o.opCosts[uid]) || o.cost || 0}`).join('\n');

/** Food operators: one food item's extras and pick-one choice, at THEIR cost */
const OperatorFoodOptions: React.FC<{ p: any; onSaved: () => void }> = ({ p, onSaved }) => {
  const uid = auth.currentUser?.uid || '';
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState(linesOf(p.extras, uid));
  const [title, setTitle] = useState(p.choiceTitle || '');
  const [choices, setChoices] = useState(linesOf(p.choices, uid));
  const [saving, setSaving] = useState(false);
  const preview = (text: string) =>
    parseLines(text)
      .map((x) => `${x.name} ${x.cost > 0 ? naira(sellingPrice(x.cost, 'food')) : 'free'}`)
      .join(' · ');
  const save = async () => {
    setSaving(true);
    try {
      await operatorSaveFoodOptions(p.id, parseLines(extras), title, parseLines(choices));
      setOpen(false);
      onSaved();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setSaving(false);
  };
  const count = (p.extras || []).length + (p.choices || []).length;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-bold text-[#0e9f55] cursor-pointer">
        Extras and swallow ({count}) ›
      </button>
    );
  return (
    <div className="space-y-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
      <p className="text-[11px] font-bold">Extras (one per line: name, your cost)</p>
      <textarea rows={4} value={extras} onChange={(e) => setExtras(e.target.value)} className={input} placeholder={'Chicken, 1200\nBeef, 400\nEgg, 250'} />
      {extras.trim() && <p className="text-[10px] text-slate-500">Students pay: {preview(extras)}</p>}
      <p className="text-[11px] font-bold pt-1">Pick one per plate (optional, e.g. swallow)</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="Title, e.g. Swallow" />
      <textarea rows={3} value={choices} onChange={(e) => setChoices(e.target.value)} className={input} placeholder={'Fufu, 0\nGarri, 0\nSemo, 100'} />
      {choices.trim() && <p className="text-[10px] text-slate-500">Students pay: {preview(choices)}</p>}
      <p className="text-[10px] text-slate-500">Use 0 for no extra charge. If another operator has a higher cost, students pay from theirs; your orders are settled at your cost.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold cursor-pointer">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer">
          Save
        </button>
      </div>
    </div>
  );
};

/**
 * Today's menu: switch products, extras and swallows on or off for today. Off = hidden from students.
 * Runners: inside items. Store and food operators: their own items.
 */
export const TodaysMenuPanel: React.FC<{ side: 'inside' | 'store' | 'food' }> = ({ side }) => {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const list = await getProductsFresh();
    setProducts(
      list.filter((p: any) => (side === 'inside' ? p.source !== 'outside' && p.source !== 'food' : p.source === STORE_SOURCE[side]))
    );
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  const q = search.trim().toLowerCase();
  const shown = products
    .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category).toLowerCase().includes(q))
    .sort((a, b) => Number(a.isAvailable !== false) - Number(b.isAvailable !== false));
  const outCount = products.filter((p) => p.isAvailable === false).length;
  const [menuVisible, setMenuVisible] = useState(20);
  useEffect(() => setMenuVisible(20), [search]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };
  const toggle = (p: any) =>
    run(p.id, () => (side === 'inside' ? runnerSetStock(p.id, p.isAvailable === false) : operatorSetStock(p.id, p.isAvailable === false)));
  const canOptions = side !== 'store';

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">
          Today's menu{side === 'inside' ? ': inside items' : ''} ({outCount} off)
        </span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder="Search items" />
          {shown.slice(0, menuVisible).map((p) => {
            const inStock = p.isAvailable !== false;
            const opts = canOptions
              ? [...(p.choices || []).map((o: any) => ({ ...o, kind: p.choiceTitle || 'Choice' })), ...(p.extras || []).map((o: any) => ({ ...o, kind: 'Extra' }))]
              : [];
            return (
              <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
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
                    {inStock ? 'On' : 'Off'}
                  </button>
                </div>
                {inStock && opts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {opts.map((o: any) => {
                      const key = `${p.id}:${o.id}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={busy === key}
                          onClick={() => run(key, () => setOptionStock(p.id, o.id, Boolean(o.off)))}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer disabled:opacity-40 ${
                            o.off
                              ? 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 line-through'
                              : 'border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                          }`}
                          title={o.kind}
                        >
                          {o.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {shown.length > menuVisible && (
            <button
              type="button"
              onClick={() => setMenuVisible((v) => v + 20)}
              className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Show 20 more ({shown.length - menuVisible} left)
            </button>
          )}
          <p className="text-[11px] text-slate-400">
            Tap to switch. Anything off stays hidden from students until you switch it back on, even on the next day.{canOptions ? ' Tap an extra or swallow (e.g. Fufu) to switch just that off.' : ''}
          </p>
        </div>
      )}
    </div>
  );
};

/** Runners: inside items (kept for the runner screen) */
export const RunnerStockPanel: React.FC = () => <TodaysMenuPanel side="inside" />;
