'use client';

import React, { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import WebhookIcon from '@hugeicons/core-free-icons/WebhookIcon';
import TerminalIcon from '@hugeicons/core-free-icons/TerminalIcon';
import RocketIcon from '@hugeicons/core-free-icons/Rocket01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import Notification02Icon from '@hugeicons/core-free-icons/Notification02Icon';

interface TestLog {
  id: string;
  uuid: string;
  status: number;
  event: string;
  time: string;
}

const INITIAL_LOGS: TestLog[] = [
  { id: '1', uuid: '2ad94e71-8442-44a9-9e03-a18fef21e8f7', status: 200, event: 'user_signed_up', time: '08:14:02' },
  { id: '2', uuid: '15687b89-4c08-4683-9216-e45a87cdf2a3', status: 200, event: 'checkout_completed', time: '08:13:58' },
  { id: '3', uuid: 'df216aeb-c76b-4724-b75c-6fe91f24ee90', status: 200, event: 'feature_flag_eval', time: '08:13:49' },
  { id: '4', uuid: '4327d9d6-a978-4f3c-8c7a-7b0e7bb7ece3', status: 200, event: 'workspace_created', time: '08:13:35' },
];

const SAMPLE_EVENTS = [
  'user_signed_up',
  'checkout_completed',
  'feature_flag_eval',
  'api_latency_recorded',
  'dashboard_exported',
  'retention_cohort_synced',
];

export function LandingDevExperience() {
  const [logs, setLogs] = useState<TestLog[]>(INITIAL_LOGS);
  const [selectedEvent, setSelectedEvent] = useState<string>('user_signed_up');
  const [isSending, setIsSending] = useState(false);
  const [activeWebhookIdx, setActiveWebhookIdx] = useState(0);

  // Auto-cycle webhook focus to give a subtle live pulse
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWebhookIdx((prev) => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const sendTestEvent = () => {
    setIsSending(true);
    const newUuid = `${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 6)}-44a9-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 14)}`;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const newLog: TestLog = {
      id: Math.random().toString(),
      uuid: newUuid,
      status: 200,
      event: selectedEvent,
      time: timeStr,
    };

    setTimeout(() => {
      setLogs((prev) => [newLog, ...prev.slice(0, 4)]);
      setIsSending(false);
    }, 200);
  };

  return (
    <section className="traceiq-frame mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32" id="performance">
      {/* Header */}
      <div className="max-w-2xl mb-12 sm:mb-16">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
          First-class<br />
          <em className="italic font-serif font-normal text-zinc-400">developer experience.</em>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-400">
          We are engineers building tools for engineers. Our goal is to create the analytics and telemetry platform we have always wished we had — fast, inspectable, and zero lock-in.
        </p>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
        
        {/* Card 1: Test Mode / Live Ingest Simulation */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#09090b] p-6 sm:p-8 shadow-xl">
          {/* Top Visual Panel */}
          <div className="relative rounded-xl border border-white/10 bg-[#0d0e11] p-5 sm:p-6 min-h-[260px] flex flex-col justify-between overflow-hidden">
            {/* Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Ingest
                </span>
                <select
                  aria-label="Select test event"
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-xs font-mono text-zinc-300 outline-none hover:border-white/20 transition-colors"
                >
                  {SAMPLE_EVENTS.map((evt) => (
                    <option key={evt} value={evt} className="bg-[#09090b] text-zinc-300">
                      {evt}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={sendTestEvent}
                disabled={isSending}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50"
              >
                <span>{isSending ? 'Sending...' : 'Send event'}</span>
                <HugeiconsIcon icon={RocketIcon} size={14} className="text-zinc-950" />
              </button>
            </div>

            {/* Simulated HTTP Log Stream */}
            <div className="mt-4 space-y-2 font-mono text-xs overflow-hidden">
              {logs.map((log, idx) => (
                <div
                  key={log.id}
                  className={`flex items-center gap-2 truncate transition-all duration-300 ${
                    idx === 0 ? 'text-zinc-200 bg-white/[0.04] p-1.5 rounded' : 'text-zinc-500'
                  }`}
                >
                  <span className="font-semibold text-emerald-400 flex-shrink-0">HTTP {log.status}:</span>
                  <span className="text-zinc-400 truncate">
                    &#123; &quot;id&quot;: &quot;{log.uuid}&quot;, &quot;event&quot;: &quot;{log.event}&quot; &#125;
                  </span>
                </div>
              ))}
            </div>

            {/* Subtle Gradient Shadow Bottom */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0d0e11] to-transparent" />
          </div>

          {/* Bottom Card Content */}
          <div className="mt-6 pt-2">
            <div className="flex items-center gap-2 text-zinc-300 mb-2">
              <HugeiconsIcon icon={TerminalIcon} size={18} className="text-zinc-400" />
              <h3 className="text-base font-bold text-white tracking-tight">Test mode &amp; local simulation</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed font-normal">
              Simulate events and experiment with our API and SDKs locally without polluting production metrics or billing quotas.
            </p>
            <div className="mt-4">
              <a
                href="/docs?page=quickstart"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white underline-offset-4 hover:underline transition-colors"
              >
                <span>Learn more about testing</span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Card 2: Modular Webhooks & Real-time Dispatch */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#09090b] p-6 sm:p-8 shadow-xl">
          {/* Top Visual Panel */}
          <div className="relative rounded-xl border border-white/10 bg-[#0d0e11] p-5 sm:p-6 min-h-[260px] flex flex-col justify-between overflow-hidden">
            {/* Timeline Stream */}
            <div className="space-y-3 font-mono text-xs">
              {/* Webhook 1 */}
              <div
                className={`relative rounded-lg border p-3 transition-all duration-300 ${
                  activeWebhookIdx === 0
                    ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                    : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <HugeiconsIcon icon={Tick02Icon} size={11} />
                    </span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400 font-semibold">
                      Delivered
                    </span>
                    <span className="text-[11px] text-zinc-300 font-medium truncate">user.signup</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">08:12:54</span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  to <span className="text-zinc-300">https://api.acme.com/webhooks</span> · 200 OK (38ms)
                </p>
              </div>

              {/* Webhook 2 */}
              <div
                className={`relative rounded-lg border p-3 transition-all duration-300 ${
                  activeWebhookIdx === 1
                    ? 'border-blue-500/30 bg-blue-500/[0.04]'
                    : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <HugeiconsIcon icon={Notification02Icon} size={11} />
                    </span>
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400 font-semibold">
                      Alert Triggered
                    </span>
                    <span className="text-[11px] text-zinc-300 font-medium truncate">latency.spike</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">08:12:51</span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  to <span className="text-zinc-300">Slack / #engineering-alerts</span> · threshold: &gt;100ms
                </p>
              </div>

              {/* Webhook 3 */}
              <div
                className={`relative rounded-lg border p-3 transition-all duration-300 ${
                  activeWebhookIdx === 2
                    ? 'border-purple-500/30 bg-purple-500/[0.04]'
                    : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <HugeiconsIcon icon={WebhookIcon} size={11} />
                    </span>
                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400 font-semibold">
                      Batch Export
                    </span>
                    <span className="text-[11px] text-zinc-300 font-medium truncate">s3.parquet</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">08:12:45</span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  to <span className="text-zinc-300">s3://data-warehouse/traceiq</span> · 500 records
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Card Content */}
          <div className="mt-6 pt-2">
            <div className="flex items-center gap-2 text-zinc-300 mb-2">
              <HugeiconsIcon icon={WebhookIcon} size={18} className="text-zinc-400" />
              <h3 className="text-base font-bold text-white tracking-tight">Modular webhooks &amp; pipeline</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed font-normal">
              Receive real-time notifications directly to your server whenever an event is ingested, a conversion occurs, or an error is flagged.
            </p>
            <div className="mt-4">
              <a
                href="/docs?page=webhooks"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white underline-offset-4 hover:underline transition-colors"
              >
                <span>Explore webhooks docs</span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
              </a>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
