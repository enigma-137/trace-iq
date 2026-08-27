'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
// import GlobeHero from '@/components/globe-hero';

// TODO: point these at the real repo once it is public.
// const GITHUB_URL = 'https://github.com';
// const VERSION = 'v0.1.0';

// Shared focus treatment. The page is near-black, so the ring needs an offset
// in the same colour to read as a ring rather than a smear.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#sandbox', label: 'Live Demo' },
  { href: '#sdks', label: 'SDKs' },
  { href: '#faq', label: 'FAQ' },
  { href: '/docs', label: 'Docs' }
];

// Custom icons as inline components for light weight and zero dependency friction
function TraceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

// function TerminalIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
//       <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
//     </svg>
//   );
// }

function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function RetentionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1h6z" />
    </svg>
  );
}

// function ChevronIcon({ className, open }: { className?: string; open?: boolean }) {
//   return (
//     <svg
//       className={`${className} transform transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
//       fill="none"
//       viewBox="0 0 24 24"
//       stroke="currentColor"
//       strokeWidth={2}
//       aria-hidden="true"
//     >
//       <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
//     </svg>
//   );
// }

// function MenuIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
//       <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
//     </svg>
//   );
// }

// function CloseIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
//       <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
//     </svg>
//   );
// }

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// function GithubIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
//       <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
//     </svg>
//   );
// }

// Feature status is grounded in what the API actually exposes today, so the
// page never promises a route that isn't mapped.
type FeatureStatus = 'live' | 'beta' | 'planned';

const STATUS_STYLES: Record<FeatureStatus, { label: string; className: string }> = {
  live: { label: 'Live', className: 'border-emerald-500/30 text-emerald-300' },
  beta: { label: 'Beta', className: 'border-amber-500/30 text-amber-300' },
  planned: { label: 'Planned', className: 'border-zinc-700 bg-zinc-800/40 text-zinc-400' }
};

const FEATURES: Array<{
  icon: (props: { className?: string }) => JSX.Element;
  title: string;
  body: string;
  status: FeatureStatus;
}> = [
    {
      icon: TraceIcon,
      title: 'Custom Event Ingestion',
      body: 'Track checkout workflows, transactional processes, and engagement logs with arbitrary metadata. Single or batched.',
      status: 'live'
    },
    {
      icon: FunnelIcon,
      title: 'Funnel Drop-off Analysis',
      body: 'Build multi-step funnels, see exactly which step bleeds users, and compare conversion across device variants.',
      status: 'live'
    },
    {
      icon: UserIcon,
      title: 'High-Fidelity Timelines',
      body: 'Drill into a single user and read the exact sequence of actions that preceded a failed checkout or API timeout.',
      status: 'live'
    },
    {
      icon: RetentionIcon,
      title: 'Retention & Cohorts',
      body: 'Group users by behaviour or property, then watch how each cohort retains week over week.',
      status: 'live'
    },
    {
      icon: FlagIcon,
      title: 'Feature Flags',
      body: 'Evaluate flags from the SDK and tie every rollout directly to the conversion metrics it moved.',
      status: 'live'
    },
    {
      icon: BellIcon,
      title: 'Alerts & Webhooks',
      body: 'Fire a webhook the moment a metric crosses a threshold. Test the delivery before you depend on it.',
      status: 'live'
    },
    {
      icon: AlertIcon,
      title: 'Error Tracking & Context',
      body: 'Capture front-end exceptions with stack traces attached to the behavioural trail that produced them.',
      status: 'live'
    },
    {
      icon: CpuIcon,
      title: 'AI Funnel Summaries',
      body: 'Turn a funnel into a written diagnosis of where friction is coming from, in plain language.',
      status: 'beta'
    },
    {
      icon: ReplayIcon,
      title: 'Session Replay',
      body: 'The pipeline abstraction is in place, with DOM snapshotting and playback landing next.',
      status: 'planned'
    }
  ];

