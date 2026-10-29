'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';
import Cursor01Icon from '@hugeicons/core-free-icons/Cursor01Icon';
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon';
import UserMultiple02Icon from '@hugeicons/core-free-icons/UserMultiple02Icon';
import { OverviewMetricCard } from '@/components/charts/OverviewMetricCard';
import { OverviewTabbedChart } from '@/components/charts/OverviewTabbedChart';
import { LatencyTimelineCard } from '@/components/charts/LatencyTimelineCard';
import { RequestStatusCard } from '@/components/charts/RequestStatusCard';
import { DonutChart } from '@/components/charts/DonutChart';
import { TopEventsList } from '@/components/charts/TopEventsList';
import { compactNumber, formatEventName } from '@/lib/metrics';
import { formatDuration } from '@/lib/requests';
import {
  DEMO_RANGES,
  buildOverview,
  buildRequests,
  halfOverHalf,
  seededRandom,
  type DemoBreakdownRow,
  type DemoOverview as Overview
} from '@/lib/demo-data';
import { MethodBadge, StatusBadge } from '../dashboard/requests/RequestBadges';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { CountryFlag } from '@/components/icons/CountryFlag';
import { useDemo, useDemoCompany } from './DemoContext';

const cardClass =
  'relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-5';
const cardTitleClass = 'text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400';

