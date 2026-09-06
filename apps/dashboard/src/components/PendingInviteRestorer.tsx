'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { peekPendingInvite } from '@/lib/pending-invite';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

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
      toast.error('Authentication is not configured. Sign in again after the dashboard configuration is fixed.', {
        title: 'Invite sign-in unavailable'
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const {
          data: { session },
          error
        } = await supabase!.auth.getSession();
        if (cancelled) return;
        if (error) {
          toast.error(await readApiError(error, 'Could not restore your invitation session. Please sign in again.'), {
            title: 'Invite session failed'
          });
          return;
        }
        if (session?.access_token) {
          router.replace(`/invite/${encodeURIComponent(token)}`);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(await readApiError(error, 'Could not restore your invitation session. Please sign in again.'), {
            title: 'Invite session failed'
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
