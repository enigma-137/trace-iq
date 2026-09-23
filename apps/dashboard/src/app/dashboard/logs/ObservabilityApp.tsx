'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  ObservabilityLog,
  HistogramBucket,
  HistogramResponse,
  ObservabilityFilterState
} from './types';
import { ObservabilityToolbar } from './ObservabilityToolbar';
import { ObservabilityChart } from './ObservabilityChart';
import { LogStreamTable } from './LogStreamTable';
import { LogDetailDrawer } from './LogDetailDrawer';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ObservabilityAppProps {
  initialLogs: ObservabilityLog[];
  initialHistogram: HistogramResponse;
  initialHasMore: boolean;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
}

export function ObservabilityApp({
  initialLogs,
  initialHistogram,
  initialHasMore,
  projectId,
  project
}: ObservabilityAppProps) {
  const supabase = createSupabaseBrowserClient();

  const [filters, setFilters] = useState<ObservabilityFilterState>({
    timeRange: '1h',
    source: 'all',
    level: '',
    status: '',
    search: ''
  });

  const [logs, setLogs] = useState<ObservabilityLog[]>(initialLogs);
  const [histogram, setHistogram] = useState<HistogramResponse>(initialHistogram);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [selectedLog, setSelectedLog] = useState<ObservabilityLog | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateTimeRangeDates = useCallback((range: ObservabilityFilterState['timeRange']) => {
    const to = new Date();
    let from = new Date(to.getTime() - 60 * 60 * 1000); // 1h default

    if (range === '15m') from = new Date(to.getTime() - 15 * 60 * 1000);
    else if (range === '6h') from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
    else if (range === '24h') from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    else if (range === '7d') from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const fetchTelemetry = useCallback(
    async (
      currentFilters: ObservabilityFilterState,
      currentOffset = 0,
      append = false
    ) => {
      try {
        if (!append) setIsLoading(true);

        const {
          data: { session }
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const { from, to } =
          currentFilters.from && currentFilters.to
            ? { from: currentFilters.from, to: currentFilters.to }
            : calculateTimeRangeDates(currentFilters.timeRange);

        const queryParams = new URLSearchParams();
        if (projectId) queryParams.set('projectId', projectId);
        queryParams.set('from', from);
        queryParams.set('to', to);
        if (currentFilters.source !== 'all') queryParams.set('source', currentFilters.source);
        if (currentFilters.level) queryParams.set('level', currentFilters.level);
        if (currentFilters.status) queryParams.set('status', currentFilters.status);
        if (currentFilters.search.trim()) queryParams.set('search', currentFilters.search.trim());
        queryParams.set('limit', '50');
        queryParams.set('offset', String(currentOffset));

        const [logsRes, histRes] = await Promise.all([
          fetch(`${apiBaseUrl}/v1/dashboard/logs?${queryParams.toString()}`, { headers }),
          fetch(`${apiBaseUrl}/v1/dashboard/logs/histogram?${queryParams.toString()}`, { headers })
        ]);

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs((prev) => (append ? [...prev, ...logsData.logs] : logsData.logs));
          setHasMore(logsData.hasMore);
          setOffset(currentOffset);
        }

        if (histRes.ok) {
          const histData = await histRes.json();
          setHistogram(histData);
        }
      } catch (err) {
        // Telemetry fetch error handled silently or with fallback
      } finally {
        setIsLoading(false);
      }
    },
    [supabase, projectId, calculateTimeRangeDates]
  );

  // Trigger telemetry fetch on filter change with search debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchTelemetry(filters, 0, false);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters, fetchTelemetry]);

  // Live polling interval (every 3s when isLive is enabled, pauses on background tabs)
  useEffect(() => {
    if (!isLive) {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      return;
    }

    const pollIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchTelemetry(filters, 0, false);
    };

    liveIntervalRef.current = setInterval(pollIfVisible, 3000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchTelemetry(filters, 0, false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isLive, filters, fetchTelemetry]);

  // Handle clicking a histogram bucket -> zoom into bucket's time window
  const handleSelectBucket = (bucket: HistogramBucket) => {
    const bucketTime = new Date(bucket.timestamp).getTime();
    const intervalMs = (histogram.intervalSeconds || 60) * 1000;
    const bucketStart = new Date(bucketTime).toISOString();
    const bucketEnd = new Date(bucketTime + intervalMs).toISOString();

    setFilters((prev) => ({
      ...prev,
      timeRange: 'custom',
      from: bucketStart,
      to: bucketEnd
    }));
  };

  const handleLoadMore = () => {
    const nextOffset = offset + 50;
    fetchTelemetry(filters, nextOffset, true);
  };

  return (
    <div className="space-y-4">
      {/* Top filter toolbar */}
      <ObservabilityToolbar
        filters={filters}
        onFilterChange={setFilters}
        isLive={isLive}
        onToggleLive={() => setIsLive((prev) => !prev)}
        onRefresh={() => fetchTelemetry(filters, 0, false)}
        isLoading={isLoading}
        sourceCounts={histogram.sourceCounts}
      />

      {/* Interactive Activity Histogram Chart */}
      <ObservabilityChart
        buckets={histogram.buckets}
        summary={histogram.summary}
        onSelectBucket={handleSelectBucket}
        isLoading={isLoading}
      />

      {/* Chronological Log Stream Table */}
      <LogStreamTable
        logs={logs}
        selectedLogId={selectedLog?.id ?? null}
        onSelectLog={setSelectedLog}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
      />

      {/* Slideout Detail Drawer */}
      <LogDetailDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        projectId={projectId}
      />
    </div>
  );
}
