'use client';

import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type State = 'checking' | 'active' | 'pending' | 'signed_out' | 'error';

export function BillingActivationStatus({ projectId }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setState('signed_out');
          return;
        }
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/entitlements${query}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Entitlement check failed with ${response.status}`);
        const result = await response.json() as { plan?: string };
        if (cancelled) return;
        if (result.plan === 'pro') {
          setState('active');
          return;
        }
        attempts += 1;
        if (attempts >= 15) {
          setState('pending');
          return;
        }
        setState('checking');
        timer = setTimeout(check, 2_000);
      } catch {
        if (!cancelled) setState('error');
      }
    };

    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [projectId, supabase]);

  const content = {
    checking: <><HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /> Confirming Pro activation…</>,
    active: <><HugeiconsIcon icon={Tick02Icon} size={16} /> TraceIQ Pro is active</>,
    pending: <><HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /> Payment confirmed; activation is still processing. You can continue to the dashboard.</>,
    signed_out: <>Payment confirmed. Sign in to the dashboard to view the active organization plan.</>,
    error: <>Payment confirmed. We couldn’t refresh the plan status, but the webhook will continue processing.</>
  }[state];
  const active = state === 'active';

  return <div aria-live="polite" className={`mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm ${active ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}>{content}</div>;
}
