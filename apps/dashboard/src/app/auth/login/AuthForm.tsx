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
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div>
          <Link className="auth-brand" href="/">
            TraceIQ
          </Link>
          <p className="auth-kicker">Dashboard access</p>
          <h1 id="auth-title">{mode === 'signin' ? 'Sign in to TraceIQ' : 'Create your TraceIQ account'}</h1>
          <p className="auth-copy">
            Supabase Auth powers dashboard access. SDK ingestion still uses project write keys.
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'signin' ? 'active' : ''}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting || missingConfig}>
            {isSubmitting ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {status ? <p className="auth-status">{status}</p> : null}
      </section>
    </main>
  );
}

