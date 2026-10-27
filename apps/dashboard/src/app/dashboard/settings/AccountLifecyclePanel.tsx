'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { retryAfterStepUp } from '@/lib/step-up';
import { Notice, SettingsCard, SettingsSection, dangerButton, secondaryButton } from './SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Organization = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  deletionScheduledAt: string | null;
  deletionRequestId: string | null;
  deletionProcessingIssue: boolean;
};

type LifecycleStatus = {
  organizations: Organization[];
  accountDeletionScheduledAt: string | null;
  accountDeletionProcessingIssue: boolean;
};

export function AccountLifecyclePanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<LifecycleStatus | null>(null);
  const [selectedActions, setSelectedActions] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const send = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setNotice({ tone: 'error', message: 'Your session expired. Sign in again.' });
      return null;
    }
    const request = () => fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
    const response = await request();
    return retryAfterStepUp(response, request);
  }, [supabase]);

  const refresh = useCallback(async () => {
    const response = await send('/v1/dashboard/lifecycle');
    if (!response) return;
    if (!response.ok) {
      setNotice({ tone: 'error', message: await readApiError(response) });
      return;
    }
    const result = await response.json() as LifecycleStatus;
    setStatus(result);
    setSelectedActions((current) => Object.fromEntries(
      result.organizations.map((organization) => [
        organization.id,
        current[organization.id] ?? true
      ])
    ));
  }, [send]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(key: string, path: string, init: RequestInit) {
    setBusy(key);
    setNotice(null);
    const response = await send(path, init);
    setBusy(null);
    if (!response) return false;
    if (!response.ok) {
      setNotice({ tone: 'error', message: await readApiError(response) });
      return false;
    }
    return true;
  }

  async function downloadOrganization(organization: Organization) {
    setBusy(`export:${organization.id}`);
    setNotice(null);
    const response = await send(`/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/export`);
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setNotice({ tone: 'error', message: await readApiError(response) });
      return;
    }
    const result = await response.json() as { filename: string; data: unknown };
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: 'success', message: 'Your organization export has been downloaded.' });
  }

  async function emailOrganization(organization: Organization) {
    const success = await runAction(
      `email:${organization.id}`,
      `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/export/email`,
      { method: 'POST' }
    );
    if (success) setNotice({ tone: 'success', message: 'The organization export was sent to your account email.' });
  }

  async function scheduleOrganization(organization: Organization) {
    if (confirmation !== 'DELETE') {
      setNotice({ tone: 'error', message: 'Type DELETE below to confirm.' });
      return;
    }
    const success = await runAction(
      `delete-org:${organization.id}`,
      `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/delete`,
      { method: 'POST', body: JSON.stringify({ confirmation }) }
    );
    if (success) {
      setConfirmation('');
      setNotice({ tone: 'success', message: `${organization.name} is scheduled for deletion in 30 days. You can cancel before then.` });
      await refresh();
    }
  }

  async function leaveOrganization(organization: Organization) {
    const success = await runAction(
      `leave:${organization.id}`,
      `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/leave`,
      { method: 'DELETE' }
    );
    if (success) {
      setNotice({ tone: 'success', message: `You left ${organization.name}.` });
      await refresh();
    }
  }

  async function scheduleAccount() {
    if (confirmation !== 'DELETE') {
      setNotice({ tone: 'error', message: 'Type DELETE below to confirm account deletion.' });
      return;
    }
    const success = await runAction('/account', '/v1/dashboard/lifecycle/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirmation })
    });
    if (success) {
      setConfirmation('');
      setNotice({ tone: 'success', message: 'Your account is scheduled for deletion in 30 days. Sign in and cancel the request to keep your account.' });
      await refresh();
    }
  }

  async function cancelAccount() {
    const success = await runAction('/account', '/v1/dashboard/lifecycle/account/cancel', { method: 'POST' });
    if (success) {
      setNotice({ tone: 'success', message: 'Account deletion was cancelled.' });
      await refresh();
    }
  }

  if (!status) {
    return (
      <SettingsSection id="account-data" title="Data and account" description="Export your organization data or manage account and organization deletion.">
        <SettingsCard>
          <div className="grid gap-3 p-5">
            {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : <p className="text-sm text-neutral-500 dark:text-slate-400">Loading account lifecycle settings…</p>}
            {notice ? <button className={secondaryButton} type="button" onClick={() => void refresh()}>Retry</button> : null}
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="account-data"
      title="Data and account"
      description="Download or email an organization export, leave organizations, or schedule deletion."
    >
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      <SettingsCard
        title="Export organization data"
        description="Exports database records and compressed session replay payloads (base64) as JSON, up to 50,000 rows or 10 MB. Credential fields are excluded."
      >
        <div className="flex flex-wrap gap-2 p-5">
          {status.organizations.filter((organization) => organization.role === 'owner').map((organization) => (
            <div key={organization.id} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-slate-700">
              <span className="text-sm font-medium">{organization.name}</span>
              <div className="flex gap-2">
                <button className={secondaryButton} type="button" disabled={busy !== null} onClick={() => void downloadOrganization(organization)}>
                  {busy === `export:${organization.id}` ? 'Preparing…' : 'Download JSON'}
                </button>
                <button className={secondaryButton} type="button" disabled={busy !== null} onClick={() => void emailOrganization(organization)}>
                  {busy === `email:${organization.id}` ? 'Sending…' : 'Email JSON'}
                </button>
              </div>
            </div>
          ))}
          {!status.organizations.some((organization) => organization.role === 'owner') ? (
            <p className="text-sm text-neutral-500 dark:text-slate-400">Only organization owners can export a complete organization dataset.</p>
          ) : null}
        </div>
      </SettingsCard>

      <SettingsCard title="Organizations" description="Owners can schedule organization deletion. Other members can leave. Deletion becomes permanent after 30 days.">
        <div className="divide-y divide-neutral-100 dark:divide-slate-800">
          {status.organizations.map((organization) => (
            <div key={organization.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{organization.name}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                  {organization.role}{organization.deletionScheduledAt ? ` · deletion scheduled for ${new Date(organization.deletionScheduledAt).toLocaleString()}` : ''}
                </p>
                {organization.deletionProcessingIssue ? (
                  <div className="mt-2"><Notice tone="warning">Deletion has not completed yet because a cleanup step failed. TraceIQ will retry; contact support if this persists.</Notice></div>
                ) : null}
              </div>
              {organization.deletionScheduledAt ? (
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy !== null}
                  onClick={() => void runAction(
                    `cancel-org:${organization.id}`,
                    `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/cancel`,
                    { method: 'POST' }
                  ).then(async (success) => {
                    if (success) {
                      setNotice({ tone: 'success', message: `Deletion of ${organization.name} was cancelled.` });
                      await refresh();
                    }
                  })}
                >
                  Cancel deletion
                </button>
              ) : organization.role === 'owner' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedActions[organization.id] ?? true}
                      onChange={(event) => setSelectedActions((current) => ({ ...current, [organization.id]: event.target.checked }))}
                    />
                    Schedule deletion
                  </label>
                  <button
                    className={dangerButton}
                    type="button"
                    disabled={busy !== null || !selectedActions[organization.id]}
                    onClick={() => void scheduleOrganization(organization)}
                  >
                    {busy === `delete-org:${organization.id}` ? 'Scheduling…' : 'Delete organization'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedActions[organization.id] ?? true}
                      onChange={(event) => setSelectedActions((current) => ({ ...current, [organization.id]: event.target.checked }))}
                    />
                    Leave organization
                  </label>
                  <button
                    className={dangerButton}
                    type="button"
                    disabled={busy !== null || !selectedActions[organization.id]}
                    onClick={() => void leaveOrganization(organization)}
                  >
                    {busy === `leave:${organization.id}` ? 'Leaving…' : 'Leave'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {status.organizations.length === 0 ? <p className="p-5 text-sm text-neutral-500 dark:text-slate-400">You are not a member of any organization.</p> : null}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Delete account"
        description="Account deletion is permanent after 30 days. You must leave every organization and schedule deletion for each organization you own first."
        tone="danger"
      >
        {status.accountDeletionScheduledAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm">Deletion scheduled for {new Date(status.accountDeletionScheduledAt).toLocaleString()}.</p>
            <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void cancelAccount()}>
              Cancel account deletion
            </button>
            {status.accountDeletionProcessingIssue ? (
              <div className="w-full">
                <Notice tone="warning">Deletion has not completed yet because a cleanup step failed. TraceIQ will retry; contact support if this persists.</Notice>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 p-5">
            <label className="text-xs text-neutral-600 dark:text-slate-400">
              Type DELETE to confirm. Organization deletion requests are separate and will not be scheduled automatically.
              <input
                className="mt-2 block h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div>
              <button className={dangerButton} type="button" disabled={busy !== null} onClick={() => void scheduleAccount()}>
                {busy === '/account' ? 'Scheduling…' : 'Schedule account deletion'}
              </button>
            </div>
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
