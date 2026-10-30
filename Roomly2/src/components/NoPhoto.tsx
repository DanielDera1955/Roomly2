import React from 'react';

/** Shown where a product or category has no photo: the first letter of its name in a soft colour (no emojis) */
export const NoPhoto: React.FC<{ name?: string; className?: string }> = ({ name, className = '' }) => (
  <span aria-hidden className={`font-black text-slate-300 dark:text-slate-600 select-none leading-none ${className}`}>
    {(String(name || '').trim()[0] || 'R').toUpperCase()}
  </span>
);
