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
} from '../shopsAdmin.js';
import { editLink, lagosDay, naira, shopTitle, hostelLabel } from '../shops.js';

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
                  {(a.items || []).map((i: any) => `${i.name} ${i.priceFrom ? 'from ' : ''}${naira(i.price)}`).join(', ')}
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
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Approved. Send this private edit link to the vendor on WhatsApp. Do not post it anywhere.</p>
            <CopyButton link={link} label="Copy edit link" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Listings ({shops.length})</h3>
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
