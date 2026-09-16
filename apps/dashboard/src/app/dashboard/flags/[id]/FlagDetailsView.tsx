'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../../DashboardDialog';
import { FlagItem, FlagTarget, FlagTargetGroup } from '../FlagManager';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type TabId = 'overview' | 'targeting' | 'tester' | 'remote_config' | 'analytics' | 'activity' | 'settings';

interface AudienceEstimate {
  totalUsers: number;
  estimatedReceivingUsers: number;
}

interface TestEvaluationResponse {
  enabled: boolean;
  reason: string;
  humanReason: string;
  bucket: number;
  requiredRollout: number;
  matchedGroupIndex: number | null;
  groupDetails: Array<{
    groupIndex: number;
    groupName: string;
    passed: boolean;
    rules: Array<{
      property: string;
      operator: string;
      expectedValue: unknown;
      actualValue: unknown;
      passed: boolean;
    }>;
  }>;
  payload: unknown;
  revision: number;
  environment: string;
  flagKey: string;
}

interface AnalyticsResponse {
  flagKey: string;
  days: number;
  targetEvent: string;
  exposedUsers: number;
  controlUsers: number;
  totalExposures: number;
  trend: Array<{ day: string; count: number; enabled_count: number }>;
  conversion: {
    eventName: string;
    exposedRate: number;
    exposedCount: number;
    controlRate: number;
    controlCount: number;
  };
  errors: {
    exposedRate: number;
    exposedCount: number;
    controlRate: number;
    controlCount: number;
  };
}

interface ActivityItem {
  id: string;
  flagId: string;
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  revision: number;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
}

const OPERATORS: Array<{ value: FlagTarget['operator']; label: string; description: string }> = [
  { value: 'eq', label: 'equals (=)', description: 'Exact match (string, number, boolean)' },
  { value: 'ne', label: 'does not equal (≠)', description: 'Not equal' },
  { value: 'contains', label: 'contains', description: 'Case-insensitive substring match' },
  { value: 'not_contains', label: 'does not contain', description: 'Does not contain substring' },
  { value: 'gt', label: 'greater than (>)', description: 'Strictly greater than number' },
  { value: 'gte', label: 'greater or equal (≥)', description: 'Greater than or equal to number' },
  { value: 'lt', label: 'less than (<)', description: 'Strictly less than number' },
  { value: 'lte', label: 'less or equal (≤)', description: 'Less than or equal to number' },
  { value: 'exists', label: 'exists / is set', description: 'Property is present and not empty' },
  { value: 'not_exists', label: 'does not exist', description: 'Property is missing or empty' },
  { value: 'in', label: 'is one of (comma separated)', description: 'Value is in list (e.g. pro, enterprise)' }
];

