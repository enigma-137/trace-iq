'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

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

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return (
      <section className="mt-8 border-t border-neutral-200 pt-8 dark:border-slate-800" aria-labelledby="password-settings-title">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Security</p>
        <h2 id="password-settings-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Password & Authentication
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          Password management is disabled in single-user local mode.
        </p>
      </section>
    );
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

  const inputClass =
    'h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white/10';

  return (
    <section className="mt-8 grid gap-5 border-t border-neutral-200 pt-8 dark:border-slate-800" aria-labelledby="password-settings-title">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Security</p>
        <h2 id="password-settings-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Reset password
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          Change your account password or send a recovery link to your registered email address.
        </p>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Account credentials</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {userEmail ? (
                <span>Signed in as <span className="font-medium text-neutral-800 dark:text-neutral-200">{userEmail}</span></span>
              ) : (
                'Manage password and authentication credentials.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userEmail ? (
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={isSendingReset || isUpdating}
                className="h-9 shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isSendingReset ? 'Sending link…' : 'Send reset email'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setIsOpen(!isOpen);
                setStatus(null);
              }}
              className="h-9 shrink-0 rounded-md bg-neutral-900 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              {isOpen ? 'Cancel' : 'Change password'}
            </button>
          </div>
        </div>

        {isOpen ? (
          <form className="mt-6 border-t border-neutral-200 pt-5 dark:border-slate-800" onSubmit={handlePasswordUpdate}>
            <div className="grid max-w-md gap-4">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="settings-new-password">
                  New password
                </label>
                <input
                  className={inputClass}
                  id="settings-new-password"
                  name="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  minLength={6}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-neutral-400 dark:text-neutral-500">At least 6 characters.</p>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="settings-confirm-password">
                  Confirm new password
                </label>
                <input
                  className={inputClass}
                  id="settings-confirm-password"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  minLength={6}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="h-9 rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  {isUpdating ? 'Saving…' : 'Save new password'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        ) : null}

        {status ? (
          <p
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              status.tone === 'error'
                ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
            }`}
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
