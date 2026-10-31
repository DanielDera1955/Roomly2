import React, { useState } from 'react';
import { X, Loader2, MessageCircle, CheckCircle2 } from 'lucide-react';
import { FEEDBACK_TYPES, sendFeedback } from '../api.js';

interface Props {
  onClose: () => void;
  /** Signed-in student: their number and profile go with the message */
  phone?: string;
  info?: { name?: string; hostel?: string; ordersCount?: number; lastOrderId?: string };
  whatsAppNumber: string;
}

/** "Suggest a feature or send a complaint": a short form that lands in Admin > Feedback */
export const FeedbackBox: React.FC<Props> = ({ onClose, phone = '', info = {}, whatsAppNumber }) => {
  const [type, setType] = useState('');
  const [message, setMessage] = useState('');
  const [myPhone, setMyPhone] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const signedIn = Boolean(phone);

  const send = async () => {
    setError('');
    setBusy(true);
    try {
      await sendFeedback(type, message, myPhone, info);
      setSent(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-black text-slate-900 dark:text-white">Suggest a feature or send a complaint</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-[#0e9f55] mx-auto" />
            <p className="text-base font-black text-slate-900 dark:text-white">Thanks, Roomly has received it.</p>
            <p className="text-xs text-slate-500">{myPhone ? 'We may reach you on WhatsApp if we need more details.' : 'Every message is read.'}</p>
            <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-[#0e9f55] text-white text-sm font-bold cursor-pointer">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">What is it about?</p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TYPES.map((t: string) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`h-10 px-4 rounded-full text-xs font-bold border cursor-pointer ${
                      type === t
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#0e9f55] text-[#0e9f55]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Your message</p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                rows={5}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30"
                placeholder="Tell us what to add, what went wrong or how we can do better."
              />
              <p className="text-right text-[10px] text-slate-400">{message.length}/500</p>
            </div>
            {signedIn ? (
              <p className="text-[11px] text-slate-500">Sent with your number ({phone}) so Roomly can reply.</p>
            ) : (
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Phone number (optional, so we can reply)</p>
                <input
                  value={myPhone}
                  onChange={(e) => setMyPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  inputMode="numeric"
                  className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                  placeholder="080..."
                />
              </div>
            )}
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className="w-full h-12 rounded-2xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send to Roomly
            </button>
            <a
              href={`https://wa.me/${whatsAppNumber}?text=${encodeURIComponent('Hi Roomly, I have an urgent problem with my order: ')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs font-semibold text-slate-500 leading-relaxed"
            >
              <MessageCircle className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-[#0e9f55]" />
              Urgent problem with an order right now? <span className="font-bold text-[#0e9f55] whitespace-nowrap">Chat on WhatsApp</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
