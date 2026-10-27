'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { retryAfterStepUp } from '@/lib/step-up';
import { DashboardDialog } from '../DashboardDialog';
import {
  Notice,
  SettingsCard,
  dangerButton,
  inputClass,
  secondaryButton
} from './SettingsUI';

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

type LifecycleDialog =
  | { kind: 'delete-organization'; organization: Organization }
  | { kind: 'leave-organization'; organization: Organization }
  | { kind: 'delete-account' };

export function AccountLifecyclePanel({ exportHref }: { exportHref: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<LifecycleStatus | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [dialog, setDialog] = useState<LifecycleDialog | null>(null);
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
    try {
      const response = await send('/v1/dashboard/lifecycle');
      if (!response) return;
      if (!response.ok) {
        setNotice({ tone: 'error', message: await readApiError(response) });
        return;
      }
      setStatus(await response.json() as LifecycleStatus);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not load account and organization settings.'
      });
    }
  }, [send]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(key: string, path: string, init: RequestInit) {
    setBusy(key);
    setNotice(null);
    try {
      const response = await send(path, init);
      if (!response) return false;
      if (!response.ok) {
        setNotice({ tone: 'error', message: await readApiError(response) });
        return false;
      }
      return true;
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The request could not be completed.'
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function openDialog(nextDialog: LifecycleDialog) {
    setNotice(null);
    setConfirmation('');
    setDialog(nextDialog);
  }

  async function confirmDialogAction() {
    if (!dialog || busy) return;
    if (dialog.kind !== 'leave-organization' && confirmation.trim() !== 'DELETE') {
      setNotice({ tone: 'error', message: 'Type DELETE in the dialog to confirm.' });
      return;
    }

    const currentDialog = dialog;
    let key: string;
    let path: string;
    let init: RequestInit;
    switch (currentDialog.kind) {
      case 'delete-account':
        key = 'delete-account';
        path = '/v1/dashboard/lifecycle/account/delete';
        init = { method: 'POST', body: JSON.stringify({ confirmation }) };
        break;
      case 'delete-organization':
        key = `delete-organization:${currentDialog.organization.id}`;
        path = `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(currentDialog.organization.id)}/delete`;
        init = { method: 'POST', body: JSON.stringify({ confirmation }) };
        break;
      case 'leave-organization':
        key = `leave-organization:${currentDialog.organization.id}`;
        path = `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(currentDialog.organization.id)}/leave`;
        init = { method: 'DELETE' };
        break;
    }

    const success = await runAction(key, path, init);
    if (!success) return;

    setDialog(null);
    setConfirmation('');
    if (currentDialog.kind === 'delete-account') {
      setNotice({ tone: 'success', message: 'Your account is scheduled for deletion in 30 days. You can cancel before then.' });
    } else if (currentDialog.kind === 'delete-organization') {
      setNotice({
        tone: 'success',
        message: `${currentDialog.organization.name} is scheduled for deletion in 30 days. You can cancel before then.`
      });
    } else {
      setNotice({ tone: 'success', message: `You left ${currentDialog.organization.name}.` });
    }
    await refresh();
  }

  async function cancelOrganizationDeletion(organization: Organization) {
    const success = await runAction(
      `cancel-org:${organization.id}`,
      `/v1/dashboard/lifecycle/organizations/${encodeURIComponent(organization.id)}/cancel`,
      { method: 'POST' }
    );
    if (success) {
      setNotice({ tone: 'success', message: `Deletion of ${organization.name} was cancelled.` });
      await refresh();
    }
  }

  async function cancelAccountDeletion() {
    const success = await runAction('/account', '/v1/dashboard/lifecycle/account/cancel', { method: 'POST' });
    if (success) {
      setNotice({ tone: 'success', message: 'Account deletion was cancelled.' });
      await refresh();
    }
  }

  const isConfirmationValid = confirmation.trim() === 'DELETE';
  const dialogTitle = dialog?.kind === 'delete-organization'
    ? `Delete "${dialog.organization.name}"`
    : dialog?.kind === 'leave-organization'
      ? `Leave "${dialog.organization.name}"`
      : 'Delete your account';
  const dialogDescription = dialog?.kind === 'delete-organization'
    ? 'Organization access is disabled when scheduled. Permanent deletion happens after 30 days.'
    : dialog?.kind === 'leave-organization'
      ? 'You will lose access to this organization and its projects.'
      : 'Your access ends when scheduled. Your account is permanently deleted after 30 days.';
  const dialogActionLabel = dialog?.kind === 'delete-organization'
    ? 'Schedule organization deletion'
    : dialog?.kind === 'leave-organization'
      ? 'Leave organization'
      : 'Schedule account deletion';
  const dialogBusyLabel = dialog?.kind === 'leave-organization'
    ? 'Leaving…'
    : 'Scheduling…';

  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      {!status ? (
        <SettingsCard>
          <div className="grid gap-3 p-5">
            <p className="text-sm text-neutral-500 dark:text-slate-400">Loading account and organization settings…</p>
            {notice ? <button className={secondaryButton} type="button" onClick={() => void refresh()}>Retry</button> : null}
          </div>
        </SettingsCard>
      ) : (
        <>
          <SettingsCard
            title="Organizations"
            description="Owners can schedule deletion. Other members can leave. Permanent deletion happens after 30 days."
            tone="danger"
          >
            <div className="divide-y divide-red-100 dark:divide-red-900/40">
              {status.organizations.map((organization) => (
                <div key={organization.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">{organization.name}</p>
                    <p className="mt-1 text-xs capitalize text-neutral-500 dark:text-slate-400">
                      {organization.role}
                      {organization.deletionScheduledAt
                        ? ` · deletion scheduled for ${new Date(organization.deletionScheduledAt).toLocaleString()}`
                        : ''}
                    </p>
                    {organization.deletionProcessingIssue ? (
                      <div className="mt-2">
                        <Notice tone="warning">A cleanup step has not completed yet. TraceIQ will retry; contact support if this persists.</Notice>
                      </div>
                    ) : null}
                  </div>
                  {organization.deletionScheduledAt ? (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy !== null}
                      onClick={() => void cancelOrganizationDeletion(organization)}
                    >
                      {busy === `cancel-org:${organization.id}` ? 'Cancelling…' : 'Cancel deletion'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={dangerButton}
                      disabled={busy !== null}
                      onClick={() => openDialog({
                        kind: organization.role === 'owner' ? 'delete-organization' : 'leave-organization',
                        organization
                      })}
                    >
                      {organization.role === 'owner' ? 'Delete organization' : 'Leave organization'}
                    </button>
                  )}
                </div>
              ))}
              {status.organizations.length === 0 ? (
                <p className="p-5 text-sm text-neutral-500 dark:text-slate-400">You are not a member of any organization.</p>
              ) : null}
            </div>
          </SettingsCard>

          <SettingsCard
            title="Account"
            description="Schedule account deletion after resolving your organization memberships. Permanent deletion happens after 30 days."
            tone="danger"
          >
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              {status.accountDeletionScheduledAt ? (
                <>
                  <div>
                    <p className="text-sm text-neutral-700 dark:text-slate-300">
                      Deletion scheduled for {new Date(status.accountDeletionScheduledAt).toLocaleString()}.
                    </p>
                    {status.accountDeletionProcessingIssue ? (
                      <div className="mt-2">
                        <Notice tone="warning">A cleanup step has not completed yet. TraceIQ will retry; contact support if this persists.</Notice>
                      </div>
                    ) : null}
                  </div>
                  <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void cancelAccountDeletion()}>
                    {busy === '/account' ? 'Cancelling…' : 'Cancel deletion'}
                  </button>
                </>
              ) : (
                <>
                  <p className="max-w-2xl text-sm leading-6 text-neutral-600 dark:text-slate-400">
                    Your access ends when deletion is scheduled. You must first schedule deletion for each organization you own and leave organizations where you are a member.
                  </p>
                  <button
                    className={dangerButton}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => openDialog({ kind: 'delete-account' })}
                  >
                    Delete account
                  </button>
                </>
              )}
            </div>
          </SettingsCard>
        </>
      )}

      <DashboardDialog
        open={dialog !== null}
        title={dialogTitle}
        description={dialogDescription}
        onClose={() => {
          if (!busy) {
            setDialog(null);
            setConfirmation('');
            setNotice(null);
          }
        }}
        footer={
          <>
            <button
              className={secondaryButton}
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setDialog(null);
                setConfirmation('');
                setNotice(null);
              }}
            >
              Cancel
            </button>
            <button
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={busy !== null || (dialog?.kind !== 'leave-organization' && !isConfirmationValid)}
              onClick={() => void confirmDialogAction()}
            >
              {busy ? dialogBusyLabel : dialogActionLabel}
            </button>
          </>
        }
      >
        {dialog ? (
          <div className="space-y-4 text-sm">
            {notice?.tone === 'error' ? <Notice tone="error">{notice.message}</Notice> : null}
            <div className="rounded-lg border border-red-200 bg-red-50/80 p-3.5 text-red-900 dark:border-red-950/80 dark:bg-red-950/30 dark:text-red-200">
              {dialog.kind === 'delete-organization' ? (
                <p>
                  Organization data remains available during the 30-day cancellation period. If this organization has an active subscription or checkout, resolve it in{' '}
                  <Link href="/dashboard/settings/billing" className="font-semibold underline underline-offset-4">
                    Billing
                  </Link>{' '}
                  first.
                </p>
              ) : dialog.kind === 'leave-organization' ? (
                <p>You will no longer be able to access this organization or its projects.</p>
              ) : (
                <p>Account deletion will not be scheduled until you have left or scheduled deletion for every organization.</p>
              )}
            </div>

            {dialog.kind !== 'leave-organization' ? (
              <>
                <p className="text-neutral-600 dark:text-slate-300">
                  Want to keep a copy first?{' '}
                  <Link href={exportHref} className="font-medium text-neutral-900 underline underline-offset-4 dark:text-white">
                    Export your data
                  </Link>
                  .
                </p>
                <label className="grid gap-1.5 font-medium text-neutral-700 dark:text-slate-300">
                  Type <span className="font-mono font-semibold text-neutral-900 dark:text-white">DELETE</span> to confirm
                  <input
                    className={`${inputClass} focus:border-red-500 focus:ring-red-500/20`}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </DashboardDialog>
    </>
  );
}
