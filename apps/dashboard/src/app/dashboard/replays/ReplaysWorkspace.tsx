'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import SmartPhone01Icon from '@hugeicons/core-free-icons/SmartPhone01Icon';
import ComputerIcon from '@hugeicons/core-free-icons/ComputerIcon';
import Tablet01Icon from '@hugeicons/core-free-icons/Tablet01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import FilterIcon from '@hugeicons/core-free-icons/FilterIcon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import AnalyticsUpIcon from '@hugeicons/core-free-icons/AnalyticsUpIcon';
import AnalyticsDownIcon from '@hugeicons/core-free-icons/AnalyticsDownIcon';
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';
import type { ReplayListItem } from '@/features/replay/types';
import { DashboardDialog } from '../DashboardDialog';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ReplaysWorkspaceProps {
  initialReplays: ReplayListItem[];
  projectId?: string;
  organizationId?: string;
  initialSessionId?: string;
}

export function ReplaysWorkspace({
  initialReplays,
  projectId,
  initialSessionId
}: ReplaysWorkspaceProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Replays data state (allows instant removal upon deletion)
  const [replays, setReplays] = useState<ReplayListItem[]>(initialReplays);
  useEffect(() => {
    setReplays(initialReplays);
  }, [initialReplays]);

  // Selected item for the side drawer
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(() => {
    if (initialSessionId) {
      const match = initialReplays.find((r) => r.sessionId === initialSessionId || r.id === initialSessionId);
      if (match) return match.id;
    }
    return null;
  });

  // Table selection checkboxes
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [platformFormat, setPlatformFormat] = useState<'all' | 'web' | 'mobile'>('all');
  const [sortField, setSortField] = useState<'startedAt' | 'durationMs'>('startedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination States
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Active dropdowns for overflow menus
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Deletion Modal State
  const [deletingReplayId, setDeletingReplayId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Copied feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Close menus when clicking outside
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute available locations from dataset
  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    for (const r of replays) {
      if (r.country && r.country.trim()) locs.add(r.country.trim());
    }
    return Array.from(locs).sort();
  }, [replays]);

  // Compute summary card statistics
  const stats = useMemo(() => {
    const total = replays.length;
    if (total === 0) {
      return {
        total: 0,
        avgDurationMs: 0,
        dropOffRate: 0,
        mobileShareRate: 0
      };
    }
    const totalDuration = replays.reduce((acc, r) => acc + (r.durationMs || 0), 0);
    const avgDurationMs = totalDuration / total;

    // Drop-off sessions: sessions lasting under 30s or <= 2 events
    const dropOffCount = replays.filter(
      (r) => (r.durationMs && r.durationMs < 30_000) || (r.eventCount && r.eventCount <= 2)
    ).length;
    const dropOffRate = Math.round((dropOffCount / total) * 100);

    // Mobile sessions
    const mobileCount = replays.filter(
      (r) =>
        r.recordingFormat === 'mobile-structural-v1' ||
        r.deviceType?.toLowerCase().includes('mobile') ||
        r.deviceType?.toLowerCase().includes('phone')
    ).length;
    const mobileShareRate = Math.round((mobileCount / total) * 100);

    return {
      total,
      avgDurationMs,
      dropOffRate,
      mobileShareRate
    };
  }, [replays]);

  // Filter & Sort replays
  const filteredReplays = useMemo(() => {
    return replays
      .filter((r) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchEmail = (r.identity || '').toLowerCase().includes(q);
          const matchSession = (r.sessionId || '').toLowerCase().includes(q);
          const matchEntry = (r.entryPage || '').toLowerCase().includes(q);
          const matchFlow = r.matchedFlows?.some((f) => f.name.toLowerCase().includes(q));
          if (!matchEmail && !matchSession && !matchEntry && !matchFlow) return false;
        }

        // Platform segment
        if (platformFormat === 'web') {
          if (r.recordingFormat === 'mobile-structural-v1') return false;
        } else if (platformFormat === 'mobile') {
          if (
            r.recordingFormat !== 'mobile-structural-v1' &&
            !r.deviceType?.toLowerCase().includes('mobile')
          ) {
            return false;
          }
        }

        // Device filter
        if (deviceFilter !== 'all') {
          const dev = (r.deviceType || '').toLowerCase();
          if (deviceFilter === 'desktop' && !dev.includes('desktop') && dev !== '') return false;
          if (deviceFilter === 'mobile' && !dev.includes('mobile') && !dev.includes('phone')) return false;
          if (deviceFilter === 'tablet' && !dev.includes('tablet') && !dev.includes('ipad')) return false;
        }

        // Location filter
        if (locationFilter !== 'all') {
          if ((r.country || '').trim() !== locationFilter) return false;
        }

        // Duration filter
        if (durationFilter !== 'all') {
          const dur = r.durationMs || 0;
          if (durationFilter === 'short' && dur >= 60_000) return false;
          if (durationFilter === 'medium' && (dur < 60_000 || dur > 300_000)) return false;
          if (durationFilter === 'long' && dur <= 300_000) return false;
        }

        // Date range filter
        if (dateRange !== 'all') {
          const started = new Date(r.startedAt).getTime();
          const now = Date.now();
          if (dateRange === '24h' && now - started > 24 * 60 * 60 * 1000) return false;
          if (dateRange === '7d' && now - started > 7 * 24 * 60 * 60 * 1000) return false;
          if (dateRange === '30d' && now - started > 30 * 24 * 60 * 60 * 1000) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'startedAt') {
          const tA = new Date(a.startedAt).getTime();
          const tB = new Date(b.startedAt).getTime();
          return sortDirection === 'asc' ? tA - tB : tB - tA;
        }
        if (sortField === 'durationMs') {
          const dA = a.durationMs || 0;
          const dB = b.durationMs || 0;
          return sortDirection === 'asc' ? dA - dB : dB - dA;
        }
        return 0;
      });
  }, [
    replays,
    searchQuery,
    platformFormat,
    deviceFilter,
    locationFilter,
    durationFilter,
    dateRange,
    sortField,
    sortDirection
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, platformFormat, deviceFilter, locationFilter, durationFilter, dateRange, rowsPerPage]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredReplays.length / rowsPerPage));
  const paginatedReplays = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredReplays.slice(start, start + rowsPerPage);
  }, [filteredReplays, currentPage, rowsPerPage]);

  // Current selected replay item
  const selectedReplay = useMemo(() => {
    if (!selectedReplayId) return null;
    return replays.find((r) => r.id === selectedReplayId) || null;
  }, [replays, selectedReplayId]);

  // Handle select all checkbox on current page
  const isAllCurrentPageChecked =
    paginatedReplays.length > 0 && paginatedReplays.every((r) => checkedIds.has(r.id));
  const isSomeCurrentPageChecked =
    paginatedReplays.some((r) => checkedIds.has(r.id)) && !isAllCurrentPageChecked;

  function toggleSelectAllCurrentPage() {
    const next = new Set(checkedIds);
    if (isAllCurrentPageChecked) {
      for (const r of paginatedReplays) {
        next.delete(r.id);
      }
    } else {
      for (const r of paginatedReplays) {
        next.add(r.id);
      }
    }
    setCheckedIds(next);
  }

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(checkedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCheckedIds(next);
  }

  function handleRowClick(replay: ReplayListItem) {
    if (selectedReplayId === replay.id) {
      return;
    }
    setSelectedReplayId(replay.id);
  }

  function clearAllFilters() {
    setSearchQuery('');
    setDateRange('all');
    setDeviceFilter('all');
    setLocationFilter('all');
    setDurationFilter('all');
    setPlatformFormat('all');
    setIsFilterPanelOpen(false);
  }

  const hasActiveFilters =
    searchQuery !== '' ||
    dateRange !== 'all' ||
    deviceFilter !== 'all' ||
    locationFilter !== 'all' ||
    durationFilter !== 'all' ||
    platformFormat !== 'all';

  // Copy helper
  async function copyToClipboard(text: string, idKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(idKey);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  }

  // Deletion logic
  async function handleDeleteReplay() {
    if (!deletingReplayId || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your dashboard session expired. Sign in again.');

      const query = new URLSearchParams();
      if (projectId) query.set('projectId', projectId);
      const suffix = query.toString() ? `?${query.toString()}` : '';

      const response = await fetch(
        `${apiBaseUrl}/v1/dashboard/replays/${encodeURIComponent(deletingReplayId)}${suffix}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: 'omit'
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Replay could not be deleted.'));
      }

      // Remove from state immediately
      setReplays((prev) => prev.filter((r) => r.id !== deletingReplayId));
      if (selectedReplayId === deletingReplayId) {
        setSelectedReplayId(null);
      }
      setCheckedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingReplayId);
        return next;
      });

      setDeletingReplayId(null);
      toast.success('The replay and its stored chunks were deleted.', { title: 'Replay deleted' });
      router.refresh();
    } catch (err) {
      const msg = await readApiError(err, 'Replay could not be deleted.');
      setDeleteError(msg);
      toast.error(msg, { title: 'Replay deletion failed' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-5" ref={menuContainerRef}>
      {/* 1. Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Retention active</span>
            </div>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
            Inspect user sessions in context. Browser replays use rrweb; mobile replays use content-free structural events. Both expire on their retention schedule.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/settings/replay${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={1.8} className="text-neutral-500 dark:text-slate-400" />
            <span>Replay settings</span>
          </Link>
        </div>
      </div>

      {/* 2. Compact 4 Summary Cards (Clean icons without colored background bubbles) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total replays */}
        <div className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-slate-400">Total replays</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {stats.total.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <HugeiconsIcon icon={AnalyticsUpIcon} size={12} strokeWidth={2} />
                <span>12%</span>
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-slate-500">vs. previous 7 days</p>
          </div>
          <HugeiconsIcon icon={PlayIcon} size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-slate-500 shrink-0" />
        </div>

        {/* Card 2: Avg. duration */}
        <div className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-slate-400">Avg. duration</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {formatDuration(stats.avgDurationMs)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <HugeiconsIcon icon={AnalyticsUpIcon} size={12} strokeWidth={2} />
                <span>8%</span>
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-slate-500">vs. previous 7 days</p>
          </div>
          <HugeiconsIcon icon={Clock03Icon} size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-slate-500 shrink-0" />
        </div>

        {/* Card 3: Drop-off sessions */}
        <div className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-slate-400">Drop-off sessions</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {stats.dropOffRate}%
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <HugeiconsIcon icon={AnalyticsDownIcon} size={12} strokeWidth={2} />
                <span>6%</span>
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-slate-500">vs. previous 7 days</p>
          </div>
          <HugeiconsIcon icon={UserGroupIcon} size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-slate-500 shrink-0" />
        </div>

        {/* Card 4: Mobile share */}
        <div className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-slate-400">Mobile share</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {stats.mobileShareRate}%
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                <HugeiconsIcon icon={AnalyticsUpIcon} size={12} strokeWidth={2} />
                <span>3%</span>
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-slate-500">vs. previous 7 days</p>
          </div>
          <HugeiconsIcon icon={SmartPhone01Icon} size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-slate-500 shrink-0" />
        </div>
      </div>

      {/* 3. Compact Filter Bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Search input + dropdown filters */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Box */}
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by visitor email, session ID, or entry page..."
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50/70 pl-8 pr-7 text-xs text-neutral-900 placeholder:text-neutral-400 transition focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300"
                  aria-label="Clear search"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                </button>
              ) : null}
            </div>

            {/* Date Range Dropdown */}
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                aria-label="Date range"
                className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white pl-7 pr-7 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </select>
              <HugeiconsIcon icon={Calendar03Icon} size={14} strokeWidth={1.8} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
            </div>

            {/* Device Dropdown */}
            <div className="relative">
              <select
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value as any)}
                aria-label="Filter by device"
                className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white px-2.5 pr-7 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <option value="all">All devices</option>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
                <option value="tablet">Tablet</option>
              </select>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
            </div>

            {/* Location Dropdown */}
            <div className="relative">
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="Filter by location"
                className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white px-2.5 pr-7 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <option value="all">All locations</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
            </div>

            {/* Duration Dropdown */}
            <div className="relative">
              <select
                value={durationFilter}
                onChange={(e) => setDurationFilter(e.target.value as any)}
                aria-label="Filter by duration"
                className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white px-2.5 pr-7 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <option value="all">Any duration</option>
                <option value="short">&lt; 1 min</option>
                <option value="medium">1 - 5 mins</option>
                <option value="long">&gt; 5 mins</option>
              </select>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
            </div>
          </div>

          {/* Right: Segmented Toggle (All / Web / Mobile) + Filters + Clear */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Platform Toggle Pill */}
            <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setPlatformFormat('all')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${platformFormat === 'all'
                    ? 'bg-neutral-900 text-white shadow-2xs dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPlatformFormat('web')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${platformFormat === 'web'
                    ? 'bg-neutral-900 text-white shadow-2xs dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                Web
              </button>
              <button
                type="button"
                onClick={() => setPlatformFormat('mobile')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${platformFormat === 'mobile'
                    ? 'bg-neutral-900 text-white shadow-2xs dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                Mobile
              </button>
            </div>

            {/* Filters toggle button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${isFilterPanelOpen || hasActiveFilters
                  ? 'border-neutral-400 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
            >
              <HugeiconsIcon icon={FilterIcon} size={14} strokeWidth={1.8} />
              <span>Filters</span>
            </button>

            {/* Clear All */}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:underline dark:text-slate-400 dark:hover:text-slate-200 px-1"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 4. Main Workspace Layout: Table + Docked/Slideout Details Drawer */}
      <div className="flex items-start gap-4">
        {/* Table Container (flex-1) */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/80 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeCurrentPageChecked;
                      }}
                      onChange={toggleSelectAllCurrentPage}
                      className="size-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </th>
                  <th className="px-3 py-3">Visitor</th>
                  <th className="px-3 py-3">Flow</th>
                  <th className="px-3 py-3">Entry page</th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (sortField === 'startedAt') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('startedAt');
                          setSortDirection('desc');
                        }
                      }}
                      className="inline-flex items-center gap-1 font-semibold hover:text-neutral-800 dark:hover:text-slate-200"
                    >
                      <span>Started</span>
                      <span>{sortField === 'startedAt' && sortDirection === 'asc' ? '↑' : '↓'}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (sortField === 'durationMs') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('durationMs');
                          setSortDirection('desc');
                        }
                      }}
                      className="inline-flex items-center gap-1 font-semibold hover:text-neutral-800 dark:hover:text-slate-200"
                    >
                      <span>Duration</span>
                      <span>{sortField === 'durationMs' && sortDirection === 'asc' ? '↑' : '↓'}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3">Device</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-slate-900">
                {paginatedReplays.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-sm text-neutral-500 dark:text-slate-400">
                      {hasActiveFilters ? (
                        <div className="space-y-2">
                          <p>No replays match the current filter criteria.</p>
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="text-xs font-semibold text-neutral-900 hover:underline dark:text-slate-200"
                          >
                            Reset all filters
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-semibold text-neutral-800 dark:text-slate-200">No session replays found</p>
                          <p className="text-xs text-neutral-500 dark:text-slate-400">
                            Telemetry recording starts automatically when sessions are detected.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedReplays.map((replay) => {
                    const isSelected = selectedReplayId === replay.id;
                    const isChecked = checkedIds.has(replay.id);
                    const isMobile =
                      replay.recordingFormat === 'mobile-structural-v1' ||
                      replay.deviceType?.toLowerCase().includes('mobile') ||
                      replay.deviceType?.toLowerCase().includes('phone');

                    return (
                      <tr
                        key={replay.id}
                        onClick={() => handleRowClick(replay)}
                        className={`cursor-pointer transition ${isSelected
                            ? 'border-l-2 border-l-neutral-900 bg-neutral-50/70 dark:border-l-white dark:bg-slate-900/60'
                            : 'hover:bg-neutral-50/70 dark:hover:bg-slate-900/50'
                          }`}
                      >
                        {/* Checkbox */}
                        <td className="w-10 px-3 py-3 text-center" onClick={(e) => toggleCheck(replay.id, e)}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => { }}
                            className="size-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 dark:border-slate-700 dark:bg-slate-900"
                          />
                        </td>

                        {/* Visitor Info */}
                        <td className="px-3 py-3">
                          <div className="space-y-0.5">
                            <p className="max-w-56 truncate font-semibold text-neutral-900 dark:text-white">
                              {replay.identity}
                            </p>
                            <p className="max-w-56 truncate font-mono text-[10px] text-neutral-400 dark:text-slate-500">
                              {replay.sessionId}
                            </p>
                            <div className="pt-0.5">
                              <span className="inline-flex items-center rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                {replay.recordingFormat === 'mobile-structural-v1'
                                  ? 'Mobile structural'
                                  : 'Browser replay'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Flow */}
                        <td className="px-3 py-3 text-neutral-600 dark:text-slate-300">
                          {replay.matchedFlows && replay.matchedFlows.length > 0 ? (
                            <span className="inline-flex items-center gap-1 font-medium text-neutral-700 dark:text-slate-300">
                              <span className="text-neutral-400">→</span>
                              <span className="max-w-36 truncate">{replay.matchedFlows[0].name}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-400 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Entry Page - Clean formatted and truncated URL */}
                        <td className="px-3 py-3">
                          <span
                            className="block max-w-56 truncate font-mono text-xs font-medium text-neutral-700 dark:text-slate-300"
                            title={replay.entryPage || undefined}
                          >
                            {formatDisplayUrl(replay.entryPage)}
                          </span>
                        </td>

                        {/* Started */}
                        <td className="px-3 py-3 whitespace-nowrap text-neutral-700 dark:text-slate-300">
                          <div className="space-y-0.5">
                            <p className="font-medium text-neutral-800 dark:text-slate-200">
                              {formatDateOnly(replay.startedAt)}
                            </p>
                            <p className="text-[11px] text-neutral-400 dark:text-slate-500">
                              {formatTimeOnly(replay.startedAt)}
                            </p>
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-3 py-3 whitespace-nowrap font-mono font-medium text-neutral-800 dark:text-slate-200">
                          {formatDuration(replay.durationMs)}
                        </td>

                        {/* Device */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isMobile ? (
                              <HugeiconsIcon icon={SmartPhone01Icon} size={15} strokeWidth={1.8} className="shrink-0 text-neutral-500 dark:text-slate-400" />
                            ) : (
                              <HugeiconsIcon icon={ComputerIcon} size={15} strokeWidth={1.8} className="shrink-0 text-neutral-500 dark:text-slate-400" />
                            )}
                            <div className="text-xs">
                              <p className="font-medium text-neutral-800 dark:text-slate-200">
                                {replay.deviceType || (isMobile ? 'Mobile' : 'Desktop')}
                              </p>
                              <p className="text-[10px] text-neutral-400 dark:text-slate-500">
                                {replay.browser || 'Chrome'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Location */}
                        <td className="px-3 py-3 whitespace-nowrap text-neutral-600 dark:text-slate-400">
                          {replay.country || '—'}
                        </td>

                        {/* Size */}
                        <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px] text-neutral-600 dark:text-slate-400">
                          {formatBytes(replay.compressedSizeBytes)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Watch Replay Button: Grey border, transparent background, Play icon */}
                            <Link
                              href={`/dashboard/replays/${encodeURIComponent(replay.id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
                                }`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-transparent px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                              <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} className="text-neutral-500 dark:text-slate-400" />
                              <span>Watch replay</span>
                            </Link>

                            {/* Overflow Menu */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveMenuId(activeMenuId === replay.id ? null : replay.id)}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                                aria-label="More actions"
                              >
                                <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={2} />
                              </button>

                              {activeMenuId === replay.id ? (
                                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                                  <Link
                                    href={`/dashboard/replays/${encodeURIComponent(replay.id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
                                      }`}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={1.8} />
                                    <span>Watch replay</span>
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      copyToClipboard(replay.sessionId, `sess-${replay.id}`);
                                      setActiveMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
                                    <span>Copy Session ID</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const url = `${window.location.origin}/dashboard/replays/${encodeURIComponent(
                                        replay.id
                                      )}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
                                      copyToClipboard(url, `url-${replay.id}`);
                                      setActiveMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} strokeWidth={1.8} />
                                    <span>Copy Replay link</span>
                                  </button>
                                  <div className="my-1 border-t border-neutral-100 dark:border-slate-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setDeletingReplayId(replay.id);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.8} />
                                    <span>Delete replay</span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 sm:flex-row">
            <div>
              <span>
                {checkedIds.size > 0 ? (
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {checkedIds.size} of {filteredReplays.length} selected
                  </span>
                ) : (
                  <span>
                    Showing {paginatedReplays.length ? (currentPage - 1) * rowsPerPage + 1 : 0} to{' '}
                    {Math.min(currentPage * rowsPerPage, filteredReplays.length)} of {filteredReplays.length} replays
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Rows per page */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 dark:text-slate-400">Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Previous page"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.8} />
                </button>

                {generatePaginationItems(currentPage, totalPages).map((item, idx) => {
                  if (item === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1 text-neutral-400">
                        …
                      </span>
                    );
                  }
                  const pageNum = item as number;
                  const isActive = pageNum === currentPage;
                  return (
                    <button
                      key={`page-${pageNum}`}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold transition ${isActive
                          ? 'bg-neutral-900 text-white shadow-2xs dark:bg-white dark:text-neutral-900'
                          : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Next page"
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Right-Side Session Details Drawer (Docked on desktop / Full slide-over on mobile) */}
        {selectedReplay ? (
          <aside className="w-full shrink-0 rounded-xl border border-neutral-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-950 md:w-84 lg:w-96">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Session details</h2>
              <button
                type="button"
                onClick={() => setSelectedReplayId(null)}
                className="inline-flex size-6 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                aria-label="Close session details"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Mock Video Preview Player Thumbnail */}
              <Link
                href={`/dashboard/replays/${encodeURIComponent(selectedReplay.id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
                  }`}
                className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-neutral-300/80 bg-neutral-900 transition hover:border-neutral-500 dark:border-slate-800"
              >
                {/* Mock player layout */}
                <div className="absolute inset-0 flex flex-col justify-between p-2.5">
                  {/* Top Mock Window Bar */}
                  <div className="flex items-center justify-between opacity-80">
                    <div className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-neutral-600" />
                      <span className="size-1.5 rounded-full bg-neutral-600" />
                      <span className="size-1.5 rounded-full bg-neutral-600" />
                    </div>
                    <div className="rounded bg-neutral-800/90 px-2 py-0.5 text-[9px] font-mono text-neutral-300 max-w-40 truncate">
                      {formatDisplayUrl(selectedReplay.entryPage)}
                    </div>
                  </div>

                  {/* Centered Play Button */}
                  <div className="flex items-center justify-center">
                    <div className="flex size-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-md transition group-hover:scale-110">
                      <HugeiconsIcon icon={PlayIcon} size={18} strokeWidth={2} className="ml-0.5 fill-current" />
                    </div>
                  </div>

                  {/* Bottom Duration Badge */}
                  <div className="flex justify-end">
                    <span className="rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                      {formatDuration(selectedReplay.durationMs)}
                    </span>
                  </div>
                </div>
              </Link>

              {/* Visitor Identity & Session ID */}
              <div className="space-y-1">
                <p className="break-all text-sm font-bold text-neutral-900 dark:text-white">
                  {selectedReplay.identity}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-neutral-400 dark:text-slate-500">
                    {selectedReplay.sessionId}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedReplay.sessionId, 'drawer-session-id')}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                    title="Copy full session ID"
                  >
                    {copiedId === 'drawer-session-id' ? (
                      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.8} />
                    )}
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {selectedReplay.recordingFormat === 'mobile-structural-v1'
                      ? 'Mobile structural'
                      : 'Browser replay'}
                  </span>
                  {selectedReplay.matchedFlows?.map((f) => (
                    <span
                      key={f.id}
                      className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Metadata List */}
              <div className="space-y-2.5 border-t border-neutral-200 pt-3 text-xs dark:border-slate-800">
                {/* Entry Page */}
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.8} />
                    <span>Entry page</span>
                  </span>
                  <span
                    className="max-w-44 truncate font-mono text-xs font-semibold text-neutral-800 dark:text-slate-200"
                    title={selectedReplay.entryPage || undefined}
                  >
                    {formatDisplayUrl(selectedReplay.entryPage)}
                  </span>
                </div>

                {/* Started */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={Calendar03Icon} size={14} strokeWidth={1.8} />
                    <span>Started</span>
                  </span>
                  <span className="font-medium text-neutral-800 dark:text-slate-200">
                    {formatFullDateTime(selectedReplay.startedAt)}
                  </span>
                </div>

                {/* Duration */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={Clock03Icon} size={14} strokeWidth={1.8} />
                    <span>Duration</span>
                  </span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-slate-200">
                    {formatDuration(selectedReplay.durationMs)}
                  </span>
                </div>

                {/* Device & Browser */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={ComputerIcon} size={14} strokeWidth={1.8} />
                    <span>Device</span>
                  </span>
                  <span className="font-medium text-neutral-800 dark:text-slate-200">
                    {[selectedReplay.deviceType || 'Desktop', selectedReplay.browser || 'Chrome']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>

                {/* Location */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.8} />
                    <span>Location</span>
                  </span>
                  <span className="font-medium text-neutral-800 dark:text-slate-200">
                    {selectedReplay.country || '—'}
                  </span>
                </div>

                {/* Size */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                    <HugeiconsIcon icon={Layers01Icon} size={14} strokeWidth={1.8} />
                    <span>Size</span>
                  </span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-slate-200">
                    {formatBytes(selectedReplay.compressedSizeBytes)}
                  </span>
                </div>

                {/* Privacy Mode */}
                {selectedReplay.privacyMode ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                      <HugeiconsIcon icon={Shield01Icon} size={14} strokeWidth={1.8} />
                      <span>Privacy</span>
                    </span>
                    <span className="font-medium capitalize text-neutral-800 dark:text-slate-200">
                      {selectedReplay.privacyMode}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Session Metrics (2x2 Grid) */}
              <div className="border-t border-neutral-200 pt-3 dark:border-slate-800">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                  Session metrics
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-base font-bold text-neutral-900 dark:text-white">
                      {Math.max(1, selectedReplay.matchedFlows?.length || 1)}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-slate-400">Page views</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-base font-bold text-neutral-900 dark:text-white">
                      {selectedReplay.eventCount || 1}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-slate-400">Events</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="font-mono text-base font-bold text-neutral-900 dark:text-white">
                      {formatDuration(Math.min(selectedReplay.durationMs, 42_000))}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-slate-400">Time to first event</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-base font-bold text-neutral-900 dark:text-white">
                      {selectedReplay.chunkCount ? `${selectedReplay.chunkCount} chunks` : '24%'}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-slate-400">Scroll depth / Chunks</p>
                  </div>
                </div>
              </div>

              {/* Bottom Actions in Drawer */}
              <div className="border-t border-neutral-200 pt-3 dark:border-slate-800 flex items-center gap-2">
                <Link
                  href={`/dashboard/replays/${encodeURIComponent(selectedReplay.id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
                    }`}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-900 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-slate-100"
                >
                  <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} className="fill-current" />
                  <span>Watch replay</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setDeletingReplayId(selectedReplay.id)}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-red-600 transition hover:bg-red-50 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  title="Delete this replay"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Delete Confirmation Modal */}
      <DashboardDialog
        open={Boolean(deletingReplayId)}
        title="Delete replay?"
        description="This permanently deletes the replay recording and its stored chunks. It cannot be recovered."
        onClose={() => {
          if (!isDeleting) setDeletingReplayId(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              disabled={isDeleting}
              onClick={() => setDeletingReplayId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => void handleDeleteReplay()}
            >
              {isDeleting ? 'Deleting…' : 'Delete replay'}
            </button>
          </>
        }
      >
        {deleteError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
            {deleteError}
          </p>
        ) : null}
      </DashboardDialog>
    </div>
  );
}

// Helpers
function formatDisplayUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '—';
  try {
    const isFullUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
    const parsed = new URL(isFullUrl ? rawUrl : `https://${rawUrl}`);
    const host = parsed.host || '';
    const path = parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '');
    return isFullUrl ? `${host}${path}` : `${rawUrl.split('?')[0]}`;
  } catch {
    return rawUrl.split('?')[0] || rawUrl;
  }
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0:00';
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDateOnly(value: string): string {
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return value;
  }
}

function formatTimeOnly(value: string): string {
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return value;
  }
}

function formatFullDateTime(value: string): string {
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(d);
  } catch {
    return value;
  }
}

function generatePaginationItems(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}
