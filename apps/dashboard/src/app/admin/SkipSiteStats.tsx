'use client';

import { useEffect } from 'react';
import { SKIP_SITE_STATS_KEY } from '@/components/SitePageviewBeacon';

/** Opening /admin marks this browser as the team's, so its visits stay out of the visitor count. */
export function SkipSiteStats() {
  useEffect(() => {
    try {
      localStorage.setItem(SKIP_SITE_STATS_KEY, '1');
    } catch {
      // Storage blocked: nothing to remember.
    }
  }, []);
  return null;
}
