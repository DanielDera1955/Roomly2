import React, { useRef, useState } from 'react';
import { ArrowLeft, Wallet, Clock, ListChecks, ToggleRight, Users, Star, ShieldCheck, Smartphone, CheckCircle2, Send } from 'lucide-react';
import { BOYS_HOSTELS, GIRLS_HOSTELS, SCHOOL_NAME } from '../config';
import { submitRunnerApplication, RUNNER_APP_LEVELS } from '../api.js';

/**
 * "Become a Roomly Runner": the guide for students who want to deliver, with the application form at the bottom.
 * Opened at yourlink/#join. Applications land in Admin > Applications.
 * Never show Roomly's margin percentage here: any student can open this page.
 */

const BATCH_DAYS: { day: string; times: string[] }[] = [
  { day: 'Sunday', times: ['11:30am', '2:30pm', '6:30pm', '8:30pm'] },
  { day: 'Monday to Friday', times: ['2:30pm', '5:30pm', '8:30pm'] },
  { day: 'Saturday', times: ['9:30am', '1:30pm', '4:30pm', '8:30pm'] },
];
const SCHEDULE: { day: string; slots: string }[] = [
  { day: 'Sunday', slots: '11:30am to 12:00pm, 2:30 to 3:00pm, 6:30 to 7:00pm, 8:30 to 9:00pm' },
  { day: 'Monday to Friday', slots: '2:30 to 3:00pm, 5:30 to 6:00pm, 8:30 to 9:00pm' },
  { day: 'Saturday', slots: '9:30 to 10:00am, 1:30 to 2:00pm, 4:30 to 5:00pm, 8:30 to 9:00pm' },
];

