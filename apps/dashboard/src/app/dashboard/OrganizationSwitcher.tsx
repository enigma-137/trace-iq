'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Box, Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { OrganizationSummary, setActiveOrganizationId, useOrganization, useOrganizations } from '@/lib/organization';

const apiBaseUrl = process.env.NEXT_NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const PANEL_WIDTH = 288;

interface OrganizationSwitcherProps {
  collapsed?: boolean;
  projectId?: string | null;
  organizationId?: string | null;
}

/**
 * The organization card in the sidebar footer. Renders as a button; clicking it
 * opens a popover listing every organization the user belongs to, lets them
 * switch (jumping to that organization's first project) or add a new one.
 */
export function OrganizationSwitcher({ collapsed = false, projectId, organizationId }: OrganizationSwitcherProps) {
  const { organization } = useOrganization(projectId, organizationId);
  const { organizations, loading: orgsLoading, refresh: refreshOrganizations } = useOrganizations();

  const [open, setOpen] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; up: number; left: number; width: number; dropUp: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setAnchor({
      top: rect.bottom,
      up: rect.top,
      left: rect.left,
      width: rect.width,
      dropUp: rect.top > window.innerHeight / 2
    });
    setOpen(true);
    if (organizations.length === 0) {
      void refreshOrganizations();
    }
  }

  async function getAccessToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token;
  }

  function handleSelect(org: OrganizationSummary) {
    setActiveOrganizationId(org.id);
    setOpen(false);
    setCreating(false);
    if (org.project?.id) {
      router.push(`/dashboard?projectId=${encodeURIComponent(org.project.id)}`);
    } else {
      router.push(`/dashboard/settings?organizationId=${encodeURIComponent(org.id)}`);
    }
  }

  function handleSelectProject(org: OrganizationSummary, project: { id: string }) {
    setActiveOrganizationId(org.id);
    setOpen(false);
    setCreating(false);
    router.push(`/dashboard?projectId=${encodeURIComponent(project.id)}`);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setSubmitting(false);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/organizations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: orgName.trim() || 'My Organization',
        projectName: projectName.trim() || 'Web App'
      })
    });
    setSubmitting(false);

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    const body = (await response.json()) as { organization: { id: string }; project: { id: string } };
    setActiveOrganizationId(body.organization.id);
    setOpen(false);
    setCreating(false);
    router.push(`/dashboard?projectId=${encodeURIComponent(body.project.id)}`);
  }

  const currentName = organization?.name || 'Your Organization';
  const currentInitial = (currentName[0] || 'A').toUpperCase();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? `Switch organization — ${currentName}` : undefined}
        className={
          collapsed
            ? 'flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700'
            : 'flex w-full items-center gap-2.5 rounded-lg border border-neutral-200/80 bg-neutral-50/80 p-2 text-left transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900'
        }
      >
        {!collapsed ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white shadow-sm">
            {currentInitial}
          </div>
        ) : null}

        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-neutral-800 dark:text-slate-200" title={currentName}>
                {currentName}
                {organization?.memberCount !== undefined && (
                  <span className="font-normal text-neutral-400 dark:text-slate-500">
                    {' '}· {organization.memberCount} member{organization.memberCount === 1 ? '' : 's'}
                  </span>
                )}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] text-neutral-400 dark:text-slate-400">Switch organization</p>
              </div>
            </div>
            <ChevronDown className="size-4 shrink-0 text-neutral-400 dark:text-slate-500" />
          </>
        ) : (
          <span className="text-xs font-semibold text-white">{currentInitial}</span>
        )}
      </button>

      {open && anchor
        ? createPortal(
            <div className="fixed inset-0 z-50" role="presentation" onMouseDown={() => setOpen(false)}>
              <div
                className="absolute z-10 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl shadow-neutral-950/10 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40"
                role="menu"
                aria-label="Switch organization"
                style={{
                  top: anchor.dropUp ? undefined : anchor.top + 8,
                  bottom: anchor.dropUp ? window.innerHeight - anchor.up + 8 : undefined,
                  left: Math.max(12, Math.min(anchor.left, window.innerWidth - PANEL_WIDTH - 12)),
                  width: Math.max(anchor.width, PANEL_WIDTH)
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-slate-800">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                    Organizations
                  </p>
                  <button
                    type="button"
                    aria-label="Close organization switcher"
                    className="inline-flex size-6 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                    onClick={() => setOpen(false)}
                  >
                    x
                  </button>
                </div>

                <ul className="max-h-72 overflow-y-auto py-1" aria-label="Your organizations">
                  {orgsLoading && organizations.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-neutral-400 dark:text-slate-500">Loading…</li>
                  ) : organizations.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-neutral-400 dark:text-slate-500">
                      No organizations yet.
                    </li>
                  ) : (
                    organizations.map((org) => {
                      const isCurrent = org.id === organization?.id;
                      const isExpanded = expandedOrg === org.id;
                      const projects = org.projects ?? (org.project ? [org.project] : []);
                      return (
                        <li key={org.id}>
                          <div className="flex items-center">
                            <button
                              type="button"
                              aria-label={isExpanded ? 'Hide projects' : `Show projects of ${org.name}`}
                              className={`flex h-9 w-7 shrink-0 items-center justify-center text-neutral-400 transition hover:text-neutral-700 dark:text-slate-500 dark:hover:text-slate-300 ${
                                projects.length === 0 ? 'pointer-events-none opacity-40' : ''
                              }`}
                              onClick={() => setExpandedOrg(isExpanded ? null : org.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleSelect(org)}
                              className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-3 text-left transition hover:bg-neutral-100 dark:hover:bg-slate-900 ${
                                isCurrent ? 'bg-blue-50/60 dark:bg-slate-900/70' : ''
                              }`}
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                                {(org.name[0] || '?').toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">
                                  {org.name}
                                </span>
                                <span className="block text-[10px] capitalize text-neutral-400 dark:text-slate-500">
                                  {org.role} · {org.memberCount ?? 0} member{org.memberCount === 1 ? '' : 's'}
                                  {' · '}
                                  {projects.length > 1
                                    ? `${projects.length} projects`
                                    : projects.length === 1
                                      ? projects[0].name
                                      : 'no project yet'}
                                </span>
                              </span>
                              {isCurrent ? (
                                <Check className="size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-label="Current organization" />
                              ) : null}
                            </button>
                          </div>

                          {isExpanded ? (
                            <ul className="ml-5 border-l border-neutral-200 py-1 pl-2 dark:border-slate-800" aria-label={`Projects in ${org.name}`}>
                              {projects.length === 0 ? (
                                <li className="px-2 py-1.5 text-xs text-neutral-400 dark:text-slate-500">No projects yet.</li>
                              ) : (
                                projects.map((project) => (
                                  <li key={project.id}>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => handleSelectProject(org, project)}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-900"
                                    >
                                      <Box className="size-3.5 shrink-0 text-neutral-400 dark:text-slate-500" />
                                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                    </button>
                                  </li>
                                ))
                              )}
                              {org.role === 'owner' || org.role === 'admin' ? (
                                <li>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setActiveOrganizationId(org.id);
                                      setOpen(false);
                                      setCreating(false);
                                      router.push(`/dashboard/settings?organizationId=${encodeURIComponent(org.id)}&newProject=1`);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-900"
                                  >
                                    <Plus className="size-3.5" />
                                    Add project
                                  </button>
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="border-t border-neutral-200 p-2 dark:border-slate-800">
                  {creating ? (
                    <form onSubmit={handleCreate} className="grid gap-2 p-1">
                      <label className="grid gap-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                        Organization name
                        <input
                          className={inputClass}
                          value={orgName}
                          onChange={(event) => setOrgName(event.target.value)}
                          placeholder="My Organization"
                          maxLength={80}
                          autoFocus
                        />
                      </label>
                      <label className="grid gap-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                        Project name
                        <input
                          className={inputClass}
                          value={projectName}
                          onChange={(event) => setProjectName(event.target.value)}
                          placeholder="Web App"
                          maxLength={80}
                        />
                      </label>
                      {error ? (
                        <p className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                          {error}
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="h-8 rounded-md px-3 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-900"
                          onClick={() => setCreating(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex h-8 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                        >
                          {submitting ? 'Creating…' : 'Create'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={() => {
                        setCreating(true);
                        setError(null);
                      }}
                    >
                      <Plus className="size-4" />
                      Add organization
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

const inputClass =
  'h-9 rounded-md border border-neutral-300 bg-white px-2.5 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
