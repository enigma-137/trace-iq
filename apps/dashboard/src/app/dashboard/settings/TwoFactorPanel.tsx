'use client';

import Link from 'next/link';
import { useMfaStatus } from '@/lib/mfa';
import { Skeleton } from '@/components/Skeleton';

export function TwoFactorPanel() {
  const { enrolled } = useMfaStatus();

  return (
    <section className="mt-8 grid gap-5 border-t border-neutral-200 pt-8 dark:border-slate-800" aria-labelledby="2fa-title">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Security</p>
        <h2 id="2fa-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Two-factor authentication
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          Add an authenticator one-time code to sign-in.
        </p>
      </div>

      {enrolled === null ? (
        <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-4 w-48" />
        </div>
      ) : enrolled ? (
        <div className="flex flex-col justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/20 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Enabled</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-300/80">
              Your account is protected by two-factor authentication.
            </p>
          </div>
          <Link
            className="h-9 shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-2 text-center text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            href="/dashboard/settings/2fa"
          >
            Manage
          </Link>
        </div>
      ) : (
        <div className="flex flex-col justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/70 dark:bg-amber-950/20 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              Not enabled yet
            </h3>
            <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-200/80">
              Recommended: protect your account and projects with an authenticator app.
            </p>
          </div>
          <Link
            className="h-9 shrink-0 rounded-md border border-amber-300 bg-white px-3 py-2 text-center text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
            href="/dashboard/settings/2fa"
          >
            Set up
          </Link>
        </div>
      )}
    </section>
  );
}