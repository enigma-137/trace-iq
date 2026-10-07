'use client';

import React, { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import AnalyticsUpIcon from '@hugeicons/core-free-icons/AnalyticsUpIcon';
import DashboardSquare01Icon from '@hugeicons/core-free-icons/DashboardSquare01Icon';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import FunnelIcon from '@hugeicons/core-free-icons/FunnelIcon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import FilterIcon from '@hugeicons/core-free-icons/FilterIcon';

type TabKey = 'analytics' | 'dashboards' | 'events';

interface TabConfig {
  key: TabKey;
  label: string;
  sublabel: string;
  icon: typeof AnalyticsUpIcon;
}

const TABS: TabConfig[] = [
  {
    key: 'analytics',
    label: 'Analytics',
    sublabel: 'Traffic, journeys & retention',
    icon: AnalyticsUpIcon,
  },
  {
    key: 'dashboards',
    label: 'Dashboards',
    sublabel: 'Customizable metric views',
    icon: DashboardSquare01Icon,
  },
  {
    key: 'events',
    label: 'Events',
    sublabel: 'Real-time telemetry stream',
    icon: Activity01Icon,
  },
];

export function LandingProductOverview() {
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');

  return (
    <section
      className="traceiq-frame mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32"
      id="product"
    >
      {/* 1) Header Area */}
      <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
        <div className="section-kicker mb-3">01 / Inside TraceIQ</div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Everything you need<br />
          <em className="italic font-serif font-normal text-zinc-400">to stay in control.</em>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-400">
          TraceIQ helps teams understand product usage, monitor events, and review dashboards from one clean, self-hostable interface.
        </p>
      </div>

      {/* 2) Clean Tab / Button Row */}
      <div className="relative mb-6 sm:mb-8">
        <div
          role="tablist"
          aria-label="Product overview sections"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                id={`overview-tab-${tab.key}`}
                aria-selected={isActive}
                aria-controls={`overview-panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`group flex items-center justify-between rounded-xl border p-3.5 sm:p-4 transition-all duration-200 text-left outline-none select-none ${isActive
                    ? 'border-white/30 bg-white/[0.06] text-white shadow-sm'
                    : 'border-white/10 bg-[#0c0d0e]/60 text-zinc-400 hover:border-white/20 hover:bg-white/[0.02] hover:text-zinc-200'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${isActive
                        ? 'border-white/25 bg-white/10 text-white'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 group-hover:text-zinc-200 group-hover:border-white/20'
                      }`}
                  >
                    <HugeiconsIcon icon={tab.icon} size={18} />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold tracking-tight text-white">
                      {tab.label}
                    </span>
                    <span className="block text-xs text-zinc-400 font-normal">
                      {tab.sublabel}
                    </span>
                  </div>
                </div>

                <div
                  className={`h-2 w-2 rounded-full transition-all ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-transparent'
                    }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 3) Preview Panel: Large product preview card */}
      <div
        id={`overview-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`overview-tab-${activeTab}`}
        className="overflow-hidden rounded-2xl border border-white/10 bg-[#09090b] shadow-2xl transition-all"
      >
        {/* App Topbar / Window Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0e11] px-4 sm:px-6 py-3">
          {/* Project & Workspace Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]/80" />
            </div>
            <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="font-semibold text-zinc-200">traceiq</span>
              <span className="text-zinc-500">/</span>
              <span className="rounded bg-white/[0.05] px-2 py-0.5 text-zinc-300 border border-white/5">
                production-app
              </span>
            </div>
          </div>

          {/* Right Status Indicator */}
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline text-zinc-300">Live sync</span>
            </div>
            <span className="text-zinc-600 hidden sm:inline">·</span>
            <span className="text-zinc-500 hidden md:inline">EU Central</span>
          </div>
        </div>

        {/* Inner App Container with Mini Sidebar + Main View */}
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] min-h-[480px]">
          {/* Mini Sidebar */}
          <div className="hidden md:flex flex-col justify-between border-r border-white/5 bg-[#0b0c0e] p-3 text-xs">
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Core Telemetry
              </div>
              {[
                { key: 'analytics', label: 'Analytics', icon: AnalyticsUpIcon },
                { key: 'dashboards', label: 'Dashboards', icon: DashboardSquare01Icon },
                { key: 'events', label: 'Events', icon: Activity01Icon },
              ].map((item) => {
                const isItemActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key as TabKey)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium transition-all ${isItemActive
                        ? 'bg-white/[0.08] text-white shadow-sm font-semibold'
                        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                      }`}
                  >
                    <HugeiconsIcon icon={item.icon} size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="pt-3 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Observability
              </div>
              <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-500 hover:text-zinc-400 transition cursor-default">
                <HugeiconsIcon icon={FunnelIcon} size={15} />
                <span>Funnels</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-500 hover:text-zinc-400 transition cursor-default">
                <HugeiconsIcon icon={UserGroupIcon} size={15} />
                <span>Users</span>
              </div>
            </div>

            <div className="border-t border-white/5 pt-2">
              <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-500">
                <HugeiconsIcon icon={Settings02Icon} size={15} />
                <span>Project Settings</span>
              </div>
            </div>
          </div>

          {/* Dynamic Main Preview Content */}
          <div className="p-4 sm:p-6 lg:p-7 overflow-x-hidden">
            {activeTab === 'analytics' && <AnalyticsMockView />}
            {activeTab === 'dashboards' && <DashboardsMockView />}
            {activeTab === 'events' && <EventsMockView />}
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// TAB 1: ANALYTICS MOCK VIEW
// -----------------------------------------------------------------------------
function AnalyticsMockView() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Traffic &amp; Conversion Analytics
          </h3>
          <p className="text-xs text-zinc-400 font-normal">
            Real session behavior, unique visitors, and active retention cohorts
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-zinc-300">
            Last 30 days
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-zinc-300 hidden sm:inline">
            All Channels
          </span>
        </div>
      </div>

      {/* 3 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            Monthly Active Users
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">128,490</span>
            <span className="text-xs font-mono font-medium text-emerald-400">+14.2%</span>
          </div>
          <span className="mt-1 block text-[11px] text-zinc-500">vs. 112,500 previous period</span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            Total Ingested Events
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">48.2M</span>
            <span className="text-xs font-mono font-medium text-emerald-400">99.99%</span>
          </div>
          <span className="mt-1 block text-[11px] text-zinc-500">Zero dropped payloads</span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            Avg Conversion Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">3.82%</span>
            <span className="text-xs font-mono font-medium text-emerald-400">+0.4%</span>
          </div>
          <span className="mt-1 block text-[11px] text-zinc-500">Visit to paid customer</span>
        </div>
      </div>

      {/* Clean SVG Trend Chart */}
      <div className="rounded-xl border border-white/5 bg-white/[0.015] p-3 sm:p-5">
        {/* Chart Header */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="font-mono text-xs font-medium tracking-tight text-zinc-300">
            Daily Active Users &amp; Sessions
          </span>

          <div className="flex items-center gap-3 font-mono text-[10px] sm:text-xs">
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-zinc-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 sm:h-2 sm:w-2" />
              Visitors
            </span>

            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-zinc-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600 sm:h-2 sm:w-2" />
              Previous 30d
            </span>
          </div>
        </div>

        {/* Minimalist Line SVG */}
        <div className="relative h-36 w-full sm:h-44">
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 700 160"
            preserveAspectRatio="none"
          >
            {/* Horizontal Gridlines */}
            <line
              x1="0"
              y1="20"
              x2="700"
              y2="20"
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
            />
            <line
              x1="0"
              y1="70"
              x2="700"
              y2="70"
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
            />
            <line
              x1="0"
              y1="120"
              x2="700"
              y2="120"
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
            />

            {/* Gradient fill for active trend */}
            <defs>
              <linearGradient
                id="analyticsGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Previous period line */}
            <path
              d="M0,130 Q120,110 240,118 T480,95 T700,85"
              fill="none"
              stroke="#52525b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* Active period area */}
            <path
              d="M0,120 Q100,105 200,80 T400,60 T600,35 L700,28 L700,160 L0,160 Z"
              fill="url(#analyticsGradient)"
            />

            {/* Active period stroke */}
            <path
              d="M0,120 Q100,105 200,80 T400,60 T600,35 L700,28"
              fill="none"
              stroke="#34d399"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* Active Data Point */}
            <circle cx="700" cy="28" r="4" fill="#34d399" />
            <circle cx="700" cy="28" r="8" fill="#34d399" opacity="0.3" />
          </svg>
        </div>

        {/* X Axis Labels */}
        <div className="flex justify-between border-t border-white/5 pt-2 font-mono text-[9px] text-zinc-500 sm:text-[10px]">
          <span>Day 1</span>
          <span>Day 8</span>
          <span>Day 15</span>
          <span>Day 22</span>
          <span>Day 30</span>
        </div>
      </div>

      {/* Bottom Breakdown List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
        <div className="rounded-xl border border-white/5 bg-white/[0.015] p-3.5">
          <span className="font-mono text-zinc-400 text-[11px]">Top Traffic Sources</span>
          <div className="mt-2 space-y-2">
            {[
              { source: 'Direct / SDK Ingest', pct: '42%', value: '54.2k' },
              { source: 'Google Organic', pct: '31%', value: '39.8k' },
              { source: 'GitHub Repositories', pct: '18%', value: '23.1k' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">{item.source}</span>
                <span className="font-mono font-medium">{item.pct} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.015] p-3.5">
          <span className="font-mono text-zinc-400 text-[11px]">Top Converting Goals</span>
          <div className="mt-2 space-y-2">
            {[
              { goal: 'Account Registration', rate: '28.4%', count: '4,210' },
              { goal: 'Project Created', rate: '19.1%', count: '2,830' },
              { goal: 'API Key Activated', rate: '14.6%', count: '2,160' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">{item.goal}</span>
                <span className="font-mono text-emerald-400 font-medium">{item.rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// TAB 2: DASHBOARDS MOCK VIEW
// -----------------------------------------------------------------------------
function DashboardsMockView() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Product Growth &amp; Funnel Health
            </h3>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
              Default
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-normal">
            Custom composite cards connected to your live database
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-zinc-400">
            3 pinned cards
          </span>
        </div>
      </div>

      {/* Grid of Dashboard Widget Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Widget 1: Onboarding Funnel */}
        <div className="lg:col-span-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-zinc-300 font-semibold uppercase tracking-wider">
                Full Lifecycle Funnel
              </span>
              <span className="text-xs font-mono text-emerald-400 font-medium">18.2% total conversion</span>
            </div>

            <div className="space-y-3 mt-4">
              {[
                { name: '1. Landing Page Visit', count: '42,000', rate: '100%', width: '100%' },
                { name: '2. User Registration', count: '30,408', rate: '72.4%', width: '72.4%' },
                { name: '3. First Telemetry Sent', count: '22,722', rate: '54.1%', width: '54.1%' },
                { name: '4. Paid Subscription', count: '7,644', rate: '18.2%', width: '18.2%' },
              ].map((step, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-300 font-medium">{step.name}</span>
                    <span className="font-mono text-zinc-400">{step.count} ({step.rate})</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{ width: step.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>Calculated over 30d window</span>
            <span className="text-zinc-400">Step avg drop-off: 16.4%</span>
          </div>
        </div>

        {/* Widget 2: API & Health KPI */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono text-zinc-300 font-semibold uppercase tracking-wider">
              API &amp; System Health
            </span>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-white/5 bg-black/30 p-3">
                <span className="text-[11px] font-mono text-zinc-500">P95 Ingest Latency</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-bold font-mono text-white">38ms</span>
                  <span className="text-[11px] font-mono text-emerald-400">Optimal</span>
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-black/30 p-3">
                <span className="text-[11px] font-mono text-zinc-500">Ingestion Error Rate</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-bold font-mono text-white">0.02%</span>
                  <span className="text-[11px] font-mono text-emerald-400">Normal</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
            <span>Uptime: 99.99%</span>
            <span className="text-emerald-400">● All systems healthy</span>
          </div>
        </div>
      </div>

      {/* Feature flags and experiments row */}
      <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
        <div className="flex items-center justify-between mb-3 text-xs font-mono">
          <span className="text-zinc-300 font-semibold">Active Rollouts &amp; Flags</span>
          <span className="text-zinc-500">Deterministic targeting</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 flex items-center justify-between">
            <div>
              <span className="block font-mono text-white">checkout_v2</span>
              <span className="text-[11px] text-zinc-400">50% Rollout</span>
            </div>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
              Active
            </span>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/20 p-3 flex items-center justify-between">
            <div>
              <span className="block font-mono text-white">session_replay</span>
              <span className="text-[11px] text-zinc-400">Target: Enterprise</span>
            </div>
            <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] text-blue-400 border border-blue-500/20">
              Targeted
            </span>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/20 p-3 flex items-center justify-between">
            <div>
              <span className="block font-mono text-white">dark_mode_v2</span>
              <span className="text-[11px] text-zinc-400">100% General</span>
            </div>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// TAB 3: EVENTS MOCK VIEW
// -----------------------------------------------------------------------------
function EventsMockView() {
  const events = [
    {
      name: 'user_signed_up',
      userId: 'usr_9841',
      props: 'plan: "pro", source: "landing_page"',
      time: 'Just now',
      status: '200 OK',
    },
    {
      name: 'checkout_completed',
      userId: 'usr_4102',
      props: 'amount: 120.00, currency: "USD"',
      time: '3s ago',
      status: '200 OK',
    },
    {
      name: 'feature_flag_evaluated',
      userId: 'usr_7831',
      props: 'flag: "checkout_v2", value: true',
      time: '8s ago',
      status: '200 OK',
    },
    {
      name: 'dashboard_exported',
      userId: 'usr_1204',
      props: 'format: "json", rows: 1420',
      time: '16s ago',
      status: '200 OK',
    },
    {
      name: 'api_request_captured',
      userId: 'srv_ingest',
      props: 'route: "/v1/events", latency: 24ms',
      time: '29s ago',
      status: '200 OK',
    },
    {
      name: 'web_vital_measured',
      userId: 'usr_6639',
      props: 'metric: "LCP", value: 1.1s',
      time: '42s ago',
      status: '200 OK',
    },
  ];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header Bar with Search & Live Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Live Ingestion Stream
            </h3>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              520 events/sec
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-normal">
            Inspect real payloads, user identifiers, and property schemas in real time
          </p>
        </div>

        {/* Filter / Search input mock */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-400">
            <HugeiconsIcon icon={Search01Icon} size={13} className="text-zinc-500" />
            <span className="text-zinc-500 select-none">Filter by event name...</span>
          </div>
        </div>
      </div>

      {/* Event Stream Table */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.01]">
        <div className="grid grid-cols-[1.5fr_1fr_2fr_1fr] gap-4 border-b border-white/5 bg-white/[0.02] px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
          <span>Event</span>
          <span>User / Subject</span>
          <span className="hidden sm:inline">Properties</span>
          <span className="text-right">Time</span>
        </div>

        <div className="divide-y divide-white/5 font-mono text-xs">
          {events.map((evt, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1.5fr_1fr_2fr_1fr] items-center gap-4 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="font-semibold text-zinc-200 truncate">{evt.name}</span>
              </div>

              <span className="text-zinc-400 truncate">{evt.userId}</span>

              <span className="text-zinc-500 truncate hidden sm:inline text-[11px]">
                {evt.props}
              </span>

              <span className="text-right text-zinc-500 text-[11px]">{evt.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Status */}
      <div className="flex items-center justify-between pt-2 text-[11px] font-mono text-zinc-500">
        <span>Showing real-time stream for production</span>
        <span className="text-zinc-400">Auto-refreshing queue (0.2s polling)</span>
      </div>
    </div>
  );
}
