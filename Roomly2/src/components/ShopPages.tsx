import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Loader2, Check, Share2 } from 'lucide-react';
import { NoPhoto } from './NoPhoto';
import { HOSTELS } from '../config';
import { REPORT_REASONS } from '../hub.js';
import {
  naira,
  firstName,
  shopTitle,
  placeLine,
  priceText,
  hostelLabel,
  sameSide,
  sideLabel,
  sideOf,
  deliveryFeeOf,
  pickedItems,
  itemsTotal,
  loadVendorCart,
  saveVendorCart,
  savedLocation,
  rememberLocation,
  subscribeShop,
  getShopWhatsApp,
  buildOrderMessage,
  buildRequestMessage,
  whatsappUrl,
  saveShopOrder,
  saveServiceRequest,
  reportShop,
  countShopVisit,
  shopLink,
} from '../shops.js';
import type { Shop } from './ShopHub';

type Screen = 'page' | 'order' | 'request' | 'sent';
interface Picked {
  id: string;
  name: string;
  price: number;
  priceFrom: boolean;
  soldOut: boolean;
  qty: number;
}
interface Loc {
  name: string;
  hostel: string;
  room: string;
}

const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const primary = 'w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* Small parts                                                         */
/* ------------------------------------------------------------------ */

const BackButton: React.FC<{ onClick: () => void; floating?: boolean }> = ({ onClick, floating }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Back"
    className={`${floating ? 'absolute top-4 left-4 bg-slate-900/80 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'} w-11 h-11 rounded-full flex items-center justify-center cursor-pointer z-10`}
  >
    <ArrowLeft className="w-5 h-5" />
  </button>
);

const TopBar: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
    <BackButton onClick={onBack} />
    <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
  </div>
);

