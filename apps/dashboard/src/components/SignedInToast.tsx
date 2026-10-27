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
      toast.success(`You're signed in with ${name}.`, { title: 'Signed in' });
    }
  }, []);

  return null;
}
