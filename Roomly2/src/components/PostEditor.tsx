import React, { useRef, useState } from 'react';
import { Camera, Check, Loader2 } from 'lucide-react';
import { uploadProductImage } from '../api.js';
import { vendorEditApi, hostelChoices } from '../shops.js';
import { HUB_TYPES, LONG_LIVED, blockedReason } from '../hub.js';

const input =
  'w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const label = 'block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1';
const secondary = 'h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer disabled:opacity-50';

const PRICE_FIELDS: Record<string, [string, string?]> = {
  service: ['Lowest price (₦)', 'Highest price (₦, optional)'],
  item: ['Price (₦)'],
  wanted: ['Budget (₦, optional)'],
  rent: ['Price per day (₦)'],
  charging: ['Charge to 50% (₦)', 'Charge to 100% (₦)'],
  water: ['Price per bucket (₦)'],
  lost: ['Reward (₦, optional)'],
  found: ['Collection fee (₦, optional)'],
};

/**
 * The private page for a Hub post the admin made for someone (opened from the same ?edit= link as vendor pages).
 * Everything goes through /api/vendor-edit, which finds the one post that belongs to this link.
 */
export const PostEditor: React.FC<{ token: string; initial: any }> = ({ token, initial }) => {
  const [post, setPost] = useState<any>(initial);
  const [title, setTitle] = useState(initial.title || '');
  const [price, setPrice] = useState(String(initial.price || ''));
  const [price2, setPrice2] = useState(String(initial.price2 || ''));
  const [note, setNote] = useState(initial.note || '');
  const [photo, setPhoto] = useState(initial.photo || '');
  const [hostel, setHostel] = useState(initial.hostel || '');
  const [room, setRoom] = useState(initial.room || '');
  const [showRoom, setShowRoom] = useState(Boolean(initial.showRoom));
  const hostels = Array.from(new Set([String(initial.hostel || ''), ...hostelChoices(initial.hostel, true)])).filter(Boolean);
  const [busy, setBusy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typeLabel = HUB_TYPES.find((t: any) => t.id === post.type)?.label || 'Post';
  const longLived = LONG_LIVED.includes(post.type);
  const [label1, label2] = PRICE_FIELDS[post.type] || ['Price (₦)'];
  const closed = post.status !== 'active';

  const run = async (key: string, fn: () => Promise<any>, okText: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const d = await fn();
      if (d?.post) setPost(d.post);
      setMsg({ ok: true, text: okText });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not do that. Try again.' });
    }
    setBusy('');
  };

  const save = () => {
    const blocked = blockedReason(post.type, title, []);
    if (blocked) {
      setMsg({ ok: false, text: blocked });
      return;
    }
    return run('save', () => vendorEditApi(token, 'save', { title, price: Number(price) || 0, price2: Number(price2) || 0, note, photo, hostel, room, showRoom }), 'Saved. Students see your changes now.');
  };
  const status = (action: string, okText: string) => run(action, () => vendorEditApi(token, 'status', { action }), okText);

  return (
    <div className="px-4 pt-2 pb-10 space-y-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0b8044] dark:text-emerald-400">Edit your post</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">{post.title}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {typeLabel} · {post.status === 'active' ? 'Showing to students' : post.status === 'sold' ? 'Closed' : 'Not showing'}. Only you have this link. Keep it private.
        </p>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <div>
          <label className={label}>Title</label>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>{label1}</label>
            <input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </div>
          {label2 && (
            <div>
              <label className={label}>{label2}</label>
              <input className={input} inputMode="numeric" value={price2} onChange={(e) => setPrice2(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Hostel</label>
            <select className={input} value={hostel} onChange={(e) => setHostel(e.target.value)}>
              {hostels.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Room (optional)</label>
            <input className={input} value={room} onChange={(e) => setRoom(e.target.value.slice(0, 20))} maxLength={20} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={showRoom} onChange={(e) => setShowRoom(e.target.checked)} className="accent-[#0e9f55]" />
          Show my room on the post
        </label>
        <div>
          <label className={label}>Details</label>
          <textarea className={`${input} h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-slate-400" />}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={secondary}>
            {uploading ? 'Uploading...' : photo ? 'Change photo' : 'Add photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                setPhoto(await uploadProductImage(f));
              } catch (err: any) {
                setMsg({ ok: false, text: err?.message || 'Photo upload failed.' });
              }
              setUploading(false);
            }}
          />
        </div>
        <button type="button" onClick={save} disabled={busy === 'save'} className="w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
      </div>

      <div className={`${card} p-4 space-y-2.5`}>
        <p className="text-sm font-black text-slate-900 dark:text-white">Your post</p>
        {post.type === 'charging' && !closed && (
          <button type="button" disabled={Boolean(busy)} onClick={() => status(post.chargingNow ? 'chargingOff' : 'chargingOn', post.chargingNow ? 'Switched off.' : 'Students see you are charging now.')} className={`${secondary} w-full`}>
            {post.chargingNow ? 'Stop charging now' : 'Charging available now'}
          </button>
        )}
        {longLived ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => status('confirm', 'Thanks. Your post stays up for another 30 days.')} className={`${secondary} w-full`}>
            Still available
          </button>
        ) : (
          <>
            <button type="button" disabled={Boolean(busy)} onClick={() => status('renew', 'Renewed for 7 days.')} className={`${secondary} w-full`}>
              Keep it up for 7 more days
            </button>
            {!closed && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => window.confirm('Mark this as done?') && status('sold', 'Marked as done.')}
                className={`${secondary} w-full`}
              >
                {post.type === 'wanted' ? 'I found it' : post.type === 'lost' || post.type === 'found' ? 'Back with owner' : 'Mark sold'}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => window.confirm('Remove this post? Your link will stop working.') && status('remove', 'Removed.')}
          className="w-full h-11 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-sm font-bold text-rose-700 dark:text-rose-300 cursor-pointer disabled:opacity-50"
        >
          Remove this post
        </button>
      </div>

      {msg && (
        <p className={`text-xs font-semibold flex items-center gap-1.5 ${msg.ok ? 'text-[#0e9f55]' : 'text-rose-600'}`}>
          {msg.ok && <Check className="w-3.5 h-3.5" />}
          {msg.text}
        </p>
      )}
    </div>
  );
};
