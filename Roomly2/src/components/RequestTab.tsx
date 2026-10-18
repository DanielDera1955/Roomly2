import React, { useState } from 'react';
import { Send, AlertCircle, Sparkles, Check, Trash2 } from 'lucide-react';

interface RequestTabProps {
  customRequest: string;
  onSaveCustomRequest: (request: string) => void;
  onClearCustomRequest: () => void;
  onOpenCart: () => void;
}

export const RequestTab: React.FC<RequestTabProps> = ({
  customRequest,
  onSaveCustomRequest,
  onClearCustomRequest,
  onOpenCart,
}) => {
  const [text, setText] = useState(customRequest || '');
  const [justSaved, setJustSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSaveCustomRequest(text.trim());
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const sampleRequests = [
    '500 naira MTN recharge card',
    'Panadol Extra pack from pharmacy',
    'A4 printing and spiral binding (10 pages)',
    'Bag of pure sachet water (20 sachets)',
  ];

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 mb-2 text-[#0e9f55]">
          <Sparkles className="w-5 h-5" />
          <h2 className="font-extrabold text-base text-slate-900 dark:text-white">
            Custom Item or Campus Service
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Need something from outside campus, the market, or pharmacy not listed on Roomly?
          Tell us below and we will deliver it to your room door.
        </p>

        {/* Mandatory Policy Note */}
        <div className="mt-3.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <span className="font-bold">Important:</span> We will message you a price first.
            Custom requests are paid before we buy.
          </div>
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
      >
        <label
          htmlFor="custom-request-box"
          className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
        >
          What do you need?
        </label>
        <textarea
          id="custom-request-box"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 1 sachet of Panadol Extra, 1 cold Amstel Malta, and print 15 pages assignment at the library gate..."
          className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55] transition-all resize-none"
        />

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Common student requests:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sampleRequests.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setText(sample)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-left"
              >
                + {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex-1 h-11 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {justSaved ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Added to Order Cart!</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{customRequest ? 'Update Custom Request' : 'Add Request to Cart'}</span>
              </>
            )}
          </button>

          {customRequest && (
            <button
              type="button"
              onClick={() => {
                setText('');
                onClearCustomRequest();
              }}
              className="h-11 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center justify-center cursor-pointer"
              title="Remove request"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Active Request Indicator */}
      {customRequest && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0e9f55] block">
              In Your Cart
            </span>
            <p className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate mt-0.5">
              "{customRequest}"
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white text-xs font-bold hover:bg-[#0b8044] transition-colors cursor-pointer"
          >
            View Cart
          </button>
        </div>
      )}
    </div>
  );
};
