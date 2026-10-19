import React, { useEffect, useState } from 'react';
import { Lock, LogOut } from 'lucide-react';
import { subscribeStaff, loginStaff, logoutStaff } from '../api.js';

interface StaffGateProps {
  role: 'admin' | 'runner';
  onBack: () => void;
  children: React.ReactNode;
}

/**
 * Real login for runners and admin (Firebase Auth).
 * Runners sign in with their phone number or email + password. Admin uses email + password.
 */
export const StaffGate: React.FC<StaffGateProps> = ({ role, onBack, children }) => {
  const [state, setState] = useState<any>({ ready: false, staff: null, denied: false });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeStaff(setState), []);

  const staff = state.staff;
  const allowed = staff && (staff.role === role || (role === 'runner' && staff.role === 'admin'));

  if (allowed) {
    // Tell the existing admin screen that the real login has succeeded
    if (staff.role === 'admin') sessionStorage.setItem('roomly_admin_auth', 'true');
    return <>{children}</>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await loginStaff(identifier, password);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Could not sign in.');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center px-4 py-8">
      <div className="max-w-xs mx-auto w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#0e9f55]/10 text-[#0e9f55] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {role === 'admin' ? 'Roomly Admin Login' : 'Roomly Runner Login'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin' ? 'Sign in with your admin email and password' : 'Sign in with your phone number or email and password'}
          </p>
        </div>

        {!state.ready ? (
          <p className="text-xs text-slate-400">Checking sign-in…</p>
        ) : staff && !allowed ? (
          <div className="space-y-3">
            <p className="text-xs text-rose-500 font-medium">This account cannot open this page.</p>
            <button
              type="button"
              onClick={() => logoutStaff()}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-left">
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={role === 'admin' ? 'Email' : 'Phone number or email'}
              className="w-full px-3 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]"
            />
            {(error || state.denied) && (
              <p className="text-xs text-rose-500 font-medium">
                {error || 'This account is not set up as a runner or admin.'}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !identifier || !password}
              className="w-full py-2.5 bg-[#0e9f55] hover:bg-[#0b8044] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
          Back to store
        </button>
      </div>
    </div>
  );
};
