'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readActiveProjectIdFromDocument } from '@/lib/active-project';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import {
  autoCreateDraft,
  linearReturnMessage,
  parseAutoCreateDraft,
  sameAutoCreate,
  type AutoCreateDraft,
  readLinearReturn,
  statusLabel,
  stripLinearReturn,
  type LinearLabel,
  type LinearStatusResponse
} from '@/lib/linear';
import { LinearIcon } from '@/components/ProviderIcons';
import { Skeleton } from '@/components/Skeleton';
import { DashboardDialog } from '../../DashboardDialog';
import {
  Notice,
  SettingsCard,
  SettingsRow,
  StatusPill,
  dangerButton,
  fieldLabelClass,
  inputClass,
  primaryButton,
  secondaryButton,
  Switch
} from '../SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const LINEAR_API = `${apiBaseUrl}/v1/integrations/linear`;

type Busy = 'connect' | 'complete' | 'disconnect' | 'save' | null;

export function LinearIntegrationCard({ projectId: projectIdProp }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [projectId] = useState(() => projectIdProp ?? readActiveProjectIdFromDocument() ?? undefined);
  const [status, setStatus] = useState<LinearStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [labelId, setLabelId] = useState('');
  const [autoDraft, setAutoDraft] = useState<AutoCreateDraft>(() => autoCreateDraft(null));
  const [labels, setLabels] = useState<LinearLabel[] | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const handledReturn = useRef(false);

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const access = (await supabase.auth.getSession()).data.session?.access_token;
    return access ? { Authorization: `Bearer ${access}` } : null;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const headers = await authHeaders();
      if (!headers) return setLoadError('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${LINEAR_API}/status${query}`, { headers });
      if (!response.ok) return setLoadError(await readApiError(response, 'Could not load the Linear connection.'));
      const body = (await response.json()) as LinearStatusResponse;
      setStatus(body);
      const saved = body.projects?.find((item) => item.projectId === body.project?.id);
      setTeamId(saved?.teamId ?? '');
      setLabelId(saved?.labelId ?? '');
      setAutoDraft(autoCreateDraft(saved));
    } catch (error) {
      setLoadError(await readApiError(error, 'Could not load the Linear connection.'));
    }
  }, [authHeaders, query]);

  // Coming back from Linear: finish the connection with this session, then load.
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const returned = readLinearReturn(new URLSearchParams(window.location.search));
    // Drop the code from the address bar before anything else, so it is never replayed.
    if (returned) window.history.replaceState(null, '', stripLinearReturn(window.location.href));

    void (async () => {
      if (returned?.kind === 'error') {
        toast.error(linearReturnMessage(returned.reason), { title: 'Linear not connected' });
      } else if (returned?.kind === 'complete') {
        setBusy('complete');
        try {
          const headers = await authHeaders();
          if (!headers) {
            toast.error('Your dashboard session expired. Sign in again, then connect Linear.');
          } else {
            const response = await fetch(`${LINEAR_API}/complete`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: returned.code, state: returned.state })
            });
            if (response.ok) {
              const body = (await response.json()) as { workspace?: { name?: string | null } };
              toast.success(`Issues will be created by the TraceIQ app in ${body.workspace?.name ?? 'your workspace'}.`, { title: 'Linear connected' });
            } else {
              toast.error(await readApiError(response, 'Could not connect Linear.'), { title: 'Linear not connected' });
            }
          }
        } catch (error) {
          toast.error(await readApiError(error, 'Could not connect Linear.'), { title: 'Linear not connected' });
        } finally {
          setBusy(null);
        }
      }
      await load();
    })();
  }, [authHeaders, load]);

  // Labels for the chosen team.
  useEffect(() => {
    setLabels(null);
    setLabelsError(null);
    if (!teamId || status?.status !== 'active') return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch(`${LINEAR_API}/teams/${encodeURIComponent(teamId)}/labels${query}`, { headers });
        if (cancelled) return;
        if (!response.ok) return setLabelsError(await readApiError(response, 'Could not load labels.'));
        const body = (await response.json()) as { labels: LinearLabel[] };
        if (!cancelled) setLabels(body.labels);
      } catch (error) {
        if (!cancelled) setLabelsError(await readApiError(error, 'Could not load labels.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, status?.status, authHeaders, query]);

  async function connect() {
    setBusy('connect');
    let leaving = false;
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${LINEAR_API}/connect${query}`, { headers });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not start the Linear connection.'));
      const { url } = (await response.json()) as { url: string };
      leaving = true;
      window.location.assign(url);
    } catch (error) {
      toast.error(await readApiError(error, 'Could not start the Linear connection.'));
    } finally {
      // On success the browser is on its way to Linear; keep the button busy until it leaves.
      if (!leaving) setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${LINEAR_API}${query}`, { method: 'DELETE', headers });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not disconnect Linear.'));
      const body = (await response.json()) as { revoked?: boolean };
      toast.success(
        body.revoked ? 'TraceIQ can no longer create issues in Linear.' : 'Disconnected. Remove TraceIQ under Linear → Settings → Applications to revoke it there too.',
        { title: 'Linear disconnected' }
      );
      setConfirmingDisconnect(false);
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not disconnect Linear.'));
    } finally {
      setBusy(null);
    }
  }

  async function saveDefaults() {
    if (!status?.project || !teamId) return;
    const parsed = parseAutoCreateDraft(autoDraft);
    if ('error' in parsed) return toast.error(parsed.error, { title: 'Check the auto-create thresholds' });
    setBusy('save');
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${LINEAR_API}/projects/${encodeURIComponent(status.project.id)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, labelId: labelId || null, autoCreate: parsed.rule })
      });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not save the Linear defaults.'));
      toast.success(`New issues from ${status.project.name} go to this team.`, { title: 'Linear defaults saved' });
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not save the Linear defaults.'));
    } finally {
      setBusy(null);
    }
  }

  const pill = status ? statusLabel(status.status) : null;
  const saved = status?.projects?.find((item) => item.projectId === status.project?.id);
  const dirty = teamId !== (saved?.teamId ?? '') || labelId !== (saved?.labelId ?? '') || !sameAutoCreate(autoDraft, saved);
  const draftError = autoDraft.enabled ? (() => {
    const parsed = parseAutoCreateDraft(autoDraft);
    return 'error' in parsed ? parsed.error : null;
  })() : null;
  const canManage = status?.canManage ?? false;

  const headerActions = !status || !status.configured ? null : status.status === 'not_connected' ? (
    canManage ? (
      <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void connect()}>
        {busy === 'connect' ? 'Opening Linear…' : busy === 'complete' ? 'Connecting…' : 'Connect Linear'}
      </button>
    ) : null
  ) : canManage ? (
    <>
      {status.status === 'needs_reconnect' ? (
        <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void connect()}>
          {busy === 'connect' ? 'Opening Linear…' : 'Reconnect'}
        </button>
      ) : null}
      <button type="button" className={dangerButton} disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}>
        Disconnect
      </button>
    </>
  ) : null;

  return (
    <SettingsCard
      iconNode={<LinearIcon className="size-[18px] text-neutral-900 dark:text-white" />}
      title="Linear"
      description="Turn errors into Linear issues. Issues are created by the TraceIQ app, with the stack trace and a link back here."
      actions={headerActions}
    >
      {loadError ? (
        <div className="px-5 py-4">
          <Notice tone="error">{loadError}</Notice>
        </div>
      ) : !status ? (
        <div className="grid gap-3 px-5 py-4" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : !status.configured && status.status === 'not_connected' ? (
        <div className="px-5 py-4">
          <Notice tone="info">
            Linear is not set up on this TraceIQ server. An administrator needs to set <code>LINEAR_CLIENT_ID</code> and{' '}
            <code>LINEAR_CLIENT_SECRET</code> (see docs/integrations-linear.md).
          </Notice>
        </div>
      ) : (
        <>
          <SettingsRow
            label="Status"
            hint={
              status.status === 'not_connected'
                ? canManage
                  ? 'Connect once for the whole organization.'
                  : 'Ask an owner or admin to connect Linear.'
                : status.status === 'needs_reconnect'
                  ? 'Linear stopped accepting TraceIQ’s access. Reconnect to keep creating issues.'
                  : undefined
            }
          >
            <span className="inline-flex flex-wrap items-center gap-2">
              {pill ? <StatusPill tone={pill.tone}>{pill.text}</StatusPill> : null}
              {status.workspace?.name ? <span>{status.workspace.name}</span> : null}
            </span>
          </SettingsRow>

          {status.error ? (
            <div className="px-5 pb-4">
              <Notice tone="warning">{status.error}</Notice>
            </div>
          ) : null}

          {status.status === 'active' ? (
            status.project ? (
              <SettingsRow
                label={`Defaults for ${status.project.name}`}
                hint="Where “Create Linear issue” puts new issues for this project."
                actions={
                  canManage ? (
                    <button type="button" className={secondaryButton} disabled={busy !== null || !teamId || !dirty || draftError !== null} onClick={() => void saveDefaults()}>
                      {busy === 'save' ? 'Saving…' : 'Save'}
                    </button>
                  ) : null
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={fieldLabelClass}>
                    Team
                    <select
                      className={inputClass}
                      value={teamId}
                      disabled={!canManage || busy !== null}
                      onChange={(event) => {
                        setTeamId(event.target.value);
                        setLabelId('');
                      }}
                    >
                      <option value="">Choose a team…</option>
                      {(status.teams ?? []).map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.key})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldLabelClass}>
                    Label <span className="font-normal text-neutral-400">(optional)</span>
                    <select
                      className={inputClass}
                      value={labelId}
                      disabled={!canManage || busy !== null || !teamId || labels === null}
                      onChange={(event) => setLabelId(event.target.value)}
                    >
                      <option value="">{teamId && labels === null && !labelsError ? 'Loading labels…' : 'No label'}</option>
                      {(labels ?? []).map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {labelsError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{labelsError}</p> : null}
                {!saved ? (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">Choose a team before creating issues from this project.</p>
                ) : null}

                <div className="mt-4 grid gap-3 rounded-lg border border-neutral-200 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">Create issues automatically</p>
                      <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">
                        Off by default. When an error reaches either threshold (last 90 days), TraceIQ creates one Linear issue for it.
                        Ignored errors and errors that already have an issue are skipped.
                      </p>
                    </div>
                    <Switch
                      label="Create Linear issues automatically"
                      checked={autoDraft.enabled}
                      disabled={!canManage || busy !== null || !teamId}
                      onChange={(enabled) => setAutoDraft((draft) => ({ ...draft, enabled }))}
                    />
                  </div>
                  {autoDraft.enabled ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={fieldLabelClass}>
                        Occurrences at least
                        <input
                          className={inputClass}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          placeholder="e.g. 50"
                          value={autoDraft.minOccurrences}
                          disabled={!canManage || busy !== null}
                          onChange={(event) => setAutoDraft((draft) => ({ ...draft, minOccurrences: event.target.value }))}
                        />
                      </label>
                      <label className={fieldLabelClass}>
                        Or affected users at least
                        <input
                          className={inputClass}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          placeholder="e.g. 10"
                          value={autoDraft.minUsers}
                          disabled={!canManage || busy !== null}
                          onChange={(event) => setAutoDraft((draft) => ({ ...draft, minUsers: event.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}
                  {draftError ? <p className="text-xs text-red-600 dark:text-red-400">{draftError}</p> : null}
                </div>
              </SettingsRow>
            ) : (
              <SettingsRow label="Project defaults">
                <span className="text-neutral-500 dark:text-slate-400">Create a project to choose its default Linear team.</span>
              </SettingsRow>
            )
          ) : null}
        </>
      )}

      <DashboardDialog
        open={confirmingDisconnect}
        title="Disconnect Linear?"
        description="TraceIQ will stop creating issues in Linear for this organization, and every project’s default team is cleared. Existing Linear issues are not changed."
        maxWidthClass="max-w-sm"
        onClose={() => (busy ? undefined : setConfirmingDisconnect(false))}
        footer={
          <>
            <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => setConfirmingDisconnect(false)} autoFocus>
              Cancel
            </button>
            <button type="button" className={dangerButton} disabled={busy !== null} onClick={() => void disconnect()}>
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        }
      />
    </SettingsCard>
  );
}
