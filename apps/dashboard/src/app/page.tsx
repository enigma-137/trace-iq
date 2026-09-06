'use client'

import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Code,
  Menu,
  MoveUpRight,
  Play,
  Terminal,
  X,
  Zap
} from 'lucide-react';
import GlobeHero from '@/components/globe-hero';
import { LandingApiFlow } from '@/components/LandingApiFlow';
import { LandingOverviewDemo } from '@/components/LandingOverviewDemo';
import { LiveFooterStatus } from '@/components/LiveFooterStatus';

const navItems = [
  { label: 'Resources', href: '/docs' },
  { label: 'Status', href: '/status' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' }
];

const metrics = [
  ['Self-hosted', 'your infrastructure'],
  ['PostgreSQL', 'portable event data'],
  ['Optional auth', 'local or Supabase']
];

const faqs = [
  ['What does TraceIQ observe?', 'TraceIQ collects the page views and custom events you configure, plus session, device, and error context used to explain product behavior. Optional request capture records API timing and status data.'],
  ['How quickly can we get started?', 'Start the local stack, create a project, and add the browser SDK to begin collecting page views, Web Vitals, and custom events.'],
  ['Does the SDK use cookies?', 'The browser SDK does not set cookies. It uses first-party localStorage and sessionStorage for anonymous and session identifiers, which may still require notice or consent under laws that cover similar storage technologies.'],
  ['Is using TraceIQ automatically GDPR or CCPA compliant?', 'No analytics tool makes an implementation automatically compliant. Operators control what they collect and must configure notices, consent or another legal basis, retention, access, and deletion processes for their users and jurisdictions.']
];

const codeExamples = {
  JavaScript: `import { traceiq } from 'traceiq-sdk-js'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})\n\ntraceiq.track('checkout_started', {\n  cartValue: 4200,\n  currency: 'USD',\n})`,
  'React Native': `import { traceiq } from 'traceiq-react-native'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})\n\ntraceiq.capture({\n  event: 'checkout_started',\n  properties: { cartValue: 4200, currency: 'USD' },\n})`,
  Node: `import { TraceIQ } from '@traceiq/node'\n\nconst traceiq = new TraceIQ({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: process.env.TRACEIQ_WRITE_KEY!,\n})\n\ntraceiq.capture({\n  event: 'checkout_started',\n  properties: { cartValue: 4200 },\n})`
} as const;

const mcpConfig = `{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token"
      }
    }
  }
}`;

interface LogEntry {
  id: string;
  time: string;
  type: 'sdk' | 'ingest' | 'error' | 'flag';
  message: string;
  payload?: any;
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeLanguage, setActiveLanguage] = useState<keyof typeof codeExamples>('JavaScript');
  const [copied, setCopied] = useState(false);

  // Interactive sandbox state
  const [activeTab, setActiveTab] = useState<'event' | 'user' | 'flags' | 'errors'>('event');
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', time: '22:54:08', type: 'sdk', message: 'TraceIQ SDK loaded successfully.' },
    { id: '2', time: '22:54:09', type: 'ingest', message: 'Established connection to telemetry endpoint http://localhost:4000' }
  ]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(codeExamples[activeLanguage]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const addLog = (type: 'sdk' | 'ingest' | 'error' | 'flag', message: string, payload?: any) => {
    const time = new Date().toTimeString().split(' ')[0];
    const newLog: LogEntry = { id: Math.random().toString(), time, type, message, payload };
    setLogs((prev) => [...prev.slice(-14), newLog]);
  };

  const simulateSDKEvent = () => {
    if (activeTab === 'event') {
      addLog('sdk', 'traceiq.track("purchase_completed")', { amount: 89.0, currency: 'USD', items: 1, gateway: 'stripe' });
      setTimeout(() => {
        addLog('ingest', 'Demo event accepted by the simulated ingestion step.', { status: 202 });
      }, 300);
    } else if (activeTab === 'user') {
      addLog('sdk', 'traceiq.identify({ userId: "usr_9981", traits })', { email: 'developer@example.com', tier: 'growth' });
      setTimeout(() => {
        addLog('ingest', 'User profile associated. Properties synced with cohort engine.');
      }, 250);
    } else if (activeTab === 'flags') {
      const enabled = Math.random() > 0.5;
      addLog('flag', `traceiq.isFeatureEnabled("checkout-redesign") -> ${enabled}`);
    } else if (activeTab === 'errors') {
      addLog('error', 'TraceIQ captured uncaught runtime exception in dashboard/main.js');
      setTimeout(() => {
        addLog('ingest', 'Error diagnostics sent (stacktrace + breadcrumbs resolved).');
      }, 400);
    }
  };

  const codeSnippets = {
    event: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.track('purchase_completed', {\n  amount: 89.00,\n  currency: 'USD',\n  gateway: 'stripe'\n});`,
    user: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.identify({\n  userId: 'usr_9981',\n  traits: { email: 'developer@example.com', tier: 'growth' }\n});`,
    flags: `import { traceiq } from 'traceiq-sdk-js';\n\nawait traceiq.loadFeatureFlags();\n\nif (traceiq.isFeatureEnabled('checkout-redesign')) {\n  renderNewCheckout(\n    traceiq.getFeatureFlagPayload('checkout-redesign')\n  );\n}`,
    errors: `import { traceiq } from 'traceiq-sdk-js';\n\ntry {\n  initiatePayment();\n} catch (error) {\n  traceiq.captureException(error, {\n    context: 'Checkout page failure'\n  });\n}`
  };

  return (
    <main className="traceiq-site min-h-screen overflow-hidden bg-background text-foreground">
      <div className="site-noise" aria-hidden="true" />

      {/* Header */}
      <header className="site-header">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <a className="brand" href="#top" aria-label="TraceIQ home">
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ Logo" className="h-7 w-auto" />
          </a>
          <nav className={`desktop-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>{item.label}</a>
            ))}
          </nav>
          <div className="header-actions">
            <a className="button button-small" href="/waitlist">Get started <ArrowUpRight size={14} /></a>
            <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero — new design copy + existing globe */}
      <section className="hero mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-8 lg:py-24" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> Observe everything. Understand instantly.</div>
          <h1>Clarity for<br /><em>complex systems.</em></h1>
          <p>TraceIQ turns page views, custom events, API response data, and errors into a clear map of how your software really works.</p>
          <div className="hero-actions">
            <a className="button" href="/waitlist">Start tracing <ArrowUpRight size={16} /></a>
            <a className="quiet-link" href="#sandbox"><Play size={14} fill="currentColor" /> See how it works</a>
          </div>
          <div className="hero-note"><span>Open source · self-hosted · inspectable</span><span className="note-line" /></div>
        </div>
        <div className="hero-globe">
          <GlobeHero />
        </div>
      </section>

      {/* Metrics */}
      <section className="metrics mx-auto grid max-w-[1060px] grid-cols-1 border-y border-border px-5 py-6 sm:grid-cols-3 sm:px-0 sm:py-7" aria-label="TraceIQ deployment properties">
        {metrics.map(([value, label]) => <div className="metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </section>

      {/* Product preview */}
      <section className="traceiq-frame mx-auto max-w-[1200px] px-5 py-24 sm:px-8 lg:py-36" id="product">
        <div className="section-kicker">01 / Inside TraceIQ</div>
        <div className="intro-grid">
          <h2>Traffic, behavior, and health.<br /><em>One inspectable view.</em></h2>
          <p>Start with visitors and referrers, follow real session paths, then connect conversion behavior to errors, API latency, feature flags, and alerts.</p>
        </div>
        <div className="product-shot product-shot-primary">
          <div className="product-shot-bar">
            <span><i /> Product overview</span>
            <span>Interactive demo</span>
          </div>
          <LandingOverviewDemo />
          <p className="product-shot-caption">See product behavior, system health, and incoming activity in one place.</p>
        </div>

        <div className="product-detail">
          <div className="product-detail-copy">
            <span className="product-detail-label">API performance</span>
            <h3>Follow every request through the stack.</h3>
          </div>
          <div className="product-shot product-shot-secondary product-flow-preview">
            <LandingApiFlow />
          </div>
          <div className="product-detail-footer">
            <p>Compare traffic, errors, and latency, then inspect how requests move from your SDKs through processing and storage.</p>
            <a className="quiet-link" href="/waitlist">Explore TraceIQ <ArrowUpRight size={14} /></a>
          </div>
        </div>
      </section>

      {/* SDK quickstart */}
      <section className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-28" id="docs">
        <div className="section-kicker">02 / Meet your stack</div>
        <div className="sdk-heading">
          <h2>Instrument once.<br /><em>See everything.</em></h2>
          <p>TraceIQ fits into the tools you already use. Add a few lines, ship with confidence, and keep the signal close to the code.</p>
        </div>
        <div className="code-window overflow-hidden rounded-xl shadow-2xl">
          <div className="code-window-top">
            <div className="window-dots"><i /><i /><i /></div>
            <span className="window-title">traceiq / quickstart</span>
            <button className="copy-button" onClick={copyCode} aria-label="Copy code">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="code-window-body">
            <div className="language-tabs" role="tablist" aria-label="Choose SDK language">
              {(Object.keys(codeExamples) as Array<keyof typeof codeExamples>).map((language) => (
                <button key={language} role="tab" aria-selected={activeLanguage === language} className={activeLanguage === language ? 'is-active' : ''} onClick={() => setActiveLanguage(language)}>
                  {language}
                </button>
              ))}
            </div>
            <pre aria-label={`${activeLanguage} TraceIQ example`}><code>{codeExamples[activeLanguage]}</code></pre>
          </div>
          <div className="code-window-foot">
            <span>traceiq-sdk</span>
            <a href="/docs">Read the docs <ArrowUpRight size={13} /></a>
          </div>
        </div>
        <div className="sdk-pills">
          <span>Web Vitals</span><span>Exception capture</span><span>User timelines</span><span>Browser, mobile, and Node</span>
        </div>
      </section>

      {/* MCP / AI copilot */}
      <section className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-28" id="ai">
        <div className="section-kicker">03 / Bring your AI copilot</div>
        <div className="sdk-heading">
          <h2>Point your AI at<br /><em>your real data.</em></h2>
          <p>TraceIQ ships a permission-scoped MCP server, so compatible assistants can read funnels, retention, users, errors, and API health—and perform only the mutations your token permits.</p>
        </div>
        <div className="code-window overflow-hidden rounded-xl shadow-2xl">
          <div className="code-window-top">
            <div className="window-dots"><i /><i /><i /></div>
            <span className="window-title">mcp / servers.json</span>
          </div>
          <div className="code-window-body">
            <pre aria-label="TraceIQ MCP server configuration"><code>{mcpConfig}</code></pre>
          </div>
          <div className="code-window-foot">
            <span>traceiq-mcp-server</span>
            <a href="/docs#mcp">MCP docs <ArrowUpRight size={13} /></a>
          </div>
        </div>
        <div className="sdk-pills">
          <span>Permission-scoped</span><span>Funnels &amp; retention</span><span>User timelines</span><span>API health</span><span>Guarded mutations</span>
        </div>
      </section>

      {/* Interactive SDK sandbox */}
      <section id="sandbox" className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-20 sm:px-8">
        <div className="section-kicker">04 / SDK interaction demo</div>
        <div className="sdk-heading">
          <h2>Learn the SDK.<br /><em>Before you install it.</em></h2>
          <p>Explore representative browser calls and simulate their payload lifecycle locally. This demo does not send data to a TraceIQ project.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Mock IDE Card */}
          <div className="flex flex-col rounded-xl border border-border bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-rose-500/80" />
                <span className="size-3 rounded-full bg-amber-500/80" />
                <span className="size-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-500">app/trace-test.ts</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded bg-black/40 px-2 py-0.5 text-[10px] font-mono text-zinc-500"><Code size={12} /> TypeScript</span>
            </div>

            <div className="grid grid-cols-4 border-b border-border text-xs font-mono text-zinc-400">
              {([
                ['event', 'Track'],
                ['user', 'User'],
                ['flags', 'Flags'],
                ['errors', 'Errors']
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`py-2.5 px-1 text-center border-r border-border transition-colors ${activeTab === tab ? 'bg-white/[0.06] text-zinc-100' : 'hover:bg-white/[0.03]'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 p-5 font-mono text-sm text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre">{codeSnippets[activeTab]}</div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <span className="text-xs text-zinc-500 font-mono">SDK simulation ready.</span>
              <button onClick={simulateSDKEvent} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-4 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-95">
                <Zap size={14} /> Fire event
              </button>
            </div>
          </div>

          {/* Console */}
          <div className="flex flex-col rounded-xl border border-border overflow-hidden min-h-[320px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-zinc-400" />
                <span className="text-xs font-mono text-zinc-300">TraceIQ Demo Console</span>
              </div>
              <button onClick={() => setLogs([])} className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded border border-border">
                Clear
              </button>
            </div>
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-3 max-h-[380px]">
              {logs.map((log) => (
                <div key={log.id} className="border-b border-white/5 pb-2">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                    {log.type === 'sdk' && <span className="text-amber-400/90 shrink-0">[SDK]</span>}
                    {log.type === 'ingest' && <span className="text-emerald-400/90 shrink-0">[INGEST]</span>}
                    {log.type === 'flag' && <span className="text-indigo-400/90 shrink-0">[FLAG]</span>}
                    {log.type === 'error' && <span className="text-red-500 shrink-0 font-bold">[ERROR]</span>}
                    <span className="text-zinc-200">{log.message}</span>
                  </div>
                  {log.payload && (
                    <pre className="mt-1 ml-8 p-2 rounded bg-black/40 text-[11px] text-zinc-400 border border-white/5 overflow-x-auto">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-32" id="solutions">
        <div className="section-kicker">05 / Core capabilities</div>
        <div className="feature-heading">
          <h2>Every signal,<br /><em>in focus.</em></h2>
          <p>The core workflows already available today—from acquisition and journeys to application health and controlled collaboration.</p>
        </div>
        <div className="feature-grid">
          {[
            ['01', 'Web analytics', 'Realtime visitors, pages, referrers, browsers, operating systems, UTM campaigns, goals, Web Vitals, and reusable filters.'],
            ['02', 'Funnels and journeys', 'Measure conversion and retention, then inspect real session-to-session page transitions instead of illustrative paths.'],
            ['03', 'Users and cohorts', 'Connect anonymous activity to identified users, inspect chronological timelines, and reuse behavioral cohorts.'],
            ['04', 'Errors and API health', 'Group exceptions, inspect affected users, and rank endpoints by traffic, error rate, average latency, and p95 latency.'],
            ['05', 'Flags and alerts', 'Run deterministic rollouts, target segments, attach remote configuration, and notify teams through email or webhooks.'],
            ['06', 'Share and export', 'Create permission-scoped public dashboards, forward signed events, or export your raw data as CSV and JSON.']
          ].map(([number, title, body]) => <article className="feature-card" key={title}><span className="card-number">{number}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </section>

      {/* Workflow */}
      <section className="traceiq-frame section mx-auto grid max-w-[1060px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-36" id="resources">
        <div>
          <div className="section-kicker">06 / From event to insight</div>
          <div className="workflow-copy">
            <h2>Make every<br /><em>millisecond count.</em></h2>
            <p style={{ marginTop: 20 }}>TraceIQ keeps your team in the flow by connecting the tiny details to the big picture.</p>
            <a className="quiet-link" href="/docs">Explore the platform <MoveUpRight size={15} /></a>
          </div>
        </div>
        <div className="workflow-steps">
          {['Instrument once', 'Connect every layer', 'Resolve with confidence'].map((step, i) => (
            <div className="workflow-step" key={step}>
              <span>0{i + 1}</span>
              <div>
                <h3>{step}</h3>
                <p>{['Drop in our SDK and start collecting rich, structured telemetry.', 'See events, users, and performance errors as one connected system.', 'Turn context into action with answers your team can trust.'][i]}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-32" id="company">
        <div className="section-kicker">07 / Clear by design</div>
        <div className="faq-grid">
          <h2>Questions,<br /><em>answered.</em></h2>
          <div className="faq-list">
            {faqs.map(([question, answer], i) => (
              <div className={`faq-item ${openFaq === i ? 'active' : ''}`} key={question}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{question}</span><ChevronDown size={18} />
                </button>
                {openFaq === i && <p>{answer}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section border-t border-border" id="contact">
        <div className="cta-glow" />
        <span className="eyebrow"><span className="status-dot" /> Ready when you are</span>
        <h2>See what your<br /><em>systems are saying.</em></h2>
        <a className="button" href="/waitlist">Get started <ArrowUpRight size={16} /></a>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8 grid grid-cols-1 gap-12 md:grid-cols-2">
          <div className="footer-brand">
            <a className="brand" href="#top"><img src="/brand/logo-white-no-bg.png" alt="TraceIQ Logo" className="h-6 w-auto" /></a>
            <p>Make complexity legible.</p>
            <LiveFooterStatus />
          </div>
          <div className="footer-links">
            <div><strong>Explore</strong><a href="/docs">Resources</a><a href="/status">Status</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></div>
            <div><strong>Company</strong><a href="/privacy">Privacy</a><a href="/waitlist">Waitlist</a><a href="mailto:traceiq.run@gmail.com">Contact</a></div>
            <div><strong>Product</strong><a href="#product">Overview</a><a href="/auth/login">Sign in</a></div>
          </div>
        </div>
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} TraceIQ</span>
            <span>Built for the signal.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
