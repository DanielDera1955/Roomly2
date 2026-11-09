import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { OrderRecord, orderStageOf, isActiveOrder, GATE_COUNTDOWN_MS } from '../types';
import { Announcement, arrivalDeadlineMs, arrivalText, countdownText } from '../config';
import { paymentState } from '../api.js';

type DayPart = 'Good morning' | 'Good afternoon' | 'Good evening';

const isOutsideOrder = (o: OrderRecord) => o.cart === 'store' || o.cart === 'food';
/** Inside: to the hostel (or the spot the student typed). Outside: to the school gate. */
const wayLabel = (o: OrderRecord) => (isOutsideOrder(o) ? 'On its way to the gate' : o.area === 'Custom' ? `On the way to ${o.building}` : 'On the way to the hostel');
const stepsFor = (o: OrderRecord) => ['Received', 'Confirmed & Packaging', wayLabel(o)];
const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const firstWord = (s?: string) => String(s || '').trim().split(/\s+/)[0] || '';
const clock = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
};

interface HomeBannerProps {
  dayPart: DayPart;
  name: string;
  isNew: boolean;
  hasUsuals: boolean;
  orders: OrderRecord[];
  announcement: Announcement | null;
  onOpenOrder: (o: OrderRecord) => void;
  onOpenOrders: () => void;
  onAnnouncementAction: (a: Announcement) => void;
  onDismissAnnouncement: () => void;
  /** Not signed in yet: greet them and show what Roomly is */
  isGuest?: boolean;
  /** A line about this moment at Caritas (Inside school only), '' for none */
  caritasLine?: string;
  /** What is actually open right now, from the real schedule (open = green dot, otherwise amber) */
  live?: { text: string; open: boolean };
  /** Guests: jump to the products */
  onStart?: () => void;
}

/**
 * The banner at the top of the home screen, for every student (guests get a welcome version).
 * The greeting follows the time of day; the Caritas line and live line follow the real schedule.
 * It shows the most useful thing, in this order:
 *  1. an order on the way (tracker)  2. an order waiting for payment  3. the active announcement  4. the greeting.
 * Animation is CSS only and stops for people who ask their phone for reduced motion.
 */
