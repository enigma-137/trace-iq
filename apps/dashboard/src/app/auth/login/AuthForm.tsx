'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type AuthMode = 'signin' | 'signup';

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';
  const missingConfig = searchParams.get('missingConfig') === '1';
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(missingConfig ? 'Supabase env vars are missing.' : null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-8 text-slate-950">
      <section
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        aria-labelledby="auth-title"
      >
        <div>
          <Link className="inline-flex" href="/" aria-label="TraceIQ home">
            <img
              className="h-9 w-auto"
              src="/brand/logo-black-no-bg.png"
              alt="TraceIQ"
            />
          </Link>
          <p className="mb-2 mt-7 text-xs font-extrabold uppercase tracking-normal text-slate-600">
            Dashboard access
          </p>
          <h1
            id="auth-title"
            className="text-4xl font-medium leading-none tracking-normal text-slate-950 sm:text-5xl"
          >
            {mode === 'signin' ? 'Sign in to TraceIQ' : 'Create your TraceIQ account'}
          </h1>
          <p className="mt-4 leading-7 text-slate-600">
            Supabase Auth powers dashboard access. SDK ingestion still uses project write keys.
          </p>
        </div>

        <div
          className="my-7 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1"
          role="tablist"
          aria-label="Authentication mode"
        >
          <button
            type="button"
            className={`min-h-10 rounded-md font-extrabold transition ${
              mode === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
            }`}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`min-h-10 rounded-md font-extrabold transition ${
              mode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
            }`}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="text-xs font-extrabold uppercase text-slate-600" htmlFor="email">
            Email
          </label>
          <input
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            id="email"
            name="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="text-xs font-extrabold uppercase text-slate-600" htmlFor="password">
            Password
          </label>
          <input
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            id="password"
            name="password"
            type="password"
            value={password}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button
            className="mt-3 min-h-12 rounded-lg border border-slate-950 bg-slate-950 px-4 font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting || missingConfig}
          >
            {isSubmitting ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {status ? <p className="mt-5 rounded-lg bg-orange-50 p-3 text-orange-800">{status}</p> : null}
      </section>
    </main>
  );
}
