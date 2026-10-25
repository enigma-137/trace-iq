'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardDialog } from './DashboardDialog';
import { inputClass, primaryButton, secondaryButton } from './settings/SettingsUI';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isCompleteOtpCode, normalizeOtpCode, OTP_CODE_LENGTH } from '@/lib/otp-code';
import { registerStepUpVerifier } from '@/lib/step-up';

/**
 * Asks for a fresh authenticator code when an action needs recent 2FA
 * (see lib/step-up.ts). Verifying through Supabase refreshes the session, so
 * the caller's retry carries an access token with a new second-factor time.
 */
export function StepUpDialogHost() {
  const supabase = useMemo(() => {
    if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') return null;
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const settle = useRef<((verified: boolean) => void) | null>(null);

  useEffect(() => {
    if (!supabase) return;
    return registerStepUpVerifier(
      () =>
        new Promise<boolean>((resolve) => {
          settle.current = resolve;
          setCode('');
          setError(null);
          setOpen(true);
        })
    );
  }, [supabase]);

  function finish(verified: boolean) {
    setOpen(false);
    settle.current?.(verified);
    settle.current = null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || isVerifying) return;
    const otp = normalizeOtpCode(code);
    if (!isCompleteOtpCode(otp)) {
      setError(`Enter the ${OTP_CODE_LENGTH}-digit code from your authenticator app.`);
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((item) => item.status === 'verified');
      if (factorsError || !factor) {
        setError('Could not load your 2FA method. Sign out and back in, then try again.');
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) {
        setError('Could not start verification. Please try again.');
        return;
      }
      const verify = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: otp });
      if (verify.error) {
        setError('That code could not be verified. Check your authenticator app and try again.');
        setCode('');
        return;
      }
      finish(true);
    } catch {
      setError('Could not verify your code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <DashboardDialog
      open={open}
      title="Confirm it's you"
      description="This action needs a recent two-factor check. Enter the code from your authenticator app to continue."
      maxWidthClass="max-w-sm"
      onClose={() => {
        if (!isVerifying) finish(false);
      }}
    >
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-200" htmlFor="stepUpCode">
          Authentication code
          <input
            id="stepUpCode"
            className={`${inputClass} font-mono tracking-[0.3em]`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={OTP_CODE_LENGTH}
            pattern="[0-9]*"
            value={code}
            onChange={(event) => setCode(normalizeOtpCode(event.target.value))}
            disabled={isVerifying}
            autoFocus
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button className={secondaryButton} type="button" disabled={isVerifying} onClick={() => finish(false)}>
            Cancel
          </button>
          <button className={primaryButton} type="submit" disabled={isVerifying || !isCompleteOtpCode(code)}>
            {isVerifying ? 'Verifying…' : 'Verify and continue'}
          </button>
        </div>
      </form>
    </DashboardDialog>
  );
}
