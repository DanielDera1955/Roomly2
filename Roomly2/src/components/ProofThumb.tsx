import React, { useState } from 'react';
import { X } from 'lucide-react';
import { thumbUrl } from '../boardCore.js';

/** A small screenshot that opens full size on tap */
export const ProofThumb: React.FC<{ url: string; size?: number }> = ({ url, size = 40 }) => {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer" style={{ width: size, height: size }} aria-label="Open screenshot">
        <img src={thumbUrl(url, size * 3)} alt="Match screenshot" loading="lazy" className="w-full h-full object-cover" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3" onClick={() => setOpen(false)}>
          <img src={url} alt="Match screenshot" className="max-w-full max-h-full rounded-lg" />
          <button type="button" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-slate-800" />
          </button>
        </div>
      )}
    </>
  );
};

export default ProofThumb;