const SDKS = [
  { name: 'JavaScript', install: 'npm i traceiq-sdk-js', href: 'https://www.npmjs.com/package/traceiq-sdk-js', registry: 'npm' },
  { name: 'React Native', install: 'npm i traceiq-react-native', href: 'https://www.npmjs.com/package/traceiq-react-native', registry: 'npm' },
  { name: 'Python', install: 'pip install traceiq-py', href: 'https://pypi.org/project/traceiq-py/', registry: 'PyPI' },
  { name: 'Rust', install: 'cargo add traceiq', href: 'https://crates.io/crates/traceiq', registry: 'crates.io' },
  { name: 'MCP Server', install: 'npx traceiq-mcp-server', href: 'https://www.npmjs.com/package/traceiq-mcp-server', registry: 'npm' }
];

interface LogEntry {
  id: string;
  time: string;
  type: 'sdk' | 'ingest' | 'error' | 'flag';
  message: string;
  payload?: Record<string, unknown>;
}

type SandboxTab = 'event' | 'user' | 'flags' | 'errors';

const TABS: Array<{ id: SandboxTab; label: string; accent: string }> = [
  { id: 'event', label: 'Track Event', accent: 'text-amber-400 border-b-amber-400' },
  { id: 'user', label: 'Identify User', accent: 'text-rose-400 border-b-rose-400' },
  { id: 'flags', label: 'Feature Flags', accent: 'text-indigo-400 border-b-indigo-400' },
  { id: 'errors', label: 'Error Capture', accent: 'text-red-400 border-b-red-400' }
];

/** Small inline "copy to clipboard" control used by the install snippets. */
// function CopyButton({ value, label }: { value: string; label: string }) {
//   const [copied, setCopied] = useState(false);

//   const copy = useCallback(async () => {
//     try {
//       await navigator.clipboard.writeText(value);
//       setCopied(true);
//     } catch {
//       // Clipboard is unavailable over plain http or when permission is denied.
//       // Silently no-op: the command is already visible and selectable.
//     }
//   }, [value]);

//   useEffect(() => {
//     if (!copied) return;
//     const timer = window.setTimeout(() => setCopied(false), 1600);
//     return () => window.clearTimeout(timer);
//   }, [copied]);

