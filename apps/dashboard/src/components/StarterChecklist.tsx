'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
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

function StepMark({ done }: { done: boolean }) {
  return done ? (
    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={1.8} className="shrink-0 text-emerald-500" aria-hidden="true" />
  ) : (
    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-neutral-300 dark:border-slate-600" aria-hidden="true" />
  );
}

function StepRow({ step, isNext }: { step: StarterStep; isNext: boolean }) {
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
 * The getting-started card on the Overview. With no events yet it is the whole page ("hero");
 * once events flow it shrinks to a card above the Overview that can be hidden per project.
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
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(starterDismissKey(projectId)) === '1');
    } catch {
      setDismissed(false); // storage blocked: just show it
    }
  }, [projectId]);

  function hide() {
    setDismissed(true);
    try {
      window.localStorage.setItem(starterDismissKey(projectId), '1');
    } catch {
      // Storage unavailable: it hides for this visit only.
    }
  }

  if (mode === 'none') return null;

  if (mode === 'hero') {
    return (
      <section
        aria-labelledby="starter-title"
        className="mx-auto w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 sm:p-8"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
          {progress.done} of {progress.total} done
        </p>
        <h2 id="starter-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Get {projectName} sending data
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-neutral-500 dark:text-slate-400">
          Your charts, funnels and errors fill in the moment the first event arrives. Start with that one; the rest can wait.
        </p>
        <div className="mt-4">
          <ProgressBar percent={progress.percent} label="Setup progress" />
        </div>
        <ul className="mt-2 divide-y divide-neutral-100 dark:divide-slate-800">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} isNext={step.id === next?.id} />
          ))}
        </ul>
      </section>
    );
  }

  // Compact: events are flowing. Wait for the stored choice before showing, so a hidden card never flashes.
  if (dismissed !== false) return null;
  const remaining = steps.filter((step) => !step.done);

  return (
    <section
      aria-labelledby="starter-title"
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="starter-title" className="text-sm font-semibold text-neutral-900 dark:text-white">
            Finish setting up
          </h2>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {progress.done} of {progress.total} done · {remaining.length} to go
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-32 sm:block">
            <ProgressBar percent={progress.percent} label="Setup progress" />
          </div>
          <button
            type="button"
            onClick={hide}
            className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            Hide
          </button>
        </div>
      </div>
      <ul className="mt-1 divide-y divide-neutral-100 dark:divide-slate-800">
        {remaining.map((step) => (
          <StepRow key={step.id} step={step} isNext={step.id === next?.id} />
        ))}
      </ul>
    </section>
  );
}
