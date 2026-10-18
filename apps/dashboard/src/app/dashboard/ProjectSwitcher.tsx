'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import CubeIcon from '@hugeicons/core-free-icons/CubeIcon';
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { setActiveOrganizationId, useOrganization, useOrganizations } from '@/lib/organization';

const PANEL_WIDTH = 288;

interface ProjectSwitcherProps {
  projectId?: string | null;
  organizationId?: string | null;
  /** `card` is the labelled box used in settings; `inline` is the bare name + chevron used in the header breadcrumb. */
  variant?: 'card' | 'inline';
  /** Where picking a project goes: project settings, or the current page for the new project. */
  target?: 'settings' | 'current';
  /** Name to show before the organization list loads (e.g. the server-rendered project name). */
  fallbackName?: string | null;
  /** Adds a "Project details & ID" item to the menu. */
  onShowDetails?: () => void;
}

/**
 * Where to land after switching project while staying "on the same page".
 * Detail routes (/dashboard/flags/<id>) belong to the old project, so we go up
 * to the section; settings keeps its sub-tab (/dashboard/settings/billing).
 */
export function projectSwitchPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'dashboard') return '/dashboard';
  const depth = segments[1] === 'settings' ? 3 : 2;
  return `/${segments.slice(0, depth).join('/')}`;
}

/**
 * Project switcher: states the current project, opens a menu to switch to
 * another project in the same organization, and offers a shortcut to create a
 * new one.
 */
export function ProjectSwitcher({
  projectId,
  organizationId,
  variant = 'card',
  target = 'settings',
  fallbackName,
  onShowDetails
}: ProjectSwitcherProps) {
  const { organization, loading: orgLoading } = useOrganization(projectId, organizationId);
  const { organizations, loading: orgsLoading } = useOrganizations();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; up: number; left: number; width: number; dropUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeOrg = organizations.find((o) => o.id === organization?.id) ?? organizations[0] ?? null;
  const projects = activeOrg?.projects ?? [];
  const currentProject = projects.find((p) => p.id === projectId) ?? activeOrg?.project ?? null;

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
  }

  function handleSelectProject(project: { id: string }) {
    if (!activeOrg) return;
    setActiveOrganizationId(activeOrg.id);
    setOpen(false);
    if (project.id === currentProject?.id) return;
    const base = target === 'current' ? projectSwitchPath(pathname ?? '/dashboard') : '/dashboard/settings';
    router.push(`${base}?projectId=${encodeURIComponent(project.id)}&organizationId=${encodeURIComponent(activeOrg.id)}`);
  }

  function handleCreateProject() {
    if (!activeOrg) return;
    setActiveOrganizationId(activeOrg.id);
    setOpen(false);
    router.push(`/dashboard/settings?organizationId=${encodeURIComponent(activeOrg.id)}&newProject=1`);
  }

  const isLoading = orgLoading || orgsLoading;
  const currentName = currentProject?.name ?? fallbackName ?? (isLoading ? '…' : '—');

  return (
    <>
      {variant === 'inline' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          aria-haspopup="menu"
          aria-expanded={open}
          title={`Switch project — ${currentName}`}
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:text-white dark:hover:bg-slate-900"
        >
          <span className="max-w-[14rem] truncate">{currentName}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={2}
            className={`shrink-0 text-neutral-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          aria-haspopup="menu"
          aria-expanded={open}
          title={currentName !== '—' ? `Switch project — ${currentName}` : undefined}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-left transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <HugeiconsIcon icon={CubeIcon} size={16} strokeWidth={1.8} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Current project
            </span>
            <span className="block max-w-[12rem] truncate text-sm font-semibold text-neutral-900 dark:text-white">{currentName}</span>
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.8} className="shrink-0 text-neutral-400 dark:text-slate-500" aria-hidden="true" />
        </button>
      )}

      {open && anchor
        ? createPortal(
            <div className="fixed inset-0 z-50" role="presentation" onMouseDown={() => setOpen(false)}>
              <div
                className="absolute z-10 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl shadow-neutral-950/10 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40"
                role="menu"
                aria-label="Switch project"
                style={{
                  top: anchor.dropUp ? undefined : anchor.top + 8,
                  bottom: anchor.dropUp ? window.innerHeight - anchor.up + 8 : undefined,
                  left: Math.max(12, Math.min(anchor.left, window.innerWidth - PANEL_WIDTH - 12)),
                  width: Math.max(anchor.width, PANEL_WIDTH)
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-slate-800">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                    {activeOrg ? `Projects in ${activeOrg.name}` : 'Projects'}
                  </p>
                </div>

                <ul className="max-h-72 overflow-y-auto py-1" aria-label="Your projects">
                  {orgsLoading && projects.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-neutral-400 dark:text-slate-500">Loading…</li>
                  ) : projects.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-neutral-400 dark:text-slate-500">No projects yet.</li>
                  ) : (
                    projects.map((project) => {
                      const isCurrent = project.id === currentProject?.id;
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleSelectProject(project)}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-neutral-100 dark:hover:bg-slate-900 ${
                              isCurrent ? 'bg-blue-50/60 dark:bg-slate-900/70' : ''
                            }`}
                          >
                            <HugeiconsIcon icon={CubeIcon} size={16} strokeWidth={1.8} className="shrink-0 text-neutral-400 dark:text-slate-500" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-white">
                              {project.name}
                            </span>
                            {isCurrent ? (
                              <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.9} className="shrink-0 text-blue-600 dark:text-blue-400" aria-label="Current project" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>

                {onShowDetails || organization?.role === 'owner' || organization?.role === 'admin' ? (
                <div className="border-t border-neutral-200 p-2 dark:border-slate-800">
                  {onShowDetails ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={() => {
                        setOpen(false);
                        onShowDetails();
                      }}
                    >
                      <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.9} aria-hidden="true" />
                      Project details &amp; ID
                    </button>
                  ) : null}
                  {organization?.role === 'owner' || organization?.role === 'admin' ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={handleCreateProject}
                    >
                      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.9} aria-hidden="true" />
                      New project
                    </button>
                  ) : null}
                </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
