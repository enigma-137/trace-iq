'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { SIGNED_IN_COOKIE } from '@/lib/signed-in';

const PROVIDER_NAMES: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab' };

/** Announces a completed GitHub/GitLab sign-in once, then clears the marker. */
export function SignedInToast() {
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SIGNED_IN_COOKIE}=([^;]*)`));
    if (!match) return;
    document.cookie = `${SIGNED_IN_COOKIE}=; path=/; max-age=0; samesite=lax`;
    const name = PROVIDER_NAMES[decodeURIComponent(match[1])];
    if (name) {
      // Part of signing in, so it keeps the auth pages' light look even though it shows on the dashboard.
      toast.success(`You're signed in with ${name}.`, { title: 'Signed in', light: true });
    }
  }, []);

  return null;
}
