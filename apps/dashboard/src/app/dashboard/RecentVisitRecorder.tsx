'use client';

import { useEffect } from 'react';
import { recordVisit } from '@/lib/recents';

/** Records the open section for the Overview's Recents list. Renders nothing. */
export function RecentVisitRecorder({ active }: { active: string }) {
  useEffect(() => {
    recordVisit(active);
  }, [active]);
  return null;
}
