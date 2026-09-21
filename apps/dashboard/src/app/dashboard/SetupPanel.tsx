'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Skeleton } from '@/components/Skeleton';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

interface SetupResponse {
  hasSetup: boolean;
  organization: { id: string; name: string; slug: string; role: string } | null;
  project: { id: string; organizationId: string; name: string; slug: string } | null;
  writeKey: { prefix: string; value: string } | null;
  sdkSnippet: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SetupPanel({
  organizationId,
  projectId,
  newProject = false
}: {
  organizationId?: string | null;
  projectId?: string | null;
  newProject?: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  // Setup state
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  // Initial bootstrap form state (when no org/project exists)
  const [bootstrapOrgName, setBootstrapOrgName] = useState('My Organization');
  const [bootstrapProjectName, setBootstrapProjectName] = useState('Web App');
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  // Project Rename state
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);

  // Organization Rename state
  const [isEditingOrgName, setIsEditingOrgName] = useState(false);
  const [orgNameDraft, setOrgNameDraft] = useState('');
  const [isSavingOrgName, setIsSavingOrgName] = useState(false);

  // Write Key Regeneration Modal state
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [revealedWriteKey, setRevealedWriteKey] = useState<string | null>(null);

  // New Project Modal / Section state
  const [newProjectOpen, setNewProjectOpen] = useState(newProject);
  const [newProjectName, setNewProjectName] = useState('Web App');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createdProject, setCreatedProject] = useState<SetupResponse | null>(null);

  // Danger Zone / Project Deletion state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const hasProject = Boolean(setup?.project);
  const organizationRole = setup?.organization?.role;
  const isOwnerOrAdmin = organizationRole === 'owner' || organizationRole === 'admin';

  const queryParams = new URLSearchParams();
  if (organizationId) queryParams.set('organizationId', organizationId);
  if (projectId) queryParams.set('projectId', projectId);
  const setupQuery = queryParams.toString() ? `?${queryParams.toString()}` : '';

  useEffect(() => {
    void loadSetup();
  }, [organizationId, projectId]);

  useEffect(() => {
    if (newProject) {
      setNewProjectOpen(true);
      setCreatedProject(null);
    }
  }, [newProject]);

