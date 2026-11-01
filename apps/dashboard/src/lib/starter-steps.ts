// The getting-started checklist on a project's Overview. Pure logic, so what counts as done,
// what comes next and where each step links can be tested without rendering anything.

/** What the API reports as done for a project (GET /v1/dashboard/onboarding). */
export interface OnboardingSteps {
  firstEvent: boolean;
  identifiedUser: boolean;
  briefChannel: boolean;
  alert: boolean;
}

export const EMPTY_ONBOARDING: OnboardingSteps = { firstEvent: false, identifiedUser: false, briefChannel: false, alert: false };

export type StarterStepId = 'project' | 'firstEvent' | 'identify' | 'brief' | 'alert';

export interface StarterStep {
  id: StarterStepId;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

const withProject = (path: string, projectId: string) => `${path}?projectId=${encodeURIComponent(projectId)}`;

export function buildStarterSteps(steps: OnboardingSteps, projectId: string, projectName: string): StarterStep[] {
  return [
    {
      id: 'project',
      title: 'Create your project',
      description: `${projectName} is ready.`,
      done: true,
      href: withProject('/dashboard/settings', projectId),
      cta: 'Settings'
    },
    {
      id: 'firstEvent',
      title: 'Send your first event',
      description: 'Paste one prompt into Claude Code, Cursor or Codex and it installs TraceIQ for you, or run the CLI. Your charts appear as soon as it arrives.',
      done: steps.firstEvent,
      href: withProject('/dashboard/setup', projectId),
      cta: 'Install with AI'
    },
    {
      id: 'identify',
      title: 'Tell TraceIQ who your users are',
      description: 'Call identify() when someone signs in, so their events join one profile with their email or plan.',
      done: steps.identifiedUser,
      href: '/docs?page=methods',
      cta: 'See how'
    },
    {
      id: 'brief',
      title: 'Get the daily brief in a chat',
      description: 'A short summary of what changed, in Telegram or Slack, where you already read things.',
      done: steps.briefChannel,
      href: '/dashboard/alerts?tab=brief',
      cta: 'Connect a chat'
    },
    {
      id: 'alert',
      title: 'Set an alert for what matters',
      description: 'Get a message when a number crosses your line, like failed payments or a drop in signups.',
      done: steps.alert,
      href: '/dashboard/alerts',
      cta: 'Create an alert'
    }
  ];
}

export function starterProgress(steps: StarterStep[]): { done: number; total: number; percent: number; complete: boolean } {
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100), complete: done === total };
}

/** The first step still to do, which gets the main button. */
export function nextStarterStep(steps: StarterStep[]): StarterStep | null {
  return steps.find((step) => !step.done) ?? null;
}

/** Per project, so hiding the card on one project doesn't hide it on another. */
export function starterDismissKey(projectId: string): string {
  return `traceiq:starter-dismissed:${projectId}`;
}

/**
 * How the Overview shows the checklist:
 * - `hero`: no event has arrived yet. The checklist is the page; there is nothing else to show.
 * - `compact`: events are flowing and steps remain. A small card above the normal Overview, which can be hidden.
 * - `none`: everything is done.
 */
export function starterMode(steps: OnboardingSteps): 'hero' | 'compact' | 'none' {
  if (!steps.firstEvent) return 'hero';
  const allDone = steps.identifiedUser && steps.briefChannel && steps.alert;
  return allDone ? 'none' : 'compact';
}
