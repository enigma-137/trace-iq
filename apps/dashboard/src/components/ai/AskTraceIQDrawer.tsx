'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAskTraceIQ, EvidenceItem } from './AskTraceIQContext';
import AiBrain02Icon from '@hugeicons/core-free-icons/AiBrain02Icon';
import { HugeiconsIcon } from '@hugeicons/react';

export function AskTraceIQDrawer() {
  const {
    isOpen,
    closeAsk,
    messages,
    isInvestigating,
    progressStep,
    activeContext,
    quota,
    conversations,
    activeConversationId,
    error,
    submitQuestion,
    selectConversation,
    startNewConversation
  } = useAskTraceIQ();

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isInvestigating, progressStep]);

  if (!isOpen) return null;

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isInvestigating) return;
    const q = input.trim();
    setInput('');
    void submitQuestion(q);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const defaultStarters = [
    'Why did checkout conversion change?',
    'What are today’s biggest error issues?',
    'Which API endpoints are failing most?',
    'What changed after my latest feature flag rollout?'
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={closeAsk} />

      {/* Main Drawer Shell */}
      <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-neutral-200 bg-white text-neutral-900 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/90 px-5 py-3.5 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-600/20 dark:text-blue-400">
              <HugeiconsIcon icon={AiBrain02Icon} size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">Ask TraceIQ</h2>
                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/80 dark:text-blue-300">
                  v1
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Cross-surface project intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quota Badge */}
            {quota ? (
              <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-100/80 px-2.5 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900/80">
                <span className="text-neutral-500 dark:text-neutral-400">Allowance:</span>
                <span className={`font-medium ${quota.isExhausted ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-800 dark:text-neutral-200'}`}>
                  {quota.limit !== null
                    ? `${quota.used} / ${quota.limit}`
                    : 'Unlimited'}
                </span>
              </div>
            ) : null}

            {/* Conversation History Toggle */}
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="rounded-md border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
              title="Toggle investigation history"
            >
              History
            </button>

            {/* New Investigation Button */}
            <button
              type="button"
              onClick={startNewConversation}
              className="rounded-md border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
              title="Start a new investigation"
            >
              + New
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={closeAsk}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              title="Close (Esc)"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* History Slide-in Overlay */}
        {showHistory ? (
          <div className="max-h-48 overflow-y-auto border-b border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="mb-2 flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                Recent Investigations
              </span>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            {conversations.length === 0 ? (
              <p className="py-2 text-xs text-neutral-500">No prior investigations in this project.</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      void selectConversation(c.id);
                      setShowHistory(false);
                    }}
                    className={`w-full truncate rounded px-2 py-1.5 text-left text-xs transition ${
                      c.id === activeConversationId
                        ? 'border border-blue-200 bg-blue-50 text-blue-700 font-medium dark:border-blue-500/30 dark:bg-blue-600/20 dark:text-blue-300'
                        : 'text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Active Context Bar */}
        {activeContext?.surface ? (
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-2 text-xs text-blue-700 dark:border-neutral-800/60 dark:bg-blue-950/20 dark:text-blue-300">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-blue-800 dark:text-blue-400">Attached Context:</span>
              <span className="truncate rounded border border-blue-200 bg-blue-100/70 px-2 py-0.5 text-[11px] text-blue-800 dark:border-blue-700/40 dark:bg-blue-900/40 dark:text-blue-200">
                {activeContext.contextTitle || activeContext.surface}
              </span>
            </div>
          </div>
        ) : null}

        {/* Content Area */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          {/* Empty State */}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-600/10 dark:text-blue-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">What do you want to understand?</h3>
              <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
                Ask TraceIQ will safely query funnels, errors, telemetry, feature flags, user journeys, and session replays.
              </p>

              <div className="mt-8 grid w-full max-w-md gap-2">
                {defaultStarters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void submitQuestion(starter)}
                    className="group flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-left text-xs text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800/80 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/80 dark:hover:text-white"
                  >
                    <span>{starter}</span>
                    <span className="text-neutral-400 transition group-hover:text-blue-600 dark:text-neutral-500 dark:group-hover:text-blue-400">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={m.id || idx} className="space-y-3">
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl rounded-tl-sm border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800 dark:border-neutral-800/90 dark:bg-neutral-900/70 dark:text-neutral-200">
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {/* Evidence Section */}
                      {m.evidence && m.evidence.length > 0 ? (
                        <div className="mt-4 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800/80">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Supporting Evidence & Deep Links:
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {m.evidence.map((item, eIdx) => (
                              <EvidenceCard key={`${item.id}-${eIdx}`} item={item} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Suggested Followups */}
                    {m.suggestedFollowups && m.suggestedFollowups.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Ask next:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.suggestedFollowups.map((followup, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              onClick={() => void submitQuestion(followup)}
                              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/30 dark:hover:text-blue-200"
                            >
                              {followup}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Investigation Progress Indicator */}
          {isInvestigating ? (
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-500 animate-ping" />
                <span>Investigating…</span>
              </div>
              <p className="pl-4 text-xs text-neutral-600 dark:text-neutral-300">{progressStep || 'Analyzing project data…'}</p>
            </div>
          ) : null}

          {/* Error Banner */}
          {error ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
              <p className="font-semibold text-rose-900 dark:text-rose-200">Investigation Note:</p>
              <p>{error}</p>
            </div>
          ) : null}

          {/* Quota Exhaustion Upgrade Banner */}
          {quota && quota.isExhausted ? (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="font-semibold text-amber-950 dark:text-amber-100">
                You’ve used your {quota.limit} Ask TraceIQ investigations this month.
              </p>
              <p className="text-amber-800/90 dark:text-amber-300/80">
                Your analytics and dashboards remain completely available.
                {quota.plan === 'free' ? ' Upgrade to Pro for 100 investigations each month.' : ''}
              </p>
              {quota.plan === 'free' ? (
                <Link
                  href="/dashboard/settings/billing"
                  className="mt-2 inline-block rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition"
                >
                  Upgrade to Pro
                </Link>
              ) : null}
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <footer className="border-t border-neutral-200 bg-white/90 p-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/70">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask about funnels, errors, API latency, feature flags, users…"
                disabled={isInvestigating || Boolean(quota?.isExhausted)}
                className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-4 pr-12 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:placeholder-neutral-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || isInvestigating || Boolean(quota?.isExhausted)}
                className="absolute right-2 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition"
                title="Send investigation (Enter)"
              >
                {isInvestigating ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span>Shift + Enter for new line</span>
              <span>1 investigation = 1 successful analysis</span>
            </div>
          </form>
        </footer>
      </div>
    </div>
  );
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const iconMap: Record<string, string> = {
    funnel: '⚡',
    error: '⚠️',
    api_endpoint: '📡',
    feature_flag: '🚩',
    user: '👤',
    session_replay: '🎬',
    webhook: '🪝',
    alert: '🔔',
    retention: '📈',
    event: '📊',
    cohort: '👥'
  };

  return (
    <Link
      href={item.url}
      className="group flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-2.5 text-left text-xs transition hover:border-blue-300 hover:bg-blue-50/50 dark:border-neutral-800 dark:bg-neutral-950/80 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/10"
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{iconMap[item.type] || '🔍'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-neutral-900 transition group-hover:text-blue-600 dark:text-neutral-200 dark:group-hover:text-blue-300">
            {item.title}
          </p>
          {item.summary ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {item.summary}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 text-right">
        <span className="text-[10px] font-medium text-blue-600 group-hover:underline dark:text-blue-400">
          View in TraceIQ →
        </span>
      </div>
    </Link>
  );
}

