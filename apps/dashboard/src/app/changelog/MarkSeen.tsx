'use client';

import { useEffect } from 'react';
import { markChangelogSeen } from '@/lib/changelog-seen';

/** Opening the changelog clears the dashboard's "What's new" dot. */
export function MarkSeen({ slug }: { slug?: string }) {
  useEffect(() => {
    if (slug) markChangelogSeen(slug);
  }, [slug]);
  return null;
}
