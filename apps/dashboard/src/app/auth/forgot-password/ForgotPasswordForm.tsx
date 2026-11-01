'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthBrandPanel } from '../AuthBrandPanel';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

type Status = { tone: 'success' | 'error'; message: string };

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const missingConfig = searchParams.get('missingConfig') === '1';

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [status, setStatus] = useState<Status | null>(
    missingConfig ? { tone: 'error', message: 'Supabase env vars are missing.' } : null
  );

  const supabase = useMemo(() => {
    if (missingConfig) {
      return null;
    }

    return createSupabaseBrowserClient();
  }, [missingConfig]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      const msg = 'Add Supabase env vars, then restart the dashboard.';
      setStatus({ tone: 'error', message: msg });
      toast.error(msg, { title: 'Reset failed' });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo
      });

      if (error) {
        const message = await readApiError(error, 'Could not send reset email. Please try again.');
        setStatus({ tone: 'error', message });
        toast.error(message, { title: 'Reset failed' });
        return;
      }

      setIsSent(true);
      toast.success(`Password reset instructions sent to ${trimmedEmail}`, {
        title: 'Check your email'
      });
    } catch (error) {
      const message = await readApiError(error, 'Could not send reset email. Please try again.');
      setStatus({ tone: 'error', message });
      toast.error(message, { title: 'Reset failed' });
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
        <section className="w-full max-w-sm" aria-labelledby="forgot-password-title">
          <Link className="mb-8 inline-flex lg:hidden" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          </Link>

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b44008]">
            Account recovery
          </p>
          <h1 id="forgot-password-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {isSent ? 'Check your email' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#64706e]">
            {isSent
              ? `We sent a password reset link to ${email}. Click the link in the message to choose a new password.`
              : 'Enter your email address and we’ll send you a link to reset your password.'}
          </p>

          {isSent ? (
            <div className="mt-7 grid gap-4">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Reset link sent
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  Check your spam folder if you do not see the email within a few minutes.
                </p>
              </div>

              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg border border-[#d4e2f2] bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-[#e5f3ff] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => {
                  setIsSent(false);
                }}
              >
                Send to a different email
              </button>

              <Link
                href="/auth/login"
                className="grid min-h-11 place-items-center rounded-lg bg-[#245beb] px-4 text-sm font-semibold text-white shadow-sm shadow-[#245beb]/25 transition hover:bg-[#1247ce]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-[#64706e]" htmlFor="email">
                    Email address
                  </label>
                  <input
                    className={inputClass}
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <button
                  className="mt-2 min-h-11 rounded-lg bg-[#245beb] px-4 text-sm font-semibold text-white shadow-sm shadow-[#245beb]/25 transition hover:bg-[#1247ce] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSubmitting || missingConfig}
                >
                  {isSubmitting ? 'Sending reset link…' : 'Send password reset link'}
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
                Remember your password?{' '}
                <Link
                  href="/auth/login"
                  className="font-semibold text-[#245beb] underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
