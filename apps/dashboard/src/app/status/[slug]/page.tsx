import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { apiBaseUrl } from '@/lib/dashboard';
import type { StatusComponentData, StatusDay } from '../StatusView';
import { ProjectStatusView, type ProjectIncident, type ProjectStatusData } from './ProjectStatusView';

// Rebuilt at most every 30 seconds. The browser only receives the sanitized
// summary below; it never calls the API itself.
export const revalidate = 30;

const COMPONENT_STATUSES = ['operational', 'degraded', 'down', 'maintenance', 'unknown'] as const;
const LEVELS = ['operational', 'degraded', 'down', 'none'] as const;
const OVERALL = ['operational', 'degraded', 'down', 'maintenance', 'unknown'] as const;
const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'completed'] as const;
const IMPACTS = ['none', 'minor', 'major', 'critical'] as const;
const MAX_DAYS = 90;

type Loaded = { kind: 'ok'; data: ProjectStatusData } | { kind: 'missing' } | { kind: 'unreachable' };

const load = cache(async (slug: string): Promise<Loaded> => {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return { kind: 'missing' };
  try {
    const response = await fetch(`${apiBaseUrl}/v1/status/pages/${encodeURIComponent(slug)}`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5_000)
    });
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok) return { kind: 'unreachable' };
    const data = sanitize(await response.json());
    return data ? { kind: 'ok', data } : { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const loaded = await load(slug.toLowerCase());
  if (loaded.kind !== 'ok') return { title: 'Status' };
  return {
    title: `${loaded.data.page.title} Status`,
    description: loaded.data.page.description || `Live status and uptime for ${loaded.data.page.title}.`
  };
}

export default async function ProjectStatusPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await Promise.resolve(params);
  const loaded = await load(slug.toLowerCase());
  if (loaded.kind === 'missing') notFound();
  return <ProjectStatusView data={loaded.kind === 'ok' ? loaded.data : null} />;
}

/** Copies only known fields so nothing unexpected from the API reaches the client. */
function sanitize(value: unknown): ProjectStatusData | null {
  if (!isRecord(value) || !isRecord(value.page) || !Array.isArray(value.components) || typeof value.generatedAt !== 'string') return null;
  const status = oneOf(value.status, OVERALL);
  if (!status || typeof value.page.title !== 'string' || typeof value.page.slug !== 'string') return null;

  const components = value.components.flatMap((component): StatusComponentData[] => {
    if (!isRecord(component) || typeof component.id !== 'string' || typeof component.name !== 'string') return [];
    const componentStatus = oneOf(component.status, COMPONENT_STATUSES);
    if (!componentStatus || !Array.isArray(component.history)) return [];
    const history = component.history.slice(-MAX_DAYS).flatMap((day): StatusDay[] => {
      if (!isRecord(day) || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return [];
      const level = oneOf(day.level, LEVELS);
      return level ? [{ date: day.date, level, uptimePercent: percent(day.uptimePercent) }] : [];
    });
    return [{
      key: component.id.slice(0, 64),
      name: component.name.slice(0, 60),
      description: typeof component.description === 'string' ? component.description.slice(0, 160) : '',
      status: componentStatus,
      uptimePercent: percent(component.uptimePercent),
      history
    }];
  });
  const names = new Map(components.map((component) => [component.key, component.name]));

  const incidents = (list: unknown): ProjectIncident[] =>
    (Array.isArray(list) ? list : []).flatMap((incident): ProjectIncident[] => {
      if (!isRecord(incident) || typeof incident.id !== 'string' || typeof incident.title !== 'string') return [];
      const incidentStatus = oneOf(incident.status, INCIDENT_STATUSES);
      if (!incidentStatus || (incident.kind !== 'incident' && incident.kind !== 'maintenance')) return [];
      const updates = (Array.isArray(incident.updates) ? incident.updates : []).flatMap((update) => {
        if (!isRecord(update) || typeof update.body !== 'string' || !validDate(update.createdAt)) return [];
        const updateStatus = oneOf(update.status, INCIDENT_STATUSES);
        return updateStatus ? [{ status: updateStatus, body: update.body.slice(0, 5000), createdAt: update.createdAt as string }] : [];
      });
      return [{
        id: incident.id,
        kind: incident.kind,
        title: incident.title.slice(0, 120),
        status: incidentStatus,
        impact: oneOf(incident.impact, IMPACTS) ?? 'none',
        components: (Array.isArray(incident.componentIds) ? incident.componentIds : []).flatMap((id) => {
          const name = typeof id === 'string' ? names.get(id) : undefined;
          return name ? [name] : [];
        }),
        startedAt: validDate(incident.startedAt) ? (incident.startedAt as string) : value.generatedAt as string,
        scheduledStart: validDate(incident.scheduledStart) ? (incident.scheduledStart as string) : null,
        scheduledEnd: validDate(incident.scheduledEnd) ? (incident.scheduledEnd as string) : null,
        resolvedAt: validDate(incident.resolvedAt) ? (incident.resolvedAt as string) : null,
        updates
      }];
    });

  return {
    page: {
      slug: value.page.slug,
      title: value.page.title.slice(0, 80),
      description: typeof value.page.description === 'string' ? value.page.description.slice(0, 300) : ''
    },
    status,
    generatedAt: value.generatedAt,
    days: Math.min(MAX_DAYS, Math.max(...components.map((component) => component.history.length), 1)),
    components,
    activeIncidents: incidents(value.activeIncidents),
    upcomingMaintenance: incidents(value.upcomingMaintenance),
    pastIncidents: incidents(value.pastIncidents)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function percent(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
