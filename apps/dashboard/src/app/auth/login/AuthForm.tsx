'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { safeRedirectPath } from '@/lib/utils';

type AuthMode = 'signin' | 'signup';
type AuthStage = 'credentials' | 'setup-prompt' | 'mfa-challenge';

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeRedirectPath(searchParams.get('next'), '/dashboard');
  const missingConfig = searchParams.get('missingConfig') === '1';
  const [mode, setMode] = useState<AuthMode>('signin');
  const [stage, setStage] = useState<AuthStage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(missingConfig ? 'Supabase env vars are missing.' : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  const supabase = useMemo(() => {
    if (missingConfig) {
      return null;
    }

    return createSupabaseBrowserClient();
  }, [missingConfig]);

  useEffect(() => {
    if (!supabase || stage !== 'credentials') {
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) {
        return;
      }
      await decideNextStep(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, stage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setStatus('Add Supabase env vars, then restart the dashboard.');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const authResult =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setIsSubmitting(false);

    if (authResult.error) {
      setStatus(authResult.error.message);
      return;
    }

    if (mode === 'signup' && !authResult.data.session) {
      setStatus('Check your email to confirm this account, then sign in.');
      return;
    }

    await decideNextStep();
  }

  /**
   * Route through the 2FA flow for the current session:
   * - User has a verified authenticator factor and is only at AAL1 → require a code here.
   * - User has no factor and this is a fresh sign-in → recommend enabling 2FA (can decline).
   * - Revisits with an existing session (skipSetupPrompt) or already at AAL2 → dashboard.
   */
  async function decideNextStep(skipSetupPrompt = false) {
    if (!supabase) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsChallenge = !aalError && aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';

    if (!needsChallenge) {
      if (!aalError && aal?.currentLevel === 'aal1' && !skipSetupPrompt) {
        setStage('setup-prompt');
        return;
      }
      router.push(nextPath);
      router.refresh();
      return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = !factorsError ? factors?.all.find((item) => item.status === 'verified') : undefined;

    if (!factor) {
      setStatus('Could not load your 2FA method. Please try again.');
      return;
    }

    setMfaFactorId(factor.id);
    setStage('mfa-challenge');
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !mfaFactorId) {
      return;
    }

    if (mfaCode.trim().length < 6) {
      setStatus('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error) {
      setIsSubmitting(false);
      setStatus(challenge.error.message);
      return;
    }

    const verify = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim()
    });

    setIsSubmitting(false);

    if (verify.error) {
      setStatus(verify.error.message);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  async function handleOAuth(provider: 'github' | 'gitlab') {
    if (!supabase) {
      setStatus('Add Supabase env vars, then restart the dashboard.');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      }
    });

    setIsSubmitting(false);

    if (error) {
      setStatus(error.message);
    }
  }

  const inputClass =
    'h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10';

  return (
    <main className="grid min-h-screen bg-white text-neutral-950 dark:bg-black dark:text-neutral-50 lg:grid-cols-2">
      {/* Brand panel — fills the space, hidden on small screens */}
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
            Product analytics built for how your users actually behave.
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-500 dark:text-neutral-400">
            Trends, funnels, retention, revenue, and error tracking — in one fast, privacy-friendly dashboard.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            {['Revenue & GTV as a first-class metric', 'Funnels with per-step drop-off', 'SDKs for web, server & mobile'].map(
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
        <section className="w-full max-w-sm" aria-labelledby="auth-title">
          <Link className="mb-8 inline-flex lg:hidden" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          </Link>

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
            Dashboard access
          </p>
          <h1 id="auth-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            {stage === 'credentials'
              ? mode === 'signin'
                ? 'Welcome back'
                : 'Create your account'
              : stage === 'mfa-challenge'
                ? 'Two-factor authentication'
                : 'Secure your account'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {stage === 'credentials'
              ? mode === 'signin'
                ? 'Sign in to your TraceIQ dashboard.'
                : 'Start capturing product analytics in minutes.'
              : stage === 'mfa-challenge'
                ? 'Enter the code from your authenticator app to finish signing in.'
                : 'Add 2FA to protect your account and projects.'}
          </p>

          {stage === 'credentials' ? (
            <>
              <div
                className="mt-7 grid grid-cols-2 gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900"
                role="tablist"
                aria-label="Authentication mode"
              >
                {(['signin', 'signup'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    className={`min-h-9 rounded-md text-sm font-semibold transition ${mode === value
                      ? 'bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                      }`}
                    onClick={() => setMode(value)}
                  >
                    {value === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="email">
                    Email
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
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="password">
                    Password
                  </label>
                  <input
                    className={inputClass}
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  {mode === 'signup' ? (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">At least 6 characters.</p>
                  ) : null}
                </div>

                <button
                  className="mt-2 min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                  type="submit"
                  disabled={isSubmitting || missingConfig}
                >
                  {isSubmitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  or
                </span>
                <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <button
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  type="button"
                  disabled={isSubmitting || missingConfig}
                  onClick={() => void handleOAuth('github')}
                >
                  <GitHubIcon className="size-[18px] shrink-0 text-neutral-900 dark:text-white" />
                  GitHub
                </button>

                <button
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  type="button"
                  disabled={isSubmitting || missingConfig}
                  onClick={() => void handleOAuth('gitlab')}
                >
                  <GitLabIcon className="size-[18px] shrink-0" />
                  GitLab
                </button>
              </div>

              {status ? (
                <p className="mt-5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                  {status}
                </p>
              ) : null}

              <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
                {mode === 'signin' ? 'New to TraceIQ? ' : 'Already have an account? '}
                <button
                  type="button"
                  className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                >
                  {mode === 'signin' ? 'Create an account' : 'Sign in'}
                </button>
              </p>
            </>
          ) : stage === 'setup-prompt' ? (
            <div className="mt-7 grid gap-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0Z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                  Recommended, not required
                </div>
                <p className="mt-2 text-sm leading-6 text-amber-800 dark:text-amber-200/80">
                  Two-factor authentication adds a one-time code from your authenticator app to sign-in. We recommend it
                  to keep your account and projects secure.
                </p>
              </div>
              <Link
                className="mt-1 grid min-h-11 place-items-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                href="/dashboard/settings/2fa"
              >
                Set up 2FA now
              </Link>
              <button
                className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                type="button"
                onClick={() => {
                  router.push(nextPath);
                  router.refresh();
                }}
              >
                Not now
              </button>
            </div>
          ) : (
            <form className="mt-7 grid gap-4" onSubmit={handleMfaSubmit}>
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400" htmlFor="mfaCode">
                  Authenticator code
                </label>
                <input
                  className={inputClass}
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={mfaCode}
                  maxLength={6}
                  onChange={(event) => setMfaCode(event.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                className="mt-2 min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Verifying…' : 'Verify and continue'}
              </button>

              {status ? (
                <p className="mt-5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {status}
                </p>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * GitHub's mark has no brand color — it's shown solid black on light
 * surfaces and solid white on dark surfaces (per github.com/logos).
 * Uses currentColor so the caller can set neutral-900/white per theme.
 */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

/** GitLab's official tanuki mark — three brand oranges, per about.gitlab.com/press. */
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#E24329" d="m12 21.94-3.36-10.34H15.36Z" />
      <path fill="#FC6D26" d="M12 21.94 8.64 11.6H3.05Z" />
      <path fill="#FCA326" d="M3.05 11.6 1.9 15.1a.79.79 0 0 0 .29.88l9.81 5.96Z" />
      <path fill="#E24329" d="M3.05 11.6h5.59L6.29 3.98a.4.4 0 0 0-.76 0Z" />
      <path fill="#FC6D26" d="M12 21.94 15.36 11.6h5.59Z" />
      <path fill="#FCA326" d="m20.95 11.6 1.15 3.5a.79.79 0 0 1-.29.88l-9.81 5.96Z" />
      <path fill="#E24329" d="M20.95 11.6h-5.59l2.35-7.62a.4.4 0 0 1 .76 0Z" />
    </svg>
  );
}