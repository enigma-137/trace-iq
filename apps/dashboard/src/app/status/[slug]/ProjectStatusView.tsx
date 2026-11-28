'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import landing from '../../landing-light.module.css';
import styles from '../status.module.css';
import own from './project-status.module.css';
import { ComponentRow, LEVEL_LABELS, type StatusComponentData } from '../StatusView';

export interface ProjectIncident {
  id: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'scheduled' | 'in_progress' | 'completed';
  impact: 'none' | 'minor' | 'major' | 'critical';
  components: string[];
  startedAt: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  resolvedAt: string | null;
  updates: Array<{ status: ProjectIncident['status']; body: string; createdAt: string }>;
}

export interface ProjectStatusData {
  page: { slug: string; title: string; description: string };
  status: 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown';
  generatedAt: string;
  days: number;
  components: StatusComponentData[];
  activeIncidents: ProjectIncident[];
  upcomingMaintenance: ProjectIncident[];
  pastIncidents: ProjectIncident[];
}

const REFRESH_MS = 60_000;

const HEADLINES: Record<ProjectStatusData['status'], string> = {
  operational: 'All systems operational',
  degraded: 'Some systems are degraded',
  down: 'Major outage in progress',
  maintenance: 'Maintenance in progress',
  unknown: 'Status not available yet'
};

const INCIDENT_STATUS: Record<ProjectIncident['status'], string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed'
};

const IMPACT: Record<ProjectIncident['impact'], string> = {
  none: 'No impact',
  minor: 'Minor impact',
  major: 'Major outage',
  critical: 'Critical outage'
};

export function ProjectStatusView({ data }: { data: ProjectStatusData | null }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const headerLevel = data ? (data.status === 'unknown' ? 'none' : data.status) : 'none';

  return (
    <div className={`${landing.site} ${own.page}`}>
      <header className={`${landing.frame} ${own.header}`}>
        <span className={own.brand}>{data?.page.title ?? 'Status'}</span>
        <span className={own.headerNote}>Status</span>
      </header>

      <main>
        <section className={`${landing.frame} ${styles.intro}`} aria-labelledby="status-title">
          <p className={styles.kicker}>System status</p>
          <h1 id="status-title" className={styles.headline}>
            <span className={styles.mark} data-level={headerLevel} aria-hidden="true" />
            {data ? HEADLINES[data.status] : 'Status is temporarily unavailable'}
          </h1>
          {data?.page.description ? <p className={own.description}>{data.page.description}</p> : null}
          <p className={styles.updated}>
            {data
              ? <>Updated {formatTime(data.generatedAt)} UTC. This page refreshes every minute.</>
              : 'We could not load the latest status. Please try again in a minute.'}
          </p>
        </section>

        {data && data.activeIncidents.length > 0 ? (
          <section className={`${landing.frame} ${own.incidents}`} aria-labelledby="active-title">
            <h2 id="active-title" className={own.sectionTitle}>Active</h2>
            {data.activeIncidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
          </section>
        ) : null}

        {data && data.upcomingMaintenance.length > 0 ? (
          <section className={`${landing.frame} ${own.incidents}`} aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className={own.sectionTitle}>Scheduled maintenance</h2>
            {data.upcomingMaintenance.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
          </section>
        ) : null}

        {data ? (
          <section className={`${landing.frame} ${styles.components}`} aria-label="Components">
            {data.components.map((component) => <ComponentRow key={component.key} component={component} days={data.days} />)}
          </section>
        ) : null}

        {data ? (
          <section className={`${landing.frame} ${own.incidents}`} aria-labelledby="past-title">
            <h2 id="past-title" className={own.sectionTitle}>Past incidents</h2>
            {data.pastIncidents.length ? (
              data.pastIncidents.map((incident) => <IncidentCard key={incident.id} incident={incident} compact />)
            ) : (
              <p className={own.none}>No incidents in the last 14 days.</p>
            )}
          </section>
        ) : null}

        <section className={`${landing.frame} ${styles.about}`} aria-labelledby="about-title">
          <h2 id="about-title">How this is measured</h2>
          <div>
            <ul className={styles.legend} aria-label="Legend">
              {(['operational', 'degraded', 'down', 'none'] as const).map((level) => (
                <li key={level}>
                  <span className={styles.mark} data-level={level} aria-hidden="true" />
                  {LEVEL_LABELS[level]}
                </li>
              ))}
            </ul>
            <p>
              Each component is checked automatically on a schedule. Each bar is one UTC day: green when every check
              passed, orange when at least 95% passed, red below that. Incidents and maintenance are posted by the{' '}
              {data?.page.title ?? 'service'} team.
            </p>
          </div>
        </section>
      </main>

      <footer className={`${landing.frame} ${own.footer}`}>
        <Link href="/" className={own.powered}>
          Powered by <strong>TraceIQ</strong>
        </Link>
      </footer>
    </div>
  );
}

function IncidentCard({ incident, compact = false }: { incident: ProjectIncident; compact?: boolean }) {
  const level =
    incident.kind === 'maintenance' ? 'maintenance'
      : incident.status === 'resolved' ? 'operational'
        : incident.impact === 'major' || incident.impact === 'critical' ? 'down' : 'degraded';
  const updates = compact ? incident.updates.slice(0, 1) : incident.updates;

  return (
    <article className={own.incident} data-level={level}>
      <div className={own.incidentHead}>
        <h3>{incident.title}</h3>
        <span className={own.badge} data-level={level}>
          {INCIDENT_STATUS[incident.status]}
        </span>
      </div>
      <p className={own.meta}>
        {incident.kind === 'maintenance' && incident.scheduledStart && incident.scheduledEnd
          ? `${formatDateTime(incident.scheduledStart)} – ${formatDateTime(incident.scheduledEnd)} UTC`
          : `Started ${formatDateTime(incident.startedAt)} UTC${incident.resolvedAt ? ` · resolved ${formatDateTime(incident.resolvedAt)} UTC` : ''}`}
        {incident.kind === 'incident' && incident.impact !== 'none' && incident.status !== 'resolved' ? ` · ${IMPACT[incident.impact]}` : ''}
        {incident.components.length ? ` · Affects ${incident.components.join(', ')}` : ''}
      </p>
      <ol className={own.updates}>
        {updates.map((update) => (
          <li key={`${update.createdAt}-${update.status}`}>
            <p>
              <strong>{INCIDENT_STATUS[update.status]}</strong> — {update.body}
            </p>
            <time dateTime={update.createdAt}>{formatDateTime(update.createdAt)} UTC</time>
          </li>
        ))}
      </ol>
    </article>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(iso));
}
