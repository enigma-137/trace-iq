'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import landing from '../landing-light.module.css';
import styles from './status.module.css';

export type StatusLevel = 'operational' | 'degraded' | 'down' | 'none';

export interface StatusDay {
  date: string;
  level: StatusLevel;
  uptimePercent: number | null;
}

export interface StatusComponentData {
  key: string;
  name: string;
  description: string;
  status: 'operational' | 'degraded' | 'down' | 'unknown';
  uptimePercent: number | null;
  history: StatusDay[];
}

export interface StatusData {
  reachable: boolean;
  status: 'operational' | 'degraded' | 'down';
  generatedAt: string;
  days: number;
  components: StatusComponentData[];
}

const REFRESH_MS = 60_000;

const HEADLINES: Record<StatusData['status'], string> = {
  operational: 'All systems operational',
  degraded: 'Some systems are degraded',
  down: 'Major outage in progress'
};

const STATUS_LABELS: Record<StatusComponentData['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Outage',
  unknown: 'Unknown'
};

const LEVEL_LABELS: Record<StatusLevel, string> = {
  operational: 'No downtime',
  degraded: 'Degraded performance',
  down: 'Outage',
  none: 'No data'
};

export function StatusView({ data }: { data: StatusData }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const headline = data.reachable ? HEADLINES[data.status] : 'We can’t reach TraceIQ right now';

  return (
    <>
      <section className={`${landing.frame} ${styles.intro}`} aria-labelledby="status-title">
        <p className={styles.kicker}>System status</p>
        <h1 id="status-title" className={styles.headline}>
          <span className={styles.mark} data-level={data.status} aria-hidden="true" />
          {headline}
        </h1>
        <p className={styles.updated}>
          {data.reachable
            ? <>Updated {formatTime(data.generatedAt)} UTC. This page refreshes every minute.</>
            : 'The API is not responding to status checks. We are looking into it.'}
        </p>
      </section>

      <section className={`${landing.frame} ${styles.components}`} aria-label="Components">
        {data.reachable && data.components.length ? (
          data.components.map((component) => <ComponentRow key={component.key} component={component} days={data.days} />)
        ) : (
          <p className={styles.empty}>Uptime history is unavailable while the API is unreachable.</p>
        )}
      </section>

      <section className={`${landing.frame} ${styles.about}`} aria-labelledby="about-title">
        <h2 id="about-title">How we measure</h2>
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
            TraceIQ checks its API, database and event ingestion every 30 seconds. Each bar is one UTC day. Minutes
            where the API could not record a check count as downtime. A day is shown as degraded below 99.9% uptime
            or when responses were slow, and as an outage below 99%.
          </p>
        </div>
      </section>
    </>
  );
}

function ComponentRow({ component, days }: { component: StatusComponentData; days: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const history = component.history;
  const active = selected === null ? null : history[selected];
  const uptime = component.uptimePercent === null ? 'No data yet' : `${formatPercent(component.uptimePercent)} uptime`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = selected ?? history.length - 1;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? history.length - 1
        : current + (event.key === 'ArrowLeft' ? -1 : 1);
    setSelected(Math.min(history.length - 1, Math.max(0, next)));
  }

  return (
    <article className={styles.component} aria-labelledby={`component-${component.key}`}>
      <div className={styles.componentHeader}>
        <div>
          <h2 id={`component-${component.key}`}>{component.name}</h2>
          {component.description ? <p>{component.description}</p> : null}
        </div>
        <p className={styles.componentStatus} data-status={component.status}>
          <span className={styles.mark} data-level={component.status === 'unknown' ? 'none' : component.status} aria-hidden="true" />
          {STATUS_LABELS[component.status]}
        </p>
      </div>

      <div
        className={styles.bars}
        tabIndex={0}
        role="group"
        aria-label={`${component.name}: ${uptime} over the last ${days} days. Use the arrow keys to inspect each day.`}
        onKeyDown={onKeyDown}
        onFocus={() => setSelected((value) => value ?? history.length - 1)}
        onBlur={() => setSelected(null)}
        onMouseLeave={() => setSelected(null)}
      >
        {history.map((day, index) => (
          <span
            key={day.date}
            className={styles.bar}
            data-level={day.level}
            data-selected={selected === index || undefined}
            onMouseEnter={() => setSelected(index)}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className={styles.barFooter}>
        <span>
          <span className={styles.wideOnly}>{days} days ago</span>
          <span className={styles.narrowOnly}>{Math.min(days, 30)} days ago</span>
        </span>
        <span className={styles.detail} aria-live="polite">
          {active
            ? `${formatDate(active.date)}: ${active.uptimePercent === null ? LEVEL_LABELS.none : `${formatPercent(active.uptimePercent)} uptime, ${LEVEL_LABELS[active.level].toLowerCase()}`}`
            : uptime}
        </span>
        <span>Today</span>
      </div>
    </article>
  );
}

function formatPercent(value: number) {
  return `${value === 100 ? '100' : value.toFixed(2)}%`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso));
}