export function DemoOverview() {
  const company = useDemoCompany();
  const { range, now } = useDemo();
  const info = DEMO_RANGES.find((option) => option.value === range)!;
  const overview = useMemo(() => buildOverview(company, range, now), [company, range, now]);
  const recent = useMemo(() => buildRequests(company, range, now).slice(0, 6), [company, range, now]);

  const label = (bucket: string) =>
    info.hourly
      ? new Date(bucket).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'UTC' })
      : new Date(bucket).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const pageviews = overview.series.map((p) => p.pageviews);
  const visitors = overview.series.map((p) => p.visitors);
  const sessions = overview.series.map((p) => p.sessions);
  const bounceDelta = halfOverHalf(overview.bounceSeries);

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 sm:space-y-6">
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <OverviewMetricCard
          icon={<HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.8} />}
          title="Pageviews"
          value={compactNumber(overview.totals.pageviews)}
          {...deltaProps(halfOverHalf(pageviews))}
          deltaSubtext={`vs first half of ${info.long}`}
          color="blue"
          sparklineData={pageviews}
        />
        <OverviewMetricCard
          icon={<HugeiconsIcon icon={UserMultiple02Icon} size={16} strokeWidth={1.8} />}
          title="Visitors"
          value={compactNumber(overview.totals.visitors)}
          {...deltaProps(halfOverHalf(visitors))}
          color="purple"
          sparklineData={visitors}
        />
        <OverviewMetricCard
          icon={<HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.8} />}
          title="Sessions"
          value={compactNumber(overview.totals.sessions)}
          {...deltaProps(halfOverHalf(sessions))}
          deltaSubtext={`avg ${Math.floor(overview.avgSessionSec / 60)}m ${overview.avgSessionSec % 60}s`}
          color="cyan"
          sparklineData={sessions}
        />
        <OverviewMetricCard
          icon={<HugeiconsIcon icon={Cursor01Icon} size={16} strokeWidth={1.8} />}
          title="Bounce rate"
          value={`${overview.bounceRate}%`}
          // A rising bounce rate is the bad direction.
          delta={`${bounceDelta > 0 ? '+' : ''}${bounceDelta}%`}
          deltaTone={bounceDelta > 0 ? 'red' : 'green'}
          deltaDirection={bounceDelta > 0 ? 'up' : 'down'}
          color="rose"
          sparklineData={overview.bounceSeries}
        />
        <OverviewMetricCard
          icon={<HugeiconsIcon icon={Clock03Icon} size={16} strokeWidth={1.8} />}
          title="P95 latency"
          value={`${overview.p95.toLocaleString()} ms`}
          delta={`Median ${overview.p50} ms`}
          deltaTone="neutral"
          deltaSubtext={`${overview.errorRate}% failed`}
          color="emerald"
          sparklineData={overview.latencySeries.map((p) => p.p90)}
        />
      </section>

      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <OverviewTabbedChart
          data={overview.series.map((p) => ({ bucket: label(p.bucket), events: p.pageviews, apiCalls: p.apiCalls, errors: p.errors }))}
          windowLabel={info.hourly ? '24-hour' : `${info.buckets}-day`}
        />
        <LiveNowPanel overview={overview} seed={company.name} />
      </section>

      <AiReferrals overview={overview} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrafficSources overview={overview} />
        <TopPages overview={overview} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LatencyTimelineCard
          data={overview.latencySeries.map((p) => ({ ...p, bucket: label(p.bucket) }))}
          currentP50={overview.p50}
          currentP90={overview.p90}
          currentP99={overview.p99}
        />
        <RequestStatusCard breakdown={overview.statusBreakdown} totalRequests={overview.totals.apiCalls} windowLabel={range} />
        <div className={cardClass}>
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/70">
            <p className={cardTitleClass}>Top events</p>
            <span className="text-[11px] text-neutral-400 dark:text-slate-500">{info.long}</span>
          </div>
          <div className="mt-3">
            <TopEventsList events={overview.topEvents} windowLabel={info.long} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={cardClass}>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Visitor locations</p>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Geographic distribution</p>
          <BarRanking
            items={overview.countries.map((country) => ({
              label: country.name,
              value: country.visitors,
              icon: <CountryFlag country={country.code} />
            }))}
            total={overview.totals.visitors}
          />
        </div>
        <div className={cardClass}>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Devices</p>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Device breakdown</p>
          <div className="mt-3">
            <DonutChart
              items={overview.devices.map((row) => ({ label: row.label, value: row.visitors }))}
              centerValue={compactNumber(overview.totals.visitors)}
              centerLabel="visitors"
            />
          </div>
          <BreakdownTable rows={overview.devices} heading="Device type" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Browsers</p>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Browser breakdown</p>
          <BreakdownTable rows={overview.browsers} heading="Browser" />
        </div>
        <div className={cardClass}>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Operating systems</p>
          <p className="text-xs text-neutral-500 dark:text-slate-400">OS breakdown</p>
          <BreakdownTable rows={overview.operatingSystems} heading="Operating system" />
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/70">
          <p className={cardTitleClass}>Latest API requests</p>
          <Link href="/demo/requests" className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Open requests explorer →
          </Link>
        </div>
        <ul className="divide-y divide-neutral-100 dark:divide-slate-800/70">
          {recent.map((request) => (
            <li key={request.id}>
              <Link
                href={`/demo/requests?request=${encodeURIComponent(request.id)}`}
                className="flex items-center gap-3 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-slate-900/60"
              >
                <MethodBadge method={request.method} />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-neutral-900 dark:text-slate-100">{request.route}</span>
                <span className="hidden text-neutral-500 dark:text-slate-400 sm:inline">{request.service ?? 'browser'}</span>
                <StatusBadge status={request.statusCode} />
                <span className="w-16 text-right font-mono tabular-nums text-neutral-700 dark:text-slate-300">{formatDuration(request.durationMs)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function deltaProps(change: number) {
  return {
    delta: `${change > 0 ? '+' : ''}${change}%`,
    deltaTone: change >= 0 ? ('green' as const) : ('red' as const),
    deltaDirection: change >= 0 ? ('up' as const) : ('down' as const)
  };
}

/** A visitor count and event feed that tick while the page is open, so the demo feels live. */
function LiveNowPanel({ overview, seed }: { overview: Overview; seed: string }) {
  const lastBucket = overview.series[overview.series.length - 1];
  const base = Math.max(3, Math.round((lastBucket?.visitors ?? 60) / 14));
  const pages = overview.pages.map((page) => page.path);
  const events = overview.topEvents.map((event) => event.eventName);
  const countries = overview.countries.map((country) => country.code);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const feed = useMemo(() => {
    const rand = seededRandom(`${seed}|live|${tick}`);
    return Array.from({ length: 6 }, (_, i) => {
      const r = seededRandom(`${seed}|live|${tick - i}`);
      return {
        key: tick - i,
        event: events[Math.floor(r() * events.length)],
        page: pages[Math.floor(r() * pages.length)],
        country: countries[Math.floor(r() * countries.length)],
        secondsAgo: i * 3 + Math.floor(rand() * 3)
      };
    });
  }, [tick, seed, events, pages, countries]);
  const online = base + Math.round(Math.sin(tick / 3) * base * 0.2) + (tick % 3);

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/70">
        <p className={cardTitleClass}>Right now</p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white" aria-live="polite">
        {online}
      </p>
      <p className="text-xs text-neutral-500 dark:text-slate-400">visitors online in the last 5 minutes</p>
      <ul className="mt-4 space-y-2">
        {feed.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-xs">
            <CountryFlag country={item.country} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-neutral-800 dark:text-slate-200">{formatEventName(item.event)}</span>
              <span className="text-neutral-400 dark:text-slate-500"> on </span>
              <span className="font-mono text-neutral-600 dark:text-slate-300">{item.page}</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-400 dark:text-slate-500">{item.secondsAgo === 0 ? 'now' : `${item.secondsAgo}s`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiReferrals({ overview }: { overview: Overview }) {
  const ai = overview.sources.filter((source) => source.kind === 'ai');
  const total = ai.reduce((sum, source) => sum + source.visitors, 0);
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div>
        <p className="text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">{total.toLocaleString()}</p>
        <p className="text-[11px] text-neutral-500 dark:text-slate-400">AI referrals</p>
      </div>
      {ai.map((source) => (
        <div key={source.name} className="flex items-center gap-2 text-xs">
          <BrandIcon label={source.name} domain={source.domain} size={18} />
          <div>
            <p className="font-semibold text-neutral-800 dark:text-slate-200">{source.name}</p>
            <p className="text-neutral-500 dark:text-slate-400">{source.visitors.toLocaleString()} visitors</p>
          </div>
        </div>
      ))}
      <p className="ml-auto hidden max-w-xs text-[11px] text-neutral-400 dark:text-slate-500 md:block">
        Visits from ChatGPT, Perplexity and Claude answers, split out from ordinary referrers.
      </p>
    </section>
  );
}

type SourceTab = 'sources' | 'referrers' | 'utm_source' | 'utm_campaign';

function TrafficSources({ overview }: { overview: Overview }) {
  const [tab, setTab] = useState<SourceTab>('sources');
  const rows: Array<{ name: string; domain?: string | null; visitors: number; views: number }> =
    tab === 'sources'
      ? overview.sources
      : tab === 'referrers'
        ? overview.referrers.map((referrer) => ({ name: referrer.domain, domain: referrer.domain, visitors: referrer.visitors, views: referrer.views }))
        : tab === 'utm_source'
          ? overview.utmSources
          : overview.utmCampaigns;
  const withIcons = tab === 'sources' || tab === 'referrers';
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.visitors, 0));
  const tabs: Array<{ value: SourceTab; label: string; count: number }> = [
    { value: 'sources', label: 'Sources', count: overview.sources.length },
    { value: 'referrers', label: 'Referrers', count: overview.referrers.length },
    { value: 'utm_source', label: 'UTM sources', count: overview.utmSources.length },
    { value: 'utm_campaign', label: 'UTM campaigns', count: overview.utmCampaigns.length }
  ];

  return (
    <div className={cardClass}>
      <p className="text-sm font-semibold text-neutral-900 dark:text-white">Traffic sources</p>
      <p className="text-xs text-neutral-500 dark:text-slate-400">Referrers and campaign data</p>
      <div className="mt-3 flex gap-4 overflow-x-auto border-b border-neutral-100 dark:border-slate-800/70" role="tablist">
        {tabs.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={`-mb-px shrink-0 border-b-2 pb-2 text-xs font-medium ${
              tab === option.value
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {option.label} <span className="text-neutral-400 dark:text-slate-500">{option.count}</span>
          </button>
        ))}
      </div>
      <table className="mt-1 w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-neutral-400 dark:text-slate-500">
            <th className="py-2 font-medium">Source</th>
            <th className="py-2 text-right font-medium">Visitors</th>
            <th className="py-2 text-right font-medium">Views</th>
            <th className="py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60">
          {rows.slice(0, 8).map((row) => {
            const share = (row.visitors / total) * 100;
            return (
              <tr key={row.name} className="relative">
                <td className="relative py-2 pr-2">
                  <span
                    className="absolute inset-y-1 left-0 -z-0 rounded bg-blue-500/10"
                    style={{ width: `${Math.max(2, share)}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative flex min-w-0 items-center gap-2 font-medium text-neutral-800 dark:text-slate-200">
                    {withIcons ? <BrandIcon label={row.name} domain={row.domain} /> : null}
                    <span className="truncate">{row.name}</span>
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-neutral-700 dark:text-slate-300">{row.visitors.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums text-neutral-500 dark:text-slate-400">{row.views.toLocaleString()}</td>
                <td className="py-2 text-right">
                  <SharePill share={share} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopPages({ overview }: { overview: Overview }) {
  const [sort, setSort] = useState<'views' | 'avgSeconds'>('views');
  const rows = [...overview.pages].sort((a, b) => b[sort] - a[sort]).slice(0, 8);
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Pages</p>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Top pages by traffic or engagement</p>
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value === 'avgSeconds' ? 'avgSeconds' : 'views')}
          className="h-7 rounded border border-neutral-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Sort pages"
        >
          <option value="views">Most viewed</option>
          <option value="avgSeconds">Longest time on page</option>
        </select>
      </div>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-neutral-400 dark:text-slate-500">
            <th className="py-2 font-medium">Path</th>
            <th className="py-2 text-right font-medium">Visitors</th>
            <th className="py-2 text-right font-medium">Views</th>
            <th className="py-2 text-right font-medium">Avg time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60">
          {rows.map((row) => (
            <tr key={row.path}>
              <td className="max-w-0 truncate py-2 pr-2 font-mono text-neutral-800 dark:text-slate-200">{row.path}</td>
              <td className="py-2 text-right tabular-nums text-neutral-700 dark:text-slate-300">{row.visitors.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-neutral-500 dark:text-slate-400">{row.views.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-neutral-500 dark:text-slate-400">
                {Math.floor(row.avgSeconds / 60) > 0 ? `${Math.floor(row.avgSeconds / 60)}m ` : ''}
                {row.avgSeconds % 60}s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarRanking({ items, total }: { items: Array<{ label: string; value: number; icon?: ReactNode }>; total: number }) {
  return (
    <ul className="mt-2 divide-y divide-neutral-100 dark:divide-slate-800/60">
      {items.slice(0, 10).map((item) => (
        <li key={item.label} className="py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-700 dark:text-slate-200">
              {item.icon}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-mono text-neutral-500 dark:text-slate-400">
              {compactNumber(item.value)} · {((item.value / Math.max(1, total)) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (item.value / Math.max(1, items[0]?.value ?? 1)) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Share of the total, highlighted like Databuddy's: top rows stand out. */
function SharePill({ share }: { share: number }) {
  const tone =
    share >= 30
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
      : share >= 10
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`inline-flex min-w-[46px] justify-center rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${tone}`}>{share.toFixed(1)}%</span>;
}

function BreakdownTable({ rows, heading }: { rows: DemoBreakdownRow[]; heading: string }) {
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.visitors, 0));
  return (
    <table className="mt-3 w-full text-xs">
      <thead>
        <tr className="text-left text-[11px] text-neutral-400 dark:text-slate-500">
          <th className="py-2 font-medium">{heading}</th>
          <th className="py-2 text-right font-medium">Visitors</th>
          <th className="py-2 text-right font-medium">Pageviews</th>
          <th className="py-2 text-right font-medium">Share</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60">
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="py-2 pr-2">
              <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-800 dark:text-slate-200">
                <BrandIcon label={row.label} />
                <span className="truncate">{row.label}</span>
              </span>
            </td>
            <td className="py-2 text-right tabular-nums text-neutral-700 dark:text-slate-300">{compactNumber(row.visitors)}</td>
            <td className="py-2 text-right tabular-nums text-neutral-500 dark:text-slate-400">{compactNumber(row.views)}</td>
            <td className="py-2 text-right">
              <SharePill share={(row.visitors / total) * 100} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
