import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Gaming } from './Gaming';

/** Games and the Roomly Hostel League: its own page, opened from the Home card (no longer a Hostel Hub tab) */
export const GamesPage: React.FC<{
  session: { name?: string; phone?: string; pin?: string };
  initialGame?: string;
  onClose: () => void;
}> = ({ session, initialGame, onClose }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-100 dark:bg-slate-950">
      <div className="max-w-[480px] mx-auto min-h-full px-3 pb-10">
        <div className="flex items-center gap-3 pt-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Games</h1>
        </div>
        <Gaming session={session} initialGame={initialGame} />
      </div>
    </div>
  );
};
