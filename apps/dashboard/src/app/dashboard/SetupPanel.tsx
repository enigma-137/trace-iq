'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface SetupResponse {
  hasSetup: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null;
  project: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
  } | null;
  writeKey: {
    prefix: string;
    value: string;
  } | null;
  sdkSnippet: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SetupPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [organizationName, setOrganizationName] = useState('My Organization');
  const [projectName, setProjectName] = useState('Web App');
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const hasProject = Boolean(setup?.project);

  useEffect(() => {
    void loadSetup();
  }, []);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token;
  }

  async function loadSetup() {
    setIsLoading(true);
    setStatus(null);

    const token = await getAccessToken();

    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsLoading(false);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/setup`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    setIsLoading(false);

    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }

    setSetup((await response.json()) as SetupResponse);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const token = await getAccessToken();

    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsSubmitting(false);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/setup/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationName,
        projectName,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }

    setSetup((await response.json()) as SetupResponse);
    setStatus({ tone: 'success', message: 'Project setup complete.' });
  }

  async function handleRegenerateWriteKey() {
    const confirmed = window.confirm(
      'Regenerating will revoke the current active write key for this project. Continue?'
    );

    if (!confirmed) {
      return;
    }

    setIsRegenerating(true);
    setStatus(null);

    const token = await getAccessToken();

    if (!token) {
      setStatus({ tone: 'error', message: 'Your dashboard session expired. Sign in again.' });
      setIsRegenerating(false);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/setup/write-key/regenerate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    setIsRegenerating(false);

    if (!response.ok) {
      setStatus({ tone: 'error', message: await readError(response) });
      return;
    }

    setSetup((await response.json()) as SetupResponse);
    setStatus({ tone: 'success', message: 'New write key generated. Copy it now; it will be hidden later.' });
  }

  return (
    <section className="grid gap-5 rounded-lg border border-slate-800 bg-slate-950/70 p-5" aria-labelledby="setup-title">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-normal text-slate-500">Project setup</p>
          <h2 id="setup-title" className="text-2xl font-semibold leading-tight tracking-normal text-white">
            {hasProject ? 'Project settings' : 'Create your tracking workspace'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {hasProject
              ? 'Copy install credentials, review your SDK snippet, or regenerate the project write key.'
              : 'Create an organization, a project, and the first SDK write key for browser event tracking.'}
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
          Phase 1 setup
        </span>
      </div>

      <form
        className="grid items-end gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2 text-xs font-bold uppercase text-slate-400" htmlFor="organizationName">
          Organization name
          <input
            className="min-h-10 rounded-md border border-slate-700 bg-black px-3 text-sm font-normal normal-case text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-white focus:ring-2 focus:ring-white/10"
            id="organizationName"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-2 text-xs font-bold uppercase text-slate-400" htmlFor="projectName">
          Project name
          <input
            className="min-h-10 rounded-md border border-slate-700 bg-black px-3 text-sm font-normal normal-case text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-white focus:ring-2 focus:ring-white/10"
            id="projectName"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <button
          className="min-h-10 rounded-md bg-white px-4 text-sm font-bold text-black transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={isSubmitting || isLoading}
        >
          {hasProject ? 'Refresh settings' : isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {status ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            status.tone === 'success'
              ? 'border-slate-600 bg-slate-900 text-slate-100'
              : 'border-white/30 bg-white/10 text-white'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SetupCard
          label="Organization"
          value={setup?.organization?.name ?? 'Not created'}
          detail={setup?.organization?.id}
          copyLabel="Copy org ID"
        />
        <SetupCard
          label="Project ID"
          value={setup?.project?.id ?? 'Not created'}
          detail={setup?.project?.name ? `${setup.project.name} / ${setup.project.slug}` : null}
          copyValue={setup?.project?.id}
          copyLabel="Copy project ID"
        />
        <SetupCard
          label="Write key"
          value={setup?.writeKey?.prefix ?? 'Hidden after creation'}
          detail={
            setup?.writeKey?.value ??
            (setup?.project ? 'Lost the key? Regenerate a new one and update your installed SDK snippet.' : null)
          }
          copyValue={setup?.writeKey?.value ?? null}
          copyLabel="Copy write key"
        />
      </div>

      {setup?.sdkSnippet ? (
        <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-base font-semibold text-white">SDK snippet</h3>
              <p className="mt-1 text-sm text-slate-400">
                Paste this into a browser app to send the first real event.
              </p>
            </div>
            <CopyButton value={setup.sdkSnippet} label="Copy snippet" />
          </div>
          <pre className="overflow-x-auto rounded-md border border-slate-800 bg-[#05070c] p-4 text-sm text-slate-300">
            <code>{setup.sdkSnippet}</code>
          </pre>
        </div>
      ) : null}

      {setup?.project ? (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-white">Write key recovery</h3>
            <p className="mt-1 text-sm text-slate-500">
              Write keys are shown once. Regenerate when the key is lost or compromised.
            </p>
          </div>
          <button
            className="h-9 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm font-semibold text-slate-200 transition hover:border-white hover:text-white disabled:cursor-wait disabled:opacity-60"
            type="button"
            disabled={isRegenerating}
            onClick={handleRegenerateWriteKey}
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate write key'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SetupCard({
  label,
  value,
  detail,
  copyValue,
  copyLabel
}: {
  label: string;
  value: string;
  detail?: string | null;
  copyValue?: string | null;
  copyLabel?: string;
}) {
  const resolvedCopyValue = copyValue === undefined ? detail : copyValue;

  return (
    <article className="min-h-40 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</span>
        {resolvedCopyValue ? <CopyButton value={resolvedCopyValue} label={copyLabel ?? 'Copy'} compact /> : null}
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-normal text-white [overflow-wrap:anywhere]">{value}</h2>
      {detail ? (
        <code className="mt-4 block rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 [overflow-wrap:anywhere]">
          {detail}
        </code>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">Waiting for setup.</p>
      )}
    </article>
  );
}

function CopyButton({ value, label, compact = false }: { value: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`rounded-md border border-slate-700 bg-black font-semibold text-slate-300 transition hover:border-white hover:text-white ${
        compact ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm'
      }`}
      type="button"
      onClick={handleCopy}
    >
      {copied ? 'Copied' : label}
    </button>
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
