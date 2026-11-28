import React from 'react';
import { Trophy, Clock } from 'lucide-react';
import { weekPhase, POINTS, MAX_PAIR_REWARD_WEEK } from '../boardCore.js';
import { targetOf, type ChallengeView } from '../challenges';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';
const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const Bar: React.FC<{ title: string; right: string; pct: number; color: string; icon?: React.ReactNode }> = ({ title, right, pct, color, icon }) => (
  <div>
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
        {icon} {title}
      </p>
      <p className="text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">{right}</p>
    </div>
    <div className="mt-1.5 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  </div>
);

/**
 * League tab: two bars under the weekly reward banner. How close the player is to the weekly reward and to the running
 * challenge, with the exact thing to do under each. Each bar shows only while its own reward is running.
 */
export const RaceBars: React.FC<{
  week: any | null;
  weeklyRows: any[];
  challengeViews: ChallengeView[];
  game: string;
  me: any;
  member: boolean;
  nowMs: number;
}> = ({ week, weeklyRows, challengeViews, game, me, member, nowMs }) => {
  if (!me || !member) return null;

  /* ---------------- weekly reward ---------------- */
  const weeklyOn = Boolean(week && weekPhase(week, nowMs) === 'running');
  let weekly: React.ReactNode = null;
  if (weeklyOn) {
    const minPts = Number(week.minPoints) || 25;
    const credit = naira(Number(week.creditValue) || 3500);
    const idx = weeklyRows.findIndex((r: any) => r.id === me.id);
    const mine = idx >= 0 ? weeklyRows[idx] : null;
    const pts = Number(mine?.pts) || 0;
    const rank = mine && pts > 0 ? Number(mine.rank) || idx + 1 : 0;
    const third = Number(weeklyRows[2]?.pts) || 0;
    const need = Math.max(0, minPts - pts);
    const winsNeed = Math.ceil(need / POINTS.win);
    const inTop3 = rank > 0 && rank <= 3;
    const lines: string[] = [];
    if (pts === 0) {
      lines.push(`You have no points this week yet. Win a match to get on the board. You need ${minPts} pts, which is ${Math.ceil(minPts / POINTS.win)} wins, to qualify.`);
    } else {
      lines.push(`You have ${pts} of ${minPts} pts this week.${need > 0 ? ` Win ${winsNeed} more ${plural(winsNeed, 'match', 'matches')} to qualify (${POINTS.win} pts per win, ${POINTS.draw} per draw).` : ' You have enough points to qualify.'}`);
      if (inTop3) lines.push(need > 0 ? `You are #${rank}, inside the top 3. Reach ${minPts} pts to win ${credit}.` : `You are #${rank}, inside the top 3. Keep winning to stay there.`);
      else lines.push(`You are #${rank}. 3rd place has ${third} pts, so you need ${Math.max(minPts, third + 1)} or more to win ${credit}.`);
    }
    lines.push(
      `Only ${MAX_PAIR_REWARD_WEEK} matches per player count for the weekly reward (1 home, 1 away). Play different players to earn more points. All your matches still count in the league table.`
    );
    weekly = (
      <div className="space-y-1.5">
        <Bar title="Weekly reward" right={`${pts}/${minPts} pts`} pct={pts <= 0 ? 0 : Math.min(100, Math.max(4, Math.round((pts / minPts) * 100)))} color="#0e9f55" icon={<Trophy className="w-3.5 h-3.5 text-[#0e9f55]" />} />
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{lines[0]}</p>
        {lines.slice(1, -1).map((l, i) => (
          <p key={i} className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {l}
          </p>
        ))}
        <p className="text-[11px] text-slate-500">{lines[lines.length - 1]}</p>
      </div>
    );
  }

  /* ---------------- running challenge ---------------- */
  const forGame = (v: ChallengeView) => v.challenge.game === game || v.challenge.game === 'all';
  const running = challengeViews.filter((v) => v.phase === 'running' && forGame(v) && nowMs < Number(v.challenge.endMs));
  const entryOf = (v: ChallengeView) => v.entries.find((e) => e.app.gid === me.id) || null;
  // The play challenge needs no sign-up. Other kinds count once the player has applied.
  const view = running.find((v) => v.challenge.template === 'play') || running.find((v) => entryOf(v));
  let challenge: React.ReactNode = null;
  if (view) {
    const c = view.challenge;
    const isPlay = c.template === 'play';
    const mine = entryOf(view);
    const target = targetOf(c);
    const count = mine ? Number(mine.progress.wins) || 0 : 0;
    const left = Math.max(0, target - count);
    const endTxt = when(Number(c.endMs));
    const done = left === 0 && count > 0;
    const state = mine?.progress.state;
    const lead = done
      ? isPlay
        ? 'You reached the target. Roomly is checking your matches.'
        : 'You reached the target. Roomly is checking your matches.'
      : state === 'out'
      ? 'You can no longer reach the target in this challenge.'
      : isPlay
      ? `You have played ${count} of ${target} different Caritas players. Play ${left} more different ${plural(left, 'player', 'players')}, any result, before ${endTxt}.`
      : `You have ${count} of ${target} ${plural(target, 'win', 'wins')}. Win ${left} more ${plural(left, 'match', 'matches')}${c.diffOpp ? ' against different players' : ''} before ${endTxt}.`;
    const daysLeft = Math.max(0, Math.ceil((Number(c.endMs) - nowMs) / 86400000));
    challenge = (
      <div className="space-y-1.5">
        <Bar
          title={`${naira(c.prize)} challenge`}
          right={`${count}/${target}`}
          pct={count <= 0 ? 0 : Math.min(100, Math.max(4, Math.round((count / Math.max(1, target)) * 100)))}
          color="#f59e0b"
          icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
        />
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{lead}</p>
        <p className="text-[11px] text-slate-500">
          {daysLeft} {plural(daysLeft, 'day', 'days')} left. {isPlay ? 'Only logged league matches count, once per opponent.' : 'Only normally logged league matches count.'}
        </p>
      </div>
    );
  }

  if (!weekly && !challenge) return null;
  return (
    <div className={`${card} p-4 space-y-4`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0e9f55]">Your race to the rewards</p>
      {weekly}
      {weekly && challenge && <div className="border-t border-slate-100 dark:border-slate-800" />}
      {challenge}
    </div>
  );
};
