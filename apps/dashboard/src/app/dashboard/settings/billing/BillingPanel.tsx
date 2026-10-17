'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import CheckmarkBadge01Icon from '@hugeicons/core-free-icons/CheckmarkBadge01Icon';
import CrownIcon from '@hugeicons/core-free-icons/CrownIcon';
import DatabaseIcon from '@hugeicons/core-free-icons/DatabaseIcon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';
import { Notice, SettingsCard, SettingsSection, StatusPill, primaryButton, secondaryButton } from '../SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Entitlements {
  deploymentMode: 'self_hosted' | 'cloud';
  plan: 'free' | 'pro' | 'self_hosted';
  subscriptionStatus: string | null;
  subscription: {
    providerProductId: string | null;
    billingPeriod: 'monthly' | 'yearly' | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    billingChange: {
      status: 'pending' | 'failed';
      targetBillingPeriod: 'monthly' | 'yearly';
      requestedAt: string;
      effectiveAt: string | null;
      failureCode: string | null;
    } | null;
  } | null;
  limits: { events: number | null; projects: number | null; members: number | null; retentionDays: number | null; aiInsights: number | null };
  usage: { events: number; projects: number; members: number; aiInsights: number };
  overLimit: { projects: boolean; members: boolean };
}

export function BillingPanel({ projectId, billingResult }: { projectId?: string; billingResult?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'monthly' | 'yearly' | 'schedule-yearly' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
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
    setNotice(null);
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

  async function scheduleYearlyBilling() {
    setBusy('schedule-yearly');
    setError(null);
    setNotice(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/billing/upgrade-yearly`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { effectiveAt?: string | null };
      const refreshed = await loadEntitlements();
      const effectiveAt = refreshed.subscription?.billingChange?.effectiveAt ?? result.effectiveAt ?? null;
      const scheduled = refreshed.subscription?.billingChange?.status === 'pending'
        && refreshed.subscription.billingChange.targetBillingPeriod === 'yearly';
      setNotice(scheduled ? null : scheduledYearlyMessage(effectiveAt));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not schedule yearly billing.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <BillingSkeleton />;

  if (!entitlements) {
    return (
      <div className="mt-8 max-w-5xl">
        <Notice tone="error">{error ?? 'Billing details are unavailable.'}</Notice>
      </div>
    );
  }

  if (entitlements.deploymentMode === 'self_hosted') {
    return (
      <div className="mt-8 max-w-5xl">
        <SettingsCard
          icon={CheckmarkBadge01Icon}
          title="Self-hosted"
          description="Self-hosted TraceIQ is free and unrestricted. Billing is only used by TraceIQ Cloud."
        />
      </div>
    );
  }

  const pro = entitlements.plan === 'pro';
  const billingPeriod = entitlements.subscription?.billingPeriod ?? null;
  const billingChange = entitlements.subscription?.billingChange ?? null;
  const yearlyChangeScheduled = billingChange?.status === 'pending'
    && billingChange.targetBillingPeriod === 'yearly';
  const yearlyChangeFailed = billingChange?.status === 'failed'
    && billingChange.targetBillingPeriod === 'yearly';
  const hasNonterminalSubscription = ['trialing', 'active', 'past_due', 'paused']
    .includes(entitlements.subscription?.status ?? '');
  const proPrice = hasNonterminalSubscription
    ? billingPeriod === 'yearly' ? '$190/year' : billingPeriod === 'monthly' ? '$19/month' : 'Pro'
    : '$19/month';
  const eventPercent = percentage(entitlements.usage.events, entitlements.limits.events);
  const warningThreshold = eventPercent >= 100 ? 100 : eventPercent >= 90 ? 90 : eventPercent >= 70 ? 70 : null;
  const renewal = formatDate(entitlements.subscription?.currentPeriodEnd ?? null);
  const manageButton = (
    <button className={secondaryButton} type="button" disabled={busy !== null} onClick={() => void openPortal()}>
      <HugeiconsIcon icon={busy === 'portal' ? Loading03Icon : CreditCardIcon} size={15} strokeWidth={1.8} className={busy === 'portal' ? 'animate-spin' : undefined} />
      Manage plan
    </button>
  );

  return (
    <div className="mt-8 grid max-w-5xl gap-12">
      <SettingsSection
        id="plan"
        title="Plan and billing"
        description="Your plan applies to the active organization and all of its projects."
      >
        {billingResult === 'success' && !pro ? <Notice tone="info">Payment completed. Waiting for Bachs to confirm your subscription…</Notice> : null}
        {billingResult === 'success' && pro ? <Notice tone="success">Your organization is now on Pro.</Notice> : null}
        {billingResult === 'cancelled' ? <Notice tone="info">Checkout was cancelled. Your current plan was not changed.</Notice> : null}
        {notice ? <Notice tone="info">{notice}</Notice> : null}
        {yearlyChangeScheduled ? <Notice tone="info">{scheduledYearlyMessage(billingChange.effectiveAt)}</Notice> : null}
        {yearlyChangeFailed ? <Notice tone="error">The scheduled yearly billing change could not be completed. Your monthly plan remains active; retry the change or manage your billing details.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {warningThreshold ? (
          <Notice tone={warningThreshold >= 100 ? 'error' : 'warning'}>
            You have used {Math.floor(eventPercent)}% of this month’s event allowance.
            {warningThreshold >= 100
              ? ' The 5% grace buffer is active; ingestion stops at 105%. Upgrade to avoid dropped events.'
              : ' Upgrade before reaching the limit to keep ingestion uninterrupted.'}
          </Notice>
        ) : null}

        <SettingsCard
          icon={CrownIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {pro ? 'Pro' : 'Free'} plan
              {entitlements.subscription?.cancelAtPeriodEnd ? (
                <StatusPill tone="warning">Cancels {renewal ?? 'at period end'}</StatusPill>
              ) : hasNonterminalSubscription ? (
                <StatusPill tone={entitlements.subscription?.status === 'past_due' ? 'danger' : 'success'}>
                  {capitalize((entitlements.subscription?.status ?? 'active').replace('_', ' '))}
                </StatusPill>
              ) : null}
            </span>
          }
          description={
            pro || hasNonterminalSubscription
              ? `${proPrice}${billingPeriod ? `, billed ${billingPeriod}` : ''}${renewal && !entitlements.subscription?.cancelAtPeriodEnd ? ` · Renews ${renewal}` : ''}`
              : 'You are on the free plan. Upgrade for higher limits and more seats.'
          }
          actions={pro || hasNonterminalSubscription ? manageButton : null}
        />
      </SettingsSection>

      <SettingsSection id="usage" title="Usage" description="Usage and capacity for the active organization this month.">
        <SettingsCard
          footer={
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={DatabaseIcon} size={14} strokeWidth={1.8} />
              Data retention:{' '}
              <strong className="font-medium text-neutral-800 dark:text-slate-200">
                {entitlements.limits.retentionDays === null ? 'Unlimited' : `${entitlements.limits.retentionDays} days`}
              </strong>
            </span>
          }
        >
          <div className="grid gap-x-8 gap-y-6 p-5 md:grid-cols-2">
            <UsageMeter label="Events this month" value={entitlements.usage.events} limit={entitlements.limits.events} />
            <UsageMeter
              label="Ask TraceIQ investigations"
              value={entitlements.usage.aiInsights}
              limit={entitlements.limits.aiInsights}
              help="One investigation is used when Ask TraceIQ successfully analyzes a question. Internal tool calls do not consume additional investigations. Insufficient-data and failed responses do not use your allowance."
            />
            <UsageMeter label="Projects" value={entitlements.usage.projects} limit={entitlements.limits.projects} overLimit={entitlements.overLimit.projects} />
            <UsageMeter label="Team members" value={entitlements.usage.members} limit={entitlements.limits.members} overLimit={entitlements.overLimit.members} />
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection id="plans" title="Plans" description="Compare plans. Changes apply to the whole organization.">
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanCard
            name="Free" price="$0" description="For evaluating TraceIQ and smaller projects."
            features={['50K events/month', '1 project', '1 member', '30-day retention', '3 Ask TraceIQ investigations/month', 'Public dashboards']}
            current={!pro}
          />
          <PlanCard
            name="Pro" price={proPrice} secondaryPrice={!hasNonterminalSubscription ? '$190/year' : undefined}
            description={hasNonterminalSubscription && !billingPeriod ? 'Billing interval is syncing from Bachs.' : 'For growing products and teams.'}
            features={['1M events/month', '10 projects', '5 members', '365-day retention', '100 Ask TraceIQ investigations/month', 'Public dashboards']}
            current={pro}
            actions={pro ? (
              <div className={`grid gap-2 ${billingPeriod === 'monthly' ? 'sm:grid-cols-2' : ''}`}>
                {manageButton}
                {billingPeriod === 'monthly' ? (
                  <button className={primaryButton} type="button" disabled={busy !== null || yearlyChangeScheduled} onClick={() => void scheduleYearlyBilling()}>
                    {busy === 'schedule-yearly' ? <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" /> : null}
                    {yearlyChangeScheduled ? 'Yearly billing scheduled' : yearlyChangeFailed ? 'Retry yearly change' : 'Switch to yearly at renewal'}
                  </button>
                ) : null}
              </div>
            ) : hasNonterminalSubscription ? (
              manageButton
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button className={primaryButton} type="button" disabled={busy !== null} onClick={() => void beginCheckout('monthly')}>
                  {busy === 'monthly' ? <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" /> : null}
                  Upgrade monthly
                </button>
                <button className={secondaryButton} type="button" disabled={busy !== null} onClick={() => void beginCheckout('yearly')}>
                  {busy === 'yearly' ? <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" /> : null}
                  $190 yearly
                </button>
              </div>
            )}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

function UsageMeter({ label, value, limit, overLimit = false, help }: { label: string; value: number; limit: number | null; overLimit?: boolean; help?: string }) {
  const pct = percentage(value, limit);
  const danger = overLimit || pct >= 100;
  const warning = !danger && pct >= 70;
  const bar = danger ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-neutral-900 dark:bg-slate-200';
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-neutral-900 dark:text-white">{label}</span>
        <span className={`tabular-nums ${danger ? 'font-semibold text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-slate-400'}`}>
          <span className={danger ? undefined : 'font-medium text-neutral-900 dark:text-white'}>{value.toLocaleString()}</span>
          {' / '}
          {limit === null ? 'Unlimited' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {help ? <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-slate-400">{help}</p> : null}
      {overLimit ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">Excess resource is read-only until usage is within the plan limit.</p> : null}
    </div>
  );
}

function percentage(value: number, limit: number | null) {
  return limit && limit > 0 ? value / limit * 100 : 0;
}

function scheduledYearlyMessage(effectiveAt: string | null) {
  const effectiveTime = effectiveAt ? Date.parse(effectiveAt) : Number.NaN;
  if (!Number.isFinite(effectiveTime)) {
    return 'Yearly billing scheduled. Your plan will switch to yearly on your next renewal.';
  }
  const renewalDate = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  }).format(new Date(effectiveTime));
  return `Yearly billing scheduled. Your plan will switch to yearly on ${renewalDate}.`;
}

function formatDate(value: string | null) {
  const time = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(time));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function PlanCard({ name, price, secondaryPrice, description, features, current, actions }: { name: string; price: string; secondaryPrice?: string; description: string; features: string[]; current: boolean; actions?: React.ReactNode }) {
  return (
    <article
      className={`flex flex-col rounded-xl border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:bg-slate-900/40 dark:shadow-none ${
        current ? 'border-neutral-900 ring-1 ring-neutral-900 dark:border-slate-300 dark:ring-slate-300' : 'border-neutral-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{name}</h3>
        {current ? <StatusPill tone="neutral">Current plan</StatusPill> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">{price}</p>
      {secondaryPrice ? <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">or {secondaryPrice}</p> : null}
      <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400">{description}</p>
      <ul className="my-6 grid gap-2.5 border-t border-neutral-100 pt-5 text-sm text-neutral-700 dark:border-slate-800 dark:text-slate-300">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5">
            <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} className="shrink-0 text-neutral-900 dark:text-slate-200" />
            {feature}
          </li>
        ))}
      </ul>
      {actions ? <div className="mt-auto">{actions}</div> : null}
    </article>
  );
}

function BillingSkeleton() {
  return (
    <div className="mt-8 grid max-w-5xl gap-4">
      {[0, 1].map((key) => (
        <div key={key} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function readError(response: Response) {
  try { const body = await response.json() as { message?: string }; return body.message ?? `Request failed with ${response.status}.`; }
  catch { return `Request failed with ${response.status}.`; }
}