/** Every vendor and service has its own link. Share opens the phone's share sheet, or copies the link. */
const shareShop = async (shop: Shop) => {
  const url = shopLink(shop.id);
  const text = `${shopTitle(shop)} on Roomly: ${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: shopTitle(shop), text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    window.alert('Link copied.');
  } catch {
    /* cancelled */
  }
};

const Cover: React.FC<{ shop: Shop; onBack: () => void }> = ({ shop, onBack }) => (
  <div className="relative h-[130px] bg-slate-200 dark:bg-slate-800 overflow-hidden">
    {shop.cover || shop.photo ? <img src={shop.cover || shop.photo} alt="" className="w-full h-full object-cover" /> : null}
    <BackButton onClick={onBack} floating />
    <button
      type="button"
      onClick={() => shareShop(shop)}
      aria-label="Share this page"
      className="absolute top-4 right-4 h-11 px-4 rounded-full bg-slate-900/80 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer z-10"
    >
      <Share2 className="w-4 h-4" /> Share
    </button>
  </div>
);

const Heading: React.FC<{ shop: Shop; line: string }> = ({ shop, line }) => (
  <div className="px-4 pt-4">
    <h1 className="text-2xl font-black text-slate-900 dark:text-white">{shopTitle(shop)}</h1>
    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      <MapPin className="w-4 h-4 shrink-0" />
      {placeLine(shop)}
    </p>
    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{line}</p>
  </div>
);

/** "Report this listing": one tap opens the reasons, then it goes to the admin */
const ReportLink: React.FC<{ shop: Shop }> = ({ shop }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'' | 'sending' | 'done' | 'error'>('');
  const send = async (reason: string) => {
    setState('sending');
    try {
      await reportShop(shop, reason);
      setState('done');
    } catch {
      setState('error');
    }
  };
  return (
    <div className="text-center py-6">
      {state === 'done' ? (
        <p className="text-xs text-slate-500">Thanks. We will look at this listing.</p>
      ) : (
        <button type="button" onClick={() => setOpen(!open)} className="text-sm text-slate-500 dark:text-slate-400 underline cursor-pointer">
          Report this listing
        </button>
      )}
      {open && state !== 'done' && (
        <div className="mt-3 mx-4 flex flex-wrap justify-center gap-2">
          {REPORT_REASONS.map((r: { id: string; label: string }) => (
            <button
              key={r.id}
              type="button"
              disabled={state === 'sending'}
              onClick={() => send(r.id)}
              className="h-9 px-3 rounded-full border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
          {state === 'error' && <p className="w-full text-xs text-rose-600">Could not send. You may have reported this already, or check your network.</p>}
        </div>
      )}
    </div>
  );
};

/**
 * Where the student is. A signed-in student with a saved hostel and room is never asked again.
 * Anyone else gives name and hostel once (and a room only when the vendor will come to the room).
 */
const WhereBlock: React.FC<{ shop: Shop; loc: Loc; setLoc: (l: Loc) => void; needRoom: boolean }> = ({ shop, loc, setLoc, needRoom }) => {
  const [asked] = useState(() => !loc.name || !loc.hostel);
  const askRoom = needRoom && (asked || !loc.room);
  if (!asked && !askRoom) return null;
  return (
    <div className={`${card} p-3.5 space-y-2.5`}>
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Your details (asked once)</p>
      {asked && (
        <>
          <input className={input} placeholder="Your name" value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} />
          <select className={input} value={loc.hostel} onChange={(e) => setLoc({ ...loc, hostel: e.target.value })}>
            <option value="">Your hostel</option>
            {HOSTELS.map((h: string) => (
              <option key={h} value={h}>
                {hostelLabel(h)}
              </option>
            ))}
          </select>
        </>
      )}
      {askRoom && <input className={input} placeholder="Your room number" value={loc.room} onChange={(e) => setLoc({ ...loc, room: e.target.value })} />}
    </div>
  );
};

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl px-3.5 py-3 text-xs leading-relaxed bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200">{children}</p>
);

const Preview: React.FC<{ text: string }> = ({ text }) => (
  <div className={`${card} p-3.5`}>
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Message preview</p>
    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{text}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/* The flow: page > order / request > sent                             */
/* ------------------------------------------------------------------ */

export const ShopFlow: React.FC<{
  shopId: string;
  /** Items to start with (Reorder from order history): { itemId: quantity } */
  prefill?: Record<string, number>;
  customer: any;
  onClose: () => void;
}> = ({ shopId, prefill, customer, onClose }) => {
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>('page');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [clearedNote, setClearedNote] = useState(false);
  const [service, setService] = useState<any>(null);
  const [sent, setSent] = useState<{ url: string; kind: 'order' | 'request' } | null>(null);
  const [loc, setLoc] = useState<Loc>(() => savedLocation(customer));
  // The vendor's number is fetched when the page opens and kept out of sight. It is only used to build the WhatsApp link.
  const phoneRef = useRef<string>('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => subscribeShop(shopId, (s: Shop | null) => setShop(s)), [shopId]);
  // One phone counts once per shop per day
  useEffect(() => {
    countShopVisit(shopId);
  }, [shopId]);
  useEffect(() => {
    getShopWhatsApp(shopId)
      .then((p: string) => (phoneRef.current = p))
      .catch(() => {});
  }, [shopId]);

  // One vendor per cart. A cart from another vendor is cleared when this one opens.
  useEffect(() => {
    const saved = loadVendorCart();
    if (prefill) setQty(prefill);
    else if (saved && saved.shopId === shopId) setQty(saved.qty);
    else if (saved) {
      setClearedNote(true);
      saveVendorCart(shopId, {});
    }
    setReady(true);
  }, [shopId, prefill]);
  useEffect(() => {
    if (ready) saveVendorCart(shopId, qty);
  }, [qty, ready, shopId]);

  const picked: Picked[] = useMemo(() => (shop ? pickedItems(shop, qty) : []), [shop, qty]);
  const count = picked.reduce((n, i) => n + i.qty, 0);
  const sum = itemsTotal(picked);

  if (shop === undefined) {
    return (
      <Frame>
        <div className="py-24 flex justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Frame>
    );
  }
  if (shop === null) {
    return (
      <Frame>
        <TopBar title="Not available" onBack={onClose} />
        <p className="px-4 py-10 text-sm text-slate-500 text-center">This listing is not available right now.</p>
      </Frame>
    );
  }

  const isService = shop.kind === 'service';

  /* ---------------- sent ---------------- */
  if (screen === 'sent' && sent) {
    return (
      <Frame>
        <TopBar title={sent.kind === 'order' ? 'Order saved' : 'Request saved'} onBack={onClose} />
        <div className="px-4 pt-4 space-y-4">
          <div className={`${card} p-5 text-center`}>
            <span className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
              <Check className="w-6 h-6 text-[#0e9f55]" />
            </span>
            <p className="mt-3 text-base font-black text-slate-900 dark:text-white">Now finish it on WhatsApp</p>
            <p className="mt-1 text-sm text-slate-500">
              Send the message to {firstName(shop.name)}. You can find it again in your order history.
            </p>
          </div>
          <a href={sent.url} target="_blank" rel="noreferrer" className={primary}>
            Open WhatsApp again
          </a>
          <button type="button" onClick={onClose} className="w-full h-11 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
            Done
          </button>
        </div>
      </Frame>
    );
  }

  /* ---------------- order screen (vendors) ---------------- */
  if (screen === 'order' && !isService) {
    return (
      <OrderScreen
        shop={shop}
        picked={picked}
        loc={loc}
        setLoc={setLoc}
        phoneRef={phoneRef}
        onBack={() => setScreen('page')}
        onClose={onClose}
        onSent={(url) => {
          setQty({});
          setSent({ url, kind: 'order' });
          setScreen('sent');
        }}
      />
    );
  }

  /* ---------------- request screen (services) ---------------- */
  if (screen === 'request' && isService && service) {
    return (
      <RequestScreen
        shop={shop}
        service={service}
        loc={loc}
        setLoc={setLoc}
        phoneRef={phoneRef}
        onBack={() => setScreen('page')}
        onSent={(url) => {
          setSent({ url, kind: 'request' });
          setScreen('sent');
        }}
      />
    );
  }

  /* ---------------- shop page ---------------- */
  const setItemQty = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));
  return (
    <Frame>
      <Cover shop={shop} onBack={onClose} />
      <Heading shop={shop} line={isService ? 'Pick the service you want and send me your request.' : 'Pick what you want and send me your order.'} />
      {clearedNote && !isService && (
        <p className="mx-4 mt-3 text-xs text-slate-500">Your earlier items from another vendor were cleared. One order can only go to one vendor.</p>
      )}

      {isService ? (
        <div className="px-4 pt-4 space-y-3">
          {shop.items.map((s) => (
            <div key={s.id} className={`${card} p-3 flex items-center gap-3`}>
              {s.photo && <img src={s.photo} alt="" loading="lazy" className="w-[72px] h-[72px] shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-slate-900 dark:text-white truncate">{s.name}</p>
                <p className="text-base font-black text-[#0e9f55]">{priceText(s)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setService(s);
                  setScreen('request');
                }}
                className="shrink-0 h-11 px-5 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer"
              >
                Request
              </button>
            </div>
          ))}
          {shop.items.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No services listed yet.</p>}
        </div>
      ) : (
        <div className="px-4 pt-4 grid grid-cols-2 gap-3">
          {shop.items.map((i) => {
            const n = Number(qty[i.id]) || 0;
            const control = i.soldOut ? (
              <div className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm font-semibold flex items-center justify-center">Finished for today</div>
            ) : n > 0 ? (
              <div className="h-11 rounded-xl bg-[#0e9f55] text-white flex items-center justify-between px-1">
                <button type="button" aria-label="Less" onClick={() => setItemQty(i.id, n - 1)} className="w-10 h-10 text-xl font-black cursor-pointer">
                  -
                </button>
                <span className="text-sm font-black">{n}</span>
                <button type="button" aria-label="More" onClick={() => setItemQty(i.id, n + 1)} className="w-10 h-10 text-xl font-black cursor-pointer">
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setItemQty(i.id, 1)}
                className="w-full h-11 rounded-xl border-2 border-[#0e9f55] text-[#0e9f55] text-sm font-bold cursor-pointer"
              >
                Add
              </button>
            );
            // No photo: a plain row instead of a card with an empty picture
            if (!i.photo) {
              return (
                <div key={i.id} className={`${card} col-span-2 p-3 flex items-center gap-3`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{i.name}</p>
                    <p className="text-sm font-black text-[#0e9f55]">{priceText(i)}</p>
                  </div>
                  <div className="w-[130px] shrink-0">{control}</div>
                </div>
              );
            }
            return (
              <div key={i.id} className={`${card} overflow-hidden flex flex-col`}>
                <img src={i.photo} alt="" loading="lazy" className="w-full h-24 object-cover bg-slate-100 dark:bg-slate-800" />
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{i.name}</p>
                  <p className="text-sm font-black text-[#0e9f55]">{priceText(i)}</p>
                  <div className="mt-auto pt-1">{control}</div>
                </div>
              </div>
            );
          })}
          {shop.items.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-slate-400">No items listed yet.</p>}
        </div>
      )}

      <ReportLink shop={shop} />
      <div className="h-24" />

      {!isService && count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-[480px] mx-auto flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-xs text-slate-500">
                {count} {count === 1 ? 'item' : 'items'}
              </p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{naira(sum)}</p>
            </div>
            <button type="button" onClick={() => setScreen('order')} className="h-12 px-8 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              View order
            </button>
          </div>
        </div>
      )}
    </Frame>
  );
};

/** Full-screen page with a centred column */
const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50 dark:bg-slate-950">
    <div className="max-w-[480px] mx-auto min-h-full relative">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Order screen                                                        */
/* ------------------------------------------------------------------ */

const OrderScreen: React.FC<{
  shop: Shop;
  picked: Picked[];
  loc: Loc;
  setLoc: (l: Loc) => void;
  phoneRef: React.MutableRefObject<string>;
  onBack: () => void;
  onClose: () => void;
  onSent: (url: string) => void;
}> = ({ shop, picked, loc, setLoc, phoneRef, onBack, onClose, onSent }) => {
  const canDeliver = shop.deliveryOn !== false;
  const fee = deliveryFeeOf(shop);
  const [choice, setChoice] = useState<'pickup' | 'room'>('pickup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Opposite side (boys' vendor, girls' hostel or the reverse): no room, no fee, the two agree where to meet
  const hostelKnown = Boolean(loc.hostel);
  const opposite = hostelKnown && !sameSide(shop, loc.hostel);
  const delivery: 'pickup' | 'room' | 'handover' = opposite ? 'handover' : canDeliver ? choice : 'pickup';
  const deliveryCost = delivery === 'room' ? fee : 0;
  const sum = itemsTotal(picked);
  const needRoom = delivery === 'room';
  const ready = Boolean(loc.name.trim()) && hostelKnown && (!needRoom || Boolean(loc.room.trim())) && picked.length > 0;
  const message = hostelKnown ? buildOrderMessage({ shop, picked, delivery, loc: { ...loc, room: loc.room || '...' } }) : '';

  const send = async () => {
    setError('');
    if (!ready) {
      setError(!loc.name.trim() || !hostelKnown ? 'Add your name and hostel.' : 'Add your room number.');
      return;
    }
    setBusy(true);
    try {
      // The order is saved first. WhatsApp only opens once it is safely stored.
      await saveShopOrder({ shop, picked, delivery, loc });
      rememberLocation(loc);
      const phone = phoneRef.current || (await getShopWhatsApp(shop.id));
      phoneRef.current = phone;
      const url = whatsappUrl(phone, buildOrderMessage({ shop, picked, delivery, loc }));
      const w = window.open(url, '_blank');
      if (!w) window.location.href = url;
      onSent(url);
    } catch (e: any) {
      setError(e?.message || 'Could not send your order. Check your network and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <TopBar title="Your order" onBack={onBack} />
      <div className="px-4 pt-2 pb-10 space-y-4">
        <div className={`${card} px-3.5 py-1`}>
          {picked.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
              <span className="text-sm text-slate-800 dark:text-slate-100">
                {i.qty} x {i.name}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{naira(i.price * i.qty)}</span>
            </div>
          ))}
        </div>

        <WhereBlock shop={shop} loc={loc} setLoc={setLoc} needRoom={needRoom} />

        {opposite ? (
          <Notice>
            You are in {hostelLabel(loc.hostel)} ({sideLabel(sideOf(loc.hostel))}) and this vendor is in a {sideLabel(sideOf(shop.hostel))}. You do not need to give a room and there is no delivery fee. Agree with {firstName(shop.name)} where to hand over.
          </Notice>
        ) : hostelKnown ? (
          <div className="space-y-2.5">
            {(
              [
                { id: 'pickup', label: 'I will pick it up', sub: 'Free', show: true },
                { id: 'room', label: 'Bring to my room', sub: naira(fee), show: canDeliver },
              ] as const
            )
              .filter((o) => o.show)
              .map((o) => {
                const on = (canDeliver ? choice : 'pickup') === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setChoice(o.id)}
                    className={`w-full flex items-center justify-between rounded-2xl px-4 h-14 border cursor-pointer text-left ${
                      on ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55]' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'border-[#0e9f55]' : 'border-slate-300 dark:border-slate-600'}`}>
                        {on && <span className="w-2.5 h-2.5 rounded-full bg-[#0e9f55]" />}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{o.label}</span>
                    </span>
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{o.sub}</span>
                  </button>
                );
              })}
          </div>
        ) : null}

        <div className={`${card} p-3.5 space-y-1.5 text-sm`}>
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Items total</span>
            <span>{naira(sum)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Delivery</span>
            <span>{deliveryCost ? naira(deliveryCost) : 'Free'}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-base font-black text-slate-900 dark:text-white">
            <span>Total</span>
            <span>{naira(sum + deliveryCost)}</span>
          </div>
        </div>

        <Notice>
          You are ordering directly from {firstName(shop.name)}. Pay when you receive your order. Roomly does not hold this payment or deliver this order.
        </Notice>

        {message && <Preview text={message} />}

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <button type="button" disabled={busy || picked.length === 0} onClick={send} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Send order on WhatsApp
        </button>
        <button type="button" onClick={onClose} className="w-full text-center text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
          No reply from this vendor? You can order from another one.
        </button>
      </div>
    </Frame>
  );
};

