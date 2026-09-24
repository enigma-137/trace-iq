import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicPage } from '@/components/PublicSiteChrome';

export const metadata: Metadata = {
  title: 'Terms and Conditions | TraceIQ',
  description: 'Terms of Service and legal agreements governing the use of TraceIQ Cloud, developer SDKs, APIs, and self-hosted distributions.'
};

const sections = [
  { id: 'acceptance', title: '1. Acceptance of Terms' },
  { id: 'services-editions', title: '2. Services & Deployment Editions' },
  { id: 'accounts-security', title: '3. Accounts, Access & Security' },
  { id: 'acceptable-use', title: '4. Acceptable Use & Telemetry Guidelines' },
  { id: 'api-tokens-sdk', title: '5. API Keys, Tokens & SDK Usage' },
  { id: 'subscriptions-billing', title: '6. Subscriptions, Fees & Billing' },
  { id: 'intellectual-property', title: '7. Intellectual Property & Licenses' },
  { id: 'ai-mcp-terms', title: '8. AI Copilot & MCP Server Usage' },
  { id: 'service-availability', title: '9. Service Availability & Maintenance' },
  { id: 'disclaimer-warranties', title: '10. Disclaimer of Warranties' },
  { id: 'limitation-liability', title: '11. Limitation of Liability' },
  { id: 'indemnification', title: '12. Indemnification' },
  { id: 'termination', title: '13. Term, Suspension & Termination' },
  { id: 'modifications', title: '14. Modifications to Terms' },
  { id: 'governing-law', title: '15. Governing Law & Dispute Resolution' },
  { id: 'contact', title: '16. Contact Information' }
];

