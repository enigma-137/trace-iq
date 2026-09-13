import type { Metadata } from 'next';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import BookOpen02Icon from '@hugeicons/core-free-icons/BookOpen02Icon';
import HelpCircleIcon from '@hugeicons/core-free-icons/HelpCircleIcon';
import Rocket01Icon from '@hugeicons/core-free-icons/Rocket01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { PublicPage } from '@/components/PublicSiteChrome';
import { BillingActivationStatus } from './BillingActivationStatus';

export const metadata: Metadata = {
  title: 'Welcome to TraceIQ Pro',
  description: 'Your TraceIQ Pro subscription is ready. Review your benefits and finish setup.'
};

const benefits = [
  '1M events every month',
  'Up to 10 projects',
  'Up to 5 team members',
  '365-day data retention',
  '100 AI insights every month'
];

export default function BillingSuccessPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const projectId = firstParam(searchParams.projectId);
  const dashboardHref = projectId ? `/dashboard?projectId=${encodeURIComponent(projectId)}` : '/dashboard';

  return (
    <PublicPage>
      <main>
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-emerald-400/30  text-emerald-300">
              <HugeiconsIcon icon={Tick02Icon} size={28} strokeWidth={2.5} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Payment successful</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Welcome to TraceIQ Pro.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-zinc-400">
              Your payment is complete. We are confirming the subscription with Bachs and preparing your organization’s Pro limits.
            </p>
            <BillingActivationStatus projectId={projectId} />
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={dashboardHref} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-400">
                Go to dashboard <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
              </Link>
              <Link href="/docs?page=setup" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/15 px-5 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/5">
                <HugeiconsIcon icon={BookOpen02Icon} size={16} /> Read the docs
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-blue-300">Your Pro plan</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">More room to understand and grow your product</h2>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><HugeiconsIcon icon={Tick02Icon} size={14} /></span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300"><HugeiconsIcon icon={Rocket01Icon} size={20} /></div>
              <h2 className="mt-4 text-2xl font-semibold text-white">Getting started with Pro</h2>
              <ol className="mt-5 grid gap-4 text-sm leading-6 text-zinc-400">
                <li><strong className="text-zinc-100">1. Confirm your SDK setup.</strong> Check that production events are arriving in the correct project.</li>
                <li><strong className="text-zinc-100">2. Invite your team.</strong> Add up to five members and assign the right organization roles.</li>
                <li><strong className="text-zinc-100">3. Build your core views.</strong> Create funnels, retention reports, alerts, and public dashboards.</li>
                <li><strong className="text-zinc-100">4. Use AI insights.</strong> Ask TraceIQ to summarize patterns and investigate important journeys.</li>
              </ol>
            </article>
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={HelpCircleIcon} size={20} className="mt-0.5 shrink-0 text-zinc-300" />
              <div><h2 className="font-semibold text-white">Need help with setup?</h2><p className="mt-1 text-sm text-zinc-400">Email us and include the project you are configuring. We’ll help you get Pro running.</p></div>
            </div>
            <a href="mailto:traceiq.run@gmail.com?subject=TraceIQ%20Pro%20setup%20help" className="shrink-0 text-sm font-semibold text-blue-300 hover:text-blue-200">traceiq.run@gmail.com</a>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
