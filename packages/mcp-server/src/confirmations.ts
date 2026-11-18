import { JsonObject } from './types.js';

/**
 * Tools that change something people notice (deletes, flags that change what users see,
 * experiments and surveys starting or stopping). Before running one, the server asks the
 * user to confirm through MCP elicitation, when the client supports it. Clients without
 * elicitation still get the tool's destructiveHint and their own approval prompt.
 */

const name = (args: JsonObject, key: string) => (typeof args[key] === 'string' ? `"${args[key]}"` : 'this item');

const rollout = (args: JsonObject) => (typeof args.rolloutPercentage === 'number' ? Math.round(args.rolloutPercentage) : null);

const CONFIRMATIONS: Record<string, (args: JsonObject) => string | null> = {
  delete_funnel: (args) => `Delete funnel ${name(args, 'funnelId')}? Its saved definition is removed for everyone on the project.`,
  delete_alert: (args) => `Delete alert ${name(args, 'alertId')}? It stops notifying anyone.`,
  delete_cohort: (args) => `Delete cohort ${name(args, 'cohortId')}? Insights and flags that use it lose it.`,
  toggle_feature_flag: (args) =>
    `${args.enabled ? 'Turn on' : 'Turn off'} feature flag ${name(args, 'flagId')}? This changes what users see right away.`,
  set_experiment_status: (args) =>
    `Set experiment ${name(args, 'experimentId')} to "${String(args.status ?? '')}"${
      args.winnerVariantKey ? ` with winner "${String(args.winnerVariantKey)}"` : ''
    }? This changes which variant users get.`,
  create_feature_flag: (args) =>
    args.enabled === true
      ? `Create feature flag "${String(args.key ?? '')}" and turn it on for ${rollout(args) ?? 100}% of matching users? This changes what users see right away.`
      : null,
  update_feature_flag: (args) => {
    const changes = [
      typeof args.enabled === 'boolean' ? (args.enabled ? 'turn it on' : 'turn it off') : null,
      rollout(args) !== null ? `set rollout to ${rollout(args)}%` : null,
      Array.isArray(args.targetingGroups) ? (args.targetingGroups.length ? 'replace its targeting' : 'remove its targeting') : null
    ].filter(Boolean);
    return changes.length ? `Update feature flag ${name(args, 'flagId')}: ${changes.join(', ')}? This changes what users see right away.` : null;
  },
  set_survey_status: (args) => `Set survey ${name(args, 'surveyId')} to "${String(args.status ?? '')}"? This changes whether users see it.`
};

export const confirmedTools = Object.keys(CONFIRMATIONS);

export function confirmationMessage(toolName: string, args: JsonObject): string | null {
  return CONFIRMATIONS[toolName]?.(args) ?? null;
}

export const confirmationSchema = {
  type: 'object' as const,
  properties: {
    confirm: { type: 'boolean' as const, title: 'Go ahead', description: 'Tick to run the change.', default: false }
  },
  required: ['confirm']
};

/** True only when the user accepted the form and ticked the box. */
export function isConfirmed(result: { action: string; content?: Record<string, unknown> }): boolean {
  return result.action === 'accept' && result.content?.confirm === true;
}
