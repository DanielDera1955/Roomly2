import React, { useEffect, useState } from 'react';
import { ShoppingBag, Truck, Shield } from 'lucide-react';
import { subscribeStaff } from '../api.js';
import { ThemeToggle } from './ThemeToggle';
import { SoundToggle } from './SoundToggle';

type Mode = 'customer' | 'runner' | 'admin';

interface AdminSwitcherProps {
  current: Mode;
  onSelect: (mode: Mode) => void;
}

/** Shown only when the admin is signed in: jump between the customer, runner and admin screens. */
export const AdminSwitcher: React.FC<AdminSwitcherProps> = ({ current, onSelect }) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => subscribeStaff((s: any) => setIsAdmin(s?.staff?.role === 'admin')), []);

  if (!isAdmin) return null;

  const items: { id: Mode; label: string; Icon: React.ElementType }[] = [
    { id: 'customer', label: 'Customer', Icon: ShoppingBag },
    { id: 'runner', label: 'Runner', Icon: Truck },
    { id: 'admin', label: 'Admin', Icon: Shield },
  ];

  return (
    <div className="w-full bg-slate-900 text-white px-3 py-1.5 flex items-center justify-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Admin view</span>
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
            current === id ? 'bg-[#0e9f55] text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Icon className="w-3 h-3" />
          {label}
        </button>
      ))}
      <SoundToggle className="ml-1 !p-1.5 bg-slate-800" />
      <ThemeToggle className="!p-1.5 bg-slate-800 text-slate-300" />
    </div>
  );
};
