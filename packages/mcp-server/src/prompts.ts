/**
 * MCP prompts: ready-made workflows that clients show as slash commands
 * (for example /incident-review in Claude). Each one expands into a user message
 * that tells the model which TraceIQ tools to use and what to produce.
 */

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgument[];
  render: (args: Record<string, string | undefined>) => string;
}

const projectArgument: PromptArgument = {
  name: 'project',
  description: 'Project name or id. Leave empty for the default project.'
};

function projectLine(args: Record<string, string | undefined>): string {
  return args.project
    ? `Project: "${args.project}". If that is a name, find its id with list_projects first and pass it as projectId to every tool.`
    : 'Use the default project (omit projectId), unless list_projects shows several and it is unclear which one I mean; then ask.';
}

export const prompts: Prompt[] = [
  {
    name: 'incident-review',
    title: 'Incident review',
    description: 'Find out what is broken right now (or was recently), who it hit, and what to do next.',
    arguments: [
      projectArgument,
      { name: 'window', description: 'How far back to look: 15m, 1h, 6h, 24h or 7d. Default 1h.' }
    ],
    render: (args) =>
      [
        'Investigate a possible incident in TraceIQ.',
        projectLine(args),
        `1. Call investigate_incident with window "${args.window || '1h'}".`,
        '2. If requests are failing, open the most recent one with get_request and read its timeline. Use search_logs with its traceId or requestId if you need more.',
        '3. If one error issue dominates, open it with get_error_issue.',
        '4. If replays are available for affected users, mention which one to watch.',
        'Then write a short incident note: status now (ongoing or recovered, and since when), impact (requests, users, endpoints), the most likely cause with the evidence, and the next 2 or 3 actions. Keep every number and time from the tools; do not guess beyond them.'
      ].join('\n')
  },
  {
    name: 'daily-standup',
    title: 'Daily standup',
    description: 'A two-minute summary of the last 24 hours for the team standup.',
    arguments: [projectArgument],
    render: (args) =>
      [
        'Prepare my daily standup update from TraceIQ.',
        projectLine(args),
        '1. Call get_today_story.',
        '2. Call get_project_health with minutes 60 to say how things are right now.',
        '3. Call list_error_issues with days 1 for anything new or regressed.',
        'Write at most six bullet points: activity versus yesterday, anything that failed and whether it recovered, new or regressed errors, and one thing worth looking at today.'
      ].join('\n')
  },
  {
    name: 'weekly-report',
    title: 'Weekly product report',
    description: 'A weekly report on usage, conversion, retention, reliability and errors.',
    arguments: [projectArgument],
    render: (args) =>
      [
        'Write a weekly product report from TraceIQ data.',
        projectLine(args),
        '1. get_analytics_overview with range "7d" for usage against the previous week.',
        '2. list_funnels, then summarize_funnel_dropoff for the most important funnel (ask me if it is unclear which).',
        '3. show_retention_changes.',
        '4. summarize_api_health with days 7, and list_error_issues with days 7.',
        'Structure: headline (one sentence), usage, conversion, retention, reliability, errors, and three recommendations. Use the real numbers and say what changed versus last week.'
      ].join('\n')
  },
  {
    name: 'experiment-readout',
    title: 'Experiment readout',
    description: 'Read out an A/B experiment: which variant is winning, by how much, and whether to ship it.',
    arguments: [
      projectArgument,
      { name: 'experiment', description: 'Experiment name, key or id. Leave empty to pick from the running ones.' }
    ],
    render: (args) =>
      [
        args.experiment ? `Read out the "${args.experiment}" experiment in TraceIQ.` : 'Read out the running A/B experiments in TraceIQ.',
        projectLine(args),
        '1. Find it with list_experiments (if none is named, use the running ones and ask which matters if there are several).',
        '2. Get the numbers with get_experiment_results.',
        '3. Check list_error_issues with days 7 for errors that could skew one variant.',
        'Write: the hypothesis and primary metric, exposures and conversion per variant, lift against control, whether the result is statistically significant, and a recommendation (ship, keep running, or stop). Say plainly when there is not enough data yet. Do not change the experiment status unless I ask.'
      ].join('\n')
  },
  {
    name: 'funnel-audit',
    title: 'Funnel audit',
    description: 'Find where users drop out of a funnel and who they are.',
    arguments: [
      projectArgument,
      { name: 'funnel', description: 'Funnel name or id, e.g. "Checkout".', required: true }
    ],
    render: (args) =>
      [
        `Audit the "${args.funnel ?? ''}" funnel in TraceIQ.`,
        projectLine(args),
        '1. Find the funnel with list_funnels and get its results with get_funnel_results.',
        '2. Call explain_conversion_drop to see whether conversion moved and why.',
        '3. For the step with the biggest drop, list the users who dropped with get_funnel_step_users, and look at one or two of them with get_user_timeline.',
        '4. Check list_error_issues and search_requests (status "error") for failures on the pages or endpoints of that step.',
        'Report: conversion per step, the biggest leak, what the dropped users have in common, any errors on that step, and concrete fixes to try.'
      ].join('\n')
  }
];
