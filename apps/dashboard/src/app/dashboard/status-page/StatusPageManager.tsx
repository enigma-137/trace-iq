'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

export function StatusPageManager({ initial, projectId }: { initial: StatusPageSettings; projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState(initial);
  const [origin, setOrigin] = useState('https://traceiq.run');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const api = useCallback(
    async (path: string, init: RequestInit = {}): Promise<StatusPageSettings> => {
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

  const publicUrl = data.page ? `${origin}/status/${data.page.slug}` : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  data.page?.enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${data.page?.enabled ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                {data.page?.enabled ? 'Published' : data.page ? 'Draft' : 'Not set up'}
              </span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                Free on every plan
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">Public status page</h2>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
              Show your customers whether your services are up, with 90-day uptime from your synthetic monitors and the
              incident updates you post here. Monitor names, URLs, errors and screenshots are never shown.
            </p>
          </div>
          {publicUrl && data.page?.enabled ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View public page ↗
            </a>
          ) : null}
        </div>
        {!data.canEdit ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Only owners and admins can change the status page or post incidents.
          </p>
        ) : null}
      </section>

      <SettingsCard data={data} api={api} projectId={projectId} origin={origin} />

      {data.page ? <IncidentsCard data={data} api={api} projectId={projectId} /> : null}
    </div>
  );
}

type Api = (path: string, init?: RequestInit) => Promise<StatusPageSettings>;

// ─── Settings ───────────────────────────────────────────────────────────────

function SettingsCard({ data, api, projectId, origin }: { data: StatusPageSettings; api: Api; projectId?: string; origin: string }) {
  const [title, setTitle] = useState(data.page?.title ?? data.suggestedTitle);
  const [slug, setSlug] = useState(data.page?.slug ?? data.suggestedSlug);
  const [description, setDescription] = useState(data.page?.description ?? '');
  const [enabled, setEnabled] = useState(data.page?.enabled ?? false);
  const [components, setComponents] = useState<DraftComponent[]>(
    data.components.map((c) => ({ monitorId: c.monitorId, displayName: c.displayName, description: c.description ?? '' }))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const disabled = !data.canEdit || busy;
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
    setMessage(null);
    const nextEnabled = publish ?? enabled;
    try {
      await api('', {
        method: 'PUT',
        body: JSON.stringify({ projectId, title, slug, description, enabled: nextEnabled, components })
      });
      setEnabled(nextEnabled);
      setMessage({ tone: 'ok', text: nextEnabled ? 'Saved. Your status page is live.' : 'Saved. The page is not public yet.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Page settings</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={disabled} className={inputClass} placeholder="Acme" />
        </label>
        <label className={labelClass}>
          Address
          <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-neutral-300 focus-within:border-neutral-900 dark:border-slate-700 dark:focus-within:border-white">
            <span className="flex shrink-0 items-center bg-neutral-50 px-3 text-sm font-normal text-neutral-500 dark:bg-slate-900 dark:text-slate-400">
              {host}/status/
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={48}
              disabled={disabled}
              className="h-10 min-w-0 flex-1 bg-white px-2 text-sm font-normal text-neutral-900 outline-none disabled:opacity-60 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <span className="font-normal text-neutral-400 dark:text-slate-500">Custom domains (status.yourdomain.com) are coming to paid plans.</span>
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          <span>
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            disabled={disabled}
            className={inputClass}
            placeholder="Live status of the Acme API and dashboard"
          />
        </label>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Components</h4>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          Pick the synthetic monitors to show and give each a public name. Uptime comes from their runs.
        </p>

        {data.monitors.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-600 dark:border-slate-700 dark:text-slate-400">
            You don’t have any synthetic monitors yet.{' '}
            <Link href="/dashboard/synthetic-monitors/new" className="font-semibold text-blue-600 hover:underline dark:text-cyan-400">
              Create a monitor
            </Link>{' '}
            to show it here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <ul className="min-w-0 space-y-1 rounded-lg border border-neutral-200 p-2 dark:border-slate-800">
              {data.monitors.map((monitor) => (
                <li key={monitor.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-slate-900">
                    <input type="checkbox" checked={included.has(monitor.id)} onChange={() => toggle(monitor.id)} disabled={disabled} />
                    <span className="min-w-0 flex-1 truncate text-neutral-800 dark:text-slate-200">{monitor.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-400 dark:text-slate-500">
                      {monitor.status === 'active' ? `every ${monitor.schedule}` : monitor.status}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="min-w-0 space-y-3">
              {components.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-xs text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                  Select monitors on the left to add them to the page.
                </p>
              ) : (
                components.map((component, index) => (
                  <div key={component.monitorId} className="rounded-lg border border-neutral-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-slate-500">
                        Monitor: {monitorName(component.monitorId)}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <IconButton label="Move up" onClick={() => move(index, -1)} disabled={disabled || index === 0}>↑</IconButton>
                        <IconButton label="Move down" onClick={() => move(index, 1)} disabled={disabled || index === components.length - 1}>↓</IconButton>
                        <IconButton label="Remove" onClick={() => toggle(component.monitorId)} disabled={disabled}>✕</IconButton>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        value={component.displayName}
                        onChange={(e) => patch(index, { displayName: e.target.value })}
                        maxLength={60}
                        disabled={disabled}
                        className={inputClass}
                        placeholder="Public name, e.g. Checkout"
                        aria-label="Public name"
                      />
                      <input
                        value={component.description}
                        onChange={(e) => patch(index, { description: e.target.value })}
                        maxLength={160}
                        disabled={disabled}
                        className={inputClass}
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

      {data.canEdit ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save()} disabled={busy} className={secondaryButton}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {enabled ? (
            <button type="button" onClick={() => save(false)} disabled={busy} className={secondaryButton}>
              Unpublish
            </button>
          ) : (
            <button type="button" onClick={() => save(true)} disabled={busy || components.length === 0} className={primaryButton}>
              Save and publish
            </button>
          )}
          {message ? (
            <span className={`text-xs ${message.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── Incidents ──────────────────────────────────────────────────────────────

function IncidentsCard({ data, api, projectId }: { data: StatusPageSettings; api: Api; projectId?: string }) {
  const [creating, setCreating] = useState<'incident' | 'maintenance' | null>(null);
  const now = Date.now();
  const open = data.incidents.filter((i) => i.status !== 'resolved' && i.status !== 'completed');
  const closed = data.incidents.filter((i) => i.status === 'resolved' || i.status === 'completed');
  const componentName = (id: string) => data.components.find((c) => c.id === id)?.displayName ?? 'Removed component';

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Incidents and maintenance</h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Updates appear on the public page within a minute. Write them for customers: no internal details.
          </p>
        </div>
        {data.canEdit ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setCreating('incident')} className={primaryButton}>
              Report incident
            </button>
            <button type="button" onClick={() => setCreating('maintenance')} className={secondaryButton}>
              Schedule maintenance
            </button>
          </div>
        ) : null}
      </div>

      {creating ? (
        <NewIncidentForm kind={creating} data={data} api={api} projectId={projectId} onDone={() => setCreating(null)} />
      ) : null}

      <div className="mt-5 space-y-3">
        {data.incidents.length === 0 && !creating ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-slate-700 dark:text-slate-400">
            No incidents in the last 30 days.
          </p>
        ) : null}
        {[...open, ...closed].map((incident) => (
          <IncidentItem key={incident.id} incident={incident} canEdit={data.canEdit} api={api} projectId={projectId} componentName={componentName} now={now} />
        ))}
      </div>
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
    <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <h4 className="text-sm font-bold text-neutral-900 dark:text-white">{kind === 'incident' ? 'Report an incident' : 'Schedule maintenance'}</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={`${labelClass} md:col-span-2`}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} placeholder={kind === 'incident' ? 'Elevated error rates on checkout' : 'Database upgrade'} />
        </label>
        <label className={labelClass}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={inputClass}>
            {(kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        {kind === 'incident' ? (
          <label className={labelClass}>
            Impact
            <select value={impact} onChange={(e) => setImpact(e.target.value as Impact)} className={inputClass}>
              {(['none', 'minor', 'major', 'critical'] as Impact[]).map((i) => (
                <option key={i} value={i}>{IMPACT_LABEL[i]}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Starts
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Ends
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </label>
          </div>
        )}
        {data.components.length ? (
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Affected components</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {data.components.map((component) => (
                <label key={component.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={componentIds.includes(component.id)}
                    onChange={() =>
                      setComponentIds((ids) => (ids.includes(component.id) ? ids.filter((id) => id !== component.id) : [...ids, component.id]))
                    }
                  />
                  {component.displayName}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className={`${labelClass} md:col-span-2`}>
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={5000}
            className={`${inputClass} h-auto py-2`}
            placeholder={kind === 'incident' ? 'We’re seeing errors when customers check out and are investigating.' : 'The dashboard may be unavailable for up to 10 minutes.'}
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={submit} disabled={busy || !title.trim() || !body.trim()} className={primaryButton}>
          {busy ? 'Posting…' : 'Post'}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={secondaryButton}>
          Cancel
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

  const tone = incident.kind === 'maintenance'
    ? 'border-l-blue-500'
    : closed ? 'border-l-emerald-500' : incident.impact === 'major' || incident.impact === 'critical' ? 'border-l-red-500' : 'border-l-amber-500';

  return (
    <details open={!closed} className={`rounded-lg border border-l-4 border-neutral-200 ${tone} dark:border-slate-800`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">{incident.title}</span>
          <span className="text-xs text-neutral-500 dark:text-slate-400">
            {incident.kind === 'maintenance' && incident.scheduledStart && incident.scheduledEnd
              ? `Maintenance · ${formatDate(incident.scheduledStart)} → ${formatDate(incident.scheduledEnd)}`
              : `Incident · ${IMPACT_LABEL[incident.impact]} · started ${formatDate(incident.startedAt)}`}
            {incident.componentIds.length ? ` · ${incident.componentIds.map(componentName).join(', ')}` : ''}
          </span>
        </span>
        <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
          {STATUS_LABEL[incident.status]}
          {incident.kind === 'maintenance' && incident.status === 'scheduled' && incident.scheduledStart && Date.parse(incident.scheduledStart) > now ? ' (upcoming)' : ''}
        </span>
      </summary>
      <div className="border-t border-neutral-100 px-4 py-3 dark:border-slate-800">
        <ol className="space-y-2">
          {incident.updates.map((update) => (
            <li key={`${update.createdAt}-${update.status}`} className="text-sm text-neutral-700 dark:text-slate-300">
              <span className="font-semibold">{STATUS_LABEL[update.status]}</span> — <span className="whitespace-pre-line">{update.body}</span>
              <span className="block text-[11px] text-neutral-400 dark:text-slate-500">{formatDate(update.createdAt)}</span>
            </li>
          ))}
        </ol>

        {canEdit ? (
          <div className="mt-4 space-y-2">
            {!closed ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={`${inputClass} sm:w-44`} aria-label="New status">
                    {statuses.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={5000}
                    className={inputClass}
                    placeholder="Post an update for customers"
                    aria-label="Update message"
                  />
                  <button type="button" onClick={postUpdate} disabled={busy || !body.trim()} className={`${primaryButton} shrink-0`}>
                    {busy ? 'Posting…' : 'Post update'}
                  </button>
                </div>
              </>
            ) : null}
            <button type="button" onClick={remove} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">
              Delete
            </button>
            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </details>
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
      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-xs text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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

const labelClass = 'grid gap-1 text-xs font-semibold text-neutral-700 dark:text-slate-300';
const inputClass =
  'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
const primaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200';
const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
