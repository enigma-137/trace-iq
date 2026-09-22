'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import Rocket01Icon from '@hugeicons/core-free-icons/Rocket01Icon';
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon';
import HelpCircleIcon from '@hugeicons/core-free-icons/HelpCircleIcon';

interface FeatureComparisonItem {
  name: string;
  community: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

interface FeatureCategory {
  category: string;
  items: FeatureComparisonItem[];
}

const COMPARISON_DATA: FeatureCategory[] = [
  {
    category: 'Product & Behavior Analytics',
    items: [
      { name: 'Monthly Event Ingestion', community: 'Unlimited (Self-hosted)', pro: '250,000 included', enterprise: 'Millions+ (Custom)' },
      { name: 'User Identification & Stitching', community: true, pro: true, enterprise: true },
      { name: 'Funnels & Drop-Off Analysis', community: true, pro: true, enterprise: true },
      { name: 'Retention Curves & Cohort Matrices', community: true, pro: true, enterprise: true },
      { name: 'Live Real-Time Activity & Geography', community: true, pro: true, enterprise: true },
      { name: 'Public Dashboard Sharing', community: true, pro: true, enterprise: true },
    ]
  },
  {
    category: 'AI & Intelligence Foundation',
    items: [
      { name: 'AI-Powered Funnel Drop-Off Explanations', community: 'BYO API Key', pro: true, enterprise: true },
      { name: "Today's Story Automated Narrative Digest", community: 'BYO API Key', pro: true, enterprise: true },
      { name: 'Sensitive Data Sanitization & PII Redaction', community: true, pro: true, enterprise: true },
      { name: 'Custom Gateway Routing & Enterprise SLA', community: false, pro: false, enterprise: true },
    ]
  },
  {
    category: 'Session Replay & Diagnostics',
    items: [
      { name: 'DOM Session Recording & Playback', community: true, pro: '10,000 sessions/mo', enterprise: 'Unlimited (Custom)' },
      { name: 'Console Errors & Network Traces', community: true, pro: true, enterprise: true },
      { name: 'Canvas & Mobile Session Replay', community: true, pro: true, enterprise: true },
      { name: 'Privacy Masking (Inputs & Sensitive Text)', community: true, pro: true, enterprise: true },
    ]
  },
  {
    category: 'Feature Flags & Experimentation',
    items: [
      { name: 'Boolean & Multivariate Flags', community: true, pro: true, enterprise: true },
      { name: 'Percentage Rollouts & User Targeting', community: true, pro: true, enterprise: true },
      { name: 'Custom Dynamic Payloads', community: true, pro: true, enterprise: true },
    ]
  },
  {
    category: 'Infrastructure, Security & Support',
    items: [
      { name: 'Hosting & Maintenance', community: 'Self-managed', pro: 'Fully Managed Cloud', enterprise: 'Dedicated Cluster / VPC' },
      { name: 'Data Retention', community: 'Configurable by you', pro: '1 Year Full History', enterprise: 'Multi-year / Unlimited' },
      { name: 'Automated Upgrades & Daily Backups', community: 'Manual', pro: true, enterprise: true },
      { name: 'Team Members & Roles', community: 'Unlimited', pro: 'Unlimited', enterprise: 'Unlimited + SAML SSO' },
      { name: 'Support Channel', community: 'Community Discord & GitHub', pro: 'Standard Email & In-App', enterprise: 'Dedicated Slack Channel & SLA' },
    ]
  }
];

const FAQS = [
  {
    question: 'How do event limits work on Cloud Pro?',
    answer:
      'Cloud Pro includes 250,000 events and 10,000 session replays each month. If your traffic spikes, we never drop events; we alert you immediately and bill transparently at $0.0001 per extra event or help you scale to an Enterprise plan.'
  },
  {
    question: 'Can I switch between self-hosted and TraceIQ Cloud?',
    answer:
      'Yes. TraceIQ uses open schema conventions and standard SDKs. You can migrate your events and configurations between your self-hosted instance and our cloud platform at any time.'
  },
  {
    question: 'How does the annual discount work?',
    answer:
      'When you choose annual billing, you pay $190/year instead of $228/year—giving you two months completely free (an effective rate of $15.83/month).'
  },
  {
    question: 'What AI capabilities are included in Cloud Pro?',
    answer:
      'Cloud Pro includes integrated AI analytics powered by our Cencori AI Gateway. This automatically identifies funnel bottlenecks, writes daily narrative executive summaries (Today’s Story), and sanitizes all data to guarantee zero PII or sensitive keys leave your environment.'
  },
  {
    question: 'Is there a free trial for TraceIQ Cloud Pro?',
    answer:
      'Yes, you can try Cloud Pro free for 14 days with full access to all features, AI analysis, and session replays. No credit card is required to explore.'
  },
  {
    question: 'Do you offer custom contracts or dedicated instances?',
    answer:
      'Yes. For high-volume teams requiring dedicated compute, custom retention windows, SAML SSO, BAA/DPA agreements, or custom SLAs, our Enterprise tier provides tailored infrastructure.'
  }
];

export function PricingClientView() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const isYearly = billingPeriod === 'yearly';

