'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthBrandPanel } from '../AuthBrandPanel';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { PasswordInput } from '@/components/PasswordInput';

type Status = { tone: 'success' | 'error'; message: string };

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const missingConfig = searchParams.get('missingConfig') === '1';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status | null>(
    missingConfig ? { tone: 'error', message: 'Supabase env vars are missing.' } : null
  );

  const supabase = useMemo(() => {
    if (missingConfig) {
      return null;
    }

    return createSupabaseBrowserClient();
  }, [missingConfig]);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    // Check existing session or listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || session?.access_token) {
        setHasSession(true);
      }
    });

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!error && data.session) {
          setHasSession(true);
        } else {
          // If no session yet, wait a moment for any token exchange or hash processing
          setTimeout(async () => {
            if (cancelled) return;
            const retry = await supabase.auth.getSession();
            if (!cancelled) {
              setHasSession(Boolean(retry.data?.session));
            }
          }, 800);
        }
      } catch {
        if (!cancelled) setHasSession(false);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      const msg = 'Add Supabase env vars, then restart the dashboard.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Update failed' });
      return;
    }

    if (password.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Invalid password' });
      return;
    }

    if (password !== confirmPassword) {
      const msg = 'Passwords do not match. Please verify and try again.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Mismatch' });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (error) {
        const message = await readApiError(error, 'Could not update password. Please try again.');
        setStatus({ tone: 'error', message });
        toast.error(message, { title: 'Update failed' });
        return;
      }

      setIsSuccess(true);
      toast.success('Your password has been updated successfully.', {
        title: 'Password updated'
      });

      // Redirect after brief pause
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1500);
    } catch (error) {
      const message = await readApiError(error, 'Could not update password. Please try again.');
      setStatus({ tone: 'error', message });
      toast.error(message, { title: 'Update failed' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'h-11 rounded-lg border border-[#d4e2f2] bg-white px-3 text-sm text-[#101715] outline-none transition placeholder:text-neutral-400 focus:border-[#245beb] focus:ring-2 focus:ring-[#245beb]/20';

  return (
    <main style={{ colorScheme: "light" }} className="grid min-h-screen bg-white text-[#101715] lg:grid-cols-2">
      <AuthBrandPanel />

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <section className="w-full max-w-sm" aria-labelledby="reset-password-title">
          <Link className="mb-8 inline-flex lg:hidden" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          </Link>

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b44008]">
            Security settings
          </p>
          <h1 id="reset-password-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {isSuccess ? 'Password updated' : 'Set new password'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#64706e]">
            {isSuccess
              ? 'Your password has been changed. Redirecting to your dashboard…'
              : hasSession === false
                ? 'Your reset link is invalid or has expired.'
                : 'Enter and confirm your new password below.'}
          </p>

          {isSuccess ? (
            <div className="mt-7 grid gap-4">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  All set!
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  Your new credentials are now active.
                </p>
              </div>

              <Link
                href="/dashboard"
                className="grid min-h-11 place-items-center rounded-lg bg-[#245beb] px-4 text-sm font-semibold text-white shadow-sm shadow-[#245beb]/25 transition hover:bg-[#1247ce]"
              >
                Go to dashboard
              </Link>
            </div>
          ) : hasSession === false ? (
            <div className="mt-7 grid gap-4">
              <div className="rounded-lg border border-red-300 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Link expired or invalid
                </div>
                <p className="mt-1 text-sm leading-6 text-red-800">
                  Password reset links can only be used once and expire quickly for your security.
                </p>
              </div>

              <Link
                href="/auth/forgot-password"
                className="grid min-h-11 place-items-center rounded-lg bg-[#245beb] px-4 text-sm font-semibold text-white shadow-sm shadow-[#245beb]/25 transition hover:bg-[#1247ce]"
              >
                Request a new reset link
              </Link>

              <Link
                href="/auth/login"
                className="grid min-h-11 place-items-center rounded-lg border border-[#d4e2f2] bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-[#e5f3ff]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-[#64706e]" htmlFor="new-password">
                    New Password
                  </label>
                  <PasswordInput
                    className={inputClass}
                    id="new-password"
                    name="newPassword"
                    placeholder="••••••••"
                    value={password}
                    autoComplete="new-password"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-neutral-400">At least 6 characters.</p>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-[#64706e]" htmlFor="confirm-password">
                    Confirm New Password
                  </label>
                  <PasswordInput
                    className={inputClass}
                    id="confirm-password"
                    name="confirmPassword"
                    placeholder="••••••••"
                    value={confirmPassword}
                    autoComplete="new-password"
                    minLength={6}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>

                <button
                  className="mt-2 min-h-11 rounded-lg bg-[#245beb] px-4 text-sm font-semibold text-white shadow-sm shadow-[#245beb]/25 transition hover:bg-[#1247ce] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSubmitting || missingConfig}
                >
                  {isSubmitting ? 'Updating password…' : 'Update password'}
                </button>
              </form>

              {status ? (
                <p
                  className={`mt-5 rounded-lg border px-3 py-2.5 text-sm ${
                    status.tone === 'error'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {status.message}
                </p>
              ) : null}

              <p className="mt-6 text-center text-sm text-[#64706e]">
                <Link
                  href="/auth/login"
                  className="font-semibold text-[#245beb] underline-offset-4 hover:underline"
                >
                  Cancel and return to sign in
                </Link>
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
