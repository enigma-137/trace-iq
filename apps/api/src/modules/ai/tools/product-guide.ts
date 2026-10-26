/**
 * How-to knowledge for Ask TraceIQ's `get_product_guide` tool, so it can
 * answer "how do I ..." questions about the product itself, not just the
 * project's data. Routes are dashboard paths; docs are /docs?page=<id>.
 * Keep the steps in sync with the UI labels when screens change.
 */
export interface ProductGuideTopic {
  id: string;
  title: string;
  keywords: string[];
  summary: string;
  steps: string[];
  route: string;
  docs?: string;
  related?: string[];
}

export const PRODUCT_GUIDE: ProductGuideTopic[] = [
  {
    id: 'setup',
    title: 'Install the SDK and send your first events',
    keywords: ['setup', 'install', 'sdk', 'snippet', 'write key', 'get started', 'onboarding', 'integrate', 'tracking', 'first event'],
    summary: 'Copy your project ID and write key, initialize the SDK in your app, then confirm events arrive.',
    steps: [
      'Open Setup (or Settings) and copy the SDK snippet. It already contains your project ID and the API endpoint.',
      'Create a write key on the same page if you do not have one yet (it is shown once, so store it safely).',
      'Install the SDK for your platform (npm install traceiq-sdk-js for web; see the docs for Node, Python, PHP, Flutter, React Native, Swift, Kotlin and Rust).',
      'Call initialize with the snippet values, then track an event such as signup_completed.',
      'Open Events to watch the event arrive live.'
    ],
    route: '/dashboard/setup',
    docs: '/docs?page=quickstart',
    related: ['cli', 'autocapture']
  },
  {
    id: 'cli',
    title: 'Use the TraceIQ CLI',
    keywords: ['cli', 'command line', 'terminal', 'npx', 'traceiq-cli', 'login', 'init'],
    summary: 'Run npx traceiq-cli to sign in, pick a project, write SDK config into your app and inspect logs from the terminal.',
    steps: [
      'Create a personal access token in Settings, under Personal access tokens.',
      'Run npx traceiq-cli login and paste the token.',
      'Run npx traceiq-cli init inside your app to pick a project and write the SDK settings.',
      'Run npx traceiq-cli --help to see project, env and log commands.'
    ],
    route: '/dashboard/settings',
    docs: '/docs?page=cli'
  },
  {
    id: 'autocapture',
    title: 'Capture page views and clicks automatically',
    keywords: ['autocapture', 'page view', 'pageview', 'clicks', 'automatic'],
    summary: 'The web SDK can record page views, exceptions, rage clicks, web vitals and (optionally) outgoing fetch requests without manual track calls.',
    steps: [
      'In initialize, autoTrackPageViews records page views; autoCaptureExceptions, autoCaptureRageClicks and autoCaptureWebVitals are on by default.',
      'Set autoCaptureRequests: true to record fetch calls for the API performance view (off by default).',
      'Deploy, then check Events for the new events.'
    ],
    route: '/dashboard/events',
    docs: '/docs?page=autocapture'
  },
  {
    id: 'synthetic-monitors',
    title: 'Create a synthetic monitor',
    keywords: ['synthetic', 'monitor', 'uptime', 'journey', 'playwright', 'browser check', 'scheduled check', 'e2e', 'end to end'],
    summary: 'A synthetic monitor runs a scripted browser journey (open a page, click, fill, assert) on a schedule and records pass or fail for each run.',
    steps: [
      'Go to Synthetic Monitors and click New monitor.',
      'Give it a Monitor Name and the Base URL of your app (for example https://app.yourdomain.com).',
      'Build the Journey Step Sequence: Navigate, Click Element, Fill Input, Wait for Element, Assert Element Visible, Assert Text Contains, Assert URL Path, or Wait for HTTP Response. Use CSS selectors such as button[type=submit] or [data-testid=signup-btn].',
      'Pick a Frequency Schedule (every 5 minutes up to daily, or Manual only), a Browser Engine (Chromium, Firefox, WebKit) and a Viewport Preset.',
      'Save, then click Run Now on the monitor to test it. Each run shows which step failed, with timing.',
      'Shortcut: open a funnel or a session replay and click Convert to Synthetic Monitor to prefill the steps.'
    ],
    route: '/dashboard/synthetic-monitors/new',
    docs: '/docs?page=synthetic-monitors',
    related: ['alerts', 'funnels', 'session-replay']
  },
  {
    id: 'alerts',
    title: 'Set up an alert',
    keywords: ['alert', 'notify', 'notification', 'slack', 'discord', 'email', 'threshold', 'spike', 'drop', 'paging', 'on-call'],
    summary: 'Alerts watch an event metric and notify by email, notification group or webhook (Slack, Discord, any HTTPS URL) when it crosses a threshold or changes sharply.',
    steps: [
      'Go to Alerts and click New alert.',
      'Pick the event and measure, a time window, and a condition: above, below, drops by % or spikes by %.',
      'Add at least one destination: email recipients, a notification group, or a webhook URL (a Slack or Discord incoming webhook works).',
      'Save, then use Test on the alert to send a test notification.',
      'Firing alerts show at the top of the Alerts page with the last value and delivery results.'
    ],
    route: '/dashboard/alerts',
    docs: '/docs?page=alerts'
  },
  {
    id: 'funnels',
    title: 'Build a conversion funnel',
    keywords: ['funnel', 'conversion', 'drop off', 'dropoff', 'steps', 'checkout flow'],
    summary: 'A funnel measures how many users complete an ordered series of events and where they drop off.',
    steps: [
      'Go to Funnels and click Create Funnel.',
      'Add the steps in order, each one an event (for example page_viewed, signup_started, signup_completed).',
      'Save and pick a date range to see conversion and drop-off per step.',
      'Click a step to see the users who reached it or dropped off.'
    ],
    route: '/dashboard/funnels',
    docs: '/docs?page=funnels',
    related: ['synthetic-monitors']
  },
  {
    id: 'insights',
    title: 'Create an insight (chart)',
    keywords: ['insight', 'chart', 'graph', 'trend', 'breakdown', 'report'],
    summary: 'Insights chart event counts, unique users, sums or averages over time, with an optional breakdown by property.',
    steps: [
      'Go to Insights and click New insight.',
      'Pick the insight type, the event and the measure, then optionally a breakdown by property.',
      'Choose the date range, interval and chart type, then save. You can add it to a dashboard.'
    ],
    route: '/dashboard/insights/new',
    docs: '/docs?page=insights',
    related: ['dashboards']
  },
  {
    id: 'dashboards',
    title: 'Build and share a dashboard',
    keywords: ['dashboard', 'board', 'share', 'public link', 'tiles'],
    summary: 'Dashboards group saved insights and funnels, and can be shared with a public link.',
    steps: [
      'Go to Dashboards and create a new dashboard.',
      'Add tiles from saved insights, or use Add to dashboard from an insight or funnel page.',
      'Use public sharing to create a read-only link.'
    ],
    route: '/dashboard/dashboards',
    docs: '/docs?page=dashboards',
    related: ['insights']
  },
  {
    id: 'session-replay',
    title: 'Turn on and watch session replays',
    keywords: ['replay', 'session replay', 'recording', 'rrweb', 'watch users', 'privacy', 'masking'],
    summary: 'Session replay records sanitized, consent-aware sessions you can play back, with sampling and retention controls.',
    steps: [
      'Enable replay in Settings, under Replay, and set the sample rate.',
      'In the web SDK initialize options, set replay: { enabled: true } (replay stays off unless it is enabled both here and in project settings).',
      'Open Replays to watch sessions; errors link straight to the replay where they happened.'
    ],
    route: '/dashboard/replays',
    docs: '/docs?page=session-replay'
  },
  {
    id: 'errors',
    title: 'Track and triage errors',
    keywords: ['error', 'errors', 'exception', 'crash', 'issue', 'stack trace', 'resolve', 'ignore', 'bug'],
    summary: 'Error tracking groups exceptions into issues by fingerprint, with affected users, pages and linked replays.',
    steps: [
      'The web SDK captures uncaught exceptions automatically (autoCaptureExceptions); call captureException to report caught errors.',
      'Open Errors to see issues grouped by fingerprint, with counts and affected users.',
      'Open an issue for the stack, affected pages and browsers, then mark it resolved or ignored.'
    ],
    route: '/dashboard/errors',
    docs: '/docs?page=events'
  },
  {
    id: 'feature-flags',
    title: 'Create a feature flag',
    keywords: ['flag', 'feature flag', 'rollout', 'toggle', 'percentage', 'remote config', 'kill switch'],
    summary: 'Feature flags turn features on for a percentage of users or specific users, with optional remote config payloads.',
    steps: [
      'Go to Feature Flags and create a flag with a key.',
      'Set the rollout percentage, and include or exclude specific users if needed.',
      'Check it in code with isFeatureEnabled (and getFeatureFlagPayload for remote config), and use the Evaluation Tester to confirm who gets it.'
    ],
    route: '/dashboard/flags',
    docs: '/docs?page=flags',
    related: ['experiments']
  },
  {
    id: 'experiments',
    title: 'Run an A/B experiment',
    keywords: ['experiment', 'a/b', 'ab test', 'split test', 'variant'],
    summary: 'Experiments compare variants against a goal metric.',
    steps: ['Go to Experiments and click New Experiment.', 'Choose the variants and the goal event, then launch and watch results.'],
    route: '/dashboard/experiments',
    docs: '/docs?page=experiments',
    related: ['feature-flags']
  },
  {
    id: 'surveys',
    title: 'Create an in-app survey',
    keywords: ['survey', 'feedback', 'nps', 'questionnaire'],
    summary: 'Surveys collect feedback from users inside your app.',
    steps: ['Go to Surveys and click New Survey.', 'Add questions, choose who sees it, then launch and view responses.'],
    route: '/dashboard/surveys/new',
    docs: '/docs?page=surveys'
  },
  {
    id: 'users-cohorts',
    title: 'Look up users and create cohorts',
    keywords: ['user', 'users', 'profile', 'identify', 'cohort', 'segment', 'group of users'],
    summary: 'Users shows each person\'s profile and timeline; cohorts are saved sets of filters (country, device, plan or any event property) that describe a group of users.',
    steps: [
      'Call identify in the SDK so events link to a user.',
      'Open Users to search people and see their event timeline.',
      'Open Cohorts to save a set of filters (for example, plan is pro and country is Nigeria), then open Retention for that group in one click.'
    ],
    route: '/dashboard/users',
    docs: '/docs?page=methods'
  },
  {
    id: 'retention',
    title: 'Measure retention',
    keywords: ['retention', 'churn', 'come back', 'sticky', 'returning'],
    summary: 'Retention shows, for each weekly cohort, how many users came back in later weeks.',
    steps: [
      'Open Retention. Each row is the people whose first event was in that week; W1, W2, ... show the share who sent any event again in later weeks.',
      'Pick 8, 12 or 26 weeks, and use Filter / Segment or a saved cohort to look at one group.',
      'Read across a row to see how a cohort returns week by week.'
    ],
    route: '/dashboard/retention',
    docs: '/docs?page=retention'
  },
  {
    id: 'web-analytics',
    title: 'View web analytics',
    keywords: ['web analytics', 'traffic', 'visitors', 'referrer', 'web vitals', 'pages'],
    summary: 'Web analytics shows visitors, top pages, referrers, devices and web vitals.',
    steps: ['Make sure page views are captured (autoTrackPageViews in the web SDK).', 'Open Web analytics and use the filters and goals.'],
    route: '/dashboard/web',
    docs: '/docs?page=web-analytics'
  },
  {
    id: 'api-performance',
    title: 'Monitor API performance',
    keywords: ['api performance', 'latency', 'p99', 'endpoint', 'slow requests', 'requests'],
    summary: 'API performance shows latency, error rate and throughput per endpoint from server-side telemetry.',
    steps: ['Send API telemetry from your backend SDK, or set autoCaptureRequests: true in the web SDK.', 'Open API performance to see slow and failing endpoints.'],
    route: '/dashboard/api-performance',
    docs: '/docs?page=api-performance'
  },
  {
    id: 'logs',
    title: 'Send and search logs',
    keywords: ['logs', 'log', 'logging'],
    summary: 'Logs lets you send application logs and search them next to your events.',
    steps: ['Send logs with the SDK or the ingestion API.', 'Open Logs to search and filter them.'],
    route: '/dashboard/logs',
    docs: '/docs?page=logs'
  },
  {
    id: 'webhooks',
    title: 'Send events to a webhook',
    keywords: ['webhook', 'webhooks', 'forward events', 'integration'],
    summary: 'Webhooks forward matching events to your own HTTPS endpoint.',
    steps: ['Go to Webhooks and add an endpoint URL and the events to send.', 'Check delivery health on the same page.'],
    route: '/dashboard/webhooks',
    docs: '/docs?page=webhooks'
  },
  {
    id: 'export',
    title: 'Export your data',
    keywords: ['export', 'csv', 'download data', 'backup'],
    summary: 'Export lets you download events and other data.',
    steps: ['Open Export, choose what to export and the date range, then download.'],
    route: '/dashboard/export',
    docs: '/docs?page=export'
  },
  {
    id: 'team',
    title: 'Invite teammates',
    keywords: ['team', 'invite', 'member', 'teammate', 'role', 'organization'],
    summary: 'Invite people to your organization from team settings.',
    steps: ['Open Settings, then Team.', 'Enter their email, choose a role, and send the invite.'],
    route: '/dashboard/settings/team'
  },
  {
    id: 'projects',
    title: 'Create or switch projects',
    keywords: ['project', 'switch project', 'new project', 'environment'],
    summary: 'Each project has its own data and write keys. Switch from the project name in the top breadcrumb.',
    steps: ['Click the project name in the breadcrumb at the top of the dashboard.', 'Pick another project, or create a new one from the same menu.'],
    route: '/dashboard/settings'
  },
  {
    id: 'billing',
    title: 'Manage plan and billing',
    keywords: ['billing', 'plan', 'upgrade', 'pro', 'invoice', 'pricing', 'subscription', 'allowance', 'quota'],
    summary: 'Change your plan and see usage in billing settings.',
    steps: ['Open Settings, then Billing.', 'Choose a plan or manage your subscription there.'],
    route: '/dashboard/settings/billing'
  },
  {
    id: 'two-factor',
    title: 'Turn on two-factor authentication',
    keywords: ['2fa', 'two factor', 'mfa', 'security', 'authenticator'],
    summary: 'Protect your account with an authenticator app.',
    steps: ['Open Settings, then Two-factor authentication.', 'Scan the QR code with your authenticator app and confirm the code.'],
    route: '/dashboard/settings/2fa'
  },
  {
    id: 'mcp',
    title: 'Connect Claude, Cursor or another MCP client',
    keywords: ['mcp', 'claude', 'cursor', 'copilot', 'ai assistant'],
    summary: 'The TraceIQ MCP server lets AI clients read your analytics with a personal access token.',
    steps: [
      'Create a personal access token in Settings with the scopes you need.',
      'Add the traceiq-mcp-server package to your MCP client config with that token.'
    ],
    route: '/dashboard/settings',
    docs: '/docs?page=mcp'
  }
];

/** Returns the best-matching topics for a free-text question, strongest first. */
export function searchProductGuide(query: string, limit = 2): ProductGuideTopic[] {
  const q = query.toLowerCase();
  const words = q.split(/[^a-z0-9/]+/).filter((w) => w.length > 2);

  const scored = PRODUCT_GUIDE.map((topic) => {
    let score = 0;
    if (q.includes(topic.id.replace(/-/g, ' ')) || q.includes(topic.id)) score += 5;
    for (const keyword of topic.keywords) {
      if (q.includes(keyword)) score += keyword.includes(' ') ? 4 : 3;
    }
    const haystack = `${topic.title} ${topic.summary}`.toLowerCase();
    for (const word of words) {
      if (haystack.includes(word)) score += 1;
    }
    return { topic, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.topic);
}
