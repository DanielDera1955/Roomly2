import React, { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { getPaymentSettings, savePaymentSettings, normalizePhone, isValidNigerianPhone } from '../api.js';

/** Admin: how students pay. "Current way" = the runner's / operator's own account; "Paystack" = Roomly, confirmed automatically. */
export const PaymentModePanel: React.FC = () => {
  const [s, setS] = useState<any>(getPaymentSettings());
  const [phones, setPhones] = useState<string>((getPaymentSettings().testPhones || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const acct0: any = getPaymentSettings().roomlyAccount || {};
  const [acct, setAcct] = useState({ bankName: acct0.bankName || '', accountNumber: acct0.accountNumber || '', accountName: acct0.accountName || '' });
  const [acctNote, setAcctNote] = useState('');

  useEffect(() => {
    const h = () => {
      const now = getPaymentSettings();
      setS(now);
      setPhones((now.testPhones || []).join(', '));
    };
    window.addEventListener('roomly-payments', h);
    return () => window.removeEventListener('roomly-payments', h);
  }, []);

  const setMode = async (mode: 'direct' | 'paystack' | 'manual') => {
    if (mode === s.mode) return;
    if (
      mode === 'paystack' &&
      !window.confirm(
        'Switch every student to Paystack?\n\nOnly do this once Paystack has approved Roomly and the LIVE keys are in Vercel. With test keys, real students cannot pay.\n\nFrom now on, paid orders come to you to assign.'
      )
    )
      return;
    if (mode === 'manual') {
      const a = s.roomlyAccount || {};
      if (!a.accountNumber) {
        window.alert("Save Roomly's bank account below first. Manual mode shows it to students.");
        return;
      }
      if (!window.confirm("Switch to Manual? Students transfer to Roomly's account and tap \"I have made payment\". You confirm each one in Orders.")) return;
    }
    setBusy(true);
    try {
      await savePaymentSettings({ mode });
    } catch (e) {
      window.alert('Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const savePhones = async () => {
    const list = phones
      .split(/[\s,]+/)
      .map((p) => normalizePhone(p))
      .filter((p) => p && isValidNigerianPhone(p));
    setBusy(true);
    try {
      await savePaymentSettings({ testPhones: Array.from(new Set(list)) });
      setNote(list.length ? `Saved. ${list.length} test number${list.length > 1 ? 's' : ''} pay through Paystack.` : 'Saved. No test numbers.');
    } catch (e) {
      setNote('Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const btn = (on: boolean) =>
    `flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
      on ? 'bg-[#0e9f55] border-[#0e9f55] text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
    }`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
        <CreditCard className="w-4 h-4 text-[#0e9f55]" />
        <span>Payment mode</span>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={btn(s.mode !== 'paystack' && s.mode !== 'manual')} onClick={() => setMode('direct')}>
          Current way
        </button>
        <button type="button" disabled={busy} className={btn(s.mode === 'paystack')} onClick={() => setMode('paystack')}>
          Paystack
        </button>
        <button type="button" disabled={busy} className={btn(s.mode === 'manual')} onClick={() => setMode('manual')}>
          Manual
        </button>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        {s.mode === 'paystack'
          ? 'Every student pays Roomly through Paystack and payments confirm automatically. Paid orders come to you: assign inside orders to a runner and send outside orders to the store. If Paystack is down, switch to Manual.'
          : s.mode === 'manual'
          ? "Emergency mode: students transfer to Roomly's account below and tap \"I have made payment\". Confirm each one in Orders, then assign it as usual."
          : 'Students pay the runner or operator, as before. Only the test numbers below see the Paystack button.'}
      </p>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Test phone numbers (see Paystack while on Current way)</label>
        <div className="flex gap-2">
          <input
            value={phones}
            onChange={(e) => {
              setPhones(e.target.value);
              setNote('');
            }}
            placeholder="e.g. 08012345678"
            className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          />
          <button type="button" disabled={busy} onClick={savePhones} className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold">
            Save
          </button>
        </div>
        {note && <p className="text-[11px] text-[#0e9f55] font-semibold">{note}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Roomly's bank account (shown to students only in Manual mode)</label>
        {(['bankName', 'accountNumber', 'accountName'] as const).map((k) => (
          <input
            key={k}
            value={acct[k]}
            onChange={(e) => {
              setAcct({ ...acct, [k]: e.target.value });
              setAcctNote('');
            }}
            placeholder={k === 'bankName' ? 'Bank (e.g. Moniepoint)' : k === 'accountNumber' ? 'Account number' : 'Account name'}
            inputMode={k === 'accountNumber' ? 'numeric' : undefined}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          />
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const a = { bankName: acct.bankName.trim(), accountNumber: acct.accountNumber.replace(/\D/g, ''), accountName: acct.accountName.trim() };
            if (a.accountNumber && (a.accountNumber.length !== 10 || !a.bankName || !a.accountName)) {
              setAcctNote('Enter the bank, a 10-digit account number and the account name.');
              return;
            }
            setBusy(true);
            try {
              await savePaymentSettings({ roomlyAccount: a.accountNumber ? a : null });
              setAcctNote('Saved.');
            } catch (e) {
              setAcctNote('Could not save. Check your connection.');
            } finally {
              setBusy(false);
            }
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
        >
          Save account
        </button>
        {acctNote && <p className="text-[11px] text-[#0e9f55] font-semibold">{acctNote}</p>}
      </div>
    </div>
  );
};
