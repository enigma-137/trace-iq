'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DashboardDialog } from '../DashboardDialog';
import { FunnelForm } from './FunnelForm';
import { SvgNodeFlowGraph, ColumnGroup, ConnectionFlow } from '@/components/charts/SvgNodeFlowGraph';

interface FunnelItem {
  id: string;
  name: string;
  stepCount: number;
  createdAt: string;
  steps?: Array<{ eventName: string }>;
}

interface FunnelsClientViewProps {
  funnels: FunnelItem[];
  eventNames: Array<{ eventName: string; total: number; actors?: number }>;
}

export function FunnelsClientView({ funnels, eventNames }: FunnelsClientViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFunnels = useMemo(() => {
    if (!searchQuery.trim()) return funnels;
    const q = searchQuery.toLowerCase().trim();
    return funnels.filter((f) => f.name.toLowerCase().includes(q));
  }, [funnels, searchQuery]);

  // Demo Signup to Purchase Funnel Pipeline Graph data
  const demoFlowColumns: ColumnGroup[] = [
    {
      id: 'entry',
      title: '1. Inbound Entry',
      subtitle: 'User Traffic Acquisition',
      nodes: [
        { id: 'en-direct', title: 'Direct Landing', description: 'Typed URL or bookmark', countBadge: '3,450', status: 'healthy', tags: ['direct'] },
        { id: 'en-seo', title: 'Organic Search', description: 'Google / Bing discovery', countBadge: '2,180', status: 'healthy', tags: ['seo'] },
        { id: 'en-ad', title: 'Ad Campaign / Referral', description: 'Paid promo links', countBadge: '940', status: 'info', tags: ['campaign'] }
      ]
    },
    {
      id: 'signup',
      title: '2. Registration Steps',
      subtitle: 'Account Creation Funnel',
      nodes: [
        { id: 'su-view', title: 'sign_up_start', description: 'Visited signup page', countBadge: '5,820', status: 'healthy', tags: ['step 1'] },
        { id: 'su-submit', title: 'sign_up_submit', description: 'Form credentials submitted', countBadge: '4,110', status: 'healthy', tags: ['step 2'] },
        { id: 'su-verify', title: 'email_verified', description: 'OTP / Magic link confirmed', countBadge: '3,780', status: 'healthy', tags: ['step 3'] }
      ]
    },
    {
      id: 'checkout',
      title: '3. Checkout Steps',
      subtitle: 'Monetization Sequence',
      nodes: [
        { id: 'ck-pricing', title: 'pricing_viewed', description: 'Inspected subscription plans', countBadge: '2,840', status: 'healthy', tags: ['step 4'] },
        { id: 'ck-payment', title: 'payment_info_entered', description: 'Added card / Stripe details', countBadge: '1,920', status: 'warning', tags: ['step 5'] },
        { id: 'ck-coupon', title: 'promo_code_applied', description: 'Discount code entered', countBadge: '680', status: 'info', tags: ['step 6'] }
      ]
    },
    {
      id: 'outcomes',
      title: '4. Final Conversion',
      subtitle: 'Revenue & Retained Users',
      nodes: [
        { id: 'out-complete', title: 'purchase_completed', description: 'Transaction processed', countBadge: '1,540', status: 'healthy', tags: ['converted'] },
        { id: 'out-active', title: 'subscription_active', description: 'Recurring billing enabled', countBadge: '1,280', status: 'healthy', tags: ['mrr'] },
        { id: 'out-drop', title: 'abandoned_checkout', description: 'Session exited before pay', countBadge: '380', status: 'critical', tags: ['drop-off'] }
      ]
    }
  ];

  const demoFlowConnections: ConnectionFlow[] = [
    { fromId: 'en-direct', toId: 'su-view', status: 'healthy' },
    { fromId: 'en-seo', toId: 'su-view', status: 'healthy' },
    { fromId: 'en-ad', toId: 'su-view', status: 'info' },

    { fromId: 'su-view', toId: 'su-submit', status: 'healthy' },
    { fromId: 'su-submit', toId: 'su-verify', status: 'healthy' },

    { fromId: 'su-verify', toId: 'ck-pricing', status: 'healthy' },
    { fromId: 'ck-pricing', toId: 'ck-payment', status: 'warning' },
    { fromId: 'ck-payment', toId: 'ck-coupon', status: 'info' },

    { fromId: 'ck-payment', toId: 'out-complete', status: 'healthy' },
    { fromId: 'ck-coupon', toId: 'out-complete', status: 'healthy' },
    { fromId: 'out-complete', toId: 'out-active', status: 'healthy' },
    { fromId: 'ck-payment', toId: 'out-drop', status: 'critical' }
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Action Header & Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Your Funnels</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Measure conversion drop-offs step-by-step in custom event sequences.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search funnels…"
              className="h-10 w-64 rounded-md border border-neutral-300 bg-white px-3.5 pl-9 text-xs text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-white"
            />
            <svg
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400 dark:text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Create Funnel Action Button */}
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Create Funnel
          </button>
        </div>
      </div>

      {/* Funnels Grid */}
      {filteredFunnels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-10 text-center dark:border-slate-800 dark:bg-slate-900/20">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-white">No funnels found</h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-slate-400">
            {searchQuery ? `No funnels matching "${searchQuery}". Try another search term.` : 'Create your first conversion funnel to measure step completion.'}
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="mt-4 flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 text-xs font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            + Create Funnel
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFunnels.map((funnel) => (
            <div
              key={funnel.id}
              className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-base font-bold text-neutral-900 dark:text-white">{funnel.name}</h3>
                  <span className="shrink-0 rounded-full border border-neutral-300/80 bg-neutral-100 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {funnel.stepCount} {funnel.stepCount === 1 ? 'step' : 'steps'}
                  </span>
                </div>

                {/* Event steps summary line */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-xs text-neutral-500 dark:text-slate-400">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 border border-neutral-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800">
                    Step 1
                  </span>
                  <span className="text-neutral-400 font-bold">→</span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 border border-neutral-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800">
                    Step {funnel.stepCount}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-slate-900">
                <span className="text-[11px] font-mono text-neutral-400 dark:text-slate-500">
                  {funnel.createdAt ? new Date(funnel.createdAt).toLocaleDateString() : 'Active'}
                </span>

                <Link
                  href={`/dashboard/funnels/${funnel.id}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-900 transition hover:underline dark:text-white"
                >
                  View Analytics
                  <span className="transition group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Creating New Funnel */}
      <DashboardDialog
        open={isCreateOpen}
        title="Create New Conversion Funnel"
        description="Specify ordered event steps to track drop-offs and user sequence conversion."
        onClose={() => setIsCreateOpen(false)}
      >
        <FunnelForm eventNames={eventNames} onSuccess={() => setIsCreateOpen(false)} />
      </DashboardDialog>

      {/* Interactive SVG Conversion Flow Graph (Bottom Section) */}
      <section className="mt-4">
        <SvgNodeFlowGraph
          title="Conversion Funnel Pipeline Architecture (Demo Flow)"
          subtitle="Live interactive simulation of a 4-stage user onboarding and payment conversion sequence"
          columns={demoFlowColumns}
          connections={demoFlowConnections}
        />
      </section>
    </div>
  );
}
