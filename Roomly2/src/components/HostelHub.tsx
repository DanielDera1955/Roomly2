import React, { useEffect, useMemo, useState } from 'react';
import { Phone, Flag, Plus, X, ShoppingBag, MessageCircle, Camera, Loader2, BatteryCharging, CircleCheck, ChevronDown, ChevronRight, Gamepad2, Wrench, ShieldCheck, Users } from 'lucide-react';
import { NoPhoto } from './NoPhoto';
import { HOSTELS } from '../config';
import {
  HUB_TYPES,
  HUB_SECTIONS,
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

type Section = 'games' | 'buysell' | 'services';
type Kind = 'all' | 'service' | 'charging' | 'water' | 'item' | 'rent' | 'wanted';

interface Props {
  /** Inside-school product names: things the school doesn't allow reselling in the hostel */
  productNames: string[];
  /** The student signed in on this phone (prefills the forms) */
  session: { name?: string; phone?: string; pin?: string };
  onGoStore: () => void;
}

const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const waLink = (phone: string) => `https://wa.me/234${String(phone).replace(/\D/g, '').replace(/^0/, '')}`;
const typeLabel = (id: string) => HUB_TYPES.find((t) => t.id === id)?.label || '';
const chip = (on: boolean) =>
  `shrink-0 whitespace-nowrap h-10 px-4 rounded-full text-xs font-bold border transition-all cursor-pointer ${
    on
      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]'
      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
  }`;
const SECTION_ICON: Record<Section, React.FC<{ className?: string }>> = { games: Gamepad2, buysell: ShoppingBag, services: Wrench };
const SECTION_HEAD: Record<'buysell' | 'services', { title: string; sub: string }> = {
  buysell: { title: 'Buy & Sell', sub: 'Good finds, shared around your hostel.' },
  services: { title: 'Services', sub: 'Helpful skills, right around the hostel.' },
};

/* ------------------------------------------------------------------ */
/* "How this works" guides, one per section                            */
/* ------------------------------------------------------------------ */

const GUIDES: Record<Section, string[]> = {
  games: [
    'Register once: gamer name, hostel, WhatsApp number, your Roomly PIN and the games you play. Your number stays private.',
    'Week one is registration week. Challenges open on the date shown at the top.',
    'It works like a football league table: a win earns 3 points, a draw 1 (football games), a loss 0. The top player in each game wears the crown as Best in Caritas.',
    'Switch on Ready to play, then challenge any ready player on WhatsApp, including the leader.',
    'After the match, one of you logs the score and your opponent confirms. No reply in 24 hours and it counts. A wrong result can be disputed with a screenshot.',
    'Roomly hosts tournaments on set dates: 1st +10, 2nd +6, 3rd +3 points. If a tournament does not fill up, everyone is refunded in full.',
    '1v1 challenges are free and there is no betting. Challenge the best in Caritas at any game you play, and see every player on the table.',
  ],
  buysell: [
    "Selling new stock inside the hostel isn't allowed by the school, so Buy & Sell is only for your own used items: stove, bucket, power bank, phone, textbooks.",
    'Need something new? Order it on Roomly and a runner brings it to your room, or order from Outside school to restock.',
    'For sale: sell an item once. For rent: lend it per day and agree a deposit first. Wanted: post what you need and people who have it contact you.',
    'Your post stays up for 1, 3, 7 or 14 days. You can have 3 items for sale at a time. Tap "Mark sold" when it is gone.',
    'Roomly connects students. You arrange the payment and meeting yourselves. Anyone selling stolen items is banned and reported.',
  ],
  services: [
    'Offer a skill to students in your hostel: barbing, hair braiding, laundry, typing, phone charging when there is no light, or fetching water during scarcity.',
    'To hire someone, tap Contact and agree the price and time on a call or WhatsApp.',
    'To offer a service, tap Post and add a real photo, your price range and your hostel. It stays up; tap "Still available" every 30 days.',
    'Phone charging: switch "Charging now" on in My listings whenever you can charge, so students see you first.',
    'Payment is between you. Roomly takes nothing during launch. See something fake? Tap the flag.',
  ],
};

/** Collapsible guide. Opens by itself the first time a student visits that section. */
const Guide: React.FC<{ section: Section }> = ({ section }) => {
  const key = `roomly_hub_guide_${section}`;
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(key);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, '1');
    } catch {}
  }, [key]);
  return (
    <div className={`${card} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-4 py-3.5 cursor-pointer text-left">
        <span className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
          <span className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
            <CircleCheck className="w-4 h-4 text-[#0e9f55]" />
          </span>
          How this works
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-100 dark:border-slate-800">
          {GUIDES[section].map((p, i) => (
            <li key={i} className="flex gap-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 pt-2 first:pt-3">
              <span className="w-5 h-5 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#0e9f55] text-[10px] font-black flex items-center justify-center">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/** Hostel Hub: Games, Buy & Sell, Services */
export const HostelHub: React.FC<Props> = ({ productNames, session, onGoStore }) => {
  const [section, setSection] = useState<Section>(() => {
    try {
      const v = localStorage.getItem('roomly_hub_section');
      return v === 'buysell' || v === 'services' ? v : 'games';
    } catch {
      return 'games';
    }
  });
  const [kind, setKind] = useState<Kind>('all');
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
      localStorage.setItem('roomly_hub_section', section);
    } catch {}
    setKind('all');
    setPosting(false);
    setShowMine(false);
  }, [section]);

  const waterOn = Boolean(settings.waterOn);
  const sectionTypes = HUB_SECTIONS.find((x) => x.id === section)?.types || [];
  const kinds = sectionTypes.filter((t) => t !== 'water' || waterOn);
  useEffect(() => {
    if (kind === 'water' && !waterOn) setKind('all');
  }, [kind, waterOn]);

  const shown = useMemo(() => {
    const list = listings.filter((l) => sectionTypes.includes(l.type) && (kind === 'all' || l.type === kind) && isLive(l, nowMs, waterOn));
    list.sort((a, b) => Number(Boolean(b.chargingNow)) - Number(Boolean(a.chargingNow)));
    return list;
  }, [listings, section, kind, nowMs, waterOn]);

  return (
    <div className="space-y-4">
      {/* Sections */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70">
        {HUB_SECTIONS.map((x) => {
          const Icon = SECTION_ICON[x.id as Section];
          const on = section === x.id;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setSection(x.id as Section)}
              className={`h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                on ? 'bg-white dark:bg-slate-900 text-[#0e9f55] shadow-xs' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{x.label}</span>
            </button>
          );
        })}
      </div>

      <Guide key={section} section={section} />

      {section === 'games' ? (
        <Gaming session={session} />
      ) : (
        <>
          {/* Section header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{SECTION_HEAD[section].title}</h2>
              <p className="text-xs text-slate-500">{SECTION_HEAD[section].sub}</p>
            </div>
            {!posting && (
              <button
                type="button"
                onClick={() => {
                  setPosting(true);
                  setShowMine(false);
                }}
                className="shrink-0 h-11 px-4 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Post
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
            <button type="button" onClick={() => setKind('all')} className={chip(kind === 'all' && !showMine)}>
              All
            </button>
            {kinds.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setKind(t as Kind);
                  setShowMine(false);
                }}
                className={chip(kind === t && !showMine)}
              >
                {typeLabel(t)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowMine(!showMine);
              setPosting(false);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0e9f55] cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" /> {showMine ? 'Back to all listings' : 'My listings'}
          </button>

          {section === 'buysell' && !posting && !showMine && (
            <div className={`${card} p-3.5 flex gap-3`}>
              <span className="w-9 h-9 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-[#0e9f55]" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Used items only in the hostel</p>
                <p className="text-xs text-slate-500 leading-snug">Need something new? Order it on Roomly and a runner brings it to your room.</p>
              </div>
            </div>
          )}

          {posting && (
            <PostForm types={kinds} startType={kind === 'all' ? kinds[0] : kind} productNames={productNames} session={session} onDone={() => setPosting(false)} />
          )}

          {showMine && <MyListings />}

          {!posting && !showMine && (
            <>
              {shown.length === 0 ? (
                <div className={`${card} text-center py-10 px-4 text-xs text-slate-400`}>Nothing here yet. Be the first to post.</div>
              ) : (
                <div className="space-y-3">
                  {shown.map((l) => (
                    <ListingCard key={l.id} l={l} nowMs={nowMs} />
                  ))}
                </div>
              )}
              {section === 'buysell' && (
                <p className="flex items-center gap-2 text-xs text-slate-500 px-1">
                  <ShieldCheck className="w-4 h-4 text-[#0e9f55] shrink-0" /> Meet in a public place and check the item before you pay.
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* The Hub brings students in; the store is where Roomly earns */}
      <button
        type="button"
        onClick={onGoStore}
        className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900 text-left cursor-pointer"
      >
        <span className="w-10 h-10 shrink-0 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center">
          <ShoppingBag className="w-4 h-4 text-[#0e9f55]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">Need something delivered to your room?</span>
          <span className="block text-xs text-[#0e9f55]">Order from Store Items</span>
        </span>
        <ChevronRight className="w-4 h-4 text-[#0e9f55] shrink-0" />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const ListingCard: React.FC<{ l: any; nowMs: number }> = ({ l, nowMs }) => {
  const [showPhone, setShowPhone] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const daysLeft = LONG_LIVED.includes(l.type) ? 0 : Math.max(1, Math.ceil((Number(l.expiresAtMs) - nowMs) / 86400000));

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
    <div className={`${card} p-3.5 space-y-3`}>
      <div className="flex gap-3">
        {l.photo ? (
          <img src={l.photo} alt="" loading="lazy" className="w-[88px] h-[88px] rounded-xl object-cover shrink-0 bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="w-[88px] h-[88px] rounded-xl shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <NoPhoto name={l.title} className="text-2xl" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {typeLabel(l.type)}
            </span>
            <button type="button" onClick={() => setReporting(!reporting)} aria-label="Report this listing" className="-mt-1 -mr-1 p-1.5 text-slate-400 cursor-pointer">
              <Flag className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1 text-sm font-black text-slate-900 dark:text-white leading-tight">{l.title}</p>
          <p className="text-sm font-bold text-[#0e9f55] mt-0.5">{priceLabel(l)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {l.name} · {l.hostel}
          </p>
        </div>
      </div>
      {l.type === 'charging' && l.chargingNow && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full">
          <BatteryCharging className="w-3.5 h-3.5" /> Charging available now
        </span>
      )}
      {l.note && <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{l.note}</p>}
      {l.type === 'rent' && <p className="text-[11px] text-amber-700 dark:text-amber-400">Agree the deposit and who pays for damage before you hand it over.</p>}
      {l.type === 'charging' && <p className="text-[11px] text-amber-700 dark:text-amber-400">Only hand your phone to someone in your hostel.</p>}

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {showPhone ? (
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${l.phone}`} className="h-10 flex items-center justify-center gap-1.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold">
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
            <a href={waLink(l.phone)} target="_blank" rel="noreferrer" className="h-10 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 text-[#0e9f55] text-xs font-bold">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {timeAgo(l.createdAtMs)}
              {daysLeft ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowPhone(true);
                countContact(l.id);
              }}
              className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" /> {l.type === 'wanted' ? 'I have this' : 'Contact'}
            </button>
          </div>
        )}
      </div>

      {reporting && (
        <div className="space-y-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Report this listing</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                  reason === r.id ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Anything else? (optional)" />
          <button type="button" onClick={sendReport} disabled={!reason || busy} className="w-full h-10 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
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
  types: string[];
  startType: string;
  productNames: string[];
  session: Props['session'];
  onDone: () => void;
}> = ({ types, startType, productNames, session, onDone }) => {
  const [type, setType] = useState<string>(startType || types[0]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [price2, setPrice2] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [photo, setPhoto] = useState<File | null>(null);
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

      <div>
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">What do you want to post?</p>
        <div className="grid gap-1.5">
          {types.map((t) => {
            const info = HUB_TYPES.find((x) => x.id === t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`text-left px-3 py-2 rounded-xl border cursor-pointer ${
                  type === t
                    ? 'border-[#0e9f55] bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <span className="block text-xs font-bold text-slate-900 dark:text-white">{info?.label}</span>
                <span className="block text-[10px] text-slate-500">{info?.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

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
        <p className="text-[11px] text-slate-500">
          Your own used items only, at most {MAX_ITEMS} at a time. The school doesn't allow selling new stock in the hostel.
        </p>
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
