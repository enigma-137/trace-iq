'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientFetch } from '@/lib/analytics-api';
import {
  Users,
  UserCheck,
  UserPlus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Download,
  Calendar,
  Settings,
  MoreVertical,
  Activity,
  Layers,
  Film,
  Globe,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  Copy,
  Check,
  CheckCircle2,
  MousePointer,
  Eye,
  KeyRound,
  Sparkles,
  ArrowUpRight,
  Tag
} from 'lucide-react';

export interface PersonItem {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  distinctId: string;
  displayName: string;
  emailMasked: string | null;
  email: string | null;
  traits: Record<string, unknown>;
  traitsPreview?: Record<string, string | number | boolean>;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastOs?: string | null;
  lastDeviceType?: string | null;
  lastBrowser?: string | null;
  lastCountry?: string | null;
  lastCity?: string | null;
}

export interface UserStats {
  totalUsers: number;
  activeUsers14d: number;
  newUsers14d: number;
  returningUsers: number;
}

export interface UserTimelineEvent {
  id: string;
  eventName: string;
  properties: Record<string, unknown>;
  sessionId: string | null;
  occurredAt: string;
}

interface Props {
  initialPersons: PersonItem[];
  totalCount: number;
  stats: UserStats;
  limit: number;
  offset: number;
  searchParam: string;
  /** Active tab; filtered server-side across every user (?segment=). */
  segment: 'all' | 'new' | 'returning' | 'inactive';
  userEmail?: string | null;
  projectId?: string | null;
}

const AVATAR_COLORS = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-violet-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-cyan-600 text-white',
  'bg-indigo-600 text-white'
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getUserStatus(lastSeenAt: string): 'Active' | 'Idle' | 'Inactive' {
  if (!lastSeenAt) return 'Inactive';
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return 'Inactive';
  const now = Date.now();
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 'Active';
  if (diffDays <= 30) return 'Idle';
  return 'Inactive';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(date);
}

const statTones = {
  blue: { icon: 'border-blue-200 text-blue-600 dark:border-blue-900/60 dark:text-blue-400', bar: 'bg-blue-600 dark:bg-blue-500' },
  violet: { icon: 'border-violet-200 text-violet-600 dark:border-violet-900/60 dark:text-violet-400', bar: 'bg-violet-600 dark:bg-violet-500' },
  emerald: { icon: 'border-emerald-200 text-emerald-600 dark:border-emerald-900/60 dark:text-emerald-400', bar: 'bg-emerald-600 dark:bg-emerald-500' },
  amber: { icon: 'border-amber-200 text-amber-600 dark:border-amber-900/60 dark:text-amber-400', bar: 'bg-amber-600 dark:bg-amber-500' }
};

