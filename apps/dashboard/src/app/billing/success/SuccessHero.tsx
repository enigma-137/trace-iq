'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import landing from '../../landing-light.module.css';
import styles from './success.module.css';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MAX_ATTEMPTS = 15;
const RETRY_MS = 2_000;

type ActivationState = 'checking' | 'active' | 'pending' | 'signed_out' | 'error';

// Every visible message comes from the same verified state, so the page never
// says "Welcome to Pro" before the API confirms the organization is on Pro.
const COPY: Record<ActivationState, { eyebrow: string; title: ReactNode; lead: string; status: string }> = {
  checking: {
    eyebrow: 'Payment received',
    title: <>Activating <span>TraceIQ Pro.</span></>,
    lead: 'Your payment went through. We’re switching your organization to Pro, which usually takes a few seconds.',
    status: 'Activating'
  },
  active: {
    eyebrow: 'Payment successful',
    title: <>Welcome to <span>TraceIQ Pro.</span></>,
    lead: 'Your Pro plan is active. Your organization’s higher limits apply now.',
    status: 'Active'
  },
  pending: {
    eyebrow: 'Payment received',
    title: <>Pro is <span>almost ready.</span></>,
    lead: 'Your payment went through. Activation is taking longer than usual; your limits will update automatically within a few minutes.',
    status: 'Still activating'
  },
  signed_out: {
    eyebrow: 'Payment received',
    title: <>Thanks for <span>upgrading.</span></>,
    lead: 'Your payment went through. Sign in to see your Pro plan and its new limits.',
    status: 'Sign in to check'
  },
  error: {
    eyebrow: 'Payment received',
    title: <>Thanks for <span>upgrading.</span></>,
    lead: 'Your payment went through. We couldn’t check your plan just now; Billing settings will show when Pro is active.',
    status: 'Couldn’t check'
  }
};

export function SuccessHero({ projectId, checkoutId }: { projectId?: string; checkoutId?: string }) {
  const state = useProActivation(projectId);
  const copy = COPY[state];
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const primary = state === 'signed_out'
    ? { label: 'Sign in', href: `/auth/login?next=${encodeURIComponent(`/dashboard/settings/billing${query}`)}` }
    : state === 'error'
      ? { label: 'Open billing settings', href: `/dashboard/settings/billing${query}` }
      : { label: 'Go to dashboard', href: `/dashboard${query}` };

  return (
    <section className={styles.poster} aria-labelledby="welcome-title">
      <div className={`${landing.frame} ${styles.posterInner}`}>
        <div className={styles.posterCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="welcome-title">{copy.title}</h1>
          <p className={styles.lead} aria-live="polite">{copy.lead}</p>
          <div className={styles.actions}>
            <a className={`${landing.button} ${styles.whiteButton}`} href={primary.href}>
              {primary.label} <ArrowRight size={16} aria-hidden="true" />
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
                <span className={styles.activation} data-state={state}>
                  <span className={styles.activationMark} aria-hidden="true" />
                  {copy.status}
                </span>
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
