'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { describeAuthError } from '@/lib/auth-errors';
import { toast } from '@/lib/toast';
import { GitHubIcon, GitLabIcon } from '@/components/ProviderIcons';
import { DashboardDialog } from '../DashboardDialog';
import { Notice, SettingsCard, SettingsRow, StatusPill, dangerButton, secondaryButton } from './SettingsUI';

type OAuthProvider = 'github' | 'gitlab';

const PROVIDERS: Array<{ id: OAuthProvider; name: string; icon: JSX.Element }> = [
  { id: 'github', name: 'GitHub', icon: <GitHubIcon className="size-4 shrink-0 text-neutral-900 dark:text-white" /> },
  { id: 'gitlab', name: 'GitLab', icon: <GitLabIcon className="size-4 shrink-0" /> }
];

function accountLabel(identity: UserIdentity): string | null {
  const data = identity.identity_data ?? {};
  const name = data.user_name ?? data.preferred_username ?? data.email;
  return typeof name === 'string' && name ? name : null;
}

export function ConnectedAccountsPanel() {
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [confirming, setConfirming] = useState<UserIdentity | null>(null);

  const loadIdentities = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.auth.getUserIdentities();
    if (loadError) {
      setError({ title: 'Couldn’t load your sign-in methods', message: loadError.message });
      return;
    }
    setIdentities(data?.identities ?? []);
  }, [supabase]);

  useEffect(() => {
    void loadIdentities();
    // Coming back from GitHub/GitLab after a successful connect.
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('connected');
    const provider = PROVIDERS.find((item) => item.id === connected);
    if (provider) {
      toast.success(`You can now sign in with ${provider.name}.`, { title: `${provider.name} connected` });
      url.searchParams.delete('connected');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }, [loadIdentities]);

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return null;
  }

  async function connect(provider: OAuthProvider) {
    if (!supabase) return;
    setBusy(provider);
    setError(null);
    const next = `/dashboard/settings?connected=${provider}`;
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` }
    });
    // On success the browser is already on its way to the provider.
    if (linkError) {
      setError(describeAuthError({ error: null, code: linkError.code ?? null, description: linkError.message }, true));
      setBusy(null);
    }
  }

  async function disconnect(identity: UserIdentity) {
    if (!supabase) return;
    const provider = PROVIDERS.find((item) => item.id === identity.provider);
    setBusy(identity.provider as OAuthProvider);
    setError(null);
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    setBusy(null);
    setConfirming(null);
    if (unlinkError) {
      setError({ title: `Couldn’t disconnect ${provider?.name ?? identity.provider}`, message: unlinkError.message });
      return;
    }
    toast.success(`You can no longer sign in with ${provider?.name ?? identity.provider}.`, { title: 'Disconnected' });
    await loadIdentities();
  }

  const hasPassword = identities?.some((identity) => identity.provider === 'email') ?? false;
  const onlyOneMethod = (identities?.length ?? 0) <= 1;
  const confirmingProvider = PROVIDERS.find((item) => item.id === confirming?.provider);

  return (
    <SettingsCard
      icon={Link01Icon}
      title="Connected accounts"
      description="Sign in with any of these. Connect GitHub or GitLab to use them alongside your email and password."
    >
      {error ? (
        <div className="px-5 pt-4">
          <Notice tone="error">
            <strong className="font-semibold">{error.title}.</strong> {error.message}
          </Notice>
        </div>
      ) : null}

      <SettingsRow label="Email & password" hint="Sign in with your email address.">
        {identities === null ? (
          <span className="text-neutral-400">Loading…</span>
        ) : hasPassword ? (
          <StatusPill tone="success">Set up</StatusPill>
        ) : (
          <span className="text-neutral-500 dark:text-slate-400">No password yet. Use Send reset email above to set one.</span>
        )}
      </SettingsRow>

      {PROVIDERS.map((provider) => {
        const identity = identities?.find((item) => item.provider === provider.id);
        const label = identity ? accountLabel(identity) : null;
        return (
          <SettingsRow
            key={provider.id}
            label={
              <span className="inline-flex items-center gap-2">
                {provider.icon}
                {provider.name}
              </span>
            }
            hint={identity ? `Signed in as ${label ?? 'your account'}.` : `Sign in with your ${provider.name} account.`}
            actions={
              identities === null ? null : identity ? (
                <button
                  type="button"
                  className={dangerButton}
                  disabled={busy !== null || onlyOneMethod}
                  title={onlyOneMethod ? 'Add another way to sign in before disconnecting this one.' : undefined}
                  onClick={() => setConfirming(identity)}
                >
                  Disconnect
                </button>
              ) : (
                <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => connect(provider.id)}>
                  {busy === provider.id ? `Opening ${provider.name}…` : 'Connect'}
                </button>
              )
            }
          >
            {identity ? <StatusPill tone="success">Connected</StatusPill> : <StatusPill tone="neutral">Not connected</StatusPill>}
          </SettingsRow>
        );
      })}

      <DashboardDialog
        open={confirming !== null}
        title={`Disconnect ${confirmingProvider?.name ?? 'this account'}?`}
        description={`You won’t be able to sign in to TraceIQ with ${confirmingProvider?.name ?? 'it'} until you connect it again.`}
        maxWidthClass="max-w-sm"
        onClose={() => (busy ? undefined : setConfirming(null))}
        footer={
          <>
            <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => setConfirming(null)} autoFocus>
              Cancel
            </button>
            <button type="button" className={dangerButton} disabled={busy !== null} onClick={() => confirming && disconnect(confirming)}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        }
      />
    </SettingsCard>
  );
}
