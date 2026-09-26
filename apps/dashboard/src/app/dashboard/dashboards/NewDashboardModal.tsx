'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { withProjectId } from '../nav';
import { DashboardDialog } from '../DashboardDialog';
import {
  fetchDashboardTemplates,
  instantiateDashboardTemplate,
  createDashboard
} from '@/lib/analytics-api';
import type { DashboardTemplateDefinition } from '@/types/analytics';
import { toast } from '@/lib/toast';

const DEFAULT_TEMPLATES: DashboardTemplateDefinition[] = [
  {
    id: 'product-analytics',
    name: 'Product Analytics',
    description: 'Understand active users, product usage, retention and important events.',
    category: 'Product',
    image: '/dashboards/analytics.png',
    badge: '5 widgets · Core metrics',
    widgets: []
  },
  {
    id: 'funnels-growth',
    name: 'Funnels & Growth',
    description: 'Track conversion pipelines, funnel drop-offs, and user conversion velocity.',
    category: 'Growth',
    image: '/dashboards/funnel.png',
    badge: '4 widgets · Funnels',
    widgets: []
  },
  {
    id: 'project-overview',
    name: 'Project Overview',
    description: 'Curated 360° health snapshot of active traffic, errors, and system requests.',
    category: 'Overview',
    image: '/dashboards/overview.png',
    badge: '6 widgets · Full health',
    widgets: []
  },
  {
    id: 'performance-reliability',
    name: 'Performance & Reliability',
    description: 'Monitor request volumes, error rates, p95 latency spikes, and exceptions.',
    category: 'Reliability',
    image: '/dashboards/performance.png',
    badge: '6 widgets · Latency & errors',
    widgets: []
  },
  {
    id: 'user-analytics',
    name: 'User Analytics',
    description: 'Explore new vs returning visitors, active cohorts, and user properties.',
    category: 'Users',
    image: '/dashboards/users.png',
    badge: '5 widgets · Cohorts',
    widgets: []
  }
];

export function NewDashboardModal({
  isOpen,
  onClose,
  projectId
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<DashboardTemplateDefinition[]>(DEFAULT_TEMPLATES);
  const [search, setSearch] = useState('');
  const [isScratchMode, setIsScratchMode] = useState(false);
  const [scratchName, setScratchName] = useState('');
  const [scratchDescription, setScratchDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsScratchMode(false);
    setScratchName('');
    setScratchDescription('');

    fetchDashboardTemplates().then(({ data }) => {
      if (data?.templates && data.templates.length > 0) {
        setTemplates(data.templates);
      }
    });
  }, [isOpen]);

  async function handleSelectTemplate(template: DashboardTemplateDefinition) {
    setSubmitting(true);
    const { data, error } = await instantiateDashboardTemplate(template.id, undefined, projectId);
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else if (data?.dashboard) {
      toast.success(`Created dashboard "${data.dashboard.name}"`);
      onClose();
      router.push(withProjectId(`/dashboard/dashboards/${data.dashboard.id}`, projectId));
    }
  }

  async function handleCreateScratch() {
    if (!scratchName.trim()) {
      toast.error('Please enter a dashboard name');
      return;
    }

    setSubmitting(true);
    const { data, error } = await createDashboard({
      name: scratchName.trim(),
      description: scratchDescription.trim() || undefined,
      projectId
    });
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else if (data?.dashboard) {
      toast.success(`Created dashboard "${data.dashboard.name}"`);
      onClose();
      router.push(withProjectId(`/dashboard/dashboards/${data.dashboard.id}`, projectId));
    }
  }

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create a dashboard"
      description="Pick a ready-made template or start from scratch."
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4 pt-2">
        {!isScratchMode ? (
          <>
            {/* Search & Scratch action bar */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full rounded-md border border-neutral-200 bg-neutral-50/50 py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsScratchMode(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Start from scratch
              </button>
            </div>

            {/* Template Grid */}
            <div className="grid max-h-[480px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => !submitting && handleSelectTemplate(template)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:border-blue-500/40 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-blue-500/50"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <img
                      src={template.image}
                      alt={template.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                      <span className="rounded bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {template.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 text-xs">
                        {template.name}
                      </h4>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {template.description}
                    </p>
                    <div className="mt-auto pt-2.5">
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        {template.badge}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Dashboard Name
              </label>
              <input
                type="text"
                value={scratchName}
                onChange={(e) => setScratchName(e.target.value)}
                placeholder="e.g., Executive KPI Dashboard"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Description (optional)
              </label>
              <textarea
                value={scratchDescription}
                onChange={(e) => setScratchDescription(e.target.value)}
                placeholder="What is this dashboard used for?"
                rows={2}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsScratchMode(false)}
                className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                ← Back to templates
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateScratch}
                  disabled={submitting || !scratchName.trim()}
                  className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Dashboard'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardDialog>
  );
}
