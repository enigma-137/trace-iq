import type { ReactNode } from 'react';
import Link from 'next/link';
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

export default async function DocsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
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
    { id: 'flags', label: 'Feature flags' },
    { id: 'mcp', label: 'MCP server' },
    { id: 'api-performance', label: 'API performance' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'export', label: 'Data export' },
    { id: 'events', label: 'Reserved events' },
    { id: 'features', label: 'Feature guide' }
  ];

  const activeId = (Array.isArray(searchParams?.page) ? searchParams.page[0] : searchParams?.page) || 'quickstart';
  const activeSectionIndex = sections.findIndex((s) => s.id === activeId);
  const currentSection = activeSectionIndex !== -1 ? sections[activeSectionIndex] : sections[0];
  const currentId = currentSection.id;

  return (
    <DashboardShell active="docs" title="Docs" userEmail={user.email}>
      <div className="grid gap-8 xl:grid-cols-[1fr_200px]">
        <div className="min-w-0 max-w-3xl">
          {currentId === 'quickstart' && (
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
          )}

          {currentId === 'methods' && (
            <Section id="methods" title="SDK methods">
              <P>Core methods on the default <Mono>traceiq</Mono> singleton (feature flags are covered in their own section).</P>
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
          )}

          {currentId === 'config' && (
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
          )}

          {currentId === 'autocapture' && (
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
          )}

          {currentId === 'node' && (
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
          )}

          {currentId === 'react-native' && (
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
          )}

          {currentId === 'python' && (
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
          )}

          {currentId === 'swift' && (
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
          )}

          {currentId === 'kotlin' && (
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
          )}

          {currentId === 'ingestion' && (
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
          )}

          {currentId === 'flags' && (
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
              <Code>{`// Fetch once (e.g. on app start, and again after identify())
await traceiq.loadFeatureFlags();

if (traceiq.isFeatureEnabled('new-checkout')) {
  renderNewCheckout();
}`}</Code>
              <P>
                A flag can also carry a JSON <strong>payload</strong> (remote config) — limits, copy, or a config
                object. The payload is delivered only when the flag is on for that user, so it doubles as a way to
                tune behavior without shipping code.
              </P>
              <Code>{`// Payload is undefined when the flag is off for this user
const cfg = traceiq.getFeatureFlagPayload('checkout-limits');
// e.g. { "maxAmount": 50000, "currency": "NGN" }
const max = cfg?.maxAmount ?? 100000;`}</Code>
              <P>
                Any client can evaluate flags over HTTP — same write key as ingestion, in the{' '}
                <Mono>x-traceiq-write-key</Mono> header. This is what the SDK calls under the hood.
              </P>
              <Code>{`curl -X POST ${apiBaseUrl}/v1/flags/evaluate \\
  -H 'content-type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY' \\
  -d '{ "projectId": "${projectId}", "distinctId": "user_123" }'`}</Code>
              <P>Response — a map of flag → on/off, plus payloads for the flags that are on:</P>
              <Code>{`{
  "flags": { "new-checkout": true, "legacy-flow": false },
  "payloads": { "new-checkout": { "maxAmount": 50000 } }
}`}</Code>
            </Section>
          )}

          {currentId === 'mcp' && (
            <Section id="mcp" title="MCP server">
              <P>
                TraceIQ's MCP server lets AI clients query your projects and feature flags through a local stdio process.
                The client talks to <Mono>@traceiq/mcp-server</Mono>, and the MCP server talks to your TraceIQ API using a
                personal access token.
              </P>
              <P>Before connecting an AI client, create a personal access token with the scopes the server needs:</P>
              <Code>{`curl -X POST ${apiBaseUrl}/v1/dashboard/personal-access-tokens \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer YOUR_DASHBOARD_TOKEN' \
  -d '{
    "name": "Claude Desktop",
    "scopes": ["projects:read", "flags:read", "flags:write"]
  }'`}</Code>
              <P>
                The response includes <Mono>token</Mono> once. Store it as <Mono>TRACEIQ_API_KEY</Mono>; TraceIQ only stores
                a SHA-256 hash after creation.
              </P>
              <Code>{`{
  "id": "pat_...",
  "tokenPrefix": "tiq_pat_...",
  "scopes": ["projects:read", "flags:read", "flags:write"],
  "token": "tiq_pat_your_token_here"
}`}</Code>
              <P>Claude Desktop config:</P>
              <Code>{`{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "@traceiq/mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "${apiBaseUrl}"
      }
    }
  }
}`}</Code>
              <P>Cursor can use the same command as an MCP server:</P>
              <Code>{`npx -y @traceiq/mcp-server`}</Code>
              <OptionsTable
                rows={[
                  ['TRACEIQ_API_KEY', 'required', 'A personal access token that starts with tiq_pat_.'],
                  ['TRACEIQ_API_URL', `'${apiBaseUrl}'`, 'TraceIQ API base URL.']
                ]}
              />
              <P>The server currently exposes these tools:</P>
              <Bullets
                items={[
                  ['list_projects', 'List projects available to the token. Requires projects:read.'],
                  ['list_feature_flags', 'List feature flags for a project. Requires flags:read.'],
                  ['toggle_feature_flag', 'Enable or disable a feature flag. Requires flags:write.']
                ]}
              />
              <P>
                If a token is only for read-only analysis, omit <Mono>flags:write</Mono>. Revoke a token at any time with
                <Mono>DELETE /v1/dashboard/personal-access-tokens/:id</Mono>.
              </P>
            </Section>
          )}
          {currentId === 'api-performance' && (
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
              <Code>{`import { TraceIQ } from '@traceiq/node';

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
              <Code>{`traceiq.initialize({
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
          )}

          {currentId === 'webhooks' && (
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
              <Code>{`{
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
              <Code>{`// Node.js — verify the signature
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
          )}

          {currentId === 'export' && (
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
              <Code>{`curl '${apiBaseUrl}/v1/dashboard/export/events?from=2026-07-01&to=2026-07-18&event=purchase&limit=10000' \\
  -H 'Authorization: Bearer YOUR_DASHBOARD_TOKEN'`}</Code>
              <P>
                Returns <Mono>{'{ count, truncated, events: [...] }'}</Mono>. Up to 50,000 rows per request — if{' '}
                <Mono>truncated</Mono> is true, narrow the date range to fetch the rest.
              </P>
            </Section>
          )}

          {currentId === 'events' && (
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
          )}

          {currentId === 'features' && (
            <Section id="features" title="Feature guide">
              <Bullets
                items={[
                  ['Events', 'Live stream of raw events; expand a row for the full payload (properties, device, network, context).'],
                  ['Insights', 'Trend any event over time (hourly/daily/weekly), broken down by a property or dimension (os, country, …). Supports measures — count, unique users, sum/avg of a numeric property like amount.'],
                  ['Funnels', 'Ordered-event conversion with per-step drop-off; click a step to see who reached it or dropped off.'],
                  ['Retention', 'Weekly cohort × week-offset grid — of the people who did something in a week, how many came back in later weeks. The core "is it sticky?" view.'],
                  ['Cohorts', 'Saved groups of users defined by the events they did (or didn’t) do, reusable as filters across the product.'],
                  ['Users', 'Identified people and their chronological timelines, device, and location.'],
                  ['Web analytics', 'Visitors, sessions, bounce rate, top paths, sources, devices, geography, active hours, and frustrating pages.'],
                  ['Errors', 'Grouped exceptions with occurrences, affected users, stack traces, and browser/OS breakdown.'],
                  ['API performance', 'Per-endpoint latency (p95), error rate, and traffic from $api_request events — slowest, most error-prone, and busiest routes.'],
                  ['Alerts', 'Watch a metric on a rolling window and fire when it crosses a threshold or drops/spikes vs. the previous period; firings can POST to a webhook.'],
                  ['Feature flags', 'Deterministic percentage rollouts, per-user overrides, and JSON payloads (remote config) evaluated by the SDK.'],
                  ['MCP server', 'Connect Claude Desktop, Cursor, or another MCP client to TraceIQ projects and feature flags with a personal access token.'],
                  ['Webhooks', 'Forward matching events to an external URL in real time, optionally HMAC-signed.'],
                  ['Export', 'Download raw events as CSV or JSON for a date range, or via the export API.'],
                  ['Identity stitching', 'When an anonymous visitor later identifies, their earlier anonymous events are merged onto the user automatically — one person everywhere.'],
                  ['Segmentation', 'Most views accept filters (os, device, country, region, city, and event properties) so you can slice any metric to a segment.']
                ]}
              />
            </Section>
          )}

          {/* Pagination Controls */}
          <div className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-6 dark:border-slate-800">
            {activeSectionIndex > 0 ? (
              <Link
                href={`/dashboard/docs?page=${sections[activeSectionIndex - 1].id}`}
                className="group flex flex-col items-start gap-1 rounded-lg border border-neutral-200 px-4 py-3 transition hover:bg-neutral-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                  Previous
                </span>
                <span className="text-sm font-semibold text-neutral-900 transition group-hover:text-neutral-700 dark:text-white dark:group-hover:text-slate-200">
                  ← {sections[activeSectionIndex - 1].label}
                </span>
              </Link>
            ) : (
              <div />
            )}

            {activeSectionIndex < sections.length - 1 ? (
              <Link
                href={`/dashboard/docs?page=${sections[activeSectionIndex + 1].id}`}
                className="group flex flex-col items-end gap-1 rounded-lg border border-neutral-200 px-4 py-3 transition hover:bg-neutral-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                  Next
                </span>
                <span className="text-sm font-semibold text-neutral-900 transition group-hover:text-neutral-700 dark:text-white dark:group-hover:text-slate-200">
                  {sections[activeSectionIndex + 1].label} →
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>

        <nav className="hidden xl:block">
          <div className="sticky top-24">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500 pl-3">Docs Sections</p>
            <ul className="grid gap-1 text-sm">
              {sections.map((s) => {
                const isActive = s.id === currentId;
                return (
                  <li key={s.id}>
                    <Link
                      className={`block border-l-2 py-1 pl-3 transition ${
                        isActive
                          ? 'font-semibold text-neutral-900 dark:text-white border-slate-900 dark:border-white'
                          : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                      href={`/dashboard/docs?page=${s.id}`}
                    >
                      {s.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      </div>
    </DashboardShell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-neutral-200 py-8 first:pt-0 last:border-0 dark:border-slate-800">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-neutral-600 dark:text-slate-400">{children}</p>;
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      {children}
    </code>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      <code>{children}</code>
    </pre>
  );
}

function Bullets({ items }: { items: Array<[string, string]> }) {
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

function OptionsTable({ rows }: { rows: Array<[string, string, string]> }) {
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


