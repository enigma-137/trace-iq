'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { PageBanner } from '@/components/PageBanner';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface FlagTarget {
  property: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'exists' | 'not_exists' | 'in';
  value: string | number | boolean | Array<string | number>;
}

export interface FlagTargetGroup {
  id?: string;
  name?: string;
  rules: FlagTarget[];
}

export interface FlagItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  environment: 'development' | 'staging' | 'production';
  flagType: 'boolean' | 'remote_config' | 'multivariate';
  overrides: Record<string, boolean>;
  targeting: FlagTarget[];
  targetingGroups: FlagTargetGroup[];
  payload: unknown;
  revision: number;
  archivedAt: string | null;
  recentExposures24h: number;
  totalExposures: number;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlagSummaryMetrics {
  total: number;
  active: number;
  rollingOut: number;
  withRecentExposure: number;
  disabled: number;
}

const inputClass =
  'h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 transition placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-400';

export function FlagManager({
  flags = [],
  metrics,
  projectId
}: {
  flags: FlagItem[];
  metrics?: FlagSummaryMetrics;
  projectId?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [selectedEnv, setSelectedEnv] = useState<'all' | 'production' | 'staging' | 'development'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'rolling_out' | 'disabled' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createEnv, setCreateEnv] = useState<'production' | 'staging' | 'development'>('production');
  const [createType, setCreateType] = useState<'boolean' | 'remote_config'>('boolean');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Kill Switch Confirm Modal state
  const [killSwitchFlag, setKillSwitchFlag] = useState<FlagItem | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      toast.error('Session expired. Please sign in again.');
      return null;
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  }

  function handleNameChange(val: string) {
    setCreateName(val);
    if (!createKey || createKey === slugify(createName)) {
      setCreateKey(slugify(val));
    }
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const key = createKey.trim();
    if (!key) {
      setCreateError('Flag key is required (e.g. nuwell-new-add-meal).');
      return;
    }

    setIsCreating(true);
    const res = await authFetch('/v1/dashboard/flags', {
      method: 'POST',
      body: JSON.stringify({
        key,
        name: createName.trim() || key,
        description: createDescription.trim() || undefined,
        environment: createEnv,
        flagType: createType,
        enabled: false,
        rolloutPercentage: 0,
        projectId
      })
    });

    setIsCreating(false);

    if (!res) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setCreateError(err.message || 'Failed to create feature flag.');
      return;
    }

    const data = await res.json();
    toast.success(`Flag "${key}" created.`);
    setIsCreateOpen(false);
    setCreateKey('');
    setCreateName('');
    setCreateDescription('');
    router.push(`/dashboard/flags/${data.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
    router.refresh();
  }

  async function handleConfirmKillSwitch() {
    if (!killSwitchFlag) return;
    setIsToggling(true);
    const nextState = !killSwitchFlag.enabled;

    const res = await authFetch(`/v1/dashboard/flags/${killSwitchFlag.id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled: nextState, projectId })
    });
    setIsToggling(false);
    setKillSwitchFlag(null);

    if (!res || !res.ok) {
      toast.error('Failed to change flag state.');
      return;
    }

    toast.success(`Flag ${killSwitchFlag.key} is now ${nextState ? 'active' : 'disabled'}.`);
    router.refresh();
  }

  // Filter flags
  const filteredFlags = useMemo(() => {
    return flags.filter((f) => {
      // Env filter
      if (selectedEnv !== 'all' && f.environment !== selectedEnv) {
        return false;
      }
      // Status filter
      if (statusFilter === 'active' && (!f.enabled || f.archivedAt)) return false;
      if (statusFilter === 'rolling_out' && (!f.enabled || f.rolloutPercentage <= 0 || f.rolloutPercentage >= 100 || f.archivedAt)) return false;
      if (statusFilter === 'disabled' && (f.enabled || f.archivedAt)) return false;
      if (statusFilter === 'archived' && !f.archivedAt) return false;
      if (statusFilter !== 'archived' && f.archivedAt) return false;

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesKey = f.key.toLowerCase().includes(q);
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesDesc = (f.description ?? '').toLowerCase().includes(q);
        if (!matchesKey && !matchesName && !matchesDesc) return false;
      }

      return true;
    });
  }, [flags, selectedEnv, statusFilter, searchQuery]);

  // Derived metrics
  const activeMetrics = useMemo(() => {
    if (metrics) return metrics;
    const nonArchived = flags.filter((f) => !f.archivedAt);
    return {
      total: nonArchived.length,
      active: nonArchived.filter((f) => f.enabled).length,
      rollingOut: nonArchived.filter((f) => f.enabled && f.rolloutPercentage > 0 && f.rolloutPercentage < 100).length,
      withRecentExposure: nonArchived.filter((f) => f.recentExposures24h > 0).length,
      disabled: nonArchived.filter((f) => !f.enabled).length
    };
  }, [flags, metrics]);

  return (
    <div className="space-y-6">
      {/* Top Header Controls & Metrics */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Feature Flags</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Control releases, target users, configure features remotely, and monitor what happens after exposure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/docs?page=flags"
            className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Documentation
          </Link>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create flag
          </button>
        </div>
      </div>

      {/* Reusable Feature Release Banner */}
      <PageBanner
        dismissId="flags_release_banner_v1"
        badge="Progressive Delivery"
        title="Safe Rollouts & Feature Releases"
        description="Ship code behind targeted feature flags, rollout gradually by percentage or user segment, and observe real-time error and conversion telemetry."
        illustrationSrc="/dashboards/banner-feature-release.png"
        illustrationAlt="Feature Release Banner Artwork"
        primaryAction={{
          label: 'Create flag',
          onClick: () => setIsCreateOpen(true)
        }}
        secondaryAction={{
          label: 'Flag documentation',
          href: '/docs?page=flags'
        }}
      />

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard label="Total flags" value={activeMetrics.total} />
        <MetricCard label="Active flags" value={activeMetrics.active} accent="emerald" />
        <MetricCard label="Rolling out" value={activeMetrics.rollingOut} accent="indigo" />
        <MetricCard label="Recent exposure" value={activeMetrics.withRecentExposure} accent="cyan" />
        <MetricCard label="Disabled" value={activeMetrics.disabled} accent="slate" />
      </div>

      {/* Filters & Environment Selector */}
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Environment Tabs */}
          <div className="inline-flex rounded-md bg-neutral-100 p-0.5 dark:bg-slate-900">
            {(['all', 'production', 'staging', 'development'] as const).map((env) => (
              <button
                key={env}
                onClick={() => setSelectedEnv(env)}
                className={`rounded px-2.5 py-1 text-xs font-semibold capitalize transition ${
                  selectedEnv === env
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {env === 'all' ? 'All Environments' : env}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-800 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All States</option>
            <option value="active">Active</option>
            <option value="rolling_out">Rolling Out (1-99%)</option>
            <option value="disabled">Disabled</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <input
            type="text"
            placeholder="Search flags by name or key…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
          />
          <svg
            className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      {/* Flags List Table / Cards */}
      {filteredFlags.length === 0 ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <EmptyState
            illustrationSrc="/dashboards/banner-feature-release.png"
            illustrationAlt="No feature flags"
            title={
              searchQuery || statusFilter !== 'all' || selectedEnv !== 'all'
                ? 'No matching feature flags found'
                : 'You haven’t created any feature flags yet'
            }
            description={
              searchQuery || statusFilter !== 'all' || selectedEnv !== 'all'
                ? 'Try adjusting your filters or search term to locate the flag.'
                : 'Ship code safely behind a flag, test with real users, roll out deterministically, and observe conversion and error signals.'
            }
            primaryAction={{
              label: '+ Create your first flag',
              onClick: () => setIsCreateOpen(true)
            }}
            secondaryAction={{
              label: 'Read docs',
              href: '/docs?page=flags'
            }}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            {filteredFlags.map((flag) => (
              <FlagListRow
                key={flag.id}
                flag={flag}
                projectId={projectId}
                onKillSwitch={() => setKillSwitchFlag(flag)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fast Create Flag Modal */}
      <DashboardDialog
        open={isCreateOpen}
        title="Create Feature Flag"
        description="Ship code behind a flag, target a segment, and roll out safely."
        onClose={() => setIsCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => void handleCreate(e as unknown as FormEvent)}
              disabled={isCreating}
              className="h-9 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isCreating ? 'Creating…' : 'Create flag'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              placeholder="e.g. New Add Meal Flow"
              value={createName}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
              Key <span className="text-red-500">*</span>
            </label>
            <input
              className={`${inputClass} font-mono text-xs`}
              placeholder="e.g. nuwell-new-add-meal"
              value={createKey}
              onChange={(e) => setCreateKey(e.target.value)}
              required
            />
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">
              Unique identifier used in your application code.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
              Description (optional)
            </label>
            <input
              className={inputClass}
              placeholder="e.g. Redesigned quick meal logging with voice and scanner"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Environment
              </label>
              <select
                value={createEnv}
                onChange={(e) => setCreateEnv(e.target.value as typeof createEnv)}
                className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Flag Type
              </label>
              <select
                value={createType}
                onChange={(e) => setCreateType(e.target.value as typeof createType)}
                className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              >
                <option value="boolean">Boolean (On / Off)</option>
                <option value="remote_config">Remote Config (JSON)</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <strong>Default state:</strong> Created flags start <strong>Disabled (0% rollout)</strong> so nothing ships to users until you configure and activate it.
          </div>

          {createError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {createError}
            </p>
          ) : null}
        </form>
      </DashboardDialog>

      {/* Safe Kill Switch Modal */}
      <DashboardDialog
        open={Boolean(killSwitchFlag)}
        title={killSwitchFlag?.enabled ? 'Disable Feature Flag' : 'Enable Feature Flag'}
        description={
          killSwitchFlag?.enabled
            ? `Disabling "${killSwitchFlag.key}" will immediately return fallback/off values to all applications. Rollout configuration, targeting rules, remote config, and history will be safely preserved.`
            : `Enabling "${killSwitchFlag?.key ?? ''}" will activate evaluation according to its ${killSwitchFlag?.rolloutPercentage ?? 0}% rollout and targeting rules.`
        }
        onClose={() => setKillSwitchFlag(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setKillSwitchFlag(null)}
              className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmKillSwitch()}
              disabled={isToggling}
              className={`h-9 rounded-md px-4 text-xs font-bold text-white transition disabled:opacity-50 ${
                killSwitchFlag?.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isToggling ? 'Updating…' : killSwitchFlag?.enabled ? 'Confirm disable' : 'Enable flag'}
            </button>
          </>
        }
      />
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const accentClasses: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    slate: 'text-neutral-600 dark:text-slate-400'
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">
        {label}
      </p>
      <p className={`mt-1 font-mono text-xl font-bold ${accent ? accentClasses[accent] : 'text-neutral-900 dark:text-white'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function FlagListRow({
  flag,
  projectId,
  onKillSwitch
}: {
  flag: FlagItem;
  projectId?: string;
  onKillSwitch: () => void;
}) {
  const detailsHref = `/dashboard/flags/${flag.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;

  // Human state description
  const statusBadge = getStatusBadge(flag);
  const targetingDesc = formatTargetingSummary(flag);

  return (
    <div className="flex flex-col gap-3 p-4 transition hover:bg-neutral-50/60 dark:hover:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
      {/* Flag Info */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={detailsHref}
            className="text-sm font-bold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
          >
            {flag.name}
          </Link>
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
            {flag.key}
          </code>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          <span className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {flag.environment}
          </span>
          {flag.flagType === 'remote_config' ? (
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
              Remote config
            </span>
          ) : null}
        </div>

        {flag.description ? (
          <p className="text-xs text-neutral-500 dark:text-slate-400 line-clamp-1">{flag.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-neutral-400 dark:text-slate-500">
          <span>Targeting: <strong className="text-neutral-700 dark:text-slate-300 font-medium">{targetingDesc}</strong></span>
          <span>Exposures (24h): <strong className="text-neutral-700 dark:text-slate-300 font-mono">{flag.recentExposures24h.toLocaleString()}</strong></span>
          <span>Total: <strong className="text-neutral-700 dark:text-slate-300 font-mono">{flag.totalExposures.toLocaleString()}</strong></span>
          <span>Rev: <strong className="text-neutral-700 dark:text-slate-300 font-mono">r{flag.revision}</strong></span>
        </div>
      </div>

      {/* Quick Rollout indicator & Actions */}
      <div className="flex items-center gap-3 sm:shrink-0">
        {/* Rollout Progress Mini Bar */}
        <div className="w-24 space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-neutral-500 dark:text-slate-400">
            <span>Rollout</span>
            <span>{flag.enabled ? `${flag.rolloutPercentage}%` : 'Off'}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                flag.enabled ? (flag.rolloutPercentage === 100 ? 'bg-emerald-500' : 'bg-indigo-500') : 'bg-neutral-300 dark:bg-slate-700'
              }`}
              style={{ width: `${flag.enabled ? flag.rolloutPercentage : 0}%` }}
            />
          </div>
        </div>

        {/* Kill switch Toggle Button */}
        <button
          onClick={onKillSwitch}
          className={`h-8 rounded-md px-2.5 text-xs font-semibold transition ${
            flag.enabled
              ? 'border border-neutral-300 bg-white text-neutral-800 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-300'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-400'
          }`}
          title={flag.enabled ? 'Disable flag immediately' : 'Enable flag'}
        >
          {flag.enabled ? 'Disable' : 'Enable'}
        </button>

        {/* View Details CTA */}
        <Link
          href={detailsHref}
          className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Configure →
        </Link>
      </div>
    </div>
  );
}

function getStatusBadge(flag: FlagItem): { label: string; className: string } {
  if (flag.archivedAt) {
    return { label: 'Archived', className: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400' };
  }
  if (!flag.enabled) {
    return { label: 'Disabled', className: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400' };
  }
  if (flag.totalExposures === 0 && flag.rolloutPercentage === 0) {
    return { label: 'Draft / Never evaluated', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' };
  }
  if (flag.rolloutPercentage === 0) {
    return { label: 'Enabled · 0% rollout', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' };
  }

  const hasTargeting = (flag.targetingGroups && flag.targetingGroups.length > 0) || (flag.targeting && flag.targeting.length > 0);
  if (flag.rolloutPercentage === 100) {
    return hasTargeting
      ? { label: 'Enabled · Targeted only', className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300' }
      : { label: 'Enabled · All users', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' };
  }

  return hasTargeting
    ? { label: `Enabled · Targeted · ${flag.rolloutPercentage}%`, className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' }
    : { label: `Enabled · ${flag.rolloutPercentage}% rollout`, className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' };
}

function formatTargetingSummary(flag: FlagItem): string {
  const groups = flag.targetingGroups && flag.targetingGroups.length > 0
    ? flag.targetingGroups
    : flag.targeting && flag.targeting.length > 0
      ? [{ name: 'Default', rules: flag.targeting }]
      : [];

  if (groups.length === 0) return 'All users';
  if (groups.length === 1) {
    const rules = groups[0].rules;
    if (rules.length === 0) return 'All users';
    return rules.map((r) => `${r.property} ${r.operator} ${r.value}`).join(' AND ');
  }
  return `${groups.length} targeting groups (OR)`;
}
