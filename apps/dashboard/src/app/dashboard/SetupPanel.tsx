'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Skeleton } from '@/components/Skeleton';
import { readApiError } from '@/lib/api-error';

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
  const [organizationName, setOrganizationName] = useState('My Organization');
  const [projectName, setProjectName] = useState('Web App');
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [setupOrgName, setSetupOrgName] = useState('');
  const [isRenamingOrg, setIsRenamingOrg] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(newProject);
  const [newProjectName, setNewProjectName] = useState('Web App');
  const [createdProject, setCreatedProject] = useState<SetupResponse | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const hasProject = Boolean(setup?.project);
  const organizationRole = setup?.organization?.role;
  const canManageProject = organizationRole === 'owner' || organizationRole === 'admin';
  const canManageOrganization = canManageProject;
  const queryParams = new URLSearchParams();
  if (organizationId) queryParams.set('organizationId', organizationId);
  if (projectId) queryParams.set('projectId', projectId);
  const setupQuery = queryParams.toString() ? `?${queryParams.toString()}` : '';

  useEffect(() => {
    void loadSetup();
  }, [organizationId]);

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
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsLoading(false);
      return;
    }
    const response = await fetch(`${apiBaseUrl}/v1/setup${setupQuery}`, { headers: { Authorization: `Bearer ${token}` } });
    setIsLoading(false);
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readApiError(response) });
      return;
    }
    const nextSetup = (await response.json()) as SetupResponse;
    setSetup(nextSetup);
    setSetupOrgName(nextSetup.organization?.name ?? '');
  }

  async function handleRenameOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = setupOrgName.trim();
    if (!trimmed || trimmed === setup?.organization?.name) {
      return;
    }
    setIsRenamingOrg(true);
    setStatus(null);
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsRenamingOrg(false);
      return;
    }
    const response = await fetch(`${apiBaseUrl}/v1/setup/organization`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationName: trimmed })
    });
    setIsRenamingOrg(false);
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readApiError(response) });
      return;
    }
    setSetup((current) => (current ? { ...current, organization: { ...current.organization!, name: trimmed } } : current));
    setSetupOrgName(trimmed);
    setStatus({ tone: 'success', message: 'Organization name updated.' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsSubmitting(false);
      return;
    }
    const response = await fetch(`${apiBaseUrl}/v1/setup/bootstrap${setupQuery}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationName, projectName })
    });
    setIsSubmitting(false);
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readApiError(response) });
      return;
    }
    setSetup((await response.json()) as SetupResponse);
    setStatus({ tone: 'success', message: 'Project created. Copy your write key now — it is shown once.' });
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup?.organization?.id) return;
    setIsCreatingProject(true);
    setStatus(null);
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsCreatingProject(false);
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
    setIsCreatingProject(false);
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readApiError(response) });
      return;
    }
    const created = (await response.json()) as SetupResponse;
    setCreatedProject(created);
    setNewProjectOpen(false);
    setNewProjectName('Web App');
    setStatus({ tone: 'success', message: `Project "${created.project?.name ?? 'Web App'}" created. Copy the write key now — it is shown once.` });
  }

  async function handleRegenerateWriteKey() {
    setIsRegenerating(true);
    setStatus(null);
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsRegenerating(false);
      return;
    }
    const response = await fetch(`${apiBaseUrl}/v1/setup/write-key/regenerate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setIsRegenerating(false);
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readApiError(response) });
      return;
    }
    setSetup((await response.json()) as SetupResponse);
    setIsRegenerateDialogOpen(false);
    setStatus({ tone: 'success', message: 'New write key generated. Copy it now; it will be hidden later.' });
  }

  return (
    <section className="grid gap-5" aria-labelledby="setup-title">
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="setup-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {hasProject ? 'Project settings' : 'Create your tracking workspace'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {hasProject
              ? 'Manage the active project — switch projects or create new ones from here.'
              : 'Create an organization, a project, and the first SDK write key for browser event tracking.'}
          </p>
        </div>

        {hasProject && canManageProject ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ProjectSwitcher projectId={projectId} organizationId={organizationId} />
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              type="button"
              onClick={() => {
                setNewProjectOpen(true);
                setCreatedProject(null);
                setStatus(null);
              }}
            >
              <Plus className="size-4" />
              New project
            </button>
          </div>
        ) : hasProject ? (
          <div className="shrink-0">
            <ProjectSwitcher projectId={projectId} organizationId={organizationId} />
          </div>
        ) : null}
      </div>

      {status ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${status.tone === 'success'
            ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
            : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
            }`}
        >
          {status.message}
        </p>
      ) : null}

      {isLoading ? (
        <SetupSkeleton />
      ) : !hasProject ? (
        organizationRole === 'member' ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            This organization has no projects yet. Only owners and admins can create one — ask an owner or admin to set up the first project.
          </p>
        ) : (
          <form
            className="grid items-end gap-3 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={handleSubmit}
          >
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="organizationName">
              Organization name
              <input
                className={inputClass}
                id="organizationName"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="projectName">
              Project name
              <input
                className={inputClass}
                id="projectName"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                required
              />
            </label>
            <button
              className="min-h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating…' : 'Create project'}
            </button>
          </form>
        )
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <SetupCard label="Organization" value={setup?.organization?.name ?? '—'} detail={setup?.organization?.id} copyLabel="Copy org ID" />
            <SetupCard
              label="Project ID"
              value={setup?.project?.id ?? '—'}
              detail={setup?.project?.name ? `${setup.project.name} / ${setup.project.slug}` : null}
              copyValue={setup?.project?.id}
              copyLabel="Copy project ID"
              mono
            />
            <SetupCard
              label="Write key"
              value={setup?.writeKey?.value ?? setup?.writeKey?.prefix ?? 'Hidden'}
              detail={setup?.writeKey?.value ? 'Copy it now — shown only once.' : 'Hidden. Regenerate to get a fresh key.'}
              copyValue={setup?.writeKey?.value ?? null}
              copyLabel="Copy write key"
              mono
            />
          </div>

          {canManageOrganization ? (
            <form
              className="grid items-end gap-3 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={handleRenameOrganization}
            >
              <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="organizationName">
                Organization name
                <input
                  className={inputClass}
                  id="organizationName"
                  value={setupOrgName}
                  onChange={(event) => setSetupOrgName(event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <button
                className="min-h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                type="submit"
                disabled={isRenamingOrg || !setupOrgName.trim() || setupOrgName.trim() === setup?.organization?.name}
              >
                {isRenamingOrg ? 'Saving…' : 'Save name'}
              </button>
            </form>
          ) : null}

          {setup?.sdkSnippet ? (
            <div className="grid gap-3 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">SDK snippet</h3>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Paste into a browser app to send the first event.</p>
                </div>
                <CopyButton value={setup.sdkSnippet} label="Copy snippet" />
              </div>
              <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <code>{setup.sdkSnippet}</code>
              </pre>
            </div>
          ) : null}

          <div className="flex flex-col justify-between gap-3 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Write-key recovery</h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Keys are shown once. Regenerate if it is lost or compromised — the old key stops working.
              </p>
            </div>
            <button
              className="h-9 shrink-0 rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              type="button"
              disabled={isRegenerating}
              onClick={() => setIsRegenerateDialogOpen(true)}
            >
              {isRegenerating ? 'Regenerating…' : 'Regenerate write key'}
            </button>
          </div>

          {canManageProject && (createdProject?.project || newProjectOpen) ? (
            <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              {createdProject?.project ? (
                <div className="grid gap-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                        New project created — {createdProject.project.name}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                        Project ID {createdProject.project.id}. Copy the write key now; it is shown once.
                      </p>
                    </div>
                    <button
                      className="h-9 shrink-0 rounded-md bg-neutral-900 px-3 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                      type="button"
                      onClick={() => router.push(`/dashboard?projectId=${encodeURIComponent(createdProject.project!.id)}`)}
                    >
                      Open project
                    </button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <SetupCard
                      label="Write key"
                      value={createdProject.writeKey?.value ?? 'Hidden'}
                      detail="Copy it now — shown only once."
                      copyValue={createdProject.writeKey?.value ?? null}
                      copyLabel="Copy write key"
                      mono
                    />
                    {createdProject.sdkSnippet ? (
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                            SDK snippet
                          </span>
                          <CopyButton value={createdProject.sdkSnippet} label="Copy snippet" compact />
                        </div>
                        <pre className="max-h-40 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-6 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          <code>{createdProject.sdkSnippet}</code>
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Create another project</h3>
                    <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                      Add a separate project for another app or product in {setup?.organization?.name ?? 'this organization'}. Each project gets its own write key.
                    </p>
                  </div>
                  <form className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCreateProject}>
                    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="newProjectName">
                      Project name
                      <input
                        className={inputClass}
                        id="newProjectName"
                        value={newProjectName}
                        onChange={(event) => setNewProjectName(event.target.value)}
                        placeholder="Web App"
                        maxLength={80}
                        required
                        autoFocus
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        type="button"
                        disabled={isCreatingProject}
                        onClick={() => setNewProjectOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                        type="submit"
                        disabled={isCreatingProject}
                      >
                        {isCreatingProject ? 'Creating…' : 'Create project'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      <DashboardDialog
        open={isRegenerateDialogOpen}
        title="Regenerate write key?"
        description="This revokes the current active write key. Any site using the old key stops sending events until you update the SDK snippet."
        onClose={() => {
          if (!isRegenerating) setIsRegenerateDialogOpen(false);
        }}
        footer={
          <>
            <button
              className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              type="button"
              disabled={isRegenerating}
              onClick={() => setIsRegenerateDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              type="button"
              disabled={isRegenerating}
              onClick={handleRegenerateWriteKey}
            >
              {isRegenerating ? 'Regenerating…' : 'Regenerate key'}
            </button>
          </>
        }
      >
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Copy the new key immediately after regeneration.</p>
          <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            For security, TraceIQ shows the full write key once. The dashboard keeps only the prefix afterwards.
          </p>
        </div>
      </DashboardDialog>
    </section>
  );
}

function SetupSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-5 w-32" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-28 w-full" />
      </div>
    </div>
  );
}

function SetupCard({
  label,
  value,
  detail,
  copyValue,
  copyLabel,
  mono = false
}: {
  label: string;
  value: string;
  detail?: string | null;
  copyValue?: string | null;
  copyLabel?: string;
  mono?: boolean;
}) {
  const resolvedCopyValue = copyValue === undefined ? detail : copyValue;

  return (
    <article className="min-h-36 rounded-md border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</span>
        {resolvedCopyValue ? <CopyButton value={resolvedCopyValue} label={copyLabel ?? 'Copy'} compact /> : null}
      </div>
      <h3 className={`mt-3 text-base font-semibold text-neutral-900 [overflow-wrap:anywhere] dark:text-white ${mono ? 'font-mono text-sm' : ''}`}>
        {value}
      </h3>
      {detail ? <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-slate-500 [overflow-wrap:anywhere]">{detail}</p> : null}
    </article>
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
      className={`rounded-md border border-neutral-300 bg-white font-semibold text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-white dark:hover:text-white ${compact ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm'
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
