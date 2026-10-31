import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { sellingPrice, categoriesForStore } from '../config';
import {
  createPriceLink,
  subscribePriceLinks,
  setPriceLinkActive,
  deletePriceLink,
  subscribeLinkPrices,
  subscribeLinkNewItems,
  applySupplierCosts,
  addSupplierItem,
  getProductsFresh,
} from '../api.js';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50';
const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const linkUrl = (token: string) => `${window.location.origin}/?prices=${token}`;

/**
 * Admin > Products > Supplier price lists.
 * Make a private link per supplier, see their prices next to the store's, and apply them (margin added).
 */
export const AdminPriceLists: React.FC<{ categories: any[] }> = ({ categories }) => {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [all, setAll] = useState<Record<string, Record<string, any>>>({});
  const [name, setName] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [copied, setCopied] = useState('');
  const insideCats = useMemo(() => categoriesForStore(categories || [], 'inside').map((c: any) => c.name).filter((n: string) => n.toLowerCase() !== 'food'), [categories]);

  useEffect(() => subscribePriceLinks(setLinks), []);
  const reload = () => getProductsFresh().then((p: any[]) => setProducts(p || [])).catch(() => {});
  useEffect(() => {
    if (open) reload();
  }, [open]);
  // Every supplier's prices, for side-by-side comparison
  useEffect(() => {
    const subs = links.map((l) => subscribeLinkPrices(l.id, (m: any) => setAll((prev) => ({ ...prev, [l.id]: m }))));
    return () => subs.forEach((u) => u());
  }, [links.map((l) => l.id).join(',')]);

  const create = async () => {
    if (!name.trim()) return window.alert("Type the supplier's name.");
    await createPriceLink(name, cats);
    setName('');
    setCats([]);
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      setCopied(token);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Copy this link:', linkUrl(token));
    }
  };

  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Supplier price lists ({links.length})</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500">
            Send each supplier their own link. They see photos and type their prices; they never see Roomly's prices or margin. Nothing changes in the store
            until you apply it.
          </p>

          {/* New link */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white">New price list</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Supplier name, e.g. Jennifer" />
            <p className="text-[11px] text-slate-500">Categories they see (none ticked = all inside store items)</p>
            <div className="flex flex-wrap gap-1.5">
              {insideCats.map((c: string) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}
                  className={`${btn} border ${cats.includes(c) ? 'border-[#0e9f55] text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button type="button" onClick={create} className={`${btn} bg-[#0e9f55] text-white`}>
              Create link
            </button>
          </div>

          {links.map((l) => (
            <SupplierList
              key={l.id}
              link={l}
              products={products}
              all={all}
              links={links}
              categories={insideCats}
              copied={copied === l.id}
              onCopy={() => copy(l.id)}
              onApplied={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SupplierList: React.FC<{
  link: any;
  products: any[];
  all: Record<string, Record<string, any>>;
  links: any[];
  categories: string[];
  copied: boolean;
  onCopy: () => void;
  onApplied: () => void;
}> = ({ link, products, all, links, categories, copied, onCopy, onApplied }) => {
  const [open, setOpen] = useState(false);
  const [newItems, setNewItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [catFor, setCatFor] = useState<Record<string, string>>({});
  useEffect(() => subscribeLinkNewItems(link.id, setNewItems), [link.id]);
  const mine = all[link.id] || {};
  const others = links.filter((x) => x.id !== link.id);
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const rows = Object.entries(mine)
    .map(([pid, v]: [string, any]) => {
      const p = byId[pid];
      if (!p) return null;
      const theirs = others.map((o) => ({ name: o.name, price: Number(all[o.id]?.[pid]?.price) || 0 })).filter((x) => x.price > 0);
      const highest = Math.max(Number(v.price) || 0, ...theirs.map((x) => x.price));
      return { p, price: Number(v.price) || 0, theirs, highest };
    })
    .filter(Boolean) as { p: any; price: number; theirs: { name: string; price: number }[]; highest: number }[];
  rows.sort((a, b) => String(a.p.category).localeCompare(String(b.p.category)) || String(a.p.name).localeCompare(String(b.p.name)));
  const waitingNew = newItems.filter((i) => !i.added);
  const changed = rows.filter((r) => Number(r.p.costPrice || 0) !== r.highest);

  const apply = async (list: { id: string; cost: number }[]) => {
    setBusy(true);
    try {
      const n = await applySupplierCosts(list);
      onApplied();
      if (list.length > 1) window.alert(`Applied ${n} price${n === 1 ? '' : 's'}.`);
    } catch (e: any) {
      window.alert(e?.message || 'Could not apply.');
    }
    setBusy(false);
  };
  const addItem = async (it: any) => {
    const cat = catFor[it.id];
    if (!cat) return window.alert('Pick a category first.');
    setBusy(true);
    try {
      await addSupplierItem(link.id, it, cat);
      onApplied();
    } catch (e: any) {
      window.alert(e?.message || 'Could not add.');
    }
    setBusy(false);
  };

  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start justify-between gap-2 text-left cursor-pointer">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {link.name} {!link.active && <span className="text-[10px] font-bold text-rose-600">· closed</span>}
          </p>
          <p className="text-[11px] text-slate-500">
            {rows.length} priced · {waitingNew.length} new item{waitingNew.length === 1 ? '' : 's'} · {changed.length} to apply
            {link.categories?.length ? ` · ${link.categories.join(', ')}` : ' · all categories'}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onCopy} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center gap-1`}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={() => setPriceLinkActive(link.id, !link.active)} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
          {link.active ? 'Close link' : 'Reopen link'}
        </button>
        <button
          type="button"
          onClick={() => window.confirm(`Delete ${link.name}'s list? Their link stops working.`) && deletePriceLink(link.id)}
          className={`${btn} text-rose-600`}
        >
          Delete
        </button>
      </div>

      {open && (
        <div className="space-y-3 pt-1">
          {link.note && (
            <p className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
              <strong>Their note:</strong> {link.note}
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-700 dark:text-slate-200">Their prices</p>
                {changed.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => apply(changed.map((r) => ({ id: r.p.id, cost: r.highest })))} className={`${btn} bg-[#0e9f55] text-white`}>
                    Apply all ({changed.length})
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                Cost = their price. Sells at = cost with Roomly's margin. Apply all uses the higher price when another supplier also priced the item.
              </p>
              {rows.map((r) => {
                const now = Number(r.p.price) || 0;
                const same = Number(r.p.costPrice || 0) === r.price;
                return (
                  <div key={r.p.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">{r.p.name}</p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {link.name} {naira(r.price)} → sells at <strong>{naira(sellingPrice(r.price, 'school'))}</strong>
                      <span className="text-slate-400"> · now {now ? naira(now) : 'not priced'}</span>
                    </p>
                    {r.theirs.length > 0 && (
                      <p className="text-slate-500">
                        {r.theirs.map((t) => `${t.name} ${naira(t.price)}`).join(' · ')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {same ? (
                        <span className="text-[11px] font-bold text-[#0e9f55]">In use</span>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => apply([{ id: r.p.id, cost: r.price }])} className={`${btn} bg-[#0e9f55] text-white`}>
                          Use {naira(r.price)}
                        </button>
                      )}
                      {r.theirs.map((t) => (
                        <button key={t.name} type="button" disabled={busy} onClick={() => apply([{ id: r.p.id, cost: t.price }])} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                          Use {t.name}'s {naira(t.price)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {waitingNew.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-bold text-slate-700 dark:text-slate-200">New items they added</p>
              {waitingNew.map((it) => (
                <div key={it.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex gap-2.5">
                  {it.photo ? <img src={it.photo} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" /> : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {it.name} {it.size ? <span className="font-normal text-slate-500">({it.size})</span> : null}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {naira(it.price)} → sells at <strong>{naira(sellingPrice(Number(it.price), 'school'))}</strong>
                    </p>
                    <div className="flex gap-1.5">
                      <select value={catFor[it.id] || ''} onChange={(e) => setCatFor({ ...catFor, [it.id]: e.target.value })} className={`${input} py-1 text-xs`}>
                        <option value="">Category</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={busy} onClick={() => addItem(it)} className={`${btn} bg-[#0e9f55] text-white shrink-0`}>
                        Add to store
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rows.length === 0 && waitingNew.length === 0 && <p className="text-slate-400">No prices yet.</p>}
        </div>
      )}
    </div>
  );
};