export const HomeBanner: React.FC<HomeBannerProps> = ({
  dayPart,
  name,
  isNew,
  hasUsuals,
  orders,
  announcement,
  onOpenOrder,
  onOpenOrders,
  onAnnouncementAction,
  onDismissAnnouncement,
  isGuest = false,
  caritasLine = '',
  live = { text: '', open: false },
  onStart,
}) => {
  // Midnight to 5am says "Good morning" but keeps the night sky (moon and stars)
  const morning = dayPart === 'Good morning' && new Date().getHours() >= 5;
  const afternoon = dayPart === 'Good afternoon';
  const sky = morning
    ? 'linear-gradient(180deg,#fb923c 0%,#fbbf24 45%,#fde68a 100%)'
    : afternoon
    ? 'linear-gradient(180deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)'
    : 'linear-gradient(180deg,#1e1b4b 0%,#312e81 55%,#0e7490 100%)';
  // Everyone gets the time-of-day sky (sunrise, blue sky, moon and stars)
  const plain = false;
  const ink = plain ? 'text-slate-900 dark:text-white' : morning ? 'text-orange-950' : 'text-white';
  // Colour touches that follow the sky: the name, the faded welcome line, the delivery chip and the button
  const nameColor = plain ? 'text-[#0e9f55]' : morning ? 'text-orange-700' : afternoon ? 'text-yellow-200' : 'text-amber-200';
  const softText = plain ? 'text-slate-500 dark:text-slate-400' : morning ? 'text-orange-950/70' : afternoon ? 'text-white/85' : 'text-white/70';
  const chipBg = plain
    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
    : morning
    ? 'bg-orange-900/15'
    : afternoon
    ? 'bg-sky-900/35'
    : 'bg-indigo-950/45';
  const buttonInk = plain ? 'text-[#0e9f55] border border-emerald-200 dark:border-emerald-900' : morning ? 'text-orange-800' : afternoon ? 'text-sky-700' : 'text-indigo-900';

  // Ticks every second while an outside order is counting down to the gate (and every 30s otherwise)
  const [nowMs, setNowMs] = useState(Date.now());
  const counting =
    orders.some((o) => isOutsideOrder(o) && orderStageOf(o, nowMs) === 'onway') ||
    // The "arrives before" countdown shows seconds in its last hour
    orders.some((o) => {
      const a = arrivalDeadlineMs(o);
      return a !== null && o.status !== 'Delivered' && a - nowMs < 3600000;
    });
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), counting ? 1000 : 30000);
    return () => window.clearInterval(id);
  }, [counting]);
  const now = new Date(nowMs);
  // Paid orders still in progress (outside ones stay until their 15-minute gate countdown ends)
  const onTheWay = orders.filter((o) => o.paymentStatus !== 'unpaid' && isActiveOrder(o, nowMs));
  const trackOrder = onTheWay[0] || null;
  const waiting =
    !trackOrder
      ? orders.find(
          (o) =>
            o.paymentStatus === 'unpaid' &&
            paymentState(o, now) === 'open' &&
            o.paymentDeadline &&
            Date.parse(o.paymentDeadline) > now.getTime()
        ) || null
      : null;

  const stage = trackOrder ? orderStageOf(trackOrder, nowMs) : 'received';
  const stepIdx = stage === 'onway' ? 2 : stage === 'packaging' ? 1 : 0;
  const STEPS = trackOrder ? stepsFor(trackOrder) : [];
  const gateLeft =
    trackOrder && isOutsideOrder(trackOrder) && stage === 'onway' && trackOrder.deliveredAt
      ? GATE_COUNTDOWN_MS - (nowMs - Date.parse(trackOrder.deliveredAt))
      : null;
  const headline = !trackOrder
    ? ''
    : stage === 'onway'
    ? isOutsideOrder(trackOrder)
      ? 'Your order is on its way to the gate'
      : trackOrder.area === 'Custom'
      ? `Your order is on the way to ${trackOrder.building}`
      : 'Your order is on the way to your hostel'
    : stage === 'packaging'
    ? 'Payment confirmed. Your order is being packaged'
    : 'Your order is received';
  const carrier = trackOrder ? firstWord(trackOrder.runnerName || trackOrder.operatorName) : '';
  // "Arrives before" countdown (until delivered; outside switches to the gate countdown once sent)
  const arrivalMs = trackOrder && trackOrder.status !== 'Delivered' ? arrivalDeadlineMs(trackOrder) : null;
  const arrivalLate = arrivalMs !== null && arrivalMs - nowMs <= 0;
  // Stars sit inside the right-hand sky area (left, top within that area, delay)
  const stars: Array<[number, number, number]> = [
    [8, 18, 0],
    [30, 92, 0.6],
    [88, 14, 1.2],
    [14, 60, 0.3],
    [96, 104, 0.9],
  ];

  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-4 ${plain ? 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm' : `min-h-[176px] shadow-md`} ${ink}`}
      style={plain ? undefined : { background: sky }}
    >
      <style>{`
        @keyframes rb-drift { 0% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 100% { transform: translateX(-8px); } }
        @keyframes rb-glow { 0%, 100% { opacity: .85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.07); } }
        @keyframes rb-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
        @keyframes rb-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .rb-drift { animation: rb-drift 9s ease-in-out infinite; }
        .rb-drift-slow { animation: rb-drift 14s ease-in-out infinite reverse; }
        .rb-glow { animation: rb-glow 5s ease-in-out infinite; }
        .rb-twinkle { animation: rb-twinkle 3s ease-in-out infinite; }
        .rb-bob { animation: rb-bob 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .rb-drift, .rb-drift-slow, .rb-glow, .rb-twinkle, .rb-bob { animation: none !important; }
        }
      `}</style>

      {/* scenery: kept in the top-right corner so it never moves behind the text (new visitors only) */}
      {!plain && (
      <div className="absolute right-0 top-0 w-[112px] h-[128px] overflow-hidden pointer-events-none">
        {morning && (
          <div
            className="rb-glow absolute right-6 top-9 w-12 h-12 rounded-full bg-orange-50"
            style={{ boxShadow: '0 0 34px 12px rgba(255,237,213,.8)' }}
          />
        )}
        {afternoon && (
          <>
            <div
              className="rb-glow absolute right-6 top-9 w-12 h-12 rounded-full bg-yellow-300"
              style={{ boxShadow: '0 0 26px 8px rgba(253,224,71,.6)' }}
            />
            <span className="rb-drift absolute right-[42px] top-[46px] w-[50px] h-4 rounded-full bg-white/90" />
            <span className="rb-drift-slow absolute right-3 top-[82px] w-9 h-3 rounded-full bg-white/90" />
          </>
        )}
        {!morning && !afternoon && (
          <>
            {stars.map(([l, t, delay]) => (
              <span
                key={`${l}-${t}`}
                className="rb-twinkle absolute w-[3px] h-[3px] rounded-full bg-white/85"
                style={{ left: l, top: t, animationDelay: `${delay}s` }}
              />
            ))}
            <div
              className="absolute right-[26px] top-9 w-10 h-10 rounded-full bg-amber-200 overflow-hidden"
              style={{ boxShadow: '0 0 26px 6px rgba(253,230,138,.35)' }}
            >
              <div className="absolute w-10 h-10 rounded-full left-[11px] -top-1.5" style={{ background: '#262266' }} />
            </div>
          </>
        )}
      </div>
      )}
      {!plain && <div className="absolute -left-8 -right-8 -bottom-12 h-20 rounded-[50%] bg-[#0e9f55]/55" />}
      {!plain && <div className="absolute left-[120px] -right-16 -bottom-14 h-20 rounded-[50%] bg-[#0b8044]/50" />}

      <div className="relative z-10">
        {/* No date strip: the greeting is the first thing they read */}
        {isGuest && (
          <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${morning ? 'text-orange-800' : 'opacity-90'}`}>
            Hey there, {dayPart.toLowerCase()}
          </p>
        )}

        {trackOrder ? (
          /* 1. order on the way */
          <button
            type="button"
            onClick={() => onOpenOrder(trackOrder)}
            className="mt-3 w-full text-left rounded-2xl bg-white/92 dark:bg-slate-900/92 text-slate-900 dark:text-white p-3 shadow-sm cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-tight">{headline}</p>
                <p className={`text-[11px] mt-0.5 truncate ${arrivalLate ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {gateLeft !== null
                    ? `At the school gate in under ${mmss(gateLeft)}`
                    : arrivalLate
                    ? `Running late. Tap to call your ${isOutsideOrder(trackOrder) ? 'vendor' : 'runner'}`
                    : arrivalMs !== null
                    ? `Arrives before ${arrivalText(arrivalMs, now)}${isOutsideOrder(trackOrder) ? ' at the gate' : ''}`
                    : [carrier ? `With ${carrier}` : '', trackOrder.deliveryTime ? `Arriving ${trackOrder.deliveryTime}` : ''].filter(Boolean).join(' · ') ||
                      'Tap to see the details'}
                </p>
              </div>
              <span className={`text-[11px] font-bold shrink-0 ${arrivalLate ? 'text-rose-600 dark:text-rose-400' : 'text-[#0e9f55]'}`}>
                {gateLeft !== null ? (
                  <span className="font-mono">{mmss(gateLeft)}</span>
                ) : arrivalLate ? (
                  'Late'
                ) : arrivalMs !== null ? (
                  <span className="font-mono">{countdownText(arrivalMs - nowMs)}</span>
                ) : (
                  'Open ›'
                )}
              </span>
            </div>
            <div className="relative mt-3 mb-1">
              <div className="absolute left-[16%] right-[16%] top-[9px] h-0.5 bg-slate-200 dark:bg-slate-700" />
              <div
                className="absolute left-[16%] top-[9px] h-0.5 bg-[#0e9f55] transition-all duration-700"
                style={{ width: `${(stepIdx / (STEPS.length - 1)) * 68}%` }}
              />
              <div className="relative grid grid-cols-3">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex flex-col items-center">
                    <div className="h-5 flex items-end">
                      {i === stepIdx ? (
                        <span className="rb-bob w-3.5 h-3.5 mb-[3px] rounded-full bg-[#0e9f55] ring-4 ring-emerald-200/70 dark:ring-emerald-900" aria-hidden />
                      ) : (
                        <span
                          className={`w-2.5 h-2.5 rounded-full mb-[5px] ${i < stepIdx ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-600'}`}
                        />
                      )}
                    </div>
                    <span
                      className={`mt-1 text-[10px] leading-tight text-center px-0.5 ${i === stepIdx ? 'font-extrabold text-[#0b8044] dark:text-[#0e9f55]' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {onTheWay.length > 1 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">+ {onTheWay.length - 1} more on the way</p>
            )}
          </button>
        ) : waiting ? (
          /* 2. order waiting for payment */
          <button
            type="button"
            onClick={() => onOpenOrder(waiting)}
            className="mt-3 w-full text-left rounded-2xl bg-white/92 dark:bg-slate-900/92 text-slate-900 dark:text-white p-3 shadow-sm cursor-pointer"
          >
            <p className="text-sm font-extrabold leading-tight">Your order is waiting for payment</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
              Pay before {clock(waiting.paymentDeadline)}
              {waiting.deliveryTime ? ` to join the ${waiting.deliveryTime} batch` : ' to keep your batch'}.
            </p>
            <span className="inline-block mt-2 text-[11px] font-bold text-white bg-[#0e9f55] px-3 py-1 rounded-full">Pay now ›</span>
          </button>
        ) : announcement ? (
          /* 3. announcement */
          <div className="mt-3 relative rounded-2xl bg-white/92 dark:bg-slate-900/92 text-slate-900 dark:text-white p-3 pr-9 shadow-sm">
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismissAnnouncement}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {announcement.title && <p className="text-sm font-extrabold leading-tight">{announcement.title}</p>}
            {announcement.message && (
              <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">{announcement.message}</p>
            )}
            {announcement.buttonLabel && announcement.buttonTarget && (
              <button
                type="button"
                onClick={() => onAnnouncementAction(announcement)}
                className="mt-2 text-[11px] font-bold text-white bg-[#0e9f55] px-3 py-1.5 rounded-full cursor-pointer"
              >
                {announcement.buttonLabel} ›
              </button>
            )}
          </div>
        ) : (
          /* 4. greeting: two lines at the top (clear of the sky), then the live line and My orders in one row */
          <div className="mt-1">
            <div className={plain ? '' : 'pr-[96px]'}>
              <h1 className={`${isGuest ? 'text-[24px]' : 'text-[23px]'} font-extrabold tracking-tight leading-tight`}>
                {isGuest ? (
                  'Welcome to Roomly Caritas'
                ) : (
                  <>
                    <span className="block text-[18px] font-bold opacity-90">
                      {dayPart}
                      {name ? ',' : ''}
                    </span>
                    {/* The name on its own line, so long names fit */}
                    {name && <span className={`block mt-0.5 text-[28px] leading-tight break-words ${nameColor}`}>{name}</span>}
                  </>
                )}
              </h1>
              {!isGuest && (
                <p className={`text-[14px] font-medium leading-snug mt-2 ${softText}`}>{isNew ? 'Welcome to Roomly.' : 'Welcome back to Roomly.'}</p>
              )}
              {/* Signed-in students: just the greeting, no extra lines */}
              {isGuest && (
                <p className="text-[13px] opacity-90 leading-snug mt-1.5">
                  {caritasLine || 'Food and everyday items delivered to your room or the school gate.'}
                </p>
              )}
            </div>
            <div className={`${plain ? 'mt-3' : 'mt-4 mb-1'} flex items-center justify-between gap-3`}>
              {isGuest && live.text ? (
                <span className={`min-w-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-bold leading-snug backdrop-blur-sm ${chipBg}`}>
                  <span className={`w-[7px] h-[7px] shrink-0 rounded-full ${live.open ? 'bg-emerald-400 rb-twinkle' : 'bg-amber-300'}`} />
                  <span className="min-w-0">{live.text}</span>
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={isGuest ? onStart : onOpenOrders}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-white shadow-sm ${buttonInk}`}
              >
                {isGuest ? 'Start ordering ›' : 'My orders ›'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
