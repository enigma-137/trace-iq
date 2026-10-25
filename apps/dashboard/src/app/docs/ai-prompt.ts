// Static data for the docs "Ask AI" prompt builder. Everything here is pure data
// so the modal can compose a detailed prompt entirely on the client — no API call.

import { SDK_VERSIONS } from '@/lib/sdkVersions';

export type AiLanguageId =
  | 'javascript'
  | 'node'
  | 'python'
  | 'rust'
  | 'php'
  | 'react-native'
  | 'swift'
  | 'kotlin'
  | 'mcp'
  | 'other';

export type AiFeatureId =
  | 'general'
  | 'event-tracking'
  | 'user-identity'
  | 'feature-flags'
  | 'funnels'
  | 'alerts'
  | 'webhooks'
  | 'api-performance';

export interface AiLanguage {
  id: AiLanguageId;
  label: string;
  blurb: string;
  comingSoon?: boolean;
  install: string;
  init: string;
  steps: string[];
  featureSnippets?: Partial<Record<AiFeatureId, string>>;
  docs: { label: string; href: string }[];
}

export interface AiFeature {
  id: AiFeatureId;
  label: string;
  description: string;
}

export const AI_LANGUAGES: AiLanguage[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    blurb: 'Browser SDK — single script, about 40 KB gzipped',
    install: 'npm install traceiq-sdk-js@latest',
    init: `import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '__API_BASE_URL__',
});`,
    steps: [
      'Install the SDK and import the default `traceiq` singleton.',
      'Call `initialize()` with your project id and write key (both safe to expose in the browser).',
      '`endpoint` points at the TraceIQ API — change it if you self-host.',
      'Identify users with `traceiq.identify({ userId, traits })` before tracking.',
      'Optional: `autoTrackPageViews`, `autoCaptureExceptions`, `autoCaptureRageClicks`.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.track('purchase_completed', {
  amount: 89.0,
  currency: 'NGN',
  gateway: 'stripe',
});`,
      'user-identity': `traceiq.identify({
  userId: 'user_123',
  traits: { email: 'a@b.com', plan: 'pro', kyc_tier: 2 },
});`,
      'feature-flags': `await traceiq.loadFeatureFlags({ plan: 'pro' });

if (traceiq.isFeatureEnabled('new-checkout')) {
  renderNewCheckout();
}
const cfg = traceiq.getFeatureFlagPayload('checkout-limits');`,
      'api-performance': `traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '__API_BASE_URL__',
  autoCaptureRequests: true, // wraps fetch() and XHR as $api_request
});`
    },
    docs: [
      { label: 'Quickstart', href: '/docs?page=quickstart' },
      { label: 'SDK methods', href: '/docs?page=methods' },
      { label: 'Configuration', href: '/docs?page=config' },
      { label: 'Autocapture', href: '/docs?page=autocapture' },
      { label: 'Feature flags', href: '/docs?page=flags' },
      { label: 'Webhooks', href: '/docs?page=webhooks' }
    ]
  },
  {
    id: 'node',
    label: 'Node.js',
    blurb: 'Server-side SDK for Node.js 18+ — backend events and request telemetry',
    install: 'npm install traceiq-node',
    init: `import { TraceIQ } from 'traceiq-node';

