'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { withProjectId } from '../nav';
import { createInsight, addDashboardWidget } from '@/lib/analytics-api';
import type { DashboardWidgetView, InsightType, VisualizationType } from '@/types/analytics';
import { toast } from '@/lib/toast';

export interface EmptyDashboardBuilderProps {
  dashboardId: string;
  projectId?: string;
  onAddExistingChart: () => void;
  onBrowseTemplates: () => void;
  onWidgetAdded?: (widget: DashboardWidgetView) => void;
  onCreateNewInsight?: (starterQuestion?: string) => void;
}

interface QuestionShortcut {
  id: string;
  question: string;
  title: string;
  description: string;
  insightType: InsightType;
  chartType: VisualizationType;
  query: Record<string, any>;
  visualization: Record<string, any>;
  accentColor: string;
  icon: 'bars' | 'blocks' | 'line' | 'journey';
}

const QUESTION_SHORTCUTS: QuestionShortcut[] = [
  {
    id: 'activity-week',
    question: 'What does user activity look like this week?',
    title: 'Weekly Event Activity',
    description: 'Total daily event volume over the past 7 days',
    insightType: 'trend',
    chartType: 'bar',
    query: { event: '*', measure: 'count', interval: 'day', days: '7' },
    visualization: { chartType: 'bar' },
    accentColor: 'blue',
    icon: 'bars'
  },
  {
    id: 'feature-adoption',
    question: 'How is my feature being adopted?',
    title: 'Feature & Event Breakdown',
    description: 'Distribution of top product events over the past 14 days',
    insightType: 'event_breakdown',
    chartType: 'donut',
    query: { event: '*', breakdown: '$event_name', days: '14' },
    visualization: { chartType: 'donut' },
    accentColor: 'amber',
    icon: 'blocks'
  },
  {
    id: 'retention-signup',
    question: 'What brings users back after they sign up?',
    title: 'User Retention Trend',
    description: 'Daily unique active users returning over 30 days',
    insightType: 'trend',
    chartType: 'line',
    query: { event: '*', measure: 'unique', interval: 'day', days: '30' },
    visualization: { chartType: 'line' },
    accentColor: 'emerald',
    icon: 'line'
  },
  {
    id: 'activation-paths',
    question: 'Which paths lead users to activation?',
    title: 'Top Traffic Paths',
    description: 'Breakdown of events and visitor paths over 30 days',
    insightType: 'event_breakdown',
    chartType: 'bar',
    query: { event: '*', breakdown: '$path', days: '30' },
    visualization: { chartType: 'bar' },
    accentColor: 'indigo',
    icon: 'journey'
  }
];

