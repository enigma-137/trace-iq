'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import { DashboardDialog } from '@/app/dashboard/DashboardDialog';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { useFirstEventListener } from '@/lib/use-first-event';
import {
  buildStarterSteps,
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

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
      {/* The tail points at the mascot. */}
      <span
        aria-hidden="true"
        className="absolute -left-1.5 top-6 size-3 rotate-45 border-b border-l border-neutral-200 bg-neutral-50 dark:border-slate-700 dark:bg-slate-800"
      />
      {children}
    </div>
  );
}

/**
 * The getting-started checklist, led by Trace the mascot. It never takes over the page: a small
 * progress pill sits in the header and opens the checklist as a closable dialog. For a project that
 * has not seen it yet, the dialog opens once on its own so new users find it.
 * While the project has no events, Trace listens for the first one and celebrates when it lands.
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
  const router = useRouter();
  const mode = starterMode(status);
  const steps = buildStarterSteps(status, projectId, projectName);
  const progress = starterProgress(steps);
  const [open, setOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // Listen for the first event only while the dialog is open and there is still none.
  const listener = useFirstEventListener({
    projectId,
    enabled: open && !status.firstEvent,
    onReceived: () => {
      setCelebrating(true);
      router.refresh(); // the pill and steps update from the server
    }
  });

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
    setCelebrating(false);
    try {
      window.localStorage.setItem(starterDismissKey(projectId), '1');
    } catch {
      // Storage unavailable: it only stays closed for this visit.
    }
  }

  if (mode === 'none') return null;

  const firstEventStep = steps.find((step) => step.id === 'firstEvent')!;
  const nextSteps = steps.filter((step) => step.id !== 'project' && step.id !== 'firstEvent');
  const nextUp = nextSteps.find((step) => !step.done) ?? null;
  const waitingForEvent = !status.firstEvent && !celebrating;

  let pose: MascotPose;
  let message: React.ReactNode;
  if (celebrating) {
    pose = 'celebrate';
    message = (
      <>
        <strong className="font-semibold">Your first event just landed!</strong> Your charts are filling in. A few optional steps
        are left below.
      </>
    );
  } else if (!status.firstEvent && listener.status === 'error') {
    pose = 'alert';
    message = listener.error ?? 'I could not start listening. Try again in a moment.';
  } else if (!status.firstEvent && listener.status === 'expired') {
    pose = 'sleeping';
    message = 'I stopped listening after 5 minutes. Wake me up when you are ready to send your first event.';
  } else if (!status.firstEvent) {
    pose = 'waiting';
    message = (
      <>
        Hi, I am <strong className="font-semibold">Trace</strong>. Install TraceIQ and run your app. I am listening, and I will
        shout the moment your first event arrives.
      </>
    );
  } else {
    pose = 'wave';
    message = 'Your data is flowing. A few optional steps will make TraceIQ a lot more useful.';
  }

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
        title={status.firstEvent ? 'Finish setting up' : `Get ${projectName} sending data`}
        maxWidthClass="max-w-xl"
      >
        <div className="flex items-center gap-3">
          <Mascot pose={pose} size={96} float={!celebrating} />
          <SpeechBubble>{message}</SpeechBubble>
        </div>

        <div className="mt-4">
          <ProgressBar percent={progress.percent} label="Setup progress" />
        </div>

        {waitingForEvent ? (
          <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{firstEventStep.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">{firstEventStep.description}</p>
              </div>
              <Link
                href={firstEventStep.href}
                onClick={close}
                className="inline-flex h-8 shrink-0 items-center rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {firstEventStep.cta}
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs dark:border-slate-800">
              {listener.status === 'listening' ? (
                <span className="inline-flex items-center gap-2 text-neutral-500 dark:text-slate-400" role="status">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  Listening for your first event
                </span>
              ) : (
                <span className="text-neutral-500 dark:text-slate-400">Not listening right now</span>
              )}
              {listener.status === 'expired' || listener.status === 'error' ? (
                <button
                  type="button"
                  onClick={() => void listener.restart()}
                  className="font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                >
                  {listener.status === 'error' ? 'Try again' : 'Restart listener'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
          {waitingForEvent ? 'Next steps, when you are ready' : 'Next steps'}
        </p>
        <ul className="mt-1 divide-y divide-neutral-100 dark:divide-slate-800">
          {nextSteps.map((step) => (
            <StepRow key={step.id} step={step} isNext={step.id === nextUp?.id && !waitingForEvent} onNavigate={close} />
          ))}
        </ul>
      </DashboardDialog>
    </>
  );
}
