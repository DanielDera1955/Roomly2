/**
 * Admin post schedule: what to post, in which WhatsApp group, and when.
 *  - marketing/schedule: { groups: [...], posts: [...] }  (edited in Admin > Posts)
 *  - marketing/log: { last: { "post__group": { ms, v } }, vlast: { "group__post__v": ms } }
 * A post shows under "Posts to share now" while its time window is open, only when what it advertises is
 * live (a runner confirmed the next inside batch, a food or store operator is available), and one row per
 * group with that group's own tagged link. Versions rotate per group: the one used longest ago comes next.
 */
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { buildLink } from './links.js';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const NEEDS = [
  { id: '', label: 'Always (no check)' },
  { id: 'inside', label: 'A runner confirmed the next inside batch' },
  { id: 'food', label: 'A food operator is available today' },
  { id: 'foodTomorrow', label: 'A food operator is available tomorrow' },
  { id: 'store', label: 'Outside store is open and an operator is available today' },
];

const SIGN = 'Roomly is specifically made for Caritas.';

export const DEFAULT_GROUPS = [
  { id: 'rg', name: 'Roomly group (bread and egg)', tag: 'rg', max: 0 },
  { id: 'cs', name: 'CS general', tag: 'cs', max: 2 },
  { id: 'code', name: 'Caritas coding', tag: 'code', max: 2 },
  { id: 'stellar', name: 'Stellar AI', tag: 'stellar', max: 1 },
  { id: 'class26', name: 'CUA Class 26', tag: 'class26', max: 1 },
  { id: 'dls', name: 'DLS group', tag: 'dls', max: 1 },
];

const p = (o) => ({ paused: false, until: '', ...o });

