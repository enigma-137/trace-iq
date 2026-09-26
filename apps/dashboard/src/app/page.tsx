'use client';

import { FormEvent, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CodeIcon from '@hugeicons/core-free-icons/CodeIcon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import RocketIcon from '@hugeicons/core-free-icons/Rocket01Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import TerminalIcon from '@hugeicons/core-free-icons/TerminalIcon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingArchitectureCards } from '@/components/landing/LandingArchitectureCards';
import { LandingApiFlow } from '@/components/LandingApiFlow';
import { LandingOverviewDemo } from '@/components/LandingOverviewDemo';
import { LandingScrollCapabilities } from '@/components/landing/LandingScrollCapabilities';
import { LiveFooterStatus } from '@/components/LiveFooterStatus';
import { TrustedTeamsSection } from '@/components/TrustedTeams';
import { joinWaitlist } from './actions';

const navItems = [
  { label: 'Product', href: '#product' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Docs', href: '/docs' },
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
  const [scrolled, setScrolled] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [waitlistError, setWaitlistError] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const handleWaitlistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (waitlistLoading) return;

    setWaitlistLoading(true);
    setWaitlistMessage('');
    setWaitlistError('');

    try {
      const result = await joinWaitlist(waitlistEmail);
      if (result.success) {
        setWaitlistMessage(result.message || 'You are on the list.');
        setWaitlistEmail('');
      } else {
        setWaitlistError(result.error || 'We could not add that email.');
      }
    } catch {
      setWaitlistError('We could not add that email. Please try again.');
    } finally {
      setWaitlistLoading(false);
    }
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
    <main className="traceiq-site min-h-screen bg-background text-foreground">
      <div className="site-noise" aria-hidden="true" />

      {/* Floating Header */}
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="flex h-20 w-full items-center justify-between px-6 sm:px-10 lg:px-12 xl:px-16">
          <a className="brand" href="#top" aria-label="TraceIQ home">
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ Logo" className="h-7 w-auto block" />
          </a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>{item.label}</a>
            ))}
          </nav>
          <div className="header-actions">
            <a className="text-link hidden md:inline-flex" href="/auth/login">Sign in</a>
            <a className="button button-small hidden md:inline-flex" href="/auth/login">Get started <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} /></a>
            <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
              {menuOpen ? <HugeiconsIcon icon={Cancel01Icon} size={22} /> : <HugeiconsIcon icon={Menu01Icon} size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation Menu */}
        {menuOpen && (
          <div className="mobile-nav-panel md:hidden w-full bg-[#0a0a0a]/98 backdrop-blur-2xl border-b border-white/10 px-6 py-6 flex flex-col gap-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 text-base font-medium text-zinc-200 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-2.5">
              <a
                href="/auth/login"
                onClick={() => setMenuOpen(false)}
                className="w-full py-2.5 px-3 text-center text-sm font-medium text-zinc-300 hover:text-white rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors"
              >
                Sign in
              </a>
              <a
                href="/auth/login"
                onClick={() => setMenuOpen(false)}
                className="w-full py-3 px-4 text-center text-sm font-bold bg-white hover:bg-zinc-100 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md"
                style={{ color: '#09090b', backgroundColor: '#ffffff' }}
              >
                <span className="font-bold" style={{ color: '#09090b' }}>Get started</span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} style={{ color: '#09090b' }} />
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Hero — Cinematic video background with fallback and atmospheric readability overlay */}
      <LandingHero />

      {/* Trusted by teams */}
      <TrustedTeamsSection />

      {/* Full-width white background section with architecture images & captions */}
      <LandingArchitectureCards />

      {/* Product preview */}
      <section className="traceiq-frame mx-auto w-full max-w-[1880px] px-6 sm:px-10 lg:px-14 xl:px-20 2xl:px-24 py-24 sm:py-28 lg:py-36" id="product">
        <div className="section-kicker">01 / Inside TraceIQ</div>
        <div className="intro-grid">
          <h2>Traffic, behavior, and health.<br /><em>One inspectable view.</em></h2>
          <p>Start with visitors and referrers, follow real session paths, then connect conversion behavior to errors, API latency, feature flags, and alerts.</p>
        </div>
        <div className="product-shot product-shot-primary">
          <div className="product-shot-bar">
            <span><i /> Product overview</span>
          </div>
          {/* <LandingOverviewDemo /> */}
          <p className="product-shot-caption">See product behavior, system health, and incoming activity in one place.</p>
        </div>
      </section>

      {/* Full-bleed Editorial Photographic Break */}
      <section className="relative w-full h-[70vh] sm:h-[85vh] lg:h-[95vh] min-h-[500px] overflow-hidden bg-black select-none" aria-hidden="true">
        <img
          src="/landing/editorial-office.png"
          alt="Engineering architecture and workspace"
          className="w-full h-full object-cover object-center"
          loading="lazy"
        />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#050505] via-[#050505]/40 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent pointer-events-none" />
      </section>

      {/* API performance */}
      <section className="traceiq-frame mx-auto w-full max-w-[1880px] px-6 sm:px-10 lg:px-14 xl:px-20 2xl:px-24 py-24 sm:py-28 lg:py-36" id="performance">
        <div className="product-detail mt-0">
          <div className="product-detail-copy">
            <span className="product-detail-label">API performance</span>
            <h3>Follow every request through the stack.</h3>
          </div>
          <div className="product-shot product-shot-secondary product-flow-preview">
            {/* <LandingApiFlow /> */}
          </div>
          <div className="product-detail-footer">
            <p>Compare traffic, errors, and latency, then inspect how requests move from your SDKs through processing and storage.</p>
            <a className="quiet-link" href="/auth/login">Explore TraceIQ <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} /></a>
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
              {copied ? <HugeiconsIcon icon={Tick02Icon} size={14} /> : <HugeiconsIcon icon={Copy01Icon} size={14} />} {copied ? 'Copied' : 'Copy'}
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
            <a href="/docs">Read the docs <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} /></a>
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
            <a href="/docs#mcp">MCP docs <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} /></a>
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
              <span className="inline-flex items-center gap-1.5 rounded bg-black/40 px-2 py-0.5 text-[10px] font-mono text-zinc-500"><HugeiconsIcon icon={CodeIcon} size={12} /> TypeScript</span>
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
                Fire event  <HugeiconsIcon icon={RocketIcon} size={14} />
              </button>
            </div>
          </div>

          {/* Console */}
          <div className="flex flex-col rounded-xl border border-border overflow-hidden min-h-[320px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={TerminalIcon} size={14} className="text-zinc-400" />
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

      {/* Core Capabilities - Fullscreen Scroll Experience */}
      <LandingScrollCapabilities />

      {/* Workflow */}
      <section className="traceiq-frame section mx-auto grid max-w-[1060px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-36" id="resources">
        <div>
          <div className="section-kicker">06 / From event to insight</div>
          <div className="workflow-copy">
            <h2>Make every<br /><em>millisecond count.</em></h2>
            <p style={{ marginTop: 20 }}>TraceIQ keeps your team in the flow by connecting the tiny details to the big picture.</p>
            <a className="quiet-link" href="/docs">Explore the platform <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} /></a>
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
                  <span>{question}</span><HugeiconsIcon icon={ArrowDown01Icon} size={18} />
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
        <a className="button" href="/auth/login">Get started <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} /></a>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-newsletter">
              <span className="footer-label">Stay close to the signal</span>
              <h2>Useful product insight,<br /><em>occasionally.</em></h2>
              <form className="footer-waitlist-form" onSubmit={handleWaitlistSubmit}>
                <label htmlFor="footer-email">Business email</label>
                <div className="footer-email-control">
                  <input
                    id="footer-email"
                    name="email"
                    type="email"
                    value={waitlistEmail}
                    onChange={(event) => setWaitlistEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={waitlistLoading}
                    required
                  />
                  <button type="submit" aria-label="Join the TraceIQ waitlist" disabled={waitlistLoading}>
                    <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
                  </button>
                </div>
              </form>
              {(waitlistMessage || waitlistError) && (
                <p className={`footer-form-feedback ${waitlistError ? 'is-error' : 'is-success'}`} aria-live="polite">
                  {waitlistMessage || waitlistError}
                </p>
              )}
            </div>
            <div className="footer-links">
              <div><strong>Help</strong><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/privacy">Privacy policy</a><a href="/terms">Terms of service</a><a href="mailto:traceiq.run@gmail.com">Contact</a></div>
              <div><strong>Explore</strong><a href="#product">Product overview</a><a href="/pricing">Pricing</a><a href="/status">System status</a><a href="/auth/login">Get started</a></div>
              <div><strong>Resources</strong><a href="/docs#sdk">SDKs</a><a href="/docs#mcp">MCP server</a><a href="/docs#session-replay">Session replay</a><span className="text-gray-400 cursor-not-allowed "> GitHub project</span></div>
            </div>
          </div>
          <div className="footer-wordmark" aria-hidden="true">T r a c e  I Q</div>
          <div className="footer-bottom">

            <div className="footer-identity">
              <a className="brand" href="#top"><img src="/brand/logo-white-no-bg.png" alt="TraceIQ home" className="h-6 w-auto" /></a>
              <span>Make complexity legible.</span>
              <LiveFooterStatus />
            </div>
            <div className="footer-socials" aria-label="Social links">
              <span className="cursor-not-allowed" aria-label="TraceIQ on GitHub">GH</span>
              <a href="mailto:traceiq.run@gmail.com" aria-label="Email TraceIQ">@</a>
              <a href="/docs" aria-label="TraceIQ documentation">?</a>
            </div>
            <span className="footer-copyright">© {new Date().getFullYear()} TraceIQ</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
