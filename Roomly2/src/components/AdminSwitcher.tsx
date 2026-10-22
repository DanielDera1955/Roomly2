import React, { useEffect, useState } from 'react';
import { subscribeStaff } from '../api.js';

type Mode = 'customer' | 'runner' | 'operator' | 'admin';

interface AdminSwitcherProps {
  current: Mode;
  onSelect: (mode: Mode) => void;
}

/** Shown only when the admin is signed in: jump between the four screens. */
export const AdminSwitcher: React.FC<AdminSwitcherProps> = ({ current, onSelect }) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => subscribeStaff((s: any) => setIsAdmin(s?.staff?.role === 'admin')), []);

  if (!isAdmin) return null;

  const items: { id: Mode; label: string }[] = [
    { id: 'customer', label: 'Customer' },
    { id: 'runner', label: 'Runner' },
    { id: 'operator', label: 'Operator' },
    { id: 'admin', label: 'Admin' },
  ];

  return (
    <div className="w-full max-w-full overflow-hidden bg-slate-900 px-2 py-1.5">
      <div className="grid grid-cols-4 gap-1 max-w-[480px] mx-auto">
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
