'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { allNavItems, navGroups } from '../nav';
import { onRecentsChange, readRecents, type RecentVisit } from '@/lib/recents';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';
import { TodayStoryCard } from '../TodayStoryCard';

/** One line of the Signals column, worked out on the server from the overview data. */
export interface OverviewSignal {
  label: string;
  value: string;
  href: string;
  tone?: 'bad' | 'warn' | 'good' | 'neutral';
}

interface SearchResult {
  key: string;
  label: string;
  hint: string;
  href?: string;
  ask?: string;
}

function withProject(href: string, projectId?: string | null): string {
  if (!projectId || href.startsWith('/docs')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}projectId=${encodeURIComponent(projectId)}`;
}

export function OverviewHero({
  projectId,
  projectName,
  signals
}: {
  projectId?: string | null;
  projectName: string;
  signals: OverviewSignal[];
}) {
  return (
    <section className="mx-auto w-full max-w-[1040px] pt-2 sm:pt-6">
      <h1 className="text-center text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
        What&apos;s happening on {projectName}?
      </h1>

      <OverviewSearch projectId={projectId} />

      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-3">
        <HeroColumn title="Today's story">
          <TodayStoryCard projectId={projectId} />
        </HeroColumn>

        <HeroColumn title="Signals" href={withProject('/dashboard/api-performance', projectId)}>
          <ul>
            {signals.map((signal) => (
              <li key={signal.label}>
                <HeroRow href={signal.href}>
                  <span className="truncate">{signal.label}</span>
                  <span
                    className={`ml-auto shrink-0 text-[13px] font-medium tabular-nums ${
                      signal.tone === 'bad'
                        ? 'text-rose-600 dark:text-rose-400'
                        : signal.tone === 'warn'
                          ? 'text-amber-600 dark:text-amber-400'
                          : signal.tone === 'good'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-500 dark:text-slate-400'
                    }`}
                  >
                    {signal.value}
                  </span>
                </HeroRow>
              </li>
            ))}
          </ul>
        </HeroColumn>

        <HeroColumn title="Recents">
          <RecentsList projectId={projectId} />
        </HeroColumn>
      </div>
    </section>
  );
}

function HeroColumn({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1 border-b border-neutral-100 pb-2 dark:border-slate-800">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
            {title} <Chevron />
          </Link>
        ) : (
          <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">{title}</span>
        )}
      </div>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function HeroRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 border-b border-neutral-100 py-2.5 text-[13px] text-neutral-800 transition last:border-b-0 hover:text-neutral-950 dark:border-slate-800/70 dark:text-slate-200 dark:hover:text-white"
    >
      {children}
      <span className="shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500 dark:text-slate-600">
        <Chevron />
      </span>
    </Link>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function RecentsList({ projectId }: { projectId?: string | null }) {
  const [recents, setRecents] = useState<RecentVisit[] | null>(null);

  useEffect(() => {
    const refresh = () => setRecents(readRecents());
    refresh();
    return onRecentsChange(refresh);
  }, []);

  if (recents === null) return null;
  if (recents.length === 0) {
    return (
      <p className="py-2.5 text-[13px] leading-relaxed text-neutral-500 dark:text-slate-400">
        Pages you open show up here, so you can jump back to them.
      </p>
    );
  }

  return (
    <ul>
      {recents.slice(0, 5).map((visit) => (
        <li key={visit.key}>
          <HeroRow href={withProject(visit.href, projectId)}>
            <ClockIcon />
            <span className="truncate">
              {visit.group ? <span className="text-neutral-400 dark:text-slate-500">{visit.group} / </span> : null}
              {visit.label}
            </span>
            <span className="ml-auto" />
          </HeroRow>
        </li>
      ))}
    </ul>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.2l2 1.3" />
    </svg>
  );
}

function OverviewSearch({ projectId }: { projectId?: string | null }) {
  const router = useRouter();
  const { openAsk } = useAskTraceIQ();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  // "/" focuses search; Ctrl/Cmd+K stays with Ask TraceIQ.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const pages: SearchResult[] = allNavItems
      .filter((item) => {
        const group = navGroups.find((entry) => entry.items.some((child) => child.key === item.key));
        return item.label.toLowerCase().includes(term) || group?.label.toLowerCase().includes(term);
      })
      .slice(0, 6)
      .map((item) => {
        const group = navGroups.find((entry) => entry.items.some((child) => child.key === item.key));
        return { key: `page:${item.key}`, label: item.label, hint: group?.label ?? 'Page', href: withProject(item.href, projectId) };
      });
    return [...pages, { key: 'ask', label: `Ask TraceIQ: “${query.trim()}”`, hint: 'AI', ask: query.trim() }];
  }, [query, projectId]);

  useEffect(() => setCursor(0), [query]);

  function choose(result: SearchResult) {
    setOpen(false);
    setQuery('');
    if (result.ask) {
      openAsk({ surface: 'overview', contextTitle: 'Search', initialQuestion: result.ask });
    } else if (result.href) {
      router.push(result.href);
    }
  }

  return (
    <div className="relative mx-auto mt-5 max-w-[720px]">
      <label className="flex h-11 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 shadow-xs transition focus-within:border-neutral-400 focus-within:ring-4 focus-within:ring-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-slate-600 dark:focus-within:ring-slate-900">
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <span className="sr-only">Search TraceIQ</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search pages, or ask a question about your data"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!results.length) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setCursor((value) => (value + 1) % results.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setCursor((value) => (value - 1 + results.length) % results.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(results[cursor] ?? results[0]);
            } else if (event.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="overview-search-results"
          aria-activedescendant={open && results[cursor] ? `overview-search-${cursor}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 sm:inline dark:border-slate-700 dark:text-slate-400">/</kbd>
      </label>

      {open && results.length > 0 ? (
        <ul
          id="overview-search-results"
          role="listbox"
          className="absolute inset-x-0 top-12 z-30 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          {results.map((result, index) => (
            <li
              key={result.key}
              id={`overview-search-${index}`}
              role="option"
              aria-selected={index === cursor}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(result);
              }}
              onMouseEnter={() => setCursor(index)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-[13px] ${
                index === cursor ? 'bg-neutral-100 text-neutral-950 dark:bg-slate-900 dark:text-white' : 'text-neutral-700 dark:text-slate-300'
              }`}
            >
              <span className="truncate">{result.label}</span>
              <span className="shrink-0 text-[11px] text-neutral-400 dark:text-slate-500">{result.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
