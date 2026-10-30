import React, { useEffect, useMemo, useState } from 'react';
import { Phone, Flag, Plus, X, ShoppingBag, MessageCircle, Camera, Loader2, BatteryCharging } from 'lucide-react';
import { HOSTELS } from '../config';
import {
  HUB_TYPES,
  LONG_LIVED,
  EXPIRY_DAYS,
  MAX_ITEMS,
  REPORT_REASONS,
  subscribeListings,
  subscribeHubSettings,
  getMyListings,
  createListing,
  updateMyListing,
  reportListing,
  countContact,
  priceLabel,
  timeAgo,
  isLive,
  needsConfirm,
  blockedReason,
} from '../hub.js';
import { Gaming } from './Gaming';

type HubTab = 'service' | 'item' | 'wanted' | 'rent' | 'charging' | 'water' | 'games';

interface Props {
  /** Inside-school product names: anything Roomly already sells can't be listed */
  productNames: string[];
  /** The student signed in on this phone (prefills the forms) */
  session: { name?: string; phone?: string; pin?: string };
  onGoStore: () => void;
}

const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const waLink = (phone: string) => `https://wa.me/234${String(phone).replace(/\D/g, '').replace(/^0/, '')}`;

/** Hostel Hub: services, pre-owned items, looking for, rent or lend, charging, water, and gaming */
export const HostelHub: React.FC<Props> = ({ productNames, session, onGoStore }) => {
  const [tab, setTab] = useState<HubTab>(() => {
    try {
      return (localStorage.getItem('roomly_hub_tab') as HubTab) || 'service';
    } catch {
      return 'service';
    }
  });
  const [listings, setListings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [posting, setPosting] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => subscribeListings(setListings), []);
  useEffect(() => subscribeHubSettings(setSettings), []);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('roomly_hub_tab', tab);
    } catch {}
  }, [tab]);

  const waterOn = Boolean(settings.waterOn);
  const tabs = HUB_TYPES.filter((t) => t.id !== 'water' || waterOn);
  useEffect(() => {
    if (tab === 'water' && !waterOn) setTab('service');
  }, [tab, waterOn]);

  const shown = useMemo(() => {
    const list = listings.filter((l) => l.type === tab && isLive(l, nowMs, waterOn));
    // Charging: whoever can charge right now first
    if (tab === 'charging') list.sort((a, b) => Number(Boolean(b.chargingNow)) - Number(Boolean(a.chargingNow)));
    return list;
  }, [listings, tab, nowMs, waterOn]);

  const info = HUB_TYPES.find((t) => t.id === tab);

  return (
    <div className="space-y-3">
      {/* Sections */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        {[...tabs, { id: 'games', label: 'Games', emoji: '🎮' }].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id as HubTab);
              setPosting(false);
              setShowMine(false);
            }}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tab === t.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {tab === 'games' ? (
        <Gaming session={session} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                {info?.label}
                <span className="text-[10px] font-bold text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  Free during launch
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">{info?.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowMine(!showMine);
                setPosting(false);
              }}
              className="shrink-0 text-[11px] font-bold text-[#0e9f55] cursor-pointer"
            >
              {showMine ? 'Back' : 'My listings'}
            </button>
          </div>

          {!posting && !showMine && (
            <button
              type="button"
              onClick={() => setPosting(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-black cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Post in {info?.label}
            </button>
          )}

          {posting && (
            <PostForm
              type={tab}
              waterOn={waterOn}
              productNames={productNames}
              session={session}
              onDone={() => setPosting(false)}
            />
          )}

          {showMine && <MyListings />}

          {!posting && !showMine && (
            <>
              <p className="text-[10px] leading-snug text-slate-500 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5">
                Roomly connects students. Payment and handover are between you. Meet in a public place. Selling stolen items gets you
                banned and reported.
              </p>
              {shown.length === 0 ? (
                <div className={`${card} text-center py-8 px-4 text-xs text-slate-400`}>
                  Nothing here yet. Be the first to post.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {shown.map((l) => (
                    <ListingCard key={l.id} l={l} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* The Hub brings students in; the store is where Roomly earns */}
      <button
        type="button"
        onClick={onGoStore}
        className="w-full flex items-center justify-between gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900 text-left cursor-pointer"
      >
        <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
          Need something delivered to your room? Order from Store Items
        </span>
        <ShoppingBag className="w-4 h-4 text-[#0e9f55] shrink-0" />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const ListingCard: React.FC<{ l: any }> = ({ l }) => {
  const [showPhone, setShowPhone] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const sendReport = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await reportListing(l, reason, note);
      setDone('Thanks. Roomly will check this listing.');
      setReporting(false);
    } catch (e: any) {
      setDone(e?.message || 'Could not send the report.');
    }
    setBusy(false);
  };

  return (
    <div className={`${card} p-3 space-y-2.5`}>
      <div className="flex gap-3">
        {l.photo ? (
          <img src={l.photo} alt="" loading="lazy" className="w-20 h-20 rounded-xl object-cover shrink-0 bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="w-20 h-20 rounded-xl shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
            {HUB_TYPES.find((t) => t.id === l.type)?.emoji}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">{l.title}</p>
          <p className="text-xs font-bold text-[#0e9f55] mt-0.5">{priceLabel(l)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {l.name} · {l.hostel} · {timeAgo(l.createdAtMs)}
          </p>
          {l.type === 'charging' && l.chargingNow && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
              <BatteryCharging className="w-3 h-3" /> Charging available now
            </span>
          )}
        </div>
      </div>
      {l.note && <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{l.note}</p>}
      {l.type === 'rent' && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">Agree the deposit and who pays for damage before you hand it over.</p>
      )}
      {l.type === 'charging' && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">Only hand your phone to someone in your hostel.</p>
      )}

      {showPhone ? (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${l.phone}`}
            className="flex items-center justify-center gap-1 py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold"
          >
            <Phone className="w-3.5 h-3.5" /> {l.phone}
          </a>
          <a
            href={waLink(l.phone)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 text-[#0e9f55] text-xs font-bold"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPhone(true);
              countContact(l.id);
            }}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" /> {l.type === 'wanted' ? 'I have this' : 'Contact'}
          </button>
          <button
            type="button"
            onClick={() => setReporting(!reporting)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold cursor-pointer"
            aria-label="Report this listing"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {reporting && (
        <div className="space-y-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30">
          <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Report this listing</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  reason === r.id ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Anything else? (optional)" />
          <button
            type="button"
            onClick={sendReport}
            disabled={!reason || busy}
            className="w-full py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Sending...' : 'Send report'}
          </button>
        </div>
      )}
      {done && <p className="text-[11px] text-slate-500">{done}</p>}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const PostForm: React.FC<{
  type: HubTab;
  waterOn: boolean;
  productNames: string[];
  session: Props['session'];
  onDone: () => void;
}> = ({ type: startType, waterOn, productNames, session, onDone }) => {
  const [type, setType] = useState<string>(startType === 'games' ? 'service' : startType);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [price2, setPrice2] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [photo, setPhoto] = useState<File | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [imei, setImei] = useState('');
  const [name, setName] = useState(session.name || '');
  const [phone, setPhone] = useState(session.phone || '');
  const [pin, setPin] = useState(session.pin || '');
  const [hostel, setHostel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const blocked = blockedReason(type, title, productNames);
  const longLived = LONG_LIVED.includes(type);
  const priceFields: Record<string, [string, string?]> = {
    service: ['Lowest price (₦)', 'Highest price (₦, optional)'],
    item: ['Price (₦)'],
    wanted: ['Your budget (₦, optional)'],
    rent: ['Price per day (₦)'],
    charging: ['Charge to 50% (₦)', 'Charge to 100% (₦)'],
    water: ['Price per bucket (₦)'],
  };
  const [label1, label2] = priceFields[type] || ['Price (₦)'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createListing({
        type,
        title,
        price,
        price2,
        note,
        days,
        photoFile: photo,
        isPhone: type === 'item' && isPhone,
        proofFile: proof,
        imei,
        name,
        phone,
        pin,
        hostel,
        productNames,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Could not post. Please try again.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={`${card} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">New listing</h3>
        <button type="button" onClick={onDone} className="p-1 text-slate-400 cursor-pointer" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
        {HUB_TYPES.filter((t) => t.id !== 'water' || waterOn).map((t) => (
          <option key={t.id} value={t.id}>
            {t.emoji} {t.label}
          </option>
        ))}
      </select>

      <div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          className={input}
          placeholder={
            type === 'service'
              ? 'e.g. Barbing in my room, Knotless braids'
              : type === 'wanted'
              ? 'e.g. Need a stove for 3 days'
              : type === 'charging'
              ? 'e.g. Power bank charging, TA B12'
              : type === 'water'
              ? 'e.g. I fetch water to your room'
              : 'e.g. Used kerosene stove'
          }
        />
        {blocked && <p className="mt-1 text-[11px] font-semibold text-rose-600">{blocked}</p>}
      </div>

      <div className={`grid gap-2 ${label2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} placeholder={label1} />
        {label2 && (
          <input value={price2} onChange={(e) => setPrice2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} placeholder={label2} />
        )}
      </div>

      {!longLived && (
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">Keep it up for</p>
          <div className="flex gap-1.5">
            {EXPIRY_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  days === d ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {d} day{d > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {longLived && (
        <p className="text-[11px] text-slate-500">This stays up. Every 30 days you tap "Still available" in My listings to keep it showing.</p>
      )}

      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className={input} placeholder="Short note (condition, styles you do, when you're free...)" />

      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
        <Camera className="w-4 h-4 text-[#0e9f55]" />
        <span>{photo ? photo.name : type === 'wanted' ? 'Add a photo (optional)' : 'Add a real photo (required)'}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
      </label>

      {type === 'item' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">
            Your own used items only, at most {MAX_ITEMS} at a time. Roomly doesn't allow reselling new stock.
          </p>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={isPhone} onChange={(e) => setIsPhone(e.target.checked)} />
            This is a phone
          </label>
          {isPhone && (
            <div className="space-y-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Proof of ownership is required. Only Roomly sees the IMEI and the box or receipt photo.
              </p>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <Camera className="w-4 h-4 text-amber-600" />
                <span>{proof ? proof.name : 'Photo of the box or receipt'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setProof(e.target.files?.[0] || null)} />
              </label>
              <input value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} placeholder="IMEI (dial *#06#)" />
            </div>
          )}
        </div>
      )}

      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <p className="text-[11px] font-bold text-slate-500">You (your phone shows only when someone taps Contact)</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Your name" />
          <select value={hostel} onChange={(e) => setHostel(e.target.value)} className={input}>
            <option value="">Hostel</option>
            {HOSTELS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
            <option value="Lodge">Lodge</option>
          </select>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={input} placeholder="Phone number" />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            type="password"
            maxLength={6}
            className={input}
            placeholder="Roomly PIN"
          />
        </div>
        <p className="text-[10px] text-slate-400">New to Roomly? Choose a 4-digit PIN and use it at checkout too.</p>
      </div>

      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || Boolean(blocked)}
        className="w-full py-2.5 rounded-xl bg-[#0e9f55] text-white text-xs font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {busy ? 'Posting...' : 'Post listing'}
      </button>
    </form>
  );
};

/* ------------------------------------------------------------------ */

const MyListings: React.FC = () => {
  const [list, setList] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const load = () => getMyListings().then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, action: string, days = 7) => {
    setBusyId(id);
    try {
      await updateMyListing(id, action, days);
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusyId('');
  };

  if (list === null) return <p className="text-xs text-slate-400">Loading...</p>;
  if (list.length === 0) return <div className={`${card} text-center py-8 text-xs text-slate-400`}>You haven't posted anything from this phone yet.</div>;

  const now = Date.now();
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-slate-500">Listings you posted from this phone.</p>
      {list.map((l) => {
        const live = isLive(l, now, true);
        const state = l.hidden
          ? 'Hidden: Roomly is checking a report'
          : l.status === 'sold'
          ? 'Sold'
          : live
          ? 'Showing'
          : LONG_LIVED.includes(l.type)
          ? 'Not showing: tap Still available'
          : 'Expired';
        return (
          <div key={l.id} className={`${card} p-3 space-y-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{l.title}</p>
                <p className="text-[11px] text-slate-500">
                  {priceLabel(l)} · {state}
                  {l.contacts ? ` · ${l.contacts} contact${l.contacts === 1 ? '' : 's'}` : ''}
                </p>
              </div>
            </div>
            {!l.hidden && (
              <div className="flex flex-wrap gap-1.5">
                {needsConfirm(l, now) && (
                  <button type="button" disabled={busyId === l.id} onClick={() => act(l.id, 'confirm')} className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold cursor-pointer">
                    Still available
                  </button>
                )}
                {!LONG_LIVED.includes(l.type) && (l.status === 'sold' || !live) && (
                  <button type="button" disabled={busyId === l.id} onClick={() => act(l.id, 'renew', 7)} className="px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-[11px] font-bold cursor-pointer">
                    Renew 7 days
                  </button>
                )}
                {l.type === 'charging' && live && (
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => act(l.id, l.chargingNow ? 'chargingOff' : 'chargingOn')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${l.chargingNow ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-emerald-50 text-[#0e9f55] border border-emerald-200'}`}
                  >
                    {l.chargingNow ? 'Charging now: ON' : 'Charging now: OFF'}
                  </button>
                )}
                {l.status === 'active' && l.type !== 'service' && l.type !== 'charging' && l.type !== 'water' && (
                  <button type="button" disabled={busyId === l.id} onClick={() => act(l.id, 'sold')} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer">
                    {l.type === 'wanted' ? 'Found it' : 'Mark sold'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === l.id}
                  onClick={() => window.confirm('Remove this listing?') && act(l.id, 'remove')}
                  className="px-3 py-1.5 rounded-lg text-rose-600 text-[11px] font-bold cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
