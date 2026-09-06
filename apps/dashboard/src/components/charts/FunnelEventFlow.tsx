import Link from 'next/link';

interface FunnelEventFlowStep {
  order: number;
  eventName: string;
  label: string | null;
  count: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

interface FunnelEventFlowProps {
  steps: FunnelEventFlowStep[];
  funnelId: string;
  days: string;
}

export function FunnelEventFlow({ steps, funnelId, days }: FunnelEventFlowProps) {
  if (steps.length === 0) return null;

  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Event flow</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Follow the ordered events through this funnel. Broken red connections identify user drop-off.
          </p>
        </div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-mono text-[11px] font-semibold text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="funnel-event-flow">
          {steps.map((step, index) => {
            const isBroken = index > 0 && (step.droppedFromPrevious > 0 || step.conversionFromPrevious < 1);
            const stepHref = `/dashboard/funnels/${funnelId}?days=${days}&step=${index}&status=reached`;

            return (
              <div className="contents" key={`${step.order}-${step.eventName}`}>
                {index > 0 ? (
                  <div
                    className={`funnel-event-connector ${isBroken ? 'is-broken' : 'is-healthy'}`}
                    aria-label={
                      isBroken
                        ? step.droppedFromPrevious > 0
                          ? `${step.droppedFromPrevious.toLocaleString()} dropped before step ${index + 1}`
                          : `No users continued to step ${index + 1}`
                        : `No drop-off before step ${index + 1}`
                    }
                  >
                    <div className="funnel-event-connector-track">
                      {isBroken ? <span className="funnel-event-break">×</span> : <span className="funnel-event-pulse" />}
                    </div>
                    <span className="funnel-event-connector-label">
                      {isBroken
                        ? step.droppedFromPrevious > 0
                          ? `−${step.droppedFromPrevious.toLocaleString()}`
                          : 'no traffic'
                        : `${formatPercent(step.conversionFromPrevious)}`}
                    </span>
                  </div>
                ) : null}

                <Link
                  href={stepHref}
                  className={`funnel-event-node ${isBroken ? 'is-broken' : 'is-healthy'}`}
                  title={`See users who reached ${step.label ?? step.eventName}`}
                >
                  <span className="funnel-event-node-step">Step {index + 1} of {steps.length}</span>
                  <strong title={step.label ?? step.eventName}>{step.label ?? step.eventName}</strong>
                  {step.label ? <code title={step.eventName}>{step.eventName}</code> : null}
                  <span className="funnel-event-node-count">
                    {step.count.toLocaleString()} {step.count === 1 ? 'person' : 'people'}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
