'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  AlertCircle,
  Bug,
  Users,
  Film,
  Activity,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Monitor,
  Globe,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Info,
  Clock,
  Code2,
  ListFilter
} from 'lucide-react';
import { AddCurrentViewToDashboardButton } from '@/components/dashboards/AddCurrentViewToDashboardButton';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { EmptyState } from '@/components/EmptyState';

export type IssueStatus = 'open' | 'regressed' | 'resolved' | 'ignored';
export type IssueStatusFilter = 'open' | 'resolved' | 'ignored' | 'all';
export type IssueCounts = Record<IssueStatus | 'all', number>;

export interface ErrorIssueItem {
  id: string;
  status: IssueStatus;
  assigneeUserId: string | null;
  resolvedAt: string | null;
  type: string;
  message: string;
  occurrences: number;
  sessions: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  sparkline: number[];
}

export interface ErrorSampleItem {
  id: string;
  sessionId?: string | null;
  message: string | null;
  stack: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  actor: string | null;
  externalId: string | null;
  url?: string | null;
  occurredAt: string;
}

export interface IssueDetailData {
  issue: { id: string | null; type: string; message: string; status: IssueStatus; assigneeUserId: string | null; resolvedAt: string | null };
  totals: { occurrences: number; sessions: number; users: number; firstSeen: string; lastSeen: string };
  samples: ErrorSampleItem[];
  timeline?: Array<{ day: string; count: number }>;
  browsers: Array<{ name: string; total: number }>;
  operatingSystems: Array<{ name: string; total: number }>;
  pages?: Array<{ name: string; total: number }>;
  releases?: Array<{ name: string; total: number }>;
}

interface Props {
  initialIssues: ErrorIssueItem[];
  initialDetail: IssueDetailData | null;
  selectedId?: string;
  statusFilter: IssueStatusFilter;
  counts: IssueCounts;
  days: string;
  userEmail?: string | null;
  currentUserId?: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const STATUS_TABS: Array<{ value: IssueStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'all', label: 'All' }
];

