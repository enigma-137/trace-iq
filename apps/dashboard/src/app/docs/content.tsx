import type { ReactNode } from 'react';
import Link from 'next/link';
import { codeToHtml } from 'shiki';
import { DocsLayout } from './DocsLayout';
import { CodeBlockContainer } from './CodeBlock';

export const docsSections = [
  { id: 'welcome', label: 'Welcome', category: 'Getting started' },
  { id: 'quickstart', label: 'Quickstart', category: 'Getting started' },
  { id: 'methods', label: 'SDK methods', category: 'Getting started' },
  { id: 'config', label: 'Configuration', category: 'Getting started' },
  { id: 'autocapture', label: 'Autocapture', category: 'Getting started' },
  { id: 'node', label: 'Node.js SDK', category: 'Server & mobile SDKs' },
  { id: 'react-native', label: 'React Native SDK', category: 'Server & mobile SDKs' },
  { id: 'python', label: 'Python SDK', category: 'Server & mobile SDKs' },
  { id: 'swift', label: 'Swift SDK', category: 'Server & mobile SDKs' },
  { id: 'kotlin', label: 'Kotlin SDK', category: 'Server & mobile SDKs' },
  { id: 'rust', label: 'Rust SDK', category: 'Server & mobile SDKs' },
  { id: 'php', label: 'PHP SDK', category: 'Server & mobile SDKs' },
  { id: 'flags', label: 'Feature flags', category: 'Features' },
  { id: 'alerts', label: 'Alerts', category: 'Features' },
  { id: 'dashboards', label: 'Dashboards', category: 'Features' },
  { id: 'api-performance', label: 'API performance', category: 'Features' },
  { id: 'webhooks', label: 'Webhooks', category: 'Features' },
  { id: 'export', label: 'Data export', category: 'Features' },
  { id: 'events', label: 'Reserved events', category: 'Features' },
  { id: 'features', label: 'Feature guide', category: 'Features' },
  { id: 'ingestion', label: 'Server-side ingestion', category: 'Reference' },
  { id: 'mcp', label: 'MCP server', category: 'Reference' }
];

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const FALLBACK_PROJECT_ID = 'YOUR_PROJECT_ID';

export const FALLBACK_SNIPPET = `import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
});

traceiq.track('signup_completed', { plan: 'pro' });`;

export function resolveActiveId(searchParams: { [key: string]: string | string[] | undefined } | undefined): string {
  const raw = Array.isArray(searchParams?.page) ? searchParams?.page[0] : searchParams?.page;
  return raw || 'welcome';
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-neutral-200 py-8 first:pt-0 last:border-0 dark:border-slate-800">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-neutral-600 dark:text-slate-400">{children}</p>;
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      {children}
    </code>
  );
}

export async function Code({ children, lang = 'ts' }: { children: string; lang?: string }) {
  const html = await codeToHtml(children, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false
  });

  return <CodeBlockContainer html={html} codeText={children} lang={lang} />;
}

export function Bullets({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className="grid gap-2">
      {items.map(([term, desc]) => (
        <li key={term} className="text-sm leading-6 text-neutral-600 dark:text-slate-400">
          <Mono>{term}</Mono> — {desc}
        </li>
      ))}
    </ul>
  );
}

