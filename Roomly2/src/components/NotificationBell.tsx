import React, { useEffect, useState } from 'react';
import { Bell, X, Volume2, VolumeX } from 'lucide-react';
import { useNotices } from '../notices';
import { isSoundOn, setSoundOn } from '../sound';

/** Bell with a red unread count. Replaces the sound button; sound is switched inside the panel. */
export const NotificationBell: React.FC<{ phone?: string; signedIn: boolean; className?: string }> = ({ phone = '', signedIn, className = '' }) => {
  const { notices, unread, markSeen, groupLink } = useNotices(phone, signedIn);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(isSoundOn());
  useEffect(() => {
    const sync = () => setSound(isSoundOn());
    window.addEventListener('roomly-sound', sync);
    return () => window.removeEventListener('roomly-sound', sync);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className={`relative p-2 rounded-xl cursor-pointer ${className}`}
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-black leading-4 text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center bg-black/50">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative mt-16 sm:mt-0 w-[calc(100%-24px)] max-w-[420px] max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Notifications</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {!signedIn ? (
              <p className="text-sm text-slate-500">Sign in to see your notices, like a Games credit you have won.</p>
            ) : notices.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing new right now.</p>
            ) : (
              <div className="space-y-2">
                {notices.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.text}</p>
                  </div>
                ))}
              </div>
            )}
            {signedIn && groupLink && (
              <a href={groupLink} target="_blank" rel="noreferrer" className="block w-full h-11 leading-[44px] rounded-xl bg-[#0e9f55] text-white text-sm font-bold text-center">
                Official WhatsApp group
              </a>
            )}
            <button
              type="button"
              onClick={() => setSoundOn(!sound)}
              className="w-full flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
            >
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                {sound ? <Volume2 className="w-4 h-4 text-[#0e9f55]" /> : <VolumeX className="w-4 h-4 text-slate-400" />} Notification sound
              </span>
              <span className={`w-11 h-6 rounded-full p-0.5 ${sound ? 'bg-[#0e9f55]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${sound ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
