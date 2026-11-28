import React, { useEffect, useState } from 'react';
import { ArrowLeft, Phone, MessageCircle } from 'lucide-react';
import { subscribeCampusContacts, visibleGroups, whatsappNumber, cleanContactPhone } from '../contacts.js';

const urgent = /emergenc|clinic|nurse|medical|security/i;

/** Campus contacts: its own page, opened from the Home card. The admin edits the list in Admin > Contacts. */
export const ContactsPage: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [data, setData] = useState<any>(undefined);
  useEffect(() => subscribeCampusContacts((d: any) => setData(d)), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const groups = visibleGroups(data);

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
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white leading-tight">Campus contacts</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tap Call or WhatsApp. In a serious emergency, call first.</p>
          </div>
        </div>

        {data === undefined && <p className="py-10 text-center text-xs text-slate-400">Loading...</p>}
        {data !== undefined && groups.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No contacts yet.</p>}

        {groups.map((g: any) => (
          <section key={g.id || g.name} className="mt-4">
            <h2 className={`px-1 pb-2 text-xs font-bold uppercase tracking-wide ${urgent.test(g.name) ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>{g.name}</h2>
            <div className="space-y-2">
              {g.contacts.map((c: any) => {
                const wa = c.whatsapp ? whatsappNumber(c.phone) : '';
                return (
                  <div key={c.id || c.name} className="flex items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{c.name}</p>
                      {c.note && <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{c.note}</p>}
                      <p className="text-xs text-slate-400">{c.phone}</p>
                    </div>
                    <a href={`tel:${cleanContactPhone(c.phone)}`} className="shrink-0 h-10 px-3.5 rounded-xl bg-[#0e9f55] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                      <Phone className="w-4 h-4" /> Call
                    </a>
                    {wa && (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