const traceiq = new TraceIQ({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: process.env.TRACEIQ_WRITE_KEY!,
  endpoint: '__API_BASE_URL__',
});`,
    steps: [
      'Install the SDK and create one `TraceIQ` instance for your process.',
      'Keep the write key in an environment variable — server keys stay secret.',
      'Capture events with `traceiq.capture({ event, userId, properties })`; they are batched in the background.',
      'Call `await traceiq.shutdown()` before a short-lived process (script, Lambda) exits.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture({
  event: 'payout_succeeded',
  userId: 'user_123',
  properties: { amount: 50000, currency: 'NGN' }
});`,
      'user-identity': `traceiq.identify({ userId: 'user_123', traits: { email: 'a@b.com', kyc_tier: 2 } });`,
      'api-performance': `app.use(traceiq.middleware({ service: 'billing-api', environment: 'production' }));`
    },
    docs: [
      { label: 'Node.js SDK', href: '/docs?page=node' },
      { label: 'API performance', href: '/docs?page=api-performance' }
    ]
  },
  {
    id: 'python',
    label: 'Python',
    blurb: 'Standard-library client for servers and scripts',
    install: 'pip install traceiq-py',
    init: `from traceiq import Client

traceiq = Client(
    project_id="YOUR_PROJECT_ID",
    write_key="YOUR_WRITE_KEY",
    endpoint="__API_BASE_URL__",
)`,
    steps: [
      'Install the client and create a `Client` with your project id and write key.',
      'Keep the write key in an environment variable on the server.',
      'Call `capture(...)` for events and `identify(...)` to associate a user profile.',
      'Call `shutdown()` before a short-lived process exits so buffered events flush.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture(
    "payout_succeeded",
    user_id="user_123",
    properties={"amount": 50000, "currency": "NGN"},
)`,
      'user-identity': `traceiq.identify(
    user_id="user_123",
    traits={"kyc_tier": 2, "email": "a@b.com"},
)`
    },
    docs: [
      { label: 'Python SDK', href: '/docs?page=python' },
      { label: 'Server-side ingestion', href: '/docs?page=ingestion' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  },
  {
    id: 'rust',
    label: 'Rust',
    blurb: 'Queued, batched client with a background flush thread',
    install: `# Cargo.toml\ntraceiq = "${SDK_VERSIONS.rust}"`,
    init: `use traceiq::Client;

let mut traceiq = Client::new("YOUR_PROJECT_ID", "YOUR_WRITE_KEY");`,
    steps: [
      `Add \`traceiq = "${SDK_VERSIONS.rust}"\` to your Cargo.toml.`,
      'Create a `Client` with your project id and write key.',
      'Events queue internally and flush in batches from a background thread.',
      'Call `shutdown()` before exit to flush anything still buffered.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture(
    "payout_succeeded", Some("user_123"), None,
    Some(serde_json::json!({"amount": 50000, "currency": "NGN"})),
    None, None);`,
      'user-identity': `traceiq.identify(
    "user_123", Some(serde_json::json!({"kyc_tier": 2})));`
    },
    docs: [
      { label: 'Rust SDK', href: '/docs?page=rust' },
      { label: 'Server-side ingestion', href: '/docs?page=ingestion' }
    ]
  },
  {
    id: 'php',
    label: 'PHP',
    blurb: 'Zero-dependency Composer package for servers (Laravel-ready)',
    install: 'composer require traceiq/traceiq-php',
    init: `use TraceIQ\\Client;

$traceiq = new Client(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_WRITE_KEY",
    endpoint: "__API_BASE_URL__",
);`,
    steps: [
      'Install the Composer package and create a `Client` with your project id and write key.',
      'Keep the write key in an environment variable on the server.',
      'Call `capture(...)` for events and `identify(...)` to associate a user profile.',
      'The client flushes at `flush_at` and on request shutdown — call `flush()` early if you need delivery before responding.'
    ],
    featureSnippets: {
      'event-tracking': `$traceiq->capture(
    event: "payout_succeeded",
    userId: "user_123",
    properties: ["amount" => 50000, "currency" => "NGN"],
);`,
      'user-identity': `$traceiq->identify(
    userId: "user_123",
    traits: ["kyc_tier" => 2, "email" => "a@b.com"],
);`
    },
    docs: [
      { label: 'PHP SDK', href: '/docs?page=php' },
      { label: 'Server-side ingestion', href: '/docs?page=ingestion' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  },
  {
    id: 'react-native',
    label: 'React Native',
    blurb: 'Screens, events, and device info for iOS & Android',
    install: `npm install traceiq-react-native
# optional: persist the anonymous id across launches
npm install @react-native-async-storage/async-storage`,
    init: `import { traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '__API_BASE_URL__',
  appVersion: '1.4.0',
});`,
    steps: [
      'Install the SDK (optionally with async-storage so the anonymous id survives relaunches).',
      'Call `initialize()` at app start with your project id and write key.',
      'Track screens with `traceiq.screen(name)` and events with `traceiq.capture(...)`.',
      'Identify users with `traceiq.identify({ userId, traits })` for cross-device stitching.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture({
  event: 'transfer_started',
  properties: { amount: 5000, currency: 'NGN' },
});`,
      'user-identity': `traceiq.identify({
  userId: 'user_123',
  traits: { kyc_tier: 2, email: 'a@b.com' },
});`
    },
    docs: [
      { label: 'React Native SDK', href: '/docs?page=react-native' },
      { label: 'SDK methods', href: '/docs?page=methods' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  },
  {
    id: 'swift',
    label: 'Swift',
    blurb: 'iOS, macOS, and server-side Swift (Foundation-only)',
    install: 'Swift Package Manager → https://github.com/traceiq/traceiq-swift',
    init: `import TraceIQ

let traceiq = TraceIQ(config: .init(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_WRITE_KEY",
    endpoint: "__API_BASE_URL__"
))`,
    steps: [
      'Add the Swift package to your project (iOS 13+ / macOS 10.15+).',
      'Create a `TraceIQ` instance with your project id and write key.',
      'Capture events with `traceiq.capture(...)` and identify users with `traceiq.identify(...)`.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture(
    "transfer_started",
    userId: "user_123",
    properties: ["amount": 5000, "currency": "NGN"])`,
      'user-identity': `traceiq.identify(
    userId: "user_123",
    traits: ["kyc_tier": 2, "email": "a@b.com"])`
    },
    docs: [
      { label: 'Swift SDK', href: '/docs?page=swift' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    blurb: 'JVM servers and Android (API 21+), no third-party dependencies',
    install: 'Gradle → implementation("run.traceiq:traceiq:0.1.0")',
    init: `import com.traceiq.TraceIQ
import com.traceiq.TraceIQConfig

val traceiq = TraceIQ(
    TraceIQConfig(
        projectId = "YOUR_PROJECT_ID",
        writeKey = "YOUR_WRITE_KEY",
        endpoint = "__API_BASE_URL__",
    )
)`,
    steps: [
      'Add the dependency (or copy the source) — the same code runs on the JVM and Android.',
      'On Android, add `<uses-permission android:name="android.permission.INTERNET" />`.',
      'Capture events with `traceiq.capture(...)` and identify users with `traceiq.identify(...)`.',
      'Call `traceiq.shutdown()` to flush before a short-lived process exits.'
    ],
    featureSnippets: {
      'event-tracking': `traceiq.capture(
    "transfer_started",
    userId = "user_123",
    properties = mapOf("amount" to 5000, "currency" to "NGN"),
)`,
      'user-identity': `traceiq.identify("user_123", traits = mapOf("kyc_tier" to 2))`
    },
    docs: [
      { label: 'Kotlin SDK', href: '/docs?page=kotlin' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  },
  {
    id: 'mcp',
    label: 'MCP',
    blurb: 'Point Claude Desktop, Cursor, or any MCP client at your trace data',
    install: 'npx -y traceiq-mcp-server',
    init: `{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "__API_BASE_URL__"
      }
    }
  }
}`,
    steps: [
      'Create a personal access token (Settings → Personal access tokens) and choose scopes.',
      'Read-only copilot: projects:read, analytics:read, insights:read, funnels:read, users:read, errors:read.',
      'Add write scopes (flags:write, funnels:write, alerts:write) only if the assistant may make changes.',
      'Add the server block above to Claude Desktop or Cursor and restart.',
      'The token value is shown once — store it in your environment.'
    ],
    docs: [
      { label: 'MCP server', href: '/docs?page=mcp' },
      { label: 'Server-side ingestion', href: '/docs?page=ingestion' }
    ]
  },
  {
    id: 'other',
    label: 'Others',
    blurb: 'Any other language or platform — generic HTTP ingestion guide',
    install: 'N/A — use the HTTP ingestion API directly',
    init: `curl -X POST __API_BASE_URL__/v1/events \\
  -H 'content-type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_WRITE_KEY' \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "userId": "user_123",
    "eventName": "purchase",
    "properties": { "amount": 49 }
  }'`,
    steps: [
      'Create a project to get a project id and write key.',
      'Send events to POST /v1/events with your write key in the `x-traceiq-write-key` header.',
      'For many events at once, POST to /v1/events/batch with up to 500 events per request.',
      'Other SDKs follow the same contract — check the server-side ingestion docs for the exact payload.'
    ],
    docs: [
      { label: 'Server-side ingestion', href: '/docs?page=ingestion' },
      { label: 'Reserved events', href: '/docs?page=events' }
    ]
  }
];

