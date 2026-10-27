'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { describeAuthError, readAuthErrorParams, SUPPORT_EMAIL, type AuthErrorCopy } from '@/lib/auth-errors';
import { safeRedirectPath } from '@/lib/utils';

const GENERIC: AuthErrorCopy = describeAuthError({ error: null, code: null, description: null });

export function AuthCodeErrorView() {
  const [copy, setCopy] = useState<AuthErrorCopy>(GENERIC);
  const [backHref, setBackHref] = useState('/auth/login');

  // The fragment only exists in the browser, so read the error after mount.
  useEffect(() => {
    const { search, hash } = window.location;
    const next = safeRedirectPath(new URLSearchParams(search).get('next'), '');
    const linking = next.startsWith('/dashboard/settings');
    setCopy(describeAuthError(readAuthErrorParams(search, hash), linking));
    if (linking) {
      // `connected` marks a successful connection; drop it so Settings doesn't announce one.
      const back = new URL(next, window.location.origin);
      back.searchParams.delete('connected');
      setBackHref(back.pathname + back.search);
    }
  }, []);

  const backToSettings = backHref !== '/auth/login';

  return (
    <section className="grid w-full max-w-md gap-4 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
        {backToSettings ? 'Connection failed' : 'Sign-in failed'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">{copy.message}</p>
      {copy.details ? (
        <p className="break-words rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-mono text-xs leading-5 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          {copy.details}
        </p>
      ) : null}
      <Link
        className="mt-2 grid min-h-11 place-items-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
        href={backHref}
      >
        {backToSettings ? 'Back to settings' : 'Back to sign in'}
      </Link>
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Still stuck?{' '}
        <a className="font-semibold text-neutral-800 underline-offset-4 hover:underline dark:text-neutral-200" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  );
}
