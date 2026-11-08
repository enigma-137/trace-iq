'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import { DashboardDialog } from '@/app/dashboard/DashboardDialog';
import {
  buildStarterSteps,
  nextStarterStep,
  starterDismissKey,
  starterMode,
  starterProgress,
  type OnboardingSteps,
  type StarterStep
} from '@/lib/starter-steps';

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800"
    >
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="9" cy="9" r={radius} fill="none" strokeWidth="2.5" className="stroke-neutral-200 dark:stroke-slate-700" />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        className="stroke-emerald-500 transition-all"
      />
    </svg>
  );
}

function StepMark({ done }: { done: boolean }) {
  return done ? (
    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={1.8} className="shrink-0 text-emerald-500" aria-hidden="true" />
  ) : (
    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-neutral-300 dark:border-slate-600" aria-hidden="true" />
  );
}

function StepRow({ step, isNext, onNavigate }: { step: StarterStep; isNext: boolean; onNavigate: () => void }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5">
        <StepMark done={step.done} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${step.done ? 'text-neutral-400 line-through dark:text-slate-500' : 'text-neutral-900 dark:text-white'}`}>
          {step.title}
        </p>
        {!step.done ? <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">{step.description}</p> : null}
      </div>
      {!step.done ? (
        <Link
          href={step.href}
          onClick={onNavigate}
          className={
            isNext
              ? 'inline-flex h-8 shrink-0 items-center rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
              : 'inline-flex h-8 shrink-0 items-center rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
          }
        >
          {step.cta}
        </Link>
      ) : null}
    </li>
  );
}

/**
 * The getting-started checklist. It never takes over the page: a small progress pill sits in the
 * header and opens the checklist as a closable dialog. For a project that has not seen it yet, the
 * dialog opens once on its own so new users find it, and stays out of the way after being closed.
 */
export function StarterChecklist({
  projectId,
  projectName,
  steps: status
}: {
  projectId: string;
  projectName: string;
  steps: OnboardingSteps;
}) {
  const mode = starterMode(status);
  const steps = buildStarterSteps(status, projectId, projectName);
  const progress = starterProgress(steps);
  const next = nextStarterStep(steps);
  const [open, setOpen] = useState(false);

  // Open automatically the first time a project is seen; remember that it was shown.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(starterDismissKey(projectId)) !== '1') setOpen(true);
    } catch {
      // Storage blocked: leave it closed, the pill is still there.
    }
  }, [projectId]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(starterDismissKey(projectId), '1');
    } catch {
      // Storage unavailable: it only stays closed for this visit.
    }
  }

  if (mode === 'none') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Setup progress: ${progress.done} of ${progress.total} done. Open checklist`}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <ProgressRing percent={progress.percent} />
        <span>
          Setup {progress.done}/{progress.total}
        </span>
      </button>

      <DashboardDialog
        open={open}
        onClose={close}
        title={`Get ${projectName} sending data`}
        description="Your charts, funnels and errors fill in the moment the first event arrives. Start with that one; the rest can wait."
        maxWidthClass="max-w-xl"
      >
        <ProgressBar percent={progress.percent} label="Setup progress" />
        <ul className="mt-2 divide-y divide-neutral-100 dark:divide-slate-800">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} isNext={step.id === next?.id} onNavigate={close} />
          ))}
        </ul>
      </DashboardDialog>
    </>
  );
}