export const DEFAULT_POSTS = [
  p({
    id: 'oye-morning',
    title: 'Morning: Oye food (until store items open)',
    days: [1, 2, 3, 4, 5, 6],
    start: '07:30',
    end: '09:30',
    until: '2026-11-08',
    groups: ['rg', 'cs'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `You don't need to leave school to buy food. Let Oye come to you.
Open Roomly, see the food and prices, pick the ones you want in a few taps, and check out.
Order alone or with friends. One order, one delivery fee for everyone (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your food reaches the school gate before it hits 0.00.
Order dinner before 6pm, at the gate before 7pm.

${SIGN}`,
      `Craving food from Oye today? Let Oye come to you.
Open Roomly, see the menu and prices, pick what you want in a few taps, and check out.
Order alone or with friends. One order, one delivery fee for everyone (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your food reaches the school gate before it hits 0.00.
Order dinner before 6pm, at the gate before 7pm.

${SIGN}`,
    ],
  }),
  p({
    id: 'store-morning',
    title: 'Morning: restock from Oye (store items)',
    days: [1, 2, 3, 4, 5, 6],
    start: '07:30',
    end: '09:30',
    groups: ['rg', 'cs'],
    section: 'outside-store',
    needs: 'store',
    variants: [
      `You don't need to leave school to restock. Let Oye come to you.
Open Roomly, see foodstuff, kerosene, provisions and their prices, pick what you want in a few taps, and check out.
Order alone or with your roommates. One order, one delivery fee for everyone (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your items reach the school gate before it hits 0.00.
Order before 5pm to get it at the gate before 7pm today.

${SIGN}`,
      `Rice, garri, kerosene, groundnut oil or soap finished? Restock without leaving school.
See the items and prices on Roomly and check out in a few taps.
Share one order with your roommates and pay one delivery fee for everything (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your items reach the school gate before it hits 0.00.
Order before 5pm.

${SIGN}`,
    ],
  }),
  p({
    id: 'lunch-weekday',
    title: 'Morning: lunch at the gate (order before 12:30pm)',
    days: [2, 3, 4, 5],
    start: '10:30',
    end: '12:15',
    groups: ['rg', 'code'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `Lectures end, the gate opens at 1, and you still have to walk to the canteen.
Order lunch on Roomly before 12:30pm and pick it up at the school gate before 1:30pm, on your way in.
How to order:
1. Open the link and pick your food. Add protein and a drink if you want.
2. Tap Checkout. First time? Enter your name, phone number and a 4-digit PIN.
3. Pay to the vendor's account shown, then tap "I have made payment".
4. A countdown starts. Your food is at the gate before it ends.
Order with your roommates and share one delivery fee.

${SIGN}`,
    ],
  }),
  p({
    id: 'food-afternoon',
    title: 'Afternoon: dinner at the gate (order before 6pm)',
    days: [1, 2, 3, 4, 5, 6],
    start: '15:30',
    end: '17:45',
    groups: ['rg', 'cs'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `Ball first, food after. Order dinner from Oye on Roomly before 6:00pm and pick it up at the school gate before 7:00pm.
How to order:
1. Open the link and pick your food. Add protein and a drink if you want.
2. Tap Checkout. First time? Enter your name, phone number and a 4-digit PIN.
3. Pay to the vendor's account shown, then tap "I have made payment".
4. A countdown starts. Your food is at the gate before it ends.
Order with your roommates or friends and pay one delivery fee for everything (₦500 launch price until 30 Nov).

${SIGN}`,
    ],
  }),
  p({
    id: 'wed-adoration',
    title: 'Wednesday: food waiting after adoration',
    days: [3],
    start: '12:00',
    end: '15:30',
    groups: ['rg', 'cs', 'code'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `Adoration today. Don't come back hungry to a crowded canteen.
Order your food on Roomly before you leave the hostel, and pick it up at the gate on your way back from adoration.
How to order:
1. Open the link and pick your food. Add protein and a drink if you want.
2. Tap Checkout. First time? Enter your name, phone number and a 4-digit PIN.
3. Pay to the vendor's account shown, then tap "I have made payment".
4. A countdown starts, and your food is sent to the gate.
Order with your roommates and share one delivery fee.

${SIGN}`,
    ],
  }),
  p({
    id: 'hub-evening',
    title: 'Evening: Hostel Hub (sell items, post services)',
    days: [0, 1, 2, 3, 4, 5, 6],
    start: '18:45',
    end: '19:45',
    groups: ['rg'],
    section: 'hub-buysell',
    needs: '',
    variants: [
      `If you have any personal item you are no longer using, like a power bank, locker, or anything at all, you can list it for free on Roomly Hostel Hub with your WhatsApp contact for a buyer to reach you.
And also, if you are selling a service like barbing, repairing phones, or phone charging when there's no light? Post it there too. Students reach out to you directly.
If you are hungry later, you can order canteen items alone or with your roommates and get them in your room before the canteen closes by 9:00pm.

${SIGN}`,
      `Do you barb, plait hair, fix phones, or charge phones with a power bank when there's no light? Post your service for free on Roomly Hostel Hub so students in your hostel can find you.
If you have any personal item you no longer use, list it there too, with your WhatsApp contact for buyers to reach you.
Hungry later? Order canteen items alone or with your roommates and pay one ₦500 delivery fee for the room.

${SIGN}`,
    ],
  }),
  p({
    id: 'canteen-night',
    title: 'Night: canteen to your room (8:30pm batch)',
    days: [0, 1, 2, 3, 4, 5, 6],
    start: '19:50',
    end: '20:45',
    groups: ['rg', 'code'],
    section: 'inside',
    needs: 'inside',
    variants: [
      `Tonight's room delivery starts at 8:30pm. Order before 8:50pm and get it in your room before 9:30pm.
Open Roomly, see the canteen items and prices, and check out in a few taps.
Order alone or with your roommates. One cart, one ₦500 delivery fee for everyone.
Once you pay, a timer starts, and your order arrives before it hits 0.00.
If an item is finished, you choose a refund or a similar item at the same price.

${SIGN}`,
    ],
  }),
  p({
    id: 'wed-night-thursday',
    title: 'Wednesday night: skip the Thursday Oye trip',
    days: [3],
    start: '20:45',
    end: '21:45',
    groups: ['rg', 'cs'],
    section: 'outside-food',
    needs: 'foodTomorrow',
    variants: [
      `Planning to go to Oye tomorrow? You don't need to.
Order food from Oye on Roomly and pick it up at the school gate before 7pm.
Order alone or with friends. One order, one delivery fee for everyone (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your food reaches the school gate before it hits 0.00.
Order before 6pm tomorrow.

${SIGN}`,
      `Thursday is Oye day, but you don't have to leave school for it.
See the food and prices on Roomly and check out in a few taps.
Order with your roommates or friends and pay one delivery fee for everything (₦500 launch price until 30 Nov).
Once you pay, a timer starts, and your food reaches the school gate before it hits 0.00.
Order before 6pm tomorrow.

${SIGN}`,
    ],
  }),
  p({
    id: 'sunday-morning',
    title: 'Sunday after mass: lunch at the gate',
    days: [0],
    start: '10:15',
    end: '12:15',
    groups: ['rg', 'code'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `Mass is over and you're hungry. Order lunch on Roomly before 12:30pm and pick it up at the school gate before 1:30pm.
See the food and prices and check out in a few taps.
Order with your roommates and share one delivery fee.
Once you pay, a timer starts, and your food is at the gate before it hits 0.00.

${SIGN}`,
    ],
  }),
  p({
    id: 'saturday-cleanup',
    title: 'Saturday after cleanup: lunch at the gate',
    days: [6],
    start: '10:00',
    end: '12:15',
    groups: ['rg', 'cs'],
    section: 'outside-food',
    needs: 'food',
    variants: [
      `Done with cleanup? Rest, and let Roomly bring lunch to the gate.
Order before 12:30pm and pick it up at the school gate before 1:30pm.
See the food and prices and check out in a few taps.
Order with your roommates and share one delivery fee.

${SIGN}`,
    ],
  }),
  p({
    id: 'games-friday',
    title: 'Friday night: Games leaderboard',
    days: [5],
    start: '19:00',
    end: '21:00',
    groups: ['rg', 'code', 'dls'],
    section: 'games',
    needs: '',
    variants: [
      `Who is the best gamer in Caritas?
Roomly has a leaderboard for DLS, eFootball, FIFA, Free Fire, and CODM. A win is 3 points and a draw is 1.
Register, turn on Ready to play, and challenge anyone on the table. The number one player wears the crown.

${SIGN}`,
      `Think you're the best at DLS, eFootball, FIFA, Free Fire, or CODM? Prove it on Roomly.
Register for free, challenge players who are ready, and enter your score after every match.
The more you play and win, the higher you climb.

${SIGN}`,
    ],
  }),
  p({
    id: 'games-saturday',
    title: 'Saturday: challenge of the week',
    days: [6],
    start: '11:30',
    end: '13:00',
    groups: ['dls'],
    section: 'games',
    needs: '',
    variants: [
      `Weekend is here. Who wants a match?
Register on the Roomly Games leaderboard, turn on Ready to play, and accept challenges from other players.
A win is 3 points and a draw is 1. The top player wears the crown.`,
      `Looking for strong DLS players to challenge? The Roomly leaderboard is open to players from anywhere.
Register, turn on Ready to play, and climb the table with every win.`,
    ],
  }),
  p({
    id: 'graduates-referral',
    title: 'Graduate groups: send Roomly to a Caritas student',
    days: [2],
    start: '19:00',
    end: '21:00',
    groups: ['stellar', 'class26'],
    section: 'inside',
    needs: '',
    variants: [
      `Do you know any Caritas student, a junior, sibling, or course mate still in school?
Send them Roomly. They can order canteen items to their hostel room, or food from Oye to the school gate, in a few taps.
They can order alone or with their roommates and pay one delivery fee for everyone.

${SIGN}`,
      `Still have juniors or siblings in Caritas? Help them skip the canteen queue and the Oye trip.
Roomly delivers canteen items to their hostel room and food from Oye to the school gate.
Forward this to them. One cart with roommates means one delivery fee for everyone.

${SIGN}`,
    ],
  }),
];

