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
    <section className="setup-panel" aria-labelledby="setup-title">
      <div className="setup-copy">
        <p className="dashboard-kicker">Project setup</p>
        <h2 id="setup-title">Create your first tracking project.</h2>
        <p>
          This creates an organization, adds you as owner, creates a project, and gives you the first SDK
          write key.
        </p>
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        <label htmlFor="organizationName">
          Organization name
          <input
            id="organizationName"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
        </label>

        <label htmlFor="projectName">
          Project name
          <input
            id="projectName"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={isSubmitting || isLoading}>
          {setup?.project ? 'Refresh setup' : isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {status ? <p className="setup-status">{status}</p> : null}

      <div className="setup-results">
        <SetupCard label="Organization" value={setup?.organization?.name ?? 'Not created'} detail={setup?.organization?.id} />
        <SetupCard label="Project" value={setup?.project?.name ?? 'Not created'} detail={setup?.project?.id} />
        <SetupCard label="Write key" value={setup?.writeKey?.prefix ?? 'Only shown when newly created'} detail={setup?.writeKey?.value} />
      </div>

      {setup?.sdkSnippet ? (
        <div className="setup-snippet">
          <div>
            <h3>SDK snippet</h3>
            <p>Use this in a browser app to send the first real event.</p>
          </div>
          <pre>
            <code>{setup.sdkSnippet}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function SetupCard({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <article className="dashboard-card">
      <span>{label}</span>
      <h2>{value}</h2>
      {detail ? <code>{detail}</code> : <p>Waiting for setup.</p>}
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
