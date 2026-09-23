'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type DashboardPlan = 'free' | 'pro' | 'self_hosted' | null;

interface PlanContextValue {
  plan: DashboardPlan;
  billingPeriod: 'monthly' | 'yearly' | null;
}

export const PlanContext = createContext<PlanContextValue>({ plan: null, billingPeriod: null });

export function useDashboardPlan() {
  return useContext(PlanContext);
}


export function DashboardPlanProvider({ projectId, children }: { projectId?: string | null; children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [value, setValue] = useState<PlanContextValue>({ plan: null, billingPeriod: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/entitlements${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      if (!response.ok || cancelled) return;
      const result = await response.json() as {
        plan?: DashboardPlan;
        subscription?: { billingPeriod?: 'monthly' | 'yearly' | null } | null;
      };
      if (!cancelled) {
        setValue({
          plan: result.plan ?? null,
          billingPeriod: result.subscription?.billingPeriod ?? null
        });
      }
    };
    void load().catch(() => {
      // Plan decoration is non-blocking; billing actions still surface their own errors.
    });
    return () => { cancelled = true; };
  }, [projectId, supabase]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function DashboardPlanBadge({ className = '' }: { className?: string }) {
  const { plan, billingPeriod } = useContext(PlanContext);
  if (!plan) return null;

  const label = plan === 'pro' ? 'Pro' : plan === 'self_hosted' ? 'Self-hosted' : 'Free';
  const title = plan === 'pro' && billingPeriod
    ? `TraceIQ Pro · ${billingPeriod} billing`
    : `TraceIQ ${label}`;
  const tone = plan === 'pro'
    ? 'border-blue-400/30 bg-blue-500/15 text-blue-600 dark:text-blue-300'
    : 'border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${tone} ${className}`}
      title={title}
      aria-label={title}
    >
      {label}
    </span>
  );
}
