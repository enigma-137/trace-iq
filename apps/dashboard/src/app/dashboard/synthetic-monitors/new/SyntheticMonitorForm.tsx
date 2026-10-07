'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FunnelSyntheticDraft,
  ReplaySyntheticDraft,
  ReplaySyntheticDraftStep,
  SyntheticBrowser,
  SyntheticMonitor,
  SyntheticSchedule,
  SyntheticStep,
  SyntheticStepType
} from '@traceiq/types';
import Link from 'next/link';

interface SyntheticMonitorFormProps {
  initialData?: SyntheticMonitor;
  initialDraft?: FunnelSyntheticDraft;
  initialReplayDraft?: ReplaySyntheticDraft;
  projectId?: string;
  token: string | null;
}

const STEP_TYPES: Array<{ type: SyntheticStepType; label: string; helper: string }> = [
  { type: 'navigate', label: 'Navigate', helper: 'Open a URL path or full address' },
  { type: 'click', label: 'Click Element', helper: 'Click a button, link, or element by CSS selector' },
  { type: 'fill', label: 'Fill Input', helper: 'Type text into an input field' },
  { type: 'wait_for', label: 'Wait for Element/Delay', helper: 'Wait for selector to attach or wait milliseconds' },
  { type: 'assert_visible', label: 'Assert Element Visible', helper: 'Confirm element is visible on the page' },
  { type: 'assert_text', label: 'Assert Text Contains', helper: 'Verify element text matches expected value' },
  { type: 'assert_url', label: 'Assert URL Path', helper: 'Verify page URL contains expected string' },
  { type: 'wait_for_response', label: 'Wait for HTTP Response', helper: 'Wait for backend API request to complete' }
];