export const AI_FEATURES: AiFeature[] = [
  { id: 'general', label: 'Base setup only', description: 'Just install, initialize, and capture a first event.' },
  { id: 'event-tracking', label: 'Event tracking', description: 'Track custom events with properties.' },
  { id: 'user-identity', label: 'Identify users', description: 'Identify users and attach traits for one-person stitching.' },
  { id: 'feature-flags', label: 'Feature flags', description: 'Ship code behind a flag and read it from the SDK.' },
  { id: 'funnels', label: 'Funnels', description: 'Define a conversion funnel and analyze drop-off.' },
  { id: 'alerts', label: 'Alerts', description: 'Get a webhook / email when a metric crosses a threshold.' },
  { id: 'webhooks', label: 'Webhooks', description: 'Forward matching events to an external URL in real time.' },
  { id: 'api-performance', label: 'API performance', description: 'Track the latency and error rate of your own endpoints.' }
];

const FEATURE_GUIDANCE: Record<Exclude<AiFeatureId, 'general'>, string> = {
  'event-tracking': 'Track custom events with your SDK\'s track/capture method, attaching any properties as JSON (e.g. amount, currency, gateway).',
  'user-identity': 'Identify the current user so all their events stitch to one profile. Attach traits like email, plan, and tier; call identify before (or right after) the first tracked event of a session.',
  'feature-flags':
    'Feature flags are created in the TraceIQ dashboard (Feature flags → New flag) with a rollout %, optional per-user overrides, and property targeting (AND rules). Evaluate them in the app via the SDK so results stay sticky per person.',
  funnels:
    'Funnels are defined in the TraceIQ dashboard (Funnels → New funnel): pick an ordered sequence of events, then read per-step conversion and drop-off. Use the MCP server or dashboard API if you want to read results programmatically.',
  alerts:
    'Alerts are created in the TraceIQ dashboard (Alerts → New alert): pick an event, a measure (count / unique / sum / avg), a rolling window, a condition (above / below / drops_by / spikes_by), and one or more channels (webhook URL and/or email recipients). Use Test before enabling.',
  webhooks:
    'Webhooks are registered in the TraceIQ dashboard (Webhooks → New webhook): provide a URL, optionally a signing secret, and the event list to forward. TraceIQ POSTs the payload with an x-traceiq-signature HMAC header when a secret is set.',
  'api-performance':
    'API performance runs on reserved $api_request events (method, path, status, durationMs). The Node SDK ships a one-line middleware; in the browser enable autoCaptureRequests so the SDK times fetch() and XHR calls. Browser timings are full round trips and are reported separately from server timings.'
};