/** A tap-to-pick button (green when chosen) */
const pick = (on: boolean) =>
  `py-2 px-1 rounded-xl text-xs font-bold border cursor-pointer truncate ${
    on ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
  }`;
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5';
const input =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/40';

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className={card}>
    <h2 className="flex items-center gap-2 text-base font-extrabold">
      <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#0e9f55] flex items-center justify-center">{icon}</span>
      {title}
    </h2>
    <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-1.5">
    {items.map((t, i) => (
      <li key={i} className="flex gap-2">
        <span className="mt-2 w-1.5 h-1.5 shrink-0 rounded-full bg-[#0e9f55]" />
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

const ApplyForm: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hostel, setHostel] = useState('');
  const [level, setLevel] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const toggle = (label: string) => setBatches((b) => (b.includes(label) ? b.filter((x) => x !== label) : [...b, label]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitRunnerApplication({ name, phone, hostel, level, batches, message });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Check your connection and try again.');
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="text-center space-y-2 py-4">
        <CheckCircle2 className="w-10 h-10 mx-auto text-[#0e9f55]" />
        <p className="text-base font-extrabold">Application sent</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Thanks, {name.split(' ')[0]}. We'll message you on WhatsApp to set up your runner portal and walk you through it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-bold text-slate-500">Full name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} autoComplete="name" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold text-slate-500">WhatsApp number</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={14} placeholder="08012345678" className={input} autoComplete="tel" />
      </label>
      {/* Hostel and level: buttons instead of phone popups */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-slate-500">Hostel</span>
        {([
          ["Boys' hostels", BOYS_HOSTELS],
          ["Girls' hostels", GIRLS_HOSTELS],
        ] as [string, string[]][]).map(([label, list]) => (
          <div key={label}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {list.map((h) => (
                <button key={h} type="button" onClick={() => setHostel(h)} aria-pressed={hostel === h} className={pick(hostel === h)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-slate-500">Level</span>
        <div className="grid grid-cols-3 gap-1.5">
          {RUNNER_APP_LEVELS.map((l: string) => (
            <button key={l} type="button" onClick={() => setLevel(l)} aria-pressed={level === l} className={pick(level === l)}>
              {l === 'Other' ? 'Other' : `${l} level`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-bold text-slate-500">Batches you can usually do (tick all that apply)</span>
        {BATCH_DAYS.map(({ day, times }) => (
          <div key={day} className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400">{day}</p>
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => {
                const label = `${day} ${t}`;
                const on = batches.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggle(label)}
                    aria-pressed={on}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                      on
                        ? 'bg-[#0e9f55] border-[#0e9f55] text-white'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-bold text-slate-500">Anything you want us to know (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} className={input} />
      </label>

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0e9f55] hover:bg-[#0b8044] text-white text-sm font-extrabold cursor-pointer disabled:opacity-60"
      >
        <Send className="w-4 h-4" />
        {busy ? 'Sending…' : 'Apply to be a runner'}
      </button>
    </form>
  );
};

export const BecomeRunner: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const formRef = useRef<HTMLDivElement>(null);
  const goToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="min-h-screen bg-[#e8efeb] dark:bg-slate-950 flex justify-center">
      <div className="w-full max-w-[480px] bg-[#f4f8f6] dark:bg-slate-900 min-h-screen px-4 pb-16 space-y-3 text-slate-900 dark:text-slate-100">
        <button type="button" onClick={onBack} className="mt-4 flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to Roomly {SCHOOL_NAME}
        </button>

        {/* Header */}
        <header className="rounded-3xl bg-[#0e9f55] text-white p-5 space-y-3">
          <h1 className="text-2xl font-black leading-tight">Become a Roomly Runner</h1>
          <p className="text-sm text-white/90">Earn ₦500 on every delivery, on your own schedule, mostly within the hostels.</p>
          <button type="button" onClick={goToForm} className="px-4 py-2.5 rounded-2xl bg-white text-[#0b8044] text-sm font-extrabold cursor-pointer">
            Apply now
          </button>
        </header>

        {/* Earnings first: it's what people scroll for */}
        <Section icon={<Wallet className="w-4 h-4" />} title="What you earn">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-3">
              <p className="text-2xl font-black text-[#0e9f55]">₦500</p>
              <p className="text-xs">every normal delivery</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-3">
              <p className="text-2xl font-black text-[#0e9f55]">₦600</p>
              <p className="text-xs">every express delivery (only when you switch express on)</p>
            </div>
          </div>
          <p>Several orders in one batch means several payments for one trip.</p>
          <p>
            A runner doing 10 orders a day earns <strong>₦5,000</strong>, which is <strong>₦35,000 a week</strong>. Roomly gives more orders to runners who are
            active and deliver well and on time.
          </p>
        </Section>

        <Section icon={<Smartphone className="w-4 h-4" />} title="What Roomly is">
          <p>
            Roomly {SCHOOL_NAME} lets students order store items and canteen food from their phones and get them delivered to their rooms. Runners are the
            students who make that happen.
          </p>
        </Section>

        <Section icon={<Wallet className="w-4 h-4" />} title="Your portal">
          <p>
            We create a runner portal for you. You add your bank account details there, and that's the account students pay into. Orders show up in your portal
            only after the student says they've paid, so you never spend your own money on an unpaid order.
          </p>
        </Section>

        <Section icon={<ListChecks className="w-4 h-4" />} title="How an order works">
          <ol className="space-y-2">
            {[
              'A student places an order, pays your account and taps "I\'ve paid".',
              'The order appears in your portal. You check that the money arrived and tap "Confirm payment".',
              'The student is notified that their payment was received and their order is being packaged.',
              'At the batch time, you buy the items from the canteen or store.',
              'If an item is out of stock, you follow the choice the student made at checkout: a refund for that item, or a similar item at the same price. Every student must choose before paying.',
              'You pack the order and tap "Done packing, on my way". The student sees that their order is coming, and a 15-minute countdown starts.',
              "You deliver to the student's room, or wherever in school they ordered to.",
            ].map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-6 h-6 shrink-0 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section icon={<Clock className="w-4 h-4" />} title="Delivery batches">
          <p>Orders are grouped into set batches, so you can buy for several students in one trip.</p>
          <div className="space-y-1.5">
            {SCHEDULE.map((s) => (
              <div key={s.day} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">{s.day}</p>
                <p className="text-xs">{s.slots}</p>
              </div>
            ))}
          </div>
          <p>
            Be on your way to the canteen, or already there, by the start time. From then, you have a maximum of 30 minutes to buy everything and deliver it.
          </p>
        </Section>

        <Section icon={<ToggleRight className="w-4 h-4" />} title="Switching batches on and off">
          <p>Every batch has an on/off switch in your portal.</p>
          <Bullets
            items={[
              <>
                <strong>Switch off batches you can't do.</strong> When a batch is off, students can't select you at checkout, so nobody sends you money while
                you're in class, asleep or busy.
              </>,
              <>
                <strong>Switch off a batch once you've finished buying for it.</strong> If you leave it on, students see that orders are still being taken and keep
                ordering for that batch.
              </>,
              <>
                <strong>If a student pays you while you're switched on, you're expected to deliver.</strong>
              </>,
            ]}
          />
          <p>
            Batches exist to make your work easier, since you're a student too and will sometimes be busy or need rest. If you want to deliver outside the batch
            times, you can, by leaving your switch on.
          </p>
        </Section>

        <Section icon={<Star className="w-4 h-4" />} title="Student feedback">
          <p>
            After every delivery, students can leave feedback on how it went: on time, late, wrong or missing items, damage, or attitude. This is one of the main
            ways Roomly tracks each runner's performance, and you can see your own scores.
          </p>
        </Section>

        <Section icon={<Users className="w-4 h-4" />} title="Working with other runners">
          <p>
            If a batch is too heavy for you, you can call in another runner. Record them as your helper in the app and split the ₦500 delivery pay 50/50, or
            sort it out between you. Either way, Roomly's margin doesn't change.
          </p>
        </Section>

        <Section icon={<Wallet className="w-4 h-4" />} title="Daily settlement">
          <p>Every product on Roomly has a small margin added to its price. That margin is how Roomly earns.</p>
          <p>
            <strong>Example:</strong> a student orders items listed at ₦4,000. With the ₦500 delivery fee, they pay you ₦4,500.
          </p>
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 text-xs">
            {[
              ['Student pays you', '₦4,500'],
              ['You spend on items', '₦3,500'],
              ['You keep (delivery fee)', '₦500'],
              ['You send to Roomly (margin)', '₦500'],
            ].map(([a, b], i) => (
              <div key={a} className={`flex justify-between px-3 py-2 ${i % 2 ? 'bg-slate-50 dark:bg-slate-800/60' : ''} ${i === 2 ? 'font-bold text-[#0e9f55]' : ''}`}>
                <span>{a}</span>
                <span className="font-mono">{b}</span>
              </div>
            ))}
          </div>
          <p>
            You don't need to do any maths. Your portal adds up the day's orders and shows exactly what you owe Roomly, and you can check every order yourself if
            you want to. Settle before 6am the next morning, or you stop appearing to students until you do.
          </p>
        </Section>

        <Section icon={<Users className="w-4 h-4" />} title="Boys' and girls' hostels">
          <p>
            Boys can't go into the girls' hostels, so we have runners for each side. Boys deliver to the boys' hostels ({BOYS_HOSTELS.join(', ')}), and girls
            deliver to the girls' hostels ({GIRLS_HOSTELS.join(', ')}). Students in each hostel only ever see and pay a runner from their own side.
          </p>
          <p>Girls who want to earn: we're especially looking for runners in the girls' hostels right now.</p>
        </Section>

        <Section icon={<CheckCircle2 className="w-4 h-4" />} title="What you need">
          <Bullets
            items={[
              'A smartphone with data',
              'A bank account to receive payments',
              `A room in one of the boys' hostels (${BOYS_HOSTELS.join(', ')}) or girls' hostels (${GIRLS_HOSTELS.join(', ')})`,
              'Time for at least one batch on the days you choose to work',
              'Honesty with money',
            ]}
          />
        </Section>

        <Section icon={<ShieldCheck className="w-4 h-4" />} title="Our standards">
          <p>A runner may be replaced for:</p>
          <Bullets
            items={[
              'Repeated late or missed deliveries',
              'Missing or unpaid settlements without a good reason',
              'Wrong or damaged items (you pay for items you damage, like broken eggs)',
              'Rudeness to students',
            ]}
          />
          <p>
            Theft and dishonesty are treated differently. Anyone who lies about orders or steals items or money is banned from Roomly as a customer, runner or
            any future partner. We don't expect this from anyone, but we want it to be clear.
          </p>
        </Section>

        {/* Join */}
        <div ref={formRef} className={`${card} scroll-mt-4`}>
          <h2 className="text-lg font-black">How to join</h2>
          <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal pl-5">
            <li>Fill in the short form below.</li>
            <li>We create your runner portal.</li>
            <li>
              We walk you through it: how orders arrive, how to confirm payments, how to switch batches on and off, and what students see when they order from you.
            </li>
            <li>You do your first batch with support.</li>
          </ol>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <ApplyForm />
          </div>
        </div>
      </div>
    </div>
  );
};