/* ------------------------------------------------------------------ */
/* Firestore                                                           */
/* ------------------------------------------------------------------ */

export function subscribeSchedule(cb) {
  return onSnapshot(
    doc(db, 'marketing', 'schedule'),
    (s) => cb(s.exists() ? s.data() : null),
    () => cb(null)
  );
}

export function subscribeLog(cb) {
  return onSnapshot(
    doc(db, 'marketing', 'log'),
    (s) => cb(s.exists() ? s.data() : {}),
    () => cb({})
  );
}

export async function saveSchedule(schedule) {
  await setDoc(doc(db, 'marketing', 'schedule'), { groups: schedule.groups || [], posts: schedule.posts || [], updatedAt: Date.now() });
}

export async function loadStarterPosts() {
  await saveSchedule({ groups: DEFAULT_GROUPS, posts: DEFAULT_POSTS });
}

export async function markPosted(postId, groupId, v) {
  const ms = Date.now();
  await setDoc(
    doc(db, 'marketing', 'log'),
    { last: { [`${postId}__${groupId}`]: { ms, v } }, vlast: { [`${groupId}__${postId}__${v}`]: ms } },
    { merge: true }
  );
}

export async function undoPosted(postId, groupId) {
  await setDoc(doc(db, 'marketing', 'log'), { last: { [`${postId}__${groupId}`]: { ms: 0, v: 0 } } }, { merge: true });
}

