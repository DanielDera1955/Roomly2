import React, { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  subscribeShopApplications,
  subscribeAllShops,
  subscribeShopTokens,
  approveShopApplication,
  rejectShopApplication,
  setShopStatus,
  resetEditLink,
  getAdminShopStats,
  createShopDirect,
  confirmShop,
  adminRenameShop,
  adminRevertShopName,
  setShopNameLock,
} from '../shopsAdmin.js';
import { editLink, lagosDay, naira, shopTitle, hostelLabel, isShopStale, shopFreshAtMs, daysSince, SHOP_CONFIRM_DAYS } from '../shops.js';
import { HOSTELS } from '../config';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4';
const btn = 'h-9 px-3.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50';

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('Copy this link:', text);
  }
};

/** Count of new vendor and service applications, for the badge and the action board */
export function useNewShopApplications(): number {
  const [n, setN] = useState(0);
  useEffect(() => subscribeShopApplications((l: any[]) => setN(l.filter((a) => a.status === 'new').length)), []);
  return n;
}

const CopyButton: React.FC<{ link: string; label?: string }> = ({ link, label = 'Copy edit link' }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copy(link);
        setDone(true);
        window.setTimeout(() => setDone(false), 1800);
      }}
      className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 flex items-center gap-1.5`}
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
};


const field =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none';

/** One item per line: "Fried rice 1500" or "Barbing from 1000" */
function parseItems(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => {
      // "Sandals, Negotiable" (or no price at all) saves as price 0, shown as Negotiable on services
      const line = raw.replace(/[\s:,-]*\(?negotiable\)?\s*$/i, '').trim();
      const m = line.match(/^(.*?)[\s:,-]*(from\s+)?₦?\s*([\d,]+)\s*$/i);
      if (!m) return { name: line.replace(/[\s:,-]+$/, ''), price: 0, priceFrom: false };
      return { name: m[1].trim(), price: Number(m[3].replace(/,/g, '')), priceFrom: Boolean(m[2]) };
    });
}

/** Admin: create a vendor or service listing for a person who agreed, without an application */
const CreateShopForm: React.FC<{ onCreated: (id: string, link: string, name: string) => void }> = ({ onCreated }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'vendor' | 'service'>('vendor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hostel, setHostel] = useState('');
  const [room, setRoom] = useState('');
  const [showRoom, setShowRoom] = useState(true);
  const [itemsText, setItemsText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await createShopDirect({ kind, name, phone, hostel, room, showRoom, items: parseItems(itemsText), photoFile: photo, consent });
      onCreated(res.id, res.link, name);
      // Keep the type and hostel for the next one
      setName('');
      setPhone('');
      setRoom('');
      setItemsText('');
      setPhoto(null);
      setConsent(false);
    } catch (err: any) {
      setError(err?.message || 'Could not create it. Try again.');
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-[#0e9f55] text-white`}>
        Create vendor or service
      </button>
    );
  }
  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Create vendor or service</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold text-slate-400 cursor-pointer">
          Close
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['vendor', 'service'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-9 rounded-xl text-xs font-bold cursor-pointer ${kind === k ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
          >
            {k === 'vendor' ? 'Vendor (items)' : 'Service'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Their name" />
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={field} placeholder="WhatsApp number" />
        <select value={hostel} onChange={(e) => setHostel(e.target.value)} className={field}>
          <option value="">Hostel</option>
          {HOSTELS.map((h: string) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} className={field} placeholder="Room (optional)" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={showRoom} onChange={(e) => setShowRoom(e.target.checked)} />
        Show the room number on the listing
      </label>
      <div>
        <p className="text-[11px] font-bold text-slate-500 mb-1">{kind === 'service' ? 'Services, one per line with the price' : 'Items, one per line with the price'}</p>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={5}
          className={field}
          placeholder={kind === 'service' ? 'Low cut 500\nBraids from 3000' : 'Fried rice 1500\nBoiled eggs 200'}
        />
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-500 mb-1">Photo (optional)</p>
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="text-xs" />
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        This person agreed to be listed on Roomly.
      </label>
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className={`${btn} bg-[#0e9f55] text-white`}>
        {busy ? 'Creating...' : 'Create listing'}
      </button>
    </form>
  );
};

/** Admin > Applications: new vendor and service applications, and every live listing */
export const AdminShops: React.FC = () => {
  const [apps, setApps] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Record<string, { visits: number; orders: number }>>({});
  const [busy, setBusy] = useState('');
  // The link shown right after approving or resetting
  const [fresh, setFresh] = useState<Record<string, string>>({});

  useEffect(() => subscribeShopApplications(setApps), []);
  useEffect(() => subscribeAllShops(setShops), []);
  useEffect(() => subscribeShopTokens(setTokens), []);
  useEffect(() => {
    getAdminShopStats().then(setStats).catch(() => {});
  }, [shops.length]);

  const today = lagosDay();
  const pending = apps.filter((a) => a.status === 'new');
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not do that. Try again.');
    }
    setBusy('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Hostel Hub vendors and services</h2>

      <CreateShopForm onCreated={(id, link, name) => setFresh((f) => ({ ...f, [id]: link }))} />

      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">New applications ({pending.length})</h3>
        {pending.length === 0 && <p className="text-xs text-slate-400">No new applications.</p>}
        {pending.map((a) => (
          <div key={a.id} className={card}>
            <div className="flex items-start gap-3">
              {a.photos?.[0] && <img src={a.photos[0]} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {a.name} <span className="text-xs font-bold text-slate-500">({a.kind === 'service' ? 'services' : 'items'})</span>
                </p>
                <p className="text-xs text-slate-500">
                  {hostelLabel(a.hostel)}, room {a.room} · WhatsApp {a.phone}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {(a.items || []).map((i: any) => `${i.name} ${i.price > 0 ? `${i.priceFrom ? 'from ' : ''}${naira(i.price)}` : 'Negotiable'}`).join(', ')}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() =>
                  run(a.id, async () => {
                    const link = await approveShopApplication(a);
                    setFresh((f) => ({ ...f, [a.id]: link }));
                  })
                }
                className={`${btn} bg-[#0e9f55] text-white`}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() => window.confirm('Reject this application?') && run(a.id, () => rejectShopApplication(a.id))}
                className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {Object.entries(fresh).map(([id, link]) => (
          <div key={id} className="rounded-2xl p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Done. Send this private edit link to the vendor on WhatsApp. Do not post it anywhere.</p>
            <CopyButton link={link} label="Copy edit link" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Listings ({shops.length}
          {shops.filter((x) => x.status === 'live' && isShopStale(x)).length > 0 ? `, ${shops.filter((x) => x.status === 'live' && isShopStale(x)).length} need confirming` : ''})
        </h3>
        {shops.length === 0 && <p className="text-xs text-slate-400">No listings yet.</p>}
        {shops.map((s) => {
          const st = stats[s.id] || { visits: 0, orders: 0 };
          const edited = s.lastEditedAtMs && lagosDay(Number(s.lastEditedAtMs)) === today;
          const token = tokens[s.id];
          const live = s.status === 'live';
          return (
            <div key={s.id} className={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {shopTitle({ ...s })}
                    {edited && <span className="ml-2 text-[10px] font-extrabold uppercase text-[#0e9f55]">edited today</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {hostelLabel(s.hostel)} · {s.kind === 'service' ? 'Service' : 'Vendor'} · {live ? 'Live' : 'Hidden'}
                  </p>
                  {live && (
                    <p className={`text-xs mt-0.5 font-semibold ${isShopStale(s) ? 'text-rose-600' : 'text-slate-500'}`}>
                      {isShopStale(s)
                        ? `Hidden from students: not confirmed for ${SHOP_CONFIRM_DAYS}+ days`
                        : `Confirmed ${daysSince(shopFreshAtMs(s)) === 0 ? 'today' : `${daysSince(shopFreshAtMs(s))} days ago`}`}
                    </p>
                  )}
                  {(() => {
                    const hist: any[] = Array.isArray(s.nameHistory) ? s.nameHistory : [];
                    const last = hist[hist.length - 1];
                    if (!last) return null;
                    return (
                      <p className={`text-xs mt-0.5 font-semibold ${last.by === 'vendor' ? 'text-amber-600' : 'text-slate-500'}`}>
                        Name changed by {last.by === 'vendor' ? 'the vendor' : 'you'} on {new Date(Number(last.atMs)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, was "{last.from}"
                      </p>
                    );
                  })()}
                  <p className="text-xs text-slate-500 mt-0.5">
                    Last 7 days: {st.visits} {st.visits === 1 ? 'visit' : 'visits'}, {st.orders} {st.orders === 1 ? 'order' : 'orders'} sent
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => run(s.id, () => setShopStatus(s.id, live ? 'hidden' : 'live'))}
                  className={`${btn} ${live ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' : 'bg-[#0e9f55] text-white'}`}
                >
                  {live ? 'Hide listing' : 'Show listing'}
                </button>
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => {
                    const n = window.prompt('New name for this listing:', s.name);
                    if (n && n.trim()) run(s.id, () => adminRenameShop(s, n));
                  }}
                  className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  Rename
                </button>
                {Array.isArray(s.nameHistory) && s.nameHistory.length > 0 && s.nameHistory[s.nameHistory.length - 1].by === 'vendor' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => window.confirm('Put the old name back and lock the name?') && run(s.id, () => adminRevertShopName(s))}
                    className={`${btn} bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300`}
                  >
                    Revert name and lock
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => run(s.id, () => setShopNameLock(s.id, !s.nameLocked))}
                  className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  {s.nameLocked ? 'Unlock name' : 'Lock name'}
                </button>
                {live && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => run(s.id, () => confirmShop(s.id))}
                    className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                  >
                    Mark confirmed
                  </button>
                )}
                {token && <CopyButton link={editLink(token)} />}
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() =>
                    window.confirm('Reset this vendor\'s edit link? The old link stops working straight away.') &&
                    run(s.id, async () => {
                      const link = await resetEditLink(s.id, token);
                      setFresh((f) => ({ ...f, [s.id]: link }));
                    })
                  }
                  className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  Reset link
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
