'use client';

import Link from 'next/link';
import ShieldKeyIcon from '@hugeicons/core-free-icons/ShieldKeyIcon';
import { useMfaStatus } from '@/lib/mfa';
import { Skeleton } from '@/components/Skeleton';
import { SettingsCard, StatusPill, primaryButton, secondaryButton } from './SettingsUI';

export function TwoFactorPanel() {
  const { enrolled } = useMfaStatus();

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return (
      <SettingsCard
        icon={ShieldKeyIcon}
        title="Authentication disabled"
        description="This single-user instance relies on loopback network isolation, so passwords and two-factor authentication are turned off. Switch to Supabase authentication before exposing it to other users or networks."
      />
    );
  }

  return (
    <SettingsCard
      icon={ShieldKeyIcon}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Two-factor authentication
          {enrolled === null ? null : enrolled ? (
            <StatusPill tone="success">Enabled</StatusPill>
          ) : (
            <StatusPill tone="warning">Not enabled</StatusPill>
          )}
        </span>
      }
      description={
        enrolled === null ? (
          <Skeleton className="mt-1 h-4 w-56" />
        ) : enrolled ? (
          'Your account is protected with an authenticator app code at sign-in.'
        ) : (
          'Recommended. Require a code from an authenticator app when you sign in.'
        )
      }
      actions={
        enrolled === null ? null : (
          <Link className={enrolled ? secondaryButton : primaryButton} href="/dashboard/settings/2fa">
            {enrolled ? 'Manage' : 'Set up 2FA'}
          </Link>
        )
      }
    />
  );
}
