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
import { toast } from '@/lib/toast';

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

  const hasFiringAlerts = alertsSummary && alertsSummary.firing > 0;
  const hasAlerts = alertsSummary && alertsSummary.total > 0;

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

            {/* 1. Alerts rules status indicator (beeping/pulsing dot) */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${hasFiringAlerts
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-neutral-200 bg-neutral-50/70 text-neutral-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'
                }`}
            >
              <span
                className={`size-2 rounded-full ${hasFiringAlerts ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-pulse'
                  }`}
              />
              <span>
                {hasFiringAlerts
                  ? `${alertsSummary.firing} alert firing`
                  : hasAlerts
                    ? 'All alert rules healthy'
                    : 'All systems operational'}
              </span>
            </div>

            {/* 2. Manage monitors button */}
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
