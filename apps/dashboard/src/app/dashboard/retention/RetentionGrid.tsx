interface RetentionCohort {
  cohort: string;
  size: number;
  periods: Array<number | null>;
}

interface RetentionGridProps {
  weeks: number;
  cohorts: RetentionCohort[];
  averages: number[];
}

// Subtle monochrome heat that reads in both themes: --heat is neutral-900 (light) /
// neutral-100 (dark); alpha scales with the retention %.
function heatStyle(pct: number): React.CSSProperties {
  const alpha = (0.05 + (pct / 100) * 0.26).toFixed(3);
  return { backgroundColor: `rgb(var(--heat) / ${alpha})` };
}

function pctOf(count: number | null, size: number): number | null {
  if (count === null) return null;
  if (size <= 0) return 0;
  return Math.round((count / size) * 100);
}

export function RetentionGrid({ weeks, cohorts, averages }: RetentionGridProps) {
  const hasData = cohorts.some((c) => c.size > 0);
  if (!hasData) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
        Not enough activity yet to compute retention. Once users return across weeks, cohorts appear here.
      </div>
    );
  }

  const totalUsers = cohorts.reduce((sum, c) => sum + c.size, 0);
  const headers = Array.from({ length: weeks }, (_, i) => i);

  return (
    <div className="[--heat:23_23_23] dark:[--heat:245_245_245]">
      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-500">
              <th className="px-4 py-2.5 text-left font-semibold">Cohort</th>
              <th className="px-3 py-2.5 text-right font-semibold">Users</th>
              {headers.map((p) => (
                <th key={p} className="min-w-[56px] px-2 py-2.5 text-center font-semibold">
                  W{p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {/* Weighted average across all cohorts */}
            <tr className="border-b border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40">
              <td className="px-4 py-2.5 font-semibold text-neutral-900 dark:text-white">All cohorts</td>
              <td className="px-3 py-2.5 text-right font-mono text-neutral-500 dark:text-neutral-400">
                {totalUsers.toLocaleString()}
              </td>
              {headers.map((p) => {
                const pct = averages[p] ?? 0;
                return (
                  <td key={p} className="px-2 py-2.5 text-center">
                    <div
                      className="rounded px-1 py-1 font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100"
                      style={heatStyle(pct)}
                    >
                      {pct}%
                    </div>
                  </td>
                );
              })}
            </tr>

            {cohorts.map((cohort) => (
              <tr key={cohort.cohort} className="transition hover:bg-neutral-50 dark:hover:bg-neutral-900/30">
                <td className="whitespace-nowrap px-4 py-2.5 text-neutral-700 dark:text-neutral-300">
                  {formatWeek(cohort.cohort)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-neutral-500 dark:text-neutral-400">
                  {cohort.size.toLocaleString()}
                </td>
                {headers.map((p) => {
                  const pct = pctOf(cohort.periods[p] ?? null, cohort.size);
                  if (pct === null) {
                    return <td key={p} className="px-2 py-2.5 text-center text-neutral-300 dark:text-neutral-700">·</td>;
                  }
                  return (
                    <td key={p} className="px-2 py-2.5 text-center">
                      <div
                        className="rounded px-1 py-1 font-mono text-xs text-neutral-900 dark:text-neutral-100"
                        style={heatStyle(pct)}
                        title={`${cohort.periods[p]?.toLocaleString()} of ${cohort.size.toLocaleString()} returned`}
                      >
                        {pct}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        Each row is the week a group of users first appeared. W0 is that first week (always 100%); W1, W2 … show the share who
        came back in later weeks.
      </p>
    </div>
  );
}

function formatWeek(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `Week of ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}`;
}
