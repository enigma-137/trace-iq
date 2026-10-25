'use client';

import React, { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { codeToHtml } from 'shiki';

export interface SdkIntegration {
  id: string;
  label: string;
  shortLabel?: string;
  badge: string;
  language: string;
  shikiLang: string;
  install: string;
  code: string;
  docsUrl: string;
  repositoryUrl?: string;
  icon: React.ReactNode;
}

// Crisp, developer-focused vector icons for every supported SDK
const SdkIcons = {
  Node: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M12 2a1.5 1.5 0 0 0-.75.2l-7.5 4.33A1.5 1.5 0 0 0 3 7.83v8.66a1.5 1.5 0 0 0 .75 1.3l7.5 4.33a1.5 1.5 0 0 0 1.5 0l7.5-4.33A1.5 1.5 0 0 0 21 16.5V7.83a1.5 1.5 0 0 0-.75-1.3L12.75 2.2A1.5 1.5 0 0 0 12 2zm0 2.31 6 3.46v6.93l-6 3.46-6-3.46V7.77l6-3.46zM11 8v8h2V8h-2z" />
    </svg>
  ),
  JavaScript: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M3 3h18v18H3V3zm13.12 14.5c1.47 0 2.38-.75 2.38-2.03 0-1.37-.96-1.85-2.22-2.34l-.45-.18c-.7-.27-1-.58-1-1.03 0-.47.38-.85 1.05-.85.67 0 1.08.3 1.25.75l1.37-.87c-.42-.92-1.32-1.39-2.58-1.39-1.42 0-2.39.86-2.39 2.11 0 1.25.86 1.79 2.05 2.24l.45.17c.8.31 1.17.61 1.17 1.12 0 .54-.48.96-1.28.96-.92 0-1.47-.48-1.7-1.12l-1.42.75c.39 1.16 1.48 1.87 2.57 1.87zm-6.26-.14c.4 0 .78-.05 1.14-.15V9.72h-1.63v6.15c-.25.13-.5.18-.76.18-.54 0-.82-.28-.82-.85V9.72H3.16v5.6c0 1.44.82 2.04 2.08 2.04.42 0 .97-.08 1.62-.22z" />
    </svg>
  ),
  React: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  ),
  Python: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M11.91 2c-4.8 0-4.5 2.08-4.5 2.08l.01 2.16h4.58v.65H5.6s-3.6.41-3.6 5.25c0 4.85 3.14 4.69 3.14 4.69h1.88v-2.64s-.1-3.14 3.09-3.14h5.3v-.78c0-1.15-.97-2.07-2.12-2.07H8.84V6.74s-.26-2.6 4.95-2.6c5.21 0 4.5 4.47 4.5 4.47v1.7h-1.88V8.16s0-2.08-2.65-2.08c-2.65 0-2.65 2.08-2.65 2.08v.65h6.77s3.12-.34 3.12 4.45c0 4.8-2.73 4.8-2.73 4.8h-1.74v-1.92s.13-2.63-2.58-2.63H9.42v1.44c0 .87.71 1.57 1.58 1.57h3.76s2.5.07 2.5 2.76c0 2.68-2.34 2.68-2.34 2.68H9.37s-4.63.48-4.63-4.43c0-4.9 4.04-4.72 4.04-4.72h5.72v-.65H7.73v-1.7s0-2.6 4.18-2.6h3.4zM9.8 4.2a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4zm4.4 14.2a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4z" />
    </svg>
  ),
  PHP: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M12 3C6.5 3 2 7 2 12s4.5 9 10 9 10-4 10-9-4.5-9-10-9zm-4.7 12.3H5.7l1.4-6.6h2.2c1.4 0 2.2.6 1.9 2-.4 1.7-1.5 2.5-2.9 2.5H7.7l-.4 2.1zm1.2-3.6h.7c.6 0 1.1-.3 1.2-.9.2-.6-.1-.9-.7-.9h-.7l-.5 1.8zm4.7 3.6h-1.6l1.4-6.6h1.6l-.6 2.6h2c1.4 0 2.2.6 1.9 2-.4 1.7-1.5 2.5-2.9 2.5h-1.4l-.4 2.1zm1.2-3.6h.7c.6 0 1.1-.3 1.2-.9.2-.6-.1-.9-.7-.9h-.7l-.5 1.8zm6.5-1.5l.8-3.5h1.6l-.8 3.5c-.3 1.3-.9 2.1-1.9 2.6-.9.5-2 .5-2.8.1l.6-1.5c.5.2 1.1.2 1.6 0 .5-.3.8-.7.9-1.2h-.2z" />
    </svg>
  ),
  Flutter: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M14.2 2.2 4.6 11.8l2.9 2.9L19.9 2.2h-5.7zm-2.8 11.2-3 3 5.4 5.4h5.7l-8.1-8.4zm5.8 0-2.8 2.8 2.8 2.8 2.8-2.8-2.8-2.8z" />
    </svg>
  ),
  Rust: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1.6 4.8h2.8a2.6 2.6 0 0 1 2.6 2.6 2.5 2.5 0 0 1-1.7 2.4l2 4.2h-2.3l-1.7-3.6h-1.7v3.6h-2V6.8h2zm0 3.8h.8a.9.9 0 0 0 1-.9.9.9 0 0 0-1-.9h-.8v1.8zM8.2 16V6.8h2.2V16H8.2z" />
    </svg>
  ),
  Swift: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M20.9 17.6c-.1.2-.5.5-.8.8-2.5 2.4-6 3.6-9.6 3.1 5.2-3.1 7.2-7.8 7.3-8 .1-.2.1-.4 0-.6-.1-.2-.3-.3-.5-.3-2.1.8-4.5.9-6.7.3 4.1-2.4 6-5.8 6.5-7.7.1-.3 0-.6-.3-.7-.2-.1-.5 0-.7.2-2.8 2.9-6.3 4.5-10.2 4.7-.2 0-.4.2-.4.4 0 .2.1.4.3.5 1.5.8 3.1 1.3 4.8 1.4-3.9.7-7.2 2.9-8.8 6.2-.1.2-.1.4 0 .6.1.2.3.3.5.3 4.8.7 9.8-.7 13.5-3.8 2 1.3 3.9 2.2 4.4 2.9z" />
    </svg>
  ),
  Kotlin: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M21 3H3v18h18l-9-9 9-9zM3 3l9 9-9 9V3z" />
    </svg>
  ),
  Rest: (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" />
    </svg>
  ),
};

