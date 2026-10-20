import type { ReactNode } from 'react';
import Link from 'next/link';
import { DocsLayout } from './DocsLayout';
import { CodeBlock } from './CodeBlock';
import { SessionReplayDocs } from './SessionReplayDocs';
import { sdkDocsSections } from './sdk-docs';
import { SDK_VERSIONS } from '@/lib/sdkVersions';

export const docsSections = [
  { id: 'welcome', label: 'Welcome', category: 'Getting started' },
  { id: 'quickstart', label: 'Quickstart', category: 'Getting started' },
  { id: 'methods', label: 'SDK methods', category: 'Getting started' },
  { id: 'config', label: 'Configuration', category: 'Getting started' },
  { id: 'autocapture', label: 'Autocapture', category: 'Getting started' },
  { id: 'self-hosting', label: 'Self-hosting', category: 'Deployment' },
  ...sdkDocsSections,
  { id: 'web-analytics', label: 'Web analytics', category: 'Features' },
  { id: 'session-replay', label: 'Session Replay', category: 'Features' },
  { id: 'flags', label: 'Feature flags', category: 'Features' },
  { id: 'alerts', label: 'Alerts', category: 'Features' },
  { id: 'dashboards', label: 'Dashboards', category: 'Features' },
  { id: 'public-sharing', label: 'Public sharing', category: 'Features' },
  { id: 'api-performance', label: 'API performance', category: 'Features' },
  { id: 'logs', label: 'Logs', category: 'Features' },
  { id: 'webhooks', label: 'Webhooks', category: 'Features' },
  { id: 'export', label: 'Data export', category: 'Features' },
  { id: 'events', label: 'Reserved events', category: 'Features' },
  { id: 'features', label: 'Feature guide', category: 'Features' },
  { id: 'ingestion', label: 'Server-side ingestion', category: 'Reference' },
  { id: 'cli', label: 'CLI', category: 'Reference' },
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

export function Code({ children, lang = 'ts' }: { children: string; lang?: string }) {
  return <CodeBlock codeText={children} lang={lang} />;
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
      <div className="hidden grid-cols-[minmax(120px,.7fr)_minmax(110px,.8fr)_minmax(0,1.5fr)] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 md:grid">
        <span>Option</span>
        <span>Default</span>
        <span>Description</span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-slate-800">
        {rows.map(([name, def, desc]) => (
          <div key={name} className="grid min-w-0 gap-1 px-4 py-3 md:grid-cols-[minmax(120px,.7fr)_minmax(110px,.8fr)_minmax(0,1.5fr)] md:gap-4">
            <span className="min-w-0 break-words font-mono text-xs text-neutral-900 dark:text-white">{name}</span>
            <span className="min-w-0 break-all font-mono text-xs text-neutral-500 dark:text-slate-400">{def}</span>
            <span className="min-w-0 break-words text-sm leading-5 text-neutral-600 dark:text-slate-400">{desc}</span>
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 px-3 py-1 font-mono text-xs font-semibold text-blue-600 dark:border-cyan-400/20  dark:text-cyan-300">

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
                href="/docs?page=self-hosting"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                Self-host TraceIQ
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/docs?page=quickstart"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Start integration
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/docs?page=javascript"
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
              ['Deployment', 'One-command private setup, production topology, authentication modes, backups, migrations, and safe upgrades.'],
              ['SDKs', 'JavaScript, Flutter, React Native, Node.js, Python, Swift, Kotlin, Rust, and PHP.'],
              ['Features', 'Web analytics, Web Vitals, public sharing, flags, alerts, dashboards, webhooks, and export.'],
              ['Reference', 'Direct REST ingestion over HTTP and the Model Context Protocol (MCP) server copilot.']
            ]}
          />
        </Section>
      </div>
    );
  }

  if (id === 'self-hosting') {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 sm:p-8">
          <span className="inline-flex rounded-full border border-blue-500/20 px-3 py-1 font-mono text-xs font-semibold text-blue-600 dark:border-cyan-400/20 dark:text-cyan-300">
            Open source · your infrastructure
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Self-host TraceIQ</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-slate-300 sm:text-base">
            Run a private local instance with one command, or deploy the API, PostgreSQL, Redis, and dashboard on infrastructure you control. Local authentication needs no hosted identity provider; Supabase remains available for shared installations that need accounts, teams, invitations, and 2FA.
          </p>
        </div>

        <Section id="local-install" title="One-command private installation">
          <P>Install Docker with Docker Compose, clone the repository, and start the complete local stack:</P>
          <Code lang="bash">{`docker compose -f compose.local.yml up -d --build`}</Code>
          <P>
            Open <Mono>http://localhost:3000</Mono>. Compose starts PostgreSQL 18, runs every pending migration, starts Redis and the API, then starts the dashboard. No TraceIQ account or Supabase project is required.
          </P>
          <OptionsTable rows={[
            ['Project ID', 'proj_local', 'The project created automatically for local mode.'],
            ['Write key', 'trq_local_development_only', 'Development key for browser, mobile, server, and HTTP ingestion.'],
            ['API URL', 'http://localhost:4000', 'Loopback-bound API endpoint used by the SDK and dashboard.']
          ]} />
          <Code lang="bash">{`docker compose -f compose.local.yml ps
curl http://localhost:4000/health`}</Code>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Local mode is designed for one operator on their own machine. Both HTTP services bind to loopback, and PostgreSQL and Redis are not published. Do not expose this configuration through a public reverse proxy.
          </div>
          <P>Stop the containers without deleting PostgreSQL data:</P>
          <Code lang="bash">{`docker compose -f compose.local.yml down`}</Code>
        </Section>

        <Section id="auth-modes" title="Choose an authentication mode">
          <P>Supabase is not required. Choose the path that matches who can reach the dashboard:</P>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border-2 border-blue-500 bg-blue-50/50 p-5 dark:border-cyan-500 dark:bg-cyan-500/10">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-cyan-300">No hosted auth</span>
              <h3 className="mt-2 text-base font-bold text-neutral-900 dark:text-white">Private local mode</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-slate-300">No login, Supabase project, or external identity service. Intended for one operator on localhost, a private machine, or a trusted private network.</p>
              <code className="mt-4 block rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-200">AUTH_MODE=local<br />NEXT_PUBLIC_AUTH_MODE=local</code>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900/70">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Team authentication</span>
              <h3 className="mt-2 text-base font-bold text-neutral-900 dark:text-white">Supabase mode</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-slate-300">Use when multiple people need accounts, organizations, invitations, team permissions, and two-factor authentication.</p>
              <code className="mt-4 block rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-200">AUTH_MODE=supabase<br />NEXT_PUBLIC_AUTH_MODE=supabase</code>
            </div>
          </div>
          <P>
            The API and dashboard modes must match. Supabase variables are read only in Supabase mode. Local mode contains no login boundary, so never expose its dashboard directly to the public internet; keep it loopback-bound, behind a VPN, or protected by a trusted access proxy.
          </P>
        </Section>

        <Section id="production-topology" title="Production topology">
          <P>The verified production shape keeps the public dashboard and API deployment independent:</P>
          <Code lang="text">{`Dashboard host (Vercel or Node.js)
              |
              v
API domain -> Caddy -> 127.0.0.1:4000
                         |
                    Docker Compose
                    |- NestJS API
                    |- PostgreSQL 18
                    \- Redis 7`}</Code>
          <Bullets items={[
            ['Dashboard', 'Deploy apps/dashboard as a Next.js application and set its NEXT_PUBLIC_* values at build time.'],
            ['API', 'Bind port 4000 to loopback and expose it only through a TLS reverse proxy such as Caddy.'],
            ['PostgreSQL and Redis', 'Keep both services on the private Compose network; do not publish their ports.'],
            ['CORS', 'Set CORS_ORIGINS to the exact dashboard and instrumented website origins that should reach the API.']
          ]} />
        </Section>

        <Section id="production-environment" title="Production environment">
          <P>Copy <Mono>.env.example</Mono> to <Mono>.env</Mono>, replace every placeholder, and keep the file out of Git. Begin with the values common to both authentication modes:</P>
          <Code lang="dotenv">{`DATABASE_URL=postgresql://traceiq:UNIQUE_PASSWORD@postgres:5432/traceiq?sslmode=disable
DATABASE_SSL=false
REDIS_URL=redis://redis:6379
CORS_ORIGINS=https://analytics.example.com,https://www.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WAITLIST_ONLY=false`}</Code>
          <h3 className="pt-2 text-base font-bold text-neutral-900 dark:text-white">Option A: private local authentication</h3>
          <Code lang="dotenv">{`AUTH_MODE=local
NEXT_PUBLIC_AUTH_MODE=local
LOCAL_PROJECT_WRITE_KEY=replace-with-a-random-write-key

# Required only when the API container binds beyond loopback internally.
# Keep the host port loopback-only or privately protected.
LOCAL_AUTH_ALLOW_NETWORK=true`}</Code>
          <P>No <Mono>SUPABASE_*</Mono> or <Mono>NEXT_PUBLIC_SUPABASE_*</Mono> values are needed for this path.</P>
          <h3 className="pt-2 text-base font-bold text-neutral-900 dark:text-white">Option B: Supabase authentication</h3>
          <Code lang="dotenv">{`AUTH_MODE=supabase
NEXT_PUBLIC_AUTH_MODE=supabase

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY`}</Code>
          <P>
            Inside Compose, use <Mono>postgres</Mono> rather than <Mono>localhost</Mono> as the database hostname. Only Supabase-mode installations need to configure the production dashboard callback URL in Supabase Auth. Never expose <Mono>SUPABASE_SERVICE_ROLE_KEY</Mono> to the dashboard or browser.
          </P>
        </Section>

        <Section id="first-deployment" title="First VPS deployment">
          <Code lang="bash">{`docker compose up -d postgres redis
docker compose build api
docker compose run --rm api npm run migrate --workspace=@traceiq/api
docker compose up -d api
docker compose ps
curl http://127.0.0.1:4000/health`}</Code>
          <P>Point the API DNS record to the VPS and proxy the public API hostname to the loopback API:</P>
          <Code lang="caddy">{`api.example.com {
  reverse_proxy 127.0.0.1:4000
}`}</Code>
          <P>Then build or deploy the dashboard with its production environment values and verify that its origin is included in <Mono>CORS_ORIGINS</Mono>.</P>
        </Section>

        <Section id="backups-upgrades" title="Backups, migrations, and safe upgrades">
          <P>Back up PostgreSQL before migrations or major upgrades. Store the dump outside the Compose volume and test restoration periodically.</P>
          <Code lang="bash">{`docker compose exec -T postgres pg_dump -U traceiq -d traceiq --no-owner --no-acl > traceiq-backup.sql`}</Code>
          <Code lang="bash">{`git pull --ff-only
docker compose build api
docker compose run --rm api npm run migrate --workspace=@traceiq/api
docker compose up -d api
docker compose ps
curl http://127.0.0.1:4000/health`}</Code>
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            Never use <Mono>docker compose down -v</Mono> during an upgrade. The <Mono>-v</Mono> flag removes the PostgreSQL volume and can permanently delete analytics data.
          </div>
        </Section>

        <Section id="operations-checklist" title="Operational checklist">
          <Bullets items={[
            ['Credentials', 'Use unique database passwords and rotate exposed Supabase, project, email, AI, and access-token secrets.'],
            ['Backups', 'Back up before migrations, keep copies outside the VPS, and test restoration.'],
            ['Network', 'Expose only the TLS proxy; keep API, PostgreSQL, and Redis ports private or loopback-bound.'],
            ['Monitoring', 'Watch API health, disk capacity, PostgreSQL growth, backup completion, and container restarts.'],
            ['Updates', 'Review dependency and container-image changes before deploying them.']
          ]} />
        </Section>
      </div>
    );
  }

  if (id === 'quickstart') {
    return (
      <Section id="quickstart" title="Quickstart">
        <P>
          Install the latest browser SDK (currently <Mono>v{SDK_VERSIONS.javascript}</Mono>) and initialize it with
          your project credentials from Settings.
        </P>
        <Code lang="bash">{`npm install traceiq-sdk-js@latest`}</Code>
        <Code lang="ts">{snippet}</Code>
        <P>
          That&apos;s it — events start flowing to <Mono>Events</Mono> within seconds. Grab your write key from{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/settings">
            Settings
          </a>
          .
        </P>
        <P>
          Prefer a guided setup? <Mono>npx traceiq-cli</Mono> detects your framework, installs the SDK, writes the env
          vars and confirms the first event arrives. See the{' '}
          <Link className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/docs?page=cli">
            CLI
          </Link>{' '}
          guide.
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

  if (id === 'javascript') {
    return (
      <div className="space-y-8">
        <Section id="javascript" title="JavaScript SDK">
          <P>
            The browser SDK (currently <Mono>v{SDK_VERSIONS.javascript}</Mono>) tracks events, identities, page
            views, exceptions, Web Vitals, and optional session replay. It uses the project write key intended for
            client-side ingestion.
          </P>
          <Code lang="bash">{`npm install traceiq-sdk-js@latest`}</Code>
          <Code lang="ts">{snippet}</Code>
        </Section>
        <Section id="javascript-methods" title="Core methods">
          <Code lang="ts">{`traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });
traceiq.track('checkout_started', { cartValue: 4200, currency: 'NGN' });
traceiq.page('Checkout');
traceiq.group({ organizationId: 'org_123', traits: { plan: 'growth' } });
traceiq.captureException(new Error('Payment failed'), { orderId: 'ord_1' });`}</Code>
          <P>
            See Configuration and Autocapture for initialization options, automatic error handling, page views,
            rage clicks, request timing, Web Vitals, and replay controls.
          </P>
        </Section>
      </div>
    );
  }

  if (id === 'flutter') {
    return (
      <div className="space-y-8">
        <Section id="flutter" title="Flutter SDK">
          <P>
            <Mono>traceiq_flutter</Mono> supports Android, iOS, web, macOS, Windows, and Linux with persistent
            anonymous identity, sessions, an offline queue, batching, retries, lifecycle flushing, navigation
            tracking, and chained Flutter error handlers.
          </P>
          <P>
            Version 0.1.0 is currently prepared in this repository under <Mono>packages/sdk-flutter</Mono>. Until
            the first pub.dev release, monorepo applications can use a local path dependency.
          </P>
          <Code lang="yaml">{`dependencies:
  traceiq_flutter:
    path: ../../packages/sdk-flutter`}</Code>
          <Code lang="dart">{`await TraceIQ.initialize(
  projectId: '${projectId}',
  apiKey: 'YOUR_PROJECT_WRITE_KEY',
  apiUrl: '${apiBaseUrl}',
);

await TraceIQ.identify('user_123', traits: {'plan': 'pro'});
await TraceIQ.track('checkout_started', properties: {'cart_value': 4200});
await TraceIQ.screen('Checkout');
await TraceIQ.revenue(amount: 3500, currency: 'NGN');`}</Code>
        </Section>
        <Section id="flutter-navigation" title="Navigation and errors">
          <Code lang="dart">{`MaterialApp(
  navigatorObservers: [TraceIQNavigatorObserver()],
);

try {
  await checkout();
} catch (error, stackTrace) {
  await TraceIQ.captureException(error, stackTrace);
}`}</Code>
          <P>
            Call <Mono>TraceIQ.reset()</Mono> on logout and <Mono>TraceIQ.setTrackingEnabled(false)</Mono> when
            consent is withdrawn. Disabling tracking clears the persisted event queue.
          </P>
        </Section>
      </div>
    );
  }

  if (id === 'node') {
    return (
      <div className="space-y-8">
        <Section id="node" title="Server-side SDK (Node.js)">
          <P>
            For backend events — payments, payouts, settlements, jobs — use <Mono>traceiq-node</Mono>. Server events
            are the most trustworthy source of revenue: the <Mono>amount</Mono> comes from your systems, not the
            browser. Events are queued and flushed in batches, so request handlers never block on the network.
          </P>
          <P>
            Package on npm:{' '}
            <a
              className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
              href="https://www.npmjs.com/package/traceiq-node"
              target="_blank"
              rel="noreferrer"
            >
              npm (traceiq-node)
            </a>
          </P>
          <Code lang="bash">{`npm install traceiq-node`}</Code>
          <Code lang="ts">{`import { TraceIQ } from 'traceiq-node';

const traceiq = new TraceIQ({
  projectId: '${projectId}',
  writeKey: process.env.TRACEIQ_WRITE_KEY, // keep server keys secret
  endpoint: '${apiBaseUrl}',
});

// A trustworthy revenue event, straight from your payments service:
traceiq.capture({
  event: 'payout_succeeded',
  userId: 'user_123',
  properties: { amount: 50000, currency: 'NGN', channel: 'bank_transfer' },
});

traceiq.identify({ userId: 'user_123', traits: { kyc_tier: 2, email: 'user@example.com' } });
traceiq.group({ organizationId: 'org_9', userId: 'user_123', traits: { plan: 'growth' } });

// Flush before a short-lived process or serverless function exits:
await traceiq.shutdown();`}</Code>
          <P>
            Events flush automatically by size (<Mono>flushAt</Mono>) or on a timer (<Mono>flushIntervalMs</Mono>).
            Call <Mono>shutdown()</Mono> in scripts and serverless functions so nothing is lost on exit.
          </P>
        </Section>

        <Section id="node-middleware" title="Request telemetry & API performance">
          <P>
            <Mono>traceiq.middleware()</Mono> records every request as a <Mono>$api_request</Mono> event, powering the <strong>API Performance</strong> dashboard and the <strong>Requests</strong> explorer.
          </P>
          <Code lang="ts">{`import express from 'express';
import { TraceIQ } from 'traceiq-node';

const app = express();
const traceiq = new TraceIQ({
  projectId: '${projectId}',
  writeKey: process.env.TRACEIQ_WRITE_KEY,
  endpoint: '${apiBaseUrl}',
});

// Automatic endpoint latency, status code, and error capture:
app.use(traceiq.middleware({
  service: 'billing-api',
  environment: process.env.NODE_ENV || 'production',
  resolveUserId: (req) => req.user?.id,
  ignore: (req) => req.path === '/health',
}));`}</Code>
          <P>
            Any <Mono>capture()</Mono> call made while a request is handled — like an exception or conversion — is automatically stamped with the same distributed <Mono>requestId</Mono> and <Mono>traceId</Mono>.
          </P>
        </Section>

        <Section id="node-feature-flags" title="Server-side feature flags">
          <P>
            Evaluate feature flags deterministically on your backend or worker with safe local fallbacks:
          </P>
          <Code lang="ts">{`// Check if a flag is active for a user:
const isEnabled = await traceiq.isFeatureEnabled('new-billing-flow', userId, {
  defaultValue: false,
  environment: 'production',
  properties: { plan: 'pro', country: 'NG' }
});

// Fetch configuration payload:
const payload = await traceiq.getFeatureFlagPayload('new-billing-flow', userId, {
  environment: 'production'
});`}</Code>
        </Section>

        <Section id="node-options" title="Configuration options">
          <OptionsTable
            rows={[
              ['projectId', 'required', 'Your TraceIQ project identifier.'],
              ['writeKey', 'required', 'Secret write key for authenticated backend ingestion.'],
              ['endpoint', 'http://localhost:4000', 'TraceIQ API base URL.'],
              ['flushAt', '20', 'Flush once this many events are queued.'],
              ['flushIntervalMs', '10000', 'Periodic background flush timer in milliseconds (0 disables).'],
              ['maxRetries', '3', 'Retry attempts for network dropouts with exponential backoff.'],
              ['timeoutMs', '10000', 'Per-request network timeout.'],
              ['debug', 'false', 'Enable diagnostic debug logs in stdout.'],
              ['captureConsole', 'false', 'Forward console.log/info/warn/error to TraceIQ Logs.']
            ]}
          />
        </Section>
      </div>
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
        <P>
          For opt-in iOS/Android structural session replay, see the{' '}
          <Link className="font-semibold text-blue-600 hover:underline dark:text-cyan-400" href="/docs?page=session-replay#replay-react-native">
            React Native session replay guide
          </Link>. It requires <Mono>traceiq-react-native@0.2.0</Mono> or later;
          verify that release is available before installing. No rrweb, screenshots,
          or input contents are captured by the mobile recorder.
        </P>
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
          Package links: <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href={`https://pypi.org/project/traceiq-py/${SDK_VERSIONS.python}/`} target="_blank" rel="noreferrer">PyPI</a>,{' '}
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
traceiq = "${SDK_VERSIONS.rust}"`}</Code>
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
          independently — one bad event fails only itself. This is what <Mono>traceiq-node</Mono> uses.
        </P>
      </Section>
    );
  }

  if (id === 'web-analytics') {
    return (
      <div className="space-y-8">
        <Section id="web-analytics" title="Web analytics">
          <P>
            The Web Analytics page combines acquisition, engagement, experience, and navigation data from <Mono>$page</Mono>, <Mono>$web_vital</Mono>, <Mono>$rageclick</Mono>, and related events. Use the date range and reusable filters to apply the same segment across every panel.
          </P>
          <Bullets items={[
            ['Realtime', 'Current visitors and recent activity for the selected project.'],
            ['Acquisition', 'Top paths, referrer domains, traffic channels, and UTM source, medium, and campaign values.'],
            ['Technology', 'Device type, browser, operating system, country, and active-hour breakdowns.'],
            ['Engagement', 'Visitors, page views, sessions, bounce rate, visit duration, goals, and conversion rates.'],
            ['Journeys', 'Observed page-to-page transitions reconstructed from real session sequences.'],
            ['Experience', 'Core Web Vitals distributions and frustrating pages with errors or rage clicks.']
          ]} />
        </Section>
        <Section id="web-vitals" title="Collect Web Vitals">
          <P>The JavaScript SDK collects CLS, INP, LCP, FCP, and TTFB by default and sends each measurement as a <Mono>$web_vital</Mono> event.</P>
          <Code>{`traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: 'https://api.example.com',
  autoCaptureWebVitals: true,
});`}</Code>
          <P>Set <Mono>autoCaptureWebVitals: false</Mono> when another integration owns performance collection or when your consent configuration requires it.</P>
        </Section>
        <Section id="web-filters-goals" title="Filters and goals">
          <P>
            Filters support path, referrer, browser, operating system, device type, country, and UTM dimensions with equality, exclusion, containment, and presence operators. Save a filter set when your team repeatedly inspects the same audience.
          </P>
          <P>
            Goals can match either a page path or a custom event. TraceIQ reports qualifying visitors, occurrences, and the conversion rate against visitors in the selected period.
          </P>
        </Section>
      </div>
    );
  }

  if (id === 'session-replay') {
    return <SessionReplayDocs projectId={projectId} apiBaseUrl={apiBaseUrl} />;
  }

  if (id === 'flags') {
    return (
      <Section id="flags" title="Feature flags & remote config">
        <P>
          TraceIQ Feature Flags give you deterministic rollouts, targeting segments, remote configuration,
          real-time debug testing, exposure tracking, and downstream impact analytics connected directly to your
          events, user timelines, and errors. Manage flags under{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/flags">
            Feature flags
          </a>
          .
        </P>

        <P>
          <strong>Product Philosophy:</strong> Feature flags in TraceIQ are not isolated switches. When an
          application evaluates a flag and exposes a user to a feature, TraceIQ records that exposure. You can
          then inspect the user&apos;s chronological timeline, monitor error spikes, and measure whether conversion
          improved between exposed and control users.
        </P>

        <P>
          <strong>Deterministic &amp; Sticky Rollout:</strong> Hashing uses SHA-256 over <Mono>key:distinctId</Mono> mapped into buckets 0–99. Raising a rollout from 25% → 50% guarantees that everyone already receiving the feature stays in, adding only new users.
        </P>

        <P><strong>1. JavaScript &amp; TypeScript (Browser SDK):</strong></P>
        <Code lang="ts">{`import { traceiq } from 'traceiq-sdk-js';

// Load flags once at initialization (or after identify)
await traceiq.loadFeatureFlags({ plan: 'premium', country: 'NG' });

// Check flag with deterministic sticky assignment
if (traceiq.flags.isEnabled('nuwell-new-add-meal')) {
  renderNewMealFlow(traceiq.flags.getPayload('nuwell-new-add-meal'));
}`}</Code>

        <P><strong>2. React &amp; Next.js:</strong></P>
        <Code lang="tsx">{`import { useEffect, useState } from 'react';
import { traceiq } from 'traceiq-sdk-js';

export function AddMealButton() {
  const [useNewFlow, setUseNewFlow] = useState(false);

  useEffect(() => {
    void traceiq.loadFeatureFlags().then(() => {
      setUseNewFlow(traceiq.flags.isEnabled('nuwell-new-add-meal'));
    });
  }, []);

  if (useNewFlow) {
    return <NewAddMealModal config={traceiq.flags.getPayload('nuwell-new-add-meal')} />;
  }
  return <LegacyAddMealButton />;
}`}</Code>

        <P><strong>3. Node.js (Server SDK):</strong></P>
        <Code lang="ts">{`import { TraceIQ } from 'traceiq-node';

const traceiq = new TraceIQ({
  projectId: process.env.TRACEIQ_PROJECT_ID!,
  writeKey: process.env.TRACEIQ_WRITE_KEY!
});

// Server-side evaluation with safe fallback
const isEnabled = await traceiq.isFeatureEnabled('nuwell-new-add-meal', userId, {
  defaultValue: false,
  properties: { plan: 'premium', country: 'NG' },
  environment: 'production'
});`}</Code>

        <P><strong>4. Python &amp; Other Backend Services:</strong></P>
        <Code lang="python">{`import requests

response = requests.post(
    "${apiBaseUrl}/v1/flags/evaluate",
    headers={"x-traceiq-write-key": WRITE_KEY, "Content-Type": "application/json"},
    json={
        "projectId": PROJECT_ID,
        "distinctId": user_id,
        "environment": "production",
        "properties": {"plan": "premium", "country": "NG"}
    }
)
data = response.json()
is_enabled = data.get("flags", {}).get("nuwell-new-add-meal", False)
payload = data.get("payloads", {}).get("nuwell-new-add-meal")`}</Code>

        <P><strong>5. HTTP REST API:</strong></P>
        <Code lang="bash">{`curl -X POST ${apiBaseUrl}/v1/flags/evaluate \\
  -H 'Content-Type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY' \\
  -d '{
    "projectId": "${projectId}",
    "distinctId": "emmanuel",
    "environment": "production",
    "properties": { "plan": "premium", "country": "NG" }
  }'`}</Code>

        <P>Response:</P>
        <Code lang="json">{`{
  "flags": { "nuwell-new-add-meal": true },
  "payloads": { "nuwell-new-add-meal": { "dailyScanLimit": 5, "showVoiceInput": true } },
  "details": { "nuwell-new-add-meal": { "enabled": true, "reason": "matched_targeting_group_1", "revision": 3 } },
  "environment": "production"
}`}</Code>

        <P><strong>Targeting Operators:</strong></P>
        <Bullets
          items={[
            ['equals / does not equal', 'Exact matching for strings, numbers, or booleans.'],
            ['contains / does not contain', 'Case-insensitive substring match (e.g. email contains "@traceiq.run").'],
            ['greater than / less than', 'Numeric boundary comparisons (e.g. scanCount >= 5).'],
            ['exists / does not exist', 'Tests whether a property trait is present on the user identity.'],
            ['is one of', 'Matches comma-separated values (e.g. plan in "pro, enterprise, beta").'],
            ['Targeting Groups (OR)', 'Create multiple groups where any matching group qualifies the user. Rules within a group are combined with AND.']
          ]}
        />

        <P><strong>Safe Kill Switch:</strong></P>
        <P>
          Disabling a flag instantly returns fallback/off values on future evaluations across all SDKs.
          Targeting rules, rollout percentage, remote configuration JSON, and historical telemetry are strictly
          preserved.
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
        <P>
          Alerts are included with TraceIQ Cloud Pro. Cloud Free keeps existing alert definitions visible but pauses evaluation and delivery; upgrading resumes normal use. Self-hosted installations do not require TraceIQ billing and continue to use their configured email and webhook infrastructure.
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

  if (id === 'cli') {
    return (
      <Section id="cli" title="CLI">
        <P>
          <Mono>traceiq-cli</Mono> sets up TraceIQ in your app and lets you work with your projects from the terminal:
          switch projects, write env files, and read logs, events and errors. Run it with <Mono>npx</Mono>, or install it
          globally to get the shorter <Mono>traceiq</Mono> command.
        </P>
        <Code lang="bash">{`npx traceiq-cli            # setup wizard
npx traceiq-cli help       # every command

npm install -g traceiq-cli
traceiq help logs          # flags for one command`}</Code>

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Setup wizard</h3>
        <P>
          With no command, the CLI detects your framework (Next.js, Vite + React, Node), installs the SDK, writes your
          project ID and write key to the env file, and waits until the first real event reaches TraceIQ.
        </P>
        <Bullets
          items={[
            ['traceiq', 'Install and verify. Flags: --project-id, --write-key, --api-url, --dry-run, --skip-verify.'],
            ['traceiq audit', 'Check the instrumentation already in this project (alias: doctor).'],
            ['traceiq verify', 'Wait for a live event using the credentials in your .env file.']
          ]}
        />

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Log in</h3>
        <P>
          Every other command uses a personal access token. Create one in{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/settings">
            Settings
          </a>{' '}
          under <Mono>Personal access tokens</Mono> with <Mono>projects:read</Mono>, <Mono>analytics:read</Mono> and{' '}
          <Mono>errors:read</Mono>, then log in. The token is saved to <Mono>~/.traceiq/config.json</Mono>, readable only
          by you.
        </P>
        <Code lang="bash">{`traceiq login                       # prompts for the token (input hidden)
traceiq login --token tiq_pat_...   # non-interactive
traceiq login --api-url ${apiBaseUrl}   # a self-hosted or local API
traceiq whoami
traceiq logout`}</Code>
        <P>
          In CI, set <Mono>TRACEIQ_TOKEN</Mono> instead of logging in. <Mono>logout</Mono> only forgets the token
          locally; revoke it in Settings to disable it.
        </P>

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Projects and env files</h3>
        <Code lang="bash">{`traceiq projects list
traceiq projects use              # pick from a list
traceiq projects use my-app       # by id, slug or name

traceiq env pull                  # writes .env.local (or your existing .env file)
traceiq env pull --print          # print instead of writing
traceiq env pull --write-key trq_...`}</Code>
        <P>
          Logs, events, errors, status and <Mono>env pull</Mono> use the active project; pass{' '}
          <Mono>--project &lt;id&gt;</Mono> to use another one for a single run. <Mono>env pull</Mono> writes{' '}
          <Mono>TRACEIQ_PROJECT_ID</Mono>, <Mono>TRACEIQ_API_URL</Mono> and <Mono>TRACEIQ_WRITE_KEY</Mono> with the
          prefix your framework needs (<Mono>NEXT_PUBLIC_</Mono>, <Mono>VITE_</Mono>, or none for Node) and keeps the
          rest of the file. Write keys are stored hashed, so the CLI keeps the key already in your env file for that
          project, or uses <Mono>--write-key</Mono>.
        </P>

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Logs, events and errors</h3>
        <Code lang="bash">{`traceiq logs                              # last hour, oldest first
traceiq logs --level error --since 24h
traceiq logs -s checkout --follow         # stream new logs until Ctrl+C
traceiq logs --trace 4bf92f35... --json   # one JSON object per line

traceiq events --follow
traceiq events --name signup_completed -n 50

traceiq errors --days 30`}</Code>
        <OptionsTable
          rows={[
            ['-l, --level', 'all', 'debug, info, warn or error.'],
            ['-s, --search', '—', 'Matches message, route, service, trace or request ID, and user ID.'],
            ['--source', 'all', 'api, sdk, ai, webhook, job, …'],
            ['--status', 'all', 'success, warning or error (comma-separated for several).'],
            ['--trace', '—', 'Only logs for one trace.'],
            ['--since', '1h', 'A window such as 15m, 2h, 7d, or an ISO date.'],
            ['-n, --limit', '50', 'How many to show first (max 200; events max 100).'],
            ['-f, --follow', 'off', 'Keep polling for new entries. --interval sets the seconds between polls (default 2).'],
            ['--json', 'off', 'Newline-delimited JSON, for piping into jq or a file.']
          ]}
        />

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Status and the dashboard</h3>
        <Code lang="bash">{`traceiq status             # API health, last event, last log, event counts
traceiq open logs          # also: events, errors, users, web, api, flags, replays, alerts, settings
traceiq open logs --print  # print the URL instead of opening a browser`}</Code>
        <P>
          <Mono>status</Mono> exits with code 1 when the API can&apos;t be reached, so it also works as a CI check.
        </P>

        <h3 className="pt-2 text-base font-semibold text-neutral-900 dark:text-white">Configuration</h3>
        <OptionsTable
          rows={[
            ['--api-url / TRACEIQ_API_URL', "'https://api.traceiq.run'", 'API to talk to. login --api-url saves it.'],
            ['--token / TRACEIQ_TOKEN', 'saved by login', 'Personal access token (tiq_pat_...).'],
            ['-p, --project', 'saved by projects use', 'Project for this run.'],
            ['--dashboard-url / TRACEIQ_DASHBOARD_URL', 'from the API URL', 'Where open sends you. A localhost API maps to http://localhost:3000.'],
            ['TRACEIQ_CONFIG_DIR', '~/.traceiq', 'Where the token and active project are stored.']
          ]}
        />
        <P>
          Flags win over environment variables, which win over the saved config. Creating, renaming or deleting
          projects and showing or rotating write keys need a signed-in dashboard session, so they stay in Settings;
          the CLI points you there if you try them.
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

  if (id === 'public-sharing') {
    return (
      <Section id="public-sharing" title="Permission-scoped public sharing">
        <P>
          Share a saved dashboard without giving the viewer an account or access to the rest of the workspace. Public links use opaque tokens and expose only the permissions selected when the link is created.
        </P>
        <OptionsTable rows={[
          ['summary', 'Optional', 'Headline totals and the saved dashboard summary.'],
          ['chart', 'Optional', 'Rendered chart data for the shared dashboard.'],
          ['definition', 'Optional', 'Saved dashboard metadata and metric definitions.']
        ]} />
        <Bullets items={[
          ['Least privilege', 'Select only the information the recipient needs; permissions are not automatically expanded.'],
          ['Revocation', 'Disable or delete the share link when access is no longer required.'],
          ['Token handling', 'Treat the URL as a secret: anyone holding an active link can view its permitted content.'],
          ['No workspace access', 'A public link does not grant project, event, user, settings, or team access.']
        ]} />
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
        <Code lang="ts">{`import { TraceIQ } from 'traceiq-node';

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
          <strong>Browser</strong> — opt in and the SDK wraps <Mono>fetch</Mono> and <Mono>XMLHttpRequest</Mono>{' '}
          (so axios and other XHR clients are included) to time each call. Its own calls to TraceIQ are skipped:
        </P>
        <Code lang="ts">{`traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
  autoCaptureRequests: true, // capture outgoing fetch() and XHR as $api_request
  // Or narrow it to your backend:
  // autoCaptureRequests: { include: ['https://api.example.com'], exclude: [/\/health$/] },
});`}</Code>
        <P>
          Only API calls are recorded. Page loads are skipped on both sides: Next.js navigations and prefetches (RSC
          requests), dev-server/HMR traffic, static assets, and any response that is an HTML page. Pass{' '}
          <Mono>includePageRequests: true</Mono> (browser option object, or the middleware option) to record them too.
        </P>
        <P>
          <strong>Server vs browser timings.</strong> The middleware measures how long your handler took, which is the
          number your host (Railway, Render, Fly…) reports. A browser timing is the full round trip from the
          visitor&apos;s device: DNS, TLS, the network distance to your host&apos;s region, and the server time. So a
          5 ms endpoint can easily show 300–700 ms from a browser on another continent. API performance shows server
          timings by default whenever your backend sends any; switch to <em>Browser</em> to see what users actually
          wait for. The Requests explorer has the same filter.
        </P>
        <P>
          WebSocket messages (multiplayer, live updates) aren&apos;t HTTP requests, so they never show up here. Record
          them with <Mono>traceiq.track()</Mono> or <Mono>traceiq.log()</Mono>; both appear in Logs.
        </P>
        <P>
          Anything else (gRPC, background jobs) can report directly by sending an <Mono>$api_request</Mono> event
          with <Mono>method</Mono>, <Mono>path</Mono>, <Mono>status</Mono>, and <Mono>durationMs</Mono> properties.
        </P>
      </Section>
    );
  }

  if (id === 'logs') {
    return (
      <Section id="logs" title="Logs">
        <P>
          Send structured log lines from your app to the{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/logs">
            Logs
          </a>{' '}
          page. Logs show what your app sends with <Mono>traceiq.log()</Mono>, every custom event you{' '}
          <Mono>track()</Mono> (as <em>User actions</em>: the event name plus its first few properties, linked to the
          session, user and request), exceptions, and a warning whenever TraceIQ rejects one of your SDK deliveries
          (for example an invalid write key), so you know data isn&apos;t arriving.
        </P>
        <P>
          Already logging with <Mono>console.log</Mono>? Turn on <Mono>autoCaptureConsole: true</Mono> in the browser
          SDK (or <Mono>captureConsole: true</Mono> in the Node SDK) and console output is forwarded to Logs as well;
          the console still prints as usual.
        </P>
        <P>
          <strong>Browser / games</strong>: entries are buffered, sent in batches, and tagged with the current session
          (so they link to its replay) and user:
        </P>
        <Code lang="ts">{`traceiq.log('info', 'Level 3 started', { level: 3 });
traceiq.log('error', 'Level 3 assets failed to load', {
  service: 'game-client',   // optional, defaults to "web-client"
  error,                    // optional Error: its stack is attached
  level: 3,                 // anything else becomes searchable metadata
});`}</Code>
        <P>
          <strong>Node</strong>: inside <Mono>traceiq.middleware()</Mono> each log carries the current request&apos;s
          request and trace IDs, so it appears on that request in the Requests explorer:
        </P>
        <Code lang="ts">{`const traceiq = new TraceIQ({ projectId: '${projectId}', writeKey, serviceName: 'game-server' });

traceiq.log('warn', 'Matchmaking queue is backing up', { queued: 412 });
await traceiq.shutdown(); // flushes events and logs`}</Code>
        <OptionsTable rows={[
          ['level', 'Required', 'debug, info, warn, error or fatal.'],
          ['message', 'Required', 'Up to 4,000 characters.'],
          ['service', 'Optional', 'Groups and filters logs by component.'],
          ['error', 'Optional', 'An Error whose name, message and stack are attached.'],
          ['…other keys', 'Optional', 'Stored as metadata (up to 16 KB); keys like password or token are redacted.']
        ]} />
        <P>
          Any other runtime can post directly to <Mono>POST {apiBaseUrl}/v1/logs/batch</Mono> with the{' '}
          <Mono>x-traceiq-write-key</Mono> header and a body of <Mono>{'{ projectId, logs: [{ level, message, … }] }'}</Mono>{' '}
          (up to 100 entries).
        </P>
        <P>
          To read logs from the terminal, use the{' '}
          <Link className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/docs?page=cli">
            CLI
          </Link>
          :
        </P>
        <Code lang="bash">{`traceiq logs --level error --since 24h
traceiq logs --search checkout --follow`}</Code>
      </Section>
    );
  }

  if (id === 'webhooks') {
    return (
      <Section id="webhooks" title="Webhooks">
        <P>
          TraceIQ Webhooks forward events in real time to external HTTP endpoints as JSON payloads.
          Manage endpoints, monitor deliveries, inspect failure logs, and test endpoints from the{' '}
          <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/webhooks">
            Webhooks
          </a>{' '}
          page.
        </P>

        <P><strong>Request Headers</strong></P>
        <P>Every webhook POST request includes standard metadata headers and an HMAC-SHA256 signature:</P>
        <Bullets
          items={[
            ['X-TraceIQ-Event', 'The name of the event being delivered (e.g. order_completed, $identify).'],
            ['X-TraceIQ-Delivery-ID', 'Unique UUID for this specific delivery attempt.'],
            ['X-TraceIQ-Timestamp', 'Unix timestamp in seconds when the webhook was signed.'],
            ['X-TraceIQ-Signature', 'HMAC-SHA256 signature in format "sha256=<hex_digest>" computed over `${timestamp}.${rawBody}`.'],
            ['User-Agent', 'TraceIQ-Webhooks/2.0']
          ]}
        />

        <P><strong>Verifying Signatures</strong></P>
        <P>
          To prevent replay attacks and verify authenticity, always verify the signature against the raw request body and timestamp before processing.
        </P>

        <P><strong>Node.js (Express / Fastify):</strong></P>
        <Code lang="ts">{`import crypto from 'crypto';

export function verifyWebhook(rawBody: string, signatureHeader: string, timestampHeader: string, secret: string) {
  const [scheme, signature] = signatureHeader.split('=');
  if (scheme !== 'sha256' || !signature) return false;

  // Prevent replay attacks (tolerance: 5 minutes)
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return false;
  }

  const payloadToSign = \`\${timestampHeader}.\${rawBody}\`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}`}</Code>

        <P><strong>Python (FastAPI / Flask):</strong></P>
        <Code lang="python">{`import hmac
import hashlib
import time

def verify_webhook(raw_body: bytes, signature_header: str, timestamp_header: str, secret: str) -> bool:
    try:
        scheme, signature = signature_header.split('=', 1)
        if scheme != 'sha256':
            return False
        
        # Check timestamp freshness (5 minutes tolerance)
        ts = int(timestamp_header)
        if abs(time.time() - ts) > 300:
            return False
            
        payload = f"{timestamp_header}.".encode('utf-8') + raw_body
        expected = hmac.new(secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False`}</Code>

        <P><strong>Retry Policy</strong></P>
        <P>
          Deliveries timeout after 10 seconds. On transient failures (HTTP 408, 425, 429, 500, 502, 503, 504, or connection timeouts), TraceIQ automatically retries up to 5 times with exponential backoff:
        </P>
        <Bullets
          items={[
            ['Attempt 1 → 2', '~60 seconds'],
            ['Attempt 2 → 3', '~5 minutes'],
            ['Attempt 3 → 4', '~30 minutes'],
            ['Attempt 4 → 5', '~2 hours']
          ]}
        />
        <P>
          Client errors (400, 401, 403, 404, 422) are treated as permanent failures and will not be retried automatically. You can always manually retry any delivery from the webhook detail drawer.
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
            ['Insights', 'Event counts, unique users, sums, averages, and conversion funnels over customizable date ranges.'],
            ['Funnels', 'Ordered-event conversion with per-step drop-off; click a step to see who reached it or dropped off.'],
            ['Retention', 'Weekly cohort × week-offset grid — of the people who did something in a week, how many came back in later weeks. The core "is it sticky?" view.'],
            ['Cohorts', 'Saved groups of users defined by the events they did (or didn’t) do, reusable as filters across the product.'],
            ['Users', 'Identified people and their chronological timelines, device, and location.'],
            ['Web analytics', 'Visitors, sessions, bounce rate, top paths, sources, devices, geography, active hours, and frustrating pages.'],
            ['Session Replay', 'Consent-aware, sanitized rrweb session reconstruction with project sampling, separate retention, and isolated playback.'],
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
      title: 'Self-host TraceIQ',
      desc: 'One-command private setup plus production VPS, authentication, backup, and upgrade guidance.',
      href: `${basePath}?page=self-hosting`
    },
    {
      title: 'Install TraceIQ JS',
      desc: 'npm install traceiq-sdk-js and start capturing events in minutes.',
      href: `${basePath}?page=javascript`
    },
    {
      title: 'Browser Autocapture',
      desc: 'Automatic click tracking, rage clicks, and page view sessions.',
      href: `${basePath}?page=autocapture`
    },
    {
      title: 'Session Replay',
      desc: 'Consent-aware rrweb capture, privacy controls, retention, and playback.',
      href: `${basePath}?page=session-replay`
    },
    {
      title: 'All SDK Guides',
      desc: 'Flutter, React Native, Node.js, Python, Swift, Kotlin, Rust, and PHP integrations.',
      href: `${basePath}?page=flutter`
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
