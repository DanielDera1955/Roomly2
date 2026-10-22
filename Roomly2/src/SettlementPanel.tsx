import React, { useEffect, useState } from 'react';
import {
  subscribeMyTodaySummary,
  subscribeMyOpenSettlements,
  sendSettlement,
  subscribeOpenSettlements,
  adminConfirmSettlement,
  savePayAccount,
  getCurrentStaff,
  isOverdue,
} from '../api.js';
import { STORE_CONFIG, SETTLE_BY_HOUR, RUNNER_SHARE } from '../config';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const dayText = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const deadlineText = (d: string) => {
  const due = new Date(d + 'T00:00:00');
  due.setDate(due.getDate() + 1);
  return `${SETTLE_BY_HOUR}am ${due.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3';
const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white';

/** One open day: what is owed, what was sent, and the "I have sent" form */
const OpenDay: React.FC<{ d: any }> = ({ d }) => {
  const remaining = Math.max(0, Math.round((d.due || 0) - (d.sentTotal || 0)));
  const [amount, setAmount] = useState(String(remaining || ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue([d.date]);

  useEffect(() => setAmount(String(remaining || '')), [remaining]);

  const send = async () => {
    setBusy(true);
    try {
      await sendSettlement(d.id, Number(amount), note);
      setNote('');
    } catch (e: any) {
      window.alert(e?.message || 'Could not save. Try again.');
    }
    setBusy(false);
  };

  return (
    <div className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{dayText(d.date)}</p>
          <p className="text-[11px] text-slate-500">
            {d.orders || 0} order(s) · {overdue ? 'Overdue: you are hidden from checkout until Roomly confirms' : `Clear before ${deadlineText(d.date)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-extrabold text-amber-700 dark:text-amber-300">{naira(d.due)}</p>
          <p className="text-[10px] text-slate-400">owed</p>
        </div>
      </div>
      {(d.payments || []).length > 0 && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          {(d.payments || []).map((p: any, i: number) => (
            <p key={i}>
              Sent {naira(p.amount)}
              {p.note ? `: ${p.note}` : ''}
            </p>
          ))}
          <p className="font-semibold">
            {d.confirmed > 0 ? `Roomly confirmed ${naira(d.confirmed)}. ` : 'Waiting for Roomly to confirm. '}
            {remaining > 0 ? `${naira(remaining)} still to send.` : ''}
          </p>
        </div>
      )}
      {remaining > 0 && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} placeholder="Amount" />
            <button
              type="button"
              disabled={busy || !Number(amount)}
              onClick={send}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
            >
              I have sent
            </button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={input} placeholder="Note (e.g. part payment, rest by 9am)" />
        </div>
      )}
    </div>
  );
};

/** Runners and operators: today's statement (runners) and the days they still need to clear */
export const ProviderSettlement: React.FC<{ kind: 'runner' | 'operator' }> = ({ kind }) => {
  const [today, setToday] = useState<any | null>(null);
  const [open, setOpen] = useState<any[]>([]);
  useEffect(() => subscribeMyTodaySummary(setToday), []);
  useEffect(() => subscribeMyOpenSettlements(setOpen), []);
  const owing = open.filter((d) => (d.due || 0) > 0 || (d.sentTotal || 0) > 0);
  const bank = STORE_CONFIG.bankDetails;

  return (
    <div className={card}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Money: today and settlement</p>

      {kind === 'runner' && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <span className="block text-[10px] font-bold uppercase text-slate-500">Delivered today</span>
            <span className="block text-base font-extrabold">{today?.orders || 0}</span>
            <span className="block text-[10px] text-slate-400">Spent on items {naira(today?.itemsCost)}</span>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <span className="block text-[10px] font-bold uppercase text-slate-500">Profit today</span>
            <span className="block text-base font-extrabold">{naira(today?.profit)}</span>
            <span className="block text-[10px] text-slate-400">margin + delivery fees</span>
          </div>
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
            <span className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">You keep</span>
            <span className="block text-base font-extrabold text-[#0e9f55]">{naira(today?.keep)}</span>
            <span className="block text-[10px] text-slate-400">
              items + {Math.round(RUNNER_SHARE * 100)}% of profit{today?.gateFees ? ` + ${naira(today.gateFees)} gate` : ''}
            </span>
          </div>
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-2.5">
            <span className="block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Owed today</span>
            <span className="block text-base font-extrabold text-amber-700 dark:text-amber-300">{naira(today?.due)}</span>
            <span className="block text-[10px] text-slate-400">{Math.round((1 - RUNNER_SHARE) * 100)}% of profit</span>
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-600 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        Send what you owe to <strong>{bank.bankName} · {bank.accountNumber}</strong> ({bank.accountName}) before {SETTLE_BY_HOUR}am the next
        morning, then tap "I have sent". Part payments are fine; add a note.
      </div>

      {owing.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing to clear. Days with no orders need nothing.</p>
      ) : (
        owing.map((d) => <OpenDay key={d.id} d={d} />)
      )}
      {today?.estimated && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">Some amounts are estimated because an item has no cost price yet.</p>
      )}
    </div>
  );
};

