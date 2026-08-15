'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberCount?: number;
}

export interface OrganizationSummary extends OrganizationInfo {
  project: { id: string; name: string; slug: string } | null;
  projects?: Array<{ id: string; name: string; slug: string }>;
}

const ACTIVE_ORG_KEY = 'traceiq-active-org';
const ACTIVE_ORG_COOKIE = 'traceiq_active_org';

/**
 * Remembers the organization the user last switched to. Read by the sidebar /
 * mobile switcher and, via the cookie, by server pages so a fresh /dashboard
 * load lands in the same organization instead of bouncing back to the first
 * one created.
 */
export function getActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

export function setActiveOrganizationId(organizationId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (organizationId) {
      localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
      document.cookie = `${ACTIVE_ORG_COOKIE}=${encodeURIComponent(organizationId)}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY);
      document.cookie = `${ACTIVE_ORG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    // ignore
  }
}

/**
 * Loads the current user's organization from GET /v1/setup for the browser
 * session. Prefers the active project, then an explicitly requested
 * organization, then the last-switched organization, and finally the user's
 * first organization. Returns `null` while loading / when no organization
 * exists yet.
 */
export function useOrganization(projectId?: string | null, organizationId?: string | null) {
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (!supabase) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setOrganization(null);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (projectId) {
        params.set('projectId', projectId);
      } else if (organizationId) {
        params.set('organizationId', organizationId);
      } else {
        const persistedOrgId = getActiveOrganizationId();
        if (persistedOrgId) {
          params.set('organizationId', persistedOrgId);
        }
      }

      const query = params.toString();
      const response = await fetch(`${apiBaseUrl}/v1/setup${query ? `?${query}` : ''}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        setOrganization(null);
        setLoading(false);
        return;
      }

      const body = (await response.json()) as { organization: OrganizationInfo | null };
      setOrganization(body.organization);
    } catch {
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, projectId, organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { organization, loading, refresh };
}

/**
 * Lists every organization the user belongs to (with the first project of each)
 * from GET /v1/organizations, for the sidebar organization switcher.
 */
export function useOrganizations() {
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (!supabase) {
      setOrganizations([]);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setOrganizations([]);
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/v1/organizations`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        setOrganizations([]);
        setLoading(false);
        return;
      }

      const body = (await response.json()) as { organizations: OrganizationSummary[] };
      setOrganizations(body.organizations ?? []);
    } catch {
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { organizations, loading, refresh };
}

export interface CreatedProject {
  organization: { id: string; name: string; slug: string; role: string };
  project: { id: string; organizationId: string; name: string; slug: string };
  writeKey: { prefix: string; value: string };
  sdkSnippet: string;
}

/**
 * Creates an additional project inside an existing organization and returns the
 * fresh write key + SDK snippet so the caller can hand them to the user.
 */
export async function createProjectInOrganization(organizationId: string, projectName: string): Promise<CreatedProject> {
  let supabase: ReturnType<typeof createSupabaseBrowserClient>;
  try {
    supabase = createSupabaseBrowserClient();
  } catch {
    throw new Error('Dashboard session unavailable. Sign in again.');
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Your dashboard session expired. Sign in again.');
  }

  const response = await fetch(`${apiBaseUrl}/v1/dashboard/projects`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ organizationId, projectName })
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return (await response.json()) as CreatedProject;
}
