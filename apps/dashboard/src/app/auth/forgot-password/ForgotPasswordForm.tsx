'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
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
    'h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10';

  return (
    <main className="grid min-h-screen bg-white text-neutral-950 dark:bg-black dark:text-neutral-50 lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-neutral-200 bg-white p-12 text-neutral-950 dark:border-transparent dark:bg-neutral-950 dark:text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14] dark:hidden"
          style={{
            backgroundImage: 'radial-gradient(rgba(0,0,0,0.9) 1px, transparent 1px)',
            backgroundSize: '22px 22px'
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden opacity-[0.14] dark:block"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '22px 22px'
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-neutral-900/5 blur-3xl dark:bg-white/5"
        />
        <Link className="relative inline-flex" href="/" aria-label="TraceIQ home">
          <img className="h-9 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          <img className="hidden h-9 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Account recovery & security.
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-500 dark:text-neutral-400">
            Reset your password quickly and securely to get back to monitoring your product metrics.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            {['Secure single-use reset links', 'End-to-end encrypted sessions', 'Immediate token expiration'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span aria-hidden className="text-neutral-900 dark:text-white">✓</span>
                  {item}
                </li>
              )
            )}
          </ul>
        </div>

        <p className="relative font-mono text-xs text-neutral-400 dark:text-neutral-500">TraceIQ · product analytics</p>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <section className="w-full max-w-sm" aria-labelledby="forgot-password-title">
          <Link className="mb-8 inline-flex lg:hidden" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          </Link>

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
            Account recovery
          </p>
          <h1 id="forgot-password-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            {isSent ? 'Check your email' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {isSent
              ? `We sent a password reset link to ${email}. Click the link in the message to choose a new password.`
              : 'Enter your email address and we’ll send you a link to reset your password.'}
          </p>

          {isSent ? (
            <div className="mt-7 grid gap-4">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Reset link sent
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-300/80">
                  Check your spam folder if you do not see the email within a few minutes.
                </p>
              </div>

              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                disabled={isSubmitting}
                onClick={() => {
                  setIsSent(false);
                }}
              >
                Send to a different email
              </button>

              <Link
                href="/auth/login"
                className="grid min-h-11 place-items-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="email">
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
                  className="mt-2 min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
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
                      ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                  }`}
                >
                  {status.message}
                </p>
              ) : null}

              <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Remember your password?{' '}
                <Link
                  href="/auth/login"
                  className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
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
