'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import { DashboardDialog } from '@/app/dashboard/DashboardDialog';
import { ActionCard, HelpTip, Notice, buttonClass, fieldClass } from '@/components/dashboard/CalmUI';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'scheduled' | 'in_progress' | 'completed';
type Impact = 'none' | 'minor' | 'major' | 'critical';

export interface StatusPageIncident {
  id: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: IncidentStatus;
  impact: Impact;
  componentIds: string[];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string;
  resolvedAt: string | null;
  updates: Array<{ status: IncidentStatus; body: string; createdAt: string }>;
}

export interface StatusPageSettings {
  canEdit: boolean;
  page: { id: string; slug: string; title: string; description: string | null; enabled: boolean; updatedAt: string } | null;
  suggestedSlug: string;
  suggestedTitle: string;
  components: Array<{ id: string; monitorId: string; displayName: string; description: string | null }>;
  monitors: Array<{ id: string; name: string; status: string; schedule: string; lastRunStatus: string | null }>;
  incidents: StatusPageIncident[];
}

interface DraftComponent {
  monitorId: string;
  displayName: string;
  description: string;
}

const INCIDENT_STATUSES: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved'];
const MAINTENANCE_STATUSES: IncidentStatus[] = ['scheduled', 'in_progress', 'completed'];
const STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed'
};
const IMPACT_LABEL: Record<Impact, string> = {
  none: 'No impact',
  minor: 'Minor (degraded)',
  major: 'Major outage',
  critical: 'Critical outage'
};

type Api = (path: string, init?: RequestInit) => Promise<StatusPageSettings>;

