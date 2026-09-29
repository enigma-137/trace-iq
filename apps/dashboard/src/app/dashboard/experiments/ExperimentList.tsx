'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { EmptyState } from '@/components/EmptyState';
import { CreateExperimentModal } from './CreateExperimentModal';
import type { Experiment } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ExperimentListProps {
  initialExperiments: Experiment[];
  projectId?: string | null;
  token?: string | null;
}

export function ExperimentList({ initialExperiments, projectId, token: initialToken }: ExperimentListProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [experiments, setExperiments] = useState<Experiment[]>(initialExperiments);
  const [statusFilter, setStatusFilter] = useState('all');
  const [envFilter, setEnvFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const filteredExperiments = experiments.filter((exp) => {
    if (statusFilter !== 'all' && exp.status !== statusFilter) return false;
    if (envFilter !== 'all' && exp.environment !== envFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        exp.name.toLowerCase().includes(q) ||
        exp.key.toLowerCase().includes(q) ||
        (exp.description && exp.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleStatusChange = async (expId: string, newStatus: string) => {
    setActionLoadingId(expId);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/experiments/${expId}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
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
        setExperiments((prev) => prev.map((e) => (e.id === expId ? { ...e, status: updated.status } : e)));
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to change experiment status', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (expId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this experiment? This cannot be undone.')) return;

    setActionLoadingId(expId);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/experiments/${expId}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        setExperiments((prev) => prev.filter((e) => e.id !== expId));
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to delete experiment', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Completed
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
      {/* Action and Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {['all', 'running', 'paused', 'completed', 'draft'].map((tab) => (
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

          {/* Environment Filter */}
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search experiments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition"
          >
            <span>+</span>
            <span>New Experiment</span>
          </button>
        </div>
      </div>

      {/* Experiments Table / List */}
      {filteredExperiments.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-950">
          <EmptyState
            title="No experiments found"
            description={
              experiments.length === 0
                ? "You haven't created any A/B tests or multivariate experiments yet. Launch one to scientifically test UI changes and increase conversions."
                : "No experiments matched your current status or search filter."
            }
            primaryAction={
              experiments.length === 0
                ? {
                    label: 'Create your first experiment',
                    onClick: () => setIsModalOpen(true),
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
                <th className="px-4 py-3">Experiment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Primary Metric</th>
                <th className="px-4 py-3">Variants & Split</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
              {filteredExperiments.map((exp) => {
                const detailHref = `/dashboard/experiments/${exp.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
                const isLoading = actionLoadingId === exp.id;

                return (
                  <tr
                    key={exp.id}
                    onClick={() => router.push(detailHref)}
                    className="cursor-pointer transition hover:bg-neutral-50/70 dark:hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        <Link
                          href={detailHref}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                        >
                          {exp.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] font-mono text-neutral-500 dark:text-slate-400">
                            {exp.key}
                          </code>
                          {exp.description && (
                            <span className="hidden truncate max-w-xs text-[11px] text-neutral-400 dark:text-slate-500 sm:inline">
                              • {exp.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {getStatusBadge(exp.status)}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
                        {exp.primaryMetric}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {exp.variants.map((v) => (
                          <span
                            key={v.id || v.key}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              v.isControl
                                ? 'border border-neutral-200 bg-white text-neutral-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                            }`}
                          >
                            <span>{v.name}</span>
                            <span className="text-neutral-400 dark:text-slate-500">({v.weight}%)</span>
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="capitalize text-neutral-500 dark:text-slate-400">
                        {exp.environment}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        {exp.status === 'draft' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(exp.id, 'running')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Start
                          </button>
                        )}
                        {exp.status === 'running' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(exp.id, 'paused')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Pause
                          </button>
                        )}
                        {exp.status === 'paused' && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStatusChange(exp.id, 'running')}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            Resume
                          </button>
                        )}

                        <Link
                          href={detailHref}
                          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          View
                        </Link>

                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={(e) => handleDelete(exp.id, e)}
                          className="rounded-md p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Delete experiment"
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

      {/* Create Modal */}
      <CreateExperimentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(newExp) => {
          setExperiments((prev) => [newExp, ...prev]);
          router.refresh();
        }}
        projectId={projectId}
        token={initialToken}
      />
    </div>
  );
}
