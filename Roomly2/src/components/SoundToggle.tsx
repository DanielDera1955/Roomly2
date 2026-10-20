import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundOn, setSoundOn } from '../sound';

/** Turn notification sounds on or off (remembered on this device). */
export const SoundToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [on, setOn] = useState(isSoundOn());

  useEffect(() => {
    const sync = () => setOn(isSoundOn());
    window.addEventListener('roomly-sound', sync);
    return () => window.removeEventListener('roomly-sound', sync);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setSoundOn(!on)}
      aria-label={on ? 'Turn notification sound off' : 'Turn notification sound on'}
      title={on ? 'Sound on' : 'Sound off'}
      className={`p-2 rounded-xl cursor-pointer ${className}`}
    >
      {on ? <Volume2 className="w-4 h-4 text-[#0e9f55]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
    </button>
  );
};
