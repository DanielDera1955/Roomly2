/**
 * Where students come from.
 * - ref: the tag on the link they first opened, e.g. roomly2-inky.vercel.app/?ref=hallgroup
 *   (first one wins, so a student who later opens a plain link still counts for the group that brought them)
 * - heardFrom: what they tapped for "How did you hear about Roomly?" at their first checkout
 * Both live in this browser and are added to their orders and their Games registration.
 */
const REF_KEY = 'roomly_ref';
const HEARD_KEY = 'roomly_heard';

export const HEARD_OPTIONS = [
  { id: 'whatsapp', label: 'WhatsApp group' },
  { id: 'friend', label: 'A friend' },
  { id: 'hallrep', label: 'Hall rep' },
  { id: 'poster', label: 'Poster' },
  { id: 'other', label: 'Other' },
];

const clean = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);

(() => {
  try {
    const tag = clean(new URLSearchParams(window.location.search).get('ref'));
    if (tag && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, tag);
  } catch (e) {
    /* private mode: nothing saved */
  }
})();

/** The link tag this student first came from ('' if none) */
export function getRef() {
  try {
    return clean(localStorage.getItem(REF_KEY));
  } catch (e) {
    return '';
  }
}

/** What the student answered for "How did you hear about Roomly?" ('' if they skipped) */
export function getHeardFrom() {
  try {
    const v = clean(localStorage.getItem(HEARD_KEY));
    return HEARD_OPTIONS.some((o) => o.id === v) ? v : '';
  } catch (e) {
    return '';
  }
}

export function setHeardFrom(id) {
  try {
    if (HEARD_OPTIONS.some((o) => o.id === id)) localStorage.setItem(HEARD_KEY, id);
    else localStorage.removeItem(HEARD_KEY);
  } catch (e) {
    /* ignore */
  }
}

/** A readable name for a channel: the link tag, else the answer, else "No tag" */
export function channelOf(rec) {
  const r = clean(rec && rec.ref);
  if (r) return `Link: ${r}`;
  const h = HEARD_OPTIONS.find((o) => o.id === (rec && rec.heardFrom));
  return h ? `Said: ${h.label}` : 'No tag';
}
