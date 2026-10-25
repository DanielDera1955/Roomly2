import React, { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { subscribeAnnouncement, saveAnnouncement, clearAnnouncement } from '../api.js';
import { Announcement, announcementActive } from '../config';

const field =
  'w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30 focus:border-[#0e9f55]';
const label = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';

/** Admin: one announcement at a time, shown on the home banner when no order needs the space. */
export const AnnouncementsPanel: React.FC = () => {
  const [saved, setSaved] = useState<Announcement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonType, setButtonType] = useState<'search' | 'whatsapp' | 'link'>('search');
  const [buttonTarget, setButtonTarget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repeatFriday, setRepeatFriday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const unsub = subscribeAnnouncement((a: Announcement | null) => {
      setSaved(a);
      if (!loaded && a && a.on !== false) {
        setTitle(a.title || '');
        setMessage(a.message || '');
        setButtonLabel(a.buttonLabel || '');
        setButtonType(a.buttonType || 'search');
        setButtonTarget(a.buttonTarget || '');
        setStartDate(a.startDate || '');
        setEndDate(a.endDate || '');
        setRepeatFriday(Boolean(a.repeatFriday));
      }
      setLoaded(true);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = saved && saved.on !== false;
  const showing = announcementActive(saved);

  const handleSave = async () => {
    setNote('');
    if (!title.trim() && !message.trim()) {
      setNote('Add a title or a message first.');
      return;
    }
    if (buttonLabel.trim() && !buttonTarget.trim()) {
      setNote('The button needs a target: what to search for, a WhatsApp number or a link.');
      return;
    }
    setBusy(true);
    try {
      await saveAnnouncement({
        title: title.trim(),
        message: message.trim(),
        buttonLabel: buttonLabel.trim(),
        buttonType,
        buttonTarget: buttonTarget.trim(),
        startDate,
        endDate,
        repeatFriday,
      });
      setNote('Saved. Students see it when they have no order that needs the banner.');
    } catch (e: any) {
      setNote(e?.message || 'Could not save. Check that the Firebase rules were republished.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await clearAnnouncement();
      setNote('Announcement stopped.');
    } catch (e: any) {
      setNote(e?.message || 'Could not stop it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Megaphone className="w-4 h-4 text-[#0e9f55]" /> Home announcement
        </h3>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            showing ? 'bg-emerald-50 text-[#0e9f55]' : live ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {showing ? 'Showing now' : live ? 'Scheduled' : 'Off'}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        One at a time. A student with an order on the way, or an order waiting for payment, sees that first. Everyone else sees this.
        Students can dismiss it.
      </p>

      <div>
        <label className={label}>Title</label>
        <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Friday sports kit" />
      </div>
      <div>
        <label className={label}>Message</label>
        <textarea
          className={field}
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={140}
          placeholder="Red shorts, white jersey, socks and sports shoes. Order before Friday morning."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Button text (optional)</label>
          <input className={field} value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} maxLength={24} placeholder="See the kit" />
        </div>
        <div>
          <label className={label}>Button does</label>
          <select className={field} value={buttonType} onChange={(e) => setButtonType(e.target.value as any)}>
            <option value="search">Search the shop</option>
            <option value="whatsapp">Open WhatsApp</option>
            <option value="link">Open a link</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label}>
          {buttonType === 'search' ? 'Search for' : buttonType === 'whatsapp' ? 'WhatsApp number (digits only, with country code)' : 'Link'}
        </label>
        <input
          className={field}
          value={buttonTarget}
          onChange={(e) => setButtonTarget(e.target.value)}
          placeholder={buttonType === 'search' ? 'sports' : buttonType === 'whatsapp' ? '2348012345678' : 'https://'}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Start date (optional)</label>
          <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={label}>End date (optional)</label>
          <input type="date" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={repeatFriday}
          onChange={(e) => setRepeatFriday(e.target.checked)}
          className="w-4 h-4 accent-[#0e9f55]"
        />
        Repeat every Friday (shows Thursday from 5pm until Friday 12 noon)
      </label>

      {note && <p className="text-[11px] text-slate-600 dark:text-slate-300">{note}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-[#0e9f55] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
        >
          {live ? 'Update announcement' : 'Publish announcement'}
        </button>
        {live && (
          <button
            type="button"
            disabled={busy}
            onClick={handleStop}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-60"
          >
            Stop it
          </button>
        )}
      </div>
    </div>
  );
};
