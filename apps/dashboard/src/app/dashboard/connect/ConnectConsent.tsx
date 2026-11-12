'use client';

import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Key01Icon from '@hugeicons/core-free-icons/Key01Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { retryAfterStepUp } from '@/lib/step-up';
import { Notice, SettingsCard, primaryButton, secondaryButton } from '../settings/SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type RequestInfo = {
  client: { id: string; name: string };
  redirectUri: string;
  error: string | null;
  readScopes: string[];
  writeScopes: string[];
};

/** Plain-language names for what each scope area lets the app see or do. */
const AREAS: Record<string, string> = {
  projects: 'projects',
  analytics: 'analytics',
  insights: 'insights and queries',
  funnels: 'funnels',
  users: 'users and their timelines',
  errors: 'errors',
  flags: 'feature flags',
  alerts: 'alerts',
  links: 'short links',
  cohorts: 'cohorts',
  dashboards: 'dashboards',
  experiments: 'experiments',
  surveys: 'surveys',
  replays: 'session replays',
  webhooks: 'webhooks',
  synthetic_monitors: 'synthetic monitors'
};

const areaList = (scopes: string[]) => scopes.map((scope) => AREAS[scope.split(':')[0]] ?? scope.split(':')[0]).join(', ');

export function ConnectConsent({ params, userEmail }: { params: Record<string, string>; userEmail: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [allowWrites, setAllowWrites] = useState(() => (params.scope ?? '').split(/\s+/).some((scope) => scope.endsWith(':write')));
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);

  async function send(path: string, init: RequestInit = {}) {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your session expired. Sign in again.');
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  async function messageOf(response: Response) {
    if (response.status === 404) return 'This TraceIQ server does not support connecting apps yet.';
    try {
      const body = (await response.json()) as { message?: string | string[] };
      return Array.isArray(body.message) ? body.message.join(' ') : body.message ?? `Request failed (${response.status}).`;
    } catch {
      return `Request failed (${response.status}).`;
    }
  }

  useEffect(() => {
    if (!params.client_id) {
      setLoadError('This link is missing the app details. Start connecting again from your AI app.');
      return;
    }
    void (async () => {
      try {
        const response = await send(`/v1/dashboard/oauth/request?${new URLSearchParams(params).toString()}`);
        if (!response.ok) {
          setLoadError(await messageOf(response));
          return;
        }
        setInfo((await response.json()) as RequestInfo);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load this request.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(kind: 'approve' | 'deny') {
    setBusy(kind);
    setActionError(null);
    try {
      const init = { method: 'POST', body: JSON.stringify({ ...params, allowWrites }) };
      const path = `/v1/dashboard/oauth/${kind}`;
      const first = await send(path, init);
      const response = await retryAfterStepUp(first, () => send(path, init));
      if (!response.ok) {
        setActionError(await messageOf(response));
        setBusy(null);
        return;
      }
      const { redirectUrl } = (await response.json()) as { redirectUrl: string };
      window.location.assign(redirectUrl);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg py-6">
      {loadError ? (
        <Notice tone="error">{loadError}</Notice>
      ) : !info ? (
        <div className="h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-slate-800 dark:bg-slate-900" />
      ) : (
        <SettingsCard icon={Key01Icon} title={`Connect ${info.client.name} to TraceIQ`} description={userEmail ? `Signed in as ${userEmail}` : undefined}>
          <div className="grid gap-4 px-5 py-4 text-sm leading-6 text-neutral-600 dark:text-slate-300">
            {info.error ? <Notice tone="error">{info.error}</Notice> : null}
            <p>
              <span className="font-medium text-neutral-900 dark:text-white">{info.client.name}</span> wants to use TraceIQ on your
              behalf through MCP. It will be able to read your {areaList(info.readScopes)}.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-neutral-900 dark:accent-white"
                checked={allowWrites}
                onChange={(event) => setAllowWrites(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-neutral-900 dark:text-white">Also allow changes</span>
                <span className="block text-neutral-500 dark:text-slate-400">
                  Create, edit and delete {areaList(info.writeScopes)}. Leave this off to keep the app read-only.
                </span>
              </span>
            </label>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              The connection lasts 90 days. You can revoke it any time under Settings → Personal access tokens. After you allow it,
              you go back to <span className="break-all font-mono">{new URL(info.redirectUri).host || info.redirectUri}</span>.
            </p>
            {actionError ? <Notice tone="error">{actionError}</Notice> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void decide('deny')}>
                {busy === 'deny' ? 'Cancelling…' : 'Cancel'}
              </button>
              <button type="button" className={primaryButton} disabled={busy !== null || Boolean(info.error)} onClick={() => void decide('approve')}>
                <HugeiconsIcon icon={Key01Icon} size={15} />
                {busy === 'approve' ? 'Connecting…' : 'Allow access'}
              </button>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
