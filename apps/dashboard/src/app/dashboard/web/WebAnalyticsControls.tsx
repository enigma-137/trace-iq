'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import { DashCard, cardShell, inputSm, primaryButtonSm, secondaryButtonSm } from '@/components/dashboard/DashCard';

type Filter = { field: string; operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set'; value?: string };
type Goal = { id: string; name: string; type: 'page' | 'event'; target: string; conversions: number; occurrences: number; conversionRate: number };
type Realtime = { windowMinutes: number; visitors: number; pageviews: number; topPaths: Array<{ path: string; visitors: number }> };

const fields = ['path', 'referrer', 'browser', 'os', 'device_type', 'country', 'utm_source', 'utm_medium', 'utm_campaign'];
const operators: Array<{ value: Filter['operator']; label: string }> = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' }
];
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Live visitor count plus the filter builder, in one slim bar. */
export function WebFilterBar({ token, projectId, days, initialFilters }: {
  token: string; projectId?: string; days: string; initialFilters: Filter[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [presets, setPresets] = useState<Record<string, Filter[]>>({});
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const encodedFilters = useMemo(() => JSON.stringify(initialFilters), [initialFilters]);
  const dirty = JSON.stringify(filters) !== encodedFilters;

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
  }, [encodedFilters, projectId, token]);

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
    try { localStorage.setItem('traceiq.webFilterPresets', JSON.stringify(next)); } catch { /* storage unavailable */ }
    setPresets(next);
  };

  const update = (index: number, patch: Partial<Filter>) => setFilters(filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <section className={`${cardShell} px-4 py-3`} aria-label="Filters and live visitors">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2 text-sm" title="Unique visitors in the last 5 minutes">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">{realtime?.visitors ?? '—'}</span>
          <span className="text-neutral-500 dark:text-slate-400">online now</span>
          <span className="hidden text-neutral-400 sm:inline dark:text-slate-500">· {realtime?.pageviews ?? 0} views in 5 min</span>
        </div>

        <span className="hidden h-5 w-px bg-neutral-200 sm:block dark:bg-slate-800" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {filters.length === 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400">
              <HugeiconsIcon icon={FilterHorizontalIcon} size={14} strokeWidth={1.8} />
              No filters
            </span>
          ) : null}
          {filters.map((filter, index) => (
            <div key={index} className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 pl-1 dark:border-slate-800 dark:bg-slate-950">
              <select aria-label="Field" value={filter.field} onChange={(e) => update(index, { field: e.target.value })} className={`${inputSm} h-7 border-0 bg-transparent shadow-none`}>
                {fields.map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
              <select aria-label="Operator" value={filter.operator} onChange={(e) => update(index, { operator: e.target.value as Filter['operator'] })} className={`${inputSm} h-7 border-0 bg-transparent shadow-none`}>
                {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              {!filter.operator.endsWith('_set') ? (
                <input aria-label="Value" value={filter.value ?? ''} onChange={(e) => update(index, { value: e.target.value })} className={`${inputSm} h-7 w-32`} placeholder="value" />
              ) : null}
              <button type="button" onClick={() => setFilters(filters.filter((_, i) => i !== index))} className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400" aria-label="Remove filter">
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setFilters([...filters, { field: 'path', operator: 'is', value: '' }])} className={secondaryButtonSm}>
            <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.8} />
            Filter
          </button>
          {Object.entries(presets).map(([presetName, preset]) => (
            <button key={presetName} type="button" onClick={() => { setFilters(preset); navigate(preset); }} className="h-7 rounded-full border border-neutral-200 px-2.5 text-xs text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white">
              {presetName}
            </button>
          ))}
        </div>

        {filters.length > 0 || initialFilters.length > 0 ? (
          <div className="flex items-center gap-2">
            {filters.length > 0 ? <button type="button" onClick={savePreset} className={secondaryButtonSm}>Save preset</button> : null}
            <button type="button" onClick={() => { setFilters([]); navigate([]); }} className={secondaryButtonSm}>Clear</button>
            <button type="button" onClick={() => navigate(filters)} disabled={!dirty} className={primaryButtonSm}>Apply</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function WebGoals({ token, projectId, goals }: { token: string; projectId?: string; goals: Goal[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<'page' | 'event'>('page');
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');

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

  return (
    <DashCard title="Conversion goals" description="Count visits to an exact page path or occurrences of an event." padded={false}>
      <form onSubmit={createGoal} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3 dark:border-slate-800">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" aria-label="Goal name" className={`${inputSm} w-40`} />
        <select value={goalType} onChange={(e) => setGoalType(e.target.value as 'page' | 'event')} aria-label="Goal type" className={inputSm}>
          <option value="page">Page path</option>
          <option value="event">Event</option>
        </select>
        <input required value={target} onChange={(e) => setTarget(e.target.value)} placeholder={goalType === 'page' ? '/checkout/success' : 'purchase'} aria-label="Goal target" className={`${inputSm} w-48 font-mono`} />
        <button type="submit" className={primaryButtonSm}>Add goal</button>
        {message ? <p className="text-xs text-red-600 dark:text-red-400">{message}</p> : null}
      </form>
      {goals.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-slate-500">No goals yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
          {goals.map((goal) => (
            <li key={goal.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{goal.name}</p>
                <p className="truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{goal.type}: {goal.target}</p>
              </div>
              <p className="text-right text-sm tabular-nums text-neutral-900 dark:text-white">
                {goal.conversions.toLocaleString()}
                <span className="ml-1.5 text-xs text-neutral-500 dark:text-slate-400">{(goal.conversionRate * 100).toFixed(1)}%</span>
              </p>
              <button type="button" onClick={() => deleteGoal(goal.id)} className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400" aria-label={`Delete goal ${goal.name}`}>
                <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}
