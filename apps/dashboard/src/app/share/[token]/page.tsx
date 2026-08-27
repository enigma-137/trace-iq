import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiBaseUrl } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared analytics · TraceIQ', robots: { index: false, follow: false } };

interface PublicDashboard {
  name: string;
  permissions: Array<'summary' | 'chart' | 'definition'>;
  expiresAt: string | null;
  definition?: Record<string, unknown>;
  summary?: { current: number; previous: number; days: number } | null;
  chart?: {
    event: string; interval: 'hour' | 'day' | 'week'; measure: string; property: string | null;
    breakdown: string | null; buckets: string[];
    series: Array<{ key: string; points: Array<{ bucket: string; total: number; value: number }> }>;
  };
}

export default async function SharedDashboardPage({ params }: { params: { token: string } }) {
  const response = await fetch(`${apiBaseUrl}/v1/public/dashboards/${encodeURIComponent(params.token)}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Could not load the shared dashboard.');
  const data = await response.json() as PublicDashboard;

  return <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 dark:bg-slate-950 dark:text-white">
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">TraceIQ · read-only share</p><h1 className="mt-2 text-3xl font-semibold">{data.name}</h1></div>
        {data.expiresAt ? <p className="text-xs text-neutral-500">Expires {new Date(data.expiresAt).toLocaleString()}</p> : null}
      </header>

      {data.summary ? <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Current" value={data.summary.current} /><Metric label="Previous" value={data.summary.previous} /><Metric label="Window" value={`${data.summary.days} days`} />
      </section> : null}

      {data.chart ? <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4"><p className="font-mono text-sm font-semibold">{data.chart.event}</p><p className="text-xs text-neutral-500">{data.chart.measure}{data.chart.breakdown ? ` · by ${data.chart.breakdown}` : ''}</p></div>
        <TrendChart buckets={data.chart.buckets} series={data.chart.series} interval={data.chart.interval} format={data.chart.measure === 'sum' || data.chart.measure === 'avg' ? 'compact' : 'number'} />
      </section> : null}

      {data.definition ? <details className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold">Shared view configuration</summary><pre className="mt-3 overflow-auto text-xs text-neutral-600 dark:text-slate-300">{JSON.stringify(data.definition, null, 2)}</pre></details> : null}
      <p className="mt-6 text-xs text-neutral-500">This link grants only the sections selected by its owner. It does not provide access to the TraceIQ workspace.</p>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>;
}
