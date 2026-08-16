import { formatCount } from '@/lib/metrics';

export interface DebugSample {
  actor: string;
  userId: string | null;
  anonymousId: string | null;
  occurredAt: string;
  receivedAt: string;
}

export interface DebugStep {
  index: number;
  eventName: string;
  label: string | null;
  eventCount: number;
  actorCount: number;
  qualifiedCount: number;
  samples: DebugSample[];
}

export interface FunnelDebugData {
  funnel: { id: string; name: string };
  projectId: string;
  from: string;
  to: string;
  days: number;
  steps: DebugStep[];
  eventNames: Array<{ eventName: string; eventCount: number }>;
}

type Tone = 'ok' | 'warn' | 'miss';

const TONE_STYLES: Record<Tone, { badge: string; bar: string }> = {
  ok: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    bar: 'bg-emerald-500 dark:bg-emerald-400'
  },
  warn: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    bar: 'bg-amber-400 dark:bg-amber-400'
  },
  miss: {
    badge: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
    bar: 'bg-red-500 dark:bg-red-400'
  }
};

function stepTone(step: DebugStep): Tone {
  if (step.qualifiedCount > 0) return 'ok';
  if (step.eventCount === 0) return 'miss';
  return 'warn';
}

function stepTitle(step: DebugStep, tone: Tone): string {
  if (tone === 'ok') return 'Converting';
  if (tone === 'miss') return 'Missing event name';
  return 'Events exist, none qualify';
}

function stepHint(step: DebugStep, tone: Tone, days: number): string {
  const name = `\`${step.eventName}\``;
  if (tone === 'miss') {
    return `0 events with the exact name ${name} exist in this project for the last ${days} days (matches are case-sensitive). Check the exact event name your app sends.`;
  }
  if (tone === 'warn') {
    return `${formatCount(step.eventCount)} ${step.eventCount === 1 ? 'event' : 'events'} with ${name} exist, but none qualify for this step. Either these actors dropped at an earlier step, or the timestamps fall outside the step ordering (check the samples below for out-of-order occurredAt times).`;
  }
  return `${formatCount(step.qualifiedCount)} ${step.qualifiedCount === 1 ? 'actor' : 'actors'} reached this step in the last ${days} days.`;
}

function formatTs(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) +
    ' UTC'
  );
}

export function FunnelDebugPanel({ data }: { data: FunnelDebugData }) {
  const funnelNames = new Set(data.steps.map((step) => step.eventName));
  const observedNames = new Set(data.eventNames.map((entry) => entry.eventName));
  const absent = data.steps.filter((step) => !observedNames.has(step.eventName));
  const hasIssue = data.steps.some((step) => stepTone(step) !== 'ok');

  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Funnel ↔ events check</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {data.days}d window · raw events that exist in this project vs. what actually reaches each step
          </p>
        </div>
        {hasIssue ? (
          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
            Needs attention
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
            All steps matching
          </span>
        )}
      </div>

      <div className="divide-y divide-neutral-200 dark:divide-slate-800">
        {data.steps.map((step) => {
          const tone = stepTone(step);
          const styles = TONE_STYLES[tone];
          const percentage = step.eventCount > 0 ? Math.round((step.qualifiedCount / step.eventCount) * 100) : 0;
          return (
            <div key={step.index} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-semibold text-neutral-400 dark:text-slate-500">Step {step.index + 1}</span>
                <span className="min-w-0">
                  <span className="font-mono text-sm font-medium text-neutral-900 [overflow-wrap:anywhere] dark:text-white">
                    {step.eventName}
                  </span>
                  {step.label && step.label !== step.eventName ? (
                    <span className="ml-2 text-sm text-neutral-500 dark:text-slate-400">{step.label}</span>
                  ) : null}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles.badge}`}>
                  {stepTitle(step, tone)}
                </span>
              </div>

              <p className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-slate-300">{stepHint(step, tone, data.days)}</p>

              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">Raw events in window</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">{step.eventCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">Distinct actors</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">{step.actorCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">Reached this step (funnel)</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">{step.qualifiedCount.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
                  {percentage}% of raw events reach this step
                </p>
              </div>

              {step.samples.length > 0 ? (
                <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                    Sample events
                  </p>
                  <div className="divide-y divide-neutral-200 dark:divide-slate-800">
                    {step.samples.map((sample, i) => {
                      const actorKey = sample.userId ?? sample.anonymousId ?? sample.actor;
                      const outOfOrder =
                        sample.occurredAt && sample.receivedAt && new Date(sample.occurredAt) > new Date(sample.receivedAt);
                      return (
                        <div key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-sm">
                          <span className="min-w-0 truncate font-mono text-xs text-neutral-700 [overflow-wrap:anywhere] dark:text-slate-300">
                            {actorKey}
                            {sample.userId ? <span className="ml-1.5 text-neutral-400 dark:text-slate-500">identified</span> : null}
                          </span>
                          <span className="flex items-center gap-3 text-xs tabular-nums text-neutral-500 dark:text-slate-400">
                            <span title={`occurred_at ${sample.occurredAt}`}>at {formatTs(sample.occurredAt)}</span>
                            <span title={`received_at ${sample.receivedAt}`}>in {formatTs(sample.receivedAt)}</span>
                            {outOfOrder ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">occurred&nbsp;&gt; received</span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-200 px-5 py-4 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          All event names observed in this project · last {data.days}d
        </p>
        {absent.length > 0 ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-slate-300">
            Not observed at all:
            {absent.map((step) => (
              <code key={step.index} className="ml-2 rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {step.eventName}
              </code>
            ))}
          </p>
        ) : null}
        {data.eventNames.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-slate-400">No events in this window yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.eventNames.map((entry) => {
              const inFunnel = funnelNames.has(entry.eventName);
              return (
                <span
                  key={entry.eventName}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs ring-1 ${
                    inFunnel
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'
                      : 'bg-neutral-50 text-neutral-600 ring-neutral-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                  }`}
                  title={inFunnel ? 'Used by this funnel' : 'Not used by this funnel'}
                >
                  {entry.eventName}
                  <span className="font-semibold tabular-nums">{formatCount(entry.eventCount)}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}