export function StatusPageManager({ initial, projectId }: { initial: StatusPageSettings; projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState(initial);
  const [origin, setOrigin] = useState('https://traceiq.run');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<'incident' | 'maintenance' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const api = useCallback<Api>(
    async (path, init = {}) => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/status-page${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
      });
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as StatusPageSettings;
      setData(next);
      return next;
    },
    [supabase]
  );

  const page = data.page;
  const publicUrl = page ? `${origin}/status/${page.slug}` : null;
  const statusPill = page?.enabled ? 'Live' : page ? 'Draft' : 'Not set up';

  async function setPublished(enabled: boolean) {
    if (!page) return;
    setBusy(true);
    setMessage(null);
    try {
      await api('', {
        method: 'PUT',
        body: JSON.stringify({
          projectId,
          title: page.title,
          slug: page.slug,
          description: page.description ?? '',
          enabled,
          components: data.components.map((c) => ({ monitorId: c.monitorId, displayName: c.displayName, description: c.description ?? '' }))
        })
      });
      setMessage({ tone: 'ok', text: enabled ? 'Your status page is live.' : 'Unpublished. The page is no longer public.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">Public status page</h1>
          <HelpTip label="About the public status page">
            <div className="space-y-2">
              <p>Show your customers whether your services are up, with 90-day uptime from your synthetic monitors and the incident updates you post here.</p>
              <p>Monitor names, URLs, errors and screenshots are never shown. Free on every plan.</p>
            </div>
          </HelpTip>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              page?.enabled ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${page?.enabled ? 'bg-white' : 'bg-neutral-400'}`} />
            {statusPill}
          </span>
        </div>
        <p className="text-sm text-neutral-500 dark:text-slate-400">Tell customers what’s up, and when something isn’t.</p>
      </header>

      {!data.canEdit ? <Notice tone="warn">Only owners and admins can change the status page or post incidents.</Notice> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <ActionCard
          icon={Globe02Icon}
          tone="blue"
          title={page ? page.title : 'Your page'}
          description={
            page
              ? `${data.components.length} component${data.components.length === 1 ? '' : 's'} · ${page.enabled ? 'public' : 'not public yet'}`
              : 'Pick an address and the monitors to show.'
          }
          helpLabel="How components work"
          help="Each component is one of your synthetic monitors, shown under a public name. Its uptime comes from the monitor’s runs."
        >
          {data.canEdit ? (
            <button type="button" onClick={() => setEditing(true)} className={buttonClass.blue}>
              {page ? 'Edit page' : 'Set up page'}
            </button>
          ) : null}
          {publicUrl && page?.enabled ? (
            <a href={publicUrl} target="_blank" rel="noreferrer" className={buttonClass.quiet}>
              View page ↗
            </a>
          ) : null}
          {data.canEdit && page ? (
            page.enabled ? (
              <button type="button" onClick={() => setPublished(false)} disabled={busy} className={buttonClass.link}>
                Unpublish
              </button>
            ) : (
              <button type="button" onClick={() => setPublished(true)} disabled={busy || data.components.length === 0} className={buttonClass.link}>
                Publish
              </button>
            )
          ) : null}
        </ActionCard>

        <ActionCard
          icon={Alert02Icon}
          tone="orange"
          title="Incidents and maintenance"
          description={page ? 'Post what’s happening. Customers see it within a minute.' : 'Set up the page first to post updates.'}
          helpLabel="Writing incident updates"
          help="Updates appear on the public page within a minute. Write them for customers: what they notice and what you’re doing, without internal details."
        >
          {data.canEdit && page ? (
            <>
              <button type="button" onClick={() => setCreating('incident')} className={buttonClass.orange}>
                Report incident
              </button>
              <button type="button" onClick={() => setCreating('maintenance')} className={buttonClass.quiet}>
                Schedule maintenance
              </button>
            </>
          ) : null}
        </ActionCard>
      </div>

      {page ? <IncidentList data={data} api={api} projectId={projectId} /> : null}

      <DashboardDialog
        open={editing}
        onClose={() => setEditing(false)}
        title={page ? 'Edit status page' : 'Set up your status page'}
        maxWidthClass="max-w-3xl"
      >
        <SettingsForm
          data={data}
          api={api}
          projectId={projectId}
          origin={origin}
          onSaved={(text) => {
            setEditing(false);
            setMessage({ tone: 'ok', text });
          }}
          onCancel={() => setEditing(false)}
        />
      </DashboardDialog>

      <DashboardDialog
        open={creating !== null}
        onClose={() => setCreating(null)}
        title={creating === 'maintenance' ? 'Schedule maintenance' : 'Report an incident'}
        maxWidthClass="max-w-xl"
      >
        {creating ? <NewIncidentForm kind={creating} data={data} api={api} projectId={projectId} onDone={() => setCreating(null)} /> : null}
      </DashboardDialog>
    </div>
  );
}

// ─── Settings (in a dialog) ─────────────────────────────────────────────────

function SettingsForm({
  data,
  api,
  projectId,
  origin,
  onSaved,
  onCancel
}: {
  data: StatusPageSettings;
  api: Api;
  projectId?: string;
  origin: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(data.page?.title ?? data.suggestedTitle);
  const [slug, setSlug] = useState(data.page?.slug ?? data.suggestedSlug);
  const [description, setDescription] = useState(data.page?.description ?? '');
  const enabled = data.page?.enabled ?? false;
  const [components, setComponents] = useState<DraftComponent[]>(
    data.components.map((c) => ({ monitorId: c.monitorId, displayName: c.displayName, description: c.description ?? '' }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = origin.replace(/^https?:\/\//, '');

  const monitorName = (id: string) => data.monitors.find((m) => m.id === id)?.name ?? 'Deleted monitor';
  const included = new Set(components.map((c) => c.monitorId));

  function toggle(monitorId: string) {
    setComponents((current) =>
      current.some((c) => c.monitorId === monitorId)
        ? current.filter((c) => c.monitorId !== monitorId)
        : [...current, { monitorId, displayName: '', description: '' }]
    );
  }

  function move(index: number, delta: number) {
    setComponents((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patch(index: number, change: Partial<DraftComponent>) {
    setComponents((current) => current.map((c, i) => (i === index ? { ...c, ...change } : c)));
  }

  async function save(publish?: boolean) {
    setBusy(true);
    setError(null);
    const nextEnabled = publish ?? enabled;
    try {
      await api('', {
        method: 'PUT',
        body: JSON.stringify({ projectId, title, slug, description, enabled: nextEnabled, components })
      });
      onSaved(nextEnabled ? 'Saved. Your status page is live.' : 'Saved. The page is not public yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={fieldClass.label}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={busy} className={fieldClass.input} placeholder="Acme" />
        </label>
        <label className={fieldClass.label}>
          <span className="flex items-center gap-1.5">
            Address
            <HelpTip label="About the address" align="end">
              Lowercase letters, numbers and dashes. Custom domains (status.yourdomain.com) are coming to paid plans.
            </HelpTip>
          </span>
          <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-neutral-200 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15 dark:border-slate-700 dark:focus-within:border-blue-500">
            <span className="flex shrink-0 items-center bg-neutral-50 px-3 text-sm font-normal text-neutral-500 dark:bg-slate-900 dark:text-slate-400">
              {host}/status/
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={48}
              disabled={busy}
              className="h-10 min-w-0 flex-1 bg-white px-2 text-sm font-normal text-neutral-900 outline-none disabled:opacity-60 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </label>
        <label className={`${fieldClass.label} md:col-span-2`}>
          <span>
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            disabled={busy}
            className={fieldClass.input}
            placeholder="Live status of the Acme API and dashboard"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Components</h3>
          <HelpTip label="How components work">
            Pick the synthetic monitors to show and give each a public name. Uptime comes from their runs. Monitor names stay private.
          </HelpTip>
        </div>

        {data.monitors.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-slate-700 dark:text-slate-400">
            You don’t have any synthetic monitors yet.{' '}
            <Link href="/dashboard/synthetic-monitors/new" className={buttonClass.link}>
              Create a monitor
            </Link>{' '}
            to show it here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <ul className="min-w-0 space-y-0.5 rounded-xl border border-neutral-200 p-1.5 dark:border-slate-800">
              {data.monitors.map((monitor) => (
                <li key={monitor.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-blue-50/60 dark:hover:bg-slate-900">
                    <input type="checkbox" className="accent-blue-600" checked={included.has(monitor.id)} onChange={() => toggle(monitor.id)} disabled={busy} />
                    <span className="min-w-0 flex-1 truncate text-neutral-800 dark:text-slate-200">{monitor.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-400 dark:text-slate-500">
                      {monitor.status === 'active' ? `every ${monitor.schedule}` : monitor.status}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="min-w-0 space-y-2.5">
              {components.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                  Tick a monitor to add it to the page.
                </p>
              ) : (
                components.map((component, index) => (
                  <div key={component.monitorId} className="rounded-xl border border-neutral-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-slate-500">
                        {monitorName(component.monitorId)}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <IconButton label="Move up" onClick={() => move(index, -1)} disabled={busy || index === 0}>↑</IconButton>
                        <IconButton label="Move down" onClick={() => move(index, 1)} disabled={busy || index === components.length - 1}>↓</IconButton>
                        <IconButton label="Remove" onClick={() => toggle(component.monitorId)} disabled={busy}>✕</IconButton>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        value={component.displayName}
                        onChange={(e) => patch(index, { displayName: e.target.value })}
                        maxLength={60}
                        disabled={busy}
                        className={fieldClass.input}
                        placeholder="Public name, e.g. Checkout"
                        aria-label="Public name"
                      />
                      <input
                        value={component.description}
                        onChange={(e) => patch(index, { description: e.target.value })}
                        maxLength={160}
                        disabled={busy}
                        className={fieldClass.input}
                        placeholder="Short description (optional)"
                        aria-label="Public description"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass.quiet}>
          Cancel
        </button>
        {enabled ? (
          <button type="button" onClick={() => save()} disabled={busy} className={buttonClass.blue}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => save(false)} disabled={busy} className={buttonClass.quiet}>
              {busy ? 'Saving…' : 'Save as draft'}
            </button>
            <button type="button" onClick={() => save(true)} disabled={busy || components.length === 0} className={buttonClass.blue}>
              Save and publish
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Incidents ──────────────────────────────────────────────────────────────

function IncidentList({ data, api, projectId }: { data: StatusPageSettings; api: Api; projectId?: string }) {
  const now = Date.now();
  const open = data.incidents.filter((i) => i.status !== 'resolved' && i.status !== 'completed');
  const closed = data.incidents.filter((i) => i.status === 'resolved' || i.status === 'completed');
  const componentName = (id: string) => data.components.find((c) => c.id === id)?.displayName ?? 'Removed component';

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Last 30 days</h2>
      {data.incidents.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">
          No incidents. All quiet.
        </p>
      ) : (
        <div className="space-y-3">
          {[...open, ...closed].map((incident) => (
            <IncidentItem key={incident.id} incident={incident} canEdit={data.canEdit} api={api} projectId={projectId} componentName={componentName} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewIncidentForm({
  kind,
  data,
  api,
  projectId,
  onDone
}: {
  kind: 'incident' | 'maintenance';
  data: StatusPageSettings;
  api: Api;
  projectId?: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<IncidentStatus>(kind === 'incident' ? 'investigating' : 'scheduled');
  const [impact, setImpact] = useState<Impact>('minor');
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          kind,
          title,
          status,
          impact,
          componentIds,
          body,
          scheduledStart: start ? new Date(start).toISOString() : undefined,
          scheduledEnd: end ? new Date(end).toISOString() : undefined
        })
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${fieldClass.label} sm:col-span-2`}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className={fieldClass.input}
            placeholder={kind === 'incident' ? 'Elevated error rates on checkout' : 'Database upgrade'}
          />
        </label>
        <label className={fieldClass.label}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={fieldClass.input}>
            {(kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'incident' ? (
          <label className={fieldClass.label}>
            <span className="flex items-center gap-1.5">
              Impact
              <HelpTip label="What impact means" align="end">
                Major and critical show as an outage on the public page. Other levels show as degraded.
              </HelpTip>
            </span>
            <select value={impact} onChange={(e) => setImpact(e.target.value as Impact)} className={fieldClass.input}>
              {(['none', 'minor', 'major', 'critical'] as Impact[]).map((i) => (
                <option key={i} value={i}>
                  {IMPACT_LABEL[i]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <label className={fieldClass.label}>
              Starts
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass.input} />
            </label>
            <label className={fieldClass.label}>
              Ends
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldClass.input} />
            </label>
          </div>
        )}
        {data.components.length ? (
          <fieldset className="sm:col-span-2">
            <legend className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Affected components</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {data.components.map((component) => {
                const on = componentIds.includes(component.id);
                return (
                  <button
                    type="button"
                    key={component.id}
                    aria-pressed={on}
                    onClick={() => setComponentIds((ids) => (ids.includes(component.id) ? ids.filter((id) => id !== component.id) : [...ids, component.id]))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      on
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                    }`}
                  >
                    {component.displayName}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <label className={`${fieldClass.label} sm:col-span-2`}>
          <span className="flex items-center gap-1.5">
            Message
            <HelpTip label="Writing for customers">
              Say what customers notice and what you’re doing about it. Leave out internal details.
            </HelpTip>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={5000}
            className={`${fieldClass.input} h-auto py-2`}
            placeholder={kind === 'incident' ? 'We’re seeing errors when customers check out and are investigating.' : 'The dashboard may be unavailable for up to 10 minutes.'}
          />
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone} disabled={busy} className={buttonClass.quiet}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy || !title.trim() || !body.trim()} className={kind === 'incident' ? buttonClass.orange : buttonClass.blue}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function IncidentItem({
  incident,
  canEdit,
  api,
  projectId,
  componentName,
  now
}: {
  incident: StatusPageIncident;
  canEdit: boolean;
  api: Api;
  projectId?: string;
  componentName: (id: string) => string;
  now: number;
}) {
  const statuses = incident.kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = incident.status === 'resolved' || incident.status === 'completed';
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  async function postUpdate() {
    setBusy(true);
    setError(null);
    try {
      await api(`/incidents/${encodeURIComponent(incident.id)}/updates`, { method: 'POST', body: JSON.stringify({ projectId, status, body }) });
      setBody('');
      setUpdating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post the update.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${incident.title}” and its updates from the status page?`)) return;
    try {
      await api(`/incidents/${encodeURIComponent(incident.id)}${query}`, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    }
  }

  const tone =
    incident.kind === 'maintenance'
      ? 'border-l-blue-600'
      : closed
        ? 'border-l-emerald-500'
        : incident.impact === 'major' || incident.impact === 'critical'
          ? 'border-l-red-500'
          : 'border-l-orange-500';
  const latest = incident.updates[0];

  return (
    <div className={`rounded-2xl border border-l-4 border-neutral-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{incident.title}</span>
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
              {STATUS_LABEL[incident.status]}
              {incident.kind === 'maintenance' && incident.status === 'scheduled' && incident.scheduledStart && Date.parse(incident.scheduledStart) > now ? ' (upcoming)' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {incident.kind === 'maintenance' && incident.scheduledStart && incident.scheduledEnd
              ? `Maintenance · ${formatDate(incident.scheduledStart)} → ${formatDate(incident.scheduledEnd)}`
              : `${IMPACT_LABEL[incident.impact]} · started ${formatDate(incident.startedAt)}`}
            {incident.componentIds.length ? ` · ${incident.componentIds.map(componentName).join(', ')}` : ''}
          </p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-3">
            {!closed ? (
              <button type="button" onClick={() => setUpdating(true)} className={buttonClass.link}>
                Post update
              </button>
            ) : null}
            <button type="button" onClick={remove} className="text-sm font-semibold text-neutral-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {latest ? (
        <p className="mt-3 text-sm text-neutral-700 dark:text-slate-300">
          <span className="whitespace-pre-line">{latest.body}</span>
        </p>
      ) : null}
      {incident.updates.length > 1 ? (
        <details className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none">{incident.updates.length - 1} earlier update{incident.updates.length === 2 ? '' : 's'}</summary>
          <ol className="mt-2 space-y-2">
            {incident.updates.slice(1).map((update) => (
              <li key={`${update.createdAt}-${update.status}`} className="text-sm text-neutral-700 dark:text-slate-300">
                <span className="font-semibold">{STATUS_LABEL[update.status]}</span> — <span className="whitespace-pre-line">{update.body}</span>
                <span className="block text-[11px] text-neutral-400 dark:text-slate-500">{formatDate(update.createdAt)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {error && !updating ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      <DashboardDialog open={updating} onClose={() => setUpdating(false)} title="Post an update" description={incident.title} maxWidthClass="max-w-lg">
        <div className="space-y-4">
          <label className={fieldClass.label}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={fieldClass.input}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldClass.label}>
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={5000}
              className={`${fieldClass.input} h-auto py-2`}
              placeholder="What changed for customers?"
            />
          </label>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setUpdating(false)} disabled={busy} className={buttonClass.quiet}>
              Cancel
            </button>
            <button type="button" onClick={postUpdate} disabled={busy || !body.trim()} className={buttonClass.blue}>
              {busy ? 'Posting…' : 'Post update'}
            </button>
          </div>
        </div>
      </DashboardDialog>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-xs text-neutral-600 transition hover:border-blue-600 hover:text-blue-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
    >
      {children}
    </button>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
