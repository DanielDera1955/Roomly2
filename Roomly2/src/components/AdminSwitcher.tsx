import React, { useEffect, useState } from 'react';
import { subscribeStaff } from '../api.js';

type Mode = 'customer' | 'runner' | 'operator' | 'admin';

interface AdminSwitcherProps {
  current: Mode;
  onSelect: (mode: Mode) => void;
}

/**
 * Shown only to signed-in staff. Admin: jump between the four screens.
 * Runners and operators: switch between shopping (Customer) and their own work screen.
 * Students never see it.
 */
export const AdminSwitcher: React.FC<AdminSwitcherProps> = ({ current, onSelect }) => {
  const [role, setRole] = useState<string>('');

  useEffect(() => subscribeStaff((s: any) => setRole(s?.staff?.role || '')), []);

  const items: { id: Mode; label: string }[] =
    role === 'admin'
      ? [
          { id: 'customer', label: 'Customer' },
          { id: 'runner', label: 'Runner' },
          { id: 'operator', label: 'Operator' },
          { id: 'admin', label: 'Admin' },
        ]
      : role === 'runner'
      ? [
          { id: 'customer', label: 'Customer' },
          { id: 'runner', label: 'My Runner screen' },
        ]
      : role === 'store' || role === 'food'
      ? [
          { id: 'customer', label: 'Customer' },
          { id: 'operator', label: 'My Operator screen' },
        ]
      : [];
  if (!items.length) return null;

  return (
    <div className="w-full max-w-full overflow-hidden bg-slate-900 px-2 py-1.5">
      <div className={`grid ${items.length === 4 ? 'grid-cols-4' : 'grid-cols-2'} gap-1 max-w-[480px] mx-auto`}>
        {items.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`min-w-0 truncate px-1 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
              current === id ? 'bg-[#0e9f55] text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
