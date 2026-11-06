'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, CircleCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import landing from '../../landing-light.module.css';
import styles from './success.module.css';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MAX_ATTEMPTS = 15;
const RETRY_MS = 2_000;

type ActivationState = 'checking' | 'active' | 'pending' | 'signed_out' | 'error';

const SUBSCRIBED = {
  eyebrow: 'Payment successful',
  title: <>Welcome to <span>TraceIQ Pro.</span></>,
  lead: 'Your payment went through and your organization is on Pro. Head to your dashboard to start using your higher limits.'
};

// "Welcome to Pro" shows once the API confirms Pro, or when we can't check
// (no session in this browser, or the request failed): the dashboard checks
// the session itself and will show the plan there. While the API still reports
// the free plan, the copy says activation is in progress instead.
const COPY: Record<ActivationState, { eyebrow: string; title: ReactNode; lead: string }> = {
  checking: {
    eyebrow: 'Payment received',
    title: <>Activating <span>TraceIQ Pro.</span></>,
    lead: 'Your payment went through. We’re switching your organization to Pro, which usually takes a few seconds.'
  },
  active: SUBSCRIBED,
  signed_out: SUBSCRIBED,
  error: SUBSCRIBED,
  pending: {
    eyebrow: 'Payment received',
    title: <>Pro is <span>almost ready.</span></>,
    lead: 'Your payment went through. Activation is taking longer than usual; your limits will update automatically within a few minutes.'
  }
};

export function SuccessHero({ projectId, checkoutId }: { projectId?: string; checkoutId?: string }) {
  const state = useProActivation(projectId);
  const copy = COPY[state];
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const dashboardHref = `/dashboard${query}`;
  const subscribed = state !== 'checking' && state !== 'pending';

  return (
    <section className={styles.poster} aria-labelledby="welcome-title">
      <div className={`${landing.frame} ${styles.posterInner}`}>
        <div className={styles.posterCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="welcome-title">{copy.title}</h1>
          <p className={styles.lead} aria-live="polite">{copy.lead}</p>
          <div className={styles.actions}>
            <a className={`${landing.button} ${styles.whiteButton}`} href={dashboardHref}>
              Go to dashboard <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className={`${landing.button} ${styles.ghostButton}`} href="/docs?page=quickstart">
              <BookOpen size={16} aria-hidden="true" /> Read the docs
            </a>
          </div>
        </div>

        <aside className={styles.receipt} aria-label="Subscription summary">
          <div className={styles.receiptHead}>
            <span>TraceIQ</span>
            <span>Receipt</span>
          </div>
          <p className={styles.stamp} aria-hidden="true">Paid</p>
          <dl>
            <div>
              <dt>Plan</dt>
              <dd>Cloud Pro</dd>
            </div>
            <div>
              <dt>Applies to</dt>
              <dd>Your active organization</dd>
            </div>
            {checkoutId ? (
              <div>
                <dt>Reference</dt>
                <dd className={styles.mono}>{checkoutId.slice(0, 24)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Pro status</dt>
              <dd>
                {subscribed ? (
                  <span className={styles.proBadge}>
                    <CircleCheck size={30} strokeWidth={2.25} aria-hidden="true" />
                    Pro
                  </span>
                ) : (
                  <span className={styles.activation} data-state={state}>
                    <span className={styles.activationMark} aria-hidden="true" />
                    Activating
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <p className={styles.receiptFoot}>Invoices and payment details live in Settings → Billing.</p>
        </aside>
      </div>
    </section>
  );
}

function useProActivation(projectId?: string): ActivationState {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<ActivationState>('checking');

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
        if (attempts >= MAX_ATTEMPTS) {
          setState('pending');
          return;
        }
        timer = setTimeout(check, RETRY_MS);
      } catch {
        if (!cancelled) setState('error');
      }
    };

    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [projectId, supabase]);

  return state;
}
