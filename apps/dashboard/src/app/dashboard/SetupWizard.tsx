'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { readApiError } from '@/lib/api-error';

export interface SetupWizardProps {
  projectId?: string;
  projectName?: string;
  writeKey?: string;
  apiUrl?: string;
  userEmail?: string | null;
  onComplete?: () => void;
}

export interface VerificationEventData {
  verificationId: string;
  projectId: string;
  projectName?: string;
  status: 'verified';
  verifiedAt: string;
  event: {
    id: string;
    name: string;
    source?: string;
    environment?: string;
    browser?: string;
    host?: string;
    userId?: string | null;
    anonymousId?: string | null;
    properties?: Record<string, unknown>;
  };
}

interface ProductItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultSelected: boolean;
}

const PRODUCTS: ProductItem[] = [
  {
    id: 'product-analytics',
    name: 'Product Analytics',
    description: 'Track custom user actions, trends, and retention drop-offs.',
    icon: '📊',
    defaultSelected: true
  },
  {
    id: 'web-analytics',
    name: 'Web Analytics',
    description: 'Understand traffic, pageviews, and visitor acquisition.',
    icon: '🌐',
    defaultSelected: true
  },
  {
    id: 'error-tracking',
    name: 'Error Tracking',
    description: 'Capture uncaught exceptions and application failures automatically.',
    icon: '⚠️',
    defaultSelected: true
  },
  {
    id: 'feature-flags',
    name: 'Feature Flags',
    description: 'Control releases and gradual rollouts with targeting.',
    icon: '🚩',
    defaultSelected: false
  },
  {
    id: 'revenue-analytics',
    name: 'Revenue Analytics',
    description: 'Track purchases, MRR/GTV transactions, and subscriptions.',
    icon: '💳',
    defaultSelected: false
  },
  {
    id: 'user-analytics',
    name: 'User Analytics',
    description: 'Identify users, associate traits, and explore user journeys.',
    icon: '👤',
    defaultSelected: true
  },
  {
    id: 'web-vitals',
    name: 'Web Vitals',
    description: 'Monitor real-user performance metrics (LCP, FID/INP, CLS).',
    icon: '⚡',
    defaultSelected: true
  },
  {
    id: 'funnels',
    name: 'Funnels',
    description: 'Measure conversion rates and multi-step drop-offs.',
    icon: '📉',
    defaultSelected: true
  }
];

