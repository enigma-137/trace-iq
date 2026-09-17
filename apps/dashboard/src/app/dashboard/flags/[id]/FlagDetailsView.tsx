'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../../DashboardDialog';
import { FlagItem, FlagTarget, FlagTargetGroup } from '../FlagManager';
import { toast } from '@/lib/toast';
import { UserDetailHoverCard, UserPreviewData, formatRelativeTime, formatShortId } from '../UserDetailHoverCard';
import { UserPickerModal } from '../UserPickerModal';

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

  // Specific Users & Overrides state
  const [overrides, setOverrides] = useState<Record<string, boolean>>(flag.overrides ?? {});
  const [resolvedUsersMap, setResolvedUsersMap] = useState<Map<string, UserPreviewData>>(new Map());
  const [isResolvingUsers, setIsResolvingUsers] = useState(false);

  // Modals for adding users
  const [isAddIncludedModalOpen, setIsAddIncludedModalOpen] = useState(false);
  const [isAddExcludedModalOpen, setIsAddExcludedModalOpen] = useState(false);

  // Hover Card state
  const [hoveredUser, setHoveredUser] = useState<UserPreviewData | null>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Targeting Rules state
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
  const [testerMode, setTesterMode] = useState<'known' | 'manual'>('known');
  const [selectedKnownUser, setSelectedKnownUser] = useState<UserPreviewData | null>(null);
  const [isKnownUserPickerOpen, setIsKnownUserPickerOpen] = useState(false);
  const [testDistinctId, setTestDistinctId] = useState('user_test_123');
  const [testPropertiesJson, setTestPropertiesJson] = useState('{\n  "plan": "premium",\n  "country": "NG",\n  "platform": "web"\n}');
  const [isEditingSimulationProps, setIsEditingSimulationProps] = useState(false);
  const [testResult, setTestResult] = useState<TestEvaluationResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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

  // Resolve user display names and metadata for all distinct IDs currently in overrides
  useEffect(() => {
    const overrideIds = Object.keys(overrides);
    if (overrideIds.length === 0) return;

    async function resolveIdentities() {
      setIsResolvingUsers(true);
      try {
        const res = await authFetch('/v1/dashboard/users/resolve', {
          method: 'POST',
          body: JSON.stringify({ distinctIds: overrideIds, projectId })
        });
        if (res && res.ok) {
          const json = (await res.json()) as { persons: UserPreviewData[] };
          const map = new Map<string, UserPreviewData>(resolvedUsersMap);
          for (const person of json.persons) {
            map.set(person.distinctId, person);
            if (person.id) map.set(person.id, person);
            if (person.externalId) map.set(person.externalId, person);
          }
          setResolvedUsersMap(map);
        }
      } catch {
        // fallback
      } finally {
        setIsResolvingUsers(false);
      }
    }

    void resolveIdentities();
  }, [overrides]);

  // Included & Excluded lists
  const includedUsersList = useMemo(() => {
    return Object.entries(overrides)
      .filter(([, val]) => val === true)
      .map(([id]) => {
        return (
          resolvedUsersMap.get(id) || {
            id,
            distinctId: id,
            displayName: id.includes('@') ? id.split('@')[0] : `User ${id.slice(-4).toUpperCase()}`,
            emailMasked: id.includes('@') ? `${id[0]}••••@${id.split('@')[1]}` : null
          }
        );
      });
  }, [overrides, resolvedUsersMap]);

  const excludedUsersList = useMemo(() => {
    return Object.entries(overrides)
      .filter(([, val]) => val === false)
      .map(([id]) => {
        return (
          resolvedUsersMap.get(id) || {
            id,
            distinctId: id,
            displayName: id.includes('@') ? id.split('@')[0] : `User ${id.slice(-4).toUpperCase()}`,
            emailMasked: id.includes('@') ? `${id[0]}••••@${id.split('@')[1]}` : null
          }
        );
      });
  }, [overrides, resolvedUsersMap]);

  function handleRowMouseEnter(u: UserPreviewData, el: HTMLElement) {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredUser(u);
      setHoveredAnchor(el);
    }, 60);
  }

  function handleRowMouseLeave() {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredUser(null);
      setHoveredAnchor(null);
    }, 150);
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
        overrides,
        targetingGroups: targetGroups,
        projectId
      })
    });
    setIsSavingTargeting(false);

    if (!res || !res.ok) {
      toast.error('Failed to save targeting configuration.');
      return;
    }

    toast.success('Targeting rules and audience saved.');
    router.refresh();
  }

  // Add users callback from picker modal
  function handleAddIncludedUsers(selectedUsers: UserPreviewData[]) {
    const nextOverrides = { ...overrides };
    const nextMap = new Map(resolvedUsersMap);
    for (const u of selectedUsers) {
      const key = u.distinctId || u.id;
      nextOverrides[key] = true;
      nextMap.set(key, u);
    }
    setOverrides(nextOverrides);
    setResolvedUsersMap(nextMap);
    toast.success(`Added ${selectedUsers.length} specific ${selectedUsers.length === 1 ? 'user' : 'users'}. Click Save to apply.`);
  }

  function handleAddExcludedUsers(selectedUsers: UserPreviewData[]) {
    const nextOverrides = { ...overrides };
    const nextMap = new Map(resolvedUsersMap);
    for (const u of selectedUsers) {
      const key = u.distinctId || u.id;
      nextOverrides[key] = false;
      nextMap.set(key, u);
    }
    setOverrides(nextOverrides);
    setResolvedUsersMap(nextMap);
    toast.success(`Excluded ${selectedUsers.length} ${selectedUsers.length === 1 ? 'user' : 'users'}. Click Save to apply.`);
  }

  function handleRemoveUser(distinctId: string) {
    const nextOverrides = { ...overrides };
    delete nextOverrides[distinctId];
    setOverrides(nextOverrides);
  }

  function handleClearAllIncluded() {
    const nextOverrides = { ...overrides };
    for (const [id, val] of Object.entries(nextOverrides)) {
      if (val === true) delete nextOverrides[id];
    }
    setOverrides(nextOverrides);
  }

  function handleClearAllExcluded() {
    const nextOverrides = { ...overrides };
    for (const [id, val] of Object.entries(nextOverrides)) {
      if (val === false) delete nextOverrides[id];
    }
    setOverrides(nextOverrides);
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
        setTestError('Invalid properties JSON format.');
        return;
      }
    }

    setIsTesting(true);
    try {
      const res = await authFetch(`/v1/dashboard/flags/${flag.id}/test-evaluation`, {
        method: 'POST',
        body: JSON.stringify({
          distinctId: testDistinctId.trim(),
          properties: parsedProps,
          projectId
        })
      });
      setIsTesting(false);

      if (!res || !res.ok) {
        setTestError('Evaluation failed. Check distinct ID and try again.');
        return;
      }

      const data = (await res.json()) as TestEvaluationResponse;
      setTestResult(data);
    } catch (err) {
      setIsTesting(false);
      setTestError(err instanceof Error ? err.message : 'Evaluation request failed');
    }
  }

  // Selection callback for Evaluation Tester Known User
  function handleSelectTesterUser(usersList: UserPreviewData[]) {
    if (usersList.length === 0) return;
    const user = usersList[0];
    setSelectedKnownUser(user);
    setTestDistinctId(user.distinctId || user.id);

    // Auto-populate stored properties from user's traits & metadata
    const userProps: Record<string, unknown> = {
      ...(user.traits || {}),
      ...(user.traitsPreview || {})
    };
    if (user.lastCountry) userProps.country = user.lastCountry;
    if (user.lastOs) userProps.platform = user.lastOs.toLowerCase();

    setTestPropertiesJson(JSON.stringify(userProps, null, 2));
    setIsEditingSimulationProps(false);
  }

  // 6. Analytics Fetch
  async function fetchAnalytics(daysOverride?: string, eventOverride?: string) {
    setIsLoadingAnalytics(true);
    const d = daysOverride ?? analyticsDays;
    const evt = eventOverride ?? conversionEventInput;
    const params = new URLSearchParams({ days: d });
    if (evt.trim()) params.set('conversionEvent', evt.trim());
    if (projectId) params.set('projectId', projectId);

    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/analytics?${params.toString()}`, {
      method: 'GET'
    });
    setIsLoadingAnalytics(false);

    if (res && res.ok) {
      const data = (await res.json()) as AnalyticsResponse;
      setAnalyticsData(data);
    }
  }

  // 7. Activity History Fetch
  async function fetchActivity() {
    setIsLoadingActivity(true);
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    const res = await authFetch(`/v1/dashboard/flags/${flag.id}/activity?${params.toString()}`, {
      method: 'GET'
    });
    setIsLoadingActivity(false);

    if (res && res.ok) {
      const data = (await res.json()) as { activities: ActivityItem[] };
      setActivityList(data.activities);
    }
  }

  // 8. General Settings Save
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
      toast.error('Failed to save flag settings.');
      return;
    }

    toast.success('Settings updated.');
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
        <TabButton id="targeting" label="Targeting & Users" active={activeTab} onClick={handleTabChange} />
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
                  onClick={handleSaveRollout}
                  disabled={isSavingRollout || rolloutVal === flag.rolloutPercentage}
                  className="h-8 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                >
                  {isSavingRollout ? 'Saving…' : 'Save Rollout %'}
                </button>
              </div>
            </div>

            {/* Audience Overview Summary Card */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">Audience Summary</h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                    Who receives this feature flag in {flag.environment}.
                  </p>
                </div>
                <button
                  onClick={() => handleTabChange('targeting')}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Configure Targeting →
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Specific Users</span>
                  <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">
                    {includedUsersList.length > 0 ? `${includedUsersList.length} included` : 'None'}
                  </p>
                  {excludedUsersList.length > 0 ? (
                    <span className="text-[10px] text-red-600 dark:text-red-400">{excludedUsersList.length} excluded</span>
                  ) : null}
                </div>

                <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Targeting Rules</span>
                  <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">
                    {targetGroups.filter((g) => g.rules.length > 0).length > 0
                      ? `${targetGroups.filter((g) => g.rules.length > 0).length} rule groups`
                      : 'All users eligible'}
                  </p>
                </div>

                <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Rollout Allocation</span>
                  <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">
                    {flag.enabled ? `${rolloutVal}% of audience` : 'Disabled (0%)'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Fast Code Integration snippet */}
          <div className="space-y-6">
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Quick Integration</h3>
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
                  View React, Next.js, Node SDKs →
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
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Targeting & Specific Users</h2>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                Target real TraceIQ users directly or configure rule-based segment filters.
              </p>
            </div>

            {/* Plain-Language Summary Banner */}
            <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <span className="font-bold text-neutral-500 dark:text-slate-400 uppercase tracking-wider text-[10px] block mb-1">
                Audience Precedence & Logic Summary:
              </span>
              <div className="space-y-1">
                <p>
                  <strong>1. Exclusions:</strong> {excludedUsersList.length > 0 ? `${excludedUsersList.length} excluded users always receive FALSE.` : 'No users excluded.'}
                </p>
                <p>
                  <strong>2. Specific Overrides:</strong> {includedUsersList.length > 0 ? `${includedUsersList.length} specific users always receive TRUE.` : 'No explicit user overrides.'}
                </p>
                <p>
                  <strong>3. Rules & Rollout:</strong> {formatPlainLanguageTargeting(targetGroups)} (at {rolloutVal}% percentage rollout).
                </p>
              </div>
            </div>

            {/* Section 1: Specific Included Users */}
            <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-slate-800/80 bg-white dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-slate-850 dark:border-slate-800/60">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Specific Users (Always Included)</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {includedUsersList.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                    These users always receive this feature flag, bypassing targeting rules and percentage rollout.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {includedUsersList.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearAllIncluded}
                      className="text-xs text-neutral-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      Clear all
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsAddIncludedModalOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                  >
                    + Add users
                  </button>
                </div>
              </div>

              {/* Selected Included Users Rows (Names Only) */}
              <div className="mt-3">
                {includedUsersList.length === 0 ? (
                  <p className="py-3 text-xs text-neutral-400 dark:text-slate-500 italic">
                    No specific users selected. Click "+ Add users" to target users by display name.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {includedUsersList.map((user) => (
                      <div
                        key={user.distinctId}
                        tabIndex={0}
                        onFocus={(e) => handleRowMouseEnter(user, e.currentTarget)}
                        onBlur={handleRowMouseLeave}
                        onMouseEnter={(e) => handleRowMouseEnter(user, e.currentTarget)}
                        onMouseLeave={handleRowMouseLeave}
                        className="group flex items-center justify-between rounded-lg border border-neutral-200/80 bg-neutral-50/50 px-3 py-2 transition hover:border-neutral-300 hover:bg-neutral-100/70 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                      >
                        <span className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                          {user.displayName}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveUser(user.distinctId)}
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          title="Remove user from targeting"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Excluded Users */}
            <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-slate-800/80 bg-white dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-slate-850 dark:border-slate-800/60">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Excluded Users (Always Blocked)</h3>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {excludedUsersList.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                    These users are never given access, even if they match targeting rules or rollout percentages.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {excludedUsersList.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearAllExcluded}
                      className="text-xs text-neutral-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      Clear all
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsAddExcludedModalOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-xs font-bold text-neutral-800 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    + Exclude users
                  </button>
                </div>
              </div>

              {/* Selected Excluded Users Rows */}
              <div className="mt-3">
                {excludedUsersList.length === 0 ? (
                  <p className="py-3 text-xs text-neutral-400 dark:text-slate-500 italic">
                    No users excluded. Click "+ Exclude users" to explicitly block known accounts.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {excludedUsersList.map((user) => (
                      <div
                        key={user.distinctId}
                        tabIndex={0}
                        onFocus={(e) => handleRowMouseEnter(user, e.currentTarget)}
                        onBlur={handleRowMouseLeave}
                        onMouseEnter={(e) => handleRowMouseEnter(user, e.currentTarget)}
                        onMouseLeave={handleRowMouseLeave}
                        className="group flex items-center justify-between rounded-lg border border-red-200/60 bg-red-50/30 px-3 py-2 transition hover:border-red-300 dark:border-red-900/30 dark:bg-red-950/20"
                      >
                        <span className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                          {user.displayName}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveUser(user.distinctId)}
                          className="rounded p-1 text-neutral-400 hover:bg-red-100 hover:text-red-700 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-300"
                          title="Remove user from exclusion"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Targeting Rules (Determines everyone else) */}
            <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-slate-800/80 bg-white dark:bg-slate-950">
              <div className="border-b border-neutral-100 pb-3 dark:border-slate-800/60">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Targeting Rules (Determines Everyone Else)</h3>
                <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                  Gate non-overridden users based on traits sent by your application (e.g. plan = premium, country = NG).
                </p>
              </div>

              {/* Target Groups */}
              <div className="mt-4 space-y-6">
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

          {/* User Picker Modal for Included Users */}
          <UserPickerModal
            isOpen={isAddIncludedModalOpen}
            onClose={() => setIsAddIncludedModalOpen(false)}
            onSelectUsers={handleAddIncludedUsers}
            initialSelectedIds={includedUsersList.map((u) => u.distinctId)}
            title="Add specific users (Always eligible)"
            description="Search users by name, email, distinct ID, or traits. Selected users receive this feature directly."
            projectId={projectId}
          />

          {/* User Picker Modal for Excluded Users */}
          <UserPickerModal
            isOpen={isAddExcludedModalOpen}
            onClose={() => setIsAddExcludedModalOpen(false)}
            onSelectUsers={handleAddExcludedUsers}
            initialSelectedIds={excludedUsersList.map((u) => u.distinctId)}
            title="Add excluded users (Always blocked)"
            description="Selected users are explicitly blocked from receiving this feature flag."
            projectId={projectId}
          />

          {/* Branched Hover Details Panel */}
          <UserDetailHoverCard
            user={hoveredUser}
            anchorEl={hoveredAnchor}
            isOpen={hoveredUser !== null && hoveredAnchor !== null}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            }}
            onMouseLeave={handleRowMouseLeave}
          />
        </div>
      ) : null}

      {/* Tab 3: Evaluation Tester */}
      {activeTab === 'tester' ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
            {/* Simulator Form */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">Evaluation Tester</h2>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Simulate evaluation against the production engine with any test user and property set.
                  </p>
                </div>

                {/* Tester Mode Toggle */}
                <div className="flex rounded-md border border-neutral-200 p-0.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTesterMode('known')}
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                      testerMode === 'known'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400'
                    }`}
                  >
                    Known User
                  </button>
                  <button
                    type="button"
                    onClick={() => setTesterMode('manual')}
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                      testerMode === 'manual'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400'
                    }`}
                  >
                    Manual / JSON
                  </button>
                </div>
              </div>

              {/* Mode 1: Known User Selector */}
              {testerMode === 'known' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                      Select Known Project User
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsKnownUserPickerOpen(true)}
                        onMouseEnter={(e) => {
                          if (selectedKnownUser) handleRowMouseEnter(selectedKnownUser, e.currentTarget);
                        }}
                        onMouseLeave={handleRowMouseLeave}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-900 transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-850"
                      >
                        <span className="truncate">
                          {selectedKnownUser ? selectedKnownUser.displayName : 'Search and select user...'}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>

                      {selectedKnownUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKnownUser(null);
                            setTestDistinctId('user_test_123');
                            setTestPropertiesJson('{\n  "plan": "premium",\n  "country": "NG",\n  "platform": "web"\n}');
                          }}
                          className="rounded p-2 text-neutral-400 hover:text-neutral-700 dark:text-slate-500"
                          title="Clear user"
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Evaluation Context & Temporary Overrides */}
                  {selectedKnownUser ? (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-700 dark:text-slate-300">Loaded User Context</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingSimulationProps(!isEditingSimulationProps)}
                          className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {isEditingSimulationProps ? 'Hide simulation overrides' : 'Edit simulation traits'}
                        </button>
                      </div>

                      {isEditingSimulationProps ? (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Simulation Only
                            </span>
                            <span className="text-[10px] text-neutral-400 dark:text-slate-500">
                              Overrides will not mutate real user profile.
                            </span>
                          </div>
                          <textarea
                            rows={4}
                            value={testPropertiesJson}
                            onChange={(e) => setTestPropertiesJson(e.target.value)}
                            className="w-full rounded-md border border-neutral-300 bg-white p-2 font-mono text-[11px] text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                      ) : (
                        <div className="text-[11px] text-neutral-600 dark:text-slate-400 space-y-1">
                          <div>Distinct ID: <code className="font-mono text-neutral-800 dark:text-slate-200">{formatShortId(testDistinctId)}</code></div>
                          {selectedKnownUser.emailMasked && <div>Email: <code className="font-mono text-neutral-800 dark:text-slate-200">{selectedKnownUser.emailMasked}</code></div>}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {testError ? (
                    <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                      {testError}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleRunTestEvaluation()}
                    disabled={isTesting}
                    className="h-9 w-full rounded-md bg-neutral-900 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                  >
                    {isTesting ? 'Evaluating…' : '⚡ Test Evaluation'}
                  </button>
                </div>
              ) : (
                /* Mode 2: Manual Simulation Form */
                <form onSubmit={handleRunTestEvaluation} className="space-y-4">
                  <div className="flex items-center gap-1.5 rounded bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <span>💡 <strong>Manual mode:</strong> Test hypothetical users that do not exist yet.</span>
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
                      rows={5}
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
              )}
            </div>

            {/* Result Breakdown View */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Simulation Result</h3>

              {testResult ? (
                <div className="space-y-4">
                  {/* Big Human-Readable Result Badge */}
                  <div
                    className={`flex items-center justify-between rounded-lg p-4 border ${
                      testResult.enabled
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold tracking-wider uppercase opacity-75">Status</span>
                      <p className="text-xl font-black">{testResult.enabled ? 'FEATURE ENABLED' : 'FEATURE DISABLED'}</p>
                    </div>
                    <span className="rounded bg-white/80 px-2.5 py-1 text-xs font-bold shadow-sm dark:bg-black/60">
                      {testResult.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {/* Human-Readable Details Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="text-neutral-500 dark:text-slate-400">Target User</span>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">
                        {selectedKnownUser ? selectedKnownUser.displayName : formatShortId(testDistinctId)}
                      </p>
                    </div>

                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="text-neutral-500 dark:text-slate-400">Evaluation Reason</span>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">
                        {testResult.reason === 'matched_override_enabled'
                          ? 'Matched Specific User (Forced ON)'
                          : testResult.reason === 'matched_override_disabled'
                            ? 'Matched Excluded User (Forced OFF)'
                            : testResult.reason.startsWith('matched_targeting_group')
                              ? `Matched Targeting Group ${testResult.matchedGroupIndex !== null ? testResult.matchedGroupIndex + 1 : ''}`
                              : testResult.reason === 'disqualified_by_targeting'
                                ? 'Disqualified by Targeting Rules'
                                : testResult.reason === 'rollout_bucket_included'
                                  ? 'Included in Rollout'
                                  : testResult.reason === 'rollout_bucket_excluded'
                                    ? 'Excluded by Rollout'
                                    : testResult.reason}
                      </p>
                    </div>

                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="text-neutral-500 dark:text-slate-400">Deterministic Bucket</span>
                      <p className="mt-1 font-mono font-bold text-neutral-900 dark:text-white">
                        {testResult.bucket} / 100
                      </p>
                    </div>

                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="text-neutral-500 dark:text-slate-400">Flag Revision</span>
                      <p className="mt-1 font-mono font-bold text-neutral-900 dark:text-white">
                        r{testResult.revision}
                      </p>
                    </div>
                  </div>

                  {/* Technical Details Accordion */}
                  <div className="border-t border-neutral-100 pt-3 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                      className="flex w-full items-center justify-between text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      <span>{showTechnicalDetails ? '▾ Hide technical details' : '▸ View technical details'}</span>
                      <span className="font-mono text-[10px] text-neutral-400">{testResult.reason}</span>
                    </button>

                    {showTechnicalDetails ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-[11px] text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                          <div>Distinct ID: {testDistinctId}</div>
                          <div>Environment: {testResult.environment}</div>
                          <div>Required Rollout: {testResult.requiredRollout}%</div>
                          <div>Human Reason: {testResult.humanReason}</div>
                        </div>

                        {testResult.groupDetails && testResult.groupDetails.length > 0 ? (
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold text-neutral-700 dark:text-slate-300">Rule Evaluation Breakdown:</span>
                            {testResult.groupDetails.map((grp) => (
                              <div key={grp.groupIndex} className="rounded border border-neutral-200 p-2 text-xs dark:border-slate-800">
                                <div className="flex items-center justify-between font-semibold">
                                  <span>{grp.groupName}</span>
                                  <span className={grp.passed ? 'text-emerald-600' : 'text-red-600'}>
                                    {grp.passed ? 'Passed' : 'Failed'}
                                  </span>
                                </div>
                                <div className="mt-1 space-y-1">
                                  {grp.rules.map((r, rIdx) => (
                                    <div key={rIdx} className="font-mono text-[10px] text-neutral-500 dark:text-slate-400">
                                      {r.property} {r.operator} "{String(r.expectedValue)}" → actual: "{String(r.actualValue)}" ({r.passed ? '✓' : '✗'})
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-neutral-400 dark:text-slate-500">
                  Select a user or enter properties and click <strong>⚡ Test Evaluation</strong> to run simulation.
                </div>
              )}
            </div>
          </div>

          {/* User Picker for Evaluation Tester */}
          <UserPickerModal
            isOpen={isKnownUserPickerOpen}
            onClose={() => setIsKnownUserPickerOpen(false)}
            onSelectUsers={handleSelectTesterUser}
            title="Select user to test"
            description="Pick any real user to automatically load their stored distinct ID, traits, and metadata."
            projectId={projectId}
          />
        </div>
      ) : null}

      {/* Tab 4: Remote Config */}
      {activeTab === 'remote_config' ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Dynamic Remote Config Payload</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                JSON configuration delivered dynamically to eligible clients when the flag evaluates to enabled.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFormatPayload}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Format JSON
            </button>
          </div>

          <div>
            <textarea
              rows={12}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder="e.g. { &quot;theme&quot;: &quot;dark&quot;, &quot;discountPercent&quot;: 20, &quot;badge&quot;: &quot;BETA&quot; }"
              className="w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          {payloadError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {payloadError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
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
      ) : null}

      {/* Tab 5: Impact & Analytics */}
      {activeTab === 'analytics' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Telemetry & Conversion Impact</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Live exposure volume, error rate comparison, and downstream conversion metrics.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={analyticsDays}
                onChange={(e) => {
                  setAnalyticsDays(e.target.value);
                  void fetchAnalytics(e.target.value);
                }}
                className="h-8 rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-semibold text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              >
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </div>

          {isLoadingAnalytics ? (
            <div className="py-12 text-center text-xs text-neutral-500">Loading exposure telemetry…</div>
          ) : analyticsData ? (
            <div className="space-y-6">
              {/* Metrics cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Total Evaluations</span>
                  <p className="mt-1 text-2xl font-black text-neutral-900 dark:text-white">
                    {analyticsData.totalExposures.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Exposed Active Users</span>
                  <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {analyticsData.exposedUsers.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">Control (Disabled) Users</span>
                  <p className="mt-1 text-2xl font-black text-neutral-700 dark:text-slate-300">
                    {analyticsData.controlUsers.toLocaleString()}
                  </p>
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

// 1. Identify user (binds distinctId and traits for targeted evaluation)
traceiq.identify({
  userId: user.id,
  traits: { plan: user.plan, country: 'NG' }
});

// 2. Load flags for the identified user
await traceiq.flags.load();

// 3. Check flag state (automatically records exposure)
if (traceiq.flags.isEnabled('${flagKey}')) {
  const config = traceiq.flags.getPayload('${flagKey}');
}`,
    react: `'use client';

import { useEffect, useState } from 'react';
import { traceiq } from 'traceiq-sdk-js';

export function FeatureToggleComponent({ user }: { user: { id: string; plan: string } }) {
  const [enabled, setEnabled] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    // 1. Identify user with their traits
    traceiq.identify({ userId: user.id, traits: { plan: user.plan } });

    // 2. Load flags for the identified user
    void traceiq.flags.load().then(() => {
      const isEnabled = traceiq.flags.isEnabled('${flagKey}');
      setEnabled(isEnabled);
      if (isEnabled) {
        setPayload(traceiq.flags.getPayload('${flagKey}'));
      }
    }).catch(() => {
      // Graceful fallback to false on network error
      setEnabled(false);
    });
  }, [user.id, user.plan]);

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
