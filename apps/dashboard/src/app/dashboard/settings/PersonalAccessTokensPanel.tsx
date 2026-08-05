'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { Skeleton } from '@/components/Skeleton';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type TokenRecord = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type CreateTokenResponse = TokenRecord & {
  token: string;
};

const scopeOptions = [
  { value: 'projects:read', label: 'Projects read' },
  { value: 'flags:read', label: 'Flags read' },
  { value: 'flags:write', label: 'Flags write' }
];

export function PersonalAccessTokensPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [name, setName] = useState('Claude Desktop');
  const [scopes, setScopes] = useState<string[]>(['projects:read', 'flags:read', 'flags:write']);
  const [expiresAt, setExpiresAt] = useState('');
  const [createdToken, setCreatedToken] = useState<CreateTokenResponse | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<TokenRecord | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    void loadTokens();
  }, []);

  async function getAccessToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function authFetch(path: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      return null;
    }

    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  async function loadTokens() {
    setIsLoading(true);
    setStatus(null);
    const response = await authFetch('/v1/dashboard/personal-access-tokens');
    setIsLoading(false);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    const body = (await response.json()) as { tokens: TokenRecord[] };
    setTokens(body.tokens);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setCreatedToken(null);
    if (scopes.length === 0) {
      setStatus({ tone: 'error', message: 'Choose at least one scope.' });
      return;
    }

    setIsSubmitting(true);
    const response = await authFetch('/v1/dashboard/personal-access-tokens', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim() || 'MCP token',
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      })
    });
    setIsSubmitting(false);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }

    const body = (await response.json()) as CreateTokenResponse;
    setCreatedToken(body);
    setTokens((current) => [body, ...current]);
    setStatus({ tone: 'success', message: 'Token created. Copy it now; it will be hidden after you leave this panel.' });
  }

  async function handleRevoke() {
    if (!tokenToRevoke) return;
    setIsRevoking(true);
    setStatus(null);
    const response = await authFetch(`/v1/dashboard/personal-access-tokens/${tokenToRevoke.id}`, { method: 'DELETE' });
    setIsRevoking(false);
    if (!response) return;
    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }
    setTokens((current) => current.map((token) => (token.id === tokenToRevoke.id ? { ...token, revokedAt: new Date().toISOString() } : token)));
    setTokenToRevoke(null);
    setStatus({ tone: 'success', message: 'Token revoked.' });
  }

  function toggleScope(scope: string) {
    setScopes((current) => (current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]));
  }

  return (
    <section className="mt-8 grid gap-5 border-t border-neutral-200 pt-8 dark:border-slate-800" aria-labelledby="pat-title">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">AI access</p>
          <h2 id="pat-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Personal access tokens
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Create tokens for MCP clients such as Claude Desktop or Cursor. Full token values are shown once.
          </p>
        </div>
        <Link
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          href="/docs?page=mcp"
        >
          MCP docs
        </Link>
      </div>

      {status ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            status.tone === 'success'
              ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
        <form className="grid h-fit gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950" onSubmit={handleCreate}>
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Create token</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">Use all three scopes for a feature-flag MCP assistant.</p>
          </div>

          <label className={fieldClass} htmlFor="patName">
            Token name
            <input id="patName" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">Scopes</legend>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {scopeOptions.map((option) => (
                <label key={option.value} className="flex min-h-10 items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm text-neutral-700 dark:border-slate-800 dark:text-slate-300">
                  <input
                    className="h-4 w-4 accent-neutral-900 dark:accent-white"
                    type="checkbox"
                    checked={scopes.includes(option.value)}
                    onChange={() => toggleScope(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className={fieldClass} htmlFor="patExpires">
            Expiry date (optional)
            <input id="patExpires" className={inputClass} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>

          <button
            className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create token'}
          </button>
        </form>

        <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Tokens</p>
            <button className={secondaryButtonClass} type="button" onClick={() => void loadTokens()} disabled={isLoading}>
              Refresh
            </button>
          </div>

          {createdToken ? <CreatedTokenCard token={createdToken} /> : null}

          {isLoading ? (
            <div className="grid gap-3 p-5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No personal access tokens yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
              {tokens.map((token) => (
                <li key={token.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-neutral-900 dark:text-white">{token.name}</p>
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-slate-900 dark:text-slate-400">{token.tokenPrefix}...</code>
                      {token.revokedAt ? <Badge tone="muted">Revoked</Badge> : isExpired(token.expiresAt) ? <Badge tone="error">Expired</Badge> : <Badge tone="active">Active</Badge>}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-slate-500">
                      {token.scopes.join(', ')} · Created {formatDate(token.createdAt)} · Last used {formatDate(token.lastUsedAt)}
                      {token.expiresAt ? ` · Expires ${formatDate(token.expiresAt)}` : ''}
                    </p>
                  </div>
                  <button
                    className={dangerButtonClass}
                    type="button"
                    disabled={Boolean(token.revokedAt) || isRevoking}
                    onClick={() => setTokenToRevoke(token)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DashboardDialog
        open={Boolean(tokenToRevoke)}
        title="Revoke token?"
        description={tokenToRevoke ? `${tokenToRevoke.name} stops working immediately. MCP clients using it will lose access until you create a new token.` : undefined}
        onClose={() => {
          if (!isRevoking) setTokenToRevoke(null);
        }}
        footer={
          <>
            <button className={secondaryButtonClass} type="button" disabled={isRevoking} onClick={() => setTokenToRevoke(null)}>
              Cancel
            </button>
            <button className={dangerButtonClass} type="button" disabled={isRevoking} onClick={handleRevoke}>
              {isRevoking ? 'Revoking...' : 'Revoke token'}
            </button>
          </>
        }
      />
    </section>
  );
}

function CreatedTokenCard({ token }: { token: CreateTokenResponse }) {
  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        traceiq: {
          command: 'npx',
          args: ['-y', '@traceiq/mcp-server'],
          env: {
            TRACEIQ_API_KEY: token.token,
            TRACEIQ_API_URL: apiBaseUrl
          }
        }
      }
    },
    null,
    2
  );

  return (
    <div className="grid gap-3 border-b border-neutral-200 bg-neutral-50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Copy this token now</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">TraceIQ will not show the full value again.</p>
        </div>
        <CopyButton value={token.token} label="Copy token" />
      </div>
      <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-white p-3 font-mono text-xs leading-6 text-neutral-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
        <code>{token.token}</code>
      </pre>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Claude Desktop config</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">Paste this into your MCP client config.</p>
        </div>
        <CopyButton value={claudeConfig} label="Copy config" />
      </div>
      <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-white p-3 font-mono text-xs leading-6 text-neutral-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
        <code>{claudeConfig}</code>
      </pre>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className={secondaryButtonClass} type="button" onClick={handleCopy}>
      {copied ? 'Copied' : label}
    </button>
  );
}

function Badge({ children, tone }: { children: string; tone: 'active' | 'error' | 'muted' }) {
  const className =
    tone === 'active'
      ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
      : tone === 'error'
        ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900'
        : 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-500';

  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>{children}</span>;
}

function isExpired(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

const fieldClass = 'grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400';

const inputClass =
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

const secondaryButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const dangerButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50';
