'use client';

import { ACTIVE_PROJECT_HEADER, readActiveProjectIdFromDocument } from '@/lib/active-project';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Tags authenticated browser calls to the TraceIQ API with the selected
 * project, so every client component follows a project switch without having
 * to thread `projectId` through by hand. Installed at module load (not in an
 * effect) so it is in place before any child component's first fetch.
 */
function installActiveProjectFetch() {
  if (typeof window === 'undefined') return;
  const w = window as typeof window & { __traceiqActiveProjectFetch?: boolean };
  if (w.__traceiqActiveProjectFetch) return;
  w.__traceiqActiveProjectFetch = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(apiBaseUrl)) return originalFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    // Only dashboard calls carry a bearer token; leave SDK/ingest traffic alone.
    if (!headers.has('authorization') || headers.has(ACTIVE_PROJECT_HEADER)) return originalFetch(input, init);

    const projectId = readActiveProjectIdFromDocument();
    if (!projectId) return originalFetch(input, init);

    headers.set(ACTIVE_PROJECT_HEADER, projectId);
    return originalFetch(input, { ...init, headers });
  };
}

installActiveProjectFetch();

export function ActiveProjectFetch() {
  return null;
}
