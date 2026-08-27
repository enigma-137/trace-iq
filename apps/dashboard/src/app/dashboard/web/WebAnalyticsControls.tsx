'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Filter = { field: string; operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set'; value?: string };
type Goal = { id: string; name: string; type: 'page' | 'event'; target: string; conversions: number; occurrences: number; conversionRate: number };
type Realtime = { windowMinutes: number; visitors: number; pageviews: number; topPaths: Array<{ path: string; visitors: number }> };

const fields = ['path', 'referrer', 'browser', 'os', 'device_type', 'country', 'utm_source', 'utm_medium', 'utm_campaign'];

export function WebAnalyticsControls({ token, projectId, days, initialFilters, goals }: {
  token: string; projectId?: string; days: string; initialFilters: Filter[]; goals: Goal[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [presets, setPresets] = useState<Record<string, Filter[]>>({});
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<'page' | 'event'>('page');
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const encodedFilters = useMemo(() => JSON.stringify(initialFilters), [initialFilters]);

  useEffect(() => {
    try { setPresets(JSON.parse(localStorage.getItem('traceiq.webFilterPresets') ?? '{}')); } catch { setPresets({}); }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const query = new URLSearchParams({ filters: encodedFilters });
      if (projectId) query.set('projectId', projectId);
      try {
        const response = await fetch(`${api}/v1/dashboard/web/realtime?${query}`, { headers: { Authorization: `Bearer ${token}` } });
        if (active && response.ok) setRealtime(await response.json());
      } catch { /* Main dashboard still remains usable if polling is unavailable. */ }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, encodedFilters, projectId, token]);

  const navigate = (next: Filter[]) => {
    const query = new URLSearchParams({ days });
    if (projectId) query.set('projectId', projectId);
    if (next.length) query.set('filters', JSON.stringify(next));
    router.push(`/dashboard/web?${query}`);
  };

  const savePreset = () => {
    const presetName = window.prompt('Name this filter preset:')?.trim();
    if (!presetName || filters.length === 0) return;
    const next = { ...presets, [presetName]: filters };
    localStorage.setItem('traceiq.webFilterPresets', JSON.stringify(next));
    setPresets(next);
  };

  const createGoal = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    const response = await fetch(`${api}/v1/dashboard/web/goals`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name, type: goalType, target })
    });
    if (!response.ok) { setMessage('Could not save goal.'); return; }
    setName(''); setTarget(''); router.refresh();
  };

  const deleteGoal = async (id: string) => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const response = await fetch(`${api}/v1/dashboard/web/goals/${encodeURIComponent(id)}${query}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) router.refresh();
  };

  return <>
    <section className="mb-5 grid gap-3 lg:grid-cols-[260px_1fr]">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Live · last 5 minutes</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{realtime?.visitors ?? '—'}</p>
        <p className="text-sm text-neutral-500">active visitors · {realtime?.pageviews ?? 0} page views</p>
      </div>
      <div className="rounded-md border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter, index) => <div key={index} className="flex gap-1">
            <select value={filter.field} onChange={(e) => setFilters(filters.map((f, i) => i === index ? { ...f, field: e.target.value } : f))} className="rounded border bg-transparent px-2 py-1 text-sm">{fields.map((field) => <option key={field}>{field}</option>)}</select>
            <select value={filter.operator} onChange={(e) => setFilters(filters.map((f, i) => i === index ? { ...f, operator: e.target.value as Filter['operator'] } : f))} className="rounded border bg-transparent px-2 py-1 text-sm"><option value="is">is</option><option value="is_not">is not</option><option value="contains">contains</option><option value="is_set">is set</option><option value="is_not_set">is not set</option></select>
            {!filter.operator.endsWith('_set') && <input value={filter.value ?? ''} onChange={(e) => setFilters(filters.map((f, i) => i === index ? { ...f, value: e.target.value } : f))} className="w-32 rounded border bg-transparent px-2 py-1 text-sm" placeholder="value" />}
            <button onClick={() => setFilters(filters.filter((_, i) => i !== index))} className="px-2 text-red-500" aria-label="Remove filter">×</button>
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={() => setFilters([...filters, { field: 'path', operator: 'is', value: '' }])} className="rounded border px-3 py-1.5">+ Filter</button>
          <button onClick={() => navigate(filters)} className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-white dark:text-black">Apply</button>
          <button onClick={() => { setFilters([]); navigate([]); }} className="rounded border px-3 py-1.5">Clear</button>
          <button onClick={savePreset} className="rounded border px-3 py-1.5">Save preset</button>
          {Object.entries(presets).map(([presetName, preset]) => <button key={presetName} onClick={() => { setFilters(preset); navigate(preset); }} className="rounded border border-blue-300 px-3 py-1.5 text-blue-700 dark:text-blue-300">{presetName}</button>)}
        </div>
      </div>
    </section>

    <section className="mb-5 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Conversion goals</p><p className="mt-1 text-sm text-neutral-500">Exact page paths or event names.</p></div>
        <form onSubmit={createGoal} className="flex flex-wrap gap-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" className="rounded border bg-transparent px-3 py-2 text-sm" />
          <select value={goalType} onChange={(e) => setGoalType(e.target.value as 'page' | 'event')} className="rounded border bg-transparent px-3 py-2 text-sm"><option value="page">Page path</option><option value="event">Event</option></select>
          <input required value={target} onChange={(e) => setTarget(e.target.value)} placeholder={goalType === 'page' ? '/checkout/success' : 'purchase'} className="rounded border bg-transparent px-3 py-2 text-sm" />
          <button className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Add goal</button>
        </form>
      </div>
      {message && <p className="mt-2 text-sm text-red-500">{message}</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{goals.map((goal) => <div key={goal.id} className="rounded border border-neutral-200 p-3 dark:border-slate-700"><div className="flex justify-between"><p className="font-semibold">{goal.name}</p><button onClick={() => deleteGoal(goal.id)} className="text-sm text-red-500">Delete</button></div><p className="mt-1 truncate font-mono text-xs text-neutral-500">{goal.type}: {goal.target}</p><p className="mt-3 text-xl font-semibold">{goal.conversions.toLocaleString()} <span className="text-xs font-normal text-neutral-500">conversions · {(goal.conversionRate * 100).toFixed(1)}%</span></p></div>)}</div>
      {goals.length === 0 && <p className="mt-4 text-sm text-neutral-500">No goals configured yet.</p>}
    </section>
  </>;
}