export function OptionsTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-slate-800">
      <div className="hidden grid-cols-[180px_120px_1fr] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 sm:grid">
        <span>Option</span>
        <span>Default</span>
        <span>Description</span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-slate-800">
        {rows.map(([name, def, desc]) => (
          <div key={name} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_120px_1fr] sm:gap-4">
            <span className="font-mono text-xs text-neutral-900 dark:text-white">{name}</span>
            <span className="font-mono text-xs text-neutral-500 dark:text-slate-400">{def}</span>
            <span className="text-sm text-neutral-600 dark:text-slate-400">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DocsSectionBodyProps {
  id: string;
  projectId: string;
  apiBaseUrl: string;
  snippet: string;
}

export function DocsSectionBody({ id, projectId, apiBaseUrl, snippet }: DocsSectionBodyProps) {
  if (id === 'welcome') {
    return (
      <div className="space-y-8">
        {/* Docs Hero Header */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-blue-500/10 blur-3xl dark:bg-cyan-500/10" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 font-mono text-xs font-semibold text-blue-600 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300">

              TraceIQ Documentation
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
              TraceIQ Docs
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-slate-300 sm:text-base">
              Instrument behavior telemetry, track conversion funnels, configure percentage feature flags, and run real-time user analytics across your web, mobile, and server applications.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/docs?page=quickstart"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                Start integration
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/docs?page=node"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Browse SDKs
              </Link>
            </div>
          </div>
        </div>

        {/* Callout Box */}
        <div className="rounded-xl border-l-4 border-cyan-500 bg-cyan-500/10 p-5 dark:border-cyan-400 dark:bg-cyan-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-cyan-700 dark:text-cyan-300">

            <span>Start with a clean setup</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-700 dark:text-slate-300">
            TraceIQ is built for developer efficiency. Have your <code className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1 py-0.5 font-mono text-[11px] text-cyan-800 dark:text-cyan-200">Write Key</code> ready from Settings to begin capturing events, user identity timelines, and retention cohorts right away.
          </p>
        </div>

        {/* Choose Your Path Grid */}
        <PathCardsGrid basePath="/docs" />

        {/* Overview Details */}
        <Section id="welcome-details" title="Before You Install">
          <P>
            TraceIQ SDKs auto-batch telemetry payloads, handle offline retry logic, and support both client-side autocapture and server-side HTTP ingestion.
          </P>
          <Bullets
            items={[
              ['Getting started', 'Quickstart, SDK methods, configuration options, and automatic event capture.'],
              ['Server & mobile SDKs', 'Node.js, React Native, Python, Swift, Kotlin, Rust, and PHP SDKs.'],
              ['Features', 'Feature flags, alerts, dashboards, webhooks, export, and reserved events.'],
              ['Reference', 'Direct REST ingestion over HTTP and the Model Context Protocol (MCP) server copilot.']
            ]}
          />
        </Section>
      </div>
    );
  }

  if (id === 'quickstart') {
    return (
      <Section id="quickstart" title="Quickstart">
        <P>Install the SDK and initialize it with your project credentials (from Settings).</P>
        <Code lang="bash">{`npm install traceiq-sdk-js`}</Code>
        <Code lang="ts">{snippet}</Code>
        <P>
          That&apos;s it — events start flowing to <Mono>Events</Mono> within seconds. Grab your write key from{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/settings">
            Settings
          </a>
          .
        </P>
      </Section>
    );
  }

  if (id === 'methods') {
    return (
      <Section id="methods" title="SDK methods">
        <P>Core methods on the default <Mono>traceiq</Mono> singleton (feature flags are covered in their own section).</P>
        <Code lang="ts">{`// Identify the current person (creates/updates a user profile)
traceiq.identify({ userId: 'user_123', traits: { email: 'a@b.com', plan: 'pro' } });

// Track a custom event with properties
traceiq.track('checkout_started', { cartValue: 4200, currency: 'NGN' });

// Track a page view
traceiq.page('Pricing');

// Associate the person with an organization / account
traceiq.group({ organizationId: 'org_123', traits: { plan: 'growth' } });

// Report a handled error
traceiq.captureException(new Error('Payment failed'), { orderId: 'ord_1' });`}</Code>
      </Section>
    );
  }

  if (id === 'config') {
    return (
      <Section id="config" title="Configuration">
        <P>
          Options passed to <Mono>initialize()</Mono>:
        </P>
        <OptionsTable
          rows={[
            ['projectId', 'required', 'Your project ID.'],
            ['writeKey', 'required', 'SDK write key (safe to expose in the browser).'],
            ['endpoint', '', 'TraceIQ API base URL.'],
            ['autoTrackPageViews', 'false', 'Send a $page event automatically on initialize.'],
            ['autoCaptureExceptions', 'true', 'Capture uncaught errors and unhandled promise rejections.'],
            ['autoCaptureRageClicks', 'true', 'Detect rage clicks (3+ rapid clicks in one spot).'],
            ['debug', 'false', 'Log SDK warnings to the console.']
          ]}
        />
      </Section>
    );
  }

  if (id === 'autocapture') {
    return (
      <Section id="autocapture" title="Autocapture">
        <P>With defaults on, TraceIQ captures these without extra code:</P>
        <Bullets
          items={[
            ['$page', 'Page views (URL, path, referrer, title) — when autoTrackPageViews is on or page() is called.'],
            ['$exception', 'Uncaught errors + unhandled rejections + captureException() calls (type, message, stack).'],
            ['$rageclick', 'Rage clicks — 3+ rapid clicks clustered within ~1s.'],
            ['device', 'OS, device type, and browser parsed from the user agent (iOS / Android / Windows / macOS / …).'],
            ['location', 'Country / region / city resolved server-side from the request IP (GeoIP). Needs public-IP traffic.']
          ]}
        />
      </Section>
    );
  }

  if (id === 'node') {
    return (
      <Section id="node" title="Server-side SDK (Node.js)">
        <P>
          For backend events — payments, payouts, settlements, jobs — use <Mono>@traceiq/node</Mono>. Server events
          are the most trustworthy source of revenue: the <Mono>amount</Mono> comes from your systems, not the
          browser. Events are queued and flushed in batches, so request handlers never block on the network.
        </P>
        <Code lang="bash">{`npm install @traceiq/node`}</Code>
        <Code lang="ts">{`import { TraceIQ } from '@traceiq/node';

const traceiq = new TraceIQ({
  projectId: '${projectId}',
  writeKey: process.env.TRACEIQ_WRITE_KEY, // keep server keys secret
  endpoint: '${apiBaseUrl}',
});

// A trustworthy revenue event, straight from your payments service:
traceiq.capture({
  event: 'payout_succeeded',
  userId: 'user_123',
  properties: { amount: 50000, currency: 'NGN' },
});

traceiq.identify({ userId: 'user_123', traits: { kyc_tier: 2 } });

await traceiq.shutdown(); // flush before a short-lived process exits`}</Code>
        <P>
          Events flush automatically by size (<Mono>flushAt</Mono>) or on a timer (<Mono>flushIntervalMs</Mono>).
          Call <Mono>shutdown()</Mono> in scripts and serverless functions so nothing is lost on exit.
        </P>
      </Section>
    );
  }

  if (id === 'react-native') {
    return (
      <Section id="react-native" title="React Native / Expo SDK">
        <P>
          <Mono>traceiq-react-native</Mono> tracks screens and events with device info, persists the anonymous
          id across launches, and flushes when the app backgrounds.
        </P>
        <Code lang="bash">{`npm install traceiq-react-native
# optional, to persist the anonymous id across launches:
npm install @react-native-async-storage/async-storage`}</Code>
        <Code lang="ts">{`import { traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
  appVersion: '1.4.0',
});

traceiq.identify({ userId: 'user_123', traits: { kyc_tier: 2 } });
traceiq.screen('Wallet');
traceiq.capture({ event: 'transfer_started', properties: { amount: 5000, currency: 'NGN' } });`}</Code>
      </Section>
    );
  }

  if (id === 'python') {
    return (
      <Section id="python" title="Python SDK">
        <P>
          <Mono>traceiq</Mono> for Python (3.8+) — standard library only, with a background flush thread.
        </P>
        <Code lang="bash">{`pip install traceiq-py`}</Code>
        <P>
          Package links: <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="https://pypi.org/project/traceiq-py/0.1.0/" target="_blank" rel="noreferrer">PyPI</a>,{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="https://crates.io/crates/traceiq" target="_blank" rel="noreferrer">crates.io</a>,{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="https://www.npmjs.com/package/traceiq-sdk-js" target="_blank" rel="noreferrer">npm (JS SDK)</a>,{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="https://www.npmjs.com/package/traceiq-react-native" target="_blank" rel="noreferrer">npm (React Native)</a>,{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="https://www.npmjs.com/package/traceiq-mcp-server" target="_blank" rel="noreferrer">npm (MCP server)</a>.
        </P>
        <Code lang="python">{`from traceiq import Client

traceiq = Client(
    project_id="${projectId}",
    write_key="YOUR_WRITE_KEY",
    endpoint="${apiBaseUrl}",
)

traceiq.capture("payout_succeeded", user_id="user_123",
                properties={"amount": 50000, "currency": "NGN"})
traceiq.shutdown()  # flush before exit`}</Code>
      </Section>
    );
  }

  if (id === 'swift') {
    return (
      <Section id="swift" title="Swift SDK">
        <P>
          <Mono>TraceIQ</Mono> for Apple platforms (iOS 13+, macOS 10.15+) and server-side Swift. Foundation-only.
          Add it via Swift Package Manager, then:
        </P>
        <Code lang="swift">{`import TraceIQ

let traceiq = TraceIQ(config: .init(
  projectId: "${projectId}",
  writeKey: "YOUR_WRITE_KEY",
  endpoint: "${apiBaseUrl}"
))

traceiq.identify(userId: "user_123", traits: ["kyc_tier": 2])
traceiq.capture("transfer_started", userId: "user_123", properties: ["amount": 5000])`}</Code>
      </Section>
    );
  }

  if (id === 'kotlin') {
    return (
      <Section id="kotlin" title="Kotlin / Android SDK">
        <P>
          <Mono>com.traceiq:traceiq</Mono> for JVM servers and Android (API 21+). No third-party dependencies.
          On Android, add the <Mono>INTERNET</Mono> permission.
        </P>
        <Code lang="kotlin">{`import com.traceiq.TraceIQ
import com.traceiq.TraceIQConfig

val traceiq = TraceIQ(TraceIQConfig(
  projectId = "${projectId}",
  writeKey = "YOUR_WRITE_KEY",
  endpoint = "${apiBaseUrl}",
))

traceiq.identify("user_123", traits = mapOf("kyc_tier" to 2))
traceiq.capture("transfer_started", userId = "user_123",
                properties = mapOf("amount" to 5000, "currency" to "NGN"))`}</Code>
      </Section>
    );
  }

  if (id === 'rust') {
    return (
      <Section id="rust" title="Rust SDK">
        <P>
          <Mono>traceiq</Mono> for Rust — events are queued and flushed in batches by a background thread.
          Uses <Mono>serde</Mono>, <Mono>ureq</Mono>, and <Mono>chrono</Mono>.
        </P>
        <Code lang="toml">{`# Cargo.toml
[dependencies]
traceiq = "0.1.0"`}</Code>
        <Code lang="rust">{`use traceiq::Client;

let mut traceiq = Client::new("${projectId}", "YOUR_WRITE_KEY");

traceiq.capture("payout_succeeded", Some("user_123"), None,
    Some(serde_json::json!({"amount": 50000, "currency": "NGN"})),
    None, None);

traceiq.shutdown(); // flush before exit`}</Code>
      </Section>
    );
  }

  if (id === 'php') {
    return (
      <Section id="php" title="PHP SDK">
        <P>
          <Mono>traceiq/traceiq-php</Mono> for PHP 8.1+ — a zero-dependency Composer package. Events are queued
          and flushed in batches; PHP has no background threads, so flushing is synchronous at <Mono>flush_at</Mono>{' '}
          and on request shutdown.
        </P>
        <Code lang="bash">{`composer require traceiq/traceiq-php`}</Code>
        <Code lang="php">{`use TraceIQ\\Client;

$traceiq = new Client(
    projectId: "${projectId}",
    writeKey: "YOUR_WRITE_KEY",
    endpoint: "${apiBaseUrl}",
);

$traceiq->capture(
    event: "payout_succeeded",
    userId: "user_123",
    properties: ["amount" => 50000, "currency" => "NGN"],
);

$traceiq->shutdown(); // flush before a short-lived process exits`}</Code>
      </Section>
    );
  }

  if (id === 'ingestion') {
    return (
      <Section id="ingestion" title="Server-side ingestion (HTTP)">
        <P>
          For backend or non-browser events, POST directly to the ingestion endpoint with your write key in the{' '}
          <Mono>x-traceiq-write-key</Mono> header.
        </P>
        <Code lang="bash">{`curl -X POST ${apiBaseUrl}/v1/events \\
  -H 'content-type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY' \\
  -d '{
    "projectId": "${projectId}",
    "userId": "user_123",
    "sessionId": "sess_1",
    "eventName": "purchase",
    "properties": { "amount": 49 },
    "timestamp": "2026-07-18T10:00:00.000Z"
  }'`}</Code>
        <P>Response:</P>
        <Code lang="json">{`{ "accepted": true, "eventId": "evt_..." }`}</Code>
        <P>
          To send many events in one request, POST to <Mono>/v1/events/batch</Mono> with a{' '}
          <Mono>{'{ projectId, batch: [...] }'}</Mono> body (up to 500 events). Each event is validated
          independently — one bad event fails only itself. This is what <Mono>@traceiq/node</Mono> uses.
        </P>
      </Section>
    );
  }

  if (id === 'flags') {
    return (
      <Section id="flags" title="Feature flags & remote config">
        <P>
          Ship code behind a flag and turn it on for a slice of users without a release. Rollout is
          deterministic and sticky — a user hashed into the rollout stays in as you raise the percentage, so
          nobody flickers on and off. Create and roll out flags under{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/flags">
            Feature flags
          </a>
          .
        </P>
        <P>
          With the browser SDK, load this user&apos;s flags once, then read them synchronously. Evaluation uses the
          current <Mono>userId</Mono> (after <Mono>identify()</Mono>) or the anonymous id, so results are stable
          per person.
        </P>
        <Code lang="ts">{`// Fetch once (e.g. on app start, and again after identify())
await traceiq.loadFeatureFlags();

if (traceiq.isFeatureEnabled('new-checkout')) {
  renderNewCheckout();
}`}</Code>
        <P>
          A flag can also carry a JSON <strong>payload</strong> (remote config) — limits, copy, or a config
          object. The payload is delivered only when the flag is on for that user, so it doubles as a way to
          tune behavior without shipping code.
        </P>
        <Code lang="ts">{`// Payload is undefined when the flag is off for this user
const cfg = traceiq.getFeatureFlagPayload('checkout-limits');
// e.g. { "maxAmount": 50000, "currency": "NGN" }
const max = cfg?.maxAmount ?? 100000;`}</Code>
        <P>
          Any client can evaluate flags over HTTP — same write key as ingestion, in the{' '}
          <Mono>x-traceiq-write-key</Mono> header. This is what the SDK calls under the hood.
        </P>
        <Code lang="bash">{`curl -X POST ${apiBaseUrl}/v1/flags/evaluate \\
  -H 'content-type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY' \\
  -d '{ "projectId": "${projectId}", "distinctId": "user_123" }'`}</Code>
        <P>Response — a map of flag → on/off, plus payloads for the flags that are on:</P>
        <Code lang="json">{`{
  "flags": { "new-checkout": true, "legacy-flow": false },
  "payloads": { "new-checkout": { "maxAmount": 50000 } }
}`}</Code>
        <P>
          <strong>Target a segment before rolling out.</strong> A flag can require that a user&apos;s properties match
          one or more rules (all must match — AND). The SDK sends the user&apos;s traits automatically, and you can pass
          any other property (e.g. <Mono>plan</Mono>, <Mono>country</Mono>) at load time. Rules evaluate before the
          rollout %, so only matching users are ever in the bucket.
        </P>
        <Code lang="ts">{`// Must match ALL rules, then the % rollout applies within that set.
await traceiq.loadFeatureFlags({ plan: 'pro', country: 'US' });

// Behind the scenes the dashboard stored:
// targeting: [{ property: 'plan', operator: 'eq', value: 'pro' },
//             { property: 'country', operator: 'eq', value: 'US' }]`}</Code>
        <P>Supported operators on property values:</P>
        <Bullets
          items={[
            ['eq / ne', 'Equal to / not equal to a string, number, or boolean.'],
            ['gt / gte / lt / lte', 'Numeric comparison — the property must be a number to match.'],
            ['Overrides', 'A per-user on/off override always wins, before targeting and rollout.']
          ]}
        />
        <P>
          Full evaluation order per user: master switch → per-user override → targeting rules → % rollout. A flag that
          targets everyone behaves exactly as before.
        </P>
      </Section>
    );
  }

  if (id === 'alerts') {
    return (
      <Section id="alerts" title="Alerts">
        <P>
          Watch a metric on a rolling window and get told the moment it crosses a line — instead of staring at a chart.
          Create alerts under{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/alerts">
            Alerts
          </a>
          .
        </P>
        <P>A alert watches one event with a measure (count, unique users, sum/avg of a numeric property):</P>
        <Bullets
          items={[
            ['above / below', 'Fire when the metric crosses a fixed threshold (e.g. "checkout_started count above 500").'],
            ['drops_by / spikes_by', 'Fire when the metric changes by ≥ N% versus the previous window of the same length.'],
            ['Rolling window', 'The metric is computed over a rolling 1h–7d window, checked automatically in the background.'],
            ['Edge-triggered', 'A firing is recorded once when the alert transitions into the triggered state, so you are not paged every check while it stays fired.']
          ]}
        />
        <P>When an alert fires you can be reached through one or both channels:</P>
        <Bullets
          items={[
            ['Webhook', 'A POST with the alert details to any URL (Slack, ops tools, …).'],
            ['Email', 'A formatted email to any list of recipients, or to the members of a saved notification group. Groups live under Alerts, so you can attach an on-call list to many alerts and edit it once.']
          ]}
        />
        <P>
          Every firing records a per-recipient delivery row — the Alerts page shows who was emailed / webhook-posted and
          whether each delivery succeeded. Use <Mono>Test</Mono> on an alert to evaluate it once without firing.
        </P>
      </Section>
    );
  }

  if (id === 'dashboards') {
    return (
      <Section id="dashboards" title="Dashboards">
        <P>
          Save any Insights view as a dashboard and pin the views your team looks at daily, without building a custom
          chart grid. Create them from the{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/dashboards">
            Dashboards
          </a>{' '}
          page or the <Mono>Save view</Mono> button on Insights.
        </P>
        <Bullets
          items={[
            ['One view per dashboard', 'A dashboard captures a metric, measure, interval, and segment — the URL of an Insights view.'],
            ['Mine / Shared', 'Dashboards are private unless you mark them shared, which makes them visible to your team.'],
            ['Compare side-by-side', 'Open two dashboards at once to eyeball this period versus the previous one, or one metric versus another.'],
            ['Custom date ranges', 'Insights accepts free-form from / to dates (or a preset like last 7/30/90 days) instead of only fixed presets — the comparison window follows the exact range you pick.']
          ]}
        />
        <P>
          Dashboards are per-user and intentionally simple: one saved query each, surfaced everywhere a saved metric
          should be. If you need tiles, Export the raw view and build it in your own BI tool.
        </P>
      </Section>
    );
  }

  if (id === 'mcp') {
    return (
      <Section id="mcp" title="MCP server">
        <P>
          TraceIQ's MCP server is an analytics copilot for AI clients. Through a local stdio process it can read
          analytics, funnels, retention, errors, users, API health, and feature flags — and, with a write-scoped token,
          toggle flags and manage funnels and alerts. The client talks to the <Mono>traceiq-mcp-server</Mono> npm package,
          and the MCP server talks to your TraceIQ API using a personal access token.
        </P>
        <P>
          Create the token from{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/settings">
            Settings
          </a>
          . In <Mono>Personal access tokens</Mono>, choose a name such as <Mono>Claude Desktop</Mono>, then select the
          scopes the assistant should have. For a read-only copilot use <Mono>projects:read</Mono>,{' '}
          <Mono>analytics:read</Mono>, <Mono>insights:read</Mono>, <Mono>funnels:read</Mono>, <Mono>users:read</Mono>,
          and <Mono>errors:read</Mono>. Add write scopes (<Mono>flags:write</Mono>, <Mono>funnels:write</Mono>,{' '}
          <Mono>alerts:write</Mono>) only if the assistant may make changes. Read-only tokens cannot mutate anything.
        </P>
        <P>
          The dashboard shows the full <Mono>tiq_pat_...</Mono> value once and generates a ready-to-copy Claude
          Desktop config. TraceIQ stores only a SHA-256 hash after creation.
        </P>
        <P>Claude Desktop config:</P>
        <Code lang="json">{`{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "${apiBaseUrl}"
      }
    }
  }
}`}</Code>
        <P>Cursor can use the same command as an MCP server:</P>
        <Code lang="bash">{`npx -y traceiq-mcp-server`}</Code>
        <OptionsTable
          rows={[
            ['TRACEIQ_API_KEY', 'required', 'A personal access token that starts with tiq_pat_.'],
            ['TRACEIQ_API_URL', `'${apiBaseUrl}'`, 'TraceIQ API base URL.'],
            ['TRACEIQ_MCP_TIMEOUT_MS', '30000', 'Per-request timeout in milliseconds.'],
            ['TRACEIQ_MCP_RETRIES', '2', 'Retries for 408/429/5xx responses (exponential backoff).']
          ]}
        />
        <P>The server currently exposes these tools:</P>
        <Bullets
          items={[
            ['list_projects', 'List projects available to the token. Requires projects:read.'],
            ['get_analytics_overview', 'Headline totals, revenue, top events/devices/countries. Requires analytics:read.'],
            ['get_web_analytics', 'Visitors, pageviews, sessions, bounce rate (current vs previous). Requires analytics:read.'],
            ['get_api_performance', 'Endpoint p95/avg latency, error rate, busiest and slowest routes. Requires analytics:read.'],
            ['list_event_names', 'Tracked events with counts. Requires insights:read.'],
            ['get_trends', 'Event counts over time with period-over-period change. Requires insights:read.'],
            ['get_retention', 'Weekly cohort retention table and averages. Requires insights:read.'],
            ['list_funnels / get_funnel / get_funnel_results / get_funnel_step_users', 'Funnel definitions, conversion and drop-off, and the users behind each step. Requires funnels:read.'],
            ['summarize_funnel_dropoff', 'A plain-language (LLM) explanation of why a funnel drops off. Requires funnels:read.'],
            ['list_error_issues / get_error_issue', 'Aggregated error issues and deep-dive detail. Requires errors:read.'],
            ['list_users / get_user / get_user_timeline', 'Users, full profiles, and a concise chronological timeline. Requires users:read.'],
            ['list_feature_flags', 'List feature flags. Requires flags:read.'],
            ['list_alerts', 'List alerts and recent fires. Requires alerts:read.'],
            ['explain_conversion_drop', 'Funnel + traffic analysis with the biggest drop-off and a data-backed interpretation. Requires funnels:read and analytics:read.'],
            ['summarize_api_health', 'API health verdict: error rate and slowest/error-prone/busiest endpoints. Requires analytics:read.'],
            ['show_retention_changes', 'Retention cohorts with a plain-language note. Requires insights:read.'],
            ['find_users_who_failed_checkout', 'Users who dropped at the final funnel step. Requires funnels:read and users:read.'],
            ['toggle_feature_flag', 'Enable or disable a feature flag. Requires flags:write.'],
            ['create_funnel / update_funnel / delete_funnel', 'Manage funnels. Requires funnels:write (delete is destructive).'],
            ['create_alert / set_alert_enabled / delete_alert', 'Manage alerts. Requires alerts:write (delete is destructive).']
          ]}
        />
        <P>
          Revoke a token from Settings at any time. For automation, the same dashboard endpoint is available at
          <Mono>POST /v1/dashboard/personal-access-tokens</Mono>, but the Settings flow is the recommended path.
        </P>
      </Section>
    );
  }

  if (id === 'api-performance') {
    return (
      <Section id="api-performance" title="API performance">
        <P>
          Track the latency, errors, and traffic of <strong>your own API endpoints</strong>. Each request becomes a
          reserved <Mono>$api_request</Mono> event, and the{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/api-performance">
            API performance
          </a>{' '}
          page ranks your slowest (by p95), most error-prone, and busiest endpoints.
        </P>
        <P>
          <strong>Backend (Node/Express)</strong> — one line of middleware times every request:
        </P>
        <Code lang="ts">{`import { TraceIQ } from '@traceiq/node';

const traceiq = new TraceIQ({
  projectId: '${projectId}',
  writeKey: process.env.TRACEIQ_WRITE_KEY,
  endpoint: '${apiBaseUrl}',
});

// Emits $api_request { method, path, status, durationMs } per request.
app.use(traceiq.middleware({
  resolveUserId: (req) => req.user?.id,      // optional
  ignore: (req) => req.path === '/health',   // optional
}));`}</Code>
        <P>
          Paths use the matched route template (<Mono>/users/:id</Mono>), so requests group cleanly instead of
          exploding per id.
        </P>
        <P>
          <strong>Browser</strong> — opt in and the SDK wraps <Mono>fetch</Mono> to time each call (its own calls to
          TraceIQ are skipped):
        </P>
        <Code lang="ts">{`traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
  autoCaptureRequests: true, // capture outgoing fetch() as $api_request
});`}</Code>
        <P>
          Anything else (gRPC, background jobs) can report directly by sending an <Mono>$api_request</Mono> event
          with <Mono>method</Mono>, <Mono>path</Mono>, <Mono>status</Mono>, and <Mono>durationMs</Mono> properties.
        </P>
      </Section>
    );
  }

  if (id === 'webhooks') {
    return (
      <Section id="webhooks" title="Webhooks">
        <P>
          Forward events to another system the moment they land — a data-warehouse loader, an ops tool, a Slack
          relay. Add a webhook under{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/webhooks">
            Webhooks
          </a>
          : a URL, an optional signing secret, and either all events or a chosen list. Delivery is best-effort and
          never blocks or slows down ingestion.
        </P>
        <P>Each delivery is a JSON <Mono>POST</Mono> with this body:</P>
        <Code lang="json">{`{
  "webhookId": "whk_…",
  "event": "purchase",
  "eventId": "evt_…",
  "userId": "user_123",
  "anonymousId": null,
  "sessionId": "sess_1",
  "properties": { "amount": 50000, "currency": "NGN" },
  "occurredAt": "2026-07-18T10:00:00.000Z",
  "deliveredAt": "2026-07-18T10:00:00.400Z"
}`}</Code>
        <P>
          If you set a secret, every request carries an <Mono>x-traceiq-signature</Mono> header so you can confirm
          it came from TraceIQ and wasn&apos;t tampered with — an HMAC-SHA256 of the raw request body:
        </P>
        <Code lang="ts">{`// Node.js — verify the signature
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</Code>
        <P>
          Use <Mono>Test</Mono> on any webhook to send a sample <Mono>traceiq.webhook.test</Mono> payload and see
          the response code. Recent deliveries (and failures) are logged on the Webhooks page.
        </P>
      </Section>
    );
  }

  if (id === 'export') {
    return (
      <Section id="export" title="Data export">
        <P>
          Pull raw events out as CSV or JSON — for a spreadsheet, a notebook, or loading into your own warehouse.
          The{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/export">
            Export
          </a>{' '}
          page downloads a date range (optionally one event) with a row cap; CSV flattens the top-level fields and
          includes the full <Mono>properties</Mono> object as a JSON column.
        </P>
        <P>Or call the API directly with your dashboard token:</P>
        <Code lang="bash">{`curl '${apiBaseUrl}/v1/dashboard/export/events?from=2026-07-01&to=2026-07-18&event=purchase&limit=10000' \\
  -H 'Authorization: Bearer YOUR_DASHBOARD_TOKEN'`}</Code>
        <P>
          Returns <Mono>{'{ count, truncated, events: [...] }'}</Mono>. Up to 50,000 rows per request — if{' '}
          <Mono>truncated</Mono> is true, narrow the date range to fetch the rest.
        </P>
      </Section>
    );
  }

  if (id === 'events') {
    return (
      <Section id="events" title="Reserved events">
        <P>
          Event names prefixed with <Mono>$</Mono> are emitted by the SDK — avoid reusing them for custom events.
        </P>
        <Bullets
          items={[
            ['$page', 'A page view.'],
            ['$identify', 'Emitted by identify().'],
            ['$group', 'Emitted by group().'],
            ['$exception', 'An error occurrence (powers Error tracking).'],
            ['$rageclick', 'A rage click (powers Frustrating pages).'],
            ['$api_request', 'An API request — method, path, status, durationMs (powers API performance).']
          ]}
        />
      </Section>
    );
  }

  if (id === 'features') {
    return (
      <Section id="features" title="Feature guide">
        <Bullets
          items={[
            ['Events', 'Live stream of raw events; expand a row for the full payload (properties, device, network, context).'],
            ['Insights', 'Trend any event over time (hourly/daily/weekly), broken down by a property or dimension (os, country, …). Supports measures — count, unique users, sum/avg of a numeric property like amount.'],
            ['Dashboards', 'Saved Insights views you pin and open side-by-side — mine/shared, with free-form date ranges that drive the comparison window.'],
            ['Funnels', 'Ordered-event conversion with per-step drop-off; click a step to see who reached it or dropped off.'],
            ['Retention', 'Weekly cohort × week-offset grid — of the people who did something in a week, how many came back in later weeks. The core "is it sticky?" view.'],
            ['Cohorts', 'Saved groups of users defined by the events they did (or didn’t) do, reusable as filters across the product.'],
            ['Users', 'Identified people and their chronological timelines, device, and location.'],
            ['Web analytics', 'Visitors, sessions, bounce rate, top paths, sources, devices, geography, active hours, and frustrating pages.'],
            ['Errors', 'Grouped exceptions with occurrences, affected users, stack traces, and browser/OS breakdown.'],
            ['API performance', 'Per-endpoint latency (p95), error rate, and traffic from $api_request events — slowest, most error-prone, and busiest routes.'],
            ['Alerts', 'Watch a metric on a rolling window and fire when it crosses a threshold or drops/spikes vs. the previous period; firings can POST to a webhook and/or email recipients or notification groups, with per-recipient delivery status.'],
            ['Feature flags', 'Deterministic percentage rollouts, per-user overrides, property-targeting segments, and JSON payloads (remote config) evaluated by the SDK.'],
            ['MCP server', 'Connect Claude Desktop, Cursor, or another MCP client to TraceIQ as an analytics copilot — read funnels, retention, errors, users, and API health, and toggle flags with a personal access token.'],
            ['Webhooks', 'Forward matching events to an external URL in real time, optionally HMAC-signed.'],
            ['Export', 'Download raw events as CSV or JSON for a date range, or via the export API.'],
            ['Identity stitching', 'When an anonymous visitor later identifies, their earlier anonymous events are merged onto the user automatically — one person everywhere.'],
            ['Segmentation', 'Most views accept filters (os, device, country, region, city, and event properties) so you can slice any metric to a segment.']
          ]}
        />
      </Section>
    );
  }

  return null;
}

export function PathCardsGrid({ basePath }: { basePath: string }) {
  const paths = [
    {
      title: 'Install TraceIQ JS',
      desc: 'npm install traceiq-sdk-js and start capturing events in minutes.',
      href: `${basePath}?page=quickstart`
    },
    {
      title: 'Browser Autocapture',
      desc: 'Automatic click tracking, rage clicks, and page view sessions.',
      href: `${basePath}?page=autocapture`
    },
    {
      title: 'Server & Mobile SDKs',
      desc: 'Node.js, React Native, Python, Swift, Kotlin, Rust, and PHP SDKs.',
      href: `${basePath}?page=node`
    },
    {
      title: 'Feature Flags',
      desc: 'Percentage rollouts, per-user overrides, and JSON remote config.',
      href: `${basePath}?page=flags`
    },
    {
      title: 'Alerts & Webhooks',
      desc: 'Set rolling metric threshold alerts and dispatch real-time webhooks.',
      href: `${basePath}?page=alerts`
    },
    {
      title: 'MCP Copilot Server',
      desc: 'Connect Claude Desktop or Cursor to TraceIQ as an analytics copilot.',
      href: `${basePath}?page=mcp`
    }
  ];

  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Choose Your Path</h3>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {paths.map((p) => (
          <Link
            key={p.title}
            href={p.href}
            className="group flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-900 transition group-hover:text-blue-600 dark:text-white dark:group-hover:text-cyan-400">
                  {p.title}
                </span>
                <span className="text-neutral-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-cyan-400">
                  →
                </span>
              </div>
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">{p.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface DocsExplorerProps {
  activeId: string;
  basePath: string;
  projectId: string;
  apiBaseUrl: string;
  snippet: string;
  onOpenSearch?: () => void;
}

export function DocsExplorer({ activeId, basePath, projectId, apiBaseUrl, snippet, onOpenSearch }: DocsExplorerProps) {
  const activeSectionIndex = docsSections.findIndex((s) => s.id === activeId);
  const currentSection = activeSectionIndex !== -1 ? docsSections[activeSectionIndex] : docsSections[0];
  const currentId = currentSection.id;

  return (
    <DocsLayout sections={docsSections} currentId={currentId} basePath={basePath} onOpenSearch={onOpenSearch}>
      <div className="min-w-0 flex-1">
        <DocsSectionBody id={currentId} projectId={projectId} apiBaseUrl={apiBaseUrl} snippet={snippet} />

        {/* Pagination Controls */}
        <div className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-6 dark:border-slate-800">
          {activeSectionIndex > 0 ? (
            <Link
              href={`${basePath}?page=${docsSections[activeSectionIndex - 1].id}`}
              className="group flex flex-col items-start gap-1 rounded-lg border border-neutral-200 px-4 py-3 transition hover:bg-neutral-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Previous
              </span>
              <span className="text-sm font-semibold text-neutral-900 transition group-hover:text-neutral-700 dark:text-white dark:group-hover:text-slate-200">
                ← {docsSections[activeSectionIndex - 1].label}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {activeSectionIndex < docsSections.length - 1 ? (
            <Link
              href={`${basePath}?page=${docsSections[activeSectionIndex + 1].id}`}
              className="group flex flex-col items-end gap-1 rounded-lg border border-neutral-200 px-4 py-3 transition hover:bg-neutral-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Next
              </span>
              <span className="text-sm font-semibold text-neutral-900 transition group-hover:text-neutral-700 dark:text-white dark:group-hover:text-slate-200">
                {docsSections[activeSectionIndex + 1].label} →
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </DocsLayout>
  );
}