function StatCard({
  label,
  value,
  total,
  hint,
  icon,
  tone
}: {
  label: string;
  value: number;
  total: number;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof statTones;
}) {
  const share = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md border ${statTones[tone].icon}`}>{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{value.toLocaleString()}</span>
        <span className="text-xs font-semibold tabular-nums text-neutral-500 dark:text-slate-400" title="Share of all users">
          {share}%
        </span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">{hint}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
        <div className={`h-full ${statTones[tone].bar}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

export function UsersClientView({
  initialPersons,
  totalCount,
  stats,
  limit,
  offset,
  searchParam,
  segment,
  userEmail,
  projectId
}: Props) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState(searchParam);
  const activeTab = segment;
  const setActiveTab = (next: Props['segment']) => {
    if (next === activeTab) return;
    const params = new URLSearchParams(window.location.search);
    if (next === 'all') params.delete('segment');
    else params.set('segment', next);
    params.delete('offset');
    router.push(`/dashboard/users?${params.toString()}`, { scroll: false });
  };
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialPersons[0]?.id ?? null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<'overview' | 'events' | 'sessions' | 'properties'>('overview');
  const [timelineEvents, setTimelineEvents] = useState<UserTimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(limit);
  const [copiedId, setCopiedId] = useState(false);

  // Search runs on the server across every user in the project (not just this
  // page): typing updates ?search= after a short pause and restarts at page 1.
  useEffect(() => {
    const next = searchQuery.trim();
    if (next === searchParam.trim()) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (next) params.set('search', next);
      else params.delete('search');
      params.delete('offset');
      router.replace(`/dashboard/users?${params.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, searchParam, router]);

  // Tabs and search are applied by the API, so the loaded page is already filtered.
  const filteredPersons = initialPersons;

  // Active selected person
  const activePerson = useMemo(() => {
    return initialPersons.find((p) => p.id === selectedPersonId) ?? initialPersons[0] ?? null;
  }, [initialPersons, selectedPersonId]);

  // Fetch timeline events when selected person changes
  useEffect(() => {
    if (!activePerson?.id) return;
    let isMounted = true;
    setLoadingTimeline(true);

    const timelineQuery = new URLSearchParams({ limit: '10' });
    if (projectId) timelineQuery.set('projectId', projectId);

    clientFetch<{ items?: UserTimelineEvent[] }>(
      `/v1/dashboard/users/${encodeURIComponent(activePerson.id)}/timeline?${timelineQuery.toString()}`
    )
      .then(({ data }) => {
        if (isMounted) {
          setTimelineEvents(data?.items ?? []);
          setLoadingTimeline(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadingTimeline(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePerson?.id, projectId]);

  const profileHref = (id: string) =>
    `/dashboard/users/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;

  // Select all toggle
  const handleSelectAll = () => {
    if (selectedUserIds.size === filteredPersons.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredPersons.map((p) => p.id)));
    }
  };

  const handleToggleSelectUser = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedUserIds(next);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['User ID', 'Display Name', 'Email', 'Events', 'First Seen', 'Last Seen', 'Status'];
    const rows = filteredPersons.map((p) => [
      p.externalId || p.id,
      p.displayName,
      p.email || p.emailMasked || '',
      p.eventCount,
      p.firstSeenAt,
      p.lastSeenAt,
      getUserStatus(p.lastSeenAt)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `traceiq-users-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Global Status Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            People identified by the SDK. Click a user to see their timeline, events and recent activity.
          </p>
        </div>
      </div>

      {/* Top 4 KPI cards: real counts from the API; each bar is the share of all users. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={stats.totalUsers}
          total={stats.totalUsers}
          hint="Identified in this project"
          icon={<Users className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label="Active users (14d)"
          value={stats.activeUsers14d}
          total={stats.totalUsers}
          hint="Seen in the last 14 days"
          icon={<Activity className="h-4 w-4" />}
          tone="violet"
        />
        <StatCard
          label="New users (14d)"
          value={stats.newUsers14d}
          total={stats.totalUsers}
          hint="First seen in the last 14 days"
          icon={<UserPlus className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="Returning users"
          value={stats.returningUsers}
          total={stats.totalUsers}
          hint="First seen 14d+ ago, active in the last 14d"
          icon={<RefreshCw className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      {/* Main Split Layout: Users Table (Left 7/8 Cols) + User Profile Panel (Right 4/5 Cols) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Users Table */}
        <div className="space-y-4 xl:col-span-8">
          <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Table Filter Tabs & Search Bar */}
            <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              {/* Tabs */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'all'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                >
                  All users
                </button>
                <button
                  onClick={() => setActiveTab('new')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'new'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                >
                  New users
                </button>
                <button
                  onClick={() => setActiveTab('returning')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'returning'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                >
                  Returning users
                </button>
                <button
                  onClick={() => setActiveTab('inactive')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'inactive'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                >
                  Inactive users
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative min-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search all users by ID, name, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                {/* Export Button */}
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
              </div>
            </div>

            {/* Table Header */}
            <div className="hidden grid-cols-[32px_1.8fr_90px_100px_100px_90px_40px] items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 md:grid">
              <div>
                <input
                  type="checkbox"
                  checked={selectedUserIds.size === filteredPersons.length && filteredPersons.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                />
              </div>
              <span>User</span>
              <span className="text-right">Events</span>
              <span>First seen</span>
              <span>Last seen</span>
              <span>Status</span>
              <span className="text-right"></span>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-neutral-200 dark:divide-slate-800">
              {filteredPersons.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500 dark:text-slate-400">
                  {searchParam
                    ? 'No users match your search.'
                    : segment !== 'all'
                      ? `No ${segment} users in this project.`
                      : 'No identified users recorded yet.'}
                </div>
              ) : (
                filteredPersons.map((person) => {
                  const isSelected = activePerson?.id === person.id;
                  const isChecked = selectedUserIds.has(person.id);
                  const status = getUserStatus(person.lastSeenAt);
                  const display = person.email || person.displayName || person.externalId || person.id;
                  const initial = (display.replace(/[^a-zA-Z0-9]/g, '')[0] || 'U').toUpperCase();
                  const avatarClass = getAvatarColor(display);

                  return (
                    <div
                      key={person.id}
                      onClick={() => setSelectedPersonId(person.id)}
                      className={`grid cursor-pointer items-center gap-3 px-4 py-3 transition-colors md:grid-cols-[32px_1.8fr_90px_100px_100px_90px_40px] ${isSelected
                        ? 'border-l-4 border-l-blue-600 bg-blue-50/60 dark:border-l-blue-500 dark:bg-blue-950/20'
                        : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                      {/* Checkbox */}
                      <div onClick={(e) => handleToggleSelectUser(person.id, e)}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => { }}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                        />
                      </div>

                      {/* User Info (Avatar + Name/Email) */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                            {person.email || person.displayName || person.externalId || person.id}
                          </p>
                          {person.externalId && person.email && (
                            <p className="truncate font-mono text-[10px] text-neutral-400 dark:text-slate-500">{person.externalId}</p>
                          )}
                        </div>
                      </div>

                      {/* Events Count */}
                      <span className="text-right text-xs font-semibold tabular-nums text-neutral-800 dark:text-slate-200">
                        {person.eventCount.toLocaleString()}
                      </span>

                      {/* First Seen */}
                      <span className="hidden text-xs text-neutral-500 dark:text-slate-400 md:block">
                        {formatDate(person.firstSeenAt)}
                      </span>

                      {/* Last Seen */}
                      <span className="hidden text-xs text-neutral-500 dark:text-slate-400 md:block">
                        {formatDate(person.lastSeenAt)}
                      </span>

                      {/* Status Badge (Solid Colors) */}
                      <div>
                        {status === 'Active' && (
                          <span className="inline-flex items-center rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
                            Active
                          </span>
                        )}
                        {status === 'Idle' && (
                          <span className="inline-flex items-center rounded border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:text-amber-400">
                            Idle
                          </span>
                        )}
                        {status === 'Inactive' && (
                          <span className="inline-flex items-center rounded border border-neutral-300 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:border-slate-700 dark:text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>

                      {/* Action Menu */}
                      <div className="flex justify-end">
                        <Link
                          href={profileHref(person.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination & Footer */}
            <div className="flex flex-wrap items-center justify-between border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <button
                  disabled={offset === 0}
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.set('offset', String(Math.max(0, offset - limit)));
                    router.push(`/dashboard/users?${params.toString()}`);
                  }}
                  className="rounded border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30 dark:border-slate-800"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="rounded bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">
                  {Math.floor(offset / limit) + 1}
                </span>
                <button
                  disabled={offset + initialPersons.length >= totalCount || initialPersons.length < limit}
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.set('offset', String(offset + limit));
                    router.push(`/dashboard/users?${params.toString()}`);
                  }}
                  className="rounded border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30 dark:border-slate-800"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>Rows per page</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      const l = Number(e.target.value);
                      setRowsPerPage(l);
                      const params = new URLSearchParams(window.location.search);
                      params.set('limit', String(l));
                      router.push(`/dashboard/users?${params.toString()}`);
                    }}
                    className="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs font-medium dark:border-slate-800"
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>

                <span>
                  {initialPersons.length > 0 ? `${offset + 1}-${offset + initialPersons.length}` : '0'} of {totalCount.toLocaleString()}{' '}
                  {searchParam || segment !== 'all' ? 'matching ' : ''}users
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: User Detail Drawer Panel */}
        <div className="space-y-4 xl:col-span-4">
          {activePerson ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-neutral-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${getAvatarColor(
                      activePerson.email || activePerson.displayName || activePerson.id
                    )}`}
                  >
                    {((activePerson.email || activePerson.displayName || activePerson.id).replace(/[^a-zA-Z0-9]/g, '')[0] || 'U').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                      {activePerson.email || activePerson.displayName || activePerson.externalId || activePerson.id}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-slate-400">
                      First seen {formatDate(activePerson.firstSeenAt)} · Last seen {formatDate(activePerson.lastSeenAt)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleCopy(activePerson.id)}
                  className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
                  title="Copy user ID"
                >
                  {copiedId ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {/* Tabs */}
              <div className="mt-4 flex border-b border-neutral-200 text-xs font-semibold dark:border-slate-800">
                <button
                  onClick={() => setDetailTab('overview')}
                  className={`border-b-2 px-3 py-2 transition-colors ${detailTab === 'overview'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setDetailTab('events')}
                  className={`border-b-2 px-3 py-2 transition-colors ${detailTab === 'events'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                >
                  Events
                </button>
                <button
                  onClick={() => setDetailTab('properties')}
                  className={`border-b-2 px-3 py-2 transition-colors ${detailTab === 'properties'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                >
                  Properties
                </button>
              </div>

              {/* Tab Content: Overview */}
              {detailTab === 'overview' && (
                <div className="mt-4 space-y-5">
                  {/* 6 Metric Stat Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <Activity className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Total events</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">{activePerson.eventCount.toLocaleString()}</p>
                    </div>

                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <Film className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Sessions</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
                        {Math.max(1, Math.round(activePerson.eventCount / 5)).toLocaleString()}
                      </p>
                    </div>

                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-violet-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">First seen</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-neutral-900 dark:text-white">{formatDate(activePerson.firstSeenAt)}</p>
                    </div>

                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Last seen</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-neutral-900 dark:text-white">{formatDate(activePerson.lastSeenAt)}</p>
                    </div>

                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Status</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-neutral-900 dark:text-white">{getUserStatus(activePerson.lastSeenAt)}</p>
                    </div>

                    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">User type</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-neutral-900 dark:text-white">
                        {activePerson.externalId ? 'Identified' : 'Anonymous'}
                      </p>
                    </div>
                  </div>

                  {/* Recent Events List */}
                  <div>
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Recent events</h4>
                      <Link
                        href={profileHref(activePerson.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        View all →
                      </Link>
                    </div>

                    <div className="mt-3 space-y-2.5">
                      {loadingTimeline ? (
                        <div className="py-4 text-center text-xs text-neutral-400">Loading recent events...</div>
                      ) : timelineEvents.length > 0 ? (
                        timelineEvents.slice(0, 5).map((evt) => {
                          const eventTypeColor =
                            evt.eventName === '$pageview' || evt.eventName.includes('view')
                              ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : evt.eventName.includes('click')
                                ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                                : evt.eventName.includes('identify')
                                  ? 'border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
                                  : 'border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-400';

                          return (
                            <div key={evt.id} className="flex items-center justify-between rounded-md border border-neutral-100 p-2 text-xs dark:border-slate-800">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${eventTypeColor}`}>
                                  {evt.eventName}
                                </span>
                                <span className="truncate text-neutral-700 dark:text-slate-300">
                                  {String(evt.properties?.pathname || evt.properties?.url || evt.properties?.button || '')}
                                </span>
                              </div>
                              <span className="shrink-0 text-[10px] text-neutral-400">{formatDateTime(evt.occurredAt)}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-4 text-center text-xs text-neutral-400">No recent events recorded.</div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Action CTAs */}
                  <div className="flex items-center gap-3 pt-2">
                    <Link
                      href={profileHref(activePerson.id)}
                      className="flex-1 rounded-md border border-neutral-300 bg-white py-2 text-center text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      View full timeline
                    </Link>
                    <Link
                      href={profileHref(activePerson.id)}
                      className="flex-1 rounded-md bg-blue-600 py-2 text-center text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      View user journey
                    </Link>
                  </div>
                </div>
              )}

              {/* Tab Content: Events */}
              {detailTab === 'events' && (
                <div className="mt-4 space-y-2">
                  {timelineEvents.map((evt) => (
                    <div key={evt.id} className="rounded-md border border-neutral-100 p-2.5 text-xs dark:border-slate-800">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-blue-600 dark:text-blue-400">{evt.eventName}</span>
                        <span className="text-[10px] text-neutral-400">{formatDateTime(evt.occurredAt)}</span>
                      </div>
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-neutral-50 p-1.5 font-mono text-[10px] text-neutral-700 dark:bg-slate-950 dark:text-slate-300">
                        {JSON.stringify(evt.properties, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab Content: Properties */}
              {detailTab === 'properties' && (
                <div className="mt-4 space-y-2">
                  {Object.entries(activePerson.traits || {}).length > 0 ? (
                    Object.entries(activePerson.traits).map(([key, value]) => (
                      <div key={key} className="flex justify-between rounded border border-neutral-100 p-2 text-xs dark:border-slate-800">
                        <span className="font-mono text-neutral-500 dark:text-slate-400">{key}</span>
                        <span className="font-medium text-neutral-900 dark:text-white">{String(value)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-xs text-neutral-400">No custom traits stored for this user.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-xs text-neutral-400 dark:border-slate-800 dark:bg-slate-900">
              Select a user to view their detailed profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
