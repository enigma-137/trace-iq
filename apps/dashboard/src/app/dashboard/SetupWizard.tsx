'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from '@/lib/toast';
import { readApiError } from '@/lib/api-error';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export interface SetupWizardProps {
  projectId: string;
  projectName: string;
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

function maskKey(key: string | undefined): string {
  if (!key) return '••••••••••••••••';
  if (key.startsWith('tr_live_')) {
    return `tr_live_${'•'.repeat(Math.max(12, key.length - 8))}`;
  }
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(12, key.length - 4))}`;
}

export function SetupWizard({
  projectId,
  projectName,
  writeKey: initialWriteKey,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  userEmail,
  onComplete
}: SetupWizardProps) {
  // Guard: if projectId is missing, do not render the wizard
  if (!projectId) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-6 text-center text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <h3 className="text-base font-semibold">Project context required</h3>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          The Setup Wizard must be scoped to an existing TraceIQ project. Please select or create a project first.
        </p>
      </div>
    );
  }

  const [writeKey, setWriteKey] = useState<string>(initialWriteKey ?? '');
  const [isKeyRevealed, setIsKeyRevealed] = useState<boolean>(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);

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
  const [isReportOpen, setIsReportOpen] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const copyToClipboard = (text: string, label = 'Copied to clipboard') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  // Generate or rotate project write key
  const handleGenerateWriteKey = async () => {
    setIsGeneratingKey(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token && process.env.NEXT_PUBLIC_AUTH_MODE !== 'local') {
        throw new Error('Your dashboard session expired. Please refresh the page.');
      }

      const res = await fetch(`${apiUrl}/v1/setup/write-key/regenerate?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to generate write key'));
      }

      const data = await res.json();
      if (data?.writeKey?.value) {
        setWriteKey(data.writeKey.value);
        setIsKeyRevealed(true);
        toast.success('Generated active write key for project!', { title: 'Write key ready' });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate write key', { title: 'Action failed' });
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Start verification session and SSE stream
  const startVerification = async () => {
    if (isListening || verificationData) return;
    setIsCreatingSession(true);
    setVerificationError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (writeKey) {
        headers['x-traceiq-write-key'] = writeKey;
      } else {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const res = await fetch(`${apiUrl}/v1/setup-verifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId, writeKey: writeKey || undefined, ttlSeconds: 300 })
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to create verification session'));
      }

      const data = await res.json();
      const vId = data.id || data.verificationId;
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
        setVerificationError('Verification session expired. Click "Restart listener" to start a new verification.');
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

  const steps = [
    { num: 1, label: 'Select Products' },
    { num: 2, label: 'Install SDK' },
    { num: 3, label: 'Configure Project' },
    { num: 4, label: 'Verify Connection' },
    { num: 5, label: 'Setup Report' }
  ];

  const usetraceCommand = writeKey
    ? `npx traceiq-cli --project-id ${projectId} --write-key ${writeKey}`
    : `npx traceiq-cli --project-id ${projectId}`;

  const envSnippet = `NEXT_PUBLIC_TRACEIQ_PROJECT_ID=${projectId}\nNEXT_PUBLIC_TRACEIQ_WRITE_KEY=${writeKey || 'YOUR_WRITE_KEY'}\nNEXT_PUBLIC_TRACEIQ_API_URL=${apiUrl}`;

  return (
    <div className="w-full space-y-6">
      {/* Project Context & Step Indicator Header */}
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
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="text-neutral-500">Project:</span>
              <span className="font-semibold text-neutral-900 dark:text-white">{projectName}</span>
              <span className="rounded border border-neutral-200 bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {projectId}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {writeKey ? (
              <button
                type="button"
                onClick={() => copyToClipboard(usetraceCommand, 'TraceIQ CLI command copied!')}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Click to copy full CLI command with write key"
              >
                <span>{`npx traceiq-cli --project-id ${projectId} --write-key ${maskKey(writeKey)}`}</span>
                <span className="text-neutral-400">📋</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerateWriteKey}
                disabled={isGeneratingKey}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isGeneratingKey ? 'Generating Key…' : 'Generate Project Write Key'}
              </button>
            )}
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
              Select the TraceIQ capabilities you want to enable in <span className="font-semibold text-neutral-800 dark:text-neutral-200">{projectName}</span>.
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
              You can run our automated CLI wizard or install manually into your codebase.
            </p>
          </div>

          {/* Option A: Automated CLI Banner */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 p-5 dark:border-blue-900/50 dark:from-blue-950/20 dark:to-slate-900">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                Recommended · Automated Setup
              </span>
              <span className="font-mono text-xs text-blue-600 dark:text-blue-400">useTrace CLI</span>
            </div>
            <h4 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">
              Run useTrace in your project terminal
            </h4>
            <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400">
              Automatically detects your framework, configures provider & error tracking, and runs end-to-end event verification for <span className="font-semibold">{projectName}</span>.
            </p>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-neutral-950 p-3 text-sm text-neutral-200 dark:bg-black">
              <code className="font-mono text-xs text-emerald-400">
                {writeKey ? `npx traceiq-cli --project-id ${projectId} --write-key ${maskKey(writeKey)}` : `npx traceiq-cli --project-id ${projectId}`}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(usetraceCommand, 'Full CLI command copied with credentials!')}
                className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Copy Command
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
              Add your environment variables and wrap your application root with the TraceIQ provider.
            </p>
          </div>

          {/* Missing Write Key Prompt */}
          {!writeKey ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    No active write key loaded
                  </h4>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                    Generate an active write key for <span className="font-semibold">{projectName}</span> to complete your configuration.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateWriteKey}
                  disabled={isGeneratingKey}
                  className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-800 disabled:opacity-50"
                >
                  {isGeneratingKey ? 'Generating…' : 'Generate Write Key'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Environment Variables Card */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                .env.local
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(envSnippet, 'Environment variables copied!')}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Copy all
              </button>
            </div>
            <div className="mt-2 space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_PROJECT_ID</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white">{projectId}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(projectId, 'Project ID copied')}
                    className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_WRITE_KEY</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {isKeyRevealed ? (writeKey || 'YOUR_WRITE_KEY') : maskKey(writeKey)}
                  </span>
                  {writeKey ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsKeyRevealed(!isKeyRevealed)}
                        className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {isKeyRevealed ? 'Hide' : 'Reveal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(writeKey, 'Write key copied')}
                        className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Copy
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-between rounded bg-white p-2 border border-neutral-200 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-neutral-600 dark:text-slate-400">NEXT_PUBLIC_TRACEIQ_API_URL</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white">{apiUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(apiUrl, 'API URL copied')}
                    className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Copy
                  </button>
                </div>
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

import { useEffect, useRef } from 'react';
import { traceiq } from 'traceiq-sdk-js';

export function TraceIQProvider({ children }: { children: React.ReactNode }) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;

    const projectId = process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID;
    const writeKey = process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY;
    const endpoint = process.env.NEXT_PUBLIC_TRACEIQ_API_URL || 'https://api.traceiq.run';

    if (!projectId || !writeKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[TraceIQ] Initialization skipped: missing project ID or write key.\\n' +
          'Restart the development server after changing environment variables.'
        );
      }
      return;
    }

    try {
      traceiq.initialize({
        projectId,
        writeKey,
        endpoint,
        autoTrackPageViews: true,
        autoCaptureExceptions: true,
        autoCaptureWebVitals: true
      });
      initializedRef.current = true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[TraceIQ] Initialization failed:', err instanceof Error ? err.message : err);
      }
    }
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
                ? `TraceIQ received and correlated a live event for ${projectName} through the real ingestion pipeline.`
                : `Waiting for a live event to reach TraceIQ for ${projectName}.`}
            </p>
          </div>

          {/* Verification Box */}
          {verificationData ? (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-white p-6 shadow-sm dark:border-emerald-900/70 dark:from-emerald-950/30 dark:via-neutral-900 dark:to-neutral-900">
                <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-sm">
                        ✓
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                          Connection Verified Successfully
                        </h4>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300/80">
                          TraceIQ received and validated your live telemetry event from your application.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 divide-y divide-emerald-200/60 border-t border-emerald-200/60 pt-3 text-xs sm:grid-cols-4 sm:divide-y-0 sm:divide-x dark:divide-emerald-900/60 dark:border-emerald-900/60">
                      <div className="pt-2 sm:pt-0 sm:pr-3">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Event Name</span>
                        <p className="mt-0.5 font-mono font-semibold text-emerald-950 dark:text-emerald-100">
                          {verificationData.event.name}
                        </p>
                      </div>
                      <div className="pt-2 sm:pt-0 sm:px-3">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Source / Host</span>
                        <p className="mt-0.5 truncate font-mono text-emerald-950 dark:text-emerald-100">
                          {verificationData.event.source ?? verificationData.event.host ?? 'client-application'}
                        </p>
                      </div>
                      <div className="pt-2 sm:pt-0 sm:px-3">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Environment</span>
                        <p className="mt-0.5 font-mono text-emerald-950 dark:text-emerald-100">
                          {verificationData.event.environment ?? 'development'}
                        </p>
                      </div>
                      <div className="pt-2 sm:pt-0 sm:pl-3">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Received</span>
                        <p className="mt-0.5 font-mono text-emerald-950 dark:text-emerald-100">
                          {new Date(verificationData.verifiedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Artwork Illustration - Transparent PNG */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    <div className="pointer-events-none absolute -inset-2 rounded-full bg-emerald-500/10 opacity-70 blur-xl" />
                    <Image
                      src="/dashboards/setup-success.png"
                      alt="Setup Success Celebration"
                      width={160}
                      height={160}
                      className="relative z-10 max-h-[140px] w-auto object-contain drop-shadow-md transition-transform duration-300 hover:scale-105"
                      priority
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={`/dashboard?projectId=${encodeURIComponent(projectId)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
                >
                  Open Analytics →
                </Link>
                <Link
                  href={`/dashboard/events?projectId=${encodeURIComponent(projectId)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  View Event
                </Link>
                <button
                  type="button"
                  onClick={() => setIsReportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Setup Report
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
                      Initializing verification session for {projectName}…
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
                        Launch your application and trigger an event to verify the live connection.
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={startVerification}
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
                <span className="text-neutral-400">CLI & SDK:</span>
                <span>npx traceiq-cli / traceiq-sdk-js</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-slate-900">
                <span className="text-neutral-400">Write Key:</span>
                <span className="font-mono">{maskKey(writeKey)}</span>
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
