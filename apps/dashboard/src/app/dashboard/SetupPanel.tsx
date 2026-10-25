'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Building03Icon from '@hugeicons/core-free-icons/Building03Icon';
import CodeIcon from '@hugeicons/core-free-icons/CodeIcon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import Key01Icon from '@hugeicons/core-free-icons/Key01Icon';
import MagicWand01Icon from '@hugeicons/core-free-icons/MagicWand01Icon';
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon';
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon';
import SecurityLockIcon from '@hugeicons/core-free-icons/SecurityLockIcon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Skeleton } from '@/components/Skeleton';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { CodeBlock } from '../docs/CodeBlock';
import {
  CopyButton,
  Notice,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  StatusPill,
  dangerButton,
  fieldLabelClass,
  inputClass,
  primaryButton,
  secondaryButton
} from './settings/SettingsUI';
import { retryAfterStepUp } from '@/lib/step-up';

interface SetupResponse {
  hasSetup: boolean;
  organization: { id: string; name: string; slug: string; role: string } | null;
  project: { id: string; organizationId: string; name: string; slug: string } | null;
  writeKey: { prefix: string; value: string } | null;
  sdkSnippet: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * The API fills the snippet's `endpoint` from its own environment, which may
 * be an internal address (production had http://localhost:4000). The
 * dashboard's NEXT_PUBLIC_API_URL is the address browsers actually reach, so
 * use that.
 */
function withPublicEndpoint(snippet: string): string {
  return snippet.replace(/endpoint: '[^']*'/, `endpoint: '${apiBaseUrl}'`);
}

export function SetupPanel({
  organizationId,
  projectId,
  newProject = false,
  children
}: {
  organizationId?: string | null;
  projectId?: string | null;
  newProject?: boolean;
  children?: React.ReactNode;
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
      const nextSetup = (await response.json()) as SetupResponse;
      setSetup(nextSetup);
      setProjectNameDraft(nextSetup.project?.name ?? '');
      setOrgNameDraft(nextSetup.organization?.name ?? '');
      if (nextSetup.writeKey?.value) {
        setRevealedWriteKey(nextSetup.writeKey.value);
      }
      reportProjectSuccess(`Workspace initialized with project "${nextSetup.project?.name}".`);
      if (nextSetup.project?.id) {
        router.push(`/dashboard?projectId=${encodeURIComponent(nextSetup.project.id)}`);
      }
    } catch (error) {
      reportProjectFailure(
        await readApiError(error, 'Could not initialize workspace. Please try again.')
      );
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
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Session expired. Sign in again.', { title: 'Rename failed' });
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/projects/${setup.project.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: trimmed })
      });
      if (!response.ok) {
        toast.error(await readApiError(response), { title: 'Rename failed' });
        return;
      }
      const updated = await response.json();
      setSetup((current) =>
        current && current.project
          ? {
            ...current,
            project: {
              ...current.project,
              name: updated.name ?? trimmed,
              slug: updated.slug ?? current.project.slug
            }
          }
          : current
      );
      setIsEditingProjectName(false);
      toast.success(`Project renamed to "${trimmed}".`, { title: 'Project updated' });
      router.refresh();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not rename project.'), {
        title: 'Rename failed'
      });
    } finally {
      setIsSavingProjectName(false);
    }
  }

  // Handle Organization Rename
  async function handleSaveOrgName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup?.organization?.id) return;
    const trimmed = orgNameDraft.trim();
    if (!trimmed || trimmed === setup.organization.name) {
      setIsEditingOrgName(false);
      return;
    }
    setIsSavingOrgName(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Session expired. Sign in again.', { title: 'Rename failed' });
        return;
      }
      const response = await fetch(`${apiBaseUrl}/v1/setup/organization`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: trimmed })
      });
      if (!response.ok) {
        toast.error(await readApiError(response), { title: 'Rename failed' });
        return;
      }
      const updated = await response.json();
      setSetup((current) =>
        current && current.organization
          ? {
            ...current,
            organization: {
              ...current.organization,
              name: updated.name ?? trimmed,
              slug: updated.slug ?? current.organization.slug
            }
          }
          : current
      );
      setIsEditingOrgName(false);
      toast.success(`Organization renamed to "${trimmed}".`, { title: 'Organization updated' });
      router.refresh();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not rename organization.'), {
        title: 'Rename failed'
      });
    } finally {
      setIsSavingOrgName(false);
    }
  }

  // Handle Write Key Regeneration
  async function handleRegenerateWriteKey() {
    if (!setup?.project?.id) return;
    setIsRegenerating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Session expired. Sign in again.', { title: 'Regeneration failed' });
        return;
      }
      const regenerateUrl = `${apiBaseUrl}/v1/setup/write-key/regenerate?projectId=${encodeURIComponent(setup.project.id)}`;
      const regenerate = (accessToken: string) =>
        fetch(regenerateUrl, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
      const response = await retryAfterStepUp(await regenerate(token), async () => {
        const fresh = await getAccessToken();
        return fresh ? regenerate(fresh) : null;
      });
      if (!response.ok) {
        toast.error(await readApiError(response), { title: 'Regeneration failed' });
        return;
      }
      const data = await response.json();
      setSetup((current) =>
        current
          ? {
            ...current,
            writeKey: {
              prefix: data.prefix ?? 'trq_live_',
              value: data.value
            },
            sdkSnippet: data.sdkSnippet ?? current.sdkSnippet
          }
          : current
      );
      setRevealedWriteKey(data.value);
      setIsRegenerateDialogOpen(false);
      toast.success('Write key rotated successfully. Copy the new key now.', {
        title: 'Write key regenerated'
      });
    } catch (error) {
      toast.error(await readApiError(error, 'Failed to rotate write key.'), {
        title: 'Regeneration failed'
      });
    } finally {
      setIsRegenerating(false);
    }
  }

  // Handle Project Creation inside existing Organization
  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreatingProject(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Session expired. Sign in again.', { title: 'Create failed' });
        return;
      }
      const response = await fetch(
        `${apiBaseUrl}/v1/dashboard/projects${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: newProjectName.trim() })
        }
      );
      if (!response.ok) {
        toast.error(await readApiError(response), { title: 'Create failed' });
        return;
      }
      const created = (await response.json()) as SetupResponse;
      setCreatedProject(created);
      toast.success(`Project "${created.project?.name}" created successfully.`, {
        title: 'Project created'
      });
    } catch (error) {
      toast.error(await readApiError(error, 'Could not create project.'), {
        title: 'Create failed'
      });
    } finally {
      setIsCreatingProject(false);
    }
  }

  // Handle Safe Project Deletion
  async function handleDeleteProject() {
    if (!setup?.project?.id || !isDeleteConfirmed) return;
    setIsDeletingProject(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Session expired. Sign in again.', { title: 'Deletion failed' });
        return;
      }
      const projectId = setup.project.id;
      const deleteProject = (accessToken: string) =>
        fetch(`${apiBaseUrl}/v1/dashboard/projects/${projectId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      const response = await retryAfterStepUp(await deleteProject(token), async () => {
        const fresh = await getAccessToken();
        return fresh ? deleteProject(fresh) : null;
      });
      if (!response.ok) {
        toast.error(await readApiError(response), { title: 'Deletion failed' });
        return;
      }
      const result = await response.json();
      setIsDeleteDialogOpen(false);
      toast.success(`Project "${setup.project.name}" permanently deleted.`, {
        title: 'Project deleted'
      });
      if (result.remainingProjects && result.remainingProjects.length > 0) {
        const nextProjectId = result.remainingProjects[0].id;
        router.push(`/dashboard?projectId=${encodeURIComponent(nextProjectId)}`);
      } else {
        router.push('/dashboard/settings');
      }
    } catch (error) {
      toast.error(await readApiError(error, 'Failed to delete project.'), {
        title: 'Deletion failed'
      });
    } finally {
      setIsDeletingProject(false);
    }
  }

  function reportProjectFailure(message: string) {
    setStatus({ tone: 'error', message });
    toast.error(message, { title: 'Action failed' });
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

  const projectQuery = setup?.project?.id ? `?projectId=${encodeURIComponent(setup.project.id)}` : '';

  return (
    <div className={hasProject && !isLoading ? 'mt-8 grid gap-8 xl:grid-cols-[180px_minmax(0,1fr)] xl:gap-12' : 'mt-8'}>
      {hasProject && !isLoading ? <SettingsNav /> : null}

      <div className="grid min-w-0 max-w-5xl gap-12">
        {status || revealedWriteKey ? (
          <div className="grid gap-3">
            {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}

            {/* Fresh write key (shown once after regeneration or bootstrap) */}
            {revealedWriteKey ? (
              <div className="rounded-xl border border-amber-300 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:border-amber-900/70 dark:bg-slate-900/40">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <HugeiconsIcon icon={Key01Icon} size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Copy your new write key now</h3>
                      <p className="mt-0.5 text-sm text-neutral-500 dark:text-slate-400">
                        It is shown once and will be masked after you leave or refresh this page.
                      </p>
                      <code className="mt-2.5 block truncate rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-mono text-xs text-neutral-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                        {revealedWriteKey}
                      </code>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CopyButton value={revealedWriteKey} label="Copy key" />
                    <button type="button" className={secondaryButton} onClick={() => setRevealedWriteKey(null)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <SetupSkeleton />
        ) : !hasProject ? (
          organizationRole === 'member' ? (
            <SettingsCard
              icon={Folder01Icon}
              title="No projects yet"
              description="This organization has no projects yet. Ask an owner or admin to set up the first project."
            />
          ) : (
            <SettingsSection
              id="workspace"
              title="Create your tracking workspace"
              description="Create an organization, a project, and the initial write key for event ingestion."
            >
              <SettingsCard>
                <form
                  className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                  onSubmit={handleBootstrapSubmit}
                >
                  <label className={fieldLabelClass}>
                    Organization name
                    <input className={inputClass} value={bootstrapOrgName} onChange={(e) => setBootstrapOrgName(e.target.value)} required />
                  </label>
                  <label className={fieldLabelClass}>
                    Project name
                    <input className={inputClass} value={bootstrapProjectName} onChange={(e) => setBootstrapProjectName(e.target.value)} required />
                  </label>
                  <button className={primaryButton} type="submit" disabled={isBootstrapping}>
                    {isBootstrapping ? 'Creating…' : 'Create workspace'}
                  </button>
                </form>
              </SettingsCard>
            </SettingsSection>
          )
        ) : (
          <>
            {/* GENERAL: organization + project */}
            <SettingsSection
              id="general"
              title="General"
              description="Your organization and the project you are currently viewing."
            >
              <SettingsCard
                icon={Building03Icon}
                title="Organization"
                description="Owns every project, member, and the billing subscription."
                actions={organizationRole ? <StatusPill tone="neutral">{capitalize(organizationRole)}</StatusPill> : null}
              >
                <SettingsRow
                  label="Name"
                  hint="Shown to everyone in your team."
                  actions={
                    !isEditingOrgName && isOwnerOrAdmin ? (
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => {
                          setOrgNameDraft(setup?.organization?.name ?? '');
                          setIsEditingOrgName(true);
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.8} />
                        Rename
                      </button>
                    ) : null
                  }
                >
                  {isEditingOrgName ? (
                    <InlineRenameForm
                      value={orgNameDraft}
                      onChange={setOrgNameDraft}
                      onSubmit={handleSaveOrgName}
                      onCancel={() => {
                        setOrgNameDraft(setup?.organization?.name ?? '');
                        setIsEditingOrgName(false);
                      }}
                      isSaving={isSavingOrgName}
                      placeholder="Organization name"
                    />
                  ) : (
                    <span className="font-medium text-neutral-900 dark:text-white">{setup?.organization?.name ?? '—'}</span>
                  )}
                </SettingsRow>
                {setup?.organization?.slug ? (
                  <SettingsRow label="Slug" hint="URL-safe identifier.">
                    <code className="font-mono text-xs text-neutral-700 dark:text-slate-300">{setup.organization.slug}</code>
                  </SettingsRow>
                ) : null}
              </SettingsCard>

              <SettingsCard
                icon={Folder01Icon}
                title="Project"
                description="Credentials and identifiers for sending events to this project."
                actions={
                  <>
                    <ProjectSwitcher projectId={projectId} organizationId={organizationId} />
                    {isOwnerOrAdmin ? (
                      <button
                        className={primaryButton}
                        type="button"
                        onClick={() => {
                          setNewProjectOpen(true);
                          setCreatedProject(null);
                          setStatus(null);
                        }}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={15} strokeWidth={1.8} />
                        New project
                      </button>
                    ) : null}
                  </>
                }
              >
                <SettingsRow
                  label="Name"
                  hint={setup?.project?.slug ? <span className="font-mono">{setup.project.slug}</span> : undefined}
                  actions={
                    !isEditingProjectName && isOwnerOrAdmin ? (
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => {
                          setProjectNameDraft(setup?.project?.name ?? '');
                          setIsEditingProjectName(true);
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.8} />
                        Rename
                      </button>
                    ) : null
                  }
                >
                  {isEditingProjectName ? (
                    <InlineRenameForm
                      value={projectNameDraft}
                      onChange={setProjectNameDraft}
                      onSubmit={handleSaveProjectName}
                      onCancel={() => {
                        setProjectNameDraft(setup?.project?.name ?? '');
                        setIsEditingProjectName(false);
                      }}
                      isSaving={isSavingProjectName}
                      placeholder="Project name"
                    />
                  ) : (
                    <span className="font-medium text-neutral-900 dark:text-white">{setup?.project?.name ?? '—'}</span>
                  )}
                </SettingsRow>

                <SettingsRow
                  label="Project ID"
                  hint="Used for API requests and SDK initialization."
                  actions={setup?.project?.id ? <CopyButton value={setup.project.id} label="Copy" /> : null}
                >
                  <code className="break-all font-mono text-xs text-neutral-700 dark:text-slate-300">{setup?.project?.id ?? '—'}</code>
                </SettingsRow>

                <SettingsRow
                  label="Write key"
                  hint="Client token that authenticates ingested events."
                  actions={
                    <>
                      {setup?.writeKey?.value ? <CopyButton value={setup.writeKey.value} label="Copy" /> : null}
                      {isOwnerOrAdmin ? (
                        <button type="button" className={secondaryButton} onClick={() => setIsRegenerateDialogOpen(true)}>
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.8} />
                          Regenerate
                        </button>
                      ) : null}
                    </>
                  }
                >
                  <code className="break-all font-mono text-xs text-neutral-700 dark:text-slate-300">
                    {setup?.writeKey?.value
                      ? setup.writeKey.value
                      : setup?.writeKey?.prefix
                        ? `${setup.writeKey.prefix}••••••••••••••••`
                        : 'trq_live_••••••••••••••••••••'}
                  </code>
                </SettingsRow>
              </SettingsCard>

              {/* New project form (opened from the Project card) */}
              {isOwnerOrAdmin && newProjectOpen && !createdProject?.project ? (
                <SettingsCard
                  icon={PlusSignIcon}
                  title="Create another project"
                  description={`Each project inside ${setup?.organization?.name ?? 'this organization'} keeps its own events, write keys, and flags.`}
                >
                  <form className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center" onSubmit={handleCreateProject}>
                    <input
                      className={`${inputClass} sm:max-w-sm`}
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Project name (e.g. Mobile App)"
                      maxLength={80}
                      required
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button type="submit" disabled={isCreatingProject || !newProjectName.trim()} className={primaryButton}>
                        {isCreatingProject ? 'Creating…' : 'Create project'}
                      </button>
                      <button type="button" onClick={() => setNewProjectOpen(false)} className={secondaryButton}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </SettingsCard>
              ) : null}
            </SettingsSection>

            {/* INTEGRATION: wizard + snippet */}
            <SettingsSection
              id="integration"
              title="Integration"
              description="Connect your app and start sending events."
            >
              <SettingsCard
                icon={MagicWand01Icon}
                title="Guided setup"
                description="Detect your framework, pick products, generate config, and verify live events."
                actions={
                  <Link href={`/dashboard/setup${projectQuery}`} className={primaryButton}>
                    Launch web wizard
                    <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.8} />
                  </Link>
                }
              >
                <SettingsRow label="CLI" hint="Run in your project root." actions={<CopyButton value="npx traceiq-cli" label="Copy" />}>
                  <code className="font-mono text-xs text-neutral-900 dark:text-slate-100">npx traceiq-cli</code>
                </SettingsRow>
              </SettingsCard>

              {setup?.sdkSnippet ? (
                <SettingsCard
                  icon={CodeIcon}
                  title="SDK snippet"
                  description="Add this to your client application to begin tracking events."
                  actions={<CopyButton value={withPublicEndpoint(setup.sdkSnippet)} label="Copy snippet" />}
                >
                  <CodeBlock bare lang="ts" codeText={withPublicEndpoint(setup.sdkSnippet)} />
                </SettingsCard>
              ) : null}
            </SettingsSection>

            {/* SECURITY + API ACCESS (rendered by the page) */}
            {children}

            {/* DANGER ZONE */}
            <SettingsSection id="danger" title="Danger zone" description="Irreversible actions for this project.">
              <SettingsCard tone="danger">
                <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Delete this project</h3>
                      <p className="mt-0.5 max-w-xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
                        Permanently delete <strong className="font-medium text-neutral-800 dark:text-slate-200">{setup?.project?.name}</strong>{' '}
                        and all its events, sessions, funnels, flags, webhooks, dashboards, and write keys. Organization and billing are not affected.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isOwnerOrAdmin}
                    onClick={() => {
                      setDeleteConfirmName('');
                      setDeleteConfirmPhrase('');
                      setIsDeleteDialogOpen(true);
                    }}
                    className={dangerButton}
                  >
                    Delete project
                  </button>
                </div>
              </SettingsCard>
            </SettingsSection>
          </>
        )}
      </div>

      {/* Write Key Regeneration Dialog */}
      <DashboardDialog
        open={isRegenerateDialogOpen}
        title="Regenerate write key"
        description="Are you sure you want to rotate the write key for this project?"
        onClose={() => {
          if (!isRegenerating) setIsRegenerateDialogOpen(false);
        }}
        footer={
          <>
            <button className={secondaryButton} type="button" disabled={isRegenerating} onClick={() => setIsRegenerateDialogOpen(false)}>
              Cancel
            </button>
            <button className={primaryButton} type="button" disabled={isRegenerating} onClick={handleRegenerateWriteKey}>
              {isRegenerating ? 'Regenerating…' : 'Rotate write key'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-neutral-600 dark:text-slate-300">
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-200">The current key stops working immediately</p>
            <p className="mt-1 leading-6 text-amber-800 dark:text-amber-300">
              Any website, backend service, or SDK client still sending events with the previous key will be rejected with 401 Unauthorized until updated.
            </p>
          </div>
          <p className="leading-6">The new key is revealed once. Copy it and share it with your team right away.</p>
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
            <button className={secondaryButton} type="button" disabled={isDeletingProject} onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={!isDeleteConfirmed || isDeletingProject}
              onClick={handleDeleteProject}
            >
              {isDeletingProject ? 'Deleting project…' : 'Permanently delete project'}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-red-200 bg-red-50/80 p-3.5 text-red-900 dark:border-red-950/80 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-semibold">
              You are about to delete {setup?.project?.name} ({setup?.project?.id}).
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-red-800 dark:text-red-300">
              <li>All events, sessions, cohorts, and funnels will be erased.</li>
              <li>Feature flags, targeting rules, and exposures will be permanently deleted.</li>
              <li>Webhooks and delivery histories will be purged.</li>
              <li>Write keys will be revoked and ingestion will cease immediately.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-1">
            <label className="block">
              <span className="font-medium text-neutral-700 dark:text-slate-300">
                Type the project name <span className="font-mono font-semibold text-neutral-900 dark:text-white">{setup?.project?.name}</span> to confirm
              </span>
              <input
                className={`${inputClass} mt-1.5 focus:border-red-500 focus:ring-red-500/20`}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={setup?.project?.name ?? ''}
                autoFocus
              />
            </label>

            <label className="block">
              <span className="font-medium text-neutral-700 dark:text-slate-300">
                Type <span className="font-mono font-semibold text-neutral-900 dark:text-white">delete my project</span> to confirm
              </span>
              <input
                className={`${inputClass} mt-1.5 focus:border-red-500 focus:ring-red-500/20`}
                value={deleteConfirmPhrase}
                onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                placeholder="delete my project"
              />
            </label>
          </div>
        </div>
      </DashboardDialog>

      {/* Project Created Modal */}
      <DashboardDialog
        open={Boolean(createdProject?.project)}
        title="Project created"
        description="Your project is ready."
        onClose={() => {
          if (createdProject?.project?.id) {
            router.push(`/dashboard?projectId=${encodeURIComponent(createdProject.project.id)}`);
          }
          setCreatedProject(null);
        }}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              className={secondaryButton}
              type="button"
              onClick={() => {
                if (createdProject?.project?.id) {
                  router.push(`/dashboard?projectId=${encodeURIComponent(createdProject.project.id)}`);
                }
                setCreatedProject(null);
              }}
            >
              I'll do this later
            </button>
            <button
              className={primaryButton}
              type="button"
              onClick={() => {
                if (createdProject?.project?.id) {
                  router.push(`/dashboard/setup?projectId=${encodeURIComponent(createdProject.project.id)}`);
                }
                setCreatedProject(null);
              }}
            >
              Set up tracking
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.8} />
            </button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <p className="text-sm text-neutral-600 dark:text-slate-300">
            Connect your application to start receiving events for{' '}
            <strong className="font-semibold text-neutral-900 dark:text-white">{createdProject?.project?.name}</strong>.
          </p>
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-50 text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="text-neutral-500 dark:text-slate-400">Project ID</span>
              <span className="truncate font-mono font-semibold text-neutral-900 dark:text-white">{createdProject?.project?.id}</span>
            </div>
            {createdProject?.writeKey?.value ? (
              <div className="flex items-center justify-between gap-3 p-3">
                <span className="text-neutral-500 dark:text-slate-400">Write key</span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono font-semibold text-neutral-900 dark:text-white">{createdProject.writeKey.value}</span>
                  <CopyButton value={createdProject.writeKey.value} label="Copy" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DashboardDialog>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'general', label: 'General', icon: Settings02Icon },
  { id: 'integration', label: 'Integration', icon: CodeIcon },
  { id: 'security', label: 'Security', icon: SecurityLockIcon },
  { id: 'api-access', label: 'API access', icon: Key01Icon },
  { id: 'danger', label: 'Danger zone', icon: Alert02Icon }
];

/** Sticky in-page navigation that highlights the section currently in view. */
function SettingsNav() {
  const [activeId, setActiveId] = useState(NAV_ITEMS[0].id);

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="On this page" className="hidden xl:block">
      <ul className="sticky top-24 grid gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'true' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                  active
                    ? 'font-medium text-neutral-900 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function InlineRenameForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSaving,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSaving: boolean;
  placeholder: string;
}) {
  return (
    <form className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center" onSubmit={onSubmit}>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
        required
        autoFocus
      />
      <div className="flex gap-2">
        <button type="submit" disabled={isSaving || !value.trim()} className={primaryButton}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SetupSkeleton() {
  return (
    <div className="grid gap-4">
      {[0, 1].map((key) => (
        <div
          key={key}
          className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:border-slate-800 dark:bg-slate-900/40"
        >
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-64" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
