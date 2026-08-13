'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';

interface MfaStepUpContextValue {
  requestStepUp: () => Promise<string | null>;
}

const MfaStepUpContext = createContext<MfaStepUpContextValue>({
  requestStepUp: async () => null
});

export function useMfaStepUp() {
  return useContext(MfaStepUpContext);
}

/**
 * Mounted once around the dashboard. Lets any panel re-complete a second factor
 * when the API rejects a sensitive write with STEP_UP_REQUIRED / STEP_UP_EXPIRED
 * (Supabase amr step-up decays after ~15 minutes), then retries the request with
 * the fresh MFA-verified access token.
 */
export function MfaStepUpProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const resolver = useRef<((token: string | null) => void) | null>(null);

  const close = useCallback(() => {
    setFactorId(null);
    setCode('');
    setErrorMessage(null);
    setVerifying(false);
  }, []);

  const requestStepUp = useCallback(async () => {
    if (resolver.current) {
      return null;
    }

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      return null;
    }
    const factor =
      data?.totp?.find((item) => item.status === 'verified') ??
      data?.all?.find((item) => item.status === 'verified');

    if (!factor) {
      return null;
    }

    setFactorId(factor.id);
    setCode('');
    setErrorMessage(null);
    setVerifying(false);

    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, [supabase]);

  async function handleVerify() {
    if (!factorId || !resolver.current) {
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setErrorMessage('Enter the code from your authenticator app.');
      return;
    }

    setVerifying(true);
    setErrorMessage(null);

    const challenge = await supabase.auth.mfa.challenge({ factorId });
    const verify = challenge.error
      ? { error: challenge.error }
      : await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.data.id,
          code: trimmedCode
        });

    if (verify.error) {
      setVerifying(false);
      setErrorMessage(`Verification failed: ${verify.error.message}`);
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();
    const resolve = resolver.current;
    resolver.current = null;
    close();
    resolve(session?.access_token ?? null);
  }

  function handleCancel() {
    const resolve = resolver.current;
    resolver.current = null;
    close();
    resolve?.(null);
  }

  return (
    <MfaStepUpContext.Provider value={{ requestStepUp }}>
      {children}
      <DashboardDialog
        open={Boolean(factorId)}
        title="Verify it's you"
        description="Re-confirm your identity to continue. Enter the one-time code from your authenticator app."
        onClose={handleCancel}
        footer={
          <>
            <button className={secondaryButtonClass} type="button" disabled={verifying} onClick={handleCancel}>
              Cancel
            </button>
            <button className={primaryButtonClass} type="button" disabled={verifying} onClick={() => void handleVerify()}>
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </>
        }
      >
        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
            One-time code
          </span>
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            className={inputClass}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleVerify();
              }
            }}
            placeholder="123456"
            maxLength={8}
          />
        </label>
        {errorMessage ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p> : null}
      </DashboardDialog>
    </MfaStepUpContext.Provider>
  );
}

/**
 * Shared authenticated fetch for dashboard panels. Attaches the session token,
 * and when the API answers 403 with a step-up code, prompts the user to
 * re-complete a second factor and transparently retries with the fresh token.
 * Returns null when there is no usable session.
 */
export async function dashboardFetch(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  requestStepUp: () => Promise<string | null>,
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  async function send(accessToken: string) {
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return null;
  }

  let response = await send(session.access_token);

  if (response.status === 403) {
    const body = (await response.clone().json().catch(() => null)) as { message?: string; error?: string } | null;
    const code = body?.error ?? '';
    const message = body?.message ?? '';
    const needsStepUp =
      code === 'STEP_UP_REQUIRED' || code === 'STEP_UP_EXPIRED' || /step-up|second factor/i.test(`${code} ${message}`);

    if (needsStepUp) {
      const freshToken = await requestStepUp();
      if (freshToken) {
        response = await send(freshToken);
      }
    }
  }

  return response;
}

const inputClass =
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

const secondaryButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const primaryButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200';