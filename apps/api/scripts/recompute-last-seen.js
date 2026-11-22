#!/usr/bin/env node
/**
 * One-off backfill: recompute users.last_seen_at from events a person triggered.
 *
 * Before the "real use" change, every event (background request capture, web vitals,
 * errors, delayed re-sends) set users.last_seen_at to the time it arrived, so idle
 * open tabs made people look active. New ingests no longer do that; this corrects
 * the rows written before it.
 *
 * Rules, per user:
 *   - new last seen = their latest event that is not passive (see PASSIVE_EVENTS),
 *     using the earlier of the browser time and the server arrival time, so a fast
 *     client clock can't push it into the future.
 *   - only passive events left (their real activity is older than what the events
 *     table still shows): their earliest remaining event.
 *   - no events left at all (e.g. removed by data retention): unchanged.
 *   - never moved later than it is now, and never earlier than first_seen_at.
 *
 * Dry run by default: prints what would change. Pass --apply to write.
 * Deploy the new API before applying, or old ingest code will inflate it again.
 *
 *   node scripts/recompute-last-seen.js                 # dry run, every project
 *   node scripts/recompute-last-seen.js --project proj_x
 *   node scripts/recompute-last-seen.js --apply
 */
require('./load-env');

const { Client } = require('pg');

// Keep in sync with apps/api/src/common/passive-events.ts (a test checks this).
const PASSIVE_EVENTS = ['$api_request', '$web_vital', '$exception'];

// $1 = project id, $2 = passive event names. One row per user whose value changes.
const TARGETS_SQL = `
  WITH activity AS (
    SELECT
      user_id,
      MAX(LEAST(occurred_at, received_at)) FILTER (WHERE event_name <> ALL($2::text[])) AS active_at,
      MIN(LEAST(occurred_at, received_at)) AS earliest_at
    FROM events
    WHERE project_id = $1 AND user_id IS NOT NULL
    GROUP BY user_id
  )
  SELECT
    u.id,
    u.last_seen_at AS old_at,
    LEAST(
      u.last_seen_at,
      GREATEST(u.first_seen_at, COALESCE(a.active_at, a.earliest_at, u.last_seen_at))
    ) AS new_at
  FROM users u
  LEFT JOIN activity a ON a.user_id = u.id
  WHERE u.project_id = $1
`;

const SUMMARY_SQL = `
  SELECT
    count(*)::int AS users,
    count(*) FILTER (WHERE new_at < old_at)::int AS changed,
    count(*) FILTER (WHERE old_at >= now() - interval '7 days')::int AS active_before,
    count(*) FILTER (WHERE new_at >= now() - interval '7 days')::int AS active_after,
    count(*) FILTER (WHERE old_at >= now() - interval '5 minutes')::int AS online_before,
    count(*) FILTER (WHERE new_at >= now() - interval '5 minutes')::int AS online_after
  FROM (${TARGETS_SQL}) t
`;

// The WHERE re-checks the live row, so a user whose last seen moved forward from a
// real event since the target was computed is left alone.
const APPLY_SQL = `
  WITH t AS (${TARGETS_SQL})
  UPDATE users u
  SET last_seen_at = t.new_at
  FROM t
  WHERE u.id = t.id AND t.new_at < t.old_at AND u.last_seen_at = t.old_at
`;

function parseArgs(argv) {
  const args = { apply: false, projects: [], help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--project') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--project needs a project id');
      args.projects.push(value);
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function recompute(client, { apply = false, projects = [], log = console.log } = {}) {
  const projectIds = projects.length
    ? projects
    : (await client.query('SELECT id FROM projects ORDER BY id')).rows.map((row) => row.id);

  const totals = { users: 0, changed: 0, activeBefore: 0, activeAfter: 0, updated: 0 };
  for (const projectId of projectIds) {
    const summary = (await client.query(SUMMARY_SQL, [projectId, PASSIVE_EVENTS])).rows[0];
    totals.users += summary.users;
    totals.changed += summary.changed;
    totals.activeBefore += summary.active_before;
    totals.activeAfter += summary.active_after;

    let updated = 0;
    if (apply && summary.changed > 0) {
      updated = (await client.query(APPLY_SQL, [projectId, PASSIVE_EVENTS])).rowCount ?? 0;
      totals.updated += updated;
    }

    log(
      `${projectId}: ${summary.users} users, ${summary.changed} to correct · ` +
        `active (7d) ${summary.active_before} → ${summary.active_after} · ` +
        `online ${summary.online_before} → ${summary.online_after}` +
        (apply ? ` · updated ${updated}` : '')
    );
  }

  log(
    `\n${apply ? 'Applied' : 'Dry run'}: ${totals.changed} of ${totals.users} users ${apply ? 'corrected' : 'would be corrected'} ` +
      `across ${projectIds.length} project(s). Active (7d): ${totals.activeBefore} → ${totals.activeAfter}.` +
      (apply ? ` Rows updated: ${totals.updated}.` : '\nRe-run with --apply to write these changes.')
  );
  return totals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/recompute-last-seen.js [--project <id>]... [--apply]\n' +
        'Recomputes users.last_seen_at from events a person triggered. Dry run unless --apply.'
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq';
  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
  const client = new Client({ connectionString: databaseUrl, ssl });
  await client.connect();
  try {
    await recompute(client, { apply: args.apply, projects: args.projects });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { PASSIVE_EVENTS, TARGETS_SQL, parseArgs, recompute };
