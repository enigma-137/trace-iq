'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';
import { clearPendingInvite, rememberPendingInvite } from '@/lib/pending-invite';
import { setActiveOrganizationId } from '@/lib/organization';
import { AuthParticles } from '../../auth/AuthParticles';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ValidInvite = {
  valid: true;
  organizationName: string;
  email: string;
  role: string;
};

type InvalidInvite = {
  valid: false;
  status: 'invalid' | 'not-found' | 'expired' | 'accepted' | 'revoked';
};

const INVALID_LABELS: Record<Exclude<InvalidInvite['status'], never>, string> = {
  invalid: 'The invitation link could not be read.',
  'not-found': 'This invitation link does not exist or is incomplete.',
  expired: 'This invitation has expired. Ask an owner or admin to send a new one.',
  accepted: 'This invitation has already been accepted.',
  revoked: 'This invitation was cancelled by an owner or admin.'
};

export function InviteClient({ token }: { token: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [invite, setInvite] = useState<ValidInvite | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const checkResponse = await fetch(
          `${apiBaseUrl}/v1/organization/invites/check/${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        );
        const check = (await checkResponse.json()) as ValidInvite | InvalidInvite;

        if (cancelled) return;

        if (!check.valid) {
          setInvalidReason(INVALID_LABELS[check.status] ?? INVALID_LABELS['not-found']);
          return;
        }

        setInvite(check);

        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            rememberPendingInvite(token);
          }
          setSignedOut(true);
          return;
        }

        const response = await fetch(`${apiBaseUrl}/v1/organization/invites/accept`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token })
        });

        if (cancelled) return;

        if (!response.ok) {
          setError(await readError(response));
          return;
        }

        const body = (await response.json()) as { accepted?: boolean; organizationId?: string };
        if (body.organizationId) {
          setActiveOrganizationId(body.organizationId);
        }

        setAccepted(true);
        clearPendingInvite();
      } catch {
        if (!cancelled) {
          setInvalidReason(INVALID_LABELS['not-found']);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  const signedInPath = `/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <main style={{ colorScheme: 'light' }} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#e5f3ff] via-white to-[#fff0e4] px-4 py-10 text-[#101715]">
      <AuthParticles />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/" aria-label="TraceIQ home" className="flex items-center gap-2.5">
            <img className="h-8 w-8" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <span className="text-xl font-bold tracking-tight text-neutral-900">TraceIQ</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-[#d4e2f2] bg-white/90 p-6 shadow-xl shadow-[#245beb]/10 backdrop-blur">
          {invalidReason ? (
            <InvalidCard reason={invalidReason} />
          ) : !invite ? (
            <div className="grid gap-3 py-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : accepted ? (
            <div className="grid gap-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-neutral-900">You&apos;re in!</h1>
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  You joined <span className="font-semibold text-neutral-900">{invite.organizationName}</span> as a{' '}
                  <span className="font-semibold capitalize text-neutral-900">{invite.role}</span>.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#245beb] px-4 text-sm font-bold text-white transition hover:bg-[#1247ce]"
              >
                Go to dashboard
              </Link>
            </div>
          ) : error ? (
            <div className="grid gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Couldn&apos;t accept the invitation</h1>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{error}</p>
              </div>
              <div className="grid gap-2.5">
                <Link
                  href={signedInPath}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-[#245beb] px-4 text-sm font-bold text-white transition hover:bg-[#1247ce]"
                >
                  Sign in with the invited email
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[#d4e2f2] bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-[#e5f3ff]"
                >
                  Go to dashboard
                </Link>
              </div>
            </div>
          ) : signedOut ? (
            <div className="grid gap-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
                  You&apos;re invited to {invite.organizationName}
                </h1>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  <span className="font-medium text-neutral-900">{invite.email}</span> was invited to join as a{' '}
                  <span className="font-semibold capitalize text-neutral-900">{invite.role}</span>. Sign in with that
                  email address to accept.
                </p>
              </div>
              <Link
                href={signedInPath}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#245beb] px-4 text-sm font-bold text-white transition hover:bg-[#1247ce]"
              >
                Sign in or create an account
              </Link>
            </div>
          ) : (
            <div className="grid gap-2 py-4 text-center">
              <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
                Accepting your invitation to {invite.organizationName}…
              </h1>
              <p className="text-sm text-neutral-500">
                You&apos;ll be added as a {invite.role}.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Invitations let teammates join your TraceIQ organization and expire after 7 days.
        </p>
      </div>
    </main>
  );
}

function InvalidCard({ reason }: { reason: string }) {
  return (
    <div className="grid gap-4">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Invitation unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{reason}</p>
      </div>
      <div className="grid gap-2.5">
        <Link
          href="/auth/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#245beb] px-4 text-sm font-bold text-white transition hover:bg-[#1247ce]"
        >
          Sign in to TraceIQ
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md border border-[#d4e2f2] bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-[#e5f3ff]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}