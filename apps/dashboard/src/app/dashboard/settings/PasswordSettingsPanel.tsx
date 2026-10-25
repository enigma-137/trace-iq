'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import LockPasswordIcon from '@hugeicons/core-free-icons/LockPasswordIcon';
import { Notice, SettingsCard, fieldLabelClass, inputClass, primaryButton, secondaryButton } from './SettingsUI';
import { PasswordInput } from '@/components/PasswordInput';

interface PasswordSettingsPanelProps {
  userEmail?: string | null;
}

export function PasswordSettingsPanel({ userEmail }: PasswordSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  // Local mode has no accounts; the 2FA card already explains that auth is off.
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return null;
  }

  async function handlePasswordUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!supabase) {
      toast.error('Supabase is not configured properly.', { title: 'Update failed' });
      return;
    }

    if (newPassword.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Invalid password' });
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'Passwords do not match. Please verify and try again.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Mismatch' });
      return;
    }

    setIsUpdating(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        const message = await readApiError(error, 'Could not update password.');
        setStatus({ tone: 'error', message });
        toast.error(message, { title: 'Update failed' });
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setIsOpen(false);
      setStatus({ tone: 'success', message: 'Password updated successfully.' });
      toast.success('Your password has been changed.', { title: 'Password updated' });
    } catch (error) {
      const message = await readApiError(error, 'Could not update password.');
      setStatus({ tone: 'error', message });
      toast.error(message, { title: 'Update failed' });
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSendResetEmail() {
    if (!supabase) {
      toast.error('Supabase is not configured properly.', { title: 'Action failed' });
      return;
    }

    if (!userEmail) {
      toast.error('User email not found for this account.', { title: 'Action failed' });
      return;
    }

    setIsSendingReset(true);
    setStatus(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo
      });

      if (error) {
        const message = await readApiError(error, 'Could not send reset email.');
        setStatus({ tone: 'error', message });
        toast.error(message, { title: 'Reset failed' });
        return;
      }

      toast.success(`Password reset link sent to ${userEmail}`, {
        title: 'Check your email'
      });
      setStatus({ tone: 'success', message: `Password reset email sent to ${userEmail}.` });
    } catch (error) {
      const message = await readApiError(error, 'Could not send reset email.');
      setStatus({ tone: 'error', message });
      toast.error(message, { title: 'Reset failed' });
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <SettingsCard
      icon={LockPasswordIcon}
      title="Password"
      description={
        userEmail ? (
          <>
            Signed in as <span className="font-medium text-neutral-800 dark:text-slate-200">{userEmail}</span>. Change your password or email yourself a reset link.
          </>
        ) : (
          'Change your password or email yourself a reset link.'
        )
      }
      actions={
        isOpen ? null : (
          <>
            {userEmail ? (
              <button type="button" onClick={handleSendResetEmail} disabled={isSendingReset || isUpdating} className={secondaryButton}>
                {isSendingReset ? 'Sending link…' : 'Send reset email'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                setStatus(null);
              }}
              className={primaryButton}
            >
              Change password
            </button>
          </>
        )
      }
    >
      {isOpen || status ? (
        <div className="grid gap-4 p-5">
          {isOpen ? (
            <form className="grid max-w-md gap-4" onSubmit={handlePasswordUpdate}>
              <label className={fieldLabelClass} htmlFor="settings-new-password">
                New password
                <PasswordInput
                  className={inputClass}
                  id="settings-new-password"
                  name="newPassword"
                  placeholder="••••••••"
                  value={newPassword}
                  minLength={6}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
                <span className="text-xs font-normal text-neutral-500 dark:text-slate-500">At least 6 characters.</span>
              </label>

              <label className={fieldLabelClass} htmlFor="settings-confirm-password">
                Confirm new password
                <PasswordInput
                  className={inputClass}
                  id="settings-confirm-password"
                  name="confirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  minLength={6}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>

              <div className="flex items-center gap-2 pt-1">
                <button type="submit" disabled={isUpdating} className={primaryButton}>
                  {isUpdating ? 'Saving…' : 'Save new password'}
                </button>
                <button type="button" onClick={() => setIsOpen(false)} className={secondaryButton}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}
        </div>
      ) : null}
    </SettingsCard>
  );
}