export default function TermsPage() {
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
            Legal Agreement
          </div>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-white">
            Terms &amp; Conditions
          </h1>

          <p className="mt-5 text-lg leading-8 text-zinc-400 max-w-3xl">
            These Terms and Conditions (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you or your entity (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;) and TraceIQ (&ldquo;TraceIQ&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;), governing your use of our website, hosted services, developer APIs, SDKs, and software distributions.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-6 font-mono text-xs text-zinc-500">
            <span>Last Updated: March 2025</span>
            <span>·</span>
            <span>Effective Date: Immediate</span>
            <span>·</span>
            <span>Version 2.0</span>
          </div>
        </header>

        {/* Highlight Summary Cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-400">
              Developer-First
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Built for engineering teams. Fair API usage, clear rate limit policies, and transparent programmatic access.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Customer Data Ownership
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              You own your telemetry, user events, session replays, and analytical artifacts at all times. We never monetize your dataset.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-400">
              Clear Responsibilities
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Operators control what data is sent to ingestion endpoints and maintain end-user privacy consent obligations.
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

          {/* Terms Body */}
          <article className="blog-prose space-y-12">
            <section id="acceptance">
              <h2>1. Acceptance of Terms</h2>
              <p>
                By creating an account, deploying TraceIQ software, installing our SDKs, or accessing our APIs and hosted dashboard, you represent that you have read, understood, and agreed to be bound by these Terms.
              </p>
              <p>
                If you are entering into these Terms on behalf of a company, organization, or other legal entity, you represent that you have the authority to bind such entity to these Terms.
              </p>
            </section>

            <section id="services-editions">
              <h2>2. Services &amp; Deployment Editions</h2>
              <p>
                TraceIQ provides telemetry, session replay, API performance tracing, feature flags, and cohort analytics. TraceIQ is available via two models:
              </p>
              <ul>
                <li>
                  <strong>TraceIQ Cloud (SaaS):</strong> A managed hosted offering providing multi-tenant event ingestion, query processing, automated backups, and managed dashboard access.
                </li>
                <li>
                  <strong>TraceIQ Self-Hosted (Community &amp; Enterprise):</strong> Downloadable containerized distributions deployed on your own infrastructure. Self-hosted instances operate under applicable open-source or commercial source licenses.
                </li>
              </ul>
            </section>

            <section id="accounts-security">
              <h2>3. Accounts, Access &amp; Security</h2>
              <p>
                To use TraceIQ Cloud, you must create an account with accurate and complete information. You are solely responsible for:
              </p>
              <ul>
                <li>Maintaining the confidentiality of your login credentials and personal access tokens.</li>
                <li>All activities that occur under your organization workspace, projects, or API keys.</li>
                <li>Promptly notifying TraceIQ at <a href="mailto:traceiq.run@gmail.com">traceiq.run@gmail.com</a> if you discover unauthorized access or credentials compromise.</li>
              </ul>
            </section>

            <section id="acceptable-use">
              <h2>4. Acceptable Use &amp; Telemetry Guidelines</h2>
              <p>
                You agree not to use TraceIQ to collect, transmit, store, or process any telemetry or content that:
              </p>
              <ul>
                <li>Contains unmasked sensitive personal data, unredacted payment card details (PCI-DSS), government identifiers, or unprotected health information (HIPAA) without necessary agreements.</li>
                <li>Violates applicable privacy laws, electronic communications directives, or consumer protection statutes.</li>
                <li>Attempts to bypass, probe, scan, or breach the security or authentication measures of the service.</li>
                <li>Sends deceptive, fraudulent, or malicious payloads designed to crash or degrade our ingestion pipeline or databases.</li>
                <li>Imposes an unreasonable or disproportionately large load on our infrastructure exceeding documented project quotas.</li>
              </ul>
            </section>

            <section id="api-tokens-sdk">
              <h2>5. API Keys, Tokens &amp; SDK Usage</h2>
              <p>
                TraceIQ provides Write Keys for ingestion and Personal Access Tokens (PATs) for programmatic API access and MCP tooling.
              </p>
              <ul>
                <li>
                  <strong>Write Keys:</strong> Designed for client-side inclusion (e.g. browser SDKs). Write keys only permit ingestion and cannot be used to read or query historical event data.
                </li>
                <li>
                  <strong>Personal Access Tokens (PATs):</strong> Secret tokens used to authenticate server-to-server calls or developer tools. You must store PATs securely and never expose them in client-side code repositories.
                </li>
              </ul>
            </section>

            <section id="subscriptions-billing">
              <h2>6. Subscriptions, Fees &amp; Billing</h2>
              <p>
                Certain features of TraceIQ Cloud are offered on a paid subscription basis:
              </p>
              <ul>
                <li>
                  <strong>Billing Cycles:</strong> Subscriptions are billed in advance on a monthly or annual recurring basis via our payment processor (Stripe).
                </li>
                <li>
                  <strong>Event Quotas &amp; Overages:</strong> Paid plans include defined monthly event ingestion and session replay quotas. Ingestion exceeding plan allowances may be throttled or subject to overage charges as specified in your plan details.
                </li>
                <li>
                  <strong>Cancellation:</strong> You may cancel your subscription at any time via the billing portal. Cancellation will take effect at the end of the current billing cycle.
                </li>
                <li>
                  <strong>Refunds:</strong> Except where required by law, paid subscription fees are non-refundable.
                </li>
              </ul>
            </section>

            <section id="intellectual-property">
              <h2>7. Intellectual Property &amp; Licenses</h2>
              <p>
                <strong>Our IP:</strong> TraceIQ and its licensors retain all right, title, and interest in and to the TraceIQ platform, trademarks, logos, documentation, visual design, and core software.
              </p>
              <p>
                <strong>Your Data:</strong> You retain all intellectual property rights in and to the telemetry, event data, custom properties, and metadata submitted to TraceIQ. You grant TraceIQ a worldwide, non-exclusive license to host, parse, aggregate, and display your data solely for the purpose of delivering the service to you.
              </p>
            </section>

            <section id="ai-mcp-terms">
              <h2>8. AI Copilot &amp; MCP Server Usage</h2>
              <p>
                When using TraceIQ&apos;s Model Context Protocol (MCP) integrations or AI assistant connections:
              </p>
              <ul>
                <li>AI assistant tokens are strictly bound to your user permissions and organization scopes.</li>
                <li>You are responsible for reviewing and authorizing any automated mutation operations initiated by external AI agents.</li>
                <li>TraceIQ will not utilize your telemetry or operational logs to train public AI foundation models.</li>
              </ul>
            </section>

            <section id="service-availability">
              <h2>9. Service Availability &amp; Maintenance</h2>
              <p>
                While we strive for high reliability and 99.9% ingestion uptime, TraceIQ Cloud is provided on an &ldquo;as available&rdquo; basis. We may perform scheduled maintenance, apply security patches, or update features with reasonable advance notice when feasible. Real-time availability is published on our <a href="/status">Status Page</a>.
              </p>
            </section>

            <section id="disclaimer-warranties">
              <h2>10. Disclaimer of Warranties</h2>
              <p className="uppercase text-xs font-mono tracking-wide text-zinc-400">
                To the maximum extent permitted by applicable law, TraceIQ and its affiliates provide the service &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo;, without warranty of any kind, whether express, implied, statutory, or otherwise, including warranties of merchantability, fitness for a particular purpose, title, or non-infringement.
              </p>
            </section>

            <section id="limitation-liability">
              <h2>11. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by applicable law, in no event shall TraceIQ, its officers, directors, employees, or suppliers be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data loss, business interruption, or system downtime arising out of or related to your use of the service.
              </p>
              <p>
                Our aggregate total liability arising out of or relating to these Terms or the service shall not exceed the amount actually paid by you to TraceIQ in the twelve (12) months preceding the event giving rise to liability.
              </p>
            </section>

            <section id="indemnification">
              <h2>12. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold harmless TraceIQ, its directors, officers, and employees from and against any third-party claims, damages, liabilities, costs, and expenses (including reasonable legal fees) arising from your violation of these Terms or your collection of end-user data in violation of applicable laws.
              </p>
            </section>

            <section id="termination">
              <h2>13. Term, Suspension &amp; Termination</h2>
              <p>
                These Terms remain in effect until terminated by either party. You may terminate these Terms by closing your account and ceasing all use of the platform.
              </p>
              <p>
                TraceIQ reserves the right to suspend or terminate your access immediately if you breach these Terms, engage in fraudulent or abusive activities, or fail to pay applicable subscription fees.
              </p>
            </section>

            <section id="modifications">
              <h2>14. Modifications to Terms</h2>
              <p>
                We may revise these Terms from time to time to reflect product evolution or regulatory changes. If revisions are material, we will provide notice through our dashboard or via email prior to the changes taking effect. Continued use of TraceIQ after changes become effective constitutes agreement to the updated Terms.
              </p>
            </section>

            <section id="governing-law">
              <h2>15. Governing Law &amp; Dispute Resolution</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the applicable jurisdiction without regard to conflict of law principles. Any dispute arising out of or relating to these Terms shall be resolved through good-faith negotiation, and if unsuccessful, submitted to confidential arbitration or competent courts.
              </p>
            </section>

            <section id="contact">
              <h2>16. Contact Information</h2>
              <p>
                If you have questions or inquiries regarding these Terms and Conditions, please contact:
              </p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:traceiq.run@gmail.com">traceiq.run@gmail.com</a></li>
                <li><strong>Legal &amp; Compliance:</strong> <a href="mailto:traceiq.run@gmail.com">traceiq.run@gmail.com</a></li>
              </ul>
            </section>
          </article>
        </div>
      </main>
    </PublicPage>
  );
}
