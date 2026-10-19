import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';

interface FloatingCartBarProps {
  totalItems: number;
  totalPrice: number;
  hasCustomRequest: boolean;
  onOpenCart: () => void;
}

export const FloatingCartBar: React.FC<FloatingCartBarProps> = ({
  totalItems,
  totalPrice,
  hasCustomRequest,
  onOpenCart,
}) => {
  if (totalItems === 0 && !hasCustomRequest) return null;

  return (
    <div className="fixed bottom-3 left-0 right-0 z-40 px-4 max-w-[480px] mx-auto pointer-events-none">
      <button
        type="button"
        onClick={onOpenCart}
        className="pointer-events-auto w-full h-14 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-2xl shadow-xl shadow-[#0e9f55]/30 flex items-center justify-between px-4 active:scale-[0.98] transition-all cursor-pointer border border-emerald-400/30"
      >
        {/* Left: Item Counter & Bag */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center relative">
            <ShoppingBag className="w-4 h-4 text-white" />
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-white text-[#0e9f55] font-extrabold text-[10px] flex items-center justify-center font-mono">
              {totalItems + (hasCustomRequest ? 1 : 0)}
            </span>
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-emerald-100 block leading-tight">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
              {hasCustomRequest ? ' + 1 custom request' : ''}
            </span>
            <span className="text-base font-extrabold font-mono tracking-tight leading-none">
              ₦{totalPrice.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Right: View Cart Trigger */}
        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-xl text-xs font-bold text-white">
          <span>View Cart</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </button>
    </div>
  );
};