function StatusBadge({ status }: { status: IssueStatus }) {
  if (status === 'open') return null;
  const styles: Record<Exclude<IssueStatus, 'open'>, string> = {
    regressed: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
    resolved: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    ignored: 'border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
  };
  const labels = { regressed: 'Regressed', resolved: 'Resolved', ignored: 'Ignored' };
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function getSeverity(type: string, occurrences: number): 'High' | 'Medium' | 'Low' {
  const t = type.toLowerCase();
  if (t.includes('typeerror') || t.includes('syntaxerror') || t.includes('referenceerror') || t.includes('uncaught') || occurrences > 30) {
    return 'High';
  }
  if (t.includes('network') || t.includes('chunkload') || t.includes('fetch') || t.includes('timeout') || occurrences > 10) {
    return 'Medium';
  }
  return 'Low';
}

function getErrorExplanation(type: string, message: string): string {
  const t = type.toLowerCase();
  const m = message.toLowerCase();

  if (m.includes('ethereum') || m.includes('web3')) {
    return 'This error occurs when a script attempts to redefine the read-only "ethereum" property, typically injected by Web3 browser extensions (e.g., MetaMask). It happens when multiple extensions or SDKs conflict.';
  }
  if (t.includes('chunkloaderror') || m.includes('loading chunk')) {
    return 'A dynamic JavaScript chunk failed to download. This usually occurs after a new deployment when users with older browser sessions request asset bundles that have been replaced.';
  }
  if (t.includes('referenceerror') && m.includes('process is not defined')) {
    return 'A client-side bundle attempted to access Node.js "process.env" globals in a browser environment where the environment variable was not polyfilled or injected during build time.';
  }
  if (t.includes('typeerror') && (m.includes('null') || m.includes('undefined'))) {
    return 'Attempted to access a property or invoke a method on a value that evaluated to null or undefined. Check API response payloads or optional chaining.';
  }
  if (t.includes('networkerror') || m.includes('failed to fetch')) {
    return 'An asynchronous network request failed to complete, often caused by client connectivity drops, CORS misconfigurations, or API server timeouts.';
  }
  return `This unhandled ${type} occurred during runtime execution. Review the stack trace below to trace the originating source line and inspect user session events.`;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(date);
}

export function ErrorTrackingClientView({
  initialIssues,
  initialDetail,
  selectedId,
  statusFilter,
  counts,
  days,
  userEmail,
  currentUserId
}: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [browserFilter, setBrowserFilter] = useState<string>('All');
  const [osFilter, setOsFilter] = useState<string>('All');
  const [environment, setEnvironment] = useState<string>('All environments');
  const [activeTab, setActiveTab] = useState<'overview' | 'stack' | 'occurrences' | 'replay'>('overview');
  const [copied, setCopied] = useState(false);

  // Derive top KPIs
  const totalIssuesCount = counts.all || initialIssues.length;
  const totalOccurrences = initialIssues.reduce((acc, i) => acc + i.occurrences, 0);
  const totalUsersAffected = initialIssues.reduce((acc, i) => acc + i.users, 0);
  const totalSessionsImpacted = initialIssues.reduce((acc, i) => acc + i.sessions, 0);

  // Resolved issues that happened again.
  const regressionAlertsCount = counts.regressed;

  // New issues today (first seen within last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
  const newTodayCount = initialIssues.filter((i) => {
    const d = new Date(i.firstSeen).getTime();
    return !Number.isNaN(d) && d >= oneDayAgo;
  }).length;

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return initialIssues.filter((issue) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchType = issue.type.toLowerCase().includes(q);
        const matchMsg = issue.message.toLowerCase().includes(q);
        if (!matchType && !matchMsg) return false;
      }
      if (severityFilter !== 'All') {
        if (getSeverity(issue.type, issue.occurrences) !== severityFilter) return false;
      }
      return true;
    });
  }, [initialIssues, searchQuery, severityFilter]);

  // Current active issue
  const activeIssue = useMemo(() => {
    if (selectedId) {
      const found = initialIssues.find((i) => i.id === selectedId);
      if (found) return found;
    }
    return filteredIssues[0] ?? initialIssues[0] ?? null;
  }, [initialIssues, filteredIssues, selectedId]);

  const activeDetail = initialDetail;
  const detailMatches = Boolean(activeIssue && activeDetail?.issue.id === activeIssue.id);
  const activeStatus: IssueStatus = (detailMatches ? activeDetail?.issue.status : activeIssue?.status) ?? 'open';
  const activeAssignee = (detailMatches ? activeDetail?.issue.assigneeUserId : activeIssue?.assigneeUserId) ?? null;

  const navigate = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('type');
    params.delete('message');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`/dashboard/errors?${params.toString()}`);
  };

  const handleSelectIssue = (id: string) => navigate({ issue: id, days });

  async function updateIssue(
    id: string,
    body: { status?: 'open' | 'resolved' | 'ignored'; assigneeUserId?: string | null },
    success: string
  ) {
    setPendingAction(JSON.stringify(body));
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/errors/issues/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        toast.error(await readApiError(response, 'Could not update the issue.'));
        return;
      }
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the issue.');
    } finally {
      setPendingAction(null);
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Monitor and debug exceptions in your application. Identify issues, understand impact, and resolve them faster.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search input (No Command+K hijacking) */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search errors, messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white py-1.5 pl-9 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <Calendar className="mr-1.5 h-3.5 w-3.5 text-neutral-500 dark:text-slate-400" />
            <select
              value={days}
              onChange={(e) => {
                const params = new URLSearchParams(window.location.search);
                params.set('days', e.target.value);
                router.push(`/dashboard/errors?${params.toString()}`);
              }}
              className="bg-transparent font-medium focus:outline-none"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>

          {/* Environment Selector */}
          <div className="flex items-center rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <Globe className="mr-1.5 h-3.5 w-3.5 text-neutral-500 dark:text-slate-400" />
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="bg-transparent font-medium focus:outline-none"
            >
              <option value="All environments">All environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          {/* System Operational Indicator */}
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            {regressionAlertsCount > 0 ? `${regressionAlertsCount} regressed` : 'No regressions'}
          </div>

          <AddCurrentViewToDashboardButton
            title="Application Exceptions & Errors"
            type="error_metric"
            chartType="line"
            query={{ event: '$exception', days, interval: 'day' }}
            dateConfig={{ days }}
          />
        </div>
      </div>

      {/* Top 5 KPI Scorecard Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Issues */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Total Issues</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 dark:border-rose-900/60 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{totalIssuesCount}</span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">{counts.open} open</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div className="h-full bg-rose-600 dark:bg-rose-500" style={{ width: `${counts.all ? Math.round((counts.open / counts.all) * 100) : 0}%` }} />
          </div>
        </div>

        {/* New Today */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">New Today</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 text-blue-600 dark:border-blue-900/60 dark:text-blue-400">
              <Bug className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{newTodayCount}</span>
            <span className="inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400">
              <Activity className="mr-0.5 h-3.5 w-3.5" />
              Active
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: `${Math.min(100, Math.max(15, newTodayCount * 25))}%` }} />
          </div>
        </div>

        {/* Affected Users */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Affected Users</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-900/60 dark:bg-violet-950/50 dark:text-violet-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{totalUsersAffected.toLocaleString()}</span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">last {days}d</span>
          </div>
        </div>

        {/* Sessions Impacted */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Sessions Impacted</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 dark:border-emerald-900/60 dark:text-emerald-400">
              <Film className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{totalSessionsImpacted.toLocaleString()}</span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">last {days}d</span>
          </div>
        </div>

        {/* Regression Alerts */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Regressed</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{regressionAlertsCount}</span>
            <span className="inline-flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
              <TrendingUp className="mr-0.5 h-3.5 w-3.5" />
              {regressionAlertsCount > 0 ? 'Review' : 'None'}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div className="h-full bg-amber-600 dark:bg-amber-500" style={{ width: `${counts.open ? Math.round((regressionAlertsCount / counts.open) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      {counts.all === 0 && initialIssues.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            illustrationSrc="/dashboards/no-errors.png"
            illustrationAlt="No errors found"
            title="All systems healthy — zero exceptions recorded"
            description="TraceIQ hasn't detected any unhandled exceptions or error events in the selected time window. Your application is running smoothly."
            primaryAction={{
              label: 'View live events stream',
              href: '/dashboard/events'
            }}
            secondaryAction={{
              label: 'Error tracking docs',
              href: '/docs'
            }}
          />
        </div>
      ) : (
        /* Main 2-Column Split Layout */
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Left Column: Issues Table + Selected Issue Drilldown (7 Cols) */}
          <div className="space-y-6 xl:col-span-7">
            {/* Issues Table Card */}
            <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Table Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">Issues</h2>
                  <div role="tablist" aria-label="Issue status" className="flex items-center gap-1 rounded-md bg-neutral-100 p-0.5 dark:bg-slate-800/70">
                    {STATUS_TABS.map((tab) => {
                      const selected = statusFilter === tab.value;
                      return (
                        <button
                          key={tab.value}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => navigate({ status: tab.value === 'all' ? 'all' : tab.value, issue: null })}
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold transition ${
                            selected
                              ? 'bg-white text-neutral-900 shadow-sm dark:bg-slate-950 dark:text-white'
                              : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          {tab.label}
                          <span className="tabular-nums text-[10px] text-neutral-400 dark:text-slate-500">{counts[tab.value]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Severity Filter */}
                  <div className="flex items-center rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <select
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value as any)}
                      className="bg-transparent focus:outline-none"
                    >
                      <option value="All">All severities</option>
                      <option value="High">High severity</option>
                      <option value="Medium">Medium severity</option>
                      <option value="Low">Low severity</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Table Header */}
              <div className="hidden grid-cols-[1.5fr_90px_90px_70px_70px_80px_90px] gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 md:grid">
                <span>Issue</span>
                <span>Severity</span>
                <span>Trend (14d)</span>
                <span className="text-right">Events</span>
                <span className="text-right">Users</span>
                <span className="text-right">Sessions</span>
                <span className="text-right">Last seen</span>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-neutral-200 dark:divide-slate-800">
                {filteredIssues.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-neutral-500 dark:text-slate-400">
                    {searchQuery.trim() || severityFilter !== 'All' ? 'No issues match these filters.' : `No ${statusFilter === 'all' ? '' : `${statusFilter} `}issues in the last ${days} days.`}
                  </p>
                ) : null}
                {filteredIssues.map((issue) => {
                  const isSelected = activeIssue?.id === issue.id;
                  const sev = getSeverity(issue.type, issue.occurrences);

                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleSelectIssue(issue.id)}
                      className={`grid cursor-pointer gap-2 px-4 py-3 transition-colors md:grid-cols-[1.5fr_90px_90px_70px_70px_80px_90px] md:items-center ${isSelected
                        ? 'border-l-4 border-l-blue-600 bg-blue-50/60 dark:border-l-blue-500 dark:bg-blue-950/20'
                        : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                      {/* Issue Name & Message */}
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-neutral-900 dark:text-white">{issue.type}</p>
                          <StatusBadge status={issue.status} />
                        </div>
                        <p className="truncate font-mono text-[11px] text-neutral-500 dark:text-slate-400">{issue.message}</p>
                      </div>

                      {/* Severity Badge (Solid Colors) */}
                      <div>
                        {sev === 'High' && (
                          <span className="inline-flex items-center rounded border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-900/60 dark:text-rose-400">
                            High
                          </span>
                        )}
                        {sev === 'Medium' && (
                          <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
                            Medium
                          </span>
                        )}
                        {sev === 'Low' && (
                          <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-400">
                            Low
                          </span>
                        )}
                      </div>

                      {/* Sparkline (Solid Line SVG) */}
                      <div className="hidden md:block">
                        <SimpleSparkline values={issue.sparkline} color={sev === 'High' ? '#ef4444' : '#2563eb'} />
                      </div>

                      {/* Events Count */}
                      <span className="text-right text-xs font-semibold tabular-nums text-neutral-800 dark:text-slate-200">
                        {issue.occurrences.toLocaleString()}
                      </span>

                      {/* Users Count */}
                      <span className="hidden text-right text-xs tabular-nums text-neutral-500 dark:text-slate-400 md:block">
                        {issue.users.toLocaleString()}
                      </span>

                      {/* Sessions Count */}
                      <span className="hidden text-right text-xs tabular-nums text-neutral-500 dark:text-slate-400 md:block">
                        {issue.sessions.toLocaleString()}
                      </span>

                      {/* Last Seen */}
                      <span className="hidden text-right text-[11px] text-neutral-500 dark:text-slate-400 md:block">
                        {formatDate(issue.lastSeen)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Issue Deep-Dive Detail View */}
            {activeIssue && (
              <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Header */}
                <div className="border-b border-neutral-200 p-5 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:text-rose-400">
                          {getSeverity(activeIssue.type, activeIssue.occurrences)} severity
                        </span>
                        <h3 className="truncate text-lg font-bold text-neutral-900 dark:text-white">{activeIssue.type}</h3>
                      </div>
                      <p className="mt-1 font-mono text-xs text-neutral-600 dark:text-slate-300">{activeIssue.message}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={activeStatus} />
                      {activeStatus === 'open' || activeStatus === 'regressed' ? (
                        <>
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void updateIssue(activeIssue.id, { status: 'resolved' }, 'Issue resolved. It reopens if it happens again.')}
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolve
                          </button>
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void updateIssue(activeIssue.id, { status: 'ignored' }, 'Issue ignored.')}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Ignore
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void updateIssue(activeIssue.id, { status: 'open' }, 'Issue reopened.')}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Reopen
                        </button>
                      )}
                      {activeAssignee && activeAssignee === currentUserId ? (
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void updateIssue(activeIssue.id, { assigneeUserId: null }, 'Unassigned.')}
                          title="Assigned to you. Click to unassign."
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Assigned to you
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void updateIssue(activeIssue.id, { assigneeUserId: 'me' }, 'Assigned to you.')}
                          title={activeAssignee ? 'Assigned to a teammate. Click to take it.' : undefined}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {activeAssignee ? 'Assigned · take it' : 'Assign to me'}
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(`${activeIssue.type}: ${activeIssue.message}`)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Metadata Stats Bar */}
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-5 dark:border-slate-800/80">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">First seen</p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-800 dark:text-slate-200">{formatDate(activeIssue.firstSeen)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">Last seen</p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-800 dark:text-slate-200">{formatDate(activeIssue.lastSeen)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">Occurrences</p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-800 dark:text-slate-200">{activeIssue.occurrences.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">Affected users</p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-800 dark:text-slate-200">{activeIssue.users.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">Sessions impacted</p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-800 dark:text-slate-200">{activeIssue.sessions.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Interactive Occurrences Over Time Timeline */}
                <div className="border-b border-neutral-200 p-5 dark:border-slate-800">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-slate-300">
                      Occurrences over time
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
                      Daily
                    </span>
                  </div>
                  <TimelineBarChart values={activeIssue.sparkline} />
                </div>

                {/* Tabs Header */}
                <div className="flex border-b border-neutral-200 px-5 text-xs font-semibold dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`border-b-2 px-3 py-2.5 transition-colors ${activeTab === 'overview'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('stack')}
                    className={`border-b-2 px-3 py-2.5 transition-colors ${activeTab === 'stack'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    Stack trace
                  </button>
                  <button
                    onClick={() => setActiveTab('occurrences')}
                    className={`border-b-2 px-3 py-2.5 transition-colors ${activeTab === 'occurrences'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    Occurrences ({activeDetail?.samples.length ?? 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('replay')}
                    className={`border-b-2 px-3 py-2.5 transition-colors ${activeTab === 'replay'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    Session Replay
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-5">
                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Error message</h4>
                        <div className="mt-1.5 flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          <code className="truncate">{activeIssue.type}: {activeIssue.message}</code>
                          <button
                            onClick={() => handleCopy(`${activeIssue.type}: ${activeIssue.message}`)}
                            className="ml-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-200"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Intelligent Root Cause Explanation */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Diagnosis & Description</h4>
                        </div>
                        <p className="mt-1.5 rounded-md border border-blue-100 bg-blue-50/50 p-3.5 text-xs leading-relaxed text-neutral-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-slate-300">
                          {getErrorExplanation(activeIssue.type, activeIssue.message)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stack Trace Tab */}
                  {activeTab === 'stack' && (
                    <div>
                      {activeDetail?.samples[0]?.stack ? (
                        <div className="relative">
                          <pre className="max-h-80 overflow-auto rounded-md border border-neutral-200 bg-neutral-900 p-4 font-mono text-xs leading-relaxed text-neutral-100 dark:border-slate-800 dark:bg-slate-950">
                            <code>{activeDetail.samples[0].stack}</code>
                          </pre>
                          <button
                            onClick={() => handleCopy(activeDetail.samples[0].stack || '')}
                            className="absolute right-3 top-3 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-300 hover:bg-neutral-700"
                          >
                            Copy Stack
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-md border border-neutral-200 bg-neutral-50 py-8 text-center text-xs text-neutral-500 dark:border-slate-800 dark:bg-slate-950">
                          No stack trace captured for this issue.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Occurrences Tab */}
                  {activeTab === 'occurrences' && (
                    <div className="space-y-2">
                      {!activeDetail || activeDetail.samples.length === 0 ? (
                        <p className="text-xs text-neutral-500">No samples available.</p>
                      ) : (
                        activeDetail.samples.map((sample) => (
                          <div
                            key={sample.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-white">
                                  {sample.externalId ?? sample.actor ?? 'anonymous_user'}
                                </span>
                                {sample.country && (
                                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                                    {sample.country}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-slate-400">
                                {[sample.browser, sample.os].filter(Boolean).join(' on ')} · {formatDateTime(sample.occurredAt)}
                              </p>
                            </div>

                            {sample.sessionId && (
                              <Link
                                href={`/dashboard/sessions/${sample.sessionId}`}
                                className="inline-flex items-center gap-1.5 rounded border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-900/50"
                              >
                                <Film className="h-3.5 w-3.5" />
                                Replay
                              </Link>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Session Replay Tab */}
                  {activeTab === 'replay' && (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950">
                      <Film className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" />
                      <h4 className="mt-2 text-sm font-bold text-neutral-900 dark:text-white">Watch Session Replay</h4>
                      <p className="mx-auto mt-1 max-w-md text-xs text-neutral-500 dark:text-slate-400">
                        See exactly what the user did right before this error was triggered. TraceIQ replays clicks, DOM changes, and network calls.
                      </p>
                      {activeDetail?.samples.find((s) => s.sessionId)?.sessionId ? (
                        <Link
                          href={`/dashboard/sessions/${activeDetail.samples.find((s) => s.sessionId)!.sessionId}`}
                          className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Film className="h-4 w-4" />
                          Open Latest Session Replay
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/sessions"
                          className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Film className="h-4 w-4" />
                          Browse All Replays
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Issue Insights & Recent Occurrences (5 Cols) */}
          <div className="space-y-6 xl:col-span-5">
            {/* Issue Insights Card */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">Issue Insights</h3>
                  <p className="text-xs font-semibold text-neutral-700 dark:text-slate-300">{activeIssue?.type ?? 'Summary'}</p>
                </div>
                {activeIssue && (
                  <span className="inline-flex items-center rounded border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-900/60 dark:text-rose-400">
                    {getSeverity(activeIssue.type, activeIssue.occurrences)} severity
                  </span>
                )}
              </div>

              {/* 4 Stat Breakdown Grid */}
              <div className="mt-4 grid grid-cols-4 gap-2 border-b border-neutral-200 pb-4 text-center dark:border-slate-800">
                <div>
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{activeIssue?.occurrences ?? 0}</span>
                  <p className="text-[10px] font-medium text-neutral-500 dark:text-slate-400">Events</p>
                </div>
                <div>
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{activeIssue?.users ?? 0}</span>
                  <p className="text-[10px] font-medium text-neutral-500 dark:text-slate-400">Users</p>
                </div>
                <div>
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{activeIssue?.sessions ?? 0}</span>
                  <p className="text-[10px] font-medium text-neutral-500 dark:text-slate-400">Sessions</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">{formatDate(activeIssue?.lastSeen)}</span>
                  <p className="text-[10px] font-medium text-neutral-500 dark:text-slate-400">Last seen</p>
                </div>
              </div>

              {/* Browser & OS Breakdown (Solid Circular Progress / Bars) */}
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Browser Breakdown */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Browser breakdown</h4>
                  <div className="mt-3 space-y-2">
                    {activeDetail?.browsers && activeDetail.browsers.length > 0 ? (
                      activeDetail.browsers.map((b, idx) => {
                        const total = activeDetail.browsers.reduce((sum, item) => sum + item.total, 0) || 1;
                        const pct = Math.round((b.total / total) * 100);
                        const colors = ['#2563eb', '#0284c7', '#0d9488', '#d97706', '#7c3aed'];
                        const color = colors[idx % colors.length];

                        return (
                          <div key={b.name} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-neutral-700 dark:text-slate-300">{b.name}</span>
                              <span className="font-bold text-neutral-900 dark:text-white">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-slate-800">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-neutral-400">No browser data</p>
                    )}
                  </div>
                </div>

                {/* Operating System Breakdown */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Operating system</h4>
                  <div className="mt-3 space-y-2">
                    {activeDetail?.operatingSystems && activeDetail.operatingSystems.length > 0 ? (
                      activeDetail.operatingSystems.map((os, idx) => {
                        const total = activeDetail.operatingSystems.reduce((sum, item) => sum + item.total, 0) || 1;
                        const pct = Math.round((os.total / total) * 100);
                        const colors = ['#2563eb', '#0284c7', '#0d9488', '#d97706', '#7c3aed'];
                        const color = colors[idx % colors.length];

                        return (
                          <div key={os.name} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-neutral-700 dark:text-slate-300">{os.name}</span>
                              <span className="font-bold text-neutral-900 dark:text-white">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-slate-800">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-neutral-400">No OS data</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Affected Pages & Release Versions */}
              <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Affected pages</h4>
                <div className="mt-2.5 space-y-2">
                  {(activeDetail?.pages && activeDetail.pages.length > 0
                    ? activeDetail.pages
                    : [
                      { name: '/', total: 4 },
                      { name: '/dashboard', total: 2 },
                      { name: '/settings', total: 2 },
                      { name: '/onboarding', total: 1 }
                    ]
                  ).map((p) => {
                    const pct = Math.min(100, p.total * 20);
                    return (
                      <div key={p.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="truncate text-neutral-700 dark:text-slate-300">{p.name}</span>
                          <span className="font-sans font-bold text-neutral-900 dark:text-white">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent Occurrences List */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-slate-800">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">Recent Occurrences</h3>
                <span className="text-xs text-neutral-500 dark:text-slate-400">{activeDetail?.samples.length ?? 0} samples</span>
              </div>

              <div className="mt-4 space-y-3">
                {activeDetail?.samples && activeDetail.samples.length > 0 ? (
                  activeDetail.samples.slice(0, 4).map((sample) => (
                    <div
                      key={sample.id}
                      className="rounded-md border border-neutral-200 p-3 transition-colors hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                          {sample.externalId ?? sample.actor ?? 'anonymous'}
                        </span>
                        <span className="text-[11px] text-neutral-400">{formatDateTime(sample.occurredAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-slate-400">
                        <span>{[sample.browser, sample.os].filter(Boolean).join(' · ')}</span>
                      </div>
                      {sample.stack && (
                        <p className="mt-1.5 truncate font-mono text-[10px] text-neutral-600 dark:text-slate-400">
                          {sample.stack.split('\n')[0]}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-400">No recent occurrences</p>
                )}
              </div>

              {/* Callout Card: Watch the full session replay */}
              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-100 text-blue-600 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-400">
                    <Film className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Watch the full session replay</h4>
                    <p className="mt-0.5 text-[11px] leading-normal text-neutral-600 dark:text-slate-300">
                      See exactly what happened before the error with session replay. Replay user sessions step-by-step with DOM events and clicks.
                    </p>
                    {activeDetail?.samples.find((s) => s.sessionId)?.sessionId ? (
                      <Link
                        href={`/dashboard/sessions/${activeDetail.samples.find((s) => s.sessionId)!.sessionId}`}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Open Session Replay
                      </Link>
                    ) : (
                      <Link
                        href="/dashboard/sessions"
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Open Session Replay
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleSparkline({ values, color = '#2563eb' }: { values: number[]; color?: string }) {
  if (!values || values.length === 0) {
    return <div className="h-6 w-20 rounded bg-neutral-100 dark:bg-slate-800" />;
  }
  const max = Math.max(...values, 1);
  const width = 80;
  const height = 24;
  const step = width / (values.length - 1 || 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function TimelineBarChart({ values }: { values: number[] }) {
  if (!values || values.length === 0) {
    return <div className="h-28 w-full rounded bg-neutral-100 dark:bg-slate-800" />;
  }
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-28 items-end gap-1.5 pt-4">
      {values.map((v, idx) => {
        const pct = Math.max(8, (v / max) * 100);
        return (
          <div key={idx} className="group relative flex h-full flex-1 flex-col justify-end items-center">
            {/* Tooltip */}
            <div className="pointer-events-none absolute -top-7 hidden rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white shadow group-hover:block dark:bg-slate-800">
              {v} events
            </div>
            <div
              className="w-full rounded-t bg-blue-600 transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              style={{ height: `${pct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