/* ------------------------------------------------------------------ */
/* Request screen (services)                                           */
/* ------------------------------------------------------------------ */

const RequestScreen: React.FC<{
  shop: Shop;
  service: any;
  loc: Loc;
  setLoc: (l: Loc) => void;
  phoneRef: React.MutableRefObject<string>;
  onBack: () => void;
  onSent: (url: string) => void;
}> = ({ shop, service, loc, setLoc, phoneRef, onBack, onSent }) => {
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hostelKnown = Boolean(loc.hostel);
  const needRoom = hostelKnown && sameSide(shop, loc.hostel);
  const vendor = firstName(shop.name);
  const message = buildRequestMessage({ shop, service, when: when.trim() || '...', loc: { ...loc, room: loc.room || '...' } });

  const send = async () => {
    setError('');
    if (!when.trim()) return setError('Tell the vendor when you want it.');
    if (!loc.name.trim() || !hostelKnown) return setError('Add your name and hostel.');
    if (needRoom && !loc.room.trim()) return setError('Add your room number.');
    setBusy(true);
    try {
      // The request is saved first. WhatsApp only opens once it is safely stored.
      await saveServiceRequest({ shop, service, when: when.trim(), loc });
      rememberLocation(loc);
      const phone = phoneRef.current || (await getShopWhatsApp(shop.id));
      phoneRef.current = phone;
      const url = whatsappUrl(phone, buildRequestMessage({ shop, service, when: when.trim(), loc }));
      const w = window.open(url, '_blank');
      if (!w) window.location.href = url;
      onSent(url);
    } catch (e: any) {
      setError(e?.message || 'Could not send your request. Check your network and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <TopBar title="Your request" onBack={onBack} />
      <div className="px-4 pt-2 pb-10 space-y-4">
        <div className={`${card} p-4`}>
          <p className="text-base font-black text-slate-900 dark:text-white">{service.name}</p>
          <p className="mt-0.5 text-base font-black text-[#0e9f55]">{priceText(service)}</p>
          {service.priceFrom && <p className="mt-1 text-xs text-slate-500">Price confirmed by {vendor}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">When do you want it?</label>
          <input className={input} placeholder="For example: today 4pm" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={120} />
        </div>

        <WhereBlock shop={shop} loc={loc} setLoc={setLoc} needRoom={needRoom} />

        <Notice>You are booking directly with {vendor}. Pay after the service is done. Roomly does not hold this payment.</Notice>

        <Preview text={message} />

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <button type="button" disabled={busy} onClick={send} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Send request on WhatsApp
        </button>
      </div>
    </Frame>
  );
};