export function FlagDetailsView({
  flag,
  audienceEstimate,
  projectId,
  initialTab = 'overview'
}: {
  flag: FlagItem;
  audienceEstimate?: AudienceEstimate;
  projectId?: string;
  initialTab?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>(
    ['overview', 'targeting', 'tester', 'remote_config', 'analytics', 'activity', 'settings'].includes(initialTab as TabId)
      ? (initialTab as TabId)
      : 'overview'
  );

  // Overview / Rollout state
  const [rolloutVal, setRolloutVal] = useState(flag.rolloutPercentage);
  const [isSavingRollout, setIsSavingRollout] = useState(false);
  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Targeting state
  const initialGroups: FlagTargetGroup[] = useMemo(() => {
    if (flag.targetingGroups && flag.targetingGroups.length > 0) {
      return flag.targetingGroups;
    }
    if (flag.targeting && flag.targeting.length > 0) {
      return [{ name: 'Targeting rules', rules: flag.targeting }];
    }
    return [{ name: 'Targeting rules', rules: [] }];
  }, [flag]);

  const [targetGroups, setTargetGroups] = useState<FlagTargetGroup[]>(initialGroups);
  const [isSavingTargeting, setIsSavingTargeting] = useState(false);

  // Remote Config state
  const initialPayloadStr = flag.payload != null ? JSON.stringify(flag.payload, null, 2) : '';
  const [payloadText, setPayloadText] = useState(initialPayloadStr);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [isSavingPayload, setIsSavingPayload] = useState(false);

  // Evaluation Tester state
  const [testDistinctId, setTestDistinctId] = useState('user_test_123');
  const [testPropertiesJson, setTestPropertiesJson] = useState('{\n  "plan": "premium",\n  "country": "NG",\n  "platform": "web"\n}');
  const [testResult, setTestResult] = useState<TestEvaluationResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Analytics state
  const [analyticsDays, setAnalyticsDays] = useState('14');
  const [conversionEventInput, setConversionEventInput] = useState('');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Activity state
  const [activityList, setActivityList] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  // Settings state
  const [editName, setEditName] = useState(flag.name);
  const [editDesc, setEditDesc] = useState(flag.description ?? '');
  const [editEnv, setEditEnv] = useState(flag.environment);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      toast.error('Session expired. Please sign in again.');
      return null;
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  }

  // 1. Rollout Save
  async function handleSaveRollout() {
    setIsSavingRollout(true);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        rolloutPercentage: Number(rolloutVal),
        projectId
      })
    });
    setIsSavingRollout(false);

    if (!res || !res.ok) {
      toast.error('Failed to update rollout percentage.');
      return;
    }

    toast.success(`Rollout updated to ${rolloutVal}%.`);
    router.refresh();
  }

  // 2. Kill switch toggle
  async function handleToggleKillSwitch() {
    setIsToggling(true);
    const nextState = !flag.enabled;
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled: nextState, projectId })
    });
    setIsToggling(false);
    setIsKillSwitchOpen(false);

    if (!res || !res.ok) {
      toast.error('Failed to toggle kill switch.');
      return;
    }

    toast.success(`Flag ${flag.key} is now ${nextState ? 'ENABLED' : 'DISABLED'}.`);
    router.refresh();
  }

  // 3. Targeting Save
  async function handleSaveTargeting() {
    setIsSavingTargeting(true);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        targetingGroups: targetGroups,
        projectId
      })
    });
    setIsSavingTargeting(false);

    if (!res || !res.ok) {
      toast.error('Failed to save targeting rules.');
      return;
    }

    toast.success('Targeting rules saved.');
    router.refresh();
  }

  // 4. Remote Config Save
  async function handleSavePayload() {
    setPayloadError(null);
    let parsed: unknown = null;
    if (payloadText.trim()) {
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        setPayloadError('Invalid JSON format. Please fix syntax errors before saving.');
        return;
      }
    }

    setIsSavingPayload(true);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        payload: parsed,
        flagType: parsed != null ? 'remote_config' : 'boolean',
        projectId
      })
    });
    setIsSavingPayload(false);

    if (!res || !res.ok) {
      toast.error('Failed to save remote config payload.');
      return;
    }

    toast.success('Remote config payload saved.');
    router.refresh();
  }

  function handleFormatPayload() {
    if (!payloadText.trim()) return;
    try {
      const parsed = JSON.parse(payloadText);
      setPayloadText(JSON.stringify(parsed, null, 2));
      setPayloadError(null);
    } catch {
      setPayloadError('Cannot format invalid JSON.');
    }
  }

  // 5. Evaluation Tester Run
  async function handleRunTestEvaluation(e?: FormEvent) {
    if (e) e.preventDefault();
    setTestError(null);
    setTestResult(null);

    let parsedProps: Record<string, unknown> = {};
    if (testPropertiesJson.trim()) {
      try {
        parsedProps = JSON.parse(testPropertiesJson);
      } catch {
        setTestError('Test properties must be a valid JSON object.');
        return;
      }
    }

    setIsTesting(true);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/test-evaluation`, {
      method: 'POST',
      body: JSON.stringify({
        distinctId: testDistinctId.trim(),
        properties: parsedProps,
        projectId
      })
    });
    setIsTesting(false);

    if (!res) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setTestError(err.message || 'Failed to simulate flag evaluation.');
      return;
    }

    const data = (await res.json()) as TestEvaluationResponse;
    setTestResult(data);
  }

  // 6. Analytics Fetch
  async function fetchAnalytics(days = analyticsDays, convEvent = conversionEventInput) {
    setIsLoadingAnalytics(true);
    const query = new URLSearchParams();
    if (days) query.set('days', days);
    if (convEvent.trim()) query.set('conversionEvent', convEvent.trim());
    if (projectId) query.set('projectId', projectId);

    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/analytics?${query.toString()}`, {
      method: 'GET'
    });
    setIsLoadingAnalytics(false);

    if (res && res.ok) {
      const data = await res.json();
      setAnalyticsData(data);
    }
  }

  // 7. Activity Fetch
  async function fetchActivity() {
    setIsLoadingActivity(true);
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/activity${query}`, {
      method: 'GET'
    });
    setIsLoadingActivity(false);

    if (res && res.ok) {
      const data = await res.json();
      setActivityList(data.activities ?? []);
    }
  }

  // 8. Settings Save
  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setIsSavingSettings(true);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: editName.trim(),
        description: editDesc.trim(),
        environment: editEnv,
        projectId
      })
    });
    setIsSavingSettings(false);

    if (!res || !res.ok) {
      toast.error('Failed to update settings.');
      return;
    }

    toast.success('Flag settings updated.');
    router.refresh();
  }

  async function handleArchiveToggle() {
    const isArchived = Boolean(flag.archivedAt);
    const path = isArchived ? 'restore' : 'archive';
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/${path}`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    setIsArchiveOpen(false);

    if (!res || !res.ok) {
      toast.error(`Failed to ${path} flag.`);
      return;
    }

    toast.success(`Flag ${isArchived ? 'restored' : 'archived'}.`);
    router.refresh();
  }

  async function handleDeletePermanent() {
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, {
      method: 'DELETE'
    });
    setIsDeleteOpen(false);

    if (!res || !res.ok) {
      toast.error('Failed to delete flag.');
      return;
    }

    toast.success('Flag permanently deleted.');
    router.push(`/dashboard/flags${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
    router.refresh();
  }

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    if (tab === 'analytics' && !analyticsData) {
      void fetchAnalytics();
    }
    if (tab === 'activity' && activityList.length === 0) {
      void fetchActivity();
    }
    if (tab === 'tester' && !testResult) {
      void handleRunTestEvaluation();
    }
  }

  function copyText(txt: string, label: string) {
    void navigator.clipboard.writeText(txt);
    toast.success(`Copied ${label} to clipboard.`);
  }

  // Audience calculation
  const totalAudience = audienceEstimate?.totalUsers ?? 0;
  const estimatedImpacted = Math.round((totalAudience * (flag.enabled ? rolloutVal : 0)) / 100);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Control Header */}
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
            <Link
              href={`/dashboard/flags${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
              className="underline-offset-4 hover:underline"
            >
              ← Feature Flags
            </Link>
            <span>/</span>
            <span className="font-semibold text-neutral-900 dark:text-white">{flag.name}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">{flag.name}</h1>
            <button
              onClick={() => copyText(flag.key, 'key')}
              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-semibold text-neutral-700 hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Click to copy key"
            >
              <span>{flag.key}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>

            <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {flag.environment}
            </span>

            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
              r{flag.revision}
            </span>

            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                flag.enabled
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {flag.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>

        {/* Quick Action Kill Switch */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsKillSwitchOpen(true)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-xs font-bold transition shadow-sm ${
              flag.enabled
                ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
            {flag.enabled ? 'Safe Kill Switch (Disable)' : 'Enable Flag'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-neutral-200 dark:border-slate-800">
        <TabButton id="overview" label="Overview" active={activeTab} onClick={handleTabChange} />
        <TabButton id="targeting" label="Targeting" active={activeTab} onClick={handleTabChange} />
        <TabButton id="tester" label="Evaluation Tester" active={activeTab} onClick={handleTabChange} />
        <TabButton id="remote_config" label="Remote Config" active={activeTab} onClick={handleTabChange} />
        <TabButton id="analytics" label="Impact & Analytics" active={activeTab} onClick={handleTabChange} />
        <TabButton id="activity" label="Activity & Audit" active={activeTab} onClick={handleTabChange} />
        <TabButton id="settings" label="Settings & SDKs" active={activeTab} onClick={handleTabChange} />
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            {/* Deterministic Rollout Control Card */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">Percentage Rollout</h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                    Deterministic and sticky: Raising the percentage adds new users without reshuffling existing users.
                  </p>
                </div>
                <span className="font-mono text-2xl font-bold text-neutral-900 dark:text-white">{rolloutVal}%</span>
              </div>

              {/* Slider */}
              <div className="mt-5 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={rolloutVal}
                  onChange={(e) => setRolloutVal(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 accent-neutral-900 dark:bg-slate-800 dark:accent-white"
                />
                <div className="flex justify-between text-[11px] font-mono text-neutral-400 dark:text-slate-500">
                  <span>0% (Off)</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100% (All eligible)</span>
                </div>
              </div>

              {/* Estimated audience callout */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
                <div>
                  <span>Eligible project audience: <strong>{totalAudience.toLocaleString()} users</strong></span>
                  <span className="mx-2 text-neutral-300 dark:text-slate-700">|</span>
                  <span>Estimated receiving feature: <strong>~{estimatedImpacted.toLocaleString()} users</strong></span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRolloutVal(100)}
                    className="rounded bg-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-300 dark:bg-slate-800 dark:text-slate-200"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => setRolloutVal(0)}
                    className="rounded bg-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-300 dark:bg-slate-800 dark:text-slate-200"
                  >
                    0%
                  </button>
                </div>
              </div>

              {/* Rollout Save Button */}
              <div className="mt-4 flex items-center justify-end gap-2">
                {rolloutVal !== flag.rolloutPercentage ? (
                  <button
                    type="button"
                    onClick={() => setRolloutVal(flag.rolloutPercentage)}
                    className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-300"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isSavingRollout || rolloutVal === flag.rolloutPercentage}
                  onClick={handleSaveRollout}
                  className="h-8 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                >
                  {isSavingRollout ? 'Saving…' : 'Save Rollout'}
                </button>
              </div>
            </div>

            {/* Quick Targeting Summary Card */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Targeting Rules</h3>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Gated conditions evaluated before applying percentage rollout.
                  </p>
                </div>
                <button
                  onClick={() => handleTabChange('targeting')}
                  className="text-xs font-bold text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                >
                  Edit rules →
                </button>
              </div>

              <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {formatPlainLanguageTargeting(targetGroups)}
              </div>
            </div>

            {/* Remote Config Preview (if configured) */}
            {flag.payload != null ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Remote Config (JSON Payload)</h3>
                    <p className="text-xs text-neutral-500 dark:text-slate-400">
                      Returned to SDK when this flag is active for a user.
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange('remote_config')}
                    className="text-xs font-bold text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                  >
                    Edit JSON →
                  </button>
                </div>

                <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <code>{JSON.stringify(flag.payload, null, 2)}</code>
                </pre>
              </div>
            ) : null}
          </div>

          {/* Right Sidebar: Key Metrics & Status */}
          <div className="space-y-6">
            {/* Status & Exposure Box */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Telemetry & Telemetry</h3>

              <dl className="mt-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <dt className="text-neutral-500 dark:text-slate-400">Environment</dt>
                  <dd className="font-semibold uppercase text-neutral-900 dark:text-white">{flag.environment}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-neutral-500 dark:text-slate-400">Recent exposures (24h)</dt>
                  <dd className="font-mono font-semibold text-neutral-900 dark:text-white">{flag.recentExposures24h.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-neutral-500 dark:text-slate-400">Total exposures</dt>
                  <dd className="font-mono font-semibold text-neutral-900 dark:text-white">{flag.totalExposures.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-neutral-500 dark:text-slate-400">Last evaluated</dt>
                  <dd className="text-neutral-900 dark:text-white">{flag.lastEvaluatedAt ? new Date(flag.lastEvaluatedAt).toLocaleString() : 'Never evaluated'}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-neutral-500 dark:text-slate-400">Config revision</dt>
                  <dd className="font-mono text-neutral-900 dark:text-white">r{flag.revision}</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-slate-800">
                <button
                  onClick={() => handleTabChange('tester')}
                  className="w-full rounded-md border border-neutral-300 bg-white py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  ⚡ Open Evaluation Tester
                </button>
              </div>
            </div>

            {/* SDK Integration Quick Reference */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Code Integration</h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                Quick copy snippet for JS / TypeScript:
              </p>

              <div className="relative mt-3">
                <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] text-slate-100 dark:bg-black">
                  <code>{`if (traceiq.flags.isEnabled('${flag.key}')) {\n  // Run new feature\n}`}</code>
                </pre>
                <button
                  onClick={() => copyText(`if (traceiq.flags.isEnabled('${flag.key}')) {\n  // Run new feature\n}`, 'code snippet')}
                  className="absolute right-2 top-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-neutral-700"
                >
                  Copy
                </button>
              </div>

              <div className="mt-3 text-right">
                <button
                  onClick={() => handleTabChange('settings')}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  View React, Python, Flutter, Node SDKs →
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tab 2: Targeting Builder */}
      {activeTab === 'targeting' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Targeting Rule Builder</h2>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                Gate this feature to specific user segments based on traits provided by your application (e.g. plan, country, email).
              </p>
            </div>

            {/* Plain-Language Summary Banner */}
            <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <span className="font-bold text-neutral-500 dark:text-slate-400 uppercase tracking-wider text-[10px] block mb-1">
                Audience Logic Summary:
              </span>
              {formatPlainLanguageTargeting(targetGroups)}
            </div>

            {/* Target Groups */}
            <div className="mt-6 space-y-6">
              {targetGroups.map((group, groupIdx) => (
                <div
                  key={groupIdx}
                  className="rounded-md border border-neutral-300 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-black">
                        Group {groupIdx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder="Group name (e.g. Premium Web Users)"
                        value={group.name ?? ''}
                        onChange={(e) => {
                          const next = [...targetGroups];
                          next[groupIdx] = { ...next[groupIdx], name: e.target.value };
                          setTargetGroups(next);
                        }}
                        className="h-7 border-0 bg-transparent text-xs font-semibold text-neutral-900 focus:outline-none dark:text-white"
                      />
                    </div>

                    {targetGroups.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetGroups(targetGroups.filter((_, i) => i !== groupIdx));
                        }}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Remove group
                      </button>
                    ) : null}
                  </div>

                  {/* Rules inside group */}
                  <div className="mt-3 space-y-2">
                    {group.rules.length === 0 ? (
                      <p className="py-2 text-xs text-neutral-400 dark:text-slate-500 italic">
                        No rules in this group. Matches all users.
                      </p>
                    ) : (
                      group.rules.map((rule, ruleIdx) => (
                        <div key={ruleIdx} className="flex flex-wrap items-center gap-2 pt-1">
                          {ruleIdx > 0 ? (
                            <span className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
                              AND
                            </span>
                          ) : (
                            <span className="w-10 text-[11px] font-bold text-neutral-400">WHERE</span>
                          )}

                          <input
                            type="text"
                            placeholder="property (e.g. plan)"
                            value={rule.property}
                            onChange={(e) => {
                              const next = [...targetGroups];
                              const r = [...next[groupIdx].rules];
                              r[ruleIdx] = { ...r[ruleIdx], property: e.target.value };
                              next[groupIdx] = { ...next[groupIdx], rules: r };
                              setTargetGroups(next);
                            }}
                            className="h-8 w-44 rounded-md border border-neutral-300 bg-white px-2.5 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          />

                          <select
                            value={rule.operator}
                            onChange={(e) => {
                              const next = [...targetGroups];
                              const r = [...next[groupIdx].rules];
                              r[ruleIdx] = { ...r[ruleIdx], operator: e.target.value as FlagTarget['operator'] };
                              next[groupIdx] = { ...next[groupIdx], rules: r };
                              setTargetGroups(next);
                            }}
                            className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          >
                            {OPERATORS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>

                          {rule.operator !== 'exists' && rule.operator !== 'not_exists' ? (
                            <input
                              type="text"
                              placeholder="value (e.g. premium)"
                              value={String(rule.value ?? '')}
                              onChange={(e) => {
                                const next = [...targetGroups];
                                const r = [...next[groupIdx].rules];
                                r[ruleIdx] = { ...r[ruleIdx], value: e.target.value };
                                next[groupIdx] = { ...next[groupIdx], rules: r };
                                setTargetGroups(next);
                              }}
                              className="h-8 min-w-[160px] flex-1 rounded-md border border-neutral-300 bg-white px-2.5 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            />
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              const next = [...targetGroups];
                              next[groupIdx] = {
                                ...next[groupIdx],
                                rules: next[groupIdx].rules.filter((_, i) => i !== ruleIdx)
                              };
                              setTargetGroups(next);
                            }}
                            className="rounded p-1 text-neutral-400 hover:text-red-600 dark:text-slate-500"
                            title="Remove condition"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      ))
                    )}

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...targetGroups];
                          next[groupIdx] = {
                            ...next[groupIdx],
                            rules: [...next[groupIdx].rules, { property: '', operator: 'eq', value: '' }]
                          };
                          setTargetGroups(next);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        + Add rule
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setTargetGroups([
                      ...targetGroups,
                      { name: `Target Group ${targetGroups.length + 1}`, rules: [{ property: '', operator: 'eq', value: '' }] }
                    ]);
                  }}
                  className="rounded-md border border-dashed border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  + Add targeting group (OR)
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSaveTargeting}
                disabled={isSavingTargeting}
                className="h-9 rounded-md bg-neutral-900 px-5 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              >
                {isSavingTargeting ? 'Saving…' : 'Save Targeting Rules'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tab 3: Evaluation Tester */}
      {activeTab === 'tester' ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
          {/* Simulator Form */}
          <form
            onSubmit={handleRunTestEvaluation}
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Evaluation Tester</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Simulate evaluation against the production engine with any test user and property set.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                User / Distinct ID
              </label>
              <input
                type="text"
                value={testDistinctId}
                onChange={(e) => setTestDistinctId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-3 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                  User Properties (JSON)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTestPropertiesJson('{\n  "plan": "premium",\n  "country": "NG",\n  "email": "dev@traceiq.run"\n}');
                  }}
                  className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                >
                  Insert sample
                </button>
              </div>
              <textarea
                rows={6}
                value={testPropertiesJson}
                onChange={(e) => setTestPropertiesJson(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white p-2.5 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {testError ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {testError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isTesting}
              className="h-9 w-full rounded-md bg-neutral-900 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              {isTesting ? 'Evaluating…' : '⚡ Test Evaluation'}
            </button>
          </form>

          {/* Result Breakdown View */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Simulation Result</h3>

            {testResult ? (
              <div className="space-y-4">
                {/* Big Result Badge */}
                <div
                  className={`flex items-center justify-between rounded-lg p-4 border ${
                    testResult.enabled
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900 font-bold text-base">
                      {testResult.enabled ? '✓' : '✕'}
                    </span>
                    <div>
                      <p className="text-base font-bold">
                        {testResult.enabled ? 'FEATURE ENABLED' : 'FEATURE DISABLED'}
                      </p>
                      <p className="text-xs opacity-90">{testResult.humanReason}</p>
                    </div>
                  </div>

                  <span className="font-mono text-xs uppercase px-2.5 py-1 rounded bg-white dark:bg-slate-900 font-semibold shadow-sm">
                    {testResult.reason}
                  </span>
                </div>

                {/* Bucketing Details */}
                <div className="grid grid-cols-2 gap-3 rounded-md bg-neutral-50 p-3.5 text-xs dark:bg-slate-900">
                  <div>
                    <span className="text-neutral-500 dark:text-slate-400">Deterministic Bucket:</span>
                    <p className="mt-0.5 font-mono text-sm font-bold text-neutral-900 dark:text-white">
                      {testResult.bucket} <span className="font-normal text-xs text-neutral-400">(out of 0–99)</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-500 dark:text-slate-400">Required Rollout:</span>
                    <p className="mt-0.5 font-mono text-sm font-bold text-neutral-900 dark:text-white">
                      {testResult.requiredRollout}% {testResult.bucket < testResult.requiredRollout ? '✓ (Included)' : '✕ (Excluded)'}
                    </p>
                  </div>
                </div>

                {/* Target Groups Breakdown */}
                {testResult.groupDetails.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                      Targeting Evaluation Breakdown
                    </p>
                    {testResult.groupDetails.map((grp) => (
                      <div
                        key={grp.groupIndex}
                        className="rounded border border-neutral-200 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200 dark:border-slate-800">
                          <span className="font-bold text-neutral-800 dark:text-slate-200">{grp.groupName}</span>
                          <span className={`text-[11px] font-bold ${grp.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {grp.passed ? 'PASSED ✓' : 'FAILED ✕'}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1">
                          {grp.rules.map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                              <span>
                                {r.property} {r.operator} {String(r.expectedValue)}
                              </span>
                              <span className="text-neutral-500 dark:text-slate-400">
                                actual: <strong>{String(r.actualValue)}</strong> {r.passed ? '✓' : '✕'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Delivered Payload (if enabled) */}
                {testResult.payload != null ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                      Delivered Payload
                    </p>
                    <pre className="rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                      <code>{JSON.stringify(testResult.payload, null, 2)}</code>
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-neutral-400 dark:text-slate-500">
                Run an evaluation simulation to see the detailed debug breakdown.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Tab 4: Remote Config JSON Editor */}
      {activeTab === 'remote_config' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">Remote Config (JSON Payload)</h2>
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  Deliver dynamic configuration, feature settings, limits, or text copy directly to your application when this flag is active.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFormatPayload}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Format JSON
                </button>
                <button
                  type="button"
                  onClick={() => setPayloadText('')}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              rows={12}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder={'{\n  "dailyScanLimit": 5,\n  "showVoiceInput": true,\n  "banner": "Welcome to NuWell v2"\n}'}
              className="w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400"
              spellCheck={false}
            />

            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400">
              <span>Size: <strong>{new Blob([payloadText]).size} bytes</strong> / 25 KB</span>
              <span>Payload is only delivered to clients when the flag evaluates to <strong>ON</strong>.</span>
            </div>

            {payloadError ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {payloadError}
              </p>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSavePayload}
                disabled={isSavingPayload}
                className="h-9 rounded-md bg-neutral-900 px-5 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              >
                {isSavingPayload ? 'Saving…' : 'Save Remote Config'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tab 5: Impact & Analytics */}
      {activeTab === 'analytics' ? (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Observed Feature Impact</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Compare conversions and error rates between exposed users and unexposed control users.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Conversion event (e.g. meal_logged)"
                value={conversionEventInput}
                onChange={(e) => setConversionEventInput(e.target.value)}
                className="h-8 w-48 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
              <select
                value={analyticsDays}
                onChange={(e) => {
                  setAnalyticsDays(e.target.value);
                  void fetchAnalytics(e.target.value);
                }}
                className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              >
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
              <button
                onClick={() => fetchAnalytics()}
                className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-black"
              >
                Refresh
              </button>
            </div>
          </div>

          {isLoadingAnalytics ? (
            <div className="py-12 text-center text-xs text-neutral-500">Loading impact telemetry…</div>
          ) : analyticsData ? (
            <div className="space-y-6">
              {/* Top Numbers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                    Exposed Users (Active)
                  </span>
                  <p className="mt-1 font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {analyticsData.exposedUsers.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                    Control Users (Unexposed)
                  </span>
                  <p className="mt-1 font-mono text-2xl font-bold text-neutral-900 dark:text-white">
                    {analyticsData.controlUsers.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                    Total Evaluations
                  </span>
                  <p className="mt-1 font-mono text-2xl font-bold text-neutral-900 dark:text-white">
                    {analyticsData.totalExposures.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Conversion and Errors Comparisons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Conversion Comparison */}
                <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Observed Conversion ({analyticsData.conversion.eventName})
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Percentage of users in each group who performed this event.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-indigo-600 dark:text-indigo-400">Exposed Group</span>
                        <span className="font-mono">{analyticsData.conversion.exposedRate}% ({analyticsData.conversion.exposedCount} users)</span>
                      </div>
                      <div className="mt-1 h-3 w-full rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.min(analyticsData.conversion.exposedRate, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-neutral-600 dark:text-slate-400">Control Group</span>
                        <span className="font-mono">{analyticsData.conversion.controlRate}% ({analyticsData.conversion.controlCount} users)</span>
                      </div>
                      <div className="mt-1 h-3 w-full rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neutral-400 dark:bg-slate-600"
                          style={{ width: `${Math.min(analyticsData.conversion.controlRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Errors Comparison */}
                <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Observed Error Rate ($exception)
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Percentage of users in each group who hit any application error.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-red-600 dark:text-red-400">Exposed Group</span>
                        <span className="font-mono">{analyticsData.errors.exposedRate}% ({analyticsData.errors.exposedCount} users)</span>
                      </div>
                      <div className="mt-1 h-3 w-full rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500"
                          style={{ width: `${Math.min(analyticsData.errors.exposedRate * 5, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-neutral-600 dark:text-slate-400">Control Group</span>
                        <span className="font-mono">{analyticsData.errors.controlRate}% ({analyticsData.errors.controlCount} users)</span>
                      </div>
                      <div className="mt-1 h-3 w-full rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neutral-400 dark:bg-slate-600"
                          style={{ width: `${Math.min(analyticsData.errors.controlRate * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Tab 6: Activity & Audit Log */}
      {activeTab === 'activity' ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Change History & Audit Log</h2>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Immutable log of every configuration, targeting, rollout, and status mutation.
            </p>
          </div>

          {isLoadingActivity ? (
            <div className="py-8 text-center text-xs text-neutral-500">Loading audit history…</div>
          ) : activityList.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">No activity recorded yet.</p>
          ) : (
            <ol className="relative border-l border-neutral-200 dark:border-slate-800 ml-3 mt-4 space-y-6">
              {activityList.map((item) => (
                <li key={item.id} className="ml-4 space-y-1">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-neutral-900 dark:bg-white" />
                  <div className="flex items-center gap-2 text-xs">
                    <strong className="text-neutral-900 dark:text-white">{item.actorEmail}</strong>
                    <span className="text-neutral-500 dark:text-slate-400">performed</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
                      {item.action}
                    </span>
                    <span className="text-neutral-400 dark:text-slate-500 font-mono text-[10px]">
                      (rev {item.revision})
                    </span>
                    <span className="text-neutral-400 dark:text-slate-500 ml-auto">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {item.afterState ? (
                    <pre className="mt-1 rounded border border-neutral-200 bg-neutral-50 p-2 font-mono text-[11px] text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      <code>{JSON.stringify(item.afterState, null, 2)}</code>
                    </pre>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {/* Tab 7: Settings & SDK Setup */}
      {activeTab === 'settings' ? (
        <div className="space-y-6">
          {/* SDK Setup Tabs */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">SDK Integration Guides</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Copy-paste integration code for your specific language and framework.
              </p>
            </div>

            <SdkCodeExamples flagKey={flag.key} environment={flag.environment} onCopy={copyText} />
          </div>

          {/* General Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4"
          >
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">General Settings</h3>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">Flag Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">Description</label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="h-9 rounded-md bg-neutral-900 px-5 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              >
                {isSavingSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Danger Zone */}
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-5 dark:border-red-900/40 dark:bg-red-950/20 space-y-4">
            <h3 className="text-sm font-bold text-red-900 dark:text-red-300">Danger Zone</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                  {flag.archivedAt ? 'Restore Feature Flag' : 'Archive Feature Flag'}
                </p>
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  {flag.archivedAt
                    ? 'Restore this flag to active management.'
                    : 'Archiving preserves all exposure analytics and user timeline history while disabling future evaluations.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsArchiveOpen(true)}
                className="h-8 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {flag.archivedAt ? 'Restore flag' : 'Archive flag'}
              </button>
            </div>

            <div className="border-t border-red-200 pt-3 dark:border-red-900/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-red-900 dark:text-red-300">Delete Flag</p>
                <p className="text-xs text-red-700/80 dark:text-red-400">
                  Permanently remove this flag. Use with caution.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteOpen(true)}
                className="h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Kill Switch Modal */}
      <DashboardDialog
        open={isKillSwitchOpen}
        title={flag.enabled ? 'Disable Feature Flag' : 'Enable Feature Flag'}
        description={
          flag.enabled
            ? `Disabling "${flag.key}" currently affects approximately ~${estimatedImpacted.toLocaleString()} eligible users. Disabling it will cause future evaluations to return the fallback value. Targeting, rollout configuration, and history will be preserved.`
            : `Enabling "${flag.key}" will activate evaluation for eligible targeted users according to its ${flag.rolloutPercentage}% rollout.`
        }
        onClose={() => setIsKillSwitchOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsKillSwitchOpen(false)}
              className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleToggleKillSwitch()}
              disabled={isToggling}
              className={`h-9 rounded-md px-4 text-xs font-bold text-white transition disabled:opacity-50 ${
                flag.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isToggling ? 'Updating…' : flag.enabled ? 'Confirm disable' : 'Enable flag'}
            </button>
          </>
        }
      />

      {/* Archive Modal */}
      <DashboardDialog
        open={isArchiveOpen}
        title={flag.archivedAt ? 'Restore Flag' : 'Archive Flag'}
        description={
          flag.archivedAt
            ? `Restore "${flag.key}" back to your active feature flags list?`
            : `Archiving "${flag.key}" will hide it from the active dashboard and disable evaluation. All historical telemetry, conversion impact, and user timeline references will be preserved.`
        }
        onClose={() => setIsArchiveOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsArchiveOpen(false)}
              className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleArchiveToggle()}
              className="h-9 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black"
            >
              {flag.archivedAt ? 'Restore flag' : 'Archive flag'}
            </button>
          </>
        }
      />

      {/* Permanent Delete Modal */}
      <DashboardDialog
        open={isDeleteOpen}
        title="Permanently Delete Flag"
        description={`Are you sure you want to permanently delete "${flag.key}"? This action cannot be undone.`}
        onClose={() => setIsDeleteOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(false)}
              className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeletePermanent()}
              className="h-9 rounded-md bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700"
            >
              Delete permanently
            </button>
          </>
        }
      />
    </div>
  );
}

function TabButton({
  id,
  label,
  active,
  onClick
}: {
  id: TabId;
  label: string;
  active: TabId;
  onClick: (t: TabId) => void;
}) {
  const isSelected = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap ${
        isSelected
          ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
          : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function SdkCodeExamples({
  flagKey,
  environment,
  onCopy
}: {
  flagKey: string;
  environment: string;
  onCopy: (txt: string, label: string) => void;
}) {
  const [lang, setLang] = useState<'js' | 'react' | 'nextjs' | 'node' | 'curl'>('js');

  const snippets: Record<typeof lang, string> = {
    js: `import { traceiq } from 'traceiq-sdk-js';

// Initialize SDK
traceiq.initialize({
  projectId: process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID!,
  writeKey: process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY!,
  environment: '${environment}'
});

// Load flags for the current user and traits
await traceiq.flags.load({ plan: 'pro', country: 'NG' });

// Check flag state (automatically records exposure)
if (traceiq.flags.isEnabled('${flagKey}')) {
  const config = traceiq.flags.getPayload('${flagKey}');
}`,
    react: `'use client';

import { useEffect, useState } from 'react';
import { traceiq } from 'traceiq-sdk-js';

export function FeatureToggleComponent() {
  const [enabled, setEnabled] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    void traceiq.flags.load({ plan: 'pro' }).then(() => {
      const isEnabled = traceiq.flags.isEnabled('${flagKey}');
      setEnabled(isEnabled);
      if (isEnabled) {
        setPayload(traceiq.flags.getPayload('${flagKey}'));
      }
    });
  }, []);

  if (!enabled) return <DefaultComponent />;
  return <NewComponent config={payload} />;
}`,
    nextjs: `import { TraceIQ } from '@traceiq/node';

const traceiq = new TraceIQ({
  projectId: process.env.TRACEIQ_PROJECT_ID!,
  writeKey: process.env.TRACEIQ_WRITE_KEY!
});

export default async function Page({ params }: { params: { userId: string } }) {
  // Server-side deterministic evaluation with safe fallback
  const isEnabled = await traceiq.isFeatureEnabled('${flagKey}', params.userId, {
    defaultValue: false,
    environment: '${environment}',
    properties: { plan: 'pro' }
  });

  const payload = isEnabled
    ? await traceiq.getFeatureFlagPayload('${flagKey}', params.userId, {
        environment: '${environment}'
      })
    : null;

  return isEnabled ? <NewExperience config={payload} /> : <LegacyExperience />;
}`,
    node: `import { TraceIQ } from '@traceiq/node';

const traceiq = new TraceIQ({
  projectId: process.env.TRACEIQ_PROJECT_ID!,
  writeKey: process.env.TRACEIQ_WRITE_KEY!
});

// Evaluate flag for user on backend API / worker
const isEnabled = await traceiq.isFeatureEnabled('${flagKey}', userId, {
  defaultValue: false,
  properties: { plan: 'pro', role: 'admin' },
  environment: '${environment}'
});`,
    curl: `curl -X POST http://localhost:4000/v1/flags/evaluate \\
  -H "Content-Type: application/json" \\
  -H "x-traceiq-write-key: YOUR_WRITE_KEY" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "distinctId": "user_123",
    "environment": "${environment}",
    "properties": { "plan": "pro", "country": "NG" }
  }'`
  };

  const labels: Record<typeof lang, string> = {
    js: 'JavaScript',
    react: 'React',
    nextjs: 'Next.js (App Router)',
    node: 'Node.js',
    curl: 'cURL / REST API'
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2 dark:border-slate-800">
        {(['js', 'react', 'nextjs', 'node', 'curl'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              lang === l
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {labels[l]}
          </button>
        ))}
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-neutral-900 p-4 font-mono text-xs text-slate-100 dark:bg-black">
          <code>{snippets[lang]}</code>
        </pre>
        <button
          onClick={() => onCopy(snippets[lang], `${labels[lang]} snippet`)}
          className="absolute right-3 top-3 rounded bg-neutral-800 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700"
        >
          Copy code
        </button>
      </div>
    </div>
  );
}

function formatPlainLanguageTargeting(groups: FlagTargetGroup[]): string {
  if (groups.length === 0) return 'Targets 100% of all users (no gating rules).';
  const groupSummaries = groups
    .filter((g) => g.rules.length > 0)
    .map((g) => {
      const rulesStr = g.rules
        .map((r) => {
          if (r.operator === 'exists') return `"${r.property}" is set`;
          if (r.operator === 'not_exists') return `"${r.property}" is missing`;
          return `"${r.property}" ${r.operator} "${r.value}"`;
        })
        .join(' AND ');
      return `[ ${rulesStr} ]`;
    });

  if (groupSummaries.length === 0) return 'Targets 100% of all users (no gating rules).';
  return `Matches users where: ${groupSummaries.join(' OR ')}`;
}
