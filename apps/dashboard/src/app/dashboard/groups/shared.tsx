/** Shapes returned by /v1/dashboard/groups and helpers shared by the list and detail pages. */
export interface GroupSummary {
  key: string;
  name: string;
  traits: Record<string, string | number | boolean>;
  members: number;
  activeMembers: number;
  events: number;
  firstSeen: string;
  lastSeen: string;
  lastActiveAt: string | null;
}

export const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' }
];

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function groupHref(key: string, params: { days?: string; projectId?: string }) {
  const query = new URLSearchParams();
  if (params.days) query.set('days', params.days);
  if (params.projectId) query.set('projectId', params.projectId);
  const suffix = query.toString();
  return `/dashboard/groups/${encodeURIComponent(key)}${suffix ? `?${suffix}` : ''}`;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function TraitChips({ traits, skip = [] }: { traits: Record<string, unknown>; skip?: string[] }) {
  const entries = Object.entries(traits).filter(([key, value]) => !skip.includes(key) && value !== null && typeof value !== 'object');
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="max-w-full truncate rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 font-mono text-[11px] text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          {key}: {String(value)}
        </span>
      ))}
    </div>
  );
}