//   return (
//     <button
//       type="button"
//       onClick={copy}
//       aria-label={copied ? `${label} copied` : `Copy ${label}`}
//       className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 ${FOCUS_RING}`}
//     >
//       {copied ? <CheckIcon className="size-4 text-emerald-400" /> : <CopyIcon className="size-4" />}
//     </button>
//   );
// }

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">{eyebrow}</span>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">{title}</h2>
      {lede && <p className="mt-4 text-pretty text-sm text-zinc-400 sm:text-base">{lede}</p>}
    </div>
  );
}

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<SandboxTab>('event');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 'seed-1', time: '22:54:08', type: 'sdk', message: 'TraceIQ SDK loaded successfully.' },
    { id: 'seed-2', time: '22:54:09', type: 'ingest', message: 'Established connection to telemetry endpoint http://localhost:4000' }
  ]);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  useEffect(() => {
    // Scroll the console pane only — `scrollIntoView` on the whole page would
    // yank the viewport away from whatever the visitor was reading.
    const node = consoleEndRef.current;
    const pane = node?.parentElement;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [logs]);

  // Lock the page behind the mobile menu and let Escape dismiss it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const addLog = (type: LogEntry['type'], message: string, payload?: Record<string, unknown>) => {
    logIdRef.current += 1;
    const time = new Date().toTimeString().split(' ')[0];
    const newLog: LogEntry = { id: `log-${logIdRef.current}`, time, type, message, payload };
    setLogs((prev) => [...prev.slice(-14), newLog]); // Keep last 15 items
  };

  const simulateSDKEvent = () => {
    if (activeTab === 'event') {
      addLog('sdk', 'traceiq.track("purchase_completed")', {
        amount: 89.0,
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

  // const codeSnippets: Record<SandboxTab, string> = {
  //   event: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.track('purchase_completed', {\n  amount: 89.00,\n  currency: 'USD',\n  gateway: 'stripe'\n});`,
  //   user: `import { traceiq } from 'traceiq-sdk-js';\n\ntraceiq.identify('usr_9981', {\n  email: 'developer@example.com',\n  tier: 'enterprise'\n});`,
  //   flags: `import { traceiq } from 'traceiq-sdk-js';\n\nconst checkoutVariant = traceiq.getFeatureFlag(\n  'checkout-redesign'\n);\n\nif (checkoutVariant === 'v2-sleek-checkout') {\n  renderSleekCheckout();\n}`,
  //   errors: `import { traceiq } from 'traceiq-sdk-js';\n\ntry {\n  initiatePayment();\n} catch (error) {\n  traceiq.trackError(error, {\n    context: 'Checkout page failure'\n  });\n}`
  // };

  // const faqs = [
  //   {
  //     q: 'What is TraceIQ?',
  //     a: 'TraceIQ is an open-source, developer-first behavior intelligence platform for events, funnels, user timelines, and performance errors.'
  //   },
  //   {
  //     q: 'Does the browser SDK set cookies?',
  //     a: 'No, but it stores anonymous and session identifiers in first-party Web Storage. Operators must decide what notice or consent their implementation requires.'
  //   },
  //   {
  //     q: 'How does the SDK affect performance?',
  //     a: 'The current compiled browser client is under 25 KB before compression and sends event requests asynchronously. Measure its impact in your own application.'
  //   },
  //   {
  //     q: 'Can I self-host TraceIQ?',
  //     a: 'Absolutely! TraceIQ is architected with Docker and PostgreSQL. You can use our managed Cloud version for quick starts or deploy it on your own infrastructure (AWS, Vercel, Fly.io, etc.) for absolute data sovereignty.'
  //   }
  // ];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#050505] font-sans text-zinc-50 bg-grid-dots">
      {/* <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-zinc-50 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950"
      >
        Skip to content
      </a> */}

      {/* Background Glowing Blobs */}
      <div className="pointer-events-none absolute left-1/4 top-0 size-72 animate-pulse-slow rounded-full bg-white/5 glow-blob sm:size-96" />
      <div className="pointer-events-none absolute right-1/4 top-20 size-64 animate-float rounded-full bg-zinc-200/5 glow-blob sm:size-80" />
      <div className="pointer-events-none absolute left-1/3 top-1/3 size-80 animate-pulse-slow rounded-full bg-white/5 glow-blob sm:size-[30rem]" />

      {/* Header/Navbar */}
      {/* <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md"> */}
      {/* <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className={`flex shrink-0 items-center gap-3 rounded ${FOCUS_RING}`}>
            <img src="/brand/logo-white-no-bg.png" alt="TraceIQ" className="h-8 w-auto" />
          </a>

          <div className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`rounded text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 ${FOCUS_RING}`}
              >
                {link.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 rounded text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 ${FOCUS_RING}`}
            >
              <GithubIcon className="size-4" />
              GitHub
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                {VERSION}
              </span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/waitlist"
              className={`inline-flex h-9 items-center justify-center rounded-lg bg-zinc-50 px-4 text-sm font-medium text-zinc-950 shadow transition-all hover:bg-zinc-200 active:scale-[0.98] ${FOCUS_RING}`}
            >
              Start Free
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={`inline-flex size-10 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-50 lg:hidden ${FOCUS_RING}`}
            >
              {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </nav> */}

      {/* Mobile menu — the nav links were previously unreachable below `md`. */}
      {/* {menuOpen && (
          <div id="mobile-menu" className="border-t border-zinc-900 bg-zinc-950/95 backdrop-blur-md lg:hidden">
            <div className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-lg px-2 py-3 text-base font-medium text-zinc-300 transition-colors hover:bg-zinc-900/60 hover:text-zinc-50 ${FOCUS_RING}`}
                >
                  {link.label}
                </a>
              ))}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-2 py-3 text-base font-medium text-zinc-300 transition-colors hover:bg-zinc-900/60 hover:text-zinc-50 ${FOCUS_RING}`}
              >
                <GithubIcon className="size-4" />
                GitHub
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                  {VERSION}
                </span>
              </a>
            </div>
          </div>
        )}
      </header> */}

      <main id="main">
        {/* Hero Section — full screen, globe bleeds off the bottom edge */}
        {/* <section id="top" className="relative min-h-[100svh] w-full overflow-hidden"> */}
        {/* Globe layer: fills the whole hero. The sphere is pushed down in 3D
              inside the canvas, so the soft "top" is the sphere's own curved
              anti-aliased silhouette — not a clipped box edge. The section's
              overflow-hidden keeps it from bleeding into the sandbox below. */}
        {/* <div className="absolute inset-0">
            <GlobeHero />
          </div> */}

        {/* Soft atmospheric blend right where the dome's arc meets the text */}
        {/* <div
            className="pointer-events-none absolute inset-x-0 z-[5] blur-2xl"
            style={{
              top: '38%',
              height: '30%',
              background:
                'radial-gradient(ellipse 65% 100% at 50% 0%, rgba(5,5,5,0.9) 0%, rgba(5,5,5,0.5) 40%, rgba(5,5,5,0) 75%)'
            }}
          /> */}

        {/* Bottom fade so the globe eases into the content below it
              instead of cutting off hard at the section boundary */}
        {/* <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050505] to-transparent" /> */}

        {/* Copy layer */}
        {/* <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-start gap-5 px-5 pb-20 pt-28 text-center sm:gap-6 sm:px-6 sm:pt-36">
            <span className="pointer-events-auto rounded-full border border-zinc-700 bg-zinc-950/75 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-300 backdrop-blur-sm sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.24em]">
              Telemetry SDK under 25 KB
            </span>
            <h1 className="text-balance text-[2.5rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              See user journeys.
              <br />
              <span className="text-zinc-400">Solve conversion friction.</span>
            </h1>
            <p className="max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg lg:text-xl">
              TraceIQ records configured events, API response times, and errors, then compiles them into interactive
              timelines and conversion paths — the precise signals you need to build seamless product flows.
            </p>
            <div className="flex w-full max-w-xs flex-col gap-3 pt-1 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
              <a
                href="/waitlist"
                className={`pointer-events-auto inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-zinc-950 shadow-lg shadow-zinc-950/10 transition hover:bg-zinc-100 active:scale-95 ${FOCUS_RING}`}
              >
                Get Started Free
              </a>
              <a
                href="#sandbox"
                className={`pointer-events-auto inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/80 px-6 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50 ${FOCUS_RING}`}
              >
                Try SDK Live
              </a>
            </div>
            <div className="pointer-events-auto mt-1 flex w-full max-w-xs items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 py-1.5 pl-4 pr-1.5 backdrop-blur-sm sm:w-auto sm:max-w-none">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-zinc-400 sm:text-sm">
                <span className="select-none text-zinc-600">$ </span>npm i traceiq-sdk-js
              </code>
              <CopyButton value="npm i traceiq-sdk-js" label="install command" />
            </div>
          </div>
        </section> */}

        {/* Interactive SDK Sandbox Section */}
        {/* <section
          id="sandbox"
          className="relative mx-auto max-w-7xl scroll-mt-20 border-t border-zinc-900 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        >
          <SectionHeading
            eyebrow="Interactive demo"
            title="One script. Real-time telemetry."
            lede="Switch between telemetry snippets, run them live, and watch the raw payload stream from the client straight into the trace ingestion pipeline."
          /> */}

        {/* <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:gap-8"> */}
        {/* Mock IDE Card */}
        {/* <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full bg-rose-500/80" />
                  <span className="size-3 shrink-0 rounded-full bg-amber-500/80" />
                  <span className="size-3 shrink-0 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 truncate font-mono text-xs text-zinc-500">app/trace-test.ts</span>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded border border-zinc-800/60 bg-zinc-950 px-2 py-0.5">
                  <CodeIcon className="size-3.5 text-zinc-500" />
                  <span className="font-mono text-[10px] text-zinc-500">TypeScript</span>
                </div>
              </div> */}

        {/* Tabs — 2×2 on phones so the labels never crush */}
        {/* <div
                role="tablist"
                aria-label="SDK examples"
                className="grid grid-cols-2 border-b border-zinc-800/80 bg-zinc-950/40 font-mono text-xs text-zinc-400 sm:grid-cols-4"
              >
                {TABS.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="sandbox-snippet"
                      onClick={() => setActiveTab(tab.id)}
                      className={`border-b-2 border-r border-zinc-800/60 px-1 py-3 text-center transition-all last:border-r-0 sm:py-2 ${
                        selected ? `bg-zinc-900/40 ${tab.accent}` : 'border-b-transparent hover:bg-zinc-900/20'
                      } ${FOCUS_RING}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div> */}

        {/* <div
                id="sandbox-snippet"
                className="flex-1 overflow-x-auto whitespace-pre bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed text-zinc-300 sm:p-6 sm:text-sm"
              >
                {codeSnippets[activeTab]}
              </div>

              <div className="flex flex-col gap-3 border-t border-zinc-800/80 bg-zinc-900/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="font-mono text-xs text-zinc-500">SDK simulation ready.</span>
                <button
                  type="button"
                  onClick={simulateSDKEvent}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded bg-zinc-50 px-4 text-xs font-semibold text-zinc-950 shadow transition-all hover:bg-zinc-200 active:scale-95 sm:h-9 ${FOCUS_RING}`}
                >
                  <TraceIcon className="size-4" />
                  Fire Telemetry Event
                </button>
              </div>
            </div> */}

        {/* Console Log Terminal */}
        {/* <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <TerminalIcon className="size-4 shrink-0 text-zinc-400" />
                  <span className="truncate font-mono text-xs font-medium text-zinc-300">
                    <span className="sm:hidden">Ingest Console</span>
                    <span className="hidden sm:inline">TraceIQ Ingest Engine Console</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className={`shrink-0 rounded border border-zinc-800 bg-zinc-900/30 px-2 py-1 font-mono text-[10px] text-zinc-500 transition-all hover:text-zinc-300 ${FOCUS_RING}`}
                >
                  Clear Log
                </button>
              </div>

              <div
                aria-live="polite"
                aria-label="Ingest console output"
                className="custom-scrollbar max-h-[300px] flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs sm:max-h-[360px]"
              >
                {logs.length === 0 && (
                  <p className="py-8 text-center text-zinc-600">
                    Console cleared. Fire an event to stream telemetry.
                  </p>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-zinc-900/80 pb-2">
                    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                      <span className="shrink-0 font-medium text-zinc-600">[{log.time}]</span>
                      {log.type === 'sdk' && <span className="shrink-0 text-amber-400">[SDK]</span>}
                      {log.type === 'ingest' && <span className="shrink-0 text-emerald-400">[INGEST]</span>}
                      {log.type === 'flag' && <span className="shrink-0 text-indigo-400">[FLAG]</span>}
                      {log.type === 'error' && <span className="shrink-0 font-bold text-red-500">[ERROR]</span>}
                      <span className="min-w-0 break-words text-zinc-200">{log.message}</span>
                    </div>
                    {log.payload && (
                      <pre className="mt-1 overflow-x-auto rounded border border-zinc-900 bg-zinc-900/50 p-2 text-[11px] text-zinc-400 sm:ml-10">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>
        </section> */}

        {/* SDKs Section */}
        {/* <section
          id="sdks"
          className="relative mx-auto max-w-7xl scroll-mt-20 border-t border-zinc-900 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        >
          <SectionHeading
            eyebrow="Install anywhere"
            title="An SDK for every runtime you ship."
            lede="Published and versioned on the registries your team already pulls from."
          />

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SDKS.map((sdk) => (
              <div
                key={sdk.name}
                className="group flex items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-900/10 p-4 transition-colors hover:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={sdk.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded text-sm font-semibold text-zinc-100 transition-colors hover:text-white ${FOCUS_RING}`}
                    >
                      {sdk.name}
                    </a>
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                      {sdk.registry}
                    </span>
                  </div>
                  <code className="mt-1.5 block overflow-x-auto whitespace-nowrap font-mono text-xs text-zinc-500">
                    {sdk.install}
                  </code>
                </div>
                <CopyButton value={sdk.install} label={`${sdk.name} install command`} />
              </div>
            ))}
          </div>
        </section> */}

        {/* Bento Grid Features Section */}
        <section
          id="features"
          className="relative mx-auto max-w-7xl scroll-mt-20 border-t border-zinc-900 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        >
          <SectionHeading
            eyebrow="Platform"
            title="Engineered for modern web telemetry."
            lede="A comprehensive suite of analytics tools unified inside a single telemetry pipeline."
          />

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const status = STATUS_STYLES[feature.status];
              return (
                <div
                  key={feature.title}
                  className="group relative flex flex-col rounded-xl border border-zinc-900 bg-zinc-900/10 p-5 backdrop-blur-sm transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-900/20 sm:p-6"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 transition-colors group-hover:border-zinc-500/50">
                      <Icon className="size-5" />
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-100">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ Section */}
        {/* <section
          id="faq"
          className="relative mx-auto max-w-4xl scroll-mt-20 border-t border-zinc-900 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        >
          <SectionHeading eyebrow="Answers" title="Frequently asked questions" />

          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = expandedFaq === index;
              return (
                <div key={faq.q} className="overflow-hidden rounded-xl border border-zinc-900 bg-zinc-900/10">
                  <h3>
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpen ? null : index)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${index}`}
                      className={`flex w-full items-center justify-between gap-4 p-4 text-left text-sm font-medium text-zinc-200 transition-colors hover:text-white sm:p-5 sm:text-base ${FOCUS_RING}`}
                    >
                      <span className="text-pretty">{faq.q}</span>
                      <ChevronIcon className="size-5 shrink-0 text-zinc-500" open={isOpen} />
                    </button>
                  </h3>
                  {isOpen && (
                    <div
                      id={`faq-panel-${index}`}
                      className="border-t border-zinc-900/50 bg-zinc-950/20 p-4 text-sm leading-relaxed text-zinc-400 sm:p-5"
                    >
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section> */}

        {/* Call to Action Section */}
        {/* <section className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/20 px-5 py-10 text-center shadow-2xl backdrop-blur sm:px-8 sm:py-14">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-white/5" />
            <div className="relative">
              <h2 className="text-balance text-2xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
                Ready to trace client conversion behavior?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-zinc-400 sm:text-base">
                Integrate the TraceIQ script in under 5 minutes. Capture telemetry signals, diagnose conversion
                failures, and scale seamlessly.
              </p>
              <div className="mx-auto mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
                <a
                  href="/waitlist"
                  className={`inline-flex h-11 items-center justify-center rounded-lg bg-zinc-50 px-6 text-sm font-semibold text-zinc-950 shadow transition-all hover:bg-zinc-200 active:scale-[0.98] ${FOCUS_RING}`}
                >
                  Sign Up For Free
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-6 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-900 ${FOCUS_RING}`}
                >
                  <GithubIcon className="size-4" />
                  Self-host on GitHub
                </a>
              </div>
            </div>
          </div>
        </section> */}
      </main>

      {/* Footer */}
      {/* <footer className="mt-8 border-t border-zinc-900 bg-zinc-950/60 py-12 sm:mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <img src="/brand/logo-white-no-bg.png" alt="TraceIQ" className="h-6 w-auto" />
              <p className="mt-4 max-w-xs text-sm text-zinc-500">
                Developer-first behavior intelligence for web and mobile.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Product</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-500">
                <li><a href="#features" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>Features</a></li>
                <li><a href="#sandbox" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>Live Demo</a></li>
                <li><a href="#sdks" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>SDKs</a></li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Resources</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-500">
                <li><a href="/docs" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>Docs</a></li>
                <li><a href="#faq" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>FAQ</a></li>
                <li>
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>
                    GitHub
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Get started</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-500">
                <li><a href="/waitlist" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>Start free</a></li>
                <li><a href="/auth/login" className={`rounded transition-colors hover:text-zinc-300 ${FOCUS_RING}`}>Sign in</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-zinc-900 pt-6 font-mono text-xs text-zinc-600 sm:flex-row">
            <span>&copy; {new Date().getFullYear()} TraceIQ Analytics, Inc. All rights reserved.</span>
            <span>{VERSION}</span>
          </div>
        </div>
      </footer> */}
    </div>
  );
}
