'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type AuthMode = 'signin' | 'signup';
type AuthStage = 'credentials' | 'setup-prompt' | 'mfa-challenge';

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';
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
   * After a successful sign-in, route through the optional 2FA flow:
   * - User already has a verified authenticator factor → require a code here.
   * - User has no factor → recommend enabling 2FA (they can say no and proceed).
   * - Everything else (incl. freshly-signed-up users) → straight to the dashboard.
   */
  async function decideNextStep() {
    if (!supabase) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsChallenge = !aalError && aal?.nextLevel === 'aal2';

    if (!needsChallenge) {
      if (!aalError && aal?.currentLevel === 'aal1') {
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
      router.push(nextPath);
      router.refresh();
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

  const inputClass =
    'h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10';

  return (
    <main className="grid min-h-screen bg-white text-neutral-950 dark:bg-black dark:text-neutral-50 lg:grid-cols-2">
      {/* Brand panel — fills the space, hidden on small screens */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '22px 22px'
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-3xl"
        />
        <Link className="relative inline-flex" href="/" aria-label="TraceIQ home">
          <img className="h-9 w-auto" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Product analytics built for how your users actually behave.
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-400">
            Trends, funnels, retention, revenue, and error tracking — in one fast, privacy-friendly dashboard.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-neutral-300">
            {['Revenue & GTV as a first-class metric', 'Funnels with per-step drop-off', 'SDKs for web, server & mobile'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span aria-hidden className="text-white">✓</span>
                  {item}
                </li>
              )
            )}
          </ul>
        </div>

        <p className="relative font-mono text-xs text-neutral-500">TraceIQ · product analytics</p>
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
                    className={`min-h-9 rounded-md text-sm font-semibold transition ${
                      mode === value
                        ? 'bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                    onClick={() => setMode(value)}
                  >
                    {value === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
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
