import React from 'react';
import { X } from 'lucide-react';
import { OrderRecord } from '../types';
import { Announcement } from '../config';
import { paymentState } from '../api.js';

type DayPart = 'Good morning' | 'Good afternoon' | 'Good evening';

const STEPS = ['Received', 'Packing', 'On the way', 'Delivered'] as const;

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
  onNotYou: () => void;
}

/**
 * The banner at the top of the home screen for signed-in students.
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
  onNotYou,
}) => {
  const morning = dayPart === 'Good morning';
  const afternoon = dayPart === 'Good afternoon';
  const sky = morning
    ? 'linear-gradient(180deg,#fb923c 0%,#fbbf24 45%,#fde68a 100%)'
    : afternoon
    ? 'linear-gradient(180deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)'
    : 'linear-gradient(180deg,#1e1b4b 0%,#312e81 55%,#0e7490 100%)';
  const ink = morning ? 'text-orange-950' : 'text-white';

  const now = new Date();
  const onTheWay = orders.filter(
    (o) => o.paymentStatus !== 'unpaid' && (o.status === 'Received' || o.status === 'Packing' || o.status === 'On the way')
  );
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

  const stepIdx = trackOrder ? Math.max(0, STEPS.indexOf(trackOrder.status as (typeof STEPS)[number])) : 0;
  const carrier = trackOrder ? firstWord(trackOrder.runnerName || trackOrder.operatorName) : '';
  const stars: Array<[number, number, number]> = [
    [190, 40, 0],
    [235, 70, 0.6],
    [262, 34, 1.2],
    [205, 96, 0.3],
    [290, 110, 0.9],
  ];

  return (
    <div className={`relative overflow-hidden rounded-3xl p-4 min-h-[176px] shadow-md ${ink}`} style={{ background: sky }}>
      <style>{`
        @keyframes rb-drift { 0% { transform: translateX(-14px); } 50% { transform: translateX(14px); } 100% { transform: translateX(-14px); } }
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

      {/* scenery */}
      {morning && (
        <div
          className="rb-glow absolute right-5 top-12 w-14 h-14 rounded-full bg-orange-50"
          style={{ boxShadow: '0 0 40px 14px rgba(255,237,213,.8)' }}
        />
      )}
      {afternoon && (
        <>
          <div
            className="rb-glow absolute right-6 top-12 w-12 h-12 rounded-full bg-yellow-300"
            style={{ boxShadow: '0 0 30px 10px rgba(253,224,71,.6)' }}
          />
          <span className="rb-drift absolute right-[70px] top-14 w-[70px] h-5 rounded-full bg-white/85" />
          <span className="rb-drift-slow absolute right-5 top-[92px] w-[46px] h-3.5 rounded-full bg-white/85" />
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
            className="absolute right-[22px] top-12 w-10 h-10 rounded-full bg-amber-200 overflow-hidden"
            style={{ boxShadow: '0 0 30px 8px rgba(253,230,138,.35)' }}
          >
            <div className="absolute w-10 h-10 rounded-full left-[11px] -top-1.5" style={{ background: '#262266' }} />
          </div>
        </>
      )}
      <div className="absolute -left-8 -right-8 -bottom-12 h-20 rounded-[50%] bg-[#0e9f55]/55" />
      <div className="absolute left-[120px] -right-16 -bottom-14 h-20 rounded-[50%] bg-[#0b8044]/50" />

      <div className="relative z-10">
        {/* top strip: day part on the left, who is signed in on the right */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${morning ? 'text-orange-800' : 'opacity-90'}`}>{dayPart}</p>
          <button
            type="button"
            onClick={onNotYou}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer backdrop-blur-sm ${morning ? 'bg-white/45' : 'bg-white/20'}`}
          >
            {name ? `Hi ${name}` : 'Signed in'} · Not you?
          </button>
        </div>

        {trackOrder ? (
          /* 1. order on the way */
          <button
            type="button"
            onClick={() => onOpenOrder(trackOrder)}
            className="mt-3 w-full text-left rounded-2xl bg-white/92 dark:bg-slate-900/92 text-slate-900 dark:text-white p-3 shadow-sm cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-tight">
                  {trackOrder.status === 'On the way' ? 'Your order is on the way' : trackOrder.status === 'Packing' ? 'Your order is being packed' : 'Your order is received'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {[carrier ? `With ${carrier}` : '', trackOrder.deliveryTime ? `Arriving ${trackOrder.deliveryTime}` : ''].filter(Boolean).join(' · ') || 'Tap to see the details'}
                </p>
              </div>
              <span className="text-[11px] font-bold text-[#0e9f55] shrink-0">Open ›</span>
            </div>
            <div className="relative mt-3 mb-1">
              <div className="absolute left-[12%] right-[12%] top-[9px] h-0.5 bg-slate-200 dark:bg-slate-700" />
              <div
                className="absolute left-[12%] top-[9px] h-0.5 bg-[#0e9f55]"
                style={{ width: `${(stepIdx / (STEPS.length - 1)) * 76}%` }}
              />
              <div className="relative grid grid-cols-4">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex flex-col items-center">
                    <div className="h-5 flex items-end">
                      {i === stepIdx ? (
                        <span className="rb-bob text-base leading-none" aria-hidden>
                          🏃
                        </span>
                      ) : (
                        <span
                          className={`w-2.5 h-2.5 rounded-full mb-[5px] ${i < stepIdx ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-600'}`}
                        />
                      )}
                    </div>
                    <span
                      className={`mt-1 text-[10px] leading-none ${i === stepIdx ? 'font-extrabold text-[#0b8044] dark:text-[#0e9f55]' : 'text-slate-500 dark:text-slate-400'}`}
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
          /* 4. greeting */
          <div className="mt-1">
            <h1 className="text-[30px] font-extrabold tracking-tight leading-tight truncate">{isNew ? (name ? `Welcome, ${name}.` : 'Welcome.') : name || 'Welcome back'}</h1>
            <p className="text-[13px] opacity-90 max-w-[230px] leading-snug">
              {isNew ? 'Your food and other items, delivered in scheduled batches.' : `Nice to have you back.${hasUsuals ? ' Your usuals are one tap away.' : ''}`}
            </p>
            <button
              type="button"
              onClick={onOpenOrders}
              className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer backdrop-blur-sm ${
                morning ? 'bg-white/45' : 'bg-white/20'
              }`}
            >
              🛍 My orders ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
