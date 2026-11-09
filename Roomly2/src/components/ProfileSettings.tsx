import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { updateMyProfile } from '../api.js';

/**
 * Student settings: the name Roomly calls them, their PIN, and their phone number.
 * Every change asks for the current PIN first, so nobody can take over someone else's account.
 */
export const ProfileSettings: React.FC<{
  phone: string;
  callName: string;
  fullName: string;
  onClose: () => void;
  onSaved: (next: { phone: string; pin: string }) => void;
}> = ({ phone, callName, fullName, onClose, onSaved }) => {
  const [name, setName] = useState(callName || fullName.trim().split(/\s+/)[0] || '');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const field =
    'w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';

  const save = async () => {
    setError('');
    setDone('');
    if (!/^\d{4,6}$/.test(pin)) return setError('Enter your current PIN to save changes.');
    if (newPin && !/^\d{4}$/.test(newPin)) return setError('Your new PIN must be 4 digits.');
    setBusy(true);
    try {
      const res = await updateMyProfile(phone, pin, {
        callName: name,
        newPhone: newPhone.trim() || undefined,
        newPin: newPin || undefined,
      });
      setDone(newPhone || newPin ? 'Saved. Use your new details next time you sign in.' : 'Saved.');
      onSaved(res);
      setPin('');
      setNewPin('');
      setNewPhone('');
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-[460px] max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">What should we call you?</span>
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className={field} placeholder="e.g. Dera" />
          <span className="block mt-1 text-[10px] text-slate-400">Only used to greet you in the app. Runners and vendors still see your full name.</span>
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
            New phone number <span className="font-normal text-slate-400">(leave empty to keep {phone})</span>
          </span>
          <input value={newPhone} inputMode="numeric" maxLength={11} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))} className={field} placeholder="08012345678" />
          <span className="block mt-1 text-[10px] text-slate-400">Your order history moves to the new number.</span>
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
            New PIN <span className="font-normal text-slate-400">(4 digits, leave empty to keep it)</span>
          </span>
          <input value={newPin} inputMode="numeric" maxLength={4} type="password" onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} className={field} placeholder="••••" />
          <span className="block mt-1 text-[10px] text-slate-400">Don't use your bank or ATM PIN.</span>
        </label>

        <label className="block pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="block text-[11px] font-bold text-slate-900 dark:text-white mb-1">Your current PIN</span>
          <input value={pin} inputMode="numeric" maxLength={6} type="password" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={field} placeholder="••••" />
          <span className="block mt-1 text-[10px] text-slate-400">Needed for any change, so nobody else can change your account.</span>
        </label>

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        {done && <p className="text-xs font-semibold text-[#0e9f55]">{done}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
        </button>
      </div>
    </div>
  );
};
