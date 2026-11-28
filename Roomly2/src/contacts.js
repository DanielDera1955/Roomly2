/**
 * Campus contacts (keke drivers, clinic, ICT, printing...). The admin edits them in Admin > Contacts; everyone reads them.
 * Stored in one document, adminControl/campusContacts, which only the admin can write and everyone can read
 * (the existing adminControl rule), so no change to the Firebase rules is needed.
 * Shape: { groups: [ { id, name, contacts: [ { id, name, note, phone, whatsapp } ] } ], updatedAtMs }
 */
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase.ts';

const REF = () => doc(db, 'adminControl', 'campusContacts');
const uid = () => Math.random().toString(36).slice(2, 10);
const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/** Digits and a leading + only */
export const cleanContactPhone = (p) => String(p || '').replace(/[^\d+]/g, '').slice(0, 16);

/** International form for wa.me (2348012345678), or '' when the number can't be a WhatsApp number (short codes, landlines) */
export function whatsappNumber(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.length === 11 && d.startsWith('0')) return `234${d.slice(1)}`;
  return '';
}

/** callback(data, failed): data is the saved list, or null when nothing is saved yet. failed is true when the list could not be read. */
export function subscribeCampusContacts(cb) {
  try {
    return onSnapshot(
      REF(),
      (s) => cb(s.exists() ? s.data() : null, false),
      () => cb(null, true)
    );
  } catch (e) {
    cb(null, true);
    return () => {};
  }
}

/** What students see: only contacts with a name and a number, and only groups that still have one */
export function visibleGroups(data) {
  const groups = data && Array.isArray(data.groups) ? data.groups : [];
  return groups
    .map((g) => ({ ...g, contacts: (Array.isArray(g.contacts) ? g.contacts : []).filter((c) => c && c.name && String(c.phone || '').replace(/\D/g, '').length >= 3) }))
    .filter((g) => g.name && g.contacts.length);
}

export function cleanGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .slice(0, 12)
    .map((g) => ({
      id: text(g.id, 20) || uid(),
      name: text(g.name, 40),
      contacts: (Array.isArray(g.contacts) ? g.contacts : [])
        .slice(0, 30)
        .map((c) => ({ id: text(c.id, 20) || uid(), name: text(c.name, 60), note: text(c.note, 80), phone: cleanContactPhone(c.phone), whatsapp: Boolean(c.whatsapp) }))
        .filter((c) => c.name),
    }))
    .filter((g) => g.name);
}

export async function saveCampusContacts(groups) {
  await setDoc(REF(), { groups: cleanGroups(groups), updatedAtMs: Date.now() });
}

/** The first list, to start the editor from */
export function seedGroups() {
  const c = (name, note, phone) => ({ id: uid(), name, note, phone, whatsapp: true });
  return [
    { id: uid(), name: 'Keke', contacts: [c('Miky', 'Caritas keke driver', '08022677600'), c('Ebuka', 'Caritas keke driver', '')] },
    { id: uid(), name: 'Clinic and emergencies', contacts: [c('Caritas School Nurse', '', '08039169312')] },
    { id: uid(), name: 'Reports (CSO)', contacts: [c('Dan', 'Caritas CSO, for reports', '07067513324')] },
    { id: uid(), name: 'Printing', contacts: [c('Printing Lady', 'ICT. Send your file on WhatsApp, pay, then pick it up', '08060106819')] },
  ];
}
