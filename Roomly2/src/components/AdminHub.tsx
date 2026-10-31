import React, { useEffect, useMemo, useState } from 'react';
import {
  HUB_TYPES,
  GAMES,
  REPORT_REASONS,
  subscribeHubSettings,
  saveHubSettings,
  adminSubscribeAllListings,
  adminSubscribeReports,
  adminRestoreListing,
  adminRemoveListing,
  adminBanPhone,
  adminUnbanPhone,
  adminBanAnyPhone,
  adminSubscribeBans,
  adminSubscribeDisputes,
  adminResolveMatch,
  isScored,
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
  gamesOpensAt,
  outsideStoreOpensAt,
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
        <p className={h}>Banned from Roomly ({bans.length})</p>
        <p className="text-[11px] text-slate-500">A banned number can't order, post in Hostel Hub or play in Games, and the browser they used is blocked too.</p>
        <BanForm />
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

const toLocal = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Admin: when challenges open, and when outside store items can be ordered */
const LaunchDates: React.FC<{ settings: any }> = ({ settings }) => {
  const games = gamesOpensAt(settings);
  const store = outsideStoreOpensAt(settings);
  const now = Date.now();
  const [g, setG] = useState(toLocal(games));
  const [st, setSt] = useState(toLocal(store));
  useEffect(() => setG(toLocal(games)), [games]);
  useEffect(() => setSt(toLocal(store)), [store]);
  const save = async (key: string, v: string) => {
    const ms = new Date(v).getTime();
    if (!Number.isFinite(ms)) return window.alert('Pick a date and time.');
    await saveHubSettings({ [key]: ms });
  };
  return (
    <div className={card}>
      <p className={h}>Launch dates</p>
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-slate-900 dark:text-white">
          Games challenges {now >= games ? <span className="text-[#0e9f55]">· open</span> : <span className="text-amber-600">· registration week</span>}
        </p>
        <div className="flex gap-2">
          <input type="datetime-local" value={g} onChange={(e) => setG(e.target.value)} className={input} />
          <button type="button" onClick={() => save('gamesOpenAtMs', g)} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900 shrink-0`}>
            Save
          </button>
        </div>
      </div>
      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-900 dark:text-white">
          Outside store orders {now >= store ? <span className="text-[#0e9f55]">· open</span> : <span className="text-amber-600">· opens soon</span>}
        </p>
        <p className="text-[11px] text-slate-500">Before this date students can browse outside store items but can't add them to a cart.</p>
        <div className="flex gap-2">
          <input type="datetime-local" value={st} onChange={(e) => setSt(e.target.value)} className={input} />
          <button type="button" onClick={() => save('outsideStoreOpenAtMs', st)} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900 shrink-0`}>
            Save
          </button>
        </div>
        {now < store && (
          <button type="button" onClick={() => window.confirm('Open outside store orders now?') && saveHubSettings({ outsideStoreOpenAtMs: Date.now() - 60000 })} className={`${btn} bg-[#0e9f55] text-white`}>
            Open outside store now
          </button>
        )}
      </div>
    </div>
  );
};

const BanForm: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const ban = async () => {
    const why = window.prompt(`Ban ${phone} from Roomly? Reason (optional):`);
    if (why === null) return;
    setBusy(true);
    try {
      await adminBanAnyPhone(phone, why);
      setPhone('');
    } catch (e: any) {
      window.alert(e?.message || 'Could not ban.');
    }
    setBusy(false);
  };
  return (
    <div className="flex gap-2">
      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={input} placeholder="Phone number to ban" />
      <button type="button" disabled={busy || phone.length !== 11} onClick={ban} className={`${btn} bg-rose-600 text-white shrink-0`}>
        Ban
      </button>
    </div>
  );
};

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
    <>
    <LaunchDates settings={settings} />
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
    </>
  );
};

/* ------------------------------------------------------------------ */

const FlaggedRow: React.FC<{ l: any; reports: any[] }> = ({ l, reports }) => {
  const [busy, setBusy] = useState(false);
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
            {l.stolenFlag ? 'STOLEN REPORT: ' : ''}
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
            const why = window.prompt(`Ban ${l.phone} from Roomly? They can't order, post or play, and their listings come down. Reason (optional):`);
            if (why !== null) run(() => adminBanPhone(l.phone, why));
          }}
          className={`${btn} text-rose-600 border border-rose-200 dark:border-rose-900`}
        >
          Ban from Roomly
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

  const text = (m: any) =>
    isScored(m.game) ? `${m.aName} ${m.scoreA}-${m.scoreB} ${m.bName}` : `${m.scoreA > m.scoreB ? m.aName : m.bName} won`;
  const setScore = async (m: any) => {
    const v = window.prompt(
      isScored(m.game) ? `Correct score as "${m.aName} goals-${m.bName} goals", e.g. 2-1` : `Who won? Type 1 for ${m.aName} or 2 for ${m.bName}`
    );
    if (!v) return;
    if (isScored(m.game)) {
      const [a, b] = v.split('-').map((x) => Number(x.trim()));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return window.alert('Use the format 2-1.');
      await adminResolveMatch(m, 'score', a, b);
    } else {
      await adminResolveMatch(m, 'score', v.trim() === '1' ? 1 : 0, v.trim() === '1' ? 0 : 1);
    }
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
      <p className={h}>Disputed results ({list.length})</p>
      {list.length === 0 && <p className="text-xs text-slate-400">No disputes.</p>}
      {list.map((m) => (
        <div key={m.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">
            {gameLabel(m.game)}: {text(m)}
          </p>
          <p className="text-[11px] text-slate-500">
            Logged by {m.aName} {timeAgo(m.loggedAtMs)}. {m.bName} says: {m.disputeNote || 'no note'}
          </p>
          <div className="flex gap-3 text-[11px]">
            {m.proofA && (
              <a href={m.proofA} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
                {m.aName}'s screenshot
              </a>
            )}
            {m.proofB && (
              <a href={m.proofB} target="_blank" rel="noreferrer" className="text-[#0e9f55] font-bold underline">
                {m.bName}'s screenshot
              </a>
            )}
            {!m.proofA && !m.proofB && <span className="text-slate-400">No screenshots yet</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => adminResolveMatch(m, 'keep')} className={`${btn} bg-[#0e9f55] text-white`}>
              Keep as logged
            </button>
            <button type="button" onClick={() => setScore(m)} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
              Set correct result
            </button>
            <button type="button" onClick={() => window.confirm('Cancel this result?') && adminResolveMatch(m, 'void')} className={`${btn} bg-slate-200 dark:bg-slate-700`}>
              Cancel result
            </button>
            <button type="button" onClick={() => callPlayer(m.aUid)} className={`${btn} text-slate-600 dark:text-slate-300`}>
              Call {m.aName}
            </button>
            <button type="button" onClick={() => callPlayer(m.bUid)} className={`${btn} text-slate-600 dark:text-slate-300`}>
              Call {m.bName}
            </button>
            <button type="button" onClick={() => ban(m.aUid, m.aName)} className={`${btn} text-rose-600`}>
              Ban {m.aName}
            </button>
            <button type="button" onClick={() => ban(m.bUid, m.bName)} className={`${btn} text-rose-600`}>
              Ban {m.bName}
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
                {e.confirmed ? ' · confirmed' : e.paid ? ' · says paid' : ''}
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
                  <option value="">{['1st place', '2nd place', '3rd place'][i]}</option>
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
