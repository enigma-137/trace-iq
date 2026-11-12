'use client';

import { useEffect, useState } from 'react';
import { clientFetch } from './analytics-api';

/** Mirrors FailureFacts in apps/api/src/modules/insights/failure-facts.ts. */
export interface FailureFacts {
  exceptions: number;
  failedRequests: number;
  networkErrors: number;
  serverErrors: number;
  totalRequests: number;
  failedActions: number;
  affectedUsers: number;
  topError: { type: string; message: string; count: number; users: number } | null;
  topFailedRequest: { method: string; path: string; status: number; count: number } | null;
  topFailedAction: { name: string; count: number; users: number } | null;
  firstAt: string | null;
  lastAt: string | null;
  /** The last request that got no response. Older API versions omit it. */
  lastNetworkErrorAt?: string | null;
  /** First answered request after `lastNetworkErrorAt`: the backend is reachable again. */
  recoveredAt?: string | null;
}

export type HealthStatus = 'operational' | 'degraded' | 'outage' | 'idle';

export interface ProjectHealth {
  project: { id: string; name: string } | null;
  status: HealthStatus;
  summary: string;
  windowMinutes: number;
  failures: FailureFacts;
  checkedAt: string;
}

const POLL_MS = 60_000;

/**
 * Project health from recent data, polled once a minute. Null until the first answer
 * (and when the API can't be reached), so callers never claim "operational" on no data.
 */
export function useProjectHealth(projectId?: string | null): ProjectHealth | null {
  const [health, setHealth] = useState<ProjectHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHealth(null);

    async function load() {
      const params = new URLSearchParams({ minutes: '60' });
      if (projectId) params.set('projectId', projectId);
      const { data } = await clientFetch<ProjectHealth>(`/v1/dashboard/insights/health?${params.toString()}`, { cache: 'no-store' });
      if (!cancelled && data) setHealth(data);
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  return health;
}

/** Where to look next: Logs filtered to errors. */
export function healthLogsHref(projectId?: string | null): string {
  const params = new URLSearchParams({ status: 'error' });
  if (projectId) params.set('projectId', projectId);
  return `/dashboard/logs?${params.toString()}`;
}
