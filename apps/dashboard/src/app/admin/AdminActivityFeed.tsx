'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';
import type { AdminActivityItem } from '@/lib/admin';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_MS = 15_000;

/**
 * Cross-organization live event feed for the admin console. Polls
 * /v1/admin/activity and renders the newest events from every workspace.
 */
export function AdminActivityFeed() {
  const supabase = useRef(createSupabaseBrowserClient()).current;
  const [items, setItems] = useState<AdminActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      try {
        const response = await fetch(`${apiBaseUrl}/v1/admin/activity`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store'
        });
        if (!response.ok) return;
        const body = (await response.json()) as AdminActivityItem[];
        if (mounted) {
          setItems(body);
          setIsLoading(false);
        }
      } catch {
        // transient network blip; next poll retries
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="relative space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="relative rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center dark:border-slate-700 dark:bg-slate-950/60">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">No live activity</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          Events from every organization will appear here as they arrive.
        </p>
      </div>
    );
  }

  return (
    <ul className="relative divide-y divide-neutral-100 dark:divide-slate-800/80">
      {items.slice(0, 25).map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-0.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{item.eventName}</p>
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                {item.organizationName}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-slate-400">
              {item.path || `${item.projectName}${item.country ? ` · ${item.country}` : ''}`}
            </p>
          </div>
          <p className="shrink-0 text-xs font-medium tabular-nums text-neutral-600 dark:text-slate-300">{relativeTime(item.occurredAt)}</p>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}