export function SyntheticMonitorForm({
  initialData,
  initialDraft,
  initialReplayDraft,
  projectId,
  token
}: SyntheticMonitorFormProps) {
  const router = useRouter();

  const [name, setName] = useState(
    initialData?.name ||
      initialReplayDraft?.monitor.name ||
      initialDraft?.monitor.name ||
      ''
  );
  const [description, setDescription] = useState(
    initialData?.description ||
      (initialReplayDraft
        ? `Extracted from session ${initialReplayDraft.source.sessionId} (${initialReplayDraft.initialSteps.length} extracted interactions)`
        : initialDraft
        ? `Continuous verification of ${initialDraft.source.name} funnel flow (${initialDraft.source.stepCount} milestones)`
        : '')
  );
  const [baseUrl, setBaseUrl] = useState(
    initialData?.baseUrl ||
      initialReplayDraft?.monitor.baseUrl ||
      initialDraft?.monitor.baseUrl ||
      'https://'
  );
  const [schedule, setSchedule] = useState<SyntheticSchedule>(
    initialData?.schedule ||
      initialReplayDraft?.monitor.schedule ||
      initialDraft?.monitor.schedule ||
      '15m'
  );
  const [browser, setBrowser] = useState<SyntheticBrowser>(
    initialData?.browser ||
      initialReplayDraft?.monitor.browser ||
      initialDraft?.monitor.browser ||
      'chromium'
  );
  const [viewportPreset, setViewportPreset] = useState<'desktop' | 'fhd' | 'mobile' | 'tablet'>(
    initialReplayDraft?.monitor.viewportWidth === 390
      ? 'mobile'
      : initialReplayDraft?.monitor.viewportWidth === 1920
      ? 'fhd'
      : initialReplayDraft?.monitor.viewportWidth === 820
      ? 'tablet'
      : 'desktop'
  );
  const [viewportWidth, setViewportWidth] = useState(
    initialData?.viewportWidth || initialReplayDraft?.monitor.viewportWidth || 1280
  );
  const [viewportHeight, setViewportHeight] = useState(
    initialData?.viewportHeight || initialReplayDraft?.monitor.viewportHeight || 720
  );
  const [timeoutMs, setTimeoutMs] = useState(initialData?.timeoutMs || 30000);

  const [steps, setSteps] = useState<SyntheticStep[]>(
    initialData?.steps && initialData.steps.length > 0
      ? initialData.steps
      : initialReplayDraft?.initialSteps && initialReplayDraft.initialSteps.length > 0
      ? initialReplayDraft.initialSteps
      : initialDraft?.initialSteps && initialDraft.initialSteps.length > 0
      ? initialDraft.initialSteps
      : [
          { type: 'navigate', url: '/', description: 'Open home page' },
          { type: 'assert_visible', selector: 'body', description: 'Confirm page loaded' }
        ]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = (preset: 'desktop' | 'fhd' | 'mobile' | 'tablet') => {
    setViewportPreset(preset);
    if (preset === 'desktop') {
      setViewportWidth(1280);
      setViewportHeight(720);
    } else if (preset === 'fhd') {
      setViewportWidth(1920);
      setViewportHeight(1080);
    } else if (preset === 'mobile') {
      setViewportWidth(390);
      setViewportHeight(844);
    } else if (preset === 'tablet') {
      setViewportWidth(820);
      setViewportHeight(1180);
    }
  };

  const handleAddStep = (type: SyntheticStepType = 'click') => {
    const newStep: SyntheticStep = {
      type,
      description: '',
      selector: type === 'navigate' ? undefined : '',
      url: type === 'navigate' ? '/' : undefined,
      value: ''
    };
    setSteps([...steps, newStep]);
  };

  const handleUpdateStep = (index: number, patch: Partial<SyntheticStep>) => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    setSteps(next);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const next = [...steps];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setSteps(next);
  };

  const applyTemplate = (templateName: string) => {
    if (templateName === 'signup') {
      setName('User Signup Journey');
      setSteps([
        { type: 'navigate', url: '/signup', description: 'Open Signup Page' },
        { type: 'assert_visible', selector: 'form', description: 'Check form loaded' },
        { type: 'fill', selector: 'input[type=email]', value: 'synthetic-test@traceiq.dev', description: 'Fill Email' },
        { type: 'fill', selector: 'input[type=password]', value: 'Secr3tP@ssw0rd!', description: 'Fill Password' },
        { type: 'click', selector: 'button[type=submit]', description: 'Click Create Account' },
        { type: 'assert_url', value: '/dashboard', description: 'Verify redirected to dashboard' }
      ]);
    } else if (templateName === 'login') {
      setName('User Authentication Flow');
      setSteps([
        { type: 'navigate', url: '/login', description: 'Open Login' },
        { type: 'fill', selector: 'input[type=email]', value: 'user@example.com', description: 'Enter username' },
        { type: 'fill', selector: 'input[type=password]', value: 'demo12345', description: 'Enter password' },
        { type: 'click', selector: 'button[type=submit]', description: 'Submit Login' },
        { type: 'assert_visible', selector: '[data-testid=user-avatar]', description: 'Verify logged in UI' }
      ]);
    } else if (templateName === 'health') {
      setName('Homepage & Asset Check');
      setSteps([
        { type: 'navigate', url: '/', description: 'Open homepage' },
        { type: 'assert_visible', selector: 'header', description: 'Check header visible' },
        { type: 'assert_visible', selector: 'footer', description: 'Check footer visible' }
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!name.trim()) {
      setError('Monitor name is required.');
      return;
    }

    if (!baseUrl.trim() || baseUrl === 'https://') {
      setError('Please provide a valid target base URL.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      baseUrl: baseUrl.trim(),
      schedule,
      browser,
      viewportWidth,
      viewportHeight,
      timeoutMs,
      steps,
      sourceType: initialData?.sourceType || (initialReplayDraft ? 'replay' : initialDraft ? 'funnel' : 'manual'),
      sourceFunnelId: initialData?.sourceFunnelId || initialDraft?.source.funnelId || undefined,
      sourceFunnelName: initialData?.sourceFunnelName || initialDraft?.source.name || undefined,
      sourceFunnelUpdatedAt: initialData?.sourceFunnelUpdatedAt || initialDraft?.source.updatedAt || undefined,
      sourceFunnelStepCount: initialData?.sourceFunnelStepCount || initialDraft?.source.stepCount || undefined,
      sourceReplayId: (initialData as any)?.sourceReplayId || initialReplayDraft?.source.replayId || undefined,
      sourceSessionId: (initialData as any)?.sourceSessionId || initialReplayDraft?.source.sessionId || undefined,
      sourceReplayStartedAt: (initialData as any)?.sourceReplayStartedAt || initialReplayDraft?.source.startedAt || undefined,
      projectId
    };

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    try {
      const url = initialData
        ? `${apiBaseUrl}/v1/dashboard/synthetic-monitors/${initialData.id}${projectId ? `?projectId=${projectId}` : ''}`
        : `${apiBaseUrl}/v1/dashboard/synthetic-monitors${projectId ? `?projectId=${projectId}` : ''}`;

      const res = await fetch(url, {
        method: initialData ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save synthetic monitor');
      }

      const saved = await res.json();
      router.push(`/dashboard/synthetic-monitors/${saved.id}${projectId ? `?projectId=${projectId}` : ''}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRelativeTime = (ms?: number) => {
    if (ms === undefined || ms === null) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Session Replay Extraction Provenance Banner */}
      {initialReplayDraft && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200">
                Session Replay Extraction
              </span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                Session: {initialReplayDraft.source.sessionId}
              </span>
            </div>

            <Link
              href={`/dashboard/replays/${initialReplayDraft.source.replayId}${projectId ? `?projectId=${projectId}` : ''}`}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              target="_blank"
            >
              View Session Replay ↗
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-indigo-200/60 bg-white/70 p-2.5 dark:border-indigo-800/40 dark:bg-slate-900/70">
              <span className="text-[11px] text-neutral-500 dark:text-slate-400">Recorded</span>
              <p className="font-medium text-neutral-900 dark:text-white truncate">
                {new Date(initialReplayDraft.source.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200/60 bg-white/70 p-2.5 dark:border-indigo-800/40 dark:bg-slate-900/70">
              <span className="text-[11px] text-neutral-500 dark:text-slate-400">Duration</span>
              <p className="font-medium text-neutral-900 dark:text-white">
                {Math.floor(initialReplayDraft.source.durationSeconds / 60)}m {Math.round(initialReplayDraft.source.durationSeconds % 60)}s
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200/60 bg-white/70 p-2.5 dark:border-indigo-800/40 dark:bg-slate-900/70">
              <span className="text-[11px] text-neutral-500 dark:text-slate-400">Browser</span>
              <p className="font-medium text-neutral-900 dark:text-white truncate">
                {initialReplayDraft.source.deviceInfo?.browser || 'Desktop Browser'}
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200/60 bg-white/70 p-2.5 dark:border-indigo-800/40 dark:bg-slate-900/70">
              <span className="text-[11px] text-neutral-500 dark:text-slate-400">Extracted Steps</span>
              <p className="font-medium text-neutral-900 dark:text-white">
                {initialReplayDraft.stats.extractedStepsCount} interactions ({initialReplayDraft.stats.highConfidenceCount} high conf.)
              </p>
            </div>
          </div>

          {initialReplayDraft.warnings && initialReplayDraft.warnings.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="font-semibold flex items-center gap-1.5">
                <span>⚠️ Journey Extraction Warnings:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {initialReplayDraft.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md bg-indigo-100/60 p-2.5 text-[11px] text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200">
            🔒 <strong>Deterministic Privacy:</strong> Passwords, payment cards, and sensitive keystrokes were automatically replaced with secure placeholders (e.g. <code>&#123;&#123;TEST_PASSWORD&#125;&#125;</code>, <code>&#123;&#123;TEST_EMAIL&#125;&#125;</code>).
          </div>
        </div>
      )}

      {/* Funnel Conversion Provenance Banner */}
      {initialDraft && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/50 dark:bg-blue-950/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                Funnel Conversion
              </span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                Source: {initialDraft.source.name}
              </span>
            </div>

            <Link
              href={`/dashboard/funnels/${initialDraft.source.funnelId}${projectId ? `?projectId=${projectId}` : ''}`}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
            >
              View Source Funnel ↗
            </Link>
          </div>

          <p className="text-xs text-neutral-600 dark:text-slate-300">
            TraceIQ generated a draft browser journey matching the <strong>{initialDraft.source.stepCount} funnel milestones</strong> below. Review and refine the browser steps before saving.
          </p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
            {initialDraft.milestones.map((ms, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-blue-200/80 bg-white/80 p-3 text-xs dark:border-blue-800/40 dark:bg-slate-900/80"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-neutral-900 dark:text-white truncate">
                    {idx + 1}. {ms.label || ms.eventName}
                  </span>
                  {ms.needsConfiguration ? (
                    <span className="shrink-0 rounded-xs bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      Needs Action
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-xs bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      Pre-filled
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-[11px] text-neutral-500 dark:text-slate-400 truncate">
                  event: {ms.eventName}
                </p>
                {ms.notes && (
                  <p className="mt-1 text-[11px] text-neutral-600 dark:text-slate-400 line-clamp-2">
                    {ms.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-md bg-blue-100/60 p-2.5 text-[11px] text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">
            💡 <strong>Security Tip:</strong> Use secure variables like <code>&#123;&#123;SYNTHETIC_EMAIL&#125;&#125;</code> and <code>&#123;&#123;SYNTHETIC_PASSWORD&#125;&#125;</code> for authentication credentials to keep them encrypted at rest and redacted from logs.
          </div>
        </div>
      )}

      {/* Templates Bar */}
      {!initialData && !initialDraft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
          <span className="text-xs font-semibold text-neutral-600 dark:text-slate-400">Quick Templates:</span>
          <button
            type="button"
            onClick={() => applyTemplate('signup')}
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          >
            Signup Flow
          </button>
          <button
            type="button"
            onClick={() => applyTemplate('login')}
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          >
            Login & Auth
          </button>
          <button
            type="button"
            onClick={() => applyTemplate('health')}
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          >
            Page Health
          </button>
        </div>
      )}

      {/* Basic Configuration Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Target & Execution Settings</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Monitor Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Critical Checkout Flow"
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Base URL</label>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://app.yourdomain.com"
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-mono text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Continuous verification of primary registration conversion"
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Schedule & Environment */}
        <div className="grid gap-4 sm:grid-cols-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Frequency Schedule</label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as SyntheticSchedule)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="5m">Every 5 minutes</option>
              <option value="15m">Every 15 minutes</option>
              <option value="30m">Every 30 minutes</option>
              <option value="1h">Every hour</option>
              <option value="6h">Every 6 hours</option>
              <option value="24h">Daily (Every 24 hours)</option>
              <option value="manual">Manual only (On demand)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Browser Engine</label>
            <select
              value={browser}
              onChange={(e) => setBrowser(e.target.value as SyntheticBrowser)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white capitalize"
            >
              <option value="chromium">Chromium (Chrome / Edge)</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit (Safari)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-slate-300">Viewport Preset</label>
            <select
              value={viewportPreset}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="desktop">Desktop (1280 × 720)</option>
              <option value="fhd">Full HD (1920 × 1080)</option>
              <option value="mobile">Mobile iPhone (390 × 844)</option>
              <option value="tablet">Tablet iPad (820 × 1180)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Journey Step Builder Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Journey Step Sequence</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Steps are executed sequentially in a headless browser sandbox. Execution stops on the first failure.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddStep('click')}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              + Add Step
            </button>
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="relative rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 transition dark:border-slate-800 dark:bg-slate-900/50"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                    {idx + 1}
                  </span>

                  <select
                    value={step.type}
                    onChange={(e) => handleUpdateStep(idx, { type: e.target.value as SyntheticStepType })}
                    className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {STEP_TYPES.map((st) => (
                      <option key={st.type} value={st.type}>
                        {st.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Step label (e.g. Click checkout button)"
                    value={step.description || ''}
                    onChange={(e) => handleUpdateStep(idx, { description: e.target.value })}
                    className="hidden sm:block w-56 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-700 placeholder:text-neutral-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />

                  {/* Replay source timestamp chip */}
                  {(step as any).relativeTimeMs !== undefined && (
                    <span className="inline-flex items-center rounded-xs bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-mono text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                      ⏱️ {formatRelativeTime((step as any).relativeTimeMs)}
                    </span>
                  )}

                  {/* Selector confidence badges */}
                  {(step as any).confidence === 'high' && (
                    <span className="inline-flex items-center rounded-xs bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      High confidence
                    </span>
                  )}
                  {(step as any).confidence === 'medium' && (
                    <span className="inline-flex items-center rounded-xs bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                      Medium
                    </span>
                  )}
                  {((step as any).confidence === 'low' || (step as any).needsReview) && (
                    <span className="inline-flex items-center rounded-xs bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      Needs selector review
                    </span>
                  )}
                  {(step as any).isMasked && (
                    <span className="inline-flex items-center rounded-xs bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                      🔒 Masked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveStep(idx, 'up')}
                    className="rounded-sm p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-slate-200"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === steps.length - 1}
                    onClick={() => handleMoveStep(idx, 'down')}
                    className="rounded-sm p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-slate-200"
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(idx)}
                    disabled={steps.length <= 1}
                    className="ml-2 rounded-md p-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-30 dark:text-rose-400 dark:hover:bg-rose-950/50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Step Parameters */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {step.type === 'navigate' && (
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-slate-400">
                      Target Path or Full URL
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="/signup or https://example.com/checkout"
                      value={step.url || ''}
                      onChange={(e) => handleUpdateStep(idx, { url: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-mono text-neutral-900 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}

                {['click', 'fill', 'wait_for', 'assert_visible', 'assert_text'].includes(step.type) && (
                  <div className={step.type === 'fill' || step.type === 'assert_text' ? 'sm:col-span-2' : 'sm:col-span-3'}>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-slate-400">
                      CSS / TestID Selector
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="button#submit, [data-testid=signup-btn], input[name=email]"
                      value={step.selector || ''}
                      onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-mono text-neutral-900 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}

                {(step.type === 'fill' || step.type === 'assert_text' || step.type === 'assert_url') && (
                  <div className={step.type === 'assert_url' ? 'sm:col-span-3' : 'sm:col-span-1'}>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-slate-400">
                      {step.type === 'fill' ? 'Input Value' : step.type === 'assert_url' ? 'Expected URL Fragment' : 'Expected Text'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={step.type === 'fill' ? 'user@example.com' : step.type === 'assert_url' ? '/dashboard' : 'Welcome back'}
                      value={step.value || ''}
                      onChange={(e) => handleUpdateStep(idx, { value: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}

                {step.type === 'wait_for_response' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-neutral-600 dark:text-slate-400">
                        API URL Pattern
                      </label>
                      <input
                        type="text"
                        placeholder="/api/v1/checkout"
                        value={step.url || ''}
                        onChange={(e) => handleUpdateStep(idx, { url: e.target.value })}
                        className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-mono text-neutral-900 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-medium text-neutral-600 dark:text-slate-400">
                        Expected Status (Optional)
                      </label>
                      <input
                        type="number"
                        placeholder="200"
                        value={step.statusCode || ''}
                        onChange={(e) => handleUpdateStep(idx, { statusCode: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                        className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : initialData ? (
            'Save Changes'
          ) : (
            'Create & Activate Monitor'
          )}
        </button>
      </div>
    </form>
  );
}
