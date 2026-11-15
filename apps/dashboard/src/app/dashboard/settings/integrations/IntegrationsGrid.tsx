'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readActiveProjectIdFromDocument } from '@/lib/active-project';
import type { LinearStatusResponse } from '@/lib/linear';
import type { GitHubStatusResponse } from '@/lib/github-integration';
import { GitHubIcon, LinearIcon } from '@/components/ProviderIcons';
import { SlackLogo, TelegramLogo } from '@/components/BrandLogos';
import { Skeleton } from '@/components/Skeleton';
import { BriefChannelCard, takeSlackReturn, useBriefChannels } from '../../alerts/brief-channels';
import { briefTile, githubTile, linearTile, returningIntegration, type IntegrationKey, type TileState } from '@/lib/integration-tiles';
import { GITHUB_INTEGRATION_API } from './github-install';
import { GitHubIntegrationCard } from './GitHubIntegrationCard';
import { LinearIntegrationCard } from './LinearIntegrationCard';
import { StatusPill, primaryButton, secondaryButton } from '../SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TILES: Record<IntegrationKey, { name: string; icon: ReactNode; description: string }> = {
  github: {
    name: 'GitHub',
    icon: <GitHubIcon className="h-5 w-5 text-neutral-900 dark:text-white" />,
    description: 'Link a repository for source links on errors and one-click setup pull requests.'
  },
  linear: {
    name: 'Linear',
    icon: <LinearIcon className="h-5 w-5 text-[#5E6AD2]" />,
    description: 'Create Linear issues from errors and keep their status in sync both ways.'
  },
  slack: {
    name: 'Slack',
    icon: <SlackLogo size={20} />,
    description: 'Post the daily brief to a Slack channel you choose.'
  },
  telegram: {
    name: 'Telegram',
    icon: <TelegramLogo size={20} />,
    description: 'Get the daily brief in a Telegram chat, and ask the bot questions.'
  }
};

const ORDER: IntegrationKey[] = ['github', 'linear', 'slack', 'telegram'];

/** Settings → Integrations: one card per tool; Connect or Manage opens its full settings in a dialog. */
export function IntegrationsGrid({ projectId: projectIdProp }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [projectId] = useState(() => projectIdProp ?? readActiveProjectIdFromDocument() ?? undefined);
  const [open, setOpen] = useState<IntegrationKey | null>(null);
  const [github, setGitHub] = useState<GitHubStatusResponse | null | 'error'>(null);
  const [linear, setLinear] = useState<LinearStatusResponse | null | 'error'>(null);
  const briefs = useBriefChannels(projectId, { returnTo: 'integrations' });

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  const refresh = useCallback(async () => {
    const access = (await supabase.auth.getSession()).data.session?.access_token;
    if (!access) {
      setGitHub('error');
      setLinear('error');
      return;
    }
    const headers = { Authorization: `Bearer ${access}` };
    const read = async <T,>(url: string): Promise<T | 'error'> => {
      try {
        const response = await fetch(url, { headers });
        return response.ok ? ((await response.json()) as T) : 'error';
      } catch {
        return 'error';
      }
    };
    const [nextGitHub, nextLinear] = await Promise.all([
      read<GitHubStatusResponse>(`${GITHUB_INTEGRATION_API}/status${query}`),
      read<LinearStatusResponse>(`${apiBaseUrl}/v1/integrations/linear/status${query}`)
    ]);
    setGitHub(nextGitHub);
    setLinear(nextLinear);
  }, [supabase, query]);

  // Coming back from GitHub, Linear or Slack: open that card so it can finish (GitHub, Linear) or show the result.
  useEffect(() => {
    const returning = returningIntegration(new URLSearchParams(window.location.search));
    if (returning === 'slack') takeSlackReturn();
    if (returning) setOpen(returning);
    void refresh();
  }, [refresh]);

  function close() {
    setOpen(null);
    void refresh();
    void briefs.load();
  }

  const states: Record<IntegrationKey, TileState | null | 'error'> = {
    github: github === 'error' || github === null ? github : githubTile(github),
    linear: linear === 'error' || linear === null ? linear : linearTile(linear),
    slack: briefs.status
      ? briefTile('slack', briefs.status.slack.configured, briefs.status.channels.filter((c) => c.kind === 'slack').length)
      : briefs.message
        ? 'error'
        : null,
    telegram: briefs.status
      ? briefTile('telegram', briefs.status.telegram.configured, briefs.status.channels.filter((c) => c.kind === 'telegram').length)
      : briefs.message
        ? 'error'
        : null
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ORDER.map((key) => (
          <IntegrationTile key={key} id={key} state={states[key]} onOpen={() => setOpen(key)} />
        ))}
      </div>

      <IntegrationDialog open={open !== null} title={open ? `${TILES[open].name} settings` : ''} onClose={close}>
        {open === 'github' ? <GitHubIntegrationCard projectId={projectId} /> : null}
        {open === 'linear' ? <LinearIntegrationCard projectId={projectId} /> : null}
        {open === 'slack' || open === 'telegram' ? (
          <div className="grid gap-3">
            <BriefChannelCard kind={open} briefs={briefs} />
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              More about the daily brief, including the Telegram commands, is on the{' '}
              <a href={`/dashboard/alerts?tab=brief${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`} className="font-medium underline underline-offset-2">
                Alerts page
              </a>
              .
            </p>
          </div>
        ) : null}
      </IntegrationDialog>
    </>
  );
}

function IntegrationTile({ id, state, onOpen }: { id: IntegrationKey; state: TileState | null | 'error'; onOpen: () => void }) {
  const tile = TILES[id];
  const ready = state !== null && state !== 'error';
  const connected = ready && state.connected;
  const available = !ready || state.available;
  return (
    <section
      aria-labelledby={`integration-${id}`}
      className="flex min-h-[188px] flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 dark:border-slate-700 dark:bg-slate-800">
          {tile.icon}
        </span>
        {state === null ? (
          <Skeleton className="h-5 w-20" />
        ) : state === 'error' ? (
          <StatusPill tone="neutral">Unknown</StatusPill>
        ) : (
          <StatusPill tone={state.pill.tone}>{state.pill.text}</StatusPill>
        )}
      </div>
      <h3 id={`integration-${id}`} className="mt-4 text-sm font-semibold text-neutral-950 dark:text-white">
        {tile.name}
      </h3>
      <p className="mt-1 text-sm leading-5 text-neutral-500 dark:text-slate-400">{tile.description}</p>
      {ready && state.detail ? (
        <p className="mt-2 truncate text-xs font-medium text-neutral-600 dark:text-slate-300" title={state.detail}>
          {state.detail}
        </p>
      ) : null}
      <div className="mt-auto pt-4">
        <button
          type="button"
          className={connected ? secondaryButton : primaryButton}
          onClick={onOpen}
          disabled={!available || state === null}
          aria-label={`${connected ? 'Manage' : 'Connect'} ${tile.name}`}
        >
          {connected ? 'Manage' : 'Connect'}
        </button>
      </div>
    </section>
  );
}

/**
 * A tall, scrollable dialog for a settings card. Escape closes it unless another dialog
 * (such as a card's own "Disconnect?" confirmation) is open on top.
 */
function IntegrationDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      // No backdrop-blur here: it would make this the containing block for the cards' own fixed confirm dialogs.
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-neutral-950/55 px-4 py-6 sm:py-12 dark:bg-black/75"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-dialog-title"
        className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-neutral-50 p-4 shadow-2xl shadow-neutral-950/20 sm:p-5 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="integration-dialog-title" className="text-base font-semibold text-neutral-950 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
