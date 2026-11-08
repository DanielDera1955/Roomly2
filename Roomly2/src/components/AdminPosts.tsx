import React, { useEffect, useState } from 'react';
import { Copy, Share2, Check, Plus, Trash2, Undo2 } from 'lucide-react';
import { getAdminNextInside, getAllOperatorStatus, outsideDayOn, opDaySwitch } from '../api.js';
import { slotsForDay } from '../config';
import { subscribeHubSettings, outsideStoreOpensAt } from '../hub.js';
import { SECTION_LINKS as LINKS, buildLink } from '../links.js';
const SECTION_LINKS: Record<string, any> = LINKS as any;
import {
  DAY_NAMES,
  NEEDS,
  subscribeSchedule,
  subscribeLog,
  saveSchedule,
  loadStarterPosts,
  markPosted,
  undoPosted,
  duePosts,
  clockLabel,
} from '../posts.js';

const card = 'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4';
const input =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30';
const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer';

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** What each post advertises: is it live right now? */
function useLive(): Record<string, boolean> {
  const [nowMs, setNowMs] = useState(Date.now());
  const [hubSettings, setHubSettings] = useState<any>({});
  useEffect(() => subscribeHubSettings(setHubSettings), []);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date(nowMs);
  const ops = (getAllOperatorStatus() as any[]) || [];
  // Any batch of that day (food has lunch and dinner) with a vendor on it
  const opOn = (kind: string, offset: number) =>
    slotsForDay(kind as any, now, offset).some((opt) =>
      ops.some((o) => o.kind === kind && !o.adminOff && outsideDayOn(opDaySwitch(o, opt)))
    );
  const next = getAdminNextInside('boys', now) as any;
  return {
    inside: Boolean(next && next.live),
    food: opOn('food', 0),
    foodTomorrow: opOn('food', 1),
    store: nowMs >= outsideStoreOpensAt(hubSettings) && opOn('store', 0),
    _tick: nowMs as any,
  };
}

