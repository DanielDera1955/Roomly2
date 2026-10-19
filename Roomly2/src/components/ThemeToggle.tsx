import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/** Light/dark switch that works on every screen (customer, runner, admin). */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('roomly-theme', sync);
    return () => window.removeEventListener('roomly-theme', sync);
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('roomly_dark_mode', String(next));
    } catch (e) {
      /* ignore */
    }
    window.dispatchEvent(new Event('roomly-theme'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`p-2 rounded-xl cursor-pointer ${className}`}
    >
      {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};
