'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Entitlements {
  deploymentMode: 'self_hosted' | 'cloud';
  plan: 'free' | 'pro' | 'self_hosted';
  subscriptionStatus: string | null;
  limits: { events: number | null; projects: number | null; members: number | null; retentionDays: number | null; aiInsights: number | null };
  usage: { events: number; projects: number; members: number; aiInsights: number };
}

export function BillingPanel({ projectId, billingResult }: { projectId?: string; billingResult?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'monthly' | 'yearly' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, [supabase]);

  const loadEntitlements = useCallback(async () => {
    const token = await accessToken();
    if (!token) throw new Error('Your dashboard session expired. Sign in again.');
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/entitlements${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(await readError(response));
    const result = (await response.json()) as Entitlements;
    setEntitlements(result);
    return result;
  }, [accessToken, projectId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const refresh = async () => {
      try {
        const result = await loadEntitlements();
        if (cancelled) return;
        setError(null);
        setLoading(false);
        if (billingResult === 'success' && result.plan !== 'pro' && attempts < 15) {
          attempts += 1;
          timer = setTimeout(refresh, 2_000);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load billing details.');
          setLoading(false);
        }
      }
    };
    void refresh();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [billingResult, loadEntitlements]);

  async function beginCheckout(period: 'monthly' | 'yearly') {
    setBusy(period);
    setError(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingPeriod: period, projectId })
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { checkout_url?: string };
      if (!result.checkout_url) throw new Error('Bachs did not return a checkout URL.');
      window.location.assign(result.checkout_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal');
    setError(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Your dashboard session expired. Sign in again.');
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/portal${query}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { url?: string };
      if (!result.url) throw new Error('Bachs did not return a portal URL.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the billing portal.');
      setBusy(null);
    }
  }

  if (loading) return <div className="mt-6 rounded-xl border border-neutral-200 p-6 text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">Loading billing details…</div>;

  if (!entitlements) return <BillingMessage tone="error">{error ?? 'Billing details are unavailable.'}</BillingMessage>;

  if (entitlements.deploymentMode === 'self_hosted') {
    return <BillingMessage tone="success">Self-hosted TraceIQ is free and unrestricted. Billing is only used by TraceIQ Cloud.</BillingMessage>;
  }

  const pro = entitlements.plan === 'pro';
  return (
    <section className="mt-6 grid gap-5" aria-labelledby="billing-title">
      <div>
        <h2 id="billing-title" className="text-xl font-semibold text-neutral-900 dark:text-white">Plan and billing</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">Your plan applies to the active organization and all its projects.</p>
      </div>

      {billingResult === 'success' && !pro ? <BillingMessage tone="info">Payment completed. Waiting for Bachs to confirm your subscription…</BillingMessage> : null}
      {billingResult === 'success' && pro ? <BillingMessage tone="success">Your organization is now on Pro.</BillingMessage> : null}
      {billingResult === 'cancelled' ? <BillingMessage tone="info">Checkout was cancelled. Your current plan was not changed.</BillingMessage> : null}
      {error ? <BillingMessage tone="error">{error}</BillingMessage> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PlanCard
          name="Free" price="$0" description="For evaluating TraceIQ and smaller projects."
          features={['50K events/month', '1 project', '1 member', '30-day retention', '5 AI insights/month', 'Public dashboards']}
          current={!pro}
        />
        <PlanCard
          name="Pro" price="$19/month" description="For growing products and teams."
          features={['1M events/month', '10 projects', '5 members', '365-day retention', '100 AI insights/month', 'Public dashboards']}
          current={pro}
          actions={pro ? (
            <button className={secondaryButton} disabled={busy !== null} onClick={() => void openPortal()}>
              {busy === 'portal' ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Manage billing
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className={primaryButton} disabled={busy !== null} onClick={() => void beginCheckout('monthly')}>
                {busy === 'monthly' ? <Loader2 className="size-4 animate-spin" /> : null} Upgrade monthly
              </button>
              <button className={secondaryButton} disabled={busy !== null} onClick={() => void beginCheckout('yearly')}>
                {busy === 'yearly' ? <Loader2 className="size-4 animate-spin" /> : null} $190 yearly
              </button>
            </div>
          )}
        />
      </div>
    </section>
  );
}

function PlanCard({ name, price, description, features, current, actions }: { name: string; price: string; description: string; features: string[]; current: boolean; actions?: React.ReactNode }) {
  return <article className={`rounded-xl border p-5 ${current ? 'border-blue-500 ring-1 ring-blue-500' : 'border-neutral-200 dark:border-slate-800'}`}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{name}</h3><p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{price}</p></div>{current ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Current plan</span> : null}</div>
    <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400">{description}</p>
    <ul className="my-5 grid gap-2 text-sm text-neutral-700 dark:text-slate-300">{features.map((feature) => <li key={feature} className="flex items-center gap-2"><Check className="size-4 text-blue-600" />{feature}</li>)}</ul>
    {actions}
  </article>;
}

function BillingMessage({ tone, children }: { tone: 'success' | 'info' | 'error'; children: React.ReactNode }) {
  const style = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200';
  return <div className={`mt-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

async function readError(response: Response) {
  try { const body = await response.json() as { message?: string }; return body.message ?? `Request failed with ${response.status}.`; }
  catch { return `Request failed with ${response.status}.`; }
}

const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60';
const secondaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900';
