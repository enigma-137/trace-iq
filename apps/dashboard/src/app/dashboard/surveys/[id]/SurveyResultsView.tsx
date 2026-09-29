'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { Survey, SurveyResults, SurveyStatus } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SurveyResultsViewProps {
  survey: Survey;
  initialResults: SurveyResults;
  projectId?: string | null;
  token?: string | null;
}

export function SurveyResultsView({
  survey: initialSurvey,
  initialResults,
  projectId,
  token: initialToken
}: SurveyResultsViewProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [survey, setSurvey] = useState<Survey>(initialSurvey);
  const [results, setResults] = useState<SurveyResults>(initialResults);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'responses'>('summary');

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const handleStatusUpdate = async (newStatus: SurveyStatus) => {
    setLoading(true);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/surveys/${survey.id}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: newStatus, projectId })
      });

      if (res.ok) {
        const updated = await res.json();
        setSurvey(updated);
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to update survey status', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this survey and all recorded responses?')) return;
    setLoading(true);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/surveys/${survey.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      await fetch(url, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      router.push(`/dashboard/surveys${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
    } catch (err) {
      console.error('Failed to delete survey', err);
      setLoading(false);
    }
  };

  const getStatusBadge = (status: SurveyStatus) => {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Published
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            Closed
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            Draft
          </span>
        );
    }
  };

  const npsQuestion = results.questions.find((q) => q.type === 'nps');

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
        <Link
          href={`/dashboard/surveys${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
          className="hover:text-neutral-900 dark:hover:text-white"
        >
          Surveys
        </Link>
        <span>/</span>
        <span className="font-semibold text-neutral-900 dark:text-white">{survey.name}</span>
      </div>

      {/* Header Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              {getStatusBadge(survey.status)}
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-slate-800 dark:text-slate-300 capitalize">
                {survey.environment}
              </span>
              <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                {survey.questions.length} question{survey.questions.length === 1 ? '' : 's'}
              </span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              {survey.name}
            </h1>

            {survey.description ? (
              <p className="max-w-3xl text-xs leading-relaxed text-neutral-600 dark:text-slate-400 sm:text-sm">
                {survey.description}
              </p>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {survey.status === 'draft' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusUpdate('published')}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                Publish Survey
              </button>
            )}

            {survey.status === 'published' && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleStatusUpdate('paused')}
                  className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleStatusUpdate('closed')}
                  className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Close Survey
                </button>
              </>
            )}

            {survey.status === 'paused' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusUpdate('published')}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                Resume
              </button>
            )}

            <Link
              href={`/dashboard/surveys/${survey.id}/edit${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Edit Questions
            </Link>

            <button
              type="button"
              disabled={loading}
              onClick={handleDelete}
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-red-950/30"
              title="Delete survey"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Total Impressions</div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.impressionsCount.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">
            Number of times shown in-app
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Total Responses</div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.responsesCount.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">
            Completed survey submissions
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Response Rate</div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.responseRate}%
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">
            Responses per impression
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Completion Rate</div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.completionRate}%
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 dark:text-slate-500">
            Submitted vs dismissed
          </div>
        </div>
      </div>

      {/* NPS Score Card (if survey has NPS question) */}
      {npsQuestion && npsQuestion.npsScore !== undefined && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Net Promoter Score (NPS)
              </div>
              <div className="mt-1 text-3xl font-black text-neutral-900 dark:text-white">
                {npsQuestion.npsScore > 0 ? `+${npsQuestion.npsScore}` : npsQuestion.npsScore}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                Based on {npsQuestion.totalResponses} responses (% Promoters &minus; % Detractors)
              </div>
            </div>

            <div className="flex-1 max-w-md space-y-2">
              <div className="flex h-4 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                {npsQuestion.totalResponses > 0 ? (
                  <>
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{
                        width: `${((npsQuestion.promoters || 0) / npsQuestion.totalResponses) * 100}%`
                      }}
                      title={`Promoters: ${npsQuestion.promoters}`}
                    />
                    <div
                      className="bg-amber-400 transition-all"
                      style={{
                        width: `${((npsQuestion.passives || 0) / npsQuestion.totalResponses) * 100}%`
                      }}
                      title={`Passives: ${npsQuestion.passives}`}
                    />
                    <div
                      className="bg-red-500 transition-all"
                      style={{
                        width: `${((npsQuestion.detractors || 0) / npsQuestion.totalResponses) * 100}%`
                      }}
                      title={`Detractors: ${npsQuestion.detractors}`}
                    />
                  </>
                ) : (
                  <div className="w-full bg-neutral-200 dark:bg-slate-800" />
                )}
              </div>

              <div className="flex justify-between text-xs">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {npsQuestion.promoters || 0} Promoters (9-10)
                </span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {npsQuestion.passives || 0} Passives (7-8)
                </span>
                <span className="font-semibold text-red-700 dark:text-red-400">
                  {npsQuestion.detractors || 0} Detractors (0-6)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-slate-800">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`pb-3 text-xs font-semibold transition border-b-2 ${
              activeTab === 'summary'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Question Breakdown
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('responses')}
            className={`pb-3 text-xs font-semibold transition border-b-2 ${
              activeTab === 'responses'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Individual Responses ({results.recentResponses.length})
          </button>
        </div>
      </div>

      {/* Tab: Question Breakdown */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {results.questions.map((q, qIdx) => (
            <div
              key={q.questionId || qIdx}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                      {qIdx + 1}
                    </span>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{q.prompt}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300 uppercase">
                    {q.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {q.totalResponses} response{q.totalResponses === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Options / Ratings Bars */}
              {q.options && q.options.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {q.options.map((opt) => (
                    <div key={opt.optionId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-neutral-800 dark:text-slate-200">{opt.label}</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {opt.count} ({opt.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                        <div
                          className="h-full bg-blue-600 transition-all dark:bg-blue-500"
                          style={{ width: `${opt.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Average Rating for Scale */}
              {q.type === 'rating_scale' && q.averageRating !== undefined && (
                <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
                  Average Rating: <strong className="text-sm font-bold text-neutral-900 dark:text-white">★ {q.averageRating} / 5.0</strong>
                </div>
              )}

              {/* Text Answers */}
              {(q.type === 'short_text' || q.type === 'long_text') && (
                <div className="mt-4 space-y-2">
                  {q.recentTextAnswers && q.recentTextAnswers.length > 0 ? (
                    q.recentTextAnswers.map((txt) => (
                      <div
                        key={txt.id}
                        className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <p className="text-neutral-800 dark:text-slate-200 italic">&ldquo;{txt.text}&rdquo;</p>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                          <code className="font-mono">{txt.distinctId}</code>
                          <span>{new Date(txt.occurredAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-center text-xs text-neutral-400">
                      No text feedback received yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Individual Responses Table */}
      {activeTab === 'responses' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
          {results.recentResponses.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              No responses submitted yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-neutral-600 dark:text-slate-300">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Distinct ID</th>
                  <th className="px-4 py-3">Answers</th>
                  <th className="px-4 py-3">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                {results.recentResponses.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3.5 font-mono text-xs text-neutral-900 dark:text-white">
                      {r.distinctId}
                    </td>
                    <td className="px-4 py-3.5 space-y-1">
                      {r.answers.map((a, aIdx) => (
                        <div key={a.questionId || aIdx} className="text-xs">
                          <span className="font-medium text-neutral-500 dark:text-slate-400">
                            {a.prompt}:{' '}
                          </span>
                          <span className="font-semibold text-neutral-800 dark:text-slate-200">
                            {a.answerText ||
                              a.selectedOptions?.join(', ') ||
                              (a.score !== undefined ? `NPS: ${a.score}` : '') ||
                              (a.rating !== undefined ? `★ ${a.rating}` : '—')}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-neutral-500 dark:text-slate-400">
                      {new Date(r.occurredAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
