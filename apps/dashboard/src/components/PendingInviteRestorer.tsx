'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { peekPendingInvite } from '@/lib/pending-invite';

/**
 * Mounted in the root layout so it runs on every page. If a session exists and
 * an invite token was recorded on /invite/:token, the user is routed back to it
 * — regardless of where Supabase's confirmation or OAuth redirect dropped them.
 * Guards against routing loops by ignoring visits already on /invite.
 */
export function PendingInviteRestorer() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = peekPendingInvite();
    if (!token || pathname.startsWith('/invite/')) {
      return;
    }

    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    let cancelled = false;

    (async () => {
      const {
        data: { session }
      } = await supabase!.auth.getSession();
      if (!cancelled && session?.access_token) {
        router.replace(`/invite/${encodeURIComponent(token)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}