export function SetupWizard({
  projectId = 'prj_default',
  projectName = 'My Application',
  writeKey = 'tiq_live_default',
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  userEmail,
  onComplete
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    PRODUCTS.filter((p) => p.defaultSelected).map((p) => p.id)
  );
  const [selectedFramework, setSelectedFramework] = useState<'nextjs' | 'vite' | 'node' | 'html'>('nextjs');

  // Verification state
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationEventData | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isSendingProbe, setIsSendingProbe] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Start verification session and SSE stream
  const startVerification = async () => {
    if (isListening || verificationData) return;
    setIsCreatingSession(true);
    setVerificationError(null);

    try {
      const res = await fetch(`${apiUrl}/v1/setup-verifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-traceiq-write-key': writeKey
        },
        body: JSON.stringify({ projectId, writeKey, ttlSeconds: 300 })
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to create verification session'));
      }

      const data = await res.json();
      const vId = data.verificationId;
      setVerificationId(vId);
      setIsCreatingSession(false);
      setIsListening(true);

      // Open SSE EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const sse = new EventSource(`${apiUrl}/v1/setup-verifications/${vId}/events`);
      eventSourceRef.current = sse;

      sse.addEventListener('verified', (e) => {
        try {
          const payload = JSON.parse(e.data) as VerificationEventData;
          setVerificationData(payload);
          setIsListening(false);
          sse.close();
          toast.success('Connection verified! First event received.', { title: 'TraceIQ Connected' });
          setCurrentStep(5);
          onComplete?.();
        } catch {
          // ignore JSON error
        }
      });

      sse.addEventListener('expired', () => {
        setIsListening(false);
        setVerificationError('Verification session expired. Click "Try again" to start a new verification.');
        sse.close();
      });

      sse.onerror = () => {
        // SSE error or stream closed
      };
    } catch (err) {
      setIsCreatingSession(false);
      setIsListening(false);
      const msg = err instanceof Error ? err.message : 'Could not reach TraceIQ verification API.';
      setVerificationError(msg);
      toast.error(msg, { title: 'Verification Error' });
    }
  };

  // Trigger automated test probe
  const sendTestEvent = async () => {
    if (!verificationId) return;
    setIsSendingProbe(true);
    try {
      const res = await fetch(`${apiUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-traceiq-write-key': writeKey
        },
        body: JSON.stringify({
          projectId,
          writeKey,
          eventName: 'traceiq_setup_verified',
          timestamp: new Date().toISOString(),
          properties: {
            verification_id: verificationId,
            source: 'dashboard-wizard',
            environment: 'development'
          },
          context: {
            environment: 'development',
            verification_id: verificationId
          }
        })
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to ingest test event'));
      }
      toast.success('Test event dispatched through normal pipeline!', { title: 'Event sent' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send event', { title: 'Probe failed' });
    } finally {
      setIsSendingProbe(false);
    }
  };

  useEffect(() => {
    if (currentStep === 4 && !verificationData && !isListening && !isCreatingSession) {
      void startVerification();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const copyToClipboard = (text: string, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const steps = [
    { num: 1, label: 'Select Products' },
    { num: 2, label: 'Install SDK' },
    { num: 3, label: 'Configure Project' },
    { num: 4, label: 'Verify Connection' },
    { num: 5, label: 'Setup Report' }
  ];

  const usetraceCommand = `npx traceiq-cli --project-id ${projectId} --write-key ${writeKey}`;

  return (
    <div className="w-full space-y-6">
      {/* Step Indicator Header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                ◆
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                Connect your application
              </h2>
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Guided integration wizard with automated verification via real-time ingestion.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(usetraceCommand, 'useTrace CLI command copied!')}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>{usetraceCommand}</span>
              <span className="text-neutral-400">📋</span>
            </button>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((step) => {
            const isDone = currentStep > step.num || (step.num === 4 && verificationData);
            const isCurrent = currentStep === step.num;
            return (
              <button
                key={step.num}
                type="button"
                onClick={() => setCurrentStep(step.num)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  isCurrent
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/20 dark:text-blue-200'
                    : isDone
                      ? 'border-neutral-200 bg-white text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                      : 'border-transparent text-neutral-400 dark:text-slate-600'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    isDone
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                      : isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-200 text-neutral-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isDone ? '✓' : step.num}
                </span>
                <span className="truncate text-xs font-medium">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: PRODUCT SELECTION */}
      {currentStep === 1 ? (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              1. What would you like to measure?
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Select the TraceIQ capabilities you want to enable in this project.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((prod) => {
              const selected = selectedProducts.includes(prod.id);
              return (
                <div
                  key={prod.id}
                  onClick={() => toggleProduct(prod.id)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                    selected
                      ? 'border-neutral-900 bg-neutral-50/80 shadow-sm dark:border-white dark:bg-slate-900'
                      : 'border-neutral-200 bg-white opacity-70 hover:border-neutral-300 hover:opacity-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{prod.icon}</span>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                      />
                    </div>
                    <h4 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-white">
                      {prod.name}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {prod.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Continue to SDK Setup →
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP 2: INSTALL SDK */}
      {currentStep === 2 ? (
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              2. Install TraceIQ SDK
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              You can run our automated CLI wizard or install manually.
            </p>
          </div>

          {/* Option A: Automated CLI Banner */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 p-5 dark:border-blue-900/50 dark:from-blue-950/20 dark:to-slate-900">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                Recommended · Automated Setup
              </span>
              <span className="font-mono text-xs text-blue-600 dark:text-blue-400">useTrace Wizard</span>
            </div>
            <h4 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">
              Run useTrace in your project terminal
            </h4>
            <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400">
              Automatically detects your framework, configures provider & error tracking, and runs end-to-end event verification.
            </p>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-neutral-950 p-3 text-sm text-neutral-200 dark:bg-black">
              <code className="font-mono text-xs text-emerald-400">{usetraceCommand}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(usetraceCommand, 'Command copied')}
                className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Option B: Manual Installation Tabs */}
          <div>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Or install manually
              </span>
              <div className="flex gap-2">
                {(['nextjs', 'vite', 'node', 'html'] as const).map((fw) => (
                  <button
                    key={fw}
                    type="button"
                    onClick={() => setSelectedFramework(fw)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      selectedFramework === fw
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {fw === 'nextjs' ? 'Next.js' : fw === 'vite' ? 'Vite / React' : fw === 'node' ? 'Node.js' : 'Script tag'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-neutral-950 p-4 font-mono text-xs text-neutral-200 dark:bg-black">
              {selectedFramework === 'nextjs' ? (
                <pre>{`npm install traceiq-sdk-js\n# or\npnpm add traceiq-sdk-js`}</pre>
              ) : selectedFramework === 'vite' ? (
                <pre>{`npm install traceiq-sdk-js`}</pre>
              ) : selectedFramework === 'node' ? (
                <pre>{`npm install traceiq-sdk-js`}</pre>
              ) : (
                <pre>{`<script src="${apiUrl}/sdk/traceiq.min.js"></script>`}</pre>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Continue to Configuration →
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP 3: CONFIGURE PROJECT */}
      {currentStep === 3 ? (
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              3. Configure Initialization & Provider
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Add your environment variables and wrap your root layout with the TraceIQ provider.
            </p>
          </div>

          {/* Environment Variables Card */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                .env.local
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `NEXT_PUBLIC_TRACEIQ_PROJECT_ID=${projectId}\nNEXT_PUBLIC_TRACEIQ_WRITE_KEY=${writeKey}\nNEXT_PUBLIC_TRACEIQ_API_URL=${apiUrl}`,
                    'Environment variables copied'
                  )
                }
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Copy all
              </button>
            </div>
            <div className="mt-2 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_PROJECT_ID</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{projectId}</span>
              </div>
              <div className="flex justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_WRITE_KEY</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{writeKey}</span>
              </div>
              <div className="flex justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_API_URL</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{apiUrl}</span>
              </div>
            </div>
          </div>

          {/* Code Integration Snippet */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Provider Component (components/traceiq-provider.tsx)
            </span>
            <div className="mt-2 overflow-x-auto rounded-lg bg-neutral-950 p-4 font-mono text-xs text-neutral-200 dark:bg-black">
              <pre>{`'use client';

import { useEffect } from 'react';
import { traceiq } from 'traceiq-sdk-js';

export function TraceIQProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    traceiq.initialize({
      projectId: process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID!,
      writeKey: process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY!,
      endpoint: process.env.NEXT_PUBLIC_TRACEIQ_API_URL || '${apiUrl}',
      autoTrackPageViews: true,
      autoCaptureExceptions: true,
      autoCaptureWebVitals: true
    });
  }, []);

  return <>{children}</>;
}`}</pre>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Proceed to Live Verification →
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP 4 & 5: LIVE VERIFICATION & SUCCESS RECEIPT */}
      {currentStep === 4 || currentStep === 5 ? (
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {verificationData ? 'Everything is connected' : '4. Verify live connection'}
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {verificationData
                ? 'TraceIQ received an event from your application through the real ingestion pipeline.'
                : 'Waiting for a live event to traverse the full network & ingestion route.'}
            </p>
          </div>

          {/* Verification Box */}
          {verificationData ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-lg text-white">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
                      Connection Verified
                    </h4>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300/80">
                      TraceIQ received and matched a verification event from your client application.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 divide-y divide-emerald-200/60 border-t border-emerald-200/60 pt-3 text-xs sm:grid-cols-4 sm:divide-y-0 sm:divide-x dark:divide-emerald-900/60 dark:border-emerald-900/60">
                  <div className="pt-2 sm:pt-0 sm:pr-3">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Event Name</span>
                    <p className="mt-0.5 font-mono font-semibold text-emerald-950 dark:text-emerald-100">
                      {verificationData.event.name}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:px-3">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Source / Host</span>
                    <p className="mt-0.5 font-mono text-emerald-950 dark:text-emerald-100 truncate">
                      {verificationData.event.source ?? verificationData.event.host ?? 'localhost:3000'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:px-3">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Environment</span>
                    <p className="mt-0.5 font-mono text-emerald-950 dark:text-emerald-100">
                      {verificationData.event.environment ?? 'development'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:pl-3">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Received</span>
                    <p className="mt-0.5 font-mono text-emerald-950 dark:text-emerald-100">
                      {new Date(verificationData.verifiedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={`/dashboard/events?projectId=${encodeURIComponent(projectId)}`}
                  className="rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  View in Live Event Stream →
                </Link>
                <Link
                  href={`/dashboard?projectId=${encodeURIComponent(projectId)}`}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Open Analytics Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => setIsReportOpen(true)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  View Setup Report
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/30">
                {isCreatingSession ? (
                  <div className="space-y-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      Initializing verification session…
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative mx-auto flex h-12 w-12 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                        ●
                      </span>
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-neutral-900 dark:text-white">
                        Waiting for your first event…
                      </h4>
                      <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
                        Launch your dev server and navigate to your app, or dispatch a test probe below.
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={sendTestEvent}
                        disabled={isSendingProbe || !verificationId}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSendingProbe ? 'Sending probe…' : 'Send test verification event'}
                      </button>
                      <button
                        type="button"
                        onClick={startVerification}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Restart listener
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {verificationError ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {verificationError}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* SETUP REPORT MODAL / DRAWER */}
      {isReportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  TraceIQ Setup Report
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-neutral-600 dark:text-slate-300">
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Project:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{projectName} ({projectId})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Detected SDK:</span>
                <span>traceiq-sdk-js (v0.1.7)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Verification Status:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {verificationData ? '✓ Verified' : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Enabled Products:</span>
                <span>{selectedProducts.join(', ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Verified Timestamp:</span>
                <span>{verificationData?.verifiedAt ? new Date(verificationData.verifiedAt).toLocaleString() : '—'}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-black"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
