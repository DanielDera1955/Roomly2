import React, { useState } from 'react';
import { Plus, Minus, Utensils } from 'lucide-react';
import { Product } from '../config';

interface ProductCardProps {
  product: Product;
  quantity: number;
  onAdd: (product: Product) => void;
  onRemove: (productId: string) => void;
  onOpenFoodCustomizer?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantity,
  onAdd,
  onRemove,
  onOpenFoodCustomizer,
}) => {
  const [imageError, setImageError] = useState(false);

  const handleCardClick = () => {
    if (product.isFood && onOpenFoodCustomizer) {
      onOpenFoodCustomizer(product);
    }
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.isFood && onOpenFoodCustomizer) {
      onOpenFoodCustomizer(product);
    } else {
      onAdd(product);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(product.id);
  };

  const hasRealImage = product.imageUrl && !imageError;

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all ${
        product.isFood ? 'cursor-pointer' : ''
      }`}
    >
      <div>
        {/* Product Visual Area */}
        <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
          {hasRealImage ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={() => setImageError(true)}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div
              className={`w-full h-full bg-gradient-to-br ${product.gradient} flex items-center justify-center p-3 select-none`}
            >
              <span className="text-4xl filter drop-shadow-sm">{product.emoji}</span>
            </div>
          )}

          {/* Food Indicator Badge */}
          {product.isFood && (
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-semibold text-white flex items-center gap-1">
              <Utensils className="w-2.5 h-2.5" />
              <span>Customize</span>
            </div>
          )}
        </div>

        {/* Product Title & Info */}
        <div className="mt-2.5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
            {product.name}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
            {product.unit || product.description || ''}
          </p>
        </div>
      </div>

      {/* Price & Action row */}
      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
        <div>
          <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono tabular-nums">
            ₦{product.price.toLocaleString()}
          </span>
          {product.isFood && (
            <span className="block text-[10px] text-slate-400 leading-none">base</span>
          )}
        </div>

        {/* Action Button */}
        {product.isFood ? (
          <button
            type="button"
            onClick={handleAddClick}
            className="px-2.5 py-1.5 bg-[#0e9f55]/10 hover:bg-[#0e9f55] text-[#0e9f55] hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        ) : quantity > 0 ? (
          /* Stepper: - QTY + */
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center bg-[#0e9f55] text-white rounded-xl p-0.5 shadow-xs"
          >
            <button
              type="button"
              onClick={handleRemoveClick}
              className="w-6 h-6 flex items-center justify-center hover:bg-black/15 rounded-lg transition-colors cursor-pointer"
              aria-label="Decrease quantity"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-xs font-bold font-mono tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={handleAddClick}
              className="w-6 h-6 flex items-center justify-center hover:bg-black/15 rounded-lg transition-colors cursor-pointer"
              aria-label="Increase quantity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Single Add Button */
          <button
            type="button"
            onClick={handleAddClick}
            className="px-3 py-1.5 bg-[#0e9f55] hover:bg-[#0b8044] text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        )}
      </div>
    </div>
  );
};