  return (
    <main className="bg-[#070709] text-zinc-100">
      {/* Hero Header */}
      <section className="mx-auto max-w-4xl px-5 pb-12 pt-20 text-center sm:px-8 sm:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400">
          <HugeiconsIcon icon={Rocket01Icon} size={14} />
          <span>Simple, Transparent Pricing</span>
        </div>

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Everything you need to understand <br />
          <span className="text-zinc-400">
            every user journey.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Start for free on self-hosted infrastructure, or let us manage uptime, automatic backups, and AI-powered behavior intelligence on TraceIQ Cloud.
        </p>

        {/* Monthly / Yearly Billing Toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className={`text-xs font-semibold transition ${!isYearly ? 'text-white' : 'text-zinc-500'}`}>
            Monthly Billing
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={isYearly}
            aria-label="Toggle annual billing"
            onClick={() => setBillingPeriod(isYearly ? 'monthly' : 'yearly')}
            className="relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border border-white/20 bg-zinc-800 p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span
              className={`inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${isYearly ? 'translate-x-6 bg-blue-500' : 'translate-x-0'
                }`}
            />
          </button>

          <span className={`flex items-center gap-1.5 text-xs font-semibold transition ${isYearly ? 'text-white' : 'text-zinc-500'}`}>
            <span>Annual Billing</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
              Save 2 months
            </span>
          </span>
        </div>
      </section>

      {/* 3 Main Pricing Cards */}
      <section className="mx-auto grid max-w-6xl gap-6 px-5 pb-20 sm:px-8 lg:grid-cols-3">
        {/* Tier 1: Community (Self-Hosted) */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.025] p-7 transition hover:border-white/20">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Community</h2>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
                Open Source
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Complete privacy and ownership. Run TraceIQ on your own Docker or Kubernetes infrastructure with zero limits.
            </p>

            <div className="mt-6 flex items-baseline">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="ml-2 text-xs font-medium text-zinc-500">free forever</span>
            </div>

            <div className="my-6 border-t border-white/10" />

            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Included Features</p>
            <ul className="mt-3.5 space-y-3 text-xs text-zinc-300">
              {[
                'Full web & product behavior analytics',
                'Funnels, retention curves & goal tracking',
                'Session replay with DOM playback',
                'Live user activity & interactive globe',
                'Feature flags & dynamic targeting',
                'Unlimited events on your own server',
                'PostgreSQL & Redis database foundation',
                'Community Discord & GitHub support'
              ].map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-4 border-t border-white/5">
            <Link
              href="/docs"
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-white/10"
            >
              Start Self-Hosting
            </Link>
          </div>
        </div>

        {/* Tier 2: Cloud Pro (Clean Blue Border, Pure Black Surface) */}
        <div className="relative flex flex-col justify-between rounded-2xl border-2 border-blue-500 bg-white/[0.035] p-7 shadow-lg">
          {/* Most Popular Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
            Most Popular
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">TraceIQ Cloud Pro</h2>
              <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300 border border-blue-500/30">
                Managed Cloud
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-300">
              Zero ops. Automated scaling, 99.9% uptime, managed backups, and built-in AI insights for high-growth products.
            </p>

            <div className="mt-6 flex items-baseline">
              <span className="text-4xl font-extrabold text-white">
                {isYearly ? '$190' : '$19'}
              </span>
              <span className="ml-2 text-xs font-medium text-zinc-400">
                {isYearly ? '/ year ($15.80/mo)' : '/ month'}
              </span>
            </div>

            <div className="my-6 border-t border-white/10" />

            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue-300">Everything in Community, Plus:</p>
            <ul className="mt-3.5 space-y-3 text-xs text-zinc-200">
              {[
                'Up to 250,000 monthly events included',
                '10,000 monthly session replays',
                'AI-Powered Funnel drop-off explanations',
                "Today's Story automatic AI narrative digests",
                'Unlimited team members & project seats',
                '1-year event history & automatic backups',
                'Real-time email alerts & webhook triggers',
                'Instant cloud provisioning & zero maintenance',
                'Priority email & dashboard support'
              ].map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-blue-400" />
                  <span className="font-medium text-white">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10">
            <Link
              href="/dashboard/settings/billing"
              className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500"
            >
              Upgrade to Cloud Pro
            </Link>
          </div>
        </div>

        {/* Tier 3: Enterprise */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.025] p-7 transition hover:border-white/20">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Enterprise</h2>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
                Scale & Custom
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Dedicated infrastructure, multi-year data retention, custom volume pricing, and custom SLAs for enterprise demands.
            </p>

            <div className="mt-6 flex items-baseline">
              <span className="text-4xl font-bold text-white">Custom</span>
              <span className="ml-2 text-xs font-medium text-zinc-500">volume based</span>
            </div>

            <div className="my-6 border-t border-white/10" />

            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Enterprise Highlights</p>
            <ul className="mt-3.5 space-y-3 text-xs text-zinc-300">
              {[
                'Millions+ monthly events & high-rate ingestion',
                'Custom data retention policies (multi-year)',
                'Dedicated database & Redis compute clusters',
                'Private VPC / on-prem hybrid deployment',
                'Single Sign-On (SAML / Okta / Azure AD)',
                'Custom SLA (99.99% uptime guarantee)',
                'Dedicated Slack / Telegram channel',
                'Custom security reviews & BAA / DPA contracts'
              ].map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-4 border-t border-white/5">
            <a
              href="mailto:hello@traceiq.run?subject=TraceIQ%20Enterprise%20Plan%20Inquiry"
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-white/10"
            >
              Contact Us for Enterprise
            </a>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="text-center pb-12">
          <h3 className="text-2xl font-bold text-white sm:text-3xl">Comprehensive Plan Comparison</h3>
          <p className="mt-2 text-sm text-zinc-400">Everything you get across self-hosted and cloud tiers.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.015]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                <th className="py-4 pl-6 pr-4 font-semibold">Features & Capabilities</th>
                <th className="px-4 py-4 font-semibold text-white">Community ($0)</th>
                <th className="px-4 py-4 font-semibold text-blue-400">Cloud Pro ($19/mo)</th>
                <th className="py-4 pl-4 pr-6 font-semibold text-white">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {COMPARISON_DATA.map((group) => (
                <tr key={group.category} className="contents">
                  <td colSpan={4} className="bg-white/[0.02] px-6 py-3 font-bold text-zinc-300">
                    {group.category}
                  </td>
                  {group.items.map((item) => (
                    <tr key={item.name} className="transition hover:bg-white/[0.02]">
                      <td className="py-3 pl-6 pr-4 font-medium text-zinc-300">{item.name}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {typeof item.community === 'boolean' ? (
                          item.community ? (
                            <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="text-emerald-400" />
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )
                        ) : (
                          item.community
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {typeof item.pro === 'boolean' ? (
                          item.pro ? (
                            <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="text-blue-400" />
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )
                        ) : (
                          item.pro
                        )}
                      </td>
                      <td className="py-3 pl-4 pr-6 text-zinc-300">
                        {typeof item.enterprise === 'boolean' ? (
                          item.enterprise ? (
                            <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2.5} className="text-emerald-400" />
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )
                        ) : (
                          item.enterprise
                        )}
                      </td>
                    </tr>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="mx-auto max-w-4xl px-5 pb-24 sm:px-8">
        <div className="text-center pb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
            <HugeiconsIcon icon={HelpCircleIcon} size={14} />
            <span>Got Questions?</span>
          </div>
          <h3 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Frequently Asked Questions</h3>
        </div>

        <div className="grid gap-3">
          {FAQS.map((faq, index) => {
            const isExpanded = expandedFaq === index;
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isExpanded ? null : index)}
                  className="flex w-full items-center justify-between p-4.5 text-left text-sm font-semibold text-white transition hover:bg-white/[0.02]"
                >
                  <span>{faq.question}</span>
                  <span className="ml-4 text-base text-zinc-400">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-white/5 px-4.5 pb-4.5 pt-3 text-xs leading-relaxed text-zinc-400">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="border-t border-white/10 bg-white/[0.015] py-16">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-zinc-300 border border-white/10">
            <HugeiconsIcon icon={Shield01Icon} size={22} />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
            Start tracking user intelligence today
          </h3>
          <p className="mt-2.5 text-sm text-zinc-400">
            Set up the lightweight TraceIQ SDK in under 5 minutes. No complex event schemas required.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard/settings/billing"
              className="rounded-lg bg-white px-5 py-2.5 text-xs font-bold text-black transition hover:bg-zinc-200"
            >
              Get Started with Cloud Pro
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
            >
              Read Documentation
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
