import { StatTile } from '@/components/charts/StatTile';
import type { AdminActivation } from '@/lib/admin';
import { formatDuration, percent } from '@/lib/activation-format';

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500';

const show = (value: number | null) => (value === null ? '–' : `${value}%`);

const weekLabel = (weekStart: string) =>
  new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const ageLabel = (createdAt: string) => {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600_000;
  return hours < 48 ? `${Math.max(1, Math.round(hours))} h ago` : `${Math.round(hours / 24)} days ago`;
};

/** A count with its share of the signups in that row, and a bar to read the drop-off at a glance. */
function Stage({ count, of }: { count: number; of: number }) {
  const share = percent(count, of);
  return (
    <td className="px-3 py-2.5 align-middle">
      <div className="flex items-center gap-2">
        <span className="w-6 text-right text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">{count}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800" aria-hidden="true">
          <span className="block h-full rounded-full bg-blue-500" style={{ width: `${share ?? 0}%` }} />
        </span>
        <span className="w-9 text-xs tabular-nums text-neutral-500 dark:text-slate-400">{show(share)}</span>
      </div>
    </td>
  );
}

/** Operator view: where new workspaces stall between signing up and still sending a week later. */
export function AdminActivationSection({ activation }: { activation: AdminActivation }) {
  const { totals, weeks, stalled } = activation;
  const rows = weeks.filter((week) => week.signedUp > 0);

  return (
    <section className="mb-5" aria-labelledby="activation-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activation-heading" className={labelClass}>
          Activation · workspaces that signed up in the last 8 weeks
        </h2>
        <span className="text-xs text-neutral-500 dark:text-slate-400">Median time to first event: {formatDuration(activation.medianHoursToFirstEvent)}</span>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Signed up" value={totals.signedUp} hint="workspaces created" />
        <StatTile
          label="Made a project"
          value={show(percent(totals.createdProject, totals.signedUp))}
          hint={`${totals.createdProject} of ${totals.signedUp}`}
        />
        <StatTile
          label="Sent a first event"
          value={show(percent(totals.sentEvent, totals.signedUp))}
          hint={`${totals.sentEvent} of ${totals.signedUp}`}
          tone="green"
        />
        <StatTile
          label="Still sending after a week"
          value={show(percent(totals.returned, totals.eligibleForReturn))}
          hint={totals.eligibleForReturn > 0 ? `${totals.returned} of ${totals.eligibleForReturn} that are old enough` : 'None are a week old yet'}
          tone="green"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr]">
        <div className={`${cardClass} overflow-x-auto`}>
          <p className={labelClass}>By signup week</p>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400">No workspaces have signed up in this period.</p>
          ) : (
            <table className="mt-3 w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-100 text-[11px] uppercase tracking-wide text-neutral-400 dark:border-slate-800 dark:text-slate-500">
                  <th className="px-3 py-2 font-semibold">Week of</th>
                  <th className="px-3 py-2 font-semibold">Signed up</th>
                  <th className="px-3 py-2 font-semibold">Project</th>
                  <th className="px-3 py-2 font-semibold">First event</th>
                  <th className="px-3 py-2 font-semibold">After a week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                {[...rows].reverse().map((week) => (
                  <tr key={week.weekStart}>
                    <td className="px-3 py-2.5 text-sm text-neutral-700 dark:text-slate-300">{weekLabel(week.weekStart)}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">{week.signedUp}</td>
                    <Stage count={week.createdProject} of={week.signedUp} />
                    <Stage count={week.sentEvent} of={week.signedUp} />
                    {week.eligibleForReturn > 0 ? (
                      <Stage count={week.returned} of={week.eligibleForReturn} />
                    ) : (
                      <td className="px-3 py-2.5 text-xs text-neutral-400 dark:text-slate-500">Too early</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={cardClass}>
          <p className={labelClass}>Stalled · nothing sent yet</p>
          {stalled.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400">Every recent signup has sent an event.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 dark:divide-slate-800">
              {stalled.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-slate-400">{ageLabel(item.createdAt)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      item.stage === 'no_project'
                        ? 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                    }`}
                  >
                    {item.stage === 'no_project' ? 'No project' : 'Project, no events'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
