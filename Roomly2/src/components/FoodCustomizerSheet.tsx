import React, { useState } from 'react';
import { NoPhoto } from './NoPhoto';
import { X, Plus, Minus, Utensils, AlertCircle } from 'lucide-react';
import { Product } from '../config';
import { CartItem } from '../types';

interface FoodCustomizerSheetProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const FoodCustomizerSheet: React.FC<FoodCustomizerSheetProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  if (!product) return null;

  // plates can be 0 for students who only want to buy chicken/beef/sides!
  const [plates, setPlates] = useState<number>(1);
  const [extraQuantities, setExtraQuantities] = useState<Record<string, number>>({});
  const [specialNote, setSpecialNote] = useState<string>('');
  const [choiceId, setChoiceId] = useState<string>('');

  // This item's own extras and its "pick one" choice (e.g. Swallow), set in Admin
  // Switched off in Today's menu = not available today
  const extrasList = (product.extras || []).filter((e) => !e.off);
  const choices = (product.choices || []).filter((c) => !c.off);
  const choiceTitle = (product.choiceTitle || 'Choose one').trim();
  const chosen = choices.find((c) => c.id === choiceId);
  const canZeroPlate = extrasList.length > 0;
  const [imageError, setImageError] = useState(false);

  const updateExtraQty = (extraId: string, delta: number) => {
    setExtraQuantities((prev) => {
      const current = prev[extraId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[extraId];
        return copy;
      }
      return { ...prev, [extraId]: next };
    });
  };

  // Calculations
  const baseFoodCost = plates * product.price + (chosen && plates > 0 ? chosen.price * plates : 0);

  const selectedExtrasList = extrasList.map((extra) => ({
    id: extra.id,
    name: extra.name,
    price: extra.price,
    quantity: extraQuantities[extra.id] || 0,
  })).filter((e) => e.quantity > 0);

  const extrasCost = selectedExtrasList.reduce(
    (sum, extra) => sum + extra.price * extra.quantity,
    0
  );

  const totalPrice = baseFoodCost + extrasCost;
  const totalItemCount = plates + selectedExtrasList.reduce((sum, e) => sum + e.quantity, 0);
  const choiceMissing = plates > 0 && choices.length > 0 && !chosen;
  const isValidOrder = plates > 0 ? !choiceMissing : selectedExtrasList.length > 0;

  const handleAdd = () => {
    if (!isValidOrder) return;

    // Build custom title and id
    const isProteinOnly = plates === 0;
    const itemName = isProteinOnly
      ? `Extras only, ${product.name} (${selectedExtrasList.map((e) => `${e.quantity}x ${e.name}`).join(', ')})`
      : `${product.name}${chosen ? ` with ${chosen.name}` : ''} (${plates} ${plates === 1 ? 'plate' : 'plates'})`;
    // The choice goes in as a line of its own (one per plate) so the cart and the vendor can see it
    const cartExtras = [
      ...(chosen && plates > 0 ? [{ id: `choice-${chosen.id}`, name: `${choiceTitle}: ${chosen.name}`, price: chosen.price, quantity: plates }] : []),
      ...selectedExtrasList,
    ];

    const extrasKey = cartExtras
      .map((e) => `${e.id}x${e.quantity}`)
      .sort()
      .join('-');
    const cartId = `${product.id}-p${plates}-${extrasKey || 'none'}-${Date.now()}`;

    const cartItem: CartItem = {
      id: cartId,
      productId: product.id,
      name: itemName,
      unitPrice: totalPrice,
      quantity: 1,
      totalPrice: totalPrice,
      imageUrl: product.imageUrl,
      emoji: isProteinOnly ? '' : product.emoji,
      isFood: true,
      source: product.source,
      plates: plates,
      extras: cartExtras,
      specialNote: specialNote.trim() || undefined,
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border-t border-slate-200/80 dark:border-slate-800">
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {product.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ₦{product.price.toLocaleString()} per plate{canZeroPlate ? ' · Extras can be ordered alone' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Visual Showcase */}
          {product.imageUrl && !imageError ? (
            <div className="w-full h-36 rounded-2xl overflow-hidden relative shadow-inner">
              <img
                src={product.imageUrl}
                alt={product.name}
                onError={() => setImageError(true)}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-2.5 left-3 text-white">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#0e9f55]">
                  Hot & Fresh
                </span>
              </div>
            </div>
          ) : (
            <div
              className={`w-full h-24 rounded-2xl bg-gradient-to-br ${product.gradient} flex items-center justify-center`}
            >
              <NoPhoto name={product.name} className="text-4xl" />
            </div>
          )}

          {/* Plates Stepper (Zero plate enabled!) */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Food Plates
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {plates === 0 ? '0 plates (Proteins/Sides only)' : `${plates} plate(s) of ${product.name}`}
                </span>
              </div>

              {/* Stepper with 0 support */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setPlates((p) => Math.max(canZeroPlate ? 0 : 1, p - 1))}
                  disabled={plates === (canZeroPlate ? 0 : 1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Decrease plates"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-6 text-center font-bold text-sm font-mono tabular-nums text-slate-900 dark:text-white">
                  {plates}
                </span>
                <button
                  type="button"
                  onClick={() => setPlates((p) => p + 1)}
                  className="w-8 h-8 rounded-lg bg-[#0e9f55] text-white flex items-center justify-center hover:bg-[#0b8044] transition-colors cursor-pointer"
                  aria-label="Increase plates"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {plates === 0 && (
              <p className="text-[11px] text-[#0e9f55] dark:text-emerald-400 font-medium">
                Set to 0 plates: you can pick just the extras below.
              </p>
            )}
          </div>

          {/* Pick one (e.g. Swallow), added per plate */}
          {choices.length > 0 && plates > 0 && (
            <div className="space-y-2.5">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${choiceMissing ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {choiceTitle} (pick one)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {choices.map((c) => {
                  const on = c.id === choiceId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChoiceId(c.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        on
                          ? 'border-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/40 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-sm font-semibold block">{c.name}</span>
                      <span className="text-xs font-mono font-bold text-[#0e9f55]">
                        {c.price > 0 ? `+₦${c.price.toLocaleString()} per plate` : 'No extra charge'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Proteins & Extras with individual quantity steppers */}
          {extrasList.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add Protein & Extras (Pick any quantity)
              </h3>
              {Object.keys(extraQuantities).length > 0 && (
                <button
                  type="button"
                  onClick={() => setExtraQuantities({})}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              {extrasList.map((extra) => {
                const qty = extraQuantities[extra.id] || 0;
                const isSelected = qty > 0;

                return (
                  <div
                    key={extra.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[#0e9f55] bg-emerald-50/60 dark:bg-emerald-950/40 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <span className="text-sm font-semibold block">{extra.name}</span>
                      <span className="text-xs font-mono font-bold text-[#0e9f55]">
                        +₦{extra.price.toLocaleString()} each
                      </span>
                    </div>

                    {/* Quantity Stepper for each extra */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-xs">
                      <button
                        type="button"
                        onClick={() => updateExtraQty(extra.id, -1)}
                        disabled={qty === 0}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer transition-colors"
                        aria-label={`Decrease ${extra.name}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-5 text-center text-xs font-bold font-mono tabular-nums">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateExtraQty(extra.id, 1)}
                        className="w-7 h-7 rounded-lg bg-[#0e9f55] text-white flex items-center justify-center hover:bg-[#0b8044] cursor-pointer transition-colors"
                        aria-label={`Increase ${extra.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Special Instructions Note */}
          <div className="space-y-1.5">
            <label
              htmlFor="special-note"
              className="text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Special Instructions (optional)
            </label>
            <input
              id="special-note"
              type="text"
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
              placeholder="e.g. Extra spicy, separate sauce, foil wrapped..."
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]"
            />
          </div>
        </div>

        {/* Pinned Bottom CTA Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!isValidOrder}
            className="w-full h-12 bg-[#0e9f55] hover:bg-[#0b8044] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center justify-between px-5 shadow-lg shadow-[#0e9f55]/20 active:scale-[0.99] transition-all cursor-pointer"
          >
            <span>
              {!isValidOrder
                ? choiceMissing
                  ? `Pick your ${choiceTitle.toLowerCase()}`
                  : 'Select plates or extras'
                : plates === 0
                ? 'Add extras only to cart'
                : `Add to cart (${plates} ${plates === 1 ? 'plate' : 'plates'})`}
            </span>
            <span className="font-mono text-base">₦{totalPrice.toLocaleString()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
