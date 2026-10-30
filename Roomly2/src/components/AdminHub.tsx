import React, { useEffect, useMemo, useState } from 'react';
import {
  HUB_TYPES,
  GAMES,
  REPORT_REASONS,
  subscribeHubSettings,
  saveHubSettings,
  adminSubscribeAllListings,
  adminSubscribeReports,
  adminGetPrivate,
  adminRestoreListing,
  adminRemoveListing,
  adminBanPhone,
  adminUnbanPhone,
  adminSubscribeBans,
  adminSubscribeDisputes,
  adminResolveChallenge,
  adminSetGamerBan,
  adminGamerPhone,
  subscribeGamers,
  subscribeTournaments,
  subscribeEntries,
  adminSaveTournament,
  adminSetTournament,
  adminConfirmEntry,
  adminRemoveEntry,
  priceLabel,
  timeAgo,
  isLive,
} from '../hub.js';

const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3';
const input =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50';
const h = 'text-xs font-black uppercase tracking-wider text-slate-500';
const WEEK = 7 * 86400000;
const gameLabel = (id: string) => GAMES.find((g) => g.id === id)?.label || id;
const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label || id;

/** Admin > Hub: reports and bans, water switch, tournament account, gaming disputes and tournaments */
export const AdminHub: React.FC = () => {
  const [listings, setListings] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  useEffect(() => adminSubscribeAllListings(setListings), []);
  useEffect(() => adminSubscribeReports(setReports), []);
  useEffect(() => adminSubscribeBans(setBans), []);
  useEffect(() => subscribeHubSettings(setSettings), []);

  const now = Date.now();
  const flagged = listings.filter((l) => l.status !== 'removed' && (l.hidden || (l.reportCount || 0) > 0));
  const weekNew = listings.filter((l) => now - (l.createdAtMs || 0) < WEEK).length;
  const weekReports = reports.filter((r) => now - (r.atMs || 0) < WEEK).length;
  const live = listings.filter((l) => isLive(l, now, Boolean(settings.waterOn)));
  const contacts = listings.reduce((s, l) => s + (Number(l.contacts) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Numbers */}
      <div className={card}>
        <p className={h}>Hostel Hub this week</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['Showing', live.length],
            ['New (7 days)', weekNew],
            ['Contact taps', contacts],
            ['Reports (7 days)', weekReports],
          ].map(([label, n]) => (
            <div key={String(label)} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <p className="text-base font-black text-slate-900 dark:text-white">{n}</p>
              <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400">
          By section: {HUB_TYPES.map((t) => `${t.label} ${live.filter((l) => l.type === t.id).length}`).join(' · ')}. Contact taps are all-time.
        </p>
      </div>

      <HubSettings settings={settings} />

      {/* Reported */}
      <div className={card}>
        <p className={h}>Reported or hidden ({flagged.length})</p>
        {flagged.length === 0 && <p className="text-xs text-slate-400">Nothing to check.</p>}
        {flagged
          .sort((a, b) => Number(Boolean(b.stolenFlag)) - Number(Boolean(a.stolenFlag)))
          .map((l) => (
            <FlaggedRow key={l.id} l={l} reports={reports.filter((r) => r.listingId === l.id)} />
          ))}
      </div>

      {/* Bans */}
      <div className={card}>
        <p className={h}>Banned from posting ({bans.length})</p>
        {bans.length === 0 && <p className="text-xs text-slate-400">No one.</p>}
        {bans.map((b) => (
          <div key={b.phone} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {b.phone}
              {b.reason ? <span className="text-slate-400"> · {b.reason}</span> : null}
            </span>
            <button type="button" onClick={() => window.confirm(`Unban ${b.phone}?`) && adminUnbanPhone(b.phone)} className={`${btn} text-[#0e9f55]`}>
              Unban
            </button>
          </div>
        ))}
      </div>

      <Disputes />
      <AdminTournaments />
    </div>
  );
};

/* ------------------------------------------------------------------ */

const HubSettings: React.FC<{ settings: any }> = ({ settings }) => {
  const acc = settings.tourneyAccount || {};
  const [bank, setBank] = useState(acc.bank || '');
  const [number, setNumber] = useState(acc.number || '');
  const [name, setName] = useState(acc.name || '');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    setBank(acc.bank || '');
    setNumber(acc.number || '');
    setName(acc.name || '');
  }, [acc.bank, acc.number, acc.name]);

  const saveAccount = async () => {
    await saveHubSettings({ tourneyAccount: { bank: bank.trim(), number: number.replace(/\D/g, ''), name: name.trim() } });
    setSaved('Saved');
    window.setTimeout(() => setSaved(''), 2000);
  };

  return (
    <div className={card}>
      <p className={h}>Switches and accounts</p>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">Water scarcity</p>
          <p className="text-[11px] text-slate-500">ON shows the Water section so students can offer to fetch water.</p>
        </div>
        <button
          type="button"
          onClick={() => saveHubSettings({ waterOn: !settings.waterOn })}
          className={`${btn} ${settings.waterOn ? 'bg-[#0e9f55] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          {settings.waterOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-900 dark:text-white">Tournament entry account</p>
        <p className="text-[11px] text-slate-500">Students see this when they join a paid tournament. Use an account only for tournaments.</p>
        <div className="grid grid-cols-3 gap-2">
          <input value={bank} onChange={(e) => setBank(e.target.value)} className={input} placeholder="Bank" />
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" className={input} placeholder="Number" />
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Name" />
        </div>
        <button type="button" onClick={saveAccount} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
          {saved || 'Save account'}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const FlaggedRow: React.FC<{ l: any; reports: any[] }> = ({ l, reports }) => {
  const [priv, setPriv] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (l.isPhone) adminGetPrivate(l.id).then(setPriv).catch(() => {});
  }, [l.id, l.isPhone]);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy(false);
  };
  return (
    <div className={`p-3 rounded-xl text-xs space-y-2 ${l.stolenFlag ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="flex gap-2.5">
        {l.photo && <img src={l.photo} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">
            {l.stolenFlag ? '🚨 ' : ''}
            {l.title}
          </p>
          <p className="text-[11px] text-slate-500">
            {HUB_TYPES.find((t) => t.id === l.type)?.label} · {priceLabel(l)} · {l.name}, {l.hostel} · {l.phone} · {timeAgo(l.createdAtMs)}
          </p>
          <p className="text-[11px] text-slate-500">
            {l.reportCount || 0} report{l.reportCount === 1 ? '' : 's'} · {l.hidden ? 'Hidden' : 'Still showing'}
          </p>
        </div>
      </div>
      {reports.map((r) => (
        <p key={r.id} className="text-[11px] text-slate-600 dark:text-slate-300">
          • {reasonLabel(r.reason)}
          {r.note ? `: ${r.note}` : ''} <span className="text-slate-400">({timeAgo(r.atMs)})</span>
        </p>
      ))}
      {priv && (
        <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
          <p>IMEI: {priv.imei}</p>
          {priv.proof && (
            <a href={priv.proof} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
              Box or receipt photo
            </a>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={() => run(() => adminRestoreListing(l.id))} className={`${btn} bg-[#0e9f55] text-white`}>
          Restore
        </button>
        <button type="button" disabled={busy} onClick={() => run(() => adminRemoveListing(l.id))} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
          Remove
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const why = window.prompt(`Ban ${l.phone} from posting? Their listings come down. Reason (optional):`);
            if (why !== null) run(() => adminBanPhone(l.phone, why));
          }}
          className={`${btn} text-rose-600 border border-rose-200 dark:border-rose-900`}
        >
          Ban seller
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Disputes: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [gamers, setGamers] = useState<any[]>([]);
  useEffect(() => adminSubscribeDisputes(setList), []);
  useEffect(() => subscribeGamers(setGamers), []);
  const banned = gamers.filter((g) => g.banned);

  const resolve = async (c: any, winner: string) => {
    const note = window.prompt(winner ? 'Note (optional)' : 'Cancel this match? Reason (optional)');
    if (note === null) return;
    await adminResolveChallenge(c, winner, note);
  };
  const ban = async (uid: string, name: string) => {
    if (!window.confirm(`Ban ${name} from gaming? They drop off every leaderboard.`)) return;
    await adminSetGamerBan(uid, true);
  };
  const callPlayer = async (uid: string) => {
    const p = await adminGamerPhone(uid);
    if (p) window.location.href = `tel:${p}`;
    else window.alert('No phone saved for this player.');
  };

  return (
    <div className={card}>
      <p className={h}>Disputed challenges ({list.length})</p>
      {list.length === 0 && <p className="text-xs text-slate-400">No disputes.</p>}
      {list.map((c) => (
        <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">
            {gameLabel(c.game)}: {c.fromName} vs {c.toName}
          </p>
          <p className="text-[11px] text-slate-500">
            {c.fromName} says {c.claimFrom === c.fromUid ? 'they' : c.toName} won. {c.toName} says {c.claimTo === c.toUid ? 'they' : c.fromName} won.
          </p>
          <div className="flex gap-3 text-[11px]">
            {c.proofFrom && (
              <a href={c.proofFrom} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
                {c.fromName}'s screenshot
              </a>
            )}
            {c.proofTo && (
              <a href={c.proofTo} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
                {c.toName}'s screenshot
              </a>
            )}
            {!c.proofFrom && !c.proofTo && <span className="text-slate-400">No screenshots yet</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => resolve(c, c.fromUid)} className={`${btn} bg-[#0e9f55] text-white`}>
              {c.fromName} won
            </button>
            <button type="button" onClick={() => resolve(c, c.toUid)} className={`${btn} bg-[#0e9f55] text-white`}>
              {c.toName} won
            </button>
            <button type="button" onClick={() => resolve(c, '')} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
              Cancel match
            </button>
            <button type="button" onClick={() => callPlayer(c.fromUid)} className={`${btn} text-slate-600 dark:text-slate-300`}>
              Call {c.fromName}
            </button>
            <button type="button" onClick={() => callPlayer(c.toUid)} className={`${btn} text-slate-600 dark:text-slate-300`}>
              Call {c.toName}
            </button>
            <button type="button" onClick={() => ban(c.fromUid, c.fromName)} className={`${btn} text-rose-600`}>
              Ban {c.fromName}
            </button>
            <button type="button" onClick={() => ban(c.toUid, c.toName)} className={`${btn} text-rose-600`}>
              Ban {c.toName}
            </button>
          </div>
        </div>
      ))}
      {banned.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">Banned from gaming</p>
          {banned.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-xs">
              <span>{g.name}</span>
              <button type="button" onClick={() => adminSetGamerBan(g.id, false)} className={`${btn} text-[#0e9f55]`}>
                Unban
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const emptyT = () => ({
  id: '',
  game: 'efootball',
  title: '',
  format: '16-player knockout',
  startAt: '',
  slots: 16,
  fee: 1500,
  prizeText: '1st: ₦12,000\n2nd: ₦5,000\n3rd: ₦2,000',
  whatsapp: '',
  bracketText: '',
});
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const AdminTournaments: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);
  useEffect(() => subscribeTournaments(setList), []);

  const save = async () => {
    if (!form.title.trim() || !form.startAt) {
      window.alert('Add a title and a start date and time.');
      return;
    }
    await adminSaveTournament({ ...form, startAtMs: new Date(form.startAt).getTime() });
    setForm(null);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className={h}>Tournaments</p>
        {!form && (
          <button type="button" onClick={() => setForm(emptyT())} className={`${btn} bg-[#0e9f55] text-white`}>
            New tournament
          </button>
        )}
      </div>

      {form && (
        <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })} className={input}>
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} className={input} />
          </div>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} placeholder="Title, e.g. Roomly eFootball Cup #1" />
          <input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className={input} placeholder="Format, e.g. 16-player knockout or Squads of 4" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">
              Slots
              <input value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={input} />
            </label>
            <label className="text-[11px] text-slate-500">
              Entry fee (₦, 0 = free)
              <input value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={input} />
            </label>
          </div>
          <textarea value={form.prizeText} onChange={(e) => setForm({ ...form, prizeText: e.target.value })} rows={3} className={input} placeholder="Prizes (shown before anyone pays)" />
          <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={input} placeholder="Players' WhatsApp group link (shown to confirmed players)" />
          <textarea value={form.bracketText} onChange={(e) => setForm({ ...form, bracketText: e.target.value })} rows={3} className={input} placeholder="Bracket and round deadlines (optional, fill in later)" />
          {Number(form.fee) > 0 && Number(form.slots) > 0 && (
            <p className="text-[11px] text-slate-500">Pool if full: ₦{(Number(form.fee) * Number(form.slots)).toLocaleString()}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={save} className={`${btn} bg-[#0e9f55] text-white`}>
              Save
            </button>
            <button type="button" onClick={() => setForm(null)} className={`${btn} text-slate-500`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !form && <p className="text-xs text-slate-400">No tournaments yet.</p>}
      {list.map((t) => (
        <TournamentAdminRow
          key={t.id}
          t={t}
          onEdit={() =>
            setForm({
              ...emptyT(),
              ...t,
              startAt: toLocalInput(t.startAtMs),
            })
          }
        />
      ))}
    </div>
  );
};

const TournamentAdminRow: React.FC<{ t: any; onEdit: () => void }> = ({ t, onEdit }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [open, setOpen] = useState(t.status === 'open');
  const [res, setRes] = useState({ first: '', second: '', third: '' });
  useEffect(() => subscribeEntries(t.id, setEntries), [t.id]);
  const confirmed = entries.filter((e) => e.confirmed);
  const waiting = entries.filter((e) => !e.confirmed && e.paid);
  const byId = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, e])), [entries]);

  const finish = async () => {
    if (!res.first) {
      window.alert('Pick at least the winner.');
      return;
    }
    const pick = (uid: string) => (uid ? { uid, name: byId[uid]?.name || '' } : null);
    await adminSetTournament(t.id, { status: 'done', results: { first: pick(res.first), second: pick(res.second), third: pick(res.third) } });
  };

  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left cursor-pointer">
        <p className="font-bold text-slate-900 dark:text-white">
          {t.title} <span className="font-normal text-slate-400">({gameLabel(t.game)})</span>
        </p>
        <p className="text-[11px] text-slate-500">
          {new Date(t.startAtMs).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {t.status} · {entries.length}/{t.slots}{' '}
          joined · {confirmed.length} confirmed{waiting.length ? ` · ${waiting.length} say they paid` : ''}
          {t.fee ? ` · collected ₦${(confirmed.length * t.fee).toLocaleString()}` : ' · free'}
        </p>
      </button>
      {open && (
        <div className="space-y-2">
          {entries.length === 0 && <p className="text-[11px] text-slate-400">No one has joined yet.</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {e.name} <span className="text-slate-400">· {e.hostel} · ID {e.gameId}</span>
                {e.confirmed ? ' ✅' : e.paid ? ' 💸 says paid' : ''}
              </span>
              <span className="shrink-0 flex gap-1">
                {!e.confirmed && (
                  <button type="button" onClick={() => adminConfirmEntry(t.id, e.id, true)} className={`${btn} bg-[#0e9f55] text-white`}>
                    Confirm
                  </button>
                )}
                <button type="button" onClick={() => window.confirm(`Remove ${e.name}?`) && adminRemoveEntry(t.id, e.id)} className={`${btn} text-rose-600`}>
                  Remove
                </button>
              </span>
            </div>
          ))}

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={onEdit} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
              Edit
            </button>
            {t.status === 'open' && (
              <button type="button" onClick={() => adminSetTournament(t.id, { status: 'closed' })} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                Close entries
              </button>
            )}
            {t.status === 'closed' && (
              <button type="button" onClick={() => adminSetTournament(t.id, { status: 'open' })} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
                Reopen entries
              </button>
            )}
            {t.status !== 'cancelled' && t.status !== 'done' && (
              <button
                type="button"
                onClick={() => window.confirm('Cancel this tournament? Refund everyone who paid.') && adminSetTournament(t.id, { status: 'cancelled' })}
                className={`${btn} text-rose-600`}
              >
                Cancel (refund all)
              </button>
            )}
          </div>

          {t.status !== 'cancelled' && t.status !== 'done' && confirmed.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-[11px] font-bold text-slate-500">Results (adds leaderboard points)</p>
              {(['first', 'second', 'third'] as const).map((k, i) => (
                <select key={k} value={res[k]} onChange={(e) => setRes({ ...res, [k]: e.target.value })} className={input}>
                  <option value="">{['🥇 1st', '🥈 2nd', '🥉 3rd'][i]}</option>
                  {confirmed.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              ))}
              <button type="button" onClick={finish} className={`${btn} bg-[#0e9f55] text-white`}>
                Save results and finish
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