export const SDK_INTEGRATIONS: SdkIntegration[] = [
  {
    id: 'node',
    label: 'Node.js',
    shortLabel: 'Node',
    badge: 'Node.js',
    language: 'TypeScript',
    shikiLang: 'ts',
    install: 'npm install traceiq-node',
    docsUrl: '/docs?page=node',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/packages/node',
    icon: SdkIcons.Node,
    code: `import { TraceIQ } from 'traceiq-node';

const traceiq = new TraceIQ({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: process.env.TRACEIQ_WRITE_KEY!,
  endpoint: 'https://api.traceiq.dev',
});

// Identify user and associate traits
traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });

// Record backend conversion event
traceiq.capture({
  event: 'user_signed_up',
  userId: 'user_123',
  properties: { plan: 'pro', source: 'landing_page' },
});

await traceiq.shutdown();`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    shortLabel: 'JS / TS',
    badge: 'Browser JS / TS',
    language: 'TypeScript',
    shikiLang: 'ts',
    install: 'npm install traceiq-sdk-js',
    docsUrl: '/docs?page=javascript',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/packages/sdk-js',
    icon: SdkIcons.JavaScript,
    code: `import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: 'https://api.traceiq.dev',
});

// Identify user session
traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });

// Track first event with properties
traceiq.track('user_signed_up', {
  plan: 'pro',
  source: 'landing_page',
});`,
  },
  {
    id: 'react-native',
    label: 'React Native',
    shortLabel: 'React Native',
    badge: 'React Native',
    language: 'TypeScript',
    shikiLang: 'ts',
    install: 'npm install traceiq-react-native',
    docsUrl: '/docs?page=react-native',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/packages/react-native',
    icon: SdkIcons.React,
    code: `import { traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: 'https://api.traceiq.dev',
  appVersion: '1.0.0',
});

traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });
traceiq.capture({
  event: 'user_signed_up',
  properties: { plan: 'pro', source: 'landing_page' },
});`,
  },
  {
    id: 'python',
    label: 'Python',
    shortLabel: 'Python',
    badge: 'Python',
    language: 'Python',
    shikiLang: 'python',
    install: 'pip install traceiq-py',
    docsUrl: '/docs?page=python',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/sdks/python',
    icon: SdkIcons.Python,
    code: `from traceiq import Client

traceiq = Client(
    project_id="YOUR_PROJECT_ID",
    write_key="YOUR_PROJECT_WRITE_KEY",
    endpoint="https://api.traceiq.dev",
)

traceiq.capture(
    "user_signed_up",
    user_id="user_123",
    properties={"plan": "pro", "source": "landing_page"},
)

traceiq.shutdown()`,
  },
  {
    id: 'php',
    label: 'PHP',
    shortLabel: 'PHP',
    badge: 'PHP',
    language: 'PHP',
    shikiLang: 'php',
    install: 'composer require traceiq/traceiq-php',
    docsUrl: '/docs?page=php',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq',
    icon: SdkIcons.PHP,
    code: `use TraceIQ\\Client;

$traceiq = new Client(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_PROJECT_WRITE_KEY",
    endpoint: "https://api.traceiq.dev",
);

$traceiq->capture(
    event: "user_signed_up",
    userId: "user_123",
    properties: ["plan" => "pro", "source" => "landing_page"],
);

$traceiq->shutdown();`,
  },
  {
    id: 'flutter',
    label: 'Flutter',
    shortLabel: 'Flutter',
    badge: 'Flutter',
    language: 'Dart',
    shikiLang: 'dart',
    install: 'flutter pub add traceiq_flutter',
    docsUrl: '/docs?page=flutter',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/packages/sdk-flutter',
    icon: SdkIcons.Flutter,
    code: `import 'package:traceiq_flutter/traceiq.dart';

await TraceIQ.initialize(
  projectId: 'YOUR_PROJECT_ID',
  apiKey: 'YOUR_PROJECT_WRITE_KEY',
  apiUrl: 'https://api.traceiq.dev',
);

await TraceIQ.identify('user_123', traits: {'plan': 'pro'});
await TraceIQ.track('user_signed_up', properties: {
  'plan': 'pro',
  'source': 'landing_page',
});`,
  },
  {
    id: 'rust',
    label: 'Rust',
    shortLabel: 'Rust',
    badge: 'Rust',
    language: 'Rust',
    shikiLang: 'rust',
    install: 'cargo add traceiq',
    docsUrl: '/docs?page=rust',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/sdks/rust',
    icon: SdkIcons.Rust,
    code: `use traceiq::Client;
use serde_json::json;

let mut traceiq = Client::new("YOUR_PROJECT_ID", "YOUR_PROJECT_WRITE_KEY");

traceiq.capture(
    "user_signed_up",
    Some("user_123"),
    None,
    Some(json!({ "plan": "pro", "source": "landing_page" })),
    None,
    None,
);

traceiq.shutdown();`,
  },
  {
    id: 'swift',
    label: 'Swift',
    shortLabel: 'Swift',
    badge: 'Swift (iOS/macOS)',
    language: 'Swift',
    shikiLang: 'swift',
    install: 'swift package add traceiq',
    docsUrl: '/docs?page=swift',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/sdks/swift',
    icon: SdkIcons.Swift,
    code: `import TraceIQ

let traceiq = TraceIQ(config: .init(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_PROJECT_WRITE_KEY",
    endpoint: "https://api.traceiq.dev"
))

traceiq.identify(userId: "user_123", traits: ["plan": "pro"])
traceiq.capture(
    "user_signed_up",
    userId: "user_123",
    properties: ["plan": "pro", "source": "landing_page"]
)`,
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    shortLabel: 'Kotlin',
    badge: 'Kotlin (Android/JVM)',
    language: 'Kotlin',
    shikiLang: 'kotlin',
    install: 'implementation("run.traceiq:traceiq:0.1.0")',
    docsUrl: '/docs?page=kotlin',
    repositoryUrl: 'https://github.com/trace-iq/trace-iq/tree/main/sdks/kotlin',
    icon: SdkIcons.Kotlin,
    code: `import com.traceiq.TraceIQ
import com.traceiq.TraceIQConfig

val traceiq = TraceIQ(TraceIQConfig(
    projectId = "YOUR_PROJECT_ID",
    writeKey = "YOUR_PROJECT_WRITE_KEY",
    endpoint = "https://api.traceiq.dev",
))

traceiq.identify("user_123", traits = mapOf("plan" to "pro"))
traceiq.capture(
    "user_signed_up",
    userId = "user_123",
    properties = mapOf("plan" to "pro", "source" to "landing_page")
)`,
  },
  {
    id: 'rest',
    label: 'REST API',
    shortLabel: 'cURL / REST',
    badge: 'Direct HTTP Ingestion',
    language: 'Bash',
    shikiLang: 'bash',
    install: 'curl -X POST https://api.traceiq.dev/v1/events',
    docsUrl: '/docs?page=ingestion',
    icon: SdkIcons.Rest,
    code: `curl -X POST https://api.traceiq.dev/v1/events \\
  -H "Content-Type: application/json" \\
  -H "x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "userId": "user_123",
    "eventName": "user_signed_up",
    "properties": {
      "plan": "pro",
      "source": "landing_page"
    }
  }'`,
  },
];

