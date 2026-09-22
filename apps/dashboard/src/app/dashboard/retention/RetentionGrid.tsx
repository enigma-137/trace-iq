'use client';

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

// Restrained blue-tinted intensity scale that preserves scanability without turning into a rainbow heatmap
function heatStyle(pct: number): { className: string; style?: React.CSSProperties } {
  if (pct === 0) {
    return {
      className: 'text-neutral-400 dark:text-slate-500 bg-neutral-100/50 dark:bg-slate-900/30'
    };
  }
  if (pct >= 90) {
    return {
      className: 'bg-blue-600 text-white font-semibold shadow-xs'
    };
  }
  if (pct >= 50) {
    return {
      className: 'bg-blue-500 text-white font-semibold shadow-xs'
    };
  }
  if (pct >= 25) {
    return {
      className: 'bg-blue-500/30 text-blue-950 dark:text-blue-100 font-semibold'
    };
  }
  if (pct >= 10) {
    return {
      className: 'bg-blue-500/20 text-neutral-900 dark:text-slate-100 font-medium'
    };
  }
  // 1% - 9%
  return {
    className: 'bg-blue-500/10 text-neutral-800 dark:text-slate-200'
  };
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
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/70 p-10 text-center dark:border-slate-800 dark:bg-slate-900/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 mb-3">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No cohort activity recorded</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500 dark:text-slate-400">
          Not enough returning user activity yet. As users perform actions across multiple weeks, retention cohorts will automatically populate here.
        </p>
      </div>
    );
  }

  const totalUsers = cohorts.reduce((sum, c) => sum + c.size, 0);
  const headers = Array.from({ length: weeks }, (_, i) => i);

  return (
    <div className="space-y-4">
      {/* Table Header & Explanation Banner */}
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200/80 bg-neutral-50/60 p-4 text-xs dark:border-slate-800/80 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div className="space-y-0.5 text-neutral-600 dark:text-slate-300">
            <p>
              <strong className="font-semibold text-neutral-900 dark:text-white">Understanding Cohort Periods:</strong>{' '}
              <span className="font-mono font-medium text-neutral-900 dark:text-white">W0</span> is the initial acquisition week (100%).{' '}
              <span className="font-mono font-medium text-neutral-900 dark:text-white">W1, W2, W3…</span> track the percentage of that group returning in consecutive weeks.
            </p>
            <p className="text-neutral-500 dark:text-slate-400">
              Higher and flatter percentages indicate sustained recurring value. Steep dropoffs toward 0% signal onboarding friction.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-neutral-400 dark:text-slate-500 self-end sm:self-center">
          <span>Heat intensity:</span>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-xs bg-neutral-100 dark:bg-slate-800" title="0%" />
            <span className="inline-block h-3 w-4 rounded-xs bg-blue-500/15" title="1-10%" />
            <span className="inline-block h-3 w-4 rounded-xs bg-blue-500/30" title="10-25%" />
            <span className="inline-block h-3 w-4 rounded-xs bg-blue-500" title="50%+" />
            <span className="inline-block h-3 w-4 rounded-xs bg-blue-600" title="90-100%" />
          </div>
        </div>
      </div>

      {/* Cohort Matrix Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-slate-800">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-100/70 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
              <th className="py-3 pl-4 pr-3 font-semibold">Cohort</th>
              <th className="py-3 px-3 text-right font-semibold">Users</th>
              {headers.map((p) => (
                <th key={p} className="min-w-[58px] py-3 px-1.5 text-center font-semibold">
                  W{p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/70 dark:divide-slate-800/70">
            {/* Weighted Aggregate Baseline Row */}
            <tr className="border-b-2 border-neutral-300 bg-neutral-50 font-medium dark:border-slate-700 dark:bg-slate-900/60">
              <td className="py-3 pl-4 pr-3 font-semibold text-neutral-900 dark:text-white">
                <div className="flex items-center gap-1.5">
                  <span>All cohorts</span>
                  <span className="rounded bg-neutral-200/70 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                    Average
                  </span>
                </div>
              </td>
              <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-neutral-800 dark:text-slate-200">
                {totalUsers.toLocaleString()}
              </td>
              {headers.map((p) => {
                const pct = averages[p] ?? 0;
                const heat = heatStyle(pct);
                return (
                  <td key={p} className="py-2 px-1 text-center">
                    <div
                      className={`mx-auto flex h-7 items-center justify-center rounded-md font-mono text-xs ${heat.className}`}
                      title={`All cohorts average at W${p}: ${pct}%`}
                    >
                      {pct}%
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Individual Cohort Rows */}
            {cohorts.map((cohort) => (
              <tr
                key={cohort.cohort}
                className="transition-colors hover:bg-neutral-50/80 dark:hover:bg-slate-900/40"
              >
                <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium text-neutral-800 dark:text-slate-200">
                  {formatWeek(cohort.cohort)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-xs text-neutral-500 dark:text-slate-400">
                  {cohort.size.toLocaleString()}
                </td>
                {headers.map((p) => {
                  const returnedCount = cohort.periods[p] ?? null;
                  const pct = pctOf(returnedCount, cohort.size);
                  if (pct === null) {
                    return (
                      <td key={p} className="py-2.5 px-1 text-center font-mono text-xs text-neutral-300 dark:text-slate-700">
                        ·
                      </td>
                    );
                  }
                  const heat = heatStyle(pct);
                  const returnedLabel = returnedCount !== null ? returnedCount.toLocaleString() : '0';
                  return (
                    <td key={p} className="py-1.5 px-1 text-center">
                      <div
                        className={`mx-auto flex h-7 items-center justify-center rounded-md font-mono text-xs transition-transform hover:scale-105 ${heat.className}`}
                        title={`${formatWeek(cohort.cohort)}: ${returnedLabel} of ${cohort.size.toLocaleString()} returned in W${p} (${pct}%)`}
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

      {/* Cohort Insight Footnote */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-neutral-400 dark:text-slate-500 px-1">
        <p>
          Calculated by grouping users by their first active week and tracking recurring sessions over the observation period.
        </p>
        <p className="font-mono text-[11px]">
          {cohorts.length} cohorts · {totalUsers.toLocaleString()} users tracked
        </p>
      </div>
    </div>
  );
}

function formatWeek(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `Week of ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}`;
}
