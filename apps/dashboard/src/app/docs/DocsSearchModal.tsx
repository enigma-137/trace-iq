'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import BookOpen02Icon from '@hugeicons/core-free-icons/BookOpen02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CornerDownLeftIcon from '@hugeicons/core-free-icons/CornerDownLeftIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import type { DocsTocItem } from './toc';

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: DocsTocItem[];
  basePath: string;
}

const SECTION_DESCRIPTIONS: Record<string, string> = {
  welcome: 'Overview of TraceIQ behavior intelligence platform and docs structure.',
  quickstart: 'Install JS SDK, initialize write keys, and send your first event.',
  methods: 'traceiq.identify, alias, track, page, group, and captureException API reference.',
  config: 'SDK initialization parameters, flush intervals, and batch options.',
  autocapture: 'Automatic click tracking, page views, and rage click detection.',
  'self-hosting': 'One-command local setup, production deployment, auth modes, backups, migrations, and upgrades.',
  javascript: 'Browser analytics, autocapture, identity, page views, errors, and batching.',
  flutter: 'Flutter analytics for Android, iOS, web, macOS, Windows, and Linux.',
  node: 'Node.js server SDK for backend tracking and service instrumentation.',
  'react-native': 'React Native mobile app analytics and session tracking.',
  python: 'Python server SDK with background batching and retries.',
  swift: 'Swift SDK for Apple platforms and server-side Swift.',
  kotlin: 'Kotlin SDK for Android and JVM applications.',
  rust: 'Rust SDK with thread-safe background batching.',
  php: 'PHP SDK with synchronous batching and shutdown flushing.',
  'web-analytics': 'Realtime visitors, referrers, UTM campaigns, goals, journeys, filters, and Web Vitals.',
  insights: 'Saved charts: trends, KPIs, measures, breakdowns, comparison and chart types.',
  funnels: 'Ordered conversion steps, drop-off, who reached or dropped, and debugging zero steps.',
  retention: 'Weekly cohort grid of returning users, segments and how to read it.',
  cohorts: 'Saved filter sets for segmenting users by country, device, plan or any property.',
  achievements: 'Workspace milestones, progress and share cards.',
  flags: 'Percentage rollouts, user targeting segments, and remote config.',
  experiments: 'A/B tests: variants, traffic split, exposures, conversion, uplift and significance.',
  surveys: 'In-app NPS, rating and feedback surveys: targeting, SDK calls and results.',
  'synthetic-monitors': 'Scheduled Playwright browser checks, secrets, run diagnostics and pull-request CI runs.',
  alerts: 'Rolling window metric monitors, threshold triggers, and webhooks.',
  dashboards: 'Saved side-by-side insight views with custom date filters.',
  'public-sharing': 'Permission-scoped public dashboard links and revocation guidance.',
  'api-performance': 'Endpoint latency (p95), error rates, and traffic metrics.',
  logs: 'Send structured logs from your app with traceiq.log().',
  links: 'Branded /l/<slug> redirects that record each click as a $link_click event.',
  webhooks: 'Real-time HTTP event forwarders with HMAC signature verification.',
  export: 'Download raw event payloads via CSV, JSON, or Export API.',
  events: 'Reserved event conventions ($page, $identify, $alias, $rageclick, etc.).',
  features: 'Complete feature breakdown and capability guide.',
  ingestion: 'Raw HTTP POST ingestion endpoint specification.',
  cli: 'traceiq-cli: setup wizard, projects, env pull, and tailing logs and events from the terminal.',
  mcp: 'Model Context Protocol (MCP) server for Claude Desktop & Cursor.'
};

export function DocsSearchModal({ isOpen, onClose, sections, basePath }: DocsSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Lock body scroll and set up ESC handler
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Filter sections by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter((s) => {
      const labelMatch = s.label.toLowerCase().includes(q);
      const catMatch = s.category.toLowerCase().includes(q);
      const descMatch = (SECTION_DESCRIPTIONS[s.id] ?? '').toLowerCase().includes(q);
      return labelMatch || catMatch || descMatch;
    });
  }, [query, sections]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (sectionId: string) => {
    router.push(`${basePath}?page=${sectionId}`);
    onClose();
  };

  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex].id);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        {/* Search Header */}
        <div className="relative flex items-center border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
          <HugeiconsIcon icon={Search01Icon} size={20} className="shrink-0 text-neutral-400 dark:text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDownInput}
            placeholder="Search documentation, SDKs, topics..."
            className="w-full bg-transparent px-3 py-1 text-sm font-medium text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-slate-500"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mr-2 rounded p-1 text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400 dark:text-slate-500">
              No documentation pages found for &ldquo;<span className="font-semibold text-neutral-700 dark:text-slate-300">{query}</span>&rdquo;
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((item, index) => {
                const isSelected = index === selectedIndex;
                const desc = SECTION_DESCRIPTIONS[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex cursor-pointer items-start justify-between rounded-lg px-3.5 py-2.5 transition-colors ${isSelected
                        ? 'dark:bg-cyan-950/40 border border-blue-200 dark:border-cyan-500/30'
                        : 'border border-transparent hover:bg-neutral-50 dark:hover:bg-slate-900/60'
                      }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 rounded-md p-1.5 ${isSelected ? 'bg-blue-600 text-white dark:bg-cyan-500 dark:text-slate-950' : 'bg-neutral-100 text-neutral-500 dark:bg-slate-900 dark:text-slate-400'}`}>
                        <HugeiconsIcon icon={BookOpen02Icon} size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${isSelected ? 'text-blue-600 dark:text-cyan-400' : 'text-neutral-900 dark:text-white'}`}>
                            {item.label}
                          </span>
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-slate-900 dark:text-slate-400">
                            {item.category}
                          </span>
                        </div>
                        {desc ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-slate-400">
                            {desc}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {isSelected ? (
                      <div className="ml-3 flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 dark:text-cyan-400">
                        <HugeiconsIcon icon={CornerDownLeftIcon} size={14} />
                      </div>
                    ) : (
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="ml-3 shrink-0 text-neutral-300 dark:text-slate-700 opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50/50 px-4 py-2.5 text-xs text-neutral-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">↑</kbd>{' '}
              <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">↵</kbd> Select
            </span>
          </div>
          <span>TraceIQ Documentation Search</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
