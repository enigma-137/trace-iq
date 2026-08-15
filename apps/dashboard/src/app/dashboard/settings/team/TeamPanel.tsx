'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Select } from '@traceiq/ui';
import { DashboardDialog } from '../../DashboardDialog';
import { Skeleton } from '@/components/Skeleton';
import { useOrganization } from '@/lib/organization';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Role = 'owner' | 'admin' | 'member';

type MemberRecord = {
  userId: string;
  role: Role;
  email: string | null;
  createdAt: string;
};

type InviteRecord = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  email: string;
  role: Role;
  tokenPrefix: string;
  invitedBy: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
  createdAt: string;
};

type PendingForMe = {
  id: string;
  organizationName: string | null;
  role: Role;
  expiresAt: string;
  createdAt: string;
};

export function TeamPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { organization, loading: orgLoading, refresh: refreshOrganization } = useOrganization();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [pendingForMe, setPendingForMe] = useState<PendingForMe[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [memberToRemove, setMemberToRemove] = useState<MemberRecord | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const myRole = organization?.role as Role | undefined;
  const canManage = Boolean(myRole && (myRole === 'owner' || myRole === 'admin'));
  const ownerCount = members.filter((member) => member.role === 'owner').length;

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setMyUserId(session?.user.id ?? null);
    }
    void loadSession();
    void loadMembers();
    void loadPendingForMe();
  }, [supabase]);

  useEffect(() => {
    if (canManage) {
      void loadInvites();
    }
  }, [canManage]);

  async function getAccessToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function authFetch(path: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      return null;
    }

    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  async function loadMembers() {
    setIsLoading(true);
    setStatus(null);
    const response = await authFetch('/v1/organization/members');
    setIsLoading(false);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    const body = (await response.json()) as { organizationId: string; members: MemberRecord[] };
    setMembers(body.members);
  }

  async function loadInvites() {
    setStatus(null);
    const response = await authFetch('/v1/organization/invites');
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    const body = (await response.json()) as { invites: InviteRecord[] };
    setInvites(body.invites);
  }

  async function loadPendingForMe() {
    const response = await authFetch('/v1/organization/invites/pending');
    if (!response || !response.ok) return;
    const body = (await response.json()) as { invites: PendingForMe[] };
    setPendingForMe(body.invites);
  }

  async function handleAcceptPending(invite: PendingForMe) {
    setBusy(`pending:${invite.id}`);
    setStatus(null);
    const response = await authFetch('/v1/organization/invites/accept-pending', {
      method: 'POST',
      body: JSON.stringify({ inviteId: invite.id })
    });
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    setPendingForMe((current) => current.filter((item) => item.id !== invite.id));
    setStatus({
      tone: 'success',
      message: `You joined ${invite.organizationName ?? 'the organization'} as ${invite.role}.`
    });
    void loadMembers();
    void refreshOrganization();
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const target = email.trim();
    if (!target) {
      setStatus({ tone: 'error', message: 'Enter an email address.' });
      return;
    }

    setIsSubmitting(true);
    const response = await authFetch('/v1/organization/invites', {
      method: 'POST',
      body: JSON.stringify({ email: target, role: inviteRole })
    });
    setIsSubmitting(false);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }

    const body = (await response.json()) as { invite: InviteRecord; emailDelivered: boolean };
    setInvites((current) => [body.invite, ...current]);
    setEmail('');
    setStatus({
      tone: 'success',
      message: `Invited ${body.invite.email}.${body.emailDelivered ? '' : ' The email failed to send — use Resend below to retry.'}`
    });
  }

  async function handleRoleChange(member: MemberRecord, newRole: Role) {
    if (newRole === member.role) return;
    setBusy(`role:${member.userId}`);
    setStatus(null);
    const response = await authFetch(`/v1/organization/members/${encodeURIComponent(member.userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole })
    });
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    setMembers((current) => current.map((m) => (m.userId === member.userId ? { ...m, role: newRole } : m)));
    void refreshOrganization();
    setStatus({ tone: 'success', message: `${member.email ?? 'Member'} is now a ${newRole}.` });
  }

  async function handleRemove() {
    if (!memberToRemove) return;
    setBusy(`remove:${memberToRemove.userId}`);
    setStatus(null);
    const response = await authFetch(`/v1/organization/members/${encodeURIComponent(memberToRemove.userId)}`, { method: 'DELETE' });
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    setMembers((current) => current.filter((m) => m.userId !== memberToRemove.userId));
    setMemberToRemove(null);
    void refreshOrganization();
    setStatus({ tone: 'success', message: `${memberToRemove.email ?? 'Member'} was removed from the organization.` });
  }

  async function handleResend(invite: InviteRecord) {
    setBusy(`resend:${invite.id}`);
    setStatus(null);
    const response = await authFetch(`/v1/organization/invites/${invite.id}/resend`, { method: 'POST' });
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    const body = (await response.json()) as { invite: InviteRecord; emailDelivered: boolean };
    setInvites((current) => current.map((i) => (i.id === invite.id ? body.invite : i)));
    setStatus({
      tone: 'success',
      message: `Invite resent to ${invite.email}.${body.emailDelivered ? '' : ' Email delivery failed — the link is still valid.'}`
    });
  }

  async function handleCancel(invite: InviteRecord) {
    setBusy(`cancel:${invite.id}`);
    setStatus(null);
    const response = await authFetch(`/v1/organization/invites/${invite.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    setInvites((current) => current.map((i) => (i.id === invite.id ? { ...i, status: 'revoked' as const } : i)));
    setStatus({ tone: 'success', message: 'Invitation cancelled.' });
  }

  const pendingInvites = invites.filter((invite) => invite.status === 'pending');

  return (
    <section className="mt-8 grid gap-5 border-t border-neutral-200 pt-8 dark:border-slate-800" aria-labelledby="team-title">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Team</p>
        <h2 id="team-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Members
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {members.length === 0
            ? 'Loading your organization…'
            : `${members.length} member${members.length === 1 ? '' : 's'} across your organization. Owners and admins can invite people, change roles, and remove members.`}
        </p>
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

      {pendingForMe.length > 0 ? (
        <section className="rounded-md border border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20" aria-label="Invitations for you">
          <div className="border-b border-blue-200 px-5 py-3 dark:border-blue-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-600 dark:text-blue-300">
              Invites awaiting your acceptance ({pendingForMe.length})
            </p>
          </div>
          <ul className="divide-y divide-blue-200 dark:divide-blue-900">
            {pendingForMe.map((invite) => (
              <li key={invite.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-neutral-900 dark:text-white">
                      {invite.organizationName ?? 'An organization'}
                    </p>
                    <RoleBadge role={invite.role} />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-slate-400">
                    Invited as {invite.role} · Expires {formatDate(invite.expiresAt)}
                  </p>
                </div>
                <button
                  className={secondaryButtonClass}
                  type="button"
                  disabled={busy === `pending:${invite.id}`}
                  onClick={() => void handleAcceptPending(invite)}
                >
                  {busy === `pending:${invite.id}` ? 'Accepting…' : 'Accept invite'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {orgLoading || (isLoading && members.length === 0) ? (
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !organization ? (
        <p className="rounded-md border border-neutral-200 bg-white p-5 text-sm text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          You do not have an organization yet — set one up from the Setup panel to start managing a team.
        </p>
      ) : (
        <div className="grid gap-5">
          {canManage ? (
            <form className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950" onSubmit={handleInvite}>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Invite a teammate</h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
                  They will receive an email link to join {organization.name}. Invites expire after 7 days.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,auto)]">
                <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400" htmlFor="inviteEmail">
                  Email
                  <input
                    id="inviteEmail"
                    className={inputClass}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="teammate@company.com"
                    maxLength={254}
                  />
                </label>

                <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400" htmlFor="inviteRole">
                  Role
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as Role)}
                    items={[
                      { value: 'member', label: 'Member' },
                      { value: 'admin', label: 'Admin' }
                    ]}
                    aria-label="Invite role"
                  />
                </label>

                <div className="grid content-end">
                  <button
                    className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Inviting…' : 'Send invite'}
                  </button>
                </div>
              </div>

              <p className="text-xs leading-5 text-neutral-500 dark:text-slate-400">
                Admins can manage alerts, webhooks, feature flags, funnels, and invite members (including promoting others to admin). Owners can also manage other owners and personal access tokens.
              </p>
            </form>
          ) : (
            <p className="rounded-md border border-neutral-200 bg-white p-5 text-sm text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              As a member you can view the team, but only owners and admins can invite people, change roles, or remove members.
            </p>
          )}

          <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Members ({members.length})
              </p>
              <button className={secondaryButtonClass} type="button" onClick={() => void loadMembers()} disabled={isLoading}>
                Refresh
              </button>
            </div>

            {members.length === 0 ? (
              <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No members found.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
                {members.map((member) => (
                  <li key={member.userId} className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
                    <div className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
                      {(member.email?.[0] ?? '?').toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-neutral-900 dark:text-white" title={member.email ?? undefined}>
                          {member.email ?? 'Unknown email'}
                        </p>
                        {member.userId === myUserId ? (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-slate-900 dark:text-slate-400">
                            You
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-500">Joined {formatDate(member.createdAt)}</p>
                    </div>

                    {canManage ? (
                      selectableRoleOptions(myRole, member, ownerCount).some((option) => !option.disabled) ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => void handleRoleChange(member, value as Role)}
                          items={selectableRoleOptions(myRole, member, ownerCount)}
                          disabled={busy === `role:${member.userId}`}
                          aria-label={`Role for ${member.email ?? 'member'}`}
                          className="md:w-36"
                        />
                      ) : (
                        <RoleBadge role={member.role} />
                      )
                    ) : (
                      <RoleBadge role={member.role} />
                    )}

                    {canManage && member.userId !== myUserId ? (
                      <button
                        className={dangerButtonClass}
                        type="button"
                        disabled={busy === `remove:${member.userId}` || (member.role === 'owner' && ownerCount === 1)}
                        onClick={() => setMemberToRemove(member)}
                        title={
                          member.role === 'owner' && ownerCount === 1
                            ? 'An organization must keep at least one owner'
                            : `Remove ${member.email ?? 'this member'}`
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canManage ? (
            <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                  Invitations ({pendingInvites.length} pending)
                </p>
              </div>

              {invites.length === 0 ? (
                <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No invitations yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
                  {invites.map((invite) => {
                    const isPending = invite.status === 'pending';
                    return (
                      <li key={invite.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-neutral-900 dark:text-white">{invite.email}</p>
                            <RoleBadge role={invite.role} />
                            <InviteStatusBadge status={invite.status} />
                          </div>
                          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-slate-500">
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-slate-900 dark:text-slate-400">
                              {invite.tokenPrefix}…
                            </code>
                            {' '}· Expires {formatDate(invite.expiresAt)}
                          </p>
                        </div>

                        {isPending ? (
                          <div className="flex items-center gap-2">
                            <button
                              className={secondaryButtonClass}
                              type="button"
                              disabled={busy === `resend:${invite.id}`}
                              onClick={() => void handleResend(invite)}
                            >
                              {busy === `resend:${invite.id}` ? 'Resending…' : 'Resend'}
                            </button>
                            <button
                              className={dangerButtonClass}
                              type="button"
                              disabled={busy === `cancel:${invite.id}`}
                              onClick={() => void handleCancel(invite)}
                            >
                              {busy === `cancel:${invite.id}` ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}

      <DashboardDialog
        open={Boolean(memberToRemove)}
        title="Remove member?"
        description={memberToRemove ? `${memberToRemove.email ?? 'This member'} will lose access to ${organization?.name ?? 'the organization'} and all of its data immediately.` : undefined}
        onClose={() => {
          if (!busy?.startsWith('remove:')) setMemberToRemove(null);
        }}
        footer={
          <>
            <button className={secondaryButtonClass} type="button" disabled={busy?.startsWith('remove:')} onClick={() => setMemberToRemove(null)}>
              Cancel
            </button>
            <button className={dangerButtonClass} type="button" disabled={busy?.startsWith('remove:')} onClick={() => void handleRemove()}>
              {busy?.startsWith('remove:') ? 'Removing…' : 'Remove member'}
            </button>
          </>
        }
      />
    </section>
  );
}

function selectableRoleOptions(
  myRole: Role | undefined,
  member: MemberRecord,
  ownerCount: number
): { value: Role; label: string; disabled?: boolean }[] {
  const all: Role[] = ['owner', 'admin', 'member'];

  if (myRole !== 'owner') {
    if (member.role === 'owner' || member.role === 'admin') {
      return all.map((value) => ({ value, label: value, disabled: true }));
    }
    return all.map((value) => ({ value, label: value, disabled: value === 'owner' }));
  }

  const isLastOwner = member.role === 'owner' && ownerCount <= 1;
  return all.map((value) => ({ value, label: capitalizeRole(value), disabled: isLastOwner && value !== 'owner' }));
}

function RoleBadge({ role }: { role: Role }) {
  const className =
    role === 'owner'
      ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900'
      : role === 'admin'
        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900'
        : 'bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800';

  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>{role}</span>;
}

function InviteStatusBadge({ status }: { status: InviteRecord['status'] }) {
  const map: Record<InviteRecord['status'], { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900'
    },
    accepted: {
      label: 'Accepted',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900'
    },
    revoked: {
      label: 'Revoked',
      className: 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-800'
    }
  };
  const badge = map[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>;
}

function capitalizeRole(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
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
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

const secondaryButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const dangerButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50';