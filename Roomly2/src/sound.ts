// Notification sounds (no audio files needed). Can be switched off by the user.
let ctx: AudioContext | null = null;

export const isSoundOn = (): boolean => {
  try {
    return localStorage.getItem('roomly_sound') !== 'off';
  } catch (e) {
    return true;
  }
};

export const setSoundOn = (on: boolean) => {
  try {
    localStorage.setItem('roomly_sound', on ? 'on' : 'off');
  } catch (e) {
    /* ignore */
  }
  window.dispatchEvent(new Event('roomly-sound'));
  if (on) playChime('chat');
};

function getCtx(): AudioContext | null {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// Browsers only allow sound after the person has touched the page once
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
}

/** 'order' = three rising notes (new order), 'chat' = two notes (new message or status change) */
export function playChime(kind: 'order' | 'chat' = 'chat') {
  if (!isSoundOn()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const notes = kind === 'order' ? [880, 1175, 1568] : [660, 880];
  const t0 = c.currentTime;
  notes.forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const s = t0 + i * 0.16;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
    o.start(s);
    o.stop(s + 0.32);
  });
  try {
    navigator.vibrate?.(kind === 'order' ? [120, 60, 120] : [80]);
  } catch (e) {
    /* ignore */
  }
}