/** Top of every admin tab: the posts to share right now, one row per group */
export const PostsDue: React.FC = () => {
  const [schedule, setSchedule] = useState<any>(null);
  const [log, setLog] = useState<any>({});
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState<string>('');
  useEffect(() => subscribeSchedule(setSchedule), []);
  useEffect(() => subscribeLog(setLog), []);
  const live = useLive();
  const due = duePosts(schedule, log, live, new Date());
  if (!due.length) return null;

  return (
    <div className={`${card} space-y-3`}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Posts to share now ({due.filter((d) => !d.held).length})</p>
      {due.map(({ post, held, rows }) => (
        <div key={post.id} className={`rounded-2xl border p-3 space-y-2 ${held ? 'border-slate-200 dark:border-slate-700 opacity-70' : 'border-amber-300 dark:border-amber-700'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{post.title}</p>
              <p className="text-[11px] text-slate-500">
                {clockLabel(post.start)} to {clockLabel(post.end)}
                {SECTION_LINKS[post.section] ? ` · opens ${SECTION_LINKS[post.section].label}` : ''}
              </p>
              {held && <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{held}. It shows here once that changes.</p>}
            </div>
            <button type="button" onClick={() => setOpen(open === post.id ? '' : post.id)} className="text-[11px] font-bold text-[#0e9f55] cursor-pointer shrink-0">
              {open === post.id ? 'Hide text' : 'See text'}
            </button>
          </div>
          {open === post.id && (
            <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl p-2 font-sans">{rows[0].full}</pre>
          )}
          {!held &&
            rows.map((r: any) => {
              const key = `${post.id}__${r.group.id}`;
              return (
                <div key={key} className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${r.posted ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{r.group.name}</p>
                    <p className="text-[10px] text-slate-400">Version {r.v + 1}</p>
                  </div>
                  {r.posted ? (
                    <button type="button" onClick={() => undoPosted(post.id, r.group.id)} className={`${btn} text-slate-500 border border-slate-200 dark:border-slate-700`}>
                      <Undo2 className="w-3 h-3" /> Undo
                    </button>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (await copyText(r.full)) {
                            setCopied(key);
                            window.setTimeout(() => setCopied(''), 2000);
                          }
                        }}
                        className={`${btn} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                      >
                        <Copy className="w-3 h-3" /> {copied === key ? 'Copied' : 'Copy'}
                      </button>
                      <a href={`https://wa.me/?text=${encodeURIComponent(r.full)}`} target="_blank" rel="noreferrer" className={`${btn} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}>
                        <Share2 className="w-3 h-3" /> Share
                      </a>
                      <button type="button" onClick={() => markPosted(post.id, r.group.id, r.v)} className={`${btn} bg-[#0e9f55] text-white`}>
                        <Check className="w-3 h-3" /> Posted
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
      <p className="text-[10px] text-slate-400 leading-snug">Share opens WhatsApp with the text ready; pick the group there. Each group's link carries its own tag. A post drops off when its time passes.</p>
    </div>
  );
};

const newId = () => Math.random().toString(36).slice(2, 9);
const stable = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
    ? `{${Object.keys(v)
        .filter((k) => k !== 'updatedAt')
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
        .join(',')}}`
    : JSON.stringify(v);

/** Admin > Posts: groups and the post schedule, all editable */
export const PostSchedule: React.FC = () => {
  const [schedule, setSchedule] = useState<any>(undefined);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [openPost, setOpenPost] = useState('');
  useEffect(
    () =>
      subscribeSchedule((s: any) => {
        setSchedule(s);
        setDraft((d: any) => d || (s ? JSON.parse(JSON.stringify(s)) : null));
      }),
    []
  );

  if (schedule === undefined) return <div className={card}><p className="text-xs text-slate-400">Loading posts...</p></div>;
  if (!schedule || !draft)
    return (
      <div className={`${card} space-y-3`}>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Post schedule</p>
        <p className="text-xs text-slate-500">No posts yet. Load the starter week (your groups and two versions of each post), then edit anything you like.</p>
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await loadStarterPosts();
            } catch {
              setMsg('Could not save. Check that the new Firestore rules are published.');
            }
            setSaving(false);
          }}
          className={`${btn} bg-[#0e9f55] text-white`}
        >
          {saving ? 'Loading...' : 'Load starter posts'}
        </button>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </div>
    );

  const set = (patch: any) => setDraft({ ...draft, ...patch });
  const setGroup = (i: number, patch: any) => set({ groups: draft.groups.map((g: any, j: number) => (j === i ? { ...g, ...patch } : g)) });
  const setPost = (id: string, patch: any) => set({ posts: draft.posts.map((p: any) => (p.id === id ? { ...p, ...patch } : p)) });
  const changed = stable(draft) !== stable(schedule);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await saveSchedule(draft);
      setMsg('Saved');
    } catch {
      setMsg('Could not save. Check that the new Firestore rules are published.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Groups */}
      <div className={`${card} space-y-3`}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">WhatsApp groups</p>
        {draft.groups.map((g: any, i: number) => (
          <div key={g.id} className="grid grid-cols-[1fr_80px_60px_28px] gap-1.5 items-center">
            <input className={input} value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} placeholder="Group name" />
            <input className={input} value={g.tag} onChange={(e) => setGroup(i, { tag: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} placeholder="tag" />
            <input className={input} type="number" min={0} value={g.max} onChange={(e) => setGroup(i, { max: Number(e.target.value) || 0 })} title="Posts a day (0 = no limit)" />
            <button type="button" onClick={() => set({ groups: draft.groups.filter((_: any, j: number) => j !== i) })} className="text-slate-400 hover:text-red-600 cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <p className="text-[10px] text-slate-400">Name, link tag, posts a day (0 = no limit). The tag shows in "Where students come from".</p>
        <button type="button" onClick={() => set({ groups: [...draft.groups, { id: newId(), name: '', tag: '', max: 2 }] })} className={`${btn} border border-slate-200 dark:border-slate-700`}>
          <Plus className="w-3 h-3" /> Add group
        </button>
      </div>

      {/* Posts */}
      <div className={`${card} space-y-2`}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Posts ({draft.posts.length})</p>
        {draft.posts.map((p: any) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <button type="button" onClick={() => setOpenPost(openPost === p.id ? '' : p.id)} className="w-full text-left cursor-pointer">
              <p className={`text-sm font-bold ${p.paused ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                {p.title || 'Untitled post'}
                {p.paused ? ' (paused)' : ''}
              </p>
              <p className="text-[11px] text-slate-500">
                {(p.days || []).map((d: number) => DAY_NAMES[d]).join(', ') || 'No days'} · {clockLabel(p.start)} to {clockLabel(p.end)} · {(p.variants || []).length} versions
                {p.until ? ` · until ${p.until}` : ''}
              </p>
            </button>
            {openPost === p.id && (
              <div className="space-y-2">
                <input className={input} value={p.title} onChange={(e) => setPost(p.id, { title: e.target.value })} placeholder="Title (only you see this)" />
                <div className="flex flex-wrap gap-1">
                  {DAY_NAMES.map((d, i) => {
                    const on = (p.days || []).includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPost(p.id, { days: on ? p.days.filter((x: number) => x !== i) : [...(p.days || []), i].sort() })}
                        className={`${btn} ${on ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700 text-slate-500'}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="text-[10px] text-slate-500">
                    From
                    <input className={input} type="time" value={p.start} onChange={(e) => setPost(p.id, { start: e.target.value })} />
                  </label>
                  <label className="text-[10px] text-slate-500">
                    To
                    <input className={input} type="time" value={p.end} onChange={(e) => setPost(p.id, { end: e.target.value })} />
                  </label>
                  <label className="text-[10px] text-slate-500">
                    Stop after (optional)
                    <input className={input} type="date" value={p.until || ''} onChange={(e) => setPost(p.id, { until: e.target.value })} />
                  </label>
                </div>
                <label className="block text-[10px] text-slate-500">
                  Link opens
                  <select className={input} value={p.section} onChange={(e) => setPost(p.id, { section: e.target.value })}>
                    <option value="">Home page</option>
                    {Object.entries(SECTION_LINKS).map(([k, v]: any) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] text-slate-500">
                  Only show when
                  <select className={input} value={p.needs} onChange={(e) => setPost(p.id, { needs: e.target.value })}>
                    {NEEDS.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">Groups</p>
                  <div className="flex flex-wrap gap-1">
                    {draft.groups.map((g: any) => {
                      const on = (p.groups || []).includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setPost(p.id, { groups: on ? p.groups.filter((x: string) => x !== g.id) : [...(p.groups || []), g.id] })}
                          className={`${btn} ${on ? 'bg-[#0e9f55] text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-500'}`}
                        >
                          {g.name || g.tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {(p.variants || []).map((t: string, i: number) => (
                  <div key={i}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-500">Version {i + 1}</p>
                      <button type="button" onClick={() => setPost(p.id, { variants: p.variants.filter((_: any, j: number) => j !== i) })} className="text-[10px] font-bold text-red-600 cursor-pointer">
                        Remove
                      </button>
                    </div>
                    <textarea className={`${input} min-h-[140px]`} value={t} onChange={(e) => setPost(p.id, { variants: p.variants.map((x: string, j: number) => (j === i ? e.target.value : x)) })} />
                  </div>
                ))}
                <p className="text-[10px] text-slate-400">The link is added at the end for each group, e.g. {buildLink(draft.groups[0]?.tag || 'rg', p.section)}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setPost(p.id, { variants: [...(p.variants || []), ''] })} className={`${btn} border border-slate-200 dark:border-slate-700`}>
                    <Plus className="w-3 h-3" /> Add version
                  </button>
                  <button type="button" onClick={() => setPost(p.id, { paused: !p.paused })} className={`${btn} border border-slate-200 dark:border-slate-700`}>
                    {p.paused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = newId();
                      set({ posts: [...draft.posts, { ...JSON.parse(JSON.stringify(p)), id, title: `${p.title} (copy)` }] });
                      setOpenPost(id);
                    }}
                    className={`${btn} border border-slate-200 dark:border-slate-700`}
                  >
                    Duplicate
                  </button>
                  <button type="button" onClick={() => set({ posts: draft.posts.filter((x: any) => x.id !== p.id) })} className={`${btn} text-red-600 border border-red-200 dark:border-red-900`}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const id = newId();
            set({
              posts: [
                ...draft.posts,
                { id, title: 'New post', days: [1, 2, 3, 4, 5], start: '12:00', end: '13:00', until: '', groups: ['rg'], section: '', needs: '', paused: false, variants: [''] },
              ],
            });
            setOpenPost(id);
          }}
          className={`${btn} border border-slate-200 dark:border-slate-700`}
        >
          <Plus className="w-3 h-3" /> New post
        </button>
      </div>

      <div className="sticky bottom-3 flex items-center gap-2">
        <button type="button" disabled={!changed || saving} onClick={save} className={`${btn} px-4 py-2.5 text-sm ${changed ? 'bg-[#0e9f55] text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
          {saving ? 'Saving...' : changed ? 'Save changes' : 'All saved'}
        </button>
        {msg && <span className={`text-xs ${msg === 'Saved' ? 'text-[#0e9f55]' : 'text-red-600'}`}>{msg}</span>}
      </div>
    </div>
  );
};
