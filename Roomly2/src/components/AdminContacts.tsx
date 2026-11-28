import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X, Plus, Loader2 } from 'lucide-react';
import { subscribeCampusContacts, saveCampusContacts, seedGroups, cleanContactPhone } from '../contacts.js';

const field =
  'w-full h-10 px-3 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const iconBtn = 'shrink-0 w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-30';

interface Contact {
  id: string;
  name: string;
  note: string;
  phone: string;
  whatsapp: boolean;
}
interface Group {
  id: string;
  name: string;
  contacts: Contact[];
}
const newId = () => Math.random().toString(36).slice(2, 10);
function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const c = arr.slice();
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

/** Admin > Contacts: make categories (Keke, Clinic...) and put contacts in them. Students see them on the Campus contacts page. */
export const AdminContacts: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const first = useRef(true);

  // Load once. Later changes come from this screen, so the admin's typing is never overwritten.
  useEffect(
    () =>
      subscribeCampusContacts((d: any, bad: boolean) => {
        if (!first.current) return;
        first.current = false;
        setFailed(Boolean(bad));
        setGroups(d && Array.isArray(d.groups) ? d.groups : []);
        setLoaded(true);
      }),
    []
  );

  const setGroup = (gi: number, patch: Partial<Group>) => setGroups((l) => l.map((g, k) => (k === gi ? { ...g, ...patch } : g)));
  const setContact = (gi: number, ci: number, patch: Partial<Contact>) =>
    setGroups((l) => l.map((g, k) => (k === gi ? { ...g, contacts: g.contacts.map((c, n) => (n === ci ? { ...c, ...patch } : c)) } : g)));

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await saveCampusContacts(groups);
      setMsg('Saved. Students see the new list now.');
    } catch (e: any) {
      setMsg(e?.message || 'Could not save. Try again.');
    }
    setBusy(false);
  };

  if (!loaded) return <p className="py-10 text-center text-xs text-slate-400">Loading...</p>;

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">Campus contacts</h2>
        <p className="text-xs text-slate-500">Students see these on the Home page under Campus contacts. A contact with no number stays hidden. Only the admin can change this list.</p>
      </div>

      {failed && <p className="text-xs font-semibold text-rose-600">Could not load the saved list. Refresh before you save, so nothing is overwritten.</p>}

      {groups.length === 0 && !failed && (
        <button type="button" onClick={() => setGroups(seedGroups())} className="h-10 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
          Start with my first list
        </button>
      )}

      {groups.map((g, gi) => (
        <div key={g.id} className={`${card} p-3.5 space-y-3`}>
          <div className="flex items-center gap-2">
            <input className={`${field} flex-1 min-w-0 font-bold`} value={g.name} maxLength={40} onChange={(e) => setGroup(gi, { name: e.target.value })} placeholder="Category, for example Keke" />
            <button type="button" aria-label="Move category up" disabled={gi === 0} onClick={() => setGroups((l) => move(l, gi, -1))} className={iconBtn}>
              <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" aria-label="Move category down" disabled={gi === groups.length - 1} onClick={() => setGroups((l) => move(l, gi, 1))} className={iconBtn}>
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Delete category"
              onClick={() => window.confirm(`Delete "${g.name || 'this category'}" and its ${g.contacts.length} contact(s)?`) && setGroups((l) => l.filter((_, k) => k !== gi))}
              className={`${iconBtn} text-rose-600`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {g.contacts.map((c, ci) => (
            <div key={c.id} className="rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className={field} value={c.name} maxLength={60} onChange={(e) => setContact(gi, ci, { name: e.target.value })} placeholder="Name" />
                <input className={field} value={c.phone} inputMode="tel" maxLength={16} onChange={(e) => setContact(gi, ci, { phone: cleanContactPhone(e.target.value) })} placeholder="Phone number" />
              </div>
              <input className={field} value={c.note} maxLength={80} onChange={(e) => setContact(gi, ci, { note: e.target.value })} placeholder="Short note (optional), for example Caritas keke driver" />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={c.whatsapp} onChange={(e) => setContact(gi, ci, { whatsapp: e.target.checked })} /> Show a WhatsApp button
                </label>
                <span className="flex items-center gap-1.5">
                  {c.name && !c.phone && <span className="text-[11px] font-semibold text-amber-600">Hidden: no number</span>}
                  <button type="button" aria-label="Move up" disabled={ci === 0} onClick={() => setGroup(gi, { contacts: move(g.contacts, ci, -1) })} className={iconBtn}>
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={ci === g.contacts.length - 1} onClick={() => setGroup(gi, { contacts: move(g.contacts, ci, 1) })} className={iconBtn}>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label="Remove contact" onClick={() => setGroup(gi, { contacts: g.contacts.filter((_, n) => n !== ci) })} className={`${iconBtn} text-rose-600`}>
                    <X className="w-4 h-4" />
                  </button>
                </span>
              </div>
            </div>
          ))}

          {g.contacts.length < 30 && (
            <button
              type="button"
              onClick={() => setGroup(gi, { contacts: [...g.contacts, { id: newId(), name: '', note: '', phone: '', whatsapp: true }] })}
              className="flex items-center gap-1.5 text-sm font-bold text-[#0e9f55] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add a contact
            </button>
          )}
        </div>
      ))}

      {groups.length < 12 && (
        <button type="button" onClick={() => setGroups((l) => [...l, { id: newId(), name: '', contacts: [] }])} className="flex items-center gap-1.5 text-sm font-bold text-[#0e9f55] cursor-pointer">
          <Plus className="w-4 h-4" /> Add a category
        </button>
      )}

      <div className="sticky bottom-3 space-y-2">
        {msg && <p className="text-xs font-semibold text-[#0e9f55] bg-white dark:bg-slate-900 rounded-xl px-3 py-2">{msg}</p>}
        <button type="button" disabled={busy || failed} onClick={save} className="w-full h-12 rounded-xl bg-[#0e9f55] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save contacts
        </button>
      </div>
    </div>
  );
};
