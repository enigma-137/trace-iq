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
  const [status, setStatus] = useState<string | null>(null);
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
      setStatus('Your dashboard session expired. Sign in again.');
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
      setStatus(await readError(response));
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
      setStatus('Your dashboard session expired. Sign in again.');
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
      setStatus(await readError(response));
      return;
    }

    setSetup((await response.json()) as SetupResponse);
    setStatus('Project setup complete.');
  }

  return (
    <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-6" aria-labelledby="setup-title">
      <div className="max-w-3xl">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-normal text-slate-600">Project setup</p>
        <h2 id="setup-title" className="text-3xl font-semibold leading-tight tracking-normal text-slate-950 md:text-5xl">
          Create your first tracking project.
        </h2>
        <p className="mt-4 leading-7 text-slate-600">
          This creates an organization, adds you as owner, creates a project, and gives you the first SDK
          write key.
        </p>
      </div>

      <form className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-xs font-extrabold uppercase text-slate-600" htmlFor="organizationName">
          Organization name
          <input
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal normal-case text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            id="organizationName"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase text-slate-600" htmlFor="projectName">
          Project name
          <input
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal normal-case text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            id="projectName"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <button
          className="min-h-12 rounded-lg border border-slate-950 bg-slate-950 px-5 font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={isSubmitting || isLoading}
        >
          {setup?.project ? 'Refresh setup' : isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {status ? <p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{status}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SetupCard label="Organization" value={setup?.organization?.name ?? 'Not created'} detail={setup?.organization?.id} />
        <SetupCard label="Project" value={setup?.project?.name ?? 'Not created'} detail={setup?.project?.id} />
        <SetupCard label="Write key" value={setup?.writeKey?.prefix ?? 'Only shown when newly created'} detail={setup?.writeKey?.value} />
      </div>

      {setup?.sdkSnippet ? (
        <div className="grid gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-950">SDK snippet</h3>
            <p className="text-slate-600">Use this in a browser app to send the first real event.</p>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-5 text-sm text-slate-200">
            <code>{setup.sdkSnippet}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function SetupCard({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <article className="min-h-56 rounded-lg border border-slate-200 bg-white p-6">
      <span className="text-xs font-black uppercase tracking-normal text-slate-500">{label}</span>
      <h2 className="mt-5 text-xl font-semibold tracking-normal text-slate-950">{value}</h2>
      {detail ? (
        <code className="mt-4 block rounded-md bg-slate-100 p-3 text-sm text-slate-700 [overflow-wrap:anywhere]">
          {detail}
        </code>
      ) : (
        <p className="mt-3 leading-7 text-slate-600">Waiting for setup.</p>
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
