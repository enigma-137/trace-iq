'use client';

import { useState, useEffect, type FormEvent } from 'react';
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
    description: 'Track active users, event volume distribution, feature adoption, and retention.',
    category: 'Product',
    image: '/dashboards/analytics.png',
    badge: '5 widgets · Core metrics',
    widgets: []
  },
  {
    id: 'funnels-growth',
    name: 'Funnels & Growth',
    description: 'Analyze multi-step conversion funnels, drop-off rates, and acquisition channels.',
    category: 'Growth',
    image: '/dashboards/funnel.png',
    badge: '4 widgets · Funnels',
    widgets: []
  },
  {
    id: 'project-overview',
    name: 'Project Overview',
    description: 'Curated 360° health snapshot of active traffic, error rates, and system requests.',
    category: 'Overview',
    image: '/dashboards/overview.png',
    badge: '6 widgets · Full health',
    widgets: []
  },
  {
    id: 'performance-reliability',
    name: 'Performance & Reliability',
    description: 'Monitor request volumes, error spikes, p95 latency percentiles, and exceptions.',
    category: 'Reliability',
    image: '/dashboards/performance.png',
    badge: '6 widgets · Latency & errors',
    widgets: []
  },
  {
    id: 'user-analytics',
    name: 'User Analytics',
    description: 'Explore new vs returning visitors, active user cohorts, and client device properties.',
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
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName('');

    fetchDashboardTemplates().then(({ data }) => {
      if (data?.templates && data.templates.length > 0) {
        setTemplates(data.templates);
      }
    });
  }, [isOpen]);

  function openDashboard(dashboard: { id: string; name: string }) {
    toast.success(`Created dashboard "${dashboard.name}"`);
    onClose();
    router.push(withProjectId(`/dashboard/dashboards/${dashboard.id}`, projectId));
  }

  async function handleSelectTemplate(template: DashboardTemplateDefinition) {
    setSubmitting(true);
    const { data, error } = await instantiateDashboardTemplate(template.id, undefined, projectId);
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else if (data?.dashboard) {
      openDashboard(data.dashboard);
    }
  }

  async function handleCreateBlank(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    const { data, error } = await createDashboard({ name: name.trim(), projectId });
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else if (data?.dashboard) {
      openDashboard(data.dashboard);
    }
  }

  return (
    <DashboardDialog
      isOpen={isOpen}
      onClose={onClose}
      title="New dashboard"
      description="Name a blank dashboard, or start from a template."
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4 pt-3">
        <form onSubmit={handleCreateBlank} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dashboard name"
            aria-label="Dashboard name"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-transparent px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:text-white dark:focus:border-neutral-600"
            autoFocus
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Create
          </button>
        </form>

        <div>
          <h3 className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Templates</h3>
          <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  disabled={submitting}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-neutral-50 disabled:opacity-60 dark:hover:bg-neutral-800/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-neutral-900 dark:text-white">{template.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {template.description}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-neutral-500 dark:text-neutral-400">Use</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DashboardDialog>
  );
}
