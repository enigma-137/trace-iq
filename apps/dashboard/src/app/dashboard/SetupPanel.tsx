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

  return (
    <section className="grid gap-5 rounded-lg border border-slate-800 bg-slate-950/70 p-5" aria-labelledby="setup-title">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-normal text-cyan-300">Project setup</p>
          <h2 id="setup-title" className="text-2xl font-semibold leading-tight tracking-normal text-white">
            Create your tracking workspace
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create an organization, a project, and the first SDK write key for browser event tracking.
          </p>
        </div>
        <span className="w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
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
            className="min-h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-normal normal-case text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            id="organizationName"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-2 text-xs font-bold uppercase text-slate-400" htmlFor="projectName">
          Project name
          <input
            className="min-h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-normal normal-case text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            id="projectName"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <button
          className="min-h-10 rounded-md bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={isSubmitting || isLoading}
        >
          {setup?.project ? 'Refresh setup' : isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {status ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            status.tone === 'success'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SetupCard label="Organization" value={setup?.organization?.name ?? 'Not created'} detail={setup?.organization?.id} />
        <SetupCard label="Project" value={setup?.project?.name ?? 'Not created'} detail={setup?.project?.id} />
        <SetupCard label="Write key" value={setup?.writeKey?.prefix ?? 'Only shown when newly created'} detail={setup?.writeKey?.value} />
      </div>

      {setup?.sdkSnippet ? (
        <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div>
            <h3 className="text-base font-semibold text-white">SDK snippet</h3>
            <p className="mt-1 text-sm text-slate-400">Use this in a browser app to send the first real event.</p>
          </div>
          <pre className="overflow-x-auto rounded-md border border-slate-800 bg-[#05070c] p-4 text-sm text-slate-300">
            <code>{setup.sdkSnippet}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function SetupCard({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <article className="min-h-40 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <span className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</span>
      <h2 className="mt-4 text-lg font-semibold tracking-normal text-white">{value}</h2>
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

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
