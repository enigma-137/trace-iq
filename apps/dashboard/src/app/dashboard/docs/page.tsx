import type { ReactNode } from 'react';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface SetupResponse {
  project: { id: string } | null;
  sdkSnippet: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const FALLBACK_SNIPPET = `import { traceiq } from '@traceiq/sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
});

traceiq.track('signup_completed', { plan: 'pro' });`;

export default async function DocsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/docs');
  const { data } = await dashboardGet<SetupResponse>('/v1/setup', token);
  const projectId = data?.project?.id ?? 'YOUR_PROJECT_ID';
  const snippet = data?.sdkSnippet ?? FALLBACK_SNIPPET;

  const sections = [
    { id: 'quickstart', label: 'Quickstart' },
    { id: 'methods', label: 'SDK methods' },
    { id: 'config', label: 'Configuration' },
    { id: 'autocapture', label: 'Autocapture' },
    { id: 'node', label: 'Node.js SDK' },
    { id: 'react-native', label: 'React Native SDK' },
    { id: 'python', label: 'Python SDK' },
    { id: 'swift', label: 'Swift SDK' },
    { id: 'kotlin', label: 'Kotlin SDK' },
    { id: 'ingestion', label: 'Server-side ingestion' },
    { id: 'events', label: 'Reserved events' },
    { id: 'features', label: 'Feature guide' }
  ];

  return (
    <DashboardShell active="docs" title="Docs" userEmail={user.email}>
      <div className="grid gap-8 xl:grid-cols-[1fr_200px]">
        <div className="min-w-0 max-w-3xl">
          <Section id="quickstart" title="Quickstart">
            <P>Install the SDK and initialize it with your project credentials (from Settings).</P>
            <Code>{`npm install @traceiq/sdk-js`}</Code>
            <Code>{snippet}</Code>
            <P>
              That&apos;s it — events start flowing to <Mono>Events</Mono> within seconds. Grab your write key from{' '}
              <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/settings">
                Settings
              </a>
              .
            </P>
          </Section>

          <Section id="methods" title="SDK methods">
            <P>The browser SDK exposes six methods on the default <Mono>traceiq</Mono> singleton.</P>
            <Code>{`// Identify the current person (creates/updates a user profile)
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

          <Section id="config" title="Configuration">
            <P>
              Options passed to <Mono>initialize()</Mono>:
            </P>
            <OptionsTable
              rows={[
                ['projectId', 'required', 'Your project ID.'],
                ['writeKey', 'required', 'SDK write key (safe to expose in the browser).'],
                ['endpoint', `'${apiBaseUrl}'`, 'TraceIQ API base URL.'],
                ['autoTrackPageViews', 'false', 'Send a $page event automatically on initialize.'],
                ['autoCaptureExceptions', 'true', 'Capture uncaught errors and unhandled promise rejections.'],
                ['autoCaptureRageClicks', 'true', 'Detect rage clicks (3+ rapid clicks in one spot).'],
                ['debug', 'false', 'Log SDK warnings to the console.']
              ]}
            />
          </Section>

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

          <Section id="node" title="Server-side SDK (Node.js)">
            <P>
              For backend events — payments, payouts, settlements, jobs — use <Mono>@traceiq/node</Mono>. Server events
              are the most trustworthy source of revenue: the <Mono>amount</Mono> comes from your systems, not the
              browser. Events are queued and flushed in batches, so request handlers never block on the network.
            </P>
            <Code>{`npm install @traceiq/node`}</Code>
            <Code>{`import { TraceIQ } from '@traceiq/node';

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

          <Section id="react-native" title="React Native / Expo SDK">
            <P>
              <Mono>@traceiq/react-native</Mono> tracks screens and events with device info, persists the anonymous
              id across launches, and flushes when the app backgrounds.
            </P>
            <Code>{`npm install @traceiq/react-native
# optional, to persist the anonymous id across launches:
npm install @react-native-async-storage/async-storage`}</Code>
            <Code>{`import { traceiq } from '@traceiq/react-native';

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

          <Section id="python" title="Python SDK">
            <P>
              <Mono>traceiq</Mono> for Python (3.8+) — standard library only, with a background flush thread.
            </P>
            <Code>{`pip install traceiq`}</Code>
            <Code>{`from traceiq import Client

traceiq = Client(
    project_id="${projectId}",
    write_key="YOUR_WRITE_KEY",
    endpoint="${apiBaseUrl}",
)

traceiq.capture("payout_succeeded", user_id="user_123",
                properties={"amount": 50000, "currency": "NGN"})
traceiq.shutdown()  # flush before exit`}</Code>
          </Section>

          <Section id="swift" title="Swift SDK">
            <P>
              <Mono>TraceIQ</Mono> for Apple platforms (iOS 13+, macOS 10.15+) and server-side Swift. Foundation-only.
              Add it via Swift Package Manager, then:
            </P>
            <Code>{`import TraceIQ

let traceiq = TraceIQ(config: .init(
  projectId: "${projectId}",
  writeKey: "YOUR_WRITE_KEY",
  endpoint: "${apiBaseUrl}"
))

traceiq.identify(userId: "user_123", traits: ["kyc_tier": 2])
traceiq.capture("transfer_started", userId: "user_123", properties: ["amount": 5000])`}</Code>
          </Section>

          <Section id="kotlin" title="Kotlin / Android SDK">
            <P>
              <Mono>com.traceiq:traceiq</Mono> for JVM servers and Android (API 21+). No third-party dependencies.
              On Android, add the <Mono>INTERNET</Mono> permission.
            </P>
            <Code>{`import com.traceiq.TraceIQ
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

          <Section id="ingestion" title="Server-side ingestion (HTTP)">
            <P>
              For backend or non-browser events, POST directly to the ingestion endpoint with your write key in the{' '}
              <Mono>x-traceiq-write-key</Mono> header.
            </P>
            <Code>{`curl -X POST ${apiBaseUrl}/v1/events \\
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
            <Code>{`{ "accepted": true, "eventId": "evt_..." }`}</Code>
            <P>
              To send many events in one request, POST to <Mono>/v1/events/batch</Mono> with a{' '}
              <Mono>{'{ projectId, batch: [...] }'}</Mono> body (up to 500 events). Each event is validated
              independently — one bad event fails only itself. This is what <Mono>@traceiq/node</Mono> uses.
            </P>
          </Section>

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
                ['$rageclick', 'A rage click (powers Frustrating pages).']
              ]}
            />
          </Section>

          <Section id="features" title="Feature guide">
            <Bullets
              items={[
                ['Events', 'Live stream of raw events; expand a row for the full payload (properties, device, network, context).'],
                ['Insights', 'Trend any event over time (hourly/daily/weekly), broken down by a property or dimension (os, country, …).'],
                ['Funnels', 'Ordered-event conversion with per-step drop-off; click a step to see who reached it or dropped off.'],
                ['Users', 'Identified people and their chronological timelines, device, and location.'],
                ['Web analytics', 'Visitors, sessions, bounce rate, top paths, sources, devices, geography, active hours, and frustrating pages.'],
                ['Errors', 'Grouped exceptions with occurrences, affected users, stack traces, and browser/OS breakdown.']
              ]}
            />
          </Section>
        </div>

        <nav className="hidden xl:block">
          <div className="sticky top-24">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">On this page</p>
            <ul className="grid gap-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a className="text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white" href={`#${s.id}`}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </DashboardShell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-neutral-200 py-8 first:pt-0 last:border-0 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">{children}</p>;
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      {children}
    </code>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <code>{children}</code>
    </pre>
  );
}

function Bullets({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className="grid gap-2">
      {items.map(([term, desc]) => (
        <li key={term} className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          <Mono>{term}</Mono> — {desc}
        </li>
      ))}
    </ul>
  );
}

function OptionsTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <div className="hidden grid-cols-[180px_120px_1fr] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-500 sm:grid">
        <span>Option</span>
        <span>Default</span>
        <span>Description</span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(([name, def, desc]) => (
          <div key={name} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_120px_1fr] sm:gap-4">
            <span className="font-mono text-xs text-neutral-900 dark:text-white">{name}</span>
            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{def}</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
