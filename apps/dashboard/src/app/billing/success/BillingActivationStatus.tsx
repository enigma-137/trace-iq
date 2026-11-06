'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import styles from './success.module.css';

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
    checking: 'Confirming Pro activation…',
    active: 'Pro is active',
    pending: 'Payment confirmed. Activation is still processing; you can continue to the dashboard.',
    signed_out: 'Payment confirmed. Sign in to see your organization’s plan.',
    error: 'Payment confirmed. We couldn’t refresh the plan status, but activation will continue.'
  }[state];

  return (
    <span aria-live="polite" className={styles.activation} data-state={state}>
      <span className={styles.activationMark} aria-hidden="true" />
      {content}
    </span>
  );
}