  async function getAccessToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function loadSetup() {
    setIsLoading(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportPanelFailure('Your dashboard session expired. Sign in again.', 'Project settings unavailable');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/setup${setupQuery}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        reportPanelFailure(await readApiError(response), 'Project settings unavailable');
        return;
      }
      const nextSetup = (await response.json()) as SetupResponse;
      setSetup(nextSetup);
      setProjectNameDraft(nextSetup.project?.name ?? '');
      setOrgNameDraft(nextSetup.organization?.name ?? '');
      if (nextSetup.writeKey?.value) {
        setRevealedWriteKey(nextSetup.writeKey.value);
      }
    } catch (error) {
      reportPanelFailure(
        await readApiError(error, 'Could not load project settings. Please try again.'),
        'Project settings unavailable'
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Handle bootstrap initial setup
  async function handleBootstrapSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBootstrapping(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportProjectFailure('Your dashboard session expired. Sign in again.');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/setup/bootstrap${setupQuery}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: bootstrapOrgName, projectName: bootstrapProjectName })
      });
      if (!response.ok) {
        reportProjectFailure(await readApiError(response));
        return;
      }
      const created = (await response.json()) as SetupResponse;
      setSetup(created);
      if (created.writeKey?.value) {
        setRevealedWriteKey(created.writeKey.value);
      }
      reportProjectSuccess('Project created. Copy your write key now — it is shown only once.');
    } catch (error) {
      reportProjectFailure(await readApiError(error, 'Could not create the project. Please try again.'));
    } finally {
      setIsBootstrapping(false);
    }
  }

  // Handle Project Rename
  async function handleSaveProjectName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup?.project?.id) return;
    const trimmed = projectNameDraft.trim();
    if (!trimmed || trimmed === setup.project.name) {
      setIsEditingProjectName(false);
      return;
    }
    setIsSavingProjectName(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportPanelFailure('Your dashboard session expired. Sign in again.', 'Project update failed');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/projects/${encodeURIComponent(setup.project.id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (!response.ok) {
        reportPanelFailure(await readApiError(response), 'Project update failed');
        return;
      }
      const updated = await response.json();
      setSetup((current) =>
        current && current.project ? { ...current, project: { ...current.project, name: updated.project.name } } : current
      );
      setProjectNameDraft(updated.project.name);
      setIsEditingProjectName(false);
      toast.success('Project name updated.', { title: 'Project updated' });
    } catch (error) {
      reportPanelFailure(await readApiError(error, 'Could not rename project.'), 'Project update failed');
    } finally {
      setIsSavingProjectName(false);
    }
  }

  // Handle Organization Rename
  async function handleSaveOrgName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = orgNameDraft.trim();
    if (!trimmed || trimmed === setup?.organization?.name) {
      setIsEditingOrgName(false);
      return;
    }
    setIsSavingOrgName(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportPanelFailure('Your dashboard session expired. Sign in again.', 'Organization update failed');
        return;
      }
      const orgQuery = setup?.organization?.id ? `?organizationId=${encodeURIComponent(setup.organization.id)}` : '';
      const response = await fetch(`${apiBaseUrl}/v1/setup/organization${orgQuery}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: trimmed })
      });
      if (!response.ok) {
        reportPanelFailure(await readApiError(response), 'Organization update failed');
        return;
      }
      setSetup((current) =>
        current ? { ...current, organization: { ...current.organization!, name: trimmed } } : current
      );
      setOrgNameDraft(trimmed);
      setIsEditingOrgName(false);
      toast.success('Organization name updated.', { title: 'Organization updated' });
    } catch (error) {
      reportPanelFailure(await readApiError(error, 'Could not update organization.'), 'Organization update failed');
    } finally {
      setIsSavingOrgName(false);
    }
  }

  // Handle Write Key Regeneration
  async function handleRegenerateWriteKey() {
    if (!setup?.project?.id) return;
    setIsRegenerating(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportPanelFailure('Your dashboard session expired. Sign in again.', 'Key regeneration failed');
        return;
      }
      const response = await fetch(
        `${apiBaseUrl}/v1/setup/write-key/regenerate?projectId=${encodeURIComponent(setup.project.id)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!response.ok) {
        reportPanelFailure(await readApiError(response), 'Key regeneration failed');
        return;
      }
      const nextSetup = (await response.json()) as SetupResponse;
      setSetup(nextSetup);
      if (nextSetup.writeKey?.value) {
        setRevealedWriteKey(nextSetup.writeKey.value);
      }
      setIsRegenerateDialogOpen(false);
      toast.success('New write key generated. Copy it now — it is shown only once.', {
        title: 'Write key regenerated'
      });
    } catch (error) {
      reportPanelFailure(
        await readApiError(error, 'Could not regenerate write key. Please try again.'),
        'Key regeneration failed'
      );
    } finally {
      setIsRegenerating(false);
    }
  }

  // Handle Project Creation
  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup?.organization?.id) {
      reportProjectFailure('Choose an organization before creating a project.');
      return;
    }
    setIsCreatingProject(true);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportProjectFailure('Your dashboard session expired. Sign in again.');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: setup.organization.id,
          projectName: newProjectName.trim() || 'Web App'
        })
      });
      if (!response.ok) {
        reportProjectFailure(await readApiError(response));
        return;
      }
      const created = (await response.json()) as SetupResponse;
      setCreatedProject(created);
      setNewProjectOpen(false);
      setNewProjectName('Web App');
      reportProjectSuccess(
        `Project "${created.project?.name ?? 'Web App'}" created. Copy the write key now — it is shown once.`
      );
    } catch (error) {
      reportProjectFailure(await readApiError(error, 'Could not create project. Please try again.'));
    } finally {
      setIsCreatingProject(false);
    }
  }

  // Handle Project Deletion
  async function handleDeleteProject() {
    if (!setup?.project?.id) return;
    setIsDeletingProject(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        reportPanelFailure('Your dashboard session expired. Sign in again.', 'Project deletion failed');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/projects/${encodeURIComponent(setup.project.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        reportPanelFailure(await readApiError(response), 'Project deletion failed');
        return;
      }
      const result = await response.json();
      setIsDeleteDialogOpen(false);
      setDeleteConfirmName('');
      setDeleteConfirmPhrase('');
      toast.success(`Project "${setup.project.name}" has been permanently deleted.`, {
        title: 'Project deleted'
      });

      // Navigate to remaining project or refresh setup
      if (result.remainingProjects && result.remainingProjects.length > 0) {
        const nextProject = result.remainingProjects[0];
        router.push(`/dashboard?projectId=${encodeURIComponent(nextProject.id)}`);
      } else {
        router.push('/dashboard/settings');
        void loadSetup();
      }
    } catch (error) {
      reportPanelFailure(
        await readApiError(error, 'Could not delete project. Please try again.'),
        'Project deletion failed'
      );
    } finally {
      setIsDeletingProject(false);
    }
  }

  function reportProjectFailure(message: string) {
    setStatus({ tone: 'error', message });
    if (/plan limit for projects|project limit|settings\s*→\s*billing/i.test(message)) {
      toast.warning(message, { title: 'Project limit reached' });
      return;
    }
    toast.error(message, { title: 'Project creation failed' });
  }

  function reportPanelFailure(message: string, title: string) {
    setStatus({ tone: 'error', message });
    toast.error(message, { title });
  }

  function reportProjectSuccess(message: string) {
    setStatus({ tone: 'success', message });
    toast.success(message, { title: 'Project created' });
  }

  const isDeleteConfirmed =
    deleteConfirmName.trim() === (setup?.project?.name ?? '') &&
    deleteConfirmPhrase.trim().toLowerCase() === 'delete my project';

  return (
    <section className="grid gap-6" aria-labelledby="overview-title">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="overview-title" className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {hasProject ? 'Project Overview' : 'Create your tracking workspace'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {hasProject
              ? 'Workspace credentials, project identifiers, and lifecycle management.'
              : 'Create an organization, a project, and the initial write key for event ingestion.'}
          </p>
        </div>

        {hasProject ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ProjectSwitcher projectId={projectId} organizationId={organizationId} />
            {isOwnerOrAdmin ? (
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                type="button"
                onClick={() => {
                  setNewProjectOpen(true);
                  setCreatedProject(null);
                  setStatus(null);
                }}
              >
                <HugeiconsIcon icon={PlusSignIcon} size={15} />
                New project
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {status ? (
        <p
          className={`rounded-md border px-3.5 py-2.5 text-sm ${
            status.tone === 'success'
              ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      {/* Fresh Write Key Banner (Shown upon regeneration or project creation) */}
      {revealedWriteKey ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  New Write Key Generated — Copy Now
                </h3>
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                For security, this token is revealed once. It will be masked when you leave or refresh this page.
              </p>
              <div className="mt-2.5 inline-flex max-w-full items-center gap-2 rounded border border-amber-200 bg-white/90 px-2.5 py-1.5 font-mono text-xs font-semibold text-neutral-900 shadow-sm dark:border-amber-900/40 dark:bg-slate-900 dark:text-amber-100">
                <span className="truncate">{revealedWriteKey}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CopyButton value={revealedWriteKey} label="Copy key" />
              <button
                type="button"
                className="h-8 rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                onClick={() => setRevealedWriteKey(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <SetupSkeleton />
      ) : !hasProject ? (
        organizationRole === 'member' ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            This organization has no projects yet. Ask an owner or admin to set up the first project.
          </div>
        ) : (
          <form
            className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={handleBootstrapSubmit}
          >
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Organization name
              <input
                className={inputClass}
                value={bootstrapOrgName}
                onChange={(e) => setBootstrapOrgName(e.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Project name
              <input
                className={inputClass}
                value={bootstrapProjectName}
                onChange={(e) => setBootstrapProjectName(e.target.value)}
                required
              />
            </label>
            <div className="flex items-end">
              <button
                className="h-10 w-full rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200 sm:w-auto"
                type="submit"
                disabled={isBootstrapping}
              >
                {isBootstrapping ? 'Creating…' : 'Create workspace'}
              </button>
            </div>
          </form>
        )
      ) : (
        <>
          {/* Compact Settings Overview Table / List */}
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-neutral-200 px-5 py-3.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Workspace Configuration</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                General project identifiers and credentials for browser/server telemetry.
              </p>
            </div>

            <div className="divide-y divide-neutral-200 text-sm dark:divide-slate-800">
              {/* Row 1: Project Name */}
              <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Project Name</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-mono text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                      {setup?.project?.slug ?? '—'}
                    </span>
                  </div>
                  {isEditingProjectName ? (
                    <form className="mt-2 flex max-w-md items-center gap-2" onSubmit={handleSaveProjectName}>
                      <input
                        className="h-8 flex-1 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        value={projectNameDraft}
                        onChange={(e) => setProjectNameDraft(e.target.value)}
                        placeholder="Project name"
                        maxLength={80}
                        required
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={isSavingProjectName || !projectNameDraft.trim()}
                        className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                      >
                        {isSavingProjectName ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectNameDraft(setup?.project?.name ?? '');
                          setIsEditingProjectName(false);
                        }}
                        className="h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                      {setup?.project?.name ?? '—'}
                    </p>
                  )}
                </div>
                {!isEditingProjectName && isOwnerOrAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectNameDraft(setup?.project?.name ?? '');
                      setIsEditingProjectName(true);
                    }}
                    className="h-8 shrink-0 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Rename
                  </button>
                ) : null}
              </div>

              {/* Row 2: Project ID */}
              <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Project ID</span>
                  <p className="mt-1 font-mono text-xs font-semibold text-neutral-900 dark:text-slate-200">
                    {setup?.project?.id ?? '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-slate-500">
                    Immutable identifier for API requests and SDK initialization.
                  </p>
                </div>
                {setup?.project?.id ? (
                  <CopyButton value={setup.project.id} label="Copy ID" compact />
                ) : null}
              </div>

              {/* Row 3: Write Key */}
              <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Write Key</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.2 text-[10px] font-medium text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                      Client Token
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-neutral-600 dark:text-slate-400">
                    {setup?.writeKey?.value
                      ? setup.writeKey.value
                      : setup?.writeKey?.prefix
                      ? `${setup.writeKey.prefix}••••••••••••••••`
                      : 'trq_live_••••••••••••••••••••'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-slate-500">
                    Secret token used to authenticate event telemetry. Masked for security.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {setup?.writeKey?.value ? (
                    <CopyButton value={setup.writeKey.value} label="Copy key" compact />
                  ) : null}
                  {isOwnerOrAdmin ? (
                    <button
                      type="button"
                      onClick={() => setIsRegenerateDialogOpen(true)}
                      className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Regenerate
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Row 4: Organization */}
              <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Organization</span>
                    {organizationRole ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        {organizationRole}
                      </span>
                    ) : null}
                  </div>
                  {isEditingOrgName ? (
                    <form className="mt-2 flex max-w-md items-center gap-2" onSubmit={handleSaveOrgName}>
                      <input
                        className="h-8 flex-1 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        value={orgNameDraft}
                        onChange={(e) => setOrgNameDraft(e.target.value)}
                        placeholder="Organization name"
                        maxLength={80}
                        required
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={isSavingOrgName || !orgNameDraft.trim()}
                        className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                      >
                        {isSavingOrgName ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOrgNameDraft(setup?.organization?.name ?? '');
                          setIsEditingOrgName(false);
                        }}
                        className="h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                      {setup?.organization?.name ?? '—'}
                    </p>
                  )}
                </div>
                {!isEditingOrgName && isOwnerOrAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOrgNameDraft(setup?.organization?.name ?? '');
                      setIsEditingOrgName(true);
                    }}
                    className="h-8 shrink-0 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Rename
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* SDK Integration Snippet Card */}
          {setup?.sdkSnippet ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Integration Snippet</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Include this snippet in your client application to begin tracking events.
                  </p>
                </div>
                <CopyButton value={setup.sdkSnippet} label="Copy snippet" compact />
              </div>
              <pre className="overflow-x-auto bg-neutral-900 p-4 font-mono text-xs leading-6 text-neutral-100 dark:bg-slate-900">
                <code>{setup.sdkSnippet}</code>
              </pre>
            </div>
          ) : null}

          {/* New Project Creation Panel / Result (if opened) */}
          {isOwnerOrAdmin && (createdProject?.project || newProjectOpen) ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              {createdProject?.project ? (
                <div className="grid gap-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        New Project Created — {createdProject.project.name}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Project ID: <span className="font-mono">{createdProject.project.id}</span>. Copy the write key now; it is shown only once.
                      </p>
                    </div>
                    <button
                      className="h-8 shrink-0 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                      type="button"
                      onClick={() => router.push(`/dashboard?projectId=${encodeURIComponent(createdProject.project!.id)}`)}
                    >
                      Open project
                    </button>
                  </div>
                  {createdProject.writeKey?.value ? (
                    <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div>
                        <span className="text-[11px] font-semibold uppercase text-neutral-400">Write Key</span>
                        <p className="font-mono text-xs font-bold text-neutral-900 dark:text-white">
                          {createdProject.writeKey.value}
                        </p>
                      </div>
                      <CopyButton value={createdProject.writeKey.value} label="Copy key" compact />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Create Another Project</h3>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      Add a separate project inside {setup?.organization?.name ?? 'this organization'}. Each project maintains its own events, write keys, and flags.
                    </p>
                  </div>
                  <form className="mt-2 flex max-w-lg items-center gap-2" onSubmit={handleCreateProject}>
                    <input
                      className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Project name (e.g. Mobile App)"
                      maxLength={80}
                      required
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isCreatingProject || !newProjectName.trim()}
                      className="h-9 rounded-md bg-neutral-900 px-3.5 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                    >
                      {isCreatingProject ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewProjectOpen(false)}
                      className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : null}

          {/* Danger Zone Card */}
          <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50/20 shadow-sm dark:border-red-950/60 dark:bg-red-950/10">
            <div className="border-b border-red-200/80 px-5 py-3.5 dark:border-red-950/60">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Alert02Icon} size={16} className="text-red-600 dark:text-red-400" />
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Danger Zone</h3>
              </div>
              <p className="text-xs text-red-700/80 dark:text-red-400/80">
                Irreversible and destructive actions for this project.
              </p>
            </div>

            <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Delete this project</h4>
                <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                  Permanently delete <strong className="text-neutral-700 dark:text-neutral-200">{setup?.project?.name}</strong> and all associated data, including events, sessions, funnels, feature flags, webhooks, dashboards, and write keys. Organization and subscription settings will not be affected.
                </p>
              </div>
              <button
                type="button"
                disabled={!isOwnerOrAdmin}
                onClick={() => {
                  setDeleteConfirmName('');
                  setDeleteConfirmPhrase('');
                  setIsDeleteDialogOpen(true);
                }}
                className="h-9 shrink-0 rounded-md border border-red-300 bg-white px-3.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/80 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Delete project
              </button>
            </div>
          </div>
        </>
      )}

      {/* Write Key Regeneration Dialog */}
      <DashboardDialog
        open={isRegenerateDialogOpen}
        title="Regenerate Write Key"
        description="Are you sure you want to rotate the write key for this project?"
        onClose={() => {
          if (!isRegenerating) setIsRegenerateDialogOpen(false);
        }}
        footer={
          <>
            <button
              className="h-9 rounded-md border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              type="button"
              disabled={isRegenerating}
              onClick={() => setIsRegenerateDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-md bg-neutral-900 px-3.5 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              type="button"
              disabled={isRegenerating}
              onClick={handleRegenerateWriteKey}
            >
              {isRegenerating ? 'Regenerating…' : 'Rotate write key'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
          <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Immediate Token Invalidation
            </p>
            <p className="mt-1 leading-5 text-amber-800 dark:text-amber-300">
              Rotating the write key revokes the active key immediately. Any websites, backend services, or SDK clients sending events with the previous key will be rejected with 401 Unauthorized until updated.
            </p>
          </div>
          <p className="leading-5">
            The new key will be revealed on your screen once. Ensure you copy and distribute it to your engineering team immediately.
          </p>
        </div>
      </DashboardDialog>

      {/* Delete Project Confirmation Dialog */}
      <DashboardDialog
        open={isDeleteDialogOpen}
        title={`Delete "${setup?.project?.name ?? 'Project'}"`}
        description="This action is permanent and cannot be undone."
        onClose={() => {
          if (!isDeletingProject) setIsDeleteDialogOpen(false);
        }}
        footer={
          <>
            <button
              className="h-9 rounded-md border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              type="button"
              disabled={isDeletingProject}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-md bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={!isDeleteConfirmed || isDeletingProject}
              onClick={handleDeleteProject}
            >
              {isDeletingProject ? 'Deleting project…' : 'Permanently delete project'}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-md border border-red-200 bg-red-50/80 p-3.5 text-red-900 dark:border-red-950/80 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-semibold">You are about to delete {setup?.project?.name} ({setup?.project?.id}).</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-red-800 dark:text-red-300">
              <li>All events, sessions, cohorts, and funnels will be erased.</li>
              <li>Feature flags, targeting rules, and exposures will be permanently deleted.</li>
              <li>Webhooks and delivery histories will be purged.</li>
              <li>Write keys will be revoked and ingestion will cease immediately.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-1">
            <label className="block">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                1. Type project name <span className="font-mono font-bold text-neutral-900 dark:text-white">"{setup?.project?.name}"</span> to confirm:
              </span>
              <input
                className="mt-1.5 h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={setup?.project?.name ?? ''}
                autoFocus
              />
            </label>

            <label className="block">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                2. Type <span className="font-mono font-bold text-neutral-900 dark:text-white">delete my project</span> to confirm:
              </span>
              <input
                className="mt-1.5 h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                value={deleteConfirmPhrase}
                onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                placeholder="delete my project"
              />
            </label>
          </div>
        </div>
      </DashboardDialog>
    </section>
  );
}

function SetupSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-64" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

function CopyButton({ value, label, compact = false }: { value: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`rounded-md border border-neutral-200 bg-white font-semibold text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white ${
        compact ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs'
      }`}
      type="button"
      onClick={handleCopy}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

const inputClass =
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
