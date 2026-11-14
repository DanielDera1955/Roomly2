import React, { useEffect, useMemo, useState } from 'react';
import { takeHubSection } from '../links.js';
import { Phone, Flag, Plus, X, Pencil, Trash2, ShoppingBag, MessageCircle, Camera, Loader2, BatteryCharging, CircleCheck, ChevronDown, ChevronRight, ShieldCheck, Users } from 'lucide-react';
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
  editMyListing,
  knownHubUid,
  reportListing,
  countContact,
  priceLabel,
  timeAgo,
  isLive,
  needsConfirm,
  blockedReason,
} from '../hub.js';
import { ShopHub } from './ShopHub';
import type { Shop } from './ShopHub';
import { sideOf } from '../shops.js';

type Section = 'vendors' | 'buysell' | 'services' | 'lostfound';
type Kind = 'all' | 'service' | 'charging' | 'water' | 'item' | 'rent' | 'wanted' | 'lost' | 'found';

interface Props {
  /** Inside-school product names: things the school doesn't allow reselling in the hostel */
  productNames: string[];
  /** The student signed in on this phone (prefills the forms) */
  session: { name?: string; phone?: string; pin?: string };
  onGoStore: () => void;
  /** Open a vendor's or service's page */
  onOpenShop: (shopId: string) => void;
  /** Open the "List your business" form */
  onListBusiness: (kind: 'vendor' | 'service') => void;
  onManageShop?: () => void;
  /** The student's saved hostel, so Vendors and Services open on their side */
  startHostel?: string;
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
/** Each section: a small green label and a title */
const SECTION_HEAD: Record<Section, { label: string; title: string }> = {
  vendors: { label: 'Sold by students near you', title: 'Shops inside your hostel' },
  services: { label: 'A little help, right here', title: 'Good people, useful skills' },
  buysell: { label: 'Pre-owned, shared', title: 'Good finds, shared around your hostel' },
  lostfound: { label: 'Lost and found', title: 'Lost something, or found something?' },
};

/* ------------------------------------------------------------------ */
/* "How this works" guides, one per section                            */
/* ------------------------------------------------------------------ */

const GUIDES: Record<Section, string[]> = {
  vendors: [
    'Vendors are students who sell from inside your hostel. Pick the side (boys or girls), then your hostel.',
    'Open a shop, pick what you want and tap View order. Your order is sent to the vendor on WhatsApp.',
    'You pay the vendor directly when you receive your order. Roomly does not hold the payment or deliver the order.',
    'A vendor in a boys\' hostel can deliver to any boys\' hostel, and a vendor in a girls\' hostel to any girls\' hostel. On the other side, you and the vendor agree where to hand over.',
    'See something fake? Tap "Report this listing" on the vendor\'s page.',
  ],
  buysell: [
    "Selling new stock inside the hostel isn't allowed by the school, so Buy & Sell is only for your own used items: stove, bucket, power bank, phone, textbooks.",
    'Need something new? Order it on Roomly and a runner brings it to your room, or order from Outside school to restock.',
    'For sale: sell an item once. For rent: lend it per day and agree a deposit first. Wanted: post what you need and people who have it contact you.',
    'Your post stays up for 1, 3, 7 or 14 days. You can have 3 items for sale at a time. Tap "Mark sold" when it is gone.',
    'Roomly connects students. You arrange the payment and meeting yourselves.',
    'Anyone found with stolen items will be reported to hall reps or any reachable authority, and their account and device will be banned from Roomly.',
  ],
  services: [
    'Offer a skill to students in your hostel: barbing, hair braiding, laundry, typing, phone charging when there is no light, or fetching water during scarcity.',
    'To hire someone, tap Contact and agree the price and time on a call or WhatsApp.',
    'To offer a service, tap Post and add a real photo, your price range and your hostel. It stays up; tap "Still available" every 30 days.',
    'Phone charging: switch "Charging now" on in My listings whenever you can charge, so students see you first.',
    'Payment is between you. Roomly takes nothing during launch. See something fake? Tap the flag.',
  ],
  lostfound: [
    'Lost something? Post what it is, where you last had it, and your hostel. Add a reward if you want to.',
    'Found something? Post what it is and where the owner can collect it, for example your hostel and room.',
    "Never post a photo of the details on an ID card, exam card or document. Write only enough for the owner to recognise it, for example \"WAEC card, surname starts with N\".",
    'The owner proves it is theirs when collecting, for example by describing it or showing another ID.',
    'Posts stay up for 1 to 14 days. Tap "Back with owner" in My listings once the item is returned.',
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

/** Hostel Hub: Vendors, Services, Buy & Sell, Lost & Found. Opens on Vendors, unless a post link asked for another section. */
export const HostelHub: React.FC<Props> = ({ productNames, session, onGoStore, onOpenShop, onListBusiness, onManageShop, startHostel }) => {
  const [section, setSection] = useState<Section>(() => {
    const asked = takeHubSection();
    return HUB_SECTIONS.some((x) => x.id === asked) ? (asked as Section) : 'vendors';
  });
  const [kind, setKind] = useState<Kind>('all');
  const [listings, setListings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [posting, setPosting] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  // This phone's Hub id: its own posts get Edit / Remove, and My listings shows how many it has
  const [myUid, setMyUid] = useState('');
  const [justPosted, setJustPosted] = useState(false);
  useEffect(() => {
    knownHubUid().then(setMyUid).catch(() => {});
  }, []);

  useEffect(() => subscribeListings(setListings), []);
  useEffect(() => subscribeHubSettings(setSettings), []);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    setKind('all');
    setPosting(false);
    setShowMine(false);
    setJustPosted(false);
  }, [section]);

  const waterOn = Boolean(settings.waterOn);
  const sectionTypes = HUB_SECTIONS.find((x) => x.id === section)?.types || [];
  const kinds = sectionTypes.filter((t) => t !== 'water' || waterOn);
  // How many of this section's posts are this phone's (for the My listings button)
  const myCount = myUid ? listings.filter((l) => l.ownerUid === myUid && sectionTypes.includes(l.type)).length : 0;
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
      {/* Hub sections: plain text tabs, no background and no border. The active one has a green underline. */}
      <div role="tablist" className="flex items-stretch justify-between">
        {HUB_SECTIONS.map((x) => {
          const on = section === x.id;
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSection(x.id as Section)}
              className={`relative h-11 flex-1 px-0.5 whitespace-nowrap text-[13px] font-bold cursor-pointer bg-transparent border-0 transition-colors ${
                on ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {x.label}
              <span className={`absolute left-1.5 right-1.5 bottom-0 h-[3px] rounded-full ${on ? 'bg-[#0e9f55]' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {/* Every section: a small green label and a title */}
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0b8044] dark:text-emerald-400">{SECTION_HEAD[section].label}</p>
        <h2 className="text-2xl font-black leading-tight text-slate-900 dark:text-white">{SECTION_HEAD[section].title}</h2>
      </div>

      {onManageShop && (section === 'vendors' || section === 'services') && (
        <button
          type="button"
          onClick={onManageShop}
          className="w-full h-12 rounded-2xl bg-[#0b8044] text-white text-sm font-extrabold cursor-pointer active:scale-[0.99]"
        >
          Manage my shop
        </button>
      )}

      {section === 'vendors' ? (
        <ShopHub kind="vendor" startHostel={startHostel} onOpen={(shop: Shop) => onOpenShop(shop.id)} onList={() => onListBusiness('vendor')} />
      ) : (
        <>
          {section === 'services' && <ShopHub kind="service" startHostel={startHostel} onOpen={(shop: Shop) => onOpenShop(shop.id)} onList={() => onListBusiness('service')} />}
          {/* Quick posts (charging, water, one-off services, Buy & Sell, Lost & Found): the existing post board */}
          <div className="flex items-center justify-between gap-3">
            {section === 'services' ? (
              <p className="text-xs text-slate-500">Quick posts: phone charging, water and one-off services.</p>
            ) : (
              <span />
            )}
            {!posting && (
              <button
                type="button"
                onClick={() => {
                  setPosting(true);
                  setShowMine(false);
                  setJustPosted(false);
                }}
                className="shrink-0 h-11 px-4 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Post
              </button>
            )}
          </div>
          {/* My listings: a clear button, not hidden at the end of the filters */}
          <button
            type="button"
            onClick={() => {
              setShowMine(!showMine);
              setPosting(false);
              setJustPosted(false);
            }}
            className={`w-full h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              showMine
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                : 'border-emerald-300 dark:border-emerald-800 text-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/30'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {showMine ? 'Back to all listings' : `My listings${myCount ? ` (${myCount})` : ''} · edit or remove your posts`}
          </button>
          {justPosted && !posting && !showMine && (
            <p className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              Posted. Edit or remove it anytime from My listings.
            </p>
          )}

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-0.5">
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
            <PostForm
              types={kinds}
              startType={kind === 'all' ? kinds[0] : kind}
              productNames={productNames}
              session={session}
              onDone={(posted) => {
                setPosting(false);
                if (posted) {
                  setJustPosted(true);
                  knownHubUid().then(setMyUid).catch(() => {});
                }
              }}
            />
          )}

          {showMine && <MyListings productNames={productNames} />}

          {!posting && !showMine && (
            <>
              {shown.length === 0 ? (
                <div className={`${card} text-center py-10 px-4 text-xs text-slate-400`}>Nothing here yet. Be the first to post.</div>
              ) : (
                <div className="space-y-3">
                  {shown.map((l) => (
                    <ListingCard key={l.id} l={l} nowMs={nowMs} mine={Boolean(myUid) && l.ownerUid === myUid} productNames={productNames} />
                  ))}
                </div>
              )}
              {section === 'buysell' && (
                <p className="flex items-center gap-2 text-xs text-slate-500 px-1">
                  <ShieldCheck className="w-4 h-4 text-[#0e9f55] shrink-0" /> Meet in a public place and check the item before you pay.
                </p>
              )}
              {section === 'buysell' && (
                <p className="px-1 text-[11px] text-rose-600 dark:text-rose-400 leading-snug">Anyone found with stolen items will be reported to hall reps or any reachable authority, and their account and device will be banned from Roomly.</p>
              )}
            </>
          )}
        </>
      )}

      <Guide key={section} section={section} />

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

const ListingCard: React.FC<{ l: any; nowMs: number; mine?: boolean; productNames?: string[] }> = ({ l, nowMs, mine = false, productNames = [] }) => {
  const [showPhone, setShowPhone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  // Owner: mark sold / found / back with owner (not for services, charging or water, which stay up)
  const canMarkDone = l.status === 'active' && l.type !== 'service' && l.type !== 'charging' && l.type !== 'water';
  const doneLabel = l.type === 'wanted' ? 'Found it' : l.type === 'lost' || l.type === 'found' ? 'Back with owner' : 'Mark sold';
  const ownerAct = async (action: string, question: string) => {
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await updateMyListing(l.id, action);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save. Please try again.');
    }
    setBusy(false);
  };
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
            {mine ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-[9px] font-black uppercase tracking-wider text-[#0b8044] dark:text-emerald-300">Your post</span>
            ) : (
              <button type="button" onClick={() => setReporting(!reporting)} aria-label="Report this listing" className="-mt-1 -mr-1 p-1.5 text-slate-400 cursor-pointer">
                <Flag className="w-4 h-4" />
              </button>
            )}
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

      {mine && editing && (
        <EditForm
          l={l}
          productNames={productNames}
          onDone={(saved) => {
            setEditing(false);
            if (saved) setManaging(false);
          }}
        />
      )}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {mine ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {timeAgo(l.createdAtMs)}
                {daysLeft ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}
              </span>
              <button
                type="button"
                onClick={() => {
                  setManaging(!managing);
                  setEditing(false);
                }}
                aria-expanded={managing}
                className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" /> Manage
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${managing ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {managing && !editing && (
              <div className="grid gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                  className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit details
                </button>
                {canMarkDone && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => ownerAct('sold', `Mark this as "${doneLabel}"? It will stop showing to everyone.`)}
                    className="h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-[#0b8044] dark:text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CircleCheck className="w-3.5 h-3.5" /> {doneLabel}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => ownerAct('remove', 'Remove this post? It will stop showing to everyone.')}
                  className="h-10 rounded-xl border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-600 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {busy ? 'Saving...' : 'Remove'}
                </button>
              </div>
            )}
          </div>
        ) : showPhone ? (
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

/** Price field labels per listing type (post and edit forms) */
const PRICE_FIELDS: Record<string, [string, string?]> = {
  service: ['Lowest price (₦)', 'Highest price (₦, optional)'],
  item: ['Price (₦)'],
  wanted: ['Your budget (₦, optional)'],
  rent: ['Price per day (₦)'],
  charging: ['Charge to 50% (₦)', 'Charge to 100% (₦)'],
  water: ['Price per bucket (₦)'],
  lost: ['Reward (₦, optional)'],
  found: ['Collection fee (₦, optional)'],
};

/** Owner: edit a post's title, price, note and photo */
const EditForm: React.FC<{ l: any; productNames: string[]; onDone: (saved: boolean) => void }> = ({ l, productNames, onDone }) => {
  const [title, setTitle] = useState(String(l.title || ''));
  const [price, setPrice] = useState(l.price ? String(l.price) : '');
  const [price2, setPrice2] = useState(l.price2 ? String(l.price2) : '');
  const [note, setNote] = useState(String(l.note || ''));
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [label1, label2] = PRICE_FIELDS[l.type] || ['Price (₦)'];
  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await editMyListing(l, { title, price, price2, note, photoFile: photo, productNames });
      onDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    }
    setBusy(false);
  };
  return (
    <div className="space-y-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
      <p className="text-xs font-extrabold text-slate-900 dark:text-white">Edit your post</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={input} placeholder="Title" />
      <div className={`grid gap-2 ${label2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} placeholder={label1} aria-label={label1} />
        {label2 && <input value={price2} onChange={(e) => setPrice2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} placeholder={label2} aria-label={label2} />}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className={`${input} h-auto py-2`} placeholder="Note (optional)" />
      <label className="flex items-center gap-2 text-xs font-bold text-[#0e9f55] cursor-pointer">
        <Camera className="w-4 h-4" />
        {photo ? `New photo: ${photo.name}` : l.photo ? 'Change photo (optional)' : 'Add a photo (optional)'}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
      </label>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onDone(false)} disabled={busy} className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="h-10 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer disabled:opacity-60">
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
};

const PostForm: React.FC<{
  types: string[];
  startType: string;
  productNames: string[];
  session: Props['session'];
  onDone: (posted?: boolean) => void;
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
  const [label1, label2] = PRICE_FIELDS[type] || ['Price (₦)'];

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
      onDone(true);
    } catch (err: any) {
      setError(err?.message || 'Could not post. Please try again.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={`${card} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">New listing</h3>
        <button type="button" onClick={() => onDone(false)} className="p-1 text-slate-400 cursor-pointer" aria-label="Close">
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
              : type === 'lost'
              ? 'e.g. Lost black power bank near the canteen'
              : type === 'found'
              ? 'e.g. Found WAEC card, surname starts with N'
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
        <span>
          {photo
            ? photo.name
            : type === 'wanted' || type === 'lost'
            ? 'Add a photo (optional)'
            : type === 'found'
            ? 'Add a photo (optional, never of the details on an ID or document)'
            : 'Add a real photo (required)'}
        </span>
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

const MyListings: React.FC<{ productNames: string[] }> = ({ productNames }) => {
  const [list, setList] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState('');
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
          ? l.type === 'lost' || l.type === 'found'
            ? 'Back with owner'
            : 'Sold'
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
                    {l.type === 'wanted' ? 'Found it' : l.type === 'lost' || l.type === 'found' ? 'Back with owner' : 'Mark sold'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === l.id}
                  onClick={() => setEditId(editId === l.id ? '' : l.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === l.id}
                  onClick={() => window.confirm('Remove this post? It will stop showing to everyone.') && act(l.id, 'remove')}
                  className="px-3 py-1.5 rounded-lg text-rose-600 text-[11px] font-bold cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}
            {editId === l.id && (
              <EditForm
                l={l}
                productNames={productNames}
                onDone={(saved) => {
                  setEditId('');
                  if (saved) load();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
