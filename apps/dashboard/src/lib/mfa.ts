'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export interface RegisteredFactor {
  id: string;
  friendlyName?: string | null;
  factorType: string;
  status: string;
}

interface FactorRecord {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
}

export const MFA_ISSUER = 'TraceIQ';

/**
 * Builds the `otpauth://` URI a phone actually imports. The authenticator app
 * keys the entry under `<issuer>:<account>` (e.g. "TraceIQ:you@mail.com"), so
 * both the label and issuer use "TraceIQ".
 */
export function buildOtpAuthUri(secret: string, accountName: string, issuer = MFA_ISSUER): string {
  const label = `${issuer}:${accountName}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function formatTotpSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Loads the Supabase MFA enrollment state for the current browser session.
 *
 * - `enrolled === true`  → the account has at least one verified factor.
 * - `enrolled === false` → the account has no verified factor (safe to warn).
 * - `enrolled === null`  → still loading (or Supabase env is unconfigured).
 */
export function useMfaStatus() {
  const localMode = process.env.NEXT_PUBLIC_AUTH_MODE === 'local';
  const supabase = useMemo(() => {
    if (localMode) return null;
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, [localMode]);

  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [factors, setFactors] = useState<RegisteredFactor[]>([]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setEnrolled(localMode ? null : false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        throw error;
      }

      const all = (data?.all ?? []) as FactorRecord[];
      setFactors(
        all.map((factor) => ({
          id: factor.id,
          friendlyName: factor.friendly_name,
          factorType: factor.factor_type,
          status: factor.status
        }))
      );
      setEnrolled(all.some((factor) => factor.status === 'verified'));
    } catch {
      setEnrolled(false);
      setFactors([]);
    }
  }, [localMode, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { enrolled, factors, refresh };
}
