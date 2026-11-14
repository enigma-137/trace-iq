'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Notification02Icon from '@hugeicons/core-free-icons/Notification02Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { MobileNav } from './MobileNav';
import { ProjectSwitcher } from './ProjectSwitcher';
import { DashboardDialog } from './DashboardDialog';
import { FeedbackButton } from './FeedbackButton';
import { toast } from '@/lib/toast';
import { type ProjectHealth, healthLogsHref, useProjectHealth } from '@/lib/health';

interface AlertsSummary {
  total: number;
  firing: number;
  healthy: number;
}

interface DashboardHeaderProps {
  active: string;
  title?: string;
  organizationName?: string | null;
  projectName?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  alertsSummary?: AlertsSummary | null;
  userEmail?: string | null;
  headerActions?: React.ReactNode;
}

export function DashboardHeader({
  active,
  title,
  organizationName,
  projectName,
  projectId,
  organizationId,
  alertsSummary,
  userEmail,
  headerActions
}: DashboardHeaderProps) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const displayOrg = organizationName || null;
  const displayProject = projectName || null;

  // The pill follows the data, not only alert rules: a project with no rules must not
  // read "All systems operational" while its users can't sign in.
  const health = useProjectHealth(projectId);
  const pill = headerPill(health, alertsSummary ?? null);

  async function copyProjectId() {
    if (!projectId) return;
    try {
      await navigator.clipboard.writeText(projectId);
      setCopiedId(true);
      toast.success('Project ID copied to clipboard');
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-white/90 px-5 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-8">
        <div className="flex items-center justify-between gap-4">
          {/* Far Left: Breadcrumb Organization > Project Name (Clickable for Project ID modal, no visible ID) */}
          <div className="flex min-w-0 items-center gap-3">
            <img className="h-7 w-auto dark:hidden lg:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />

            <div className="flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
              {displayOrg && displayProject ? (
                <>
                  <span className="truncate font-semibold text-neutral-500 dark:text-slate-400">{displayOrg}</span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    strokeWidth={2}
                    className="shrink-0 text-neutral-300 dark:text-slate-600"
                    aria-hidden="true"
                  />
                  <ProjectSwitcher
                    variant="inline"
                    target="current"
                    projectId={projectId}
                    organizationId={organizationId}
                    fallbackName={displayProject}
                    onShowDetails={projectId ? () => setIsProjectModalOpen(true) : undefined}
                  />
                </>
              ) : (
                <h1 id="dashboard-title" className="truncate text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  {title || 'Overview'}
                </h1>
              )}
            </div>
          </div>

          {/* Far Right: Alert rules status beeping, Manage monitors, and Settings gear icon */}
          <div className="flex items-center gap-2.5">
            {headerActions}

            {/* 1. Health from recent data and alert rules (pulsing dot) */}
            <Link
              href={pill.href(projectId)}
              title={pill.title}
              className={`hidden sm:inline-flex max-w-[22rem] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:opacity-90 ${PILL_TONE[pill.tone]}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${PILL_DOT[pill.tone]}`} />
              <span className="truncate">{pill.label}</span>
            </Link>

            {/* 2. Feedback to the TraceIQ team */}
            <FeedbackButton projectId={projectId} />

            {/* 3. Manage monitors button */}
            <Link
              href={projectId ? `/dashboard/alerts?projectId=${encodeURIComponent(projectId)}` : '/dashboard/alerts'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <HugeiconsIcon icon={Notification02Icon} size={14} strokeWidth={1.8} className="text-neutral-500 dark:text-slate-400" />
              <span className="hidden sm:inline">Manage monitors</span>
            </Link>

            {/* 3. Manage / Settings with gear icon */}
            <Link
              href={projectId ? `/dashboard/settings?projectId=${encodeURIComponent(projectId)}` : '/dashboard/settings'}
              title="Project & workspace settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Settings"
            >
              <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.8} />
            </Link>

            {/* Mobile Nav Hamburger */}
            <MobileNav active={active} projectId={projectId} userEmail={userEmail} organizationId={organizationId} />
          </div>
        </div>
      </header>

      {/* Project ID Details & Copy Modal (No code snippet) */}
      {projectId ? (
        <DashboardDialog
          open={isProjectModalOpen}
          title="Project Details & Identifier"
          description="Your SDKs send this ID with a write key. Write keys are created and rotated in Settings."
          onClose={() => setIsProjectModalOpen(false)}
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <Link
                href={`/dashboard/settings?projectId=${encodeURIComponent(projectId)}`}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Go to Project Settings &rarr;
              </Link>
              <button
                type="button"
                onClick={() => setIsProjectModalOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-900 px-4 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Project & Org info */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-400 dark:text-slate-500">Project Name:</span>
                  <p className="font-semibold text-neutral-900 dark:text-white">{displayProject || 'Project'}</p>
                </div>
                <div>
                  <span className="text-neutral-400 dark:text-slate-500">Organization:</span>
                  <p className="font-semibold text-neutral-900 dark:text-white">{displayOrg || 'Organization'}</p>
                </div>
              </div>
            </div>

            {/* Project ID copy field */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Project ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={projectId}
                  className="h-9 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 font-mono text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void copyProjectId()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
                >
                  {copiedId ? (
                    <>
                      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.8} />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </DashboardDialog>
      ) : null}
    </>
  );
}

type PillTone = 'outage' | 'degraded' | 'ok' | 'neutral';

const PILL_TONE: Record<PillTone, string> = {
  outage: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
  degraded: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  ok: 'border-neutral-200 bg-neutral-50/70 text-neutral-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  neutral: 'border-neutral-200 bg-neutral-50/70 text-neutral-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400'
};

const PILL_DOT: Record<PillTone, string> = {
  outage: 'bg-rose-500 animate-ping',
  degraded: 'bg-amber-500 animate-pulse',
  ok: 'bg-emerald-500 animate-pulse',
  neutral: 'bg-neutral-400 dark:bg-slate-500'
};

interface HeaderPill {
  tone: PillTone;
  label: string;
  title: string;
  href: (projectId?: string | null) => string;
}

const alertsHref = (projectId?: string | null) =>
  projectId ? `/dashboard/alerts?projectId=${encodeURIComponent(projectId)}` : '/dashboard/alerts';

/**
 * The worst of what the data says and what alert rules say. Failures in the data win
 * over "all alert rules healthy", because rules only cover what someone thought to set up.
 */
function headerPill(health: ProjectHealth | null, alerts: AlertsSummary | null): HeaderPill {
  const firing = alerts?.firing ?? 0;
  if (health && (health.status === 'outage' || health.status === 'degraded')) {
    const outage = health.status === 'outage';
    const extra = firing > 0 ? ` · ${firing} alert${firing === 1 ? '' : 's'} firing` : '';
    return {
      tone: outage ? 'outage' : 'degraded',
      label: `${outage ? 'Outage' : 'Degraded'}: ${shortFailureLabel(health)}${extra}`,
      title: health.summary,
      href: healthLogsHref
    };
  }
  if (firing > 0) {
    return { tone: 'outage', label: `${firing} alert${firing === 1 ? '' : 's'} firing`, title: 'Open alerts', href: alertsHref };
  }
  if (!health) {
    // Not loaded yet, or the API is unreachable: say nothing rather than "operational".
    return { tone: 'neutral', label: 'Checking status…', title: 'Checking recent errors and failed requests', href: alertsHref };
  }
  if (health.status === 'idle') {
    return { tone: 'neutral', label: 'No traffic in the last hour', title: health.summary, href: alertsHref };
  }
  const rules = (alerts?.total ?? 0) > 0;
  return {
    tone: 'ok',
    label: 'All systems operational',
    title: rules ? 'No failures in the last hour, and all alert rules are healthy' : 'No failures in the last hour. Set up alert rules to get notified.',
    href: alertsHref
  };
}

/** The single most important number, short enough for the header. */
function shortFailureLabel(health: ProjectHealth): string {
  const f = health.failures;
  if (f.networkErrors > 0) return `${f.networkErrors} request${f.networkErrors === 1 ? '' : 's'} got no response`;
  if (f.serverErrors > 0) return `${f.serverErrors} server error${f.serverErrors === 1 ? '' : 's'}`;
  if (f.failedRequests > 0) return `${f.failedRequests} failed request${f.failedRequests === 1 ? '' : 's'}`;
  if (f.exceptions > 0) return `${f.exceptions} error${f.exceptions === 1 ? '' : 's'}`;
  if (f.topFailedAction) return `${f.topFailedAction.name} × ${f.topFailedAction.count}`;
  return health.summary;
}
