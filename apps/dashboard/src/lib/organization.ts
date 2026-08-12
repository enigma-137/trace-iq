'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/**
 * Loads the current user's organization from GET /v1/setup for the browser
 * session. Returns `null` while loading / when no organization exists yet.
 */
export function useOrganization() {
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

      const response = await fetch(`${apiBaseUrl}/v1/setup`, {
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
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { organization, loading, refresh };
}