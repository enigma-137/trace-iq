'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { EmptyState } from '@/components/EmptyState';
import type { Survey, SurveyStatus } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SurveyWithStats extends Survey {
  responseCount?: number;
  impressionCount?: number;
  responseRate?: number;
}

interface SurveyListProps {
  initialSurveys: SurveyWithStats[];
  projectId?: string | null;
  token?: string | null;
}

export function SurveyList({ initialSurveys, projectId, token: initialToken }: SurveyListProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [surveys, setSurveys] = useState<SurveyWithStats[]>(initialSurveys);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const filteredSurveys = surveys.filter((srv) => {
    if (statusFilter !== 'all' && srv.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        srv.name.toLowerCase().includes(q) ||
        (srv.description && srv.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleStatusChange = async (srvId: string, newStatus: SurveyStatus) => {
    setActionLoadingId(srvId);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/surveys/${srvId}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
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
        setSurveys((prev) => prev.map((s) => (s.id === srvId ? { ...s, status: updated.status } : s)));
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to change survey status', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (srvId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this survey and its responses?')) return;

    setActionLoadingId(srvId);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/surveys/${srvId}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        setSurveys((prev) => prev.filter((s) => s.id !== srvId));
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to delete survey', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: SurveyStatus) => {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Published
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            Closed
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter and Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {['all', 'published', 'paused', 'closed', 'draft'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                  statusFilter === tab
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search surveys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />

          <Link
            href={`/dashboard/surveys/new${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition"
          >
            <span>+</span>
            <span>New Survey</span>
          </Link>
        </div>
      </div>

      {/* Survey Table */}
      {filteredSurveys.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-950">
          <EmptyState
            title={surveys.length === 0 ? 'No surveys yet' : 'No surveys found'}
            description={
              surveys.length === 0 ? (
                <>
                  <p>
                    Surveys ask your users questions inside your app: an NPS score, a rating or an open question. Pick
                    who sees each one, show it with a few SDK calls, and read the answers here, question by question.
                  </p>
                  <Link href="/docs?page=surveys" className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300">
                    Read the setup guide <span aria-hidden="true">→</span>
                  </Link>
                </>
              ) : (
                'No surveys matched your search or status filter.'
              )
            }
            primaryAction={
              surveys.length === 0
                ? {
                    label: 'Create your first survey',
                    href: `/dashboard/surveys/new${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
                    variant: 'primary'
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-left text-xs text-neutral-600 dark:text-slate-300">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Survey</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Questions</th>
                <th className="px-4 py-3">Targeting</th>
                <th className="px-4 py-3">Responses</th>
                <th className="px-4 py-3">Response Rate</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
              {filteredSurveys.map((srv) => {
                const resultsHref = `/dashboard/surveys/${srv.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
                const editHref = `/dashboard/surveys/${srv.id}/edit${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
                const isLoading = actionLoadingId === srv.id;

                return (
                  <tr
                    key={srv.id}
                    onClick={() => router.push(resultsHref)}
                    className="cursor-pointer transition hover:bg-neutral-50/70 dark:hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        <Link
                          href={resultsHref}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                        >
                          {srv.name}
                        </Link>
                        {srv.description && (
                          <div className="text-[11px] text-neutral-400 dark:text-slate-500 line-clamp-1">
                            {srv.description}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {getStatusBadge(srv.status)}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-medium text-neutral-800 dark:text-slate-200">
                        {srv.questions.length} question{srv.questions.length === 1 ? '' : 's'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                        {srv.targeting?.type === 'property'
                          ? `${srv.targeting.propertyKey} = ${srv.targeting.propertyValue}`
                          : srv.targeting?.type === 'event'
                          ? `Event: ${srv.targeting.eventName}`
                          : 'All Users'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {(srv.responseCount ?? 0).toLocaleString()}
                      </span>
                      {srv.impressionCount !== undefined && srv.impressionCount > 0 && (
                        <span className="text-neutral-400 dark:text-slate-500 ml-1">
                          / {srv.impressionCount.toLocaleString()} imp
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-medium text-neutral-800 dark:text-slate-200">
                        {srv.responseRate !== undefined && srv.responseRate > 0 ? `${srv.responseRate}%` : '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        {srv.status === 'draft' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(srv.id, 'published')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Publish
                          </button>
                        )}
                        {srv.status === 'published' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(srv.id, 'paused')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Pause
                          </button>
                        )}
                        {srv.status === 'paused' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(srv.id, 'published')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Resume
                          </button>
                        )}

                        <Link
                          href={resultsHref}
                          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Results
                        </Link>

                        <Link
                          href={editHref}
                          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={(e) => handleDelete(srv.id, e)}
                          className="rounded-md p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Delete survey"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
