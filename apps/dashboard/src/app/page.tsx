'use client'

import type { Metadata } from 'next';
import LandingPage from './LandingPage';

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

const navItems = ['Product', 'Solutions', 'Docs', 'Resources', 'Company'];

const metrics = [
  ['99.99%', 'signal fidelity'],
  ['2.4M+', 'events modeled daily'],
  ['< 45ms', 'average trace latency']
];

const faqs = [
  ['What does TraceIQ observe?', 'TraceIQ maps the full path of every click, API call, web vital, and error across your product, and compiles them into one living behavioral timeline.'],
  ['How quickly can we get started?', 'Add a few lines of our SDK to your app and see your first live events in minutes. No cookies, no heavy scripts — just one lightweight script under 25 KB.'],
  ['Do we need cookie banners?', 'No. TraceIQ uses privacy-first, cookieless telemetry hashes that do not store PII, making it GDPR and CCPA compliant out of the box.'],
  ['How does it compare to Google Analytics?', 'GA4 loads over 45 KB of heavy tracking scripts that can hurt your Core Web Vitals. TraceIQ ships a micro-optimized, asynchronous bundle that stays out of your render path.']
];

const codeExamples = {
  JavaScript: `import { traceiq } from 'traceiq-sdk-js'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})\n\ntraceiq.track('checkout_started', {\n  cartValue: 4200,\n  currency: 'USD',\n})`,
  'React Native': `import { traceiq } from 'traceiq-react-native'\n\ntraceiq.initialize({\n  projectId: 'YOUR_PROJECT_ID',\n  writeKey: 'YOUR_WRITE_KEY',\n})\n\ntraceiq.track('checkout_started', {\n  cartValue: 4200,\n  currency: 'USD',\n  platform: 'ios',\n})`,
  Node: `import { TraceIQ } from '@traceiq/node'\n\nconst traceiq = new TraceIQ({\n  projectId: process.env.TRACEIQ_PROJECT_ID,\n  writeKey: process.env.TRACEIQ_WRITE_KEY,\n})\n\nawait traceiq.capture({\n  event: 'checkout_started',\n})`,
  Python: `from traceiq import Client\n\ntraceiq = Client(\n    project_id="YOUR_PROJECT_ID",\n    write_key="YOUR_WRITE_KEY",\n)\n\ntraceiq.capture("checkout_started",\n    properties={"cart_value": 4200})`,
  Rust: `use traceiq::Client;\nuse serde_json::json;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let traceiq = Client::new("YOUR_PROJECT_ID", "YOUR_WRITE_KEY");\n\n    traceiq\n        .capture("checkout_started", json!({ "cart_value": 4200 }))\n        .await?;\n\n    traceiq.shutdown().await?;\n    Ok(())\n}`
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
        addLog('ingest', 'Event "purchase_completed" ingested successfully. Latency: 14ms.', { status: 202, eventId: `evt_${Math.floor(Math.random() * 900000 + 100000)}` });
      }, 300);
    } else if (activeTab === 'user') {
      addLog('sdk', 'traceiq.identify("usr_9981")', { email: 'developer@example.com', tier: 'enterprise', createdAt: '2026-07-06' });
      setTimeout(() => {
        addLog('ingest', 'User profile associated. Properties synced with cohort engine.');
      }, 250);
    } else if (activeTab === 'flags') {
      const variants = ['control', 'v2-sleek-checkout', 'control'];
      const picked = variants[Math.floor(Math.random() * variants.length)];
      addLog('flag', `traceiq.getFeatureFlag("checkout-redesign") -> resolved: "${picked}"`);
    } else if (activeTab === 'errors') {
      addLog('error', 'TraceIQ captured uncaught runtime exception in dashboard/main.js');
      setTimeout(() => {
        addLog('ingest', 'Error diagnostics sent (stacktrace + breadcrumbs resolved).');
      }, 400);
    }
  };

  const codeSnippets = {
    event: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.track('purchase_completed', {\n  amount: 89.00,\n  currency: 'USD',\n  gateway: 'stripe'\n});`,
    user: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.identify('usr_9981', {\n  email: 'developer@example.com',\n  tier: 'enterprise'\n});`,
    flags: `import { traceiq } from 'traceiq-sdk-js';\n\nconst checkoutVariant = traceiq.getFeatureFlag(\n  'checkout-redesign'\n);\n\nif (checkoutVariant === 'v2-sleek-checkout') {\n  renderSleekCheckout();\n}`,
    errors: `import { traceiq } from 'traceiq-sdk-js';\n\ntry {\n  initiatePayment();\n} catch (error) {\n  traceiq.trackError(error, {\n    context: 'Checkout page failure'\n  });\n}`
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
              <a href={`#${item.toLowerCase()}`} key={item}>{item}<ChevronDown size={13} /></a>
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
          <p>TraceIQ turns clicks, API response rates, web vitals, and errors into a clear, living map of how your software really works.</p>
          <div className="hero-actions">
            <a className="button" href="/waitlist">Start tracing <ArrowUpRight size={16} /></a>
            <a className="quiet-link" href="#sandbox"><Play size={14} fill="currentColor" /> See how it works</a>
          </div>
          <div className="hero-note"><span>Trusted by teams building what&apos;s next</span><span className="note-line" /></div>
        </div>
        <div className="hero-globe">
          <GlobeHero />
        </div>
      </section>

      {/* Metrics */}
      <section className="metrics mx-auto grid max-w-[1060px] grid-cols-1 border-y border-border px-5 py-6 sm:grid-cols-3 sm:px-0 sm:py-7" aria-label="TraceIQ performance metrics">
        {metrics.map(([value, label]) => <div className="metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </section>

      {/* Intro / signal layer */}
      <section className="traceiq-frame mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-36" id="product">
        <div className="section-kicker">01 / The signal layer</div>
        <div className="intro-grid">
          <h2>See the whole picture.<br /><em>Not just the symptoms.</em></h2>
          <p>Modern software is a network of invisible relationships. TraceIQ makes those relationships visible, so teams can move from alert to answer without guesswork.</p>
        </div>
        <div className="signal-card">
          <div className="signal-top">
            <span className="mini-label">TRACE / LIVE</span>
            <span className="signal-value"><span className="status-dot" /> All systems nominal</span>
          </div>
          <div className="trace-lines"><span /><span /><span /><span /><span /><span /></div>
          <div className="signal-bottom">
            <span>checkout-service</span><span>api-gateway</span><span>analytics-ingest</span><span>payments-db</span><span>queue-worker</span>
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
          <span>Under 25 KB</span><span>Auto-capture exceptions</span><span>Timeline-driven</span><span>Server-side ready</span>
        </div>
      </section>

      {/* MCP / AI copilot */}
      <section className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-24 sm:px-8 lg:py-28" id="ai">
        <div className="section-kicker">03 / Bring your AI copilot</div>
        <div className="sdk-heading">
          <h2>Point your AI at<br /><em>your real data.</em></h2>
          <p>TraceIQ ships an MCP server, so Claude, Cursor, and other agents can read your funnels, retention, users, and API health — and even toggle feature flags — straight from your trace data.</p>
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
          <span>30+ tools</span><span>Funnels &amp; retention</span><span>User timelines</span><span>API health</span><span>Toggle flags</span>
        </div>
      </section>

      {/* Interactive SDK sandbox */}
      <section id="sandbox" className="traceiq-frame section mx-auto max-w-[1060px] px-5 py-20 sm:px-8">
        <div className="section-kicker">Live telemetry test-drive</div>
        <div className="sdk-heading">
          <h2>One script.<br /><em>Real-time telemetry.</em></h2>
          <p>Switch between telemetry snippets, run them live, and watch the raw payload stream into our trace ingestion pipeline.</p>
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
                <span className="text-xs font-mono text-zinc-300">TraceIQ Ingest Console</span>
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
        <div className="section-kicker">02 / Built for the edges</div>
        <div className="feature-heading">
          <h2>Every signal,<br /><em>in focus.</em></h2>
          <p>One observability layer for every event, every handoff, every moment that matters — from first click to final conversion.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-wide">
            <div>
              <span className="card-number">01</span>
              <h3>Follow the thread.</h3>
              <p>End-to-end user timelines that stay intelligible as your segments and funnels grow.</p>
            </div>
            <div className="orbit-graphic"><i /><i /><i /><b>→</b></div>
          </article>
          <article className="feature-card">
            <span className="card-number">02</span>
            <h3>Find the friction.</h3>
            <p>Surface the exact step, event, or variant behind every funnel drop-off.</p>
            <div className="fracture-graphic"><span /><span /><span /><span /><span /></div>
          </article>
          <article className="feature-card">
            <span className="card-number">03</span>
            <h3>Move with signal.</h3>
            <p>Give every team the context to act before customers feel the impact.</p>
            <div className="signal-bars"><span /><span /><span /><span /><span /><span /></div>
          </article>
        </div>
      </section>

      {/* Workflow */}
      <section className="traceiq-frame section mx-auto grid max-w-[1060px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-36" id="resources">
        <div>
          <div className="section-kicker">03 / From event to insight</div>
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
        <div className="section-kicker">04 / Clear by design</div>
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

      <LandingPage />

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
            <span className="footer-status"><span className="status-dot" /> All systems operational</span>
          </div>
          <div className="footer-links">
            <div><strong>Product</strong><a href="#product">Overview</a><a href="#solutions">Solutions</a><a href="/docs">Resources</a></div>
            <div><strong>Company</strong><a href="#company">About</a><a href="/waitlist">Waitlist</a><a href="mailto:hello@traceiq.dev">Contact</a></div>
            <div><strong>Connect</strong><a href="/docs">Docs</a><a className="" href="/status">Status</a></div>
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