export function EmptyDashboardBuilder({
  dashboardId,
  projectId,
  onAddExistingChart,
  onBrowseTemplates,
  onWidgetAdded
}: EmptyDashboardBuilderProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isCreatingWidget, setIsCreatingWidget] = useState(false);

  function handleQuestionClick(q: QuestionShortcut) {
    setPrompt(q.question);
    setSelectedQuestionId(q.id);
  }

  async function handleQuickAdd(q: QuestionShortcut) {
    setIsCreatingWidget(true);
    try {
      const { data: insData, error: insErr } = await createInsight({
        name: q.title,
        description: q.description,
        type: q.insightType,
        query: q.query,
        visualization: q.visualization,
        projectId
      });

      if (insErr || !insData?.insight?.id) {
        toast.error(insErr || 'Failed to create insight');
        setIsCreatingWidget(false);
        return;
      }

      const { data: wData, error: wErr } = await addDashboardWidget(dashboardId, {
        insightId: insData.insight.id,
        title: q.title,
        layout: { w: q.chartType === 'kpi' ? 4 : 6 },
        projectId
      });

      if (wErr) {
        toast.error(wErr);
      } else if (wData?.widget) {
        toast.success(`Created and added "${q.title}" to dashboard`);
        if (onWidgetAdded) {
          onWidgetAdded(wData.widget);
        } else {
          router.refresh();
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error generating widget');
    } finally {
      setIsCreatingWidget(false);
    }
  }

  function handleCustomizeInBuilder(q: QuestionShortcut) {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    params.set('dashboardId', dashboardId);
    params.set('goal', q.question);
    params.set('type', q.insightType);
    params.set('name', q.title);
    router.push(`/dashboard/insights/new?${params.toString()}`);
  }

  async function handleBuildItForMe() {
    if (!prompt.trim()) {
      toast.error('Please enter or select a question first');
      return;
    }

    // Check if the prompt matches a known shortcut
    const matched = QUESTION_SHORTCUTS.find(
      (q) => q.question.toLowerCase() === prompt.trim().toLowerCase()
    );

    if (matched) {
      await handleQuickAdd(matched);
      return;
    }

    // Default to creating an event trend query for the user goal
    const genericShortcut: QuestionShortcut = {
      id: 'custom-query',
      question: prompt.trim(),
      title: prompt.trim().slice(0, 40),
      description: `Analysis for: ${prompt.trim()}`,
      insightType: 'trend',
      chartType: 'line',
      query: { event: '*', measure: 'count', interval: 'day', days: '30' },
      visualization: { chartType: 'line' },
      accentColor: 'blue',
      icon: 'line'
    };

    await handleQuickAdd(genericShortcut);
  }

  const selectedQuestion = QUESTION_SHORTCUTS.find((q) => q.id === selectedQuestionId);

  return (
    <div className="mx-auto w-full max-w-6xl py-4 sm:py-8">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-14">
        {/* Left Column: TraceIQ Bot Illustration */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="group relative flex w-full flex-col items-center">
            {/* Ambient background glow */}
            <div className="pointer-events-none absolute -inset-4 rounded-full bg-gradient-to-tr from-blue-500/15 via-cyan-500/10 to-indigo-500/15 opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-90 dark:from-blue-600/25 dark:via-cyan-600/15 dark:to-indigo-600/25" />

            <Image
              src="/dashboards/new-dashboard.png"
              alt="TraceIQ Dashboard Builder Assistant"
              width={340}
              height={340}
              className="relative z-10 max-h-[280px] w-auto object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105 sm:max-h-[340px] lg:max-h-[380px]"
              priority
            />

            {/* Bottom Caption Pill */}
            <div className="relative z-10 mt-3 flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-neutral-100/80 px-3 py-1 text-[11px] font-medium text-neutral-700 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-850/80 dark:text-neutral-300">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                TraceIQ Dashboard Assistant
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Guided Dashboard Builder Panel */}
        <div className="flex flex-col space-y-6 lg:col-span-7">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
              Build your dashboard
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm dark:text-neutral-400">
              Add a chart from your library, start with a question about what matters to your product, or begin from a template.
            </p>
          </div>

          {/* Question Prompt Textarea */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              What do you want to learn?
            </label>
            <div className="relative rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-neutral-800 dark:bg-neutral-900">
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setSelectedQuestionId(null);
                }}
                placeholder="For example, which features are driving retention?"
                rows={2}
                className="w-full resize-none bg-transparent text-xs leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white dark:placeholder:text-neutral-500 sm:text-sm"
              />
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5 dark:border-neutral-800/80">
                <Link
                  href={withProjectId('/docs', projectId)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 transition hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
                >
                  <span>Learn about product analytics</span>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>

                <button
                  type="button"
                  onClick={handleBuildItForMe}
                  disabled={isCreatingWidget}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-95 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <span>{isCreatingWidget ? 'Building chart...' : 'Build it for me'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Start with a question */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Start with a question
              </h4>
              {selectedQuestion && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400">
                  Click action below to generate
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {QUESTION_SHORTCUTS.map((q) => {
                const isSelected = selectedQuestionId === q.id;
                return (
                  <div
                    key={q.id}
                    className={`group flex flex-col rounded-xl border transition-all duration-150 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-neutral-200/90 bg-white hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50/80 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-850'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleQuestionClick(q)}
                      className="flex w-full items-center justify-between p-3.5 text-left"
                    >
                      <span className="text-xs font-medium text-neutral-800 group-hover:text-neutral-900 dark:text-neutral-200 dark:group-hover:text-white sm:text-sm">
                        {q.question}
                      </span>

                      {/* Mini visual SVG indicator */}
                      <div className="ml-3 flex shrink-0 items-center">
                        {q.icon === 'bars' && (
                          <div className="flex h-5 items-end gap-1 rounded px-1.5 py-0.5">
                            <div className="h-2 w-1 rounded-xs bg-blue-400" />
                            <div className="h-3.5 w-1 rounded-xs bg-blue-500" />
                            <div className="h-5 w-1 rounded-xs bg-blue-600" />
                            <div className="h-3 w-1 rounded-xs bg-blue-400" />
                          </div>
                        )}
                        {q.icon === 'blocks' && (
                          <div className="flex h-5 w-8 items-center gap-1 rounded px-1">
                            <div className="h-4 w-3 rounded-xs bg-amber-500" />
                            <div className="flex flex-col gap-0.5">
                              <div className="h-1.5 w-3 rounded-xs bg-amber-400" />
                              <div className="h-1.5 w-2 rounded-xs bg-amber-300" />
                            </div>
                          </div>
                        )}
                        {q.icon === 'line' && (
                          <svg className="h-5 w-8 text-emerald-500" viewBox="0 0 32 16" fill="none">
                            <path
                              d="M2 14 C8 14, 12 2, 18 6 C24 10, 26 2, 30 2"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {q.icon === 'journey' && (
                          <svg className="h-5 w-8 text-indigo-500" viewBox="0 0 32 16" fill="none">
                            <path
                              d="M2 4 Q16 4 16 12 T30 12"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                            <circle cx="30" cy="12" r="2.5" fill="currentColor" />
                          </svg>
                        )}
                      </div>
                    </button>

                    {/* Expandable Quick Action Bar on selected question */}
                    {isSelected && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-200/60 bg-blue-500/5 px-3.5 py-2 dark:border-blue-900/60 dark:bg-blue-950/40">
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Preconfigured metric: <strong className="text-neutral-800 dark:text-neutral-200">{q.title}</strong>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCustomizeInBuilder(q)}
                            className="text-[11px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                          >
                            Customize query →
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdd(q)}
                            disabled={isCreatingWidget}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>{isCreatingWidget ? 'Adding...' : 'Add to dashboard'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button
              type="button"
              onClick={onAddExistingChart}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-95"
            >
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add an existing chart</span>
            </button>

            <button
              type="button"
              onClick={onBrowseTemplates}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <svg className="h-3.5 w-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              <span>Browse templates</span>
            </button>

            <span className="text-xs text-neutral-400">or</span>

            <Link
              href={withProjectId('/dashboard/web', projectId)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50/80 px-3.5 py-2.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-white hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-850 dark:hover:text-white"
            >
              <svg className="h-3.5 w-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span>View Web Analytics</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