export function LandingSdkSection() {
  const [activeSdkId, setActiveSdkId] = useState<string>('node');
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);

  const activeSdk = SDK_INTEGRATIONS.find((sdk) => sdk.id === activeSdkId) || SDK_INTEGRATIONS[0];
  const lines = activeSdk.code.trim().split('\n');

  // Syntax highlighting with Shiki and fallback
  useEffect(() => {
    let active = true;
    codeToHtml(activeSdk.code, {
      lang: activeSdk.shikiLang,
      theme: 'github-dark',
    })
      .then((html) => {
        if (active) setHighlightedHtml(html);
      })
      .catch(() => {
        if (active) setHighlightedHtml(null);
      });

    return () => {
      active = false;
    };
  }, [activeSdk.code, activeSdk.shikiLang]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeSdk.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(activeSdk.install);
      setCopiedInstall(true);
      setTimeout(() => setCopiedInstall(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <section className="traceiq-frame section mx-auto max-w-[1180px] px-5 py-24 sm:px-8 lg:py-32" id="docs">
      {/* Header */}
      <div className="section-kicker">02 / Meet your stack</div>
      <div className="sdk-heading flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10">
        <div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Instrument once.<br />
            <em className="italic font-serif font-normal text-zinc-400">See everything.</em>
          </h2>
        </div>
        <p className="max-w-md text-sm sm:text-base leading-relaxed text-zinc-400 font-normal">
          Start tracking events, users, errors, revenue, and product activity in minutes. Drop a few lines of code into your favorite language or framework.
        </p>
      </div>

      {/* Horizontal SDK Selector */}
      <div className="relative mt-2 mb-8">
        <div
          role="tablist"
          aria-label="Supported SDKs and languages"
          className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-3 pt-2 scrollbar-none focus:outline-none [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {SDK_INTEGRATIONS.map((sdk) => {
            const isActive = sdk.id === activeSdkId;
            return (
              <button
                key={sdk.id}
                role="tab"
                id={`sdk-tab-${sdk.id}`}
                aria-selected={isActive}
                aria-controls={`sdk-panel-${sdk.id}`}
                onClick={() => setActiveSdkId(sdk.id)}
                className={`group flex flex-col items-center gap-2.5 rounded-xl border px-3.5 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 outline-none select-none flex-shrink-0 min-w-[76px] sm:min-w-[84px] text-center ${
                  isActive
                    ? 'border-white/40 bg-white/[0.07] text-white shadow-sm'
                    : 'border-white/10 bg-[#0c0d0e]/60 text-zinc-400 hover:border-white/20 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                <div
                  className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg border transition-all ${
                    isActive
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-zinc-400 group-hover:text-zinc-200 group-hover:border-white/20'
                  }`}
                >
                  {sdk.icon}
                </div>
                <span className={`text-[12px] sm:text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors ${
                  isActive ? 'text-white font-semibold' : 'text-zinc-400 group-hover:text-zinc-300'
                }`}>
                  {sdk.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Polished Code Viewer Box */}
      <div
        id={`sdk-panel-${activeSdk.id}`}
        role="tabpanel"
        aria-labelledby={`sdk-tab-${activeSdk.id}`}
        className="overflow-hidden rounded-2xl border border-white/10 bg-[#09090b] shadow-2xl transition-all"
      >
        {/* Code Panel Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d0e11] px-4 sm:px-6 py-3.5">
          {/* Active Badge & Language */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]/80" />
            </div>
            <div className="h-4 w-[1px] bg-white/10 mx-0.5 hidden sm:block" />
            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-mono font-medium text-zinc-200">
              <span className="text-zinc-400">{activeSdk.icon}</span>
              <span>{activeSdk.badge}</span>
            </div>
          </div>

          {/* Quick Install Pill + Copy Code Button */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {activeSdk.install && (
              <button
                type="button"
                onClick={copyInstall}
                title="Click to copy install command"
                className="hidden sm:inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1 font-mono text-[11px] text-zinc-400 hover:border-white/25 hover:text-zinc-200 transition-colors"
              >
                <span className="text-zinc-600 select-none">$</span>
                <span className="truncate max-w-[220px]">{activeSdk.install}</span>
                {copiedInstall ? (
                  <HugeiconsIcon icon={Tick02Icon} size={13} className="text-emerald-400" />
                ) : (
                  <HugeiconsIcon icon={Copy01Icon} size={13} className="text-zinc-500" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={copyCode}
              aria-label="Copy snippet code"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-sans font-medium text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white transition-all active:scale-95"
            >
              {copiedCode ? (
                <>
                  <HugeiconsIcon icon={Tick02Icon} size={13} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Copy01Icon} size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Body with Line Numbers & Shiki Syntax Highlighting */}
        <div className="relative overflow-x-auto p-4 sm:p-6 text-[13px] leading-relaxed font-mono">
          <div className="flex min-w-full">
            {/* Line numbers gutter */}
            <div
              className="flex flex-col pr-4 sm:pr-6 text-right select-none font-mono text-xs text-zinc-600 border-r border-white/5"
              aria-hidden="true"
            >
              {lines.map((_, i) => (
                <span key={i} className="leading-relaxed">
                  {i + 1}
                </span>
              ))}
            </div>

            {/* Code Content */}
            <div className="flex-1 pl-4 sm:pl-6 overflow-x-auto">
              {highlightedHtml ? (
                <div
                  className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!font-mono [&_.shiki]:!bg-transparent text-zinc-200"
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : (
                <pre className="m-0 p-0 font-mono text-zinc-200 whitespace-pre">
                  <code>{activeSdk.code}</code>
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Code Panel Footer with Documentation and GitHub links */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#0d0e11] px-4 sm:px-6 py-3.5 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-4">
            <a
              href={activeSdk.docsUrl}
              className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              <span>View documentation</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
            </a>

            {activeSdk.repositoryUrl && (
              <>
                <span className="text-zinc-600 select-none" aria-hidden="true">·</span>
                <a
                  href={activeSdk.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors underline-offset-4 hover:underline"
                >
                  <span>View on GitHub</span>
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
                </a>
              </>
            )}
          </div>

          <span className="text-zinc-500 text-[11px]">
            Production ready · Zero latency overhead
          </span>
        </div>
      </div>

      {/* Feature Capability Badges */}
      <div className="sdk-pills flex flex-wrap gap-2.5 sm:gap-3 mt-8">
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-zinc-400 font-mono">Web Vitals</span>
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-zinc-400 font-mono">Exception capture</span>
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-zinc-400 font-mono">User timelines &amp; identities</span>
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-zinc-400 font-mono">Automated batching &amp; retries</span>
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-zinc-400 font-mono">Zero lock-in</span>
      </div>
    </section>
  );
}