/* ------------------------------------------------------------------ */
/* What is due now                                                     */
/* ------------------------------------------------------------------ */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const clockLabel = (hhmm) => {
  const t = toMin(hhmm);
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`;
};

const HELD_TEXT = {
  inside: 'Held: no runner has confirmed the next inside batch',
  food: 'Held: no food operator is available today',
  foodTomorrow: 'Held: no food operator is available tomorrow',
  store: 'Held: outside store is not open or no store operator is available today',
};

/**
 * Posts whose window is open now.
 * live = { inside, food, foodTomorrow, store } booleans.
 * Returns [{ post, held, rows: [{ group, v, text, link, full, posted }] }]
 */
export function duePosts(schedule, log, live, now = new Date()) {
  if (!schedule) return [];
  const today = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const last = (log && log.last) || {};
  const vlast = (log && log.vlast) || {};
  const groups = schedule.groups || [];
  const postedToday = (k) => {
    const e = last[k];
    return Boolean(e && e.ms && ymd(new Date(e.ms)) === today);
  };
  const countToday = (gid) =>
    Object.keys(last).filter((k) => k.endsWith(`__${gid}`) && postedToday(k)).length;

  const out = [];
  (schedule.posts || []).forEach((post) => {
    if (post.paused) return;
    if (!(post.days || []).includes(now.getDay())) return;
    if (post.until && today > post.until) return;
    if (nowMin < toMin(post.start) || nowMin >= toMin(post.end)) return;
    const variants = (post.variants || []).filter((t) => String(t || '').trim());
    if (!variants.length) return;
    const held = post.needs && !live[post.needs] ? HELD_TEXT[post.needs] : '';
    const rows = [];
    (post.groups || []).forEach((gid) => {
      const group = groups.find((g) => g.id === gid);
      if (!group) return;
      const k = `${post.id}__${gid}`;
      const posted = postedToday(k);
      if (!posted && Number(group.max) > 0 && countToday(gid) >= Number(group.max)) return;
      let v;
      if (posted) v = Math.min(Number(last[k].v || 0), variants.length - 1);
      else {
        v = 0;
        let oldest = Infinity;
        variants.forEach((_, i) => {
          const t = Number(vlast[`${gid}__${post.id}__${i}`] || 0);
          if (t < oldest) {
            oldest = t;
            v = i;
          }
        });
      }
      const text = variants[v].trim();
      const link = buildLink(group.tag, post.section);
      rows.push({ group, v, text, link, full: `${text}\n${link}`, posted });
    });
    if (!rows.length || rows.every((r) => r.posted)) return;
    out.push({ post, held, rows });
  });
  return out.sort((a, b) => toMin(a.post.start) - toMin(b.post.start));
}