export function buildAiPrompt(
  language: AiLanguage,
  features: AiFeature | AiFeature[],
  apiBaseUrl: string
): string {
  const featureList = Array.isArray(features) ? features : [features];
  const activeFeatures = featureList.filter((f) => f.id !== 'general');
  const isGeneralOnly = activeFeatures.length === 0;

  const init = language.init.split('__API_BASE_URL__').join(apiBaseUrl);

  const goalText = isGeneralOnly
    ? 'Set up a clean TraceIQ baseline: install the SDK, initialize it, and capture one event.'
    : `Implement ${activeFeatures.map((f) => f.label.toLowerCase()).join(', ')} with TraceIQ.`;

  const featureSections: string[] = [];

  if (isGeneralOnly) {
    featureSections.push('No specific feature requested — the baseline setup above is enough.');
  } else {
    activeFeatures.forEach((feat, index) => {
      const guidance = FEATURE_GUIDANCE[feat.id as Exclude<AiFeatureId, 'general'>];
      const snippet = language.featureSnippets?.[feat.id];

      const parts = [
        `### ${index + 1}. ${feat.label}`,
        guidance ? `Guidance: ${guidance}` : '',
      ];

      if (snippet) {
        parts.push('Code snippet:', snippet);
      }

      featureSections.push(parts.filter(Boolean).join('\n'));
    });
  }

  const sections = [
    `You are an expert developer helping me integrate TraceIQ into a ${language.label} application.`,
    '',
    'GOAL',
    goalText,
    '',
    'CREDENTIALS (placeholders — the user swaps in real values)',
    '- projectId: YOUR_PROJECT_ID',
    '- writeKey: YOUR_WRITE_KEY',
    `- API endpoint: ${apiBaseUrl}`,
    '',
    '1. INSTALL',
    language.install,
    '',
    '2. INITIALIZE',
    init,
    '',
    '3. SETUP STEPS',
    ...language.steps.map((step, i) => `${i + 1}. ${step}`),
    '',
    'FEATURE IMPLEMENTATION',
    featureSections.join('\n\n'),
    '',
    'REFERENCE DOCS',
    ...language.docs.map((doc) => `- ${doc.label}: https://traceiq.run${doc.href}`),
    '',
    'OUTPUT',
    'Write the complete, production-ready implementation using the setup above. Include file paths where relevant, handle errors, and note where each piece of code goes. If any credential or option is ambiguous, ask me before generating.'
  ];

  return sections.join('\n');
}
