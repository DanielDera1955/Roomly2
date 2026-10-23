import React, { useEffect, useState } from 'react';
import {
  getProducts,
  getCategories,
  getCurrentStaff,
  sendCatalogRequest,
  subscribeMyCatalogRequests,
  subscribePendingCatalogRequests,
  decideCatalogRequest,
} from '../api.js';
import { sellingPrice } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

const statusPill = (s: string) =>
  s === 'approved'
    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
    : s === 'rejected'
    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';

/** Operators: ask for a price change on one of their products, or for a new product */
export const OperatorCatalogRequests: React.FC = () => {
  const staff = getCurrentStaff();
  const source = staff?.role === 'food' ? 'food' : 'outside';
  const [mode, setMode] = useState<'price' | 'new'>('price');
  const [mine, setMine] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeMyCatalogRequests(setMine), []);
  useEffect(() => {
    getProducts().then((list: any[]) => setProducts(list.filter((p) => p.source === source)));
    getCategories().then((list: any[]) => setCategories(list.map((c) => c.name).filter((n: string) => n !== 'Request')));
  }, [source]);

  const chosen = products.find((p) => p.id === productId);
  const costNum = Math.round(Number(cost) || 0);

  const submit = async () => {
    setBusy(true);
    try {
      await sendCatalogRequest({
        type: mode,
        productId: mode === 'price' ? productId : '',
        productName: mode === 'price' ? chosen?.name : name,
        newCost: costNum,
        category: mode === 'new' ? category : '',
        unit,
        imageUrl,
        note,
      });
      setProductId('');
      setName('');
      setCost('');
      setNote('');
      setUnit('');
      setImageUrl('');
      window.alert('Sent to Roomly for approval.');
    } catch (e: any) {
      window.alert(e?.message || 'Could not send.');
    }
    setBusy(false);
  };

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Products: request a change</span>
        <span className="text-xs font-bold text-[#0e9f55]">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(['price', 'new'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-1.5 rounded-xl text-xs font-bold cursor-pointer ${mode === m ? 'bg-white dark:bg-slate-900 text-[#0e9f55]' : 'text-slate-500'}`}
              >
                {m === 'price' ? 'Change a price' : "Add a product you sell that isn't in the store"}
              </button>
            ))}
          </div>

          {mode === 'price' ? (
            <div className="space-y-1.5">
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className={input}>
                <option value="">Choose one of your products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · now {naira(p.costPrice || 0)} cost / {naira(p.price)} to students
                  </option>
                ))}
              </select>
              {products.length === 0 && <p className="text-[11px] text-slate-400">You have no products in the catalog yet. Use "Add a new product".</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Product name, e.g. Peak Milk Tin 400g" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
                <option value="">Category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={input} placeholder="Size or unit (optional), e.g. 1 tin" />
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={input} placeholder="Photo link (optional)" />
            </div>
          )}

          <input
            type="number"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className={input}
            placeholder={mode === 'price' ? 'New cost price you pay (₦)' : 'Cost price you pay (₦)'}
          />
          {costNum > 0 && (
            <p className="text-[11px] text-slate-500">
              Students would pay {naira(sellingPrice(costNum, source as any))}
              {mode === 'price' && chosen ? ` (now ${naira(chosen.price)})` : ''}.
            </p>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={input} placeholder="Reason or note (optional)" />
          <button
            type="button"
            disabled={busy || costNum <= 0 || (mode === 'price' ? !productId : !name.trim())}
            onClick={submit}
            className="w-full py-2 rounded-lg bg-[#0e9f55] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
          >
            Send for approval
          </button>

          {mine.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold text-slate-500">My requests</p>
              {mine.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    {r.type === 'price' ? 'Price: ' : 'New: '}
                    <strong>{r.productName}</strong> · {naira(r.newCost)} cost
                    {r.adminNote ? <span className="block text-[11px] text-slate-500">Roomly: {r.adminNote}</span> : null}
                  </span>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusPill(r.status)}`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Admin: approve or reject operators' requests. Approving updates the catalog with the margin added. */
export const AdminCatalogRequests: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [list, setList] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => subscribePendingCatalogRequests(setList), []);

  const decide = async (r: any, approve: boolean) => {
    setBusy(r.id);
    try {
      await decideCatalogRequest(r, approve, notes[r.id] || '');
      if (onChanged) onChanged();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  if (list.length === 0) return null;

  return (
    <div className={card}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Requests from operators ({list.length})</p>
      {list.map((r) => (
        <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">
              {r.type === 'price' ? 'Price change' : 'New product'}: {r.productName}
            </p>
            <p className="text-[11px] text-slate-500">
              From {r.operatorName} ({r.kind === 'food' ? 'food' : 'store'})
              {r.category ? ` · ${r.category}` : ''}
              {r.unit ? ` · ${r.unit}` : ''}
            </p>
          </div>
          <p>
            {r.type === 'price' ? (
              <>
                Cost {naira(r.currentCost)} → <strong>{naira(r.newCost)}</strong>. Students pay {naira(r.currentPrice)} →{' '}
                <strong>{naira(sellingPrice(r.newCost, r.source))}</strong>
              </>
            ) : (
              <>
                Cost <strong>{naira(r.newCost)}</strong>. Students would pay <strong>{naira(sellingPrice(r.newCost, r.source))}</strong>
              </>
            )}
          </p>
          {r.note && <p className="text-[11px] text-slate-500">Note: {r.note}</p>}
          <input
            value={notes[r.id] || ''}
            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
            className={input}
            placeholder="Reply to the operator (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r, true)}
              className="py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r, false)}
              className="py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
