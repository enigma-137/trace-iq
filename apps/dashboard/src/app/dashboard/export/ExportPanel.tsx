'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExportModal } from './ExportModal';
import { useDashboardPlan } from '../DashboardPlan';
import { type DateRange } from '@traceiq/ui';

export interface ExportPanelProps {
  eventNames: string[];
  userEmail?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}

export function ExportPanel({ eventNames, userEmail, projectId, projectName }: ExportPanelProps) {
  const { plan } = useDashboardPlan();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRange, setModalRange] = useState<DateRange | undefined>(undefined);
  const [modalEvent, setModalEvent] = useState<string>('');
  const [modalFormat, setModalFormat] = useState<'csv' | 'json'>('csv');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  function openWithPreset(rangeDays: number, format: 'csv' | 'json' = 'csv', specificEvent = '') {
    const d = new Date();
    const to = toDateInput(d);
    d.setDate(d.getDate() - rangeDays);
    const from = toDateInput(d);

    setModalRange({ from, to });
    setModalEvent(specificEvent);
    setModalFormat(format);
    setModalOpen(true);
  }

  function handleOpenDefault() {
    setModalRange(undefined);
    setModalEvent('');
    setModalFormat('csv');
    setModalOpen(true);
  }

  const curlExample = `curl -X GET "https://api.traceiq.run/v1/dashboard/export/events?from=${toDateInput(
    new Date(Date.now() - 7 * 86400000)
  )}&to=${toDateInput(new Date())}&limit=10000" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"`;

  function copyCurl() {
    void navigator.clipboard.writeText(curlExample);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  }

  return (
    <div className="space-y-8">
      {/* Hero Banner with Primary CTA */}
      <section className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Raw Telemetry Engine
              </span>
              {projectName ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  Project: {projectName}
                </span>
              ) : null}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
              Export Events & Analytics Data
            </h1>

            <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
              Extract raw, high-resolution product analytics events for custom reporting, Python/Pandas notebooks, or
              loading directly into PostgreSQL, ClickHouse, BigQuery, or Snowflake. Download immediate CSV/JSON datasets
              or have archives delivered directly to your inbox.
            </p>

            <div className="flex flex-wrap gap-4 pt-1 text-xs text-neutral-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Instant CSV & JSON
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Up to 50,000 events / batch
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Pro Inbox Delivery
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={handleOpenDefault}
              className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg bg-neutral-900 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export now
            </button>

            <button
              type="button"
              onClick={() => openWithPreset(7, 'csv')}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Quick 7-Day CSV
            </button>
          </div>
        </div>
      </section>

      {/* Quick Export Presets */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Quick Export Presets</h2>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              One-click standard time windows and format configurations.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PresetCard
            title="Last 24 Hours"
            subtitle="Today's live event stream"
            badge="CSV"
            description="Quick check of today's user activity, conversion triggers, and immediate anomaly debugging."
            onClick={() => openWithPreset(1, 'csv')}
          />

          <PresetCard
            title="Past 7 Days"
            subtitle="Weekly activity report"
            badge="CSV"
            description="Ideal for weekly KPI syncs, cohort tracking, and weekly performance reviews."
            onClick={() => openWithPreset(7, 'csv')}
          />

          <PresetCard
            title="Past 30 Days"
            subtitle="Monthly retention snapshot"
            badge="CSV"
            description="Comprehensive monthly volume for spreadsheet analytics, financial modeling, and churn analysis."
            onClick={() => openWithPreset(30, 'csv')}
          />

          <PresetCard
            title="Full JSON Dump"
            subtitle="Full fidelity tree export"
            badge="JSON"
            badgeTone="blue"
            description="Unflattened telemetry with full property objects, user identities, and device network metadata."
            onClick={() => openWithPreset(30, 'json')}
          />
        </div>
      </div>

      {/* Format Comparison Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100 text-xs font-bold text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
                CSV
              </span>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Spreadsheet & BI Ready</h3>
            </div>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-400">
              .csv
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400">
            Top-level system fields are flattened into dedicated columns. Custom event payload properties are stored in a
            dedicated <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-slate-800 dark:text-slate-200">properties</code> JSON column.
          </p>

          <div className="mt-4 rounded-lg bg-neutral-50 p-3 font-mono text-[11px] text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-neutral-400 dark:text-slate-500">// Flattened header columns:</div>
            <div className="mt-1 text-xs font-semibold text-neutral-900 dark:text-slate-100">
              id, occurredAt, eventName, distinctId, userId, country, city, os, browser, properties
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400">
            <span>Best for: Excel, Google Sheets, Pandas, Tableau</span>
            <button
              type="button"
              onClick={() => openWithPreset(7, 'csv')}
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Export CSV →
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                JSON
              </span>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Full-Fidelity Schema</h3>
            </div>
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              .json
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400">
            Export preserves every nested object, arrays, and type metadata without truncation or string coercion. Ideal
            for automated data ingestion and custom analysis scripts.
          </p>

          <div className="mt-4 rounded-lg bg-neutral-50 p-3 font-mono text-[11px] text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-neutral-400 dark:text-slate-500">// Formatted array payload:</div>
            <div className="mt-1 text-xs font-semibold text-neutral-900 dark:text-slate-100">
              [ &#123; "id": "evt_...", "eventName": "...", "properties": &#123; ... &#125; &#125; ]
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400">
            <span>Best for: ETL pipelines, ClickHouse, BigQuery, AI models</span>
            <button
              type="button"
              onClick={() => openWithPreset(7, 'json')}
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Export JSON →
            </button>
          </div>
        </div>
      </div>

      {/* Automated Programmatic API & Pro Delivery Banner */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Developer API snippet */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 lg:col-span-2">
          <div className="flex items-center justify-between pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Programmatic API Export</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Automate raw data ingestion into your warehouse with scheduled cron jobs.
              </p>
            </div>
            <button
              type="button"
              onClick={copyCurl}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              {copiedSnippet ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy cURL
                </>
              )}
            </button>
          </div>

          <div className="relative mt-2 overflow-x-auto rounded-lg bg-neutral-950 p-4 text-xs font-mono text-neutral-200 dark:bg-slate-900">
            <pre>{curlExample}</pre>
          </div>
        </div>

        {/* Pro Plan Feature Card */}
        <div className="flex flex-col justify-between rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/40 p-6 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-slate-950">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">TraceIQ Pro Delivery</h3>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-300">
              Deliver automated exports straight to team emails without waiting for browser downloads. Includes 365-day
              event retention and unlimited exports.
            </p>
          </div>

          <div className="mt-5 pt-3 border-t border-blue-100 dark:border-blue-900/40">
            {plan === 'pro' || plan === 'self_hosted' ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Pro email exports active on your plan
              </div>
            ) : (
              <Link
                href="/dashboard/settings/billing"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700 shadow-xs"
              >
                Upgrade to Pro
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* The Export Modal Dialog */}
      <ExportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eventNames={eventNames}
        userEmail={userEmail}
        projectId={projectId}
        initialRange={modalRange}
        initialEvent={modalEvent}
        initialFormat={modalFormat}
      />
    </div>
  );
}

function PresetCard({
  title,
  subtitle,
  badge,
  badgeTone = 'neutral',
  description,
  onClick
}: {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone?: 'neutral' | 'blue';
  description: string;
  onClick: () => void;
}) {
  return (
    <div className="group flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-neutral-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
              {title}
            </h3>
            <p className="text-[11px] text-neutral-400 dark:text-slate-500">{subtitle}</p>
          </div>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              badgeTone === 'blue'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {badge}
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400">{description}</p>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400 transition"
      >
        Configure & Export
        <svg className="h-3.5 w-3.5 transform group-hover:translate-x-0.5 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
