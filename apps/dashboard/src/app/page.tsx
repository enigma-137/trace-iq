'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import RocketIcon from '@hugeicons/core-free-icons/Rocket01Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { Chapter } from '@/components/landing/Chapter';
import { InstrumentFrame } from '@/components/landing/InstrumentFrame';
import { LandingArchitectureCards } from '@/components/landing/LandingArchitectureCards';
import { LandingApiFlow } from '@/components/LandingApiFlow';
import { LandingOverviewDemo } from '@/components/LandingOverviewDemo';
import { LandingScrollCapabilities } from '@/components/landing/LandingScrollCapabilities';
import { Reveal } from '@/components/landing/Reveal';
import { SceneCanvas } from '@/components/webgl/SceneCanvas';
import { LiveFooterStatus } from '@/components/LiveFooterStatus';
import { TrustedTeamsSection } from '@/components/TrustedTeams';

const navItems = [
  { label: 'Product', href: '#product' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' }
];

const faqs = [
  ['What does TraceIQ observe?', 'TraceIQ collects the page views and custom events you configure, plus session, device, and error context used to explain product behavior. Optional request capture records API timing and status data.'],
  ['How quickly can we get started?', 'Start the local stack, create a project, and add the browser SDK to begin collecting page views, Web Vitals, and custom events.'],
  ['Does the SDK use cookies?', 'The browser SDK does not set cookies. It uses first-party localStorage and sessionStorage for anonymous and session identifiers, which may still require notice or consent under laws that cover similar storage technologies.'],
  ['Is using TraceIQ automatically GDPR or CCPA compliant?', 'No analytics tool makes an implementation automatically compliant. Operators control what they collect and must configure notices, consent or another legal basis, retention, access, and deletion processes for their users and jurisdictions.']
];

/** Install + initialize, one per runtime. */
const installExamples = {
  JavaScript: `import { traceiq } from 'traceiq-sdk-js'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})`,
  'React Native': `import { traceiq } from 'traceiq-react-native'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})`,
  Node: `import { TraceIQ } from '@traceiq/node'\n\nconst traceiq = new TraceIQ({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: process.env.TRACEIQ_WRITE_KEY!,\n})`
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

type LabTab = 'event' | 'user' | 'flags' | 'errors';

const LAB_TABS: Array<[LabTab, string]> = [
  ['event', 'Track'],
  ['user', 'Identify'],
  ['flags', 'Flags'],
  ['errors', 'Errors']
];

const labSnippets: Record<LabTab, string> = {
  event: `traceiq.track('purchase_completed', {\n  amount: 89.00,\n  currency: 'USD',\n  gateway: 'stripe'\n});`,
  user: `traceiq.identify({\n  userId: 'usr_9981',\n  traits: {\n    email: 'developer@example.com',\n    tier: 'growth'\n  }\n});`,
  flags: `await traceiq.loadFeatureFlags();\n\nif (traceiq.isFeatureEnabled('checkout-redesign')) {\n  renderNewCheckout(\n    traceiq.getFeatureFlagPayload('checkout-redesign')\n  );\n}`,
  errors: `try {\n  initiatePayment();\n} catch (error) {\n  traceiq.captureException(error, {\n    context: 'Checkout page failure'\n  });\n}`
};

interface LogEntry {
  id: string;
  time: string;
  type: 'sdk' | 'ingest' | 'error' | 'flag';
  message: string;
  payload?: Record<string, unknown>;
}

const INITIAL_LOGS: LogEntry[] = [
  { id: 'boot-1', time: '22:54:08', type: 'sdk', message: 'TraceIQ SDK loaded successfully.' },
  { id: 'boot-2', time: '22:54:09', type: 'ingest', message: 'Connected to telemetry endpoint http://localhost:4000' }
];

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeLanguage, setActiveLanguage] = useState<keyof typeof installExamples>('JavaScript');
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<LabTab>('event');
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const copyCode = async () => {
    await navigator.clipboard.writeText(installExamples[activeLanguage]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const addLog = (type: LogEntry['type'], message: string, payload?: Record<string, unknown>) => {
    const time = new Date().toTimeString().split(' ')[0];
    const entry: LogEntry = { id: `${Date.now()}-${Math.random()}`, time, type, message, payload };
    setLogs((prev) => [...prev.slice(-14), entry]);
  };

  const simulateSDKEvent = () => {
    if (activeTab === 'event') {
      addLog('sdk', 'traceiq.track("purchase_completed")', { amount: 89.0, currency: 'USD', items: 1, gateway: 'stripe' });
      window.setTimeout(() => addLog('ingest', 'Demo event accepted by the simulated ingestion step.', { status: 202 }), 300);
    } else if (activeTab === 'user') {
      addLog('sdk', 'traceiq.identify({ userId: "usr_9981", traits })', { email: 'developer@example.com', tier: 'growth' });
      window.setTimeout(() => addLog('ingest', 'User profile associated. Anonymous history stitched to the identified user.'), 250);
    } else if (activeTab === 'flags') {
      const enabled = Math.random() > 0.5;
      addLog('flag', `traceiq.isFeatureEnabled("checkout-redesign") -> ${enabled}`);
    } else {
      addLog('error', 'TraceIQ captured uncaught runtime exception in dashboard/main.js');
      window.setTimeout(() => addLog('ingest', 'Error diagnostics sent (stacktrace + breadcrumbs resolved).'), 400);
    }
  };

  return (
    <main className="traceiq-site min-h-screen bg-background text-foreground">
      <div className="site-noise" aria-hidden="true" />
      <InstrumentFrame />

      {/* ---------------------------------------------------------- Header */}
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="TraceIQ home">
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ" className="block h-6 w-auto" width={96} height={24} />
          </a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>{item.label}</a>
            ))}
          </nav>
          <div className="header-actions">
            <a className="text-link hidden md:inline-flex" href="/auth/login">Sign in</a>
            <a className="button button-small hidden md:inline-flex" href="/auth/login">
              Get started <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
            </a>
            <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
              <HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} size={22} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mobile-nav-panel flex w-full flex-col gap-4 border-b border-white/10 bg-[#0a0a0a]/98 px-6 py-6 shadow-2xl backdrop-blur-2xl md:hidden">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
              <a href="/auth/login" onClick={() => setMenuOpen(false)} className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-center text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white">
                Sign in
              </a>
              <a href="/auth/login" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-3 text-center text-sm font-bold text-[#09090b] shadow-md transition-colors hover:bg-zinc-100">
                Get started <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ============================================ 00 / SIGNAL — the hero */}
      <Chapter
        id="top"
        index="00"
        title="Signal"
        scene="traces-hero"
        scrim={`radial-gradient(ellipse 820px 720px at 0% 52%, rgba(5,5,5,0.96) 0%, rgba(5,5,5,0.6) 46%, transparent 76%),
                linear-gradient(to right, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.6) 34%, rgba(5,5,5,0.1) 58%, transparent 72%),
                linear-gradient(to bottom, rgba(5,5,5,0.75) 0%, transparent 22%)`}
      >
        <h1 className="display">
          Clarity for
          <em>complex systems.</em>
        </h1>

        <p className="chapter-lede">
          Every page view, event, exception and API call lands in one timeline you
          can actually read — self-hosted, on Postgres you own.
        </p>

        <div className="chapter-actions">
          <a className="button" href="/auth/login">
            Start collecting events <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
          </a>
          <a className="quiet-link" href="/docs">
            Read the docs <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
          </a>
        </div>

        <dl className="figure-row">
          <div>
            <dt>Deployment</dt>
            <dd>Self-hosted<small>runs entirely on your infrastructure</small></dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>PostgreSQL<small>portable, queryable event data</small></dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>One SDK<small>browser, mobile and Node</small></dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>$0<small>open source, no seat pricing</small></dd>
          </div>
        </dl>
      </Chapter>

      <TrustedTeamsSection />

      {/* ------------------------------------------- PANEL — product overview */}
      <section className="panel" id="product">
        <Reveal>
          <div className="panel-head">
            <h2 className="display-sm">
              Traffic, behavior and health.
              <em>One inspectable view.</em>
            </h2>
            <p>
              Start with visitors and referrers, follow real session paths, then connect
              conversion behavior to errors, API latency, feature flags and alerts.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="panel-body">
            <div className="instrument">
              <div className="instrument-bar">
                <span><i /> Product overview</span>
                <span>live</span>
              </div>
              <LandingOverviewDemo />
              <p className="instrument-foot">
                Product behavior, system health and incoming activity in one place.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================================== 01 / FLOW — requests through the stack */}
      <Chapter
        id="performance"
        index="01"
        title="Flow"
        scene="pipeline"
        scrim="linear-gradient(to bottom, rgba(5,5,5,0.86) 0%, rgba(5,5,5,0.25) 30%, rgba(5,5,5,0.45) 62%, #050505 100%)"
      >
        <h2 className="display">
          Follow every request
          <em>through the stack.</em>
        </h2>
        <p className="chapter-lede">
          SDK, ingest, process, store. Compare traffic, errors and latency, then inspect
          how a single request moved — and where the failing ones dropped out.
        </p>
        <div className="chapter-actions">
          <a className="quiet-link" href="/auth/login">
            Explore TraceIQ <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
          </a>
        </div>
      </Chapter>

      {/* ----------------------------------------------- PANEL — request flow */}
      <section className="panel">
        <Reveal>
          <div className="instrument">
            <div className="instrument-bar">
              <span><i /> Request path</span>
              <span>sdk → ingest → process → store</span>
            </div>
            <LandingApiFlow />
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------ PANEL — architecture */}
      <LandingArchitectureCards />

      {/* ============================= 02 / TERRAIN — traffic as a landscape */}
      <Chapter
        index="02"
        title="Terrain"
        scene="horizon"
        centered
        scrim="linear-gradient(to bottom, #050505 0%, rgba(5,5,5,0.3) 26%, transparent 55%, rgba(5,5,5,0.5) 84%, #050505 100%)"
      >
        <h2 className="display-sm">
          Your traffic has
          <em>a shape.</em>
        </h2>
        <p className="chapter-lede" style={{ marginInline: 'auto' }}>
          Event volume over time, rendered as terrain. Spikes, plateaus and the quiet
          hours — the pattern you learn to read at a glance.
        </p>
      </Chapter>

      {/* ============== 03 / SURFACE — scroll-driven capability morph */}
      <LandingScrollCapabilities />

      {/* -------------------------------------------- PANEL — SDK install + lab */}
      <section className="panel" id="docs">
        <Reveal>
          <div className="panel-head">
            <h2 className="display-sm">
              Instrument once.
              <em>See everything.</em>
            </h2>
            <p>
              Add a few lines to install, then explore the calls you will actually write.
              The console simulates each payload locally — nothing is sent to a project.
            </p>
          </div>
        </Reveal>

        <div className="panel-body">
          <Reveal>
            <div className="instrument">
              <div className="instrument-bar">
                <span><i /> traceiq / install</span>
                <button className="copy-button" onClick={copyCode} aria-label="Copy install snippet">
                  <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={13} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="code-window-body">
                <div className="language-tabs" role="tablist" aria-label="Choose SDK language">
                  {(Object.keys(installExamples) as Array<keyof typeof installExamples>).map((language) => (
                    <button
                      key={language}
                      role="tab"
                      aria-selected={activeLanguage === language}
                      className={activeLanguage === language ? 'is-active' : ''}
                      onClick={() => setActiveLanguage(language)}
                    >
                      {language}
                    </button>
                  ))}
                </div>
                <pre aria-label={`${activeLanguage} install example`}><code>{installExamples[activeLanguage]}</code></pre>
              </div>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="sdk-lab" id="sandbox">
              <div className="lab-panel">
                <div className="lab-head">
                  <span>app/trace-test.ts</span>
                  <span>TypeScript</span>
                </div>
                <div className="lab-tabs" role="tablist" aria-label="SDK call type">
                  {LAB_TABS.map(([tab, label]) => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={activeTab === tab}
                      className={activeTab === tab ? 'is-active' : ''}
                      onClick={() => setActiveTab(tab)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <pre className="lab-code"><code>{labSnippets[activeTab]}</code></pre>
                <div className="lab-foot">
                  <span>SDK simulation ready</span>
                  <button className="lab-fire" onClick={simulateSDKEvent}>
                    Fire event <HugeiconsIcon icon={RocketIcon} size={14} />
                  </button>
                </div>
              </div>

              <div className="lab-panel">
                <div className="lab-head">
                  <span>TraceIQ demo console</span>
                  <button className="lab-clear" onClick={() => setLogs([])}>Clear</button>
                </div>
                <div className="lab-console custom-scrollbar" role="log" aria-live="polite">
                  {logs.length === 0 ? (
                    <p className="lab-empty">Console cleared. Fire an event to see its lifecycle.</p>
                  ) : (
                    logs.map((log) => (
                      <div className="lab-log" key={log.id}>
                        <div className="lab-log-head">
                          <span className="lab-log-time">[{log.time}]</span>
                          <span className={`lab-log-tag ${log.type}`}>[{log.type.toUpperCase()}]</span>
                          <span className="lab-log-message">{log.message}</span>
                        </div>
                        {log.payload && <pre>{JSON.stringify(log.payload, null, 2)}</pre>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------ PANEL — MCP */}
      <section className="panel" id="ai">
        <Reveal>
          <div className="panel-head">
            <h2 className="display-sm">
              Point your AI at
              <em>your real data.</em>
            </h2>
            <p>
              A permission-scoped MCP server, so compatible assistants can read funnels,
              retention, users, errors and API health — and perform only the mutations
              your token permits.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="panel-body">
            <div className="instrument">
              <div className="instrument-bar">
                <span><i /> mcp / servers.json</span>
                <a href="/docs#mcp">MCP docs</a>
              </div>
              <div className="code-window-body">
                <pre aria-label="TraceIQ MCP server configuration"><code>{mcpConfig}</code></pre>
              </div>
            </div>
            <div className="sdk-pills">
              <span>Permission-scoped</span><span>Funnels &amp; retention</span><span>User timelines</span><span>API health</span><span>Guarded mutations</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------ PANEL — FAQ */}
      <section className="panel" id="company">
        <Reveal>
          <div className="panel-head">
            <h2 className="display-sm">
              Questions,
              <em>answered.</em>
            </h2>
            <p>
              What TraceIQ collects, how fast you can start, and what it does and does
              not do for your compliance obligations.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="panel-body">
            <div className="faq-list">
              {faqs.map(([question, answer], i) => (
                <div className={`faq-item ${openFaq === i ? 'active' : ''}`} key={question}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                    <span>{question}</span><HugeiconsIcon icon={ArrowDown01Icon} size={18} />
                  </button>
                  {openFaq === i && <p>{answer}</p>}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================================================ 04 / READY — the CTA */}
      <Chapter
        id="contact"
        index="04"
        title="Ready"
        scene="traces-ambient"
        sceneDensity={0.45}
        sceneClassName="chapter-canvas cta-canvas"
        centered
        scrim="linear-gradient(to bottom, #050505 0%, rgba(5,5,5,0.92) 30%, rgba(5,5,5,0.78) 54%, rgba(5,5,5,0.45) 74%, transparent 94%)"
      >
        <h2 className="display">
          See what your
          <em>systems are saying.</em>
        </h2>
        <p className="chapter-lede" style={{ marginInline: 'auto' }}>
          Run the stack, add the SDK, and watch the first events land in your own
          Postgres within minutes.
        </p>
        <div className="chapter-actions" style={{ justifyContent: 'center' }}>
          <a className="button" href="/auth/login">
            Get started <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
          </a>
          <a className="quiet-link" href="/docs">
            Read the docs <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
          </a>
        </div>
      </Chapter>

      {/* ----------------------------------------------------------- Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a className="brand" href="#top">
              <img src="/brand/logo-white-no-bg.png" alt="TraceIQ" className="h-6 w-auto" width={96} height={24} />
            </a>
            <p>Make complexity legible.</p>
            <LiveFooterStatus />
          </div>
          <div className="footer-links">
            <div><strong>Explore</strong><a href="/docs">Resources</a><a href="/status">Status</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></div>
            <div><strong>Company</strong><a href="/privacy">Privacy</a><a href="/auth/login">Get started</a><a href="mailto:traceiq.run@gmail.com">Contact</a></div>
            <div><strong>Product</strong><a href="#product">Overview</a><a href="/auth/login">Sign in</a></div>
          </div>
        </div>
        <div className="footer-inner">
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} TraceIQ</span>
            <span>Built for the signal.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
