// Activation funnel for the operator console: of the workspaces that signed up each week,
// how many created a project, sent a first event, and were still sending a week later.
// Pure functions only, so the numbers can be tested without a database.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const ACTIVATION_WEEKS = 8;
export const RETURN_AFTER_DAYS = 7;
const STALLED_LIMIT = 15;
// A workspace created a moment ago hasn't had a chance to install anything yet.
const STALLED_GRACE_MS = HOUR_MS;

export interface ActivationOrgRow {
  [column: string]: unknown;
  id: string;
  name: string;
  createdAt: string | Date;
  projectCount: number;
  firstEventAt: string | Date | null;
  lastEventAt: string | Date | null;
}

export interface ActivationWeek {
  [column: string]: unknown;
  /** Monday of the signup week, UTC (YYYY-MM-DD). */
  weekStart: string;
  signedUp: number;
  createdProject: number;
  sentEvent: number;
  /** Workspaces whose first event is at least a week old, so a return can be judged. */
  eligibleForReturn: number;
  /** Of those, how many sent another event at least a week after their first. */
  returned: number;
}

export interface ActivationStalled {
  [column: string]: unknown;
  id: string;
  name: string;
  createdAt: string;
  stage: 'no_project' | 'no_events';
}

export interface AdminActivation {
  [column: string]: unknown;
  weeks: ActivationWeek[];
  totals: Omit<ActivationWeek, 'weekStart'>;
  /** Median hours from signup to first event, over workspaces that sent one. */
  medianHoursToFirstEvent: number | null;
  stalled: ActivationStalled[];
}

const toMs = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Monday 00:00 UTC of the week containing `ms`. */
export function weekStartMs(ms: number): number {
  const day = new Date(ms);
  day.setUTCHours(0, 0, 0, 0);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return day.getTime() - sinceMonday * DAY_MS;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildActivation(rows: ActivationOrgRow[], now: Date = new Date()): AdminActivation {
  const nowMs = now.getTime();
  const currentWeek = weekStartMs(nowMs);
  const weeks: ActivationWeek[] = Array.from({ length: ACTIVATION_WEEKS }, (_, index) => ({
    weekStart: isoDay(currentWeek - (ACTIVATION_WEEKS - 1 - index) * 7 * DAY_MS),
    signedUp: 0,
    createdProject: 0,
    sentEvent: 0,
    eligibleForReturn: 0,
    returned: 0
  }));
  const byStart = new Map(weeks.map((week) => [week.weekStart, week]));

  const hoursToFirstEvent: number[] = [];
  const stalled: ActivationStalled[] = [];

  for (const row of rows) {
    const created = toMs(row.createdAt);
    if (created === null) continue;
    const week = byStart.get(isoDay(weekStartMs(created)));
    if (!week) continue; // older than the window

    const first = toMs(row.firstEventAt);
    const last = toMs(row.lastEventAt);

    week.signedUp += 1;
    if (row.projectCount > 0) week.createdProject += 1;

    if (first !== null) {
      week.sentEvent += 1;
      hoursToFirstEvent.push(Math.max(0, (first - created) / HOUR_MS));
      if (nowMs - first >= RETURN_AFTER_DAYS * DAY_MS) {
        week.eligibleForReturn += 1;
        if (last !== null && last - first >= RETURN_AFTER_DAYS * DAY_MS) week.returned += 1;
      }
    } else if (nowMs - created >= STALLED_GRACE_MS) {
      stalled.push({
        id: row.id,
        name: row.name,
        createdAt: new Date(created).toISOString(),
        stage: row.projectCount > 0 ? 'no_events' : 'no_project'
      });
    }
  }

  const totals = weeks.reduce(
    (sum, week) => ({
      signedUp: sum.signedUp + week.signedUp,
      createdProject: sum.createdProject + week.createdProject,
      sentEvent: sum.sentEvent + week.sentEvent,
      eligibleForReturn: sum.eligibleForReturn + week.eligibleForReturn,
      returned: sum.returned + week.returned
    }),
    { signedUp: 0, createdProject: 0, sentEvent: 0, eligibleForReturn: 0, returned: 0 }
  );

  const medianHours = median(hoursToFirstEvent);
  return {
    weeks,
    totals,
    medianHoursToFirstEvent: medianHours === null ? null : Math.round(medianHours * 10) / 10,
    stalled: stalled.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, STALLED_LIMIT)
  };
}
