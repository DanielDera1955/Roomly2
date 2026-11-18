import React, { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { enablePush, disablePush, sendTestPush, pushConfigured, pushSupported, pushToken } from '../push';
import { isIPhone, isInstalled, notificationsBlocked } from '../notify';

/** "Notify me": batch alerts on the phone even when Roomly is closed. One tap, then the phone's Allow popup. */
export const NotifyBanner: React.FC<{ pk?: string; className?: string }> = ({ pk = '', className = '' }) => {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(Boolean(pushToken()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    pushSupported().then(setOk);
  }, []);

  if (!ok || !pushConfigured()) return null;
  // iPhone only allows alerts from the home screen version: the install bar above explains that
  if (isIPhone() && !isInstalled()) return null;

  const turnOn = async () => {
    setBusy(true);
    setMsg('');
    const r = await enablePush(pk);
    setBusy(false);
    if (r === 'ok') setOn(true);
    else if (r === 'denied' || notificationsBlocked()) setMsg('Notifications are blocked for Roomly. Allow them in your browser or phone settings, then tap again.');
    else setMsg('Could not turn on alerts here. Try again in Chrome.');
  };

  if (on) {
    return (
      <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-[11px] text-emerald-900 dark:text-emerald-100 ${className}`}>
        <span className="font-semibold">Batch alerts are on.</span>
        <span className="flex gap-3 font-bold">
          <button
            type="button"
            className="underline cursor-pointer"
            onClick={async () => setMsg((await sendTestPush()) ? 'Test sent. It should arrive in a few seconds.' : 'Could not send the test.')}
          >
            Send test
          </button>
          <button
            type="button"
            className="underline cursor-pointer"
            onClick={async () => {
              await disablePush();
              setOn(false);
              setMsg('');
            }}
          >
            Turn off
          </button>
        </span>
        {msg && <span className="basis-full text-[11px]">{msg}</span>}
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-100 space-y-2 ${className}`}>
      <p className="flex items-start gap-2">
        <Bell className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
        <span className="font-semibold">Get an alert an hour before each batch closes, so you never miss your meal.</span>
      </p>
      <button type="button" disabled={busy} onClick={turnOn} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-600 text-white font-bold cursor-pointer disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Notify me
      </button>
      {msg && <p className="text-[11px] text-rose-700 dark:text-rose-300">{msg}</p>}
    </div>
  );
};
