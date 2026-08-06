'use client';

import { useState, useRef, useEffect } from 'react';
import GlobeHero from '@/components/globe-hero';

// Custom icons as inline components for light weight and zero dependency friction
function TraceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ChevronIcon({ className, open }: { className?: string; open?: boolean }) {
  return (
    <svg className={`${className} transform transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

interface LogEntry {
  id: string;
  time: string;
  type: 'sdk' | 'ingest' | 'error' | 'flag';
  message: string;
  payload?: any;
}

export default function MarketingHomePage() {
  // Sandbox State
  const [activeTab, setActiveTab] = useState<'event' | 'user' | 'flags' | 'errors'>('event');
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', time: '22:54:08', type: 'sdk', message: 'TraceIQ SDK loaded successfully.' },
    { id: '2', time: '22:54:09', type: 'ingest', message: 'Established connection to telemetry endpoint http://localhost:4000' }
  ]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // FAQ State
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (type: 'sdk' | 'ingest' | 'error' | 'flag', message: string, payload?: any) => {
    const time = new Date().toTimeString().split(' ')[0];
    const newLog: LogEntry = {
      id: Math.random().toString(),
      time,
      type,
      message,
      payload
    };
    setLogs((prev) => [...prev.slice(-14), newLog]); // Keep last 15 items
  };

  const simulateSDKEvent = () => {
    if (activeTab === 'event') {
      addLog('sdk', 'traceiq.track("purchase_completed")', {
        amount: 89.00,
        currency: 'USD',
        items: 1,
        gateway: 'stripe'
      });
      setTimeout(() => {
        addLog('ingest', 'Event "purchase_completed" ingested successfully. Latency: 14ms.', {
          status: 202,
          eventId: `evt_${Math.floor(Math.random() * 900000 + 100000)}`
        });
      }, 300);
    } else if (activeTab === 'user') {
      addLog('sdk', 'traceiq.identify("usr_9981")', {
        email: 'developer@example.com',
        tier: 'enterprise',
        createdAt: '2026-07-06'
      });
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

  const faqs = [
    {
      q: "What is TraceIQ?",
      a: "TraceIQ is an open-source, developer-first behavior intelligence platform. It brings event tracking, conversion funnels, user timelines, and performance errors into one lightweight SDK (under 25 KB) and an easy-to-use analytics dashboard."
    },
    {
      q: "Do I need standard cookie banners with TraceIQ?",
      a: "No! By default, TraceIQ tracks user sessions using privacy-first, cookieless telemetry hashes that do not store personally identifiable information (PII) on the device. This makes it GDPR and CCPA compliant out of the box."
    },
    {
      q: "How does the performance compare with Google Analytics?",
      a: "Google Analytics (GA4) loads scripts over 45 KB, runs heavy tracking scripts, and blocks rendering. TraceIQ uses a micro-optimized JS bundle under 25 KB that runs asynchronously and won't affect your Core Web Vitals (LCP, INP, CLS)."
    },
    {
      q: "Can I self-host TraceIQ?",
      a: "Absolutely! TraceIQ is architected with Docker and PostgreSQL. You can use our managed Cloud version for quick starts or deploy it on your own infrastructure (AWS, Vercel, Fly.io, etc.) for absolute data sovereignty."
    }
  ];

  return (
    <div className="relative min-h-screen bg-[#050505] text-zinc-50 overflow-hidden bg-grid-dots" style={{ fontFamily: 'var(--font-inter)' }}>
      {/* Background Glowing Blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/5 rounded-full glow-blob animate-pulse-slow pointer-events-none" />
      <div className="absolute top-20 right-1/4 w-80 h-80 bg-zinc-200/5 rounded-full glow-blob animate-float pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[30rem] h-[30rem] bg-white/5 rounded-full glow-blob animate-pulse-slow pointer-events-none" />

      {/* Header/Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md transition-all duration-200">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ Logo" className="h-8 w-auto" />
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Features</a>
            <a href="#sandbox" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Interactive Demo</a>
            <a href="#faq" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">FAQ</a>
            <a href="/docs" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Docs</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1.5">
              GitHub
              <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full font-mono">v0.1.0</span>
            </a>
          </div>

          <div className="flex items-center gap-3">
            <a 
              href="/waitlist" 
              className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-50 px-4 text-sm font-medium text-zinc-950 shadow hover:bg-zinc-200 active:scale-[0.98] transition-all"
            >
              Start Free
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section — full screen, globe bleeds off the bottom edge */}
      <section className="relative min-h-screen w-full overflow-hidden">
        {/* Globe layer: fills the whole hero. The sphere is pushed down in 3D
            inside the canvas, so the soft "top" is the sphere's own curved
            anti-aliased silhouette — not a clipped box edge. The section's
            overflow-hidden keeps it from bleeding into the sandbox below. */}
        <div className="absolute inset-0">
          <GlobeHero />
        </div>

        {/* Soft atmospheric blend right where the dome's arc meets the text */}
        <div
          className="pointer-events-none absolute inset-x-0 z-[5] blur-2xl"
          style={{
            top: '38%',
            height: '30%',
            background:
              'radial-gradient(ellipse 65% 100% at 50% 0%, rgba(5,5,5,0.9) 0%, rgba(5,5,5,0.5) 40%, rgba(5,5,5,0) 75%)'
          }}
        />

        {/* Bottom fade so the globe eases into the footer content below it
            instead of cutting off hard at the section boundary */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050505] to-transparent" />

        {/* Copy layer */}
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-start gap-6 px-6 pt-32 sm:pt-36 text-center pointer-events-none">
          <span className="pointer-events-auto rounded-full border border-zinc-700 bg-zinc-950/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-300 backdrop-blur-sm">
            Telemetry SDK under 25 KB
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
            See user journeys.<br />
            <span className="text-zinc-400">Solve conversion friction.</span>
          </h1>
          <p className="max-w-2xl text-base text-zinc-400 sm:text-lg lg:text-xl leading-relaxed">
            TraceIQ logs clicks, API response rates, web vitals, and errors. It compiles them into interactive timelines and conversion paths, giving developers the precise signals needed to build seamless product flows.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a
              href="/waitlist"
              className="pointer-events-auto inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-zinc-950 shadow-lg shadow-zinc-950/10 transition hover:bg-zinc-100 active:scale-95"
            >
              Get Started Free
            </a>
            <a
              href="#sandbox"
              className="pointer-events-auto inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/80 px-6 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
            >
              Try SDK Live
            </a>
          </div>
        </div>
      </section>

      {/* Interactive SDK Sandbox Section */}
      <section id="sandbox" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-900">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-50">
            One Script. Real-time Telemetry.
          </h2>
          <p className="mt-4 text-zinc-400">
            Switch between telemetry snippets, run them live, and view the raw payload streamed from your client directly to our trace ingestion pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-6xl mx-auto">
          {/* Mock IDE Card */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-rose-500/80" />
                <span className="size-3 rounded-full bg-amber-500/80" />
                <span className="size-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-500">app/trace-test.ts</span>
              </div>
              <div className="flex items-center gap-1 bg-zinc-950 rounded px-2 py-0.5 border border-zinc-800/60">
                <CodeIcon className="size-3.5 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500">TypeScript</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-4 border-b border-zinc-800/80 bg-zinc-950/40 text-xs font-mono text-zinc-400">
              <button 
                onClick={() => setActiveTab('event')}
                className={`py-2 px-1 text-center border-r border-zinc-800/60 transition-all ${activeTab === 'event' ? 'bg-zinc-900/40 text-amber-400 border-b-2 border-b-amber-400' : 'hover:bg-zinc-900/20'}`}
              >
                Track Event
              </button>
              <button 
                onClick={() => setActiveTab('user')}
                className={`py-2 px-1 text-center border-r border-zinc-800/60 transition-all ${activeTab === 'user' ? 'bg-zinc-900/40 text-rose-400 border-b-2 border-b-rose-400' : 'hover:bg-zinc-900/20'}`}
              >
                Identify User
              </button>
              <button 
                onClick={() => setActiveTab('flags')}
                className={`py-2 px-1 text-center border-r border-zinc-800/60 transition-all ${activeTab === 'flags' ? 'bg-zinc-900/40 text-indigo-400 border-b-2 border-b-indigo-400' : 'hover:bg-zinc-900/20'}`}
              >
                Feature Flags
              </button>
              <button 
                onClick={() => setActiveTab('errors')}
                className={`py-2 px-1 text-center transition-all ${activeTab === 'errors' ? 'bg-zinc-900/40 text-red-400 border-b-2 border-b-red-400' : 'hover:bg-zinc-900/20'}`}
              >
                Error Capture
              </button>
            </div>

            {/* Code Snippet Box */}
            <div className="flex-1 p-6 bg-zinc-950/60 font-mono text-sm text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre">
              {codeSnippets[activeTab]}
            </div>

            {/* Trigger Button */}
            <div className="px-6 py-4 bg-zinc-900/40 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">SDK simulation ready.</span>
              <button 
                onClick={simulateSDKEvent}
                className="inline-flex h-9 items-center gap-2 rounded bg-zinc-50 px-4 text-xs font-semibold text-zinc-950 shadow hover:bg-zinc-200 transition-all active:scale-95"
              >
                <TraceIcon className="size-4" />
                Fire Telemetry Event
              </button>
            </div>
          </div>

          {/* Console Log Terminal */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden shadow-2xl min-h-[300px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/40 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <TerminalIcon className="size-4 text-zinc-400" />
                <span className="text-xs font-mono text-zinc-300 font-medium">TraceIQ Ingest Engine Console</span>
              </div>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/30 transition-all"
              >
                Clear Log
              </button>
            </div>

            {/* Logs Area */}
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-3 max-h-[360px] custom-scrollbar">
              {logs.map((log) => (
                <div key={log.id} className="border-b border-zinc-900/80 pb-2">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-600 font-medium shrink-0">[{log.time}]</span>
                    
                    {log.type === 'sdk' && <span className="text-amber-400 shrink-0">[SDK]</span>}
                    {log.type === 'ingest' && <span className="text-emerald-400 shrink-0">[INGEST]</span>}
                    {log.type === 'flag' && <span className="text-indigo-400 shrink-0">[FLAG]</span>}
                    {log.type === 'error' && <span className="text-red-500 shrink-0 font-bold">[ERROR]</span>}

                    <span className="text-zinc-200">{log.message}</span>
                  </div>
                  {log.payload && (
                    <pre className="mt-1 ml-10 p-2 rounded bg-zinc-900/50 text-[11px] text-zinc-400 border border-zinc-900 overflow-x-auto">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features Section */}
      <section id="features" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-900">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-50">
            Engineered for modern web telemetry.
          </h2>
          <p className="mt-4 text-zinc-400">
            A comprehensive suite of analytics tools unified inside a single telemetry pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Card 1: Event Ingestion */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <TraceIcon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Custom Event Ingestion</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Track transactional processes, checkout workflows, and user engagement logs with custom metadata properties.
            </p>
          </div>

          {/* Card 2: Funnel Dropoffs */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Funnel Drop-off Analysis</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Build custom multi-step funnels to map out step-by-step drop-offs, comparing success rates between device variants.
            </p>
          </div>

          {/* Card 3: User Timelines */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <UserIcon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">High-Fidelity Timelines</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Drill down into individual user logs. Understand exactly what actions preceded a checkout failure or API timeout.
            </p>
          </div>

          {/* Card 4: Session Replay */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Session Replay Scaffolding</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Ready-made layer abstraction for visual session replay pipelines (designed for future DOM snapshotting integrations).
            </p>
          </div>

          {/* Card 5: Error Diagnostics */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <AlertIcon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Error Tracking & Context</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Capture front-end exceptions immediately. Associate stack traces with active behavioral telemetry trails.
            </p>
          </div>

          {/* Card 6: AI Insights */}
          <div className="group rounded-xl border border-zinc-900 bg-zinc-900/10 backdrop-blur-sm p-6 hover:border-zinc-800 transition-all duration-300">
            <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-100 mb-4 border border-zinc-800 group-hover:border-zinc-500/50 transition-colors">
              <CpuIcon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">AI Intelligence Core</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Scaffolded architecture ready for automatic anomaly scoring, UX friction reports, and design suggestion triggers.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-900">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-50">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4 max-w-3xl mx-auto">
          {faqs.map((faq, index) => {
            const isOpen = expandedFaq === index;
            return (
              <div 
                key={index} 
                className="rounded-xl border border-zinc-900 bg-zinc-900/10 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setExpandedFaq(isOpen ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left font-medium text-zinc-200 hover:text-white transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronIcon className="size-5 text-zinc-500" open={isOpen} />
                </button>
                {isOpen && (
                  <div className="p-5 pt-0 text-sm text-zinc-400 leading-relaxed border-t border-zinc-900/50 bg-zinc-950/20">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/20 backdrop-blur px-8 py-12 text-center overflow-hidden shadow-3xl">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/5 pointer-events-none" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-100">
            Ready to trace client conversion behavior?
          </h2>
          <p className="mt-4 text-zinc-400 max-w-xl mx-auto text-sm sm:text-base">
            Integrate the TraceIQ script in under 5 minutes. Capture telemetry signals, diagnose conversion failures, and scale seamlessly.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="/waitlist"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-50 px-6 text-sm font-semibold text-zinc-950 shadow hover:bg-zinc-200 transition-all active:scale-[0.98]"
            >
              Sign Up For Free
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 px-6 text-sm font-medium text-zinc-300 hover:bg-zinc-900 transition-all"
            >
              Self-Host Node
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/60 py-12 mt-16 text-xs text-zinc-500 font-mono">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ Logo" className="h-6 w-auto" />
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center">
            <a href="#features" className="hover:text-zinc-300 transition-colors">Features</a>
            <a href="#sandbox" className="hover:text-zinc-300 transition-colors">Developer Console</a>
            <a href="#faq" className="hover:text-zinc-300 transition-colors">FAQ</a>
            <a href="/docs" className="hover:text-zinc-300 transition-colors">Docs</a>
          </div>

          <div>
            &copy; {new Date().getFullYear()} TraceIQ Analytics, Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
