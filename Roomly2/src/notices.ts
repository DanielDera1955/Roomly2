/**
 * Notification bell feed. Nothing is stored per student on the server: notices are worked out from live data.
 *  - Time-bound notices (reward week running or starting, Roomly's daily notice) disappear when their time ends.
 *    Each key keeps only its newest notice, so today's daily notice replaces yesterday's.
 *  - Personal notices (a credit you won) stay until you have read them or the credit expires.
 * Which ones this phone has seen is remembered on the device.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeSeasons, currentSeason, subscribeRewardWeeks, subscribeGamesConfig } from './season';
import { getMyCredits, type Credit } from './credits';
import { weekPhase, creditState } from './boardCore.js';
import { gameLabel } from './hub.js';

export type Notice = {
  id: string;
  /** Same key = same slot: only the newest one is shown */
  key: string;
  personal: boolean;
  title: string;
  text: string;
  atMs: number;
  /** Time-bound notices vanish at this moment */
  endMs: number;
};

const SEEN_KEY = 'roomly_notices_seen';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const writeSeen = (m: Record<string, number>) => {
  try {
    // keep it small
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 80);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
};

export function useNotices(phone: string, enabled: boolean) {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [credits, setCredits] = useState<Credit[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [seen, setSeen] = useState<Record<string, number>>(readSeen());
  const [hiddenPersonal, setHiddenPersonal] = useState<Set<string>>(() => new Set(Object.keys(readSeen()).filter((k) => k.startsWith('credit-'))));

  useEffect(() => {
    if (!enabled) return;
    const a = subscribeSeasons(setSeasons);
    const b = subscribeGamesConfig(setConfig);
    return () => {
      a();
      b();
    };
  }, [enabled]);
  const season = currentSeason(seasons, nowMs);
  useEffect(() => {
    if (!enabled) return;
    return subscribeRewardWeeks(season?.id || '', setWeeks);
  }, [enabled, season?.id]);
  useEffect(() => {
    if (!enabled || !phone) {
      setCredits([]);
      return;
    }
    let live = true;
    const load = () => getMyCredits(phone).then((l) => live && setCredits(l)).catch(() => {});
    load();
    const id = window.setInterval(load, 5 * 60000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [enabled, phone]);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const all = useMemo(() => {
    const out: Notice[] = [];
    // Roomly's notice of the day: lives until the end of that day, the next one replaces it
    const n = config?.notice;
    if (n && n.text && Number(n.endMs) > nowMs) {
      out.push({ id: `daily-${n.atMs}`, key: 'daily', personal: false, title: 'Roomly Games', text: String(n.text), atMs: Number(n.atMs), endMs: Number(n.endMs) });
    }
    weeks.forEach((w) => {
      const ph = weekPhase(w, nowMs);
      if (ph === 'running') {
        out.push({
          id: `week-run-${w.id}`,
          key: 'week',
          personal: false,
          title: `${gameLabel(w.game)} reward week is on`,
          text: `Top 3 with at least ${w.minPoints} points win a ${naira(Number(w.creditValue))} food credit. The table closes ${when(Number(w.endMs))}.`,
          atMs: Number(w.startMs),
          endMs: Number(w.endMs),
        });
      } else if (ph === 'scheduled') {
        out.push({
          id: `week-next-${w.id}`,
          key: 'week',
          personal: false,
          title: `${gameLabel(w.game)} reward week starts soon`,
          text: `It starts ${when(Number(w.startMs))}. Open Games and join with one tap.`,
          atMs: Number(w.startMs) - 1,
          endMs: Number(w.startMs),
        });
      }
    });
    credits.forEach((c) => {
      const st = creditState(c, nowMs);
      if (st === 'locked' || st === 'active') {
        out.push({
          id: `credit-${c.id}`,
          key: `credit-${c.id}`,
          personal: true,
          title: `You won a ${naira(Number(c.value))} food credit`,
          text: st === 'locked' ? `Your ${gameLabel(c.game)} credit opens ${when(Number(c.validFromMs))} and lasts 24 hours. Tick "Use my Games credit" at checkout.` : `Your ${gameLabel(c.game)} credit is open. Order before ${when(Number(c.expiresAtMs))}.`,
          atMs: Number(c.issuedAtMs),
          endMs: Number(c.expiresAtMs),
        });
      }
    });
    // one per key, newest wins
    const best = new Map<string, Notice>();
    out.forEach((x) => {
      const cur = best.get(x.key);
      if (!cur || x.atMs > cur.atMs) best.set(x.key, x);
    });
    return [...best.values()].sort((a, b) => b.atMs - a.atMs);
  }, [config, weeks, credits, nowMs]);

  // A personal notice read on an earlier visit is gone; time-bound ones stay until they end
  const visible = all.filter((x) => !(x.personal && hiddenPersonal.has(x.id)));
  const unread = visible.filter((x) => !seen[x.id]).length;

  /** Call when the bell is opened: marks everything as seen. Personal notices seen before are removed now. */
  const markSeen = () => {
    const next = { ...seen };
    const hide = new Set(hiddenPersonal);
    all.forEach((x) => {
      if (x.personal && seen[x.id]) hide.add(x.id);
      if (!next[x.id]) next[x.id] = Date.now();
    });
    setHiddenPersonal(hide);
    setSeen(next);
    writeSeen(next);
  };

  return { notices: visible, unread, markSeen, groupLink: String(config?.groupLink || ''), notice: config?.notice && Number(config.notice.endMs) > nowMs ? String(config.notice.text || '') : '' };
}
