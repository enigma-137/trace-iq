import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicPage } from '@/components/PublicSiteChrome';

export const metadata: Metadata = {
  title: 'Privacy Policy | TraceIQ',
  description: 'Understand how TraceIQ collects, processes, and protects telemetry data, session replays, and account information.'
};

const sections = [
  { id: 'introduction', title: '1. Introduction & Operating Models' },
  { id: 'data-collection', title: '2. Information Collected & Telemetry' },
  { id: 'storage-cookies', title: '3. Browser Storage & No Third-Party Cookies' },
  { id: 'session-replay', title: '4. Session Replay & Privacy Masking' },
  { id: 'ai-mcp', title: '5. AI Copilots & Model Context Protocol (MCP)' },
  { id: 'data-usage', title: '6. How We Use and Process Information' },
  { id: 'retention-deletion', title: '7. Data Retention, Deletion & Export' },
  { id: 'operator-obligations', title: '8. Operator Responsibilities & Compliance (GDPR/CCPA)' },
  { id: 'security', title: '9. Security & Infrastructure Safeguards' },
  { id: 'subprocessors', title: '10. Third-Party Subprocessors' },
  { id: 'contact', title: '11. Contact & Data Subject Inquiries' }
];

export default function PrivacyPage() {
  return (
    <PublicPage>
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-400 transition hover:text-white"
        >
          ← Back to home
        </Link>

        {/* Header */}
        <header className="mt-8 border-b border-white/10 pb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Legal &amp; Trust Center
          </div>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-white">
            Privacy Policy
          </h1>

          <p className="mt-5 text-lg leading-8 text-zinc-400 max-w-3xl">
            This Privacy Policy explains how TraceIQ (&ldquo;TraceIQ&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) handles information collected via our analytics platform, developer SDKs, APIs, documentation, and website.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-6 font-mono text-xs text-zinc-500">
            <span>Last Updated: March 2025</span>
            <span>·</span>
            <span>Effective Date: Immediate</span>
            <span>·</span>
            <span>Version 2.2</span>
          </div>
        </header>

        {/* Highlight Summary Cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-400">
              No 3rd-Party Trackers
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              TraceIQ client SDKs never drop third-party ad cookies, sell consumer behavioral graphs, or broker visitor identifiers.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Data Sovereignty
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Deploy TraceIQ on your own PostgreSQL infrastructure or utilize our isolated multi-tenant cloud with full data exportability.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-400">
              Privacy by Default
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Session replay features automatic input masking, text obfuscation, and configurable PII filtering before events leave the client.
            </p>
          </div>
        </div>

        {/* Content Layout with Table of Contents */}
        <div className="mt-14 grid gap-12 lg:grid-cols-[260px_1fr]">
          {/* Sticky Table of Contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-white/10 bg-white/[0.015] p-5">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-400">
                On This Page
              </h2>
              <nav className="mt-4 space-y-2 text-xs">
                {sections.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block py-1 text-zinc-400 transition hover:text-white"
                  >
                    {item.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Policy Body */}
          <article className="blog-prose space-y-12">
            <section id="introduction">
              <h2>1. Introduction &amp; Operating Models</h2>
              <p>
                TraceIQ is a developer-first behavior intelligence and observability platform engineered for web, mobile, and backend systems. Depending on how you interact with TraceIQ, two primary operating architectures apply:
              </p>
              <ul>
                <li>
                  <strong>TraceIQ Cloud (Hosted SaaS):</strong> When you register for our hosted dashboard, telemetry ingested from your projects is stored in dedicated, access-controlled databases maintained by TraceIQ and our vetted infrastructure partners.
                </li>
                <li>
                  <strong>TraceIQ Self-Hosted (Community &amp; Enterprise):</strong> When you run the open-source TraceIQ containers on your own infrastructure (Docker, Kubernetes, PostgreSQL), all event ingestion, session recordings, and database tables reside exclusively in your environment. TraceIQ does not collect phone-home telemetry or exfiltrate your analytics data.
                </li>
              </ul>
            </section>

            <section id="data-collection">
              <h2>2. Information Collected &amp; Telemetry</h2>
              <p>
                When you instrument your applications using TraceIQ SDKs (JavaScript, React Native, Node.js, Python, or Go), the following categories of telemetry data may be collected:
              </p>
              <ul>
                <li>
                  <strong>Behavioral Events:</strong> Page views, route transitions, custom interaction events, button clicks, funnels, and feature flag evaluation results.
                </li>
                <li>
                  <strong>Technical &amp; Device Context:</strong> User agent, browser vendor, operating system, screen resolution, viewport dimensions, language preferences, and approximate network connection type.
                </li>
                <li>
                  <strong>Network &amp; Geolocation:</strong> Client IP address (which can be truncated or hashed at ingest) used to derive approximate country/region coordinates.
                </li>
                <li>
                  <strong>Diagnostic Telemetry:</strong> JavaScript exceptions, stack traces, console breadcrumbs, API roundtrip latencies, and HTTP status codes.
                </li>
                <li>
                  <strong>Identified User Profiles:</strong> Optional user IDs, organization IDs, and custom traits passed explicitly by your application via the <code>identify()</code> method (such as plan level, workspace ID, or role).
                </li>
              </ul>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                <strong>Important Notice for Developers:</strong> Never transmit unmasked passwords, secrets, financial credentials, credit card numbers, or government identifiers to TraceIQ event payloads.
              </div>
            </section>

            <section id="storage-cookies">
              <h2>3. Browser Storage &amp; No Third-Party Cookies</h2>
              <p>
                The standard TraceIQ client SDK does not use third-party tracking cookies or participate in cross-site identity graphs.
              </p>
              <ul>
                <li>
                  <code>localStorage</code>: Used to retain a pseudorandom first-party anonymous device identifier (<code>traceiq.anonymousId</code>) to connect sessions over time on the same domain.
                </li>
                <li>
                  <code>sessionStorage</code>: Used to retain an ephemeral session identifier (<code>traceiq.sessionId</code>) that expires automatically when the user closes their browser tab.
                </li>
                <li>
                  <code>localStorage</code>: Events whose delivery is delayed (the device is offline, or the first attempt failed) are kept under <code>traceiq.pendingEvents.&lt;projectId&gt;</code>, including their properties, until they are delivered or for at most 24 hours, so they are not lost if the page closes. Site owners can disable this with <code>persistUndeliveredEvents: false</code>.
                </li>
              </ul>
              <p>
                Because local and session storage are restricted to the origin origin domain, visitors cannot be tracked across unrelated websites.
              </p>
            </section>

            <section id="session-replay">
              <h2>4. Session Replay &amp; Privacy Masking</h2>
              <p>
                If you enable TraceIQ Session Replay, the SDK records a privacy-sanitized stream of DOM mutations to reconstruct user workflows and diagnose UX friction.
              </p>
              <ul>
                <li>
                  <strong>Automatic Input Redaction:</strong> All password fields, credit card inputs, and sensitive form elements are masked by default on the client before serialization.
                </li>
                <li>
                  <strong>Class-Based Masking:</strong> Any DOM element marked with the CSS class <code>.tiq-mask</code> or attribute <code>data-tiq-mask</code> will replace text content with placeholder blocks.
                </li>
                <li>
                  <strong>Exclusion Rules:</strong> Elements annotated with <code>.tiq-ignore</code> or <code>data-tiq-ignore</code> are completely omitted from the recorded DOM tree.
                </li>
              </ul>
            </section>

            <section id="ai-mcp">
              <h2>5. AI Copilots, Cencori &amp; Model Context Protocol (MCP)</h2>
              <p>
                TraceIQ incorporates AI-driven insights and natural language query assistance powered by services like Cencori, and provides an optional Model Context Protocol (MCP) server allowing developer tools (such as Claude Code, Cursor, or custom agents) to inspect telemetry, investigate error spikes, and summarize funnels.
              </p>
              <ul>
                <li>
                  <strong>Permission Scoping:</strong> Every AI interaction requires a cryptographically generated Personal Access Token (PAT) with explicit read or write scopes.
                </li>
                <li>
                  <strong>No Training on Customer Data:</strong> Neither TraceIQ nor our AI partners (including Cencori) use your raw customer telemetry, logs, or user records to train public machine learning or foundation models without explicit consent.
                </li>
              </ul>
            </section>

            <section id="data-usage">
              <h2>6. How We Use and Process Information</h2>
              <p>
                We use collected information solely to provide and operate the TraceIQ platform, including:
              </p>
              <ul>
                <li>Generating aggregation charts, retention matrices, funnel metrics, and latency graphs.</li>
                <li>Triggering anomaly alerts, error notifications, and webhook webhooks to your designated endpoints.</li>
                <li>Authenticating organization members, managing subscriptions, and preventing abusive automated traffic.</li>
                <li>Providing customer support and debugging service degradation.</li>
              </ul>
            </section>

            <section id="retention-deletion">
              <h2>7. Data Retention, Deletion &amp; Export</h2>
              <p>
                You retain complete ownership of your project data. In TraceIQ Cloud:
              </p>
              <ul>
                <li>
                  <strong>Configurable Retention:</strong> Telemetry, error logs, and session replays are retained in accordance with your organization&apos;s chosen retention window (default 30 to 90 days on standard plans).
                </li>
                <li>
                  <strong>Hard Deletion:</strong> When an organization or project is deleted, all associated event records, session replays, and API tokens are permanently purged from primary databases within 30 days.
                </li>
                <li>
                  <strong>Data Portability:</strong> You can export full event datasets at any time via our REST APIs or direct PostgreSQL replication connections.
                </li>
              </ul>
            </section>

            <section id="operator-obligations">
              <h2>8. Operator Responsibilities &amp; Compliance (GDPR/CCPA)</h2>
              <p>
                Under data protection laws (such as the EU General Data Protection Regulation and the California Consumer Privacy Act), the deploying organization is the <strong>Data Controller</strong> and TraceIQ acts as the <strong>Data Processor</strong>.
              </p>
              <p>
                Organizations deploying TraceIQ are responsible for:
              </p>
              <ul>
                <li>Providing proper notice to end-users regarding analytics and telemetry collection.</li>
                <li>Obtaining valid consent or establishing a legitimate legal basis in jurisdictions where required (e.g. EU/UK ePrivacy regulations).</li>
                <li>Honoring end-user Data Subject Access Requests (DSARs), including right-to-be-forgotten and data rectification requests.</li>
                <li>Configuring client SDK masking rules to prevent unintentional collection of sensitive personal data.</li>
              </ul>
            </section>

            <section id="security">
              <h2>9. Security &amp; Infrastructure Safeguards</h2>
              <p>
                We employ industry-standard organizational and technical safeguards:
              </p>
              <ul>
                <li><strong>Encryption in Transit:</strong> All API ingestion endpoints and dashboard traffic enforce TLS 1.3 / HTTPS encryption.</li>
                <li><strong>Encryption at Rest:</strong> Database volumes and backups are encrypted using AES-256.</li>
                <li><strong>Multi-Factor Authentication (MFA):</strong> TOTP-based two-factor authentication is available for all user accounts.</li>
                <li><strong>Role-Based Access Control (RBAC):</strong> Granular permissions (Owner, Admin, Member, Read-Only) across workspaces.</li>
              </ul>
            </section>

            <section id="subprocessors">
              <h2>10. Third-Party Subprocessors</h2>
              <p>
                TraceIQ Cloud engages trusted third-party subprocessors to deliver core infrastructure:
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Subprocessor</th>
                    <th>Purpose</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Supabase Inc.</td>
                    <td>Authentication &amp; Relational Database Storage</td>
                    <td>United States / EU</td>
                  </tr>
                  <tr>
                    <td>Bachs</td>
                    <td>Payment Processing &amp; Billing Management</td>
                    <td>Nigeria / Global</td>
                  </tr>
                  <tr>
                    <td>Cencori</td>
                    <td>AI Services &amp; Natural Language Analytics Processing</td>
                    <td>Nigeria / Global</td>
                  </tr>
                  <tr>
                    <td>Resend, Inc.</td>
                    <td>Transactional Emails &amp; Notification Delivery</td>
                    <td>United States / Global</td>
                  </tr>
                  <tr>
                    <td>Vercel Inc.</td>
                    <td>Edge Delivery &amp; Web Dashboard Hosting</td>
                    <td>Global Edge Network</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section id="contact">
              <h2>11. Contact &amp; Data Subject Inquiries</h2>
              <p>
                For questions regarding this Privacy Policy, Data Processing Agreements (DPAs), or privacy practices, please contact us:
              </p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:traceiq.run@gmail.com">traceiq.run@gmail.com</a></li>
                <li><strong>Security Inquiries:</strong> <a href="mailto:traceiq.run@gmail.com">traceiq.run@gmail.com</a></li>
              </ul>
            </section>
          </article>
        </div>
      </main>
    </PublicPage>
  );
}