/** Runners and operators: the account students pay into */
export const PayAccountForm: React.FC = () => {
  const staff = getCurrentStaff();
  const cur = staff?.payAccount;
  const [editing, setEditing] = useState(!cur);
  const [bankName, setBank] = useState(cur?.bankName || '');
  const [accountNumber, setNumber] = useState(cur?.accountNumber || '');
  const [accountName, setName] = useState(cur?.accountName || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await savePayAccount({ bankName, accountNumber, accountName });
      setEditing(false);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy(false);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Where students pay you</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-bold text-[#0e9f55] cursor-pointer">
            Change
          </button>
        )}
      </div>
      {!editing && cur ? (
        <p className="text-xs">
          {cur.bankName} · <strong>{cur.accountNumber}</strong> · {cur.accountName}
        </p>
      ) : (
        <div className="space-y-1.5">
          <input value={bankName} onChange={(e) => setBank(e.target.value)} className={input} placeholder="Bank name, e.g. Opay" />
          <input
            value={accountNumber}
            inputMode="numeric"
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className={input}
            placeholder="10-digit account number"
          />
          <input value={accountName} onChange={(e) => setName(e.target.value)} className={input} placeholder="Account name" />
          <button type="button" disabled={busy} onClick={save} className="w-full py-2 rounded-lg bg-[#0e9f55] text-white text-xs font-bold disabled:opacity-40 cursor-pointer">
            Save account
          </button>
          <p className="text-[11px] text-slate-400">
            Students on your orders see this account. Until you add one, they see Roomly's account. Runners: after saving, switch your batch off and on once so new orders pick it up.
          </p>
        </div>
      )}
    </div>
  );
};

/** Admin: every open day on one screen. Confirm what arrived, or mark settled if paid outside the app. */
export const AdminSettlementsPanel: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => subscribeOpenSettlements(setList), []);

  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const rows = list.filter((d) => (d.due || 0) > 0 || (d.sentTotal || 0) > 0);
  const totalOpen = rows.reduce((t, d) => t + Math.max(0, (d.due || 0) - (d.confirmed || 0)), 0);

  const act = async (d: any, override: boolean) => {
    const amt = override ? 0 : Number(amounts[d.id] ?? Math.max(0, (d.sentTotal || 0) - (d.confirmed || 0)));
    if (!override && !(amt > 0)) {
      window.alert('Enter the amount you received.');
      return;
    }
    if (override && !window.confirm(`Mark ${d.name}'s ${dayText(d.date)} as settled? Use this when they paid you outside the app.`)) return;
    setBusy(d.id);
    try {
      await adminConfirmSettlement(d.id, amt, override);
    } catch (e: any) {
      window.alert(e?.message || 'Could not save.');
    }
    setBusy('');
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Daily settlement</p>
        <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{naira(totalOpen)} open</span>
      </div>
      {rows.length === 0 && <p className="text-xs text-slate-400">Everyone is settled.</p>}
      {rows.map((d) => {
        const overdue = isOverdue([d.date]);
        const unconfirmed = Math.max(0, (d.sentTotal || 0) - (d.confirmed || 0));
        return (
          <div
            key={d.id}
            className={`p-3 rounded-2xl text-xs space-y-2 ${overdue ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white">
                  {d.name || 'Provider'} <span className="font-normal text-slate-500">· {d.kind === 'runner' ? 'Runner' : d.kind === 'food' ? 'Food' : 'Store'}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {dayText(d.date)}
                  {d.date === ymd ? ' (today, still open)' : ''} · {d.orders || 0} order(s)
                  {overdue ? ' · OVERDUE, hidden from checkout' : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold">{naira(d.due)}</p>
                <p className="text-[10px] text-slate-400">
                  sent {naira(d.sentTotal)} · confirmed {naira(d.confirmed)}
                </p>
              </div>
            </div>
            {(d.payments || []).map((p: any, i: number) => (
              <p key={i} className="text-[11px] text-slate-500">
                {naira(p.amount)}
                {p.note ? `: ${p.note}` : ''}
              </p>
            ))}
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={amounts[d.id] ?? String(unconfirmed || '')}
                onChange={(e) => setAmounts((a) => ({ ...a, [d.id]: e.target.value }))}
                className={input}
                placeholder="Amount received"
              />
              <button
                type="button"
                disabled={busy === d.id}
                onClick={() => act(d, false)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0e9f55] text-white font-bold disabled:opacity-40 cursor-pointer"
              >
                Confirm
              </button>
            </div>
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => act(d, true)}
              className="w-full py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold disabled:opacity-40 cursor-pointer"
            >
              Mark settled (paid outside the app)
            </button>
          </div>
        );
      })}
    </div>
  );